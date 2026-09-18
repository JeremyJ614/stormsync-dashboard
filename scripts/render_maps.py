#!/usr/bin/env python3
"""
StormSync VIP — Phase 4 model-map renderer.

Pulls HRRR / GFS severe-weather fields straight from the NOAA Open Data buckets
on AWS, renders dark-mode CONUS maps, uploads the PNGs to Supabase Storage and
writes a manifest row the frontend reads.

Why this does NOT download whole GRIB files
-------------------------------------------
Each GRIB2 file ships with a sidecar `.idx` listing every record's byte offset.
We read that 9 KB index, work out the byte range for just the fields we want, and
issue HTTP Range requests. Measured on a live run: composite reflectivity is
**0.21 MB out of a 140 MB file** — a ~640x reduction. That is what keeps this
inside the free GitHub Actions minute budget; there is no need for Zarr mirrors
or a paid always-on worker.

Cadence note: run this 4x/day (00/06/12/18Z). Hourly would need ~5,000 Actions
minutes a month against a 2,000-minute free allowance on a private repo.
"""
from __future__ import annotations

import argparse
import io
import math
import json
import os
import random
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
import requests

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, LinearSegmentedColormap, ListedColormap
import matplotlib.patheffects as patheffects

import cartopy.crs as ccrs
import cartopy.feature as cfeature

import xarray as xr

# A render may legitimately lose a parameter or two — a source file that has
# not published yet, one field that failed every forecast hour. Below this
# fraction of the stored count it is not attrition, it is the wrong script.
#
# 0.9, not 0.8: at 0.8 an HRRR run could quietly shed five of its twenty-three
# parameters and still publish, which is most of a tab's worth of fields going
# missing without anyone being told. Refusing is the safe direction — the
# previous manifest stays up, so the cost of a false positive is a stale run
# rather than a gutted one.
FEWER_PARAMS_TOLERANCE = 0.9

HRRR_BUCKET = "https://noaa-hrrr-bdp-pds.s3.amazonaws.com"
GFS_BUCKET = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
# HREF has no public S3 mirror — NCEP publishes it on NOMADS only, one GRIB2 per
# forecast hour with every probability threshold as its own record.
HREF_BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/href/prod"

# The first forecast hour each model actually publishes.
#
# HREF's ensemble *probability* files have no F00 — a probability over a
# one-hour window cannot exist at the initialisation time — and both the cycle
# probe and the frame loop below assumed every model starts at zero. The probe
# HEADed href...prob.f00.grib2, got 404 for all eight candidate cycles, and
# reported "no available href cycle found"; even past that, the loop opened at
# F000, failed to read an index, and hit its `break` before rendering a single
# frame. HREF would have rendered nothing on any schedule.
FIRST_FHR = {"hrrr": 0, "gfs": 0, "href": 1}
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "StormSyncVIP-renderer/1.0"

# Retry every NOAA fetch, because concurrency makes the endpoint push back.
#
# Rendering the forecast hours in parallel turned a 20-minute HRRR run into a
# 10-minute one and then broke it: with four workers, seven of nineteen hours
# died on `RemoteDisconnected('Remote end closed connection without response')`
# — the S3 endpoint closing connections under the load, not a missing file. The
# coverage guard caught it and refused to publish, which is what it is for, but
# a transient disconnect should never have cost an hour in the first place.
#
# `urllib3.Retry` handles it at the adapter, so every index read and every byte
# range gets it without a retry loop written at each call site. `connect` and
# `read` cover the disconnects; the status list covers throttling; and the
# backoff is generous because the thing we are backing off from is our own
# concurrency — hammering it faster is the one response guaranteed not to work.
_RETRY = requests.adapters.Retry(
    total=4, connect=4, read=4, status=3,
    backoff_factor=1.2,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(("GET", "HEAD")),
    raise_on_status=False,
)
SESSION.mount("https://", requests.adapters.HTTPAdapter(
    max_retries=_RETRY, pool_connections=8, pool_maxsize=8))

# ── styling ──────────────────────────────────────────────────────────────────
BG = "#0b0e17"
# Land outside the data used to be #171b26 — all but black, so the states a
# reader locates themselves by were invisible wherever the field was empty.
LAND = "#272d3c"
COAST = "#7f8ca6"
BORDER = "#9aa7c2"

# The frame.
#
# TARGET_PX, not DPI, is the resolution knob. Total pixels are pinned here and
# the figure's inch-size is then derived from the projected extent's aspect
# (see `canvas`), so DPI only changes how large a point-sized stroke lands —
# it cannot add a single pixel. Raising DPI to sharpen the maps is the obvious
# move and it does nothing.
#
# Held at the old letterboxed 1280x760 budget through the letterboxing fix, and
# now raised. Measured on a banded field quantised the way these frames are:
#
#     0.96 MP (1200x800)   14.2 kB
#     1.98 MP (1800x1100)  21.9 kB    x1.54
#     2.16 MP (1800x1200)  22.9 kB    x1.61
#
# So twice the pixels costs about half again as many bytes — banded imagery
# compresses on its bands, not its area. Storage has taken a project offline
# here before (see the retention note), so that 1.54x is a deliberate,
# measured spend rather than a round number.
#
# Note what this does NOT fix: a coarse model still looks coarse. More pixels
# sharpen the EDGES of GFS's 0.25-degree cells; they cannot put detail inside
# one. See the grid spacings in the viewer's own model labels.
DPI = 100
TARGET_PX = 1800 * 1100
EXTENT = [-122.5, -71.5, 22.5, 50.5]


@dataclass
class Param:
    key: str
    label: str
    group: str                  # "Severe Weather" | "Surface & Precipitation" | "Upper Air"
    match: str                  # substring matched against the .idx line
    unit: str
    cmap: str
    levels: list
    var: str | None = None      # cfgrib variable name override
    legend: list = field(default_factory=list)
    # Extra .idx matches this parameter needs alongside `match`, and what to do
    # with them. Most fields are one GRIB record; a few honest exceptions are not:
    #   "mag"    -> hypot(match, extra[0]); a u/v pair is a vector, and its
    #               magnitude is the thing anybody plots (shear, storm motion).
    #   "vecdiff"-> |(u1,v1) - (u0,v0)|; bulk shear between two levels, for GFS,
    #               which publishes winds but not the shear layers HRRR does.
    #   "thetae" -> equivalent potential temperature from T, Td and surface
    #               pressure (Bolton 1980). Derived, not invented: every input is
    #               a real field in the same file.
    extra: list = field(default_factory=list)
    combine: str | None = None
    # A second substring the index line must ALSO contain. HREF publishes five
    # `CAPE:90-0 mb above ground` records per file and only the threshold tells
    # them apart — and the threshold is not adjacent to the level in the line
    # (the forecast hour sits between), so it cannot just be concatenated on.
    match_also: str | None = None
    # True  -> values under levels[0] mean "nothing here", draw them transparent
    # False -> the low end is meaningful (temperature, dew point, negative CIN)
    mask_below: bool = True


def refl_cmap():
    stops = ["#04e9e7", "#019ff4", "#0300f4", "#02fd02", "#01c501", "#008e00",
             "#fdf802", "#e5bc00", "#fd9500", "#fd0000", "#d40000", "#bc0000",
             "#f800fd", "#9854c6"]
    return ListedColormap(stops)


def seq(colors):
    return LinearSegmentedColormap.from_list("sswx", colors)


# Parameters confirmed present in the live HRRR/GFS index files.
HRRR_PARAMS = [
    Param("refc", "Composite Reflectivity", "Surface & Precipitation",
          ":REFC:entire atmosphere:", "dBZ", "refl",
          [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]),
    Param("sbcape", "Surface CAPE", "Severe Weather",
          ":CAPE:surface:", "J/kg", "cape",
          [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000]),
    Param("mucape", "Most-Unstable CAPE", "Severe Weather",
          ":CAPE:180-0 mb above ground:", "J/kg", "cape",
          [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000]),
    Param("uphl", "2-5 km Updraft Helicity", "Severe Weather",
          ":MXUPHL:5000-2000 m above ground:", "m²/s²", "uphl",
          [10, 25, 50, 75, 100, 150, 200, 300, 400]),
    Param("srh1", "0-1 km Storm-Relative Helicity", "Severe Weather",
          ":HLCY:1000-0 m above ground:", "m²/s²", "srh",
          [50, 100, 150, 200, 250, 300, 400, 500]),
    Param("srh3", "0-3 km Storm-Relative Helicity", "Severe Weather",
          ":HLCY:3000-0 m above ground:", "m²/s²", "srh",
          [50, 100, 150, 200, 250, 300, 400, 500, 600]),
    Param("gust", "Surface Wind Gusts", "Surface & Precipitation",
          ":GUST:surface:", "mph", "wind",
          [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]),
    Param("dpt2m", "2 m Dew Point", "Surface & Precipitation",
          ":DPT:2 m above ground:", "°F", "dewp",
          [30, 40, 45, 50, 55, 60, 65, 70, 75, 80], mask_below=False),

    # ── added: every one of these was confirmed against a live wrfsfc .idx ──
    Param("mlcape", "Mixed-Layer CAPE", "Severe Weather",
          ":CAPE:90-0 mb above ground:", "J/kg", "cape",
          [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]),
    Param("cape03", "0-3 km CAPE", "Severe Weather",
          ":CAPE:0-3000 m above ground:", "J/kg", "cape",
          [25, 50, 75, 100, 125, 150, 200, 250, 300]),
    Param("uphl03", "0-3 km Updraft Helicity", "Severe Weather",
          ":MXUPHL:3000-0 m above ground:", "m²/s²", "uphl",
          [10, 25, 50, 75, 100, 150, 200, 300]),
    Param("shear01", "0-1 km Vertical Shear", "Severe Weather",
          ":VUCSH:0-1000 m above ground:", "kt", "shear",
          [10, 15, 20, 25, 30, 35, 40, 50],
          extra=[":VVCSH:0-1000 m above ground:"], combine="mag"),
    Param("shear06", "0-6 km Vertical Shear", "Severe Weather",
          ":VUCSH:0-6000 m above ground:", "kt", "shear",
          [20, 25, 30, 35, 40, 45, 50, 60, 70],
          extra=[":VVCSH:0-6000 m above ground:"], combine="mag"),
    Param("stmmot", "Storm Motion", "Severe Weather",
          ":USTM:0-6000 m above ground:", "kt", "wind",
          [5, 10, 15, 20, 25, 30, 35, 40, 50],
          extra=[":VSTM:0-6000 m above ground:"], combine="mag"),
    Param("blftx", "Best Lifted Index", "Severe Weather",
          ":4LFTX:180-0 mb above ground:", "°C", "cin",
          [-10, -8, -6, -4, -2, 0, 2, 4], mask_below=False),
    Param("lclhgt", "LCL Height", "Severe Weather",
          ":HGT:level of adiabatic condensation from sfc:", "kft", "lcl",
          [0.5, 1, 1.5, 2, 2.5, 3, 4, 5], mask_below=False),
    Param("vort02", "Cyclonic Vorticity (0-2 km)", "Severe Weather",
          ":RELV:2000-0 m above ground:", "1e-3/s", "vort",
          [1, 2, 3, 4, 5, 7, 10, 15]),
    Param("ltng", "Lightning Threat", "Severe Weather",
          ":LTNG:entire atmosphere:", "flashes/km²/5min", "ltng",
          [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8]),
    Param("refd1km", "1 km AGL Reflectivity", "Surface & Precipitation",
          ":REFD:1000 m above ground:", "dBZ", "refl",
          [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]),
    Param("retop", "Echo Top", "Surface & Precipitation",
          ":RETOP:cloud top:", "kft", "echotop",
          [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]),
    Param("tcdc", "Total Cloud Cover", "Surface & Precipitation",
          ":TCDC:entire atmosphere:", "%", "cloud",
          [10, 20, 30, 40, 50, 60, 70, 80, 90]),
    Param("smoke", "Near-Surface Smoke", "Surface & Precipitation",
          ":MASSDEN:8 m above ground:", "µg/m³", "smoke",
          [1, 2, 5, 10, 20, 40, 80, 150, 250]),
    # Derived from T, Td and surface pressure in the same file — HRRR publishes
    # 2 m potential temperature, which is NOT theta-E, so using POT and calling
    # it theta-E would be the wrong field under the right label.
    Param("thetae2m", "2 m AGL Theta-E", "Severe Weather",
          ":TMP:2 m above ground:", "K", "thetae",
          [290, 300, 310, 320, 330, 340, 350, 360], mask_below=False,
          extra=[":DPT:2 m above ground:", ":PRES:surface:"], combine="thetae"),
]

GFS_PARAMS = [
    Param("sbcape", "Surface CAPE", "Severe Weather",
          ":CAPE:surface:", "J/kg", "cape",
          [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]),
    Param("cin", "Surface CIN", "Severe Weather",
          ":CIN:surface:", "J/kg", "cin",
          [-300, -200, -150, -100, -75, -50, -25, -10], mask_below=False),
    Param("pwat", "Precipitable Water", "Upper Air",
          ":PWAT:entire atmosphere", "in", "pwat",
          [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5]),
    Param("absv500", "500 mb Absolute Vorticity", "Upper Air",
          ":ABSV:500 mb:", "1e-5/s", "vort",
          [8, 12, 16, 20, 24, 28, 32, 40]),
    Param("dpt2m", "2 m Dew Point", "Surface & Precipitation",
          ":DPT:2 m above ground:", "°F", "dewp",
          [30, 40, 45, 50, 55, 60, 65, 70, 75, 80], mask_below=False),
    Param("gust", "Surface Wind Gusts", "Surface & Precipitation",
          ":GUST:surface:", "mph", "wind",
          [10, 20, 30, 40, 50, 60, 70, 80]),
    # Synoptic context — the fields you read a forecast map with. All are single
    # GFS fields present in every pgrb2 index, so none of them can half-render.
    Param("mslp", "Mean Sea-Level Pressure", "Upper Air",
          ":PRMSL:mean sea level:", "mb", "press",
          [976, 984, 992, 1000, 1008, 1012, 1016, 1020, 1024, 1032], mask_below=False),
    Param("hgt500", "500 mb Height", "Upper Air",
          ":HGT:500 mb:", "dam", "hgt",
          [516, 522, 528, 534, 540, 546, 552, 558, 564, 570, 576], mask_below=False),
    Param("tmp850", "850 mb Temperature", "Upper Air",
          ":TMP:850 mb:", "°C", "temp",
          [-20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30], mask_below=False),
    Param("tcdc", "Total Cloud Cover", "Surface & Precipitation",
          ":TCDC:entire atmosphere:", "%", "cloud",
          [10, 20, 30, 40, 50, 60, 70, 80, 90]),
    Param("rh700", "700 mb Relative Humidity", "Upper Air",
          ":RH:700 mb:", "%", "cloud",
          [10, 20, 30, 40, 50, 60, 70, 80, 90]),

    # ── added: confirmed against a live gfs.pgrb2.0p25 .idx ─────────────────
    Param("refd1km", "1 km AGL Reflectivity", "Surface & Precipitation",
          ":REFD:1000 m above ground:", "dBZ", "refl",
          [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]),
    Param("blftx", "Best Lifted Index", "Severe Weather",
          ":4LFTX:surface:", "°C", "cin",
          [-10, -8, -6, -4, -2, 0, 2, 4], mask_below=False),
    # "Storm Relativity Index" resolves to storm-relative helicity.
    #
    # There is no NWS product by that name. Every candidate the phrase could
    # mean was checked against the live GFS index: storm-relative helicity is
    # there (HLCY, 0-3 km) and is the standard storm-relative field a forecast
    # map carries; the supercell composite and significant tornado parameter,
    # which are the other readings of "index", are not in GFS at all. So this is
    # SRH, labelled as SRH rather than as the ambiguous phrase.
    Param("srh3", "0-3 km Storm-Relative Helicity", "Severe Weather",
          ":HLCY:3000-0 m above ground:", "m²/s²", "srh",
          [50, 100, 150, 200, 250, 300, 400, 500]),
    Param("stmmot", "Storm Motion", "Severe Weather",
          ":USTM:6000-0 m above ground:", "kt", "wind",
          [5, 10, 15, 20, 25, 30, 35, 40, 50],
          extra=[":VSTM:6000-0 m above ground:"], combine="mag"),
    # GFS has no VUCSH/VVCSH layers, so the bulk shear is taken as the vector
    # difference between the 10 m and 500 mb winds — which is the definition.
    Param("shearsfc500", "Surface-500 mb Vertical Shear", "Severe Weather",
          ":UGRD:10 m above ground:", "kt", "shear",
          [20, 30, 40, 50, 60, 70, 80, 100],
          extra=[":VGRD:10 m above ground:", ":UGRD:500 mb:", ":VGRD:500 mb:"],
          combine="vecdiff"),
    # ── added after feedback that GFS was thin ────────────────────────────
    # Every match below was resolved against a live gfs.tHHz.pgrb2.0p25 index
    # first. Where a field is published twice — instantaneous and time-averaged
    # — `fetch_record` already prefers the instantaneous one.
    Param("mlcape", "ML CAPE (180 mb)", "Severe Weather",
          ":CAPE:180-0 mb above ground:", "J/kg", "cape",
          [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]),
    Param("mucape", "MU CAPE (255 mb)", "Severe Weather",
          ":CAPE:255-0 mb above ground:", "J/kg", "cape",
          [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000]),
    Param("mlcin", "ML CIN (180 mb)", "Severe Weather",
          ":CIN:180-0 mb above ground:", "J/kg", "cin",
          [-300, -200, -150, -100, -75, -50, -25, -10], mask_below=False),
    Param("refc", "Composite Reflectivity", "Severe Weather",
          ":REFC:entire atmosphere:", "dBZ", "refl",
          [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]),
    Param("refd4km", "4 km Reflectivity", "Severe Weather",
          ":REFD:4000 m above ground:", "dBZ", "refl",
          [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]),
    # The cap, and what breaks it. 700 mb temperature is the single field a
    # Plains chaser checks before deciding whether anything goes up at all.
    Param("tmp700", "700 mb Temperature", "Upper Air",
          ":TMP:700 mb:", "°C", "temp",
          [-6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 14, 16], mask_below=False),
    Param("tmp500", "500 mb Temperature", "Upper Air",
          ":TMP:500 mb:", "°C", "temp",
          [-30, -26, -22, -18, -14, -12, -10, -8, -6, -4], mask_below=False),
    Param("lapse75", "700-500 mb Lapse Rate", "Upper Air",
          ":TMP:700 mb:", "°C/km", "temp",
          [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0],
          extra=[":TMP:500 mb:", ":HGT:700 mb:", ":HGT:500 mb:"], combine="lapse"),
    Param("thetae", "Surface Theta-E", "Upper Air",
          ":TMP:2 m above ground:", "K", "thetae",
          [290, 300, 310, 315, 320, 325, 330, 335, 340, 345, 350, 355],
          extra=[":DPT:2 m above ground:", ":PRES:surface:"], combine="thetae",
          mask_below=False),
    Param("tmp2m", "2 m Temperature", "Surface & Precipitation",
          ":TMP:2 m above ground:", "°F", "temp",
          [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110], mask_below=False),
    # Where the boundary layer tops out and where cloud base sits — the two
    # numbers behind "will the bases be high enough to see anything".
    Param("pbl", "Boundary Layer Depth", "Upper Air",
          ":HPBL:surface:", "m", "lcl",
          [200, 400, 600, 900, 1200, 1600, 2000, 2600, 3200]),
    Param("cldbase", "Cloud Base Height", "Upper Air",
          ":HGT:cloud ceiling:", "ft", "lcl",
          [500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000]),
    Param("fzlvl", "Freezing Level", "Upper Air",
          ":HGT:0C isotherm:", "ft", "hgt",
          [4000, 6000, 8000, 10000, 11000, 12000, 13000, 14000, 16000]),
    # The wind fields. A low-level jet, the mid-level flow that sets storm
    # motion, and the upper jet whose left exit does the lifting.
    Param("wind850", "850 mb Wind", "Upper Air",
          ":UGRD:850 mb:", "kt", "wind",
          [10, 15, 20, 25, 30, 35, 40, 50, 60, 70],
          extra=[":VGRD:850 mb:"], combine="mag"),
    Param("wind500", "500 mb Wind", "Upper Air",
          ":UGRD:500 mb:", "kt", "wind",
          [20, 30, 40, 50, 60, 70, 80, 90, 100, 120],
          extra=[":VGRD:500 mb:"], combine="mag"),
    Param("wind250", "250 mb Jet", "Upper Air",
          ":UGRD:250 mb:", "kt", "wind",
          [50, 70, 90, 110, 130, 150, 170, 190],
          extra=[":VGRD:250 mb:"], combine="mag"),
    Param("hgt850", "850 mb Height", "Upper Air",
          ":HGT:850 mb:", "m", "hgt",
          [1300, 1360, 1400, 1440, 1480, 1520, 1560, 1600], mask_below=False),
    Param("absv850", "850 mb Absolute Vorticity", "Upper Air",
          ":ABSV:850 mb:", "1e-5/s", "vort",
          [6, 10, 14, 18, 22, 26, 30, 36]),
    Param("vvel700", "700 mb Vertical Velocity", "Upper Air",
          ":VVEL:700 mb:", "Pa/s", "press",
          [-1.2, -0.8, -0.5, -0.3, -0.15, -0.05, 0.05, 0.2, 0.5], mask_below=False),
    Param("rh850", "850 mb Relative Humidity", "Upper Air",
          ":RH:850 mb:", "%", "cloud",
          [10, 20, 30, 40, 50, 60, 70, 80, 90, 95]),
    Param("lcdc", "Low Cloud Cover", "Surface & Precipitation",
          ":LCDC:low cloud layer:", "%", "cloud",
          [5, 15, 25, 40, 55, 70, 80, 90, 95]),
    Param("prate", "Precipitation Rate", "Surface & Precipitation",
          ":PRATE:surface:", "mm/h", "pwat",
          [0.1, 0.4, 1, 2.5, 5, 10, 20, 35, 50]),
    Param("vis", "Surface Visibility", "Surface & Precipitation",
          ":VIS:surface:", "mi", "cloud",
          [0.25, 0.5, 1, 2, 3, 5, 7, 10], mask_below=False),
    Param("haines", "Haines Index", "Surface & Precipitation",
          ":HINDEX:surface:", "", "smoke",
          [2, 3, 4, 5, 6], mask_below=False),
]

# ── HREF ensemble probabilities ──────────────────────────────────────────────
# NCEP publishes HREF's neighbourhood probability grids on NOMADS as one GRIB2
# file per forecast hour, each probability threshold its own record. The `match`
# strings below carry the threshold, because "CAPE:90-0 mb above ground" alone
# appears five times in the index and only the threshold tells them apart.
#
# Every entry was read off a live href.tHHz.conus.prob index, thresholds and all.
PROB_LEVELS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90]

# A second ladder, for the fields whose real range is nowhere near 0-100%.
#
# This is what was wrong with Severe Wind. HREF's only 10 m wind records are
# SUSTAINED wind, not gust, and a sustained 58 mph over land is close to
# unheard of: measured against a live 12Z file, the 25.72 m/s neighbourhood
# probability peaked at 8% over the whole CONUS, on 348 grid points out of
# 700,790. Against a ladder whose first band is 5% and whose lowest colour is
# masked below that, an 8% maximum paints a few dozen pixels — which is why the
# parameter looked broken. It was not broken; it was being drawn on the wrong
# scale, and the fix is a scale that starts at 1%.
LOW_PROB_LEVELS = [1, 2, 5, 10, 15, 20, 30, 40, 60]


def prob(key: str, label: str, group: str, match: str, thresh: str,
         levels: list | None = None) -> Param:
    return Param(key, label, group, match, "%", "prob",
                 levels or PROB_LEVELS, match_also=thresh)


HREF_PARAMS = [
    prob("p_refc30", "Reflectivity > 30 dBZ", "Severe Weather",
         ":REFC:entire atmosphere (considered as a single layer):", "prob >30:"),
    prob("p_refd40", "1 km Reflectivity > 40 dBZ", "Severe Weather",
         ":REFD:1000 m above ground:", "prob >40:"),
    prob("p_uh25", "UH > 25", "Severe Weather", ":MXUPHL:5000-2000 m above ground:", "prob >25:"),
    prob("p_uh75", "UH > 75", "Severe Weather", ":MXUPHL:5000-2000 m above ground:", "prob >75:"),
    prob("p_uh150", "UH > 150", "Severe Weather", ":MXUPHL:5000-2000 m above ground:", "prob >150:"),
    prob("p_mlcape500", "ML CAPE > 500", "Severe Weather", ":CAPE:90-0 mb above ground:", "prob >500:"),
    prob("p_mlcape1000", "ML CAPE > 1000", "Severe Weather", ":CAPE:90-0 mb above ground:", "prob >1000:"),
    prob("p_mlcape2000", "ML CAPE > 2000", "Severe Weather", ":CAPE:90-0 mb above ground:", "prob >2000:"),
    prob("p_mlcin50", "ML CIN < -50", "Severe Weather", ":CIN:90-0 mb above ground:", "prob <-50:"),
    prob("p_mlcin100", "ML CIN < -100", "Severe Weather", ":CIN:90-0 mb above ground:", "prob <-100:"),
    prob("p_srh100", "0-3 km SRH > 100", "Severe Weather", ":HLCY:3000-0 m above ground:", "prob >100:"),
    prob("p_srh200", "0-3 km SRH > 200", "Severe Weather", ":HLCY:3000-0 m above ground:", "prob >200:"),
    prob("p_srh400", "0-3 km SRH > 400", "Severe Weather", ":HLCY:3000-0 m above ground:", "prob >400:"),
    # Sustained 10 m wind, which is all HREF publishes — there is no GUST record
    # in the prob file, nor in the mean or pmmn files (checked against a live
    # 12Z index, all three). Labelled "sustained" so nobody reads these as gust
    # probabilities and wonders why they are an order of magnitude below SPC's
    # wind outlook, which is a gust-report probability.
    #
    # 40 mph is here because it is the threshold that actually carries signal on
    # an ordinary convective day; 58 mph is SPC's severe criterion and stays
    # because it is the one that matters on the days it lights up. Both are on
    # the low ladder.
    prob("p_wind40", "Sustained Wind > 40 mph", "Severe Weather",
         ":WIND:10 m above ground:", "prob >18.01:", LOW_PROB_LEVELS),
    prob("p_wind58", "Severe Wind 58 mph (sustained)", "Severe Weather",
         ":WIND:10 m above ground:", "prob >25.72:", LOW_PROB_LEVELS),
    prob("p_etop30", "Echo Top > 30 kft", "Severe Weather",
         ":RETOP:entire atmosphere (considered as a single layer):", "prob >9144:"),
    prob("p_etop40", "Echo Top > 40 kft", "Severe Weather",
         ":RETOP:entire atmosphere (considered as a single layer):", "prob >12192:"),
    prob("p_etop50", "Echo Top > 50 kft", "Severe Weather",
         ":RETOP:entire atmosphere (considered as a single layer):", "prob >15240:"),
    prob("p_uvv1", "Updraft > 1 m/s", "Severe Weather", ":MAXUVV:400-1000 mb:", "prob >1:"),
    prob("p_uvv10", "Updraft > 10 m/s", "Severe Weather", ":MAXUVV:400-1000 mb:", "prob >10:"),
    prob("p_uvv20", "Updraft > 20 m/s", "Severe Weather", ":MAXUVV:400-1000 mb:", "prob >20:"),
    prob("p_ltng", "Lightning", "Severe Weather", ":LTNG:surface:", "prob >0.2:"),
]


CMAPS = {
    "refl": refl_cmap(),
    # Pressure runs low-to-high through the cool end so deep lows read dark.
    "press": seq(["#3d1a52", "#5b2a86", "#3f6fbf", "#4aa3c9", "#7fd1b9",
                  "#d9d9d9", "#e8c87a", "#e08a3c", "#c0392b"]),
    "hgt": seq(["#2a1a4a", "#3f4f9e", "#4a8fc4", "#63c2a8", "#c8dd6a",
                "#f2c14e", "#e07b39", "#b83b3b"]),
    "temp": seq(["#3b1f6b", "#2f5fa8", "#4aa3c9", "#8fd4c1", "#e8e08a",
                 "#e8a94e", "#d4643c", "#a32c2c"]),
    "cloud": seq(["#101828", "#24405e", "#3d6b8f", "#6d9bbd", "#a9c6db",
                  "#d5e3ee", "#f2f6fa"]),
    "cape": seq(["#0b3d2e", "#12715a", "#2fa36b", "#8ec63f", "#f2e33c",
                 "#f5a623", "#ef5b2b", "#d21f3c", "#a3123f", "#f06ad4"]),
    "uphl": seq(["#10243f", "#1d4e89", "#3f8ecc", "#7fd1b9", "#f5e663",
                 "#f0932b", "#eb4d4b", "#c0392b"]),
    "srh": seq(["#101a33", "#1f3a93", "#3e7bd6", "#67d5b5", "#f7dc6f",
                "#e59866", "#cb4335"]),
    "wind": seq(["#0e2a3a", "#1c6b8c", "#31b0a0", "#9ad14b", "#f4d03f",
                 "#e67e22", "#c0392b", "#8e2de2"]),
    "dewp": seq(["#5b3a1e", "#8a6b2f", "#b9a24a", "#5aa469", "#1f8a4c",
                 "#12715a", "#0d5f6e", "#0b3d5c"]),
    "cin": seq(["#3b0d11", "#7b1e22", "#b3462f", "#d98555", "#e8c39e"]),
    "pwat": seq(["#3d2b1f", "#7a6034", "#b39247", "#4f9d69", "#1f7a5a",
                 "#14607a", "#123f75"]),
    "vort": seq(["#101a33", "#274690", "#4a7fd4", "#7bc4c4", "#f7d774",
                 "#e0703a", "#b3202c"]),
    "shear": seq(["#0d1b2a", "#1b3a6b", "#3d6fb5", "#5fb0c9", "#a8d95f",
                  "#f4d03f", "#e8743b", "#c0392b"]),
    "thetae": seq(["#2c1a4d", "#28407a", "#2f7fa8", "#37a67c", "#8ec63f",
                   "#f2e33c", "#f0932b", "#d21f3c"]),
    "ltng": seq(["#10162b", "#233b7a", "#3f7fd0", "#63d3c6", "#f6e27a",
                 "#f39c12", "#e74c3c"]),
    "smoke": seq(["#101014", "#3a2f24", "#6d5230", "#a87d33", "#d6a83c",
                  "#e8613c", "#b32020"]),
    "prob": seq(["#0f1d33", "#14456b", "#1f7a8c", "#39a96b", "#9ad14b",
                 "#f4d03f", "#e8743b", "#c0392b", "#8e2de2"]),
    "echotop": seq(["#0d1b2a", "#1f4e79", "#3f8ecc", "#66c2a5", "#c8e06a",
                    "#f4d03f", "#ef8354", "#c0392b"]),
    "lcl": seq(["#12303f", "#1e6f5c", "#57b894", "#c8e06a", "#f4d03f",
                "#e8743b", "#a33b2a"]),
}


# ── GRIB byte-range access ───────────────────────────────────────────────────
def fetch_index(url: str) -> list[dict]:
    r = SESSION.get(url + ".idx", timeout=60)
    r.raise_for_status()
    rows = []
    lines = [ln for ln in r.text.splitlines() if ln.strip()]
    for i, line in enumerate(lines):
        parts = line.split(":")
        if len(parts) < 5:
            continue
        start = int(parts[1])
        end = int(lines[i + 1].split(":")[1]) - 1 if i + 1 < len(lines) else None
        rows.append({"line": line, "start": start, "end": end})
    return rows


def fetch_record(url: str, rows: list[dict], match: str, also: str | None = None) -> bytes | None:
    """HTTP Range fetch for just the record(s) matching `match` (and `also`)."""
    # Some fields appear twice in the index — an instantaneous record and a
    # time-averaged one (TCDC, for instance, is also published as "6-12 hour ave
    # fcst"). Always prefer the instantaneous record; falling through to
    # whichever happened to be indexed first would silently plot an average.
    candidates = [r for r in rows if match in r["line"] and (not also or also in r["line"])]
    if not candidates:
        return None
    hit = next((r for r in candidates if "ave fcst" not in r["line"]), candidates[0])
    rng = f"bytes={hit['start']}-" + ("" if hit["end"] is None else str(hit["end"]))
    r = SESSION.get(url, headers={"Range": rng}, timeout=120)
    if r.status_code not in (200, 206):
        return None
    return r.content


def values_of(ds: xr.Dataset) -> np.ndarray | None:
    name = next((v for v in ds.data_vars), None)
    return None if name is None else np.asarray(ds[name].values, dtype="float32")


def bolton_theta_e(t_k: np.ndarray, td_k: np.ndarray, p_pa: np.ndarray) -> np.ndarray:
    """Equivalent potential temperature, Bolton (1980) eq. 15 and 39.

    Every input is a real record out of the same GRIB file — this computes a
    standard quantity from them rather than standing in something else and
    calling it theta-E.
    """
    p_hpa = p_pa / 100.0
    # Saturation vapour pressure at the dew point IS the actual vapour pressure.
    e = 6.112 * np.exp(17.67 * (td_k - 273.15) / (td_k - 29.65))
    r = 0.622 * e / np.maximum(p_hpa - e, 1e-3)          # mixing ratio, kg/kg
    t_l = 56.0 + 1.0 / (1.0 / (td_k - 56.0) + np.log(t_k / td_k) / 800.0)
    theta_dl = t_k * (1000.0 / np.maximum(p_hpa - e, 1e-3)) ** 0.2854 \
        * (t_k / t_l) ** (0.28 * r)
    return theta_dl * np.exp((3036.0 / t_l - 1.78) * r * (1.0 + 0.448 * r))


def open_grib(buf: bytes) -> xr.Dataset | None:
    """Decode one GRIB record into an eagerly-loaded Dataset.

    cfgrib/xarray are LAZY: open_dataset only reads headers, and the real values
    are pulled from the file the first time `.values` is touched. Deleting the
    temp file before that raises FileNotFoundError deep inside the render call,
    so we force everything into memory with .load() while the file still exists.
    (One GRIB record is a couple of MB — safe to hold.)
    """
    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as f:
        f.write(buf)
        path = f.name
    try:
        with xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""}) as ds:
            return ds.load()
    except Exception as e:  # noqa: BLE001
        print(f"    ! grib decode failed: {e}", file=sys.stderr)
        return None
    finally:
        for p in (path, path + ".idx", path + ".923a8.idx"):
            try:
                os.unlink(p)
            except OSError:
                pass


# ── rendering ────────────────────────────────────────────────────────────────
def convert(key: str, data: np.ndarray) -> np.ndarray:
    if key == "gust":
        return data * 2.236936          # m/s -> mph
    if key == "dpt2m":
        return (data - 273.15) * 9 / 5 + 32   # K -> F
    if key == "pwat":
        return data / 25.4              # mm -> in
    if key == "absv500":
        return data * 1e5
    if key == "mslp":
        return data / 100.0             # Pa -> mb
    if key == "hgt500":
        return data / 10.0              # m -> decametres
    if key == "tmp850":
        return data - 273.15            # K -> C
    if key in ("shear01", "shear06", "stmmot", "shearsfc500"):
        return data * 1.943844          # m/s -> kt
    if key == "thetae2m":
        return data                     # already K
    if key in ("retop", "lclhgt"):
        return data / 304.8             # m -> kft
    # ── the GFS additions ──────────────────────────────────────────────────
    # Every one of these is a real unit change, not a preference. GRIB gives
    # kelvin, metres, metres per second and metres of visibility; a chaser
    # reads Fahrenheit, feet, knots and miles, and a contour labelled "80" is
    # a different fact in each.
    if key == "tmp2m":
        return (data - 273.15) * 9 / 5 + 32   # K -> F
    if key in ("tmp700", "tmp500"):
        return data - 273.15            # K -> C
    if key in ("cldbase", "fzlvl"):
        return data * 3.280840          # m -> ft
    if key in ("wind850", "wind500", "wind250"):
        return data * 1.943844          # m/s -> kt
    if key == "absv850":
        return data * 1e5
    if key == "prate":
        return data * 3600.0            # kg/m2/s -> mm/h
    if key == "vis":
        return data / 1609.344          # m -> miles
    if key == "smoke":
        return data * 1e9               # kg/m^3 -> ug/m^3
    if key.startswith("p_"):
        return data * 100.0 if float(np.nanmax(data) if data.size else 0) <= 1.01 else data
    return data


# The map furniture, built once.
#
# Cartopy re-reads, clips and re-projects the 50 m land, ocean, state, coastline
# and border geometries on EVERY `add_feature`, and that is most of the cost of
# a frame — the pcolormesh itself is milliseconds. Rebuilding the figure per
# frame was fine at eight parameters and is not at forty: a GFS run is now
# forty parameters over seventeen forecast hours, and at two seconds a frame
# that is longer than the job's own timeout.
#
# So the furniture is built once and only the data is swapped. Every artist a
# frame owns is removed after it is saved, which is what makes the reuse safe:
# nothing from one frame can survive into the next.
_CANVAS: tuple | None = None


def canvas():
    global _CANVAS
    if _CANVAS is not None:
        return _CANVAS

    proj = ccrs.LambertConformal(
        central_longitude=-97.5, central_latitude=38.5, standard_parallels=(38.5, 38.5))
    fig = plt.figure(figsize=(12.0, 8.0), dpi=DPI)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0, 0, 1, 1], projection=proj)
    ax.set_extent(EXTENT, crs=ccrs.PlateCarree())

    # The old figure was 12.8x7.6 with the axes laid out normally, and the map is
    # not that shape. A GeoAxes holds its data aspect, so the drawing sat
    # letterboxed: roughly 880x550 of map inside a 1280x760 file, 45% of every
    # frame spent on black margin. That is most of why these looked soft next to
    # other sites', and it compounded on the regional presets, which crop a box
    # out of that already-small map and blow it back up.
    x0, x1, y0, y1 = ax.get_extent(crs=proj)
    aspect = (x1 - x0) / (y1 - y0)
    w_in = math.sqrt(TARGET_PX * aspect) / DPI
    fig.set_size_inches(w_in, w_in / aspect)

    # "auto" AFTER the limits are set, not before. A GeoAxes defaults to an
    # equal aspect with adjustable="box", which lets matplotlib shrink the axes
    # inside its position to honour that aspect — and a letterboxed axes is
    # exactly what the viewer's region crops cannot see. The figure is already
    # sized to the extent's own aspect, so "auto" distorts nothing; what it buys
    # is the guarantee that the image bounds ARE the projected extent, to the
    # pixel, which is what lets the client compute a region rect from the
    # projection instead of from constants measured off a screenshot once.
    ax.set_aspect("auto")

    ax.set_facecolor(BG)
    ax.add_feature(cfeature.LAND.with_scale("50m"), facecolor=LAND, zorder=0)
    ax.add_feature(cfeature.OCEAN.with_scale("50m"), facecolor=BG, zorder=0)
    ax.add_feature(cfeature.STATES.with_scale("50m"), edgecolor=BORDER, linewidth=0.7, zorder=2)
    ax.add_feature(cfeature.COASTLINE.with_scale("50m"), edgecolor=COAST, linewidth=0.8, zorder=2)
    ax.add_feature(cfeature.BORDERS.with_scale("50m"), edgecolor=COAST, linewidth=0.8, zorder=2)
    ax.spines["geo"].set_visible(False)
    ax.set_title("")

    _CANVAS = (fig, ax)
    return _CANVAS


# How many times each cell of a regular lat/lon grid is subdivided before it is
# drawn. Only the coarse global models need it; see `smooth_grid`.
#
# FOUR, and the number was measured twice — once for looks and once for cost.
#
# GFS is 0.25°, which over the CONUS extent is about 141 x 257 cells. At 4x that
# is 561 x 1025, a little under two output pixels per value in an 1900 x 1040
# frame. Eight was tried on the theory that one value per pixel would be
# sharper. Rendered side by side at 3x magnification — far closer than anyone
# views these — 4x and 8x are indistinguishable: what removes the facets is the
# cubic in `_interp_axis`, not the sample count, and past ~2 px per value there
# is nothing left for the extra samples to describe.
#
# The cost, however, is not indistinguishable. pcolormesh draws one quad per
# cell and cartopy projects every vertex into Lambert Conformal, so the work is
# quadratic in this number: 0.58M quads at 4x against 2.30M at 8x. Measured on
# the runner across several 40-parameter GFS runs, 4x takes about 7.8 minutes
# and 8x about 9.6 — call it a quarter more, four times a day, for a difference
# that is invisible. One 8x run also stretched past 25 minutes against a
# 45-minute job timeout; that was an outlier rather than the norm, but it is
# the kind of outlier that publishes nothing when it lands wrong.
UPSAMPLE = {"gfs": 4}


def _interp_axis(x_src: np.ndarray, y: np.ndarray, x_dst: np.ndarray, axis: int) -> np.ndarray:
    """Resample `y` along `axis` from `x_src` onto `x_dst`, smoothly and safely.

    CATMULL-ROM, THEN CLAMPED, and both halves matter.

    Linear interpolation cannot overshoot, which is why it was used first, but
    it leaves a visible crease at every sample: the first derivative jumps at
    each grid point, and on a 25 km field blown up eight times those creases
    are exactly the "blocky" look this is meant to remove. A cubic is smooth
    through the samples and looks like the 3 km plates beside it.

    The reason cubics are normally wrong for weather fields is that they
    overshoot near a sharp gradient — a Catmull-Rom through 0, 0, 60, 60 dBZ
    peaks above 60, and a reflectivity plate showing a maximum the model never
    produced is a lie, not a smoothing artefact. So every interpolated value is
    clamped to the range of the two samples it sits between. That keeps the
    smoothness everywhere the field is smooth and degrades to linear exactly
    where the data is steep, which is the only place the overshoot could have
    happened.

    `x_src` must be strictly increasing. Vectorised: this runs on 1.4 M points
    a frame and a Python loop would cost more than the render.
    """
    n = x_src.size
    i = np.clip(np.searchsorted(x_src, x_dst) - 1, 0, n - 2)
    t = ((x_dst - x_src[i]) / (x_src[i + 1] - x_src[i])).astype("float32")

    # The four samples the cubic runs through, with the ends repeated so the
    # first and last intervals do not reach outside the grid.
    p0 = np.take(y, np.clip(i - 1, 0, n - 1), axis=axis)
    p1 = np.take(y, i, axis=axis)
    p2 = np.take(y, i + 1, axis=axis)
    p3 = np.take(y, np.clip(i + 2, 0, n - 1), axis=axis)

    shape = [1] * y.ndim
    shape[axis] = t.size
    t = t.reshape(shape)
    t2 = t * t
    t3 = t2 * t
    out = 0.5 * ((2 * p1)
                 + (-p0 + p2) * t
                 + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)

    lo = np.minimum(p1, p2)
    hi = np.maximum(p1, p2)
    return np.clip(out, lo, hi).astype("float32")


def smooth_grid(lons: np.ndarray, lats: np.ndarray, vals: np.ndarray, k: int):
    """Subdivide a regular lat/lon grid k times in each direction, bilinearly.

    WHY THIS EXISTS, AND WHAT IT IS NOT
    GFS publishes at 0.25°, which is about 25 km. Over the CONUS extent that is
    roughly 204 x 112 cells drawn into an 1800 x 1100 frame — so every cell is a
    flat nine-pixel block, and the map looks like a mosaic next to the HRRR and
    HREF plates beside it, which are 3 km and land near one pixel per cell.

    Subdividing does NOT invent resolution and is not claimed to: the field is
    still 0.25° and still says exactly what GFS said. What it removes is the
    staircase on every band edge, which is an artefact of how we were drawing
    it rather than anything in the data. Every serious model-graphics site does
    the same thing — a contour plot of a coarse field is this operation with the
    interpolation hidden inside the contouring.

    The interpolation is a clamped Catmull-Rom — see `_interp_axis` for why the
    clamp is not optional.
    """
    if k <= 1 or lons.ndim != 1 or lats.ndim != 1:
        return lons, lats, vals
    asc = lats[0] < lats[-1]
    la_src = lats if asc else lats[::-1]
    v = vals if asc else vals[::-1, :]
    lo_dst = np.linspace(lons[0], lons[-1], (lons.size - 1) * k + 1, dtype="float32")
    la_dst = np.linspace(la_src[0], la_src[-1], (la_src.size - 1) * k + 1, dtype="float32")
    v = _interp_axis(lons.astype("float32"), v, lo_dst, axis=1)
    v = _interp_axis(la_src.astype("float32"), v, la_dst, axis=0)
    return lo_dst, la_dst, v


def render(ds: xr.Dataset, p: Param, model: str, cycle: datetime, fhr: int, out: str) -> bool:
    name = next((v for v in ds.data_vars), None)
    if name is None:
        return False
    da = ds[name]
    vals = convert(p.key, np.asarray(da.values, dtype="float32"))
    lats = np.asarray(ds.latitude.values)
    lons = np.asarray(ds.longitude.values)

    if lons.ndim == 1:
        # GFS is a 1-D GLOBAL axis running 0 -> 359.75. Naively mapping it into
        # -180..180 leaves it non-monotonic (…179.75, -180…), and pcolormesh
        # smears garbage across a non-monotonic axis. Re-sort, carrying the data
        # columns with it, then clip to CONUS so we rasterise ~36k points instead
        # of the full 1.04M-point globe.
        lons = np.where(lons > 180, lons - 360, lons)
        order = np.argsort(lons)
        lons = lons[order]
        vals = vals[..., order]
        keep_x = (lons >= -128) & (lons <= -64)
        keep_y = (lats >= 20) & (lats <= 55)
        if keep_x.any() and keep_y.any():
            lons = lons[keep_x]
            lats = lats[keep_y]
            vals = vals[np.ix_(keep_y, keep_x)]
        # After the clip and BEFORE the mask: interpolating across a NaN spreads
        # it, so a field that has had its low end knocked out would grow a
        # one-cell transparent halo around every edge.
        lons, lats, vals = smooth_grid(lons, lats, vals, UPSAMPLE.get(model, 1))
    else:
        # HRRR is a 2-D curvilinear CONUS grid; pcolormesh handles 2-D coords
        # regardless of ordering, so it only needs the -180..180 mapping.
        lons = np.where(lons > 180, lons - 360, lons)

    fig, ax = canvas()

    # BoundaryNorm with extend="both" needs (len(levels) - 1) + 2 colour bins.
    # A fixed ListedColormap (e.g. the 14-stop reflectivity ramp) can be short of
    # that, which raises "ncolors must equal or exceed the number of bins", so
    # resample every colormap to exactly the bin count it needs.
    # Below the first level usually means "nothing here" (no echo, no CAPE, no
    # rotation). Left unmasked, BoundaryNorm's "under" colour floods the whole
    # map with the first ramp colour - which painted every frame solid cyan.
    extend = "both" if not p.mask_below else "max"
    if p.mask_below:
        vals = np.where(vals < p.levels[0], np.nan, vals)
    nbins = (len(p.levels) - 1) + (2 if extend == "both" else 1)
    cmap = CMAPS[p.cmap].resampled(nbins).copy()
    cmap.set_bad(alpha=0.0)          # NaN -> fully transparent
    norm = BoundaryNorm(p.levels, ncolors=nbins, extend=extend)
    mesh = ax.pcolormesh(lons, lats, vals, cmap=cmap, norm=norm,
                         transform=ccrs.PlateCarree(), shading="auto", zorder=1)
    frame_artists = [mesh]

    # The caption rides ON the map rather than in a band above it, so it costs
    # no map height. There is no colour bar any more either: the viewer already
    # receives every level and colour in the run manifest and draws the ramp in
    # HTML, which is sharp at any pixel ratio instead of being baked in at one.
    valid = cycle + timedelta(hours=fhr)
    shadow = [patheffects.withStroke(linewidth=3.2, foreground="#05060d")]
    frame_artists.append(ax.text(
        0.012, 0.962, f"{model.upper()}  {p.label.upper()}", transform=ax.transAxes,
        color="#ffffff", fontsize=15, fontweight="bold", ha="left", va="center",
        path_effects=shadow, zorder=5))
    frame_artists.append(ax.text(
        0.012, 0.925,
        f"{cycle:%HZ %b %d} run  ·  F{fhr:03d}  ·  valid {valid:%a %b %d %H:%MZ}  ·  {p.unit}",
        transform=ax.transAxes, color="#c3ccdd", fontsize=9.5, ha="left", va="center",
        path_effects=shadow, zorder=5))
    frame_artists.append(ax.text(
        0.988, 0.962, "VIP.SSWX.SPACE", transform=ax.transAxes, color="#cbb7d8",
        fontsize=10, fontweight="bold", ha="right", va="center",
        path_effects=shadow, zorder=5))

    try:
        fig.savefig(out, facecolor=BG, edgecolor="none")
    finally:
        # Everything this frame put on the shared canvas comes off again, in a
        # `finally` because a failed save must not leave a mesh behind to be
        # drawn under the next parameter's data.
        for art in frame_artists:
            art.remove()
    quantise(out)
    return True


# ── Supabase ─────────────────────────────────────────────────────────────────
class Supa:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self.h = {"apikey": key, "Authorization": f"Bearer {key}"}

    # Storage answers 429 / SlowDown / too_many_connections when the project's
    # connection pool is busy — another render running, a backfill hammering the
    # REST API, or simply a burst of our own uploads. It is a "wait a moment",
    # not a rejection, and a run that has already spent six minutes pulling GRIB
    # records and drawing 144 maps should not throw all of it away over one.
    #
    # It did exactly that on 13 September: a GFS render died on
    # `gfs/2026091218/absv500/F033.png` with `too_many_connections` after 33
    # forecast hours of work, taking the whole job with it.
    RETRY_STATUS = (409, 423, 429, 500, 502, 503, 504)
    ATTEMPTS = 5

    def _post(self, what: str, url: str, *, headers: dict, data, timeout: int):
        last = ""
        for attempt in range(self.ATTEMPTS):
            try:
                r = SESSION.post(url, headers=headers, data=data, timeout=timeout)
                if r.status_code < 300:
                    return r
                last = f"{r.status_code} {r.text[:180]}"
                if r.status_code not in self.RETRY_STATUS:
                    break
            except requests.RequestException as e:
                last = str(e)[:180]
            if attempt < self.ATTEMPTS - 1:
                # 1.5s, 3s, 6s, 12s, jittered so concurrent uploads separate.
                time.sleep(1.5 * 2 ** attempt + random.random())
        raise RuntimeError(f"{what}: {last}")

    def upload(self, path: str, data: bytes) -> str:
        self._post(f"upload {path}",
                   f"{self.url}/storage/v1/object/model-maps/{path}",
                   headers={**self.h, "Content-Type": "image/png", "x-upsert": "true"},
                   data=data, timeout=120)
        return f"{self.url}/storage/v1/object/public/model-maps/{path}"

    def newest_param_count(self, model: str) -> int | None:
        """
        How many parameters the most recent stored run for this model has.

        Used by the regression guard in `main`. Returns None when nothing is
        stored yet or the lookup fails — a guard that cannot read the previous
        state must not block a render.
        """
        try:
            r = SESSION.get(f"{self.url}/rest/v1/model_runs",
                            headers=self.h, timeout=30,
                            params={"select": "params", "model": f"eq.{model}",
                                    "region": "eq.conus",
                                    "order": "rendered_at.desc", "limit": "1"})
            if r.status_code != 200:
                return None
            rows = r.json()
            if not rows:
                return None
            return len(rows[0].get("params") or [])
        except (requests.RequestException, ValueError):
            return None

    def save_run(self, row: dict):
        # The manifest is the last thing written and the only thing the viewer
        # reads, so losing it to a busy moment would waste the entire render.
        self._post("save_run", f"{self.url}/rest/v1/model_runs?on_conflict=model,cycle,region",
                   headers={**self.h, "Content-Type": "application/json",
                            "Prefer": "resolution=merge-duplicates"},
                   data=json.dumps(row), timeout=60)

    def _list(self, prefix: str) -> tuple[list[str], list[str]]:
        """
        One directory level. Storage returns folders with a null id and files
        with a real one, so the two are split on that.
        """
        folders: list[str] = []
        files: list[str] = []
        for page in range(100):
            r = SESSION.post(f"{self.url}/storage/v1/object/list/model-maps",
                             headers={**self.h, "Content-Type": "application/json"},
                             data=json.dumps({"prefix": prefix, "limit": 1000,
                                              "offset": page * 1000}), timeout=60)
            if r.status_code >= 300:
                raise RuntimeError(f"list {prefix}: {r.status_code} {r.text[:180]}")
            batch = r.json()
            if not batch:
                break
            for o in batch:
                (files if o.get("id") else folders).append(prefix + o["name"])
            if len(batch) < 1000:
                break
        return folders, files

    def list_frames(self, cycle_prefix: str) -> list[str]:
        """Every stored frame under one cycle: {model}/{cycle}/{param}/F###.png."""
        params, loose = self._list(cycle_prefix)
        out = list(loose)
        for pdir in params:
            _, frames = self._list(pdir + "/")
            out += frames
        return out

    def delete_frames(self, paths: list[str]) -> int:
        """Remove stored objects in batches. Returns how many were deleted."""
        done = 0
        for i in range(0, len(paths), 200):
            chunk = paths[i:i + 200]
            r = SESSION.delete(f"{self.url}/storage/v1/object/model-maps",
                               headers={**self.h, "Content-Type": "application/json"},
                               data=json.dumps({"prefixes": chunk}), timeout=120)
            if r.status_code >= 300:
                raise RuntimeError(f"delete frames: {r.status_code} {r.text[:180]}")
            done += len(chunk)
        return done

    def purge(self, keep_runs: int) -> None:
        """
        Drop everything older than the newest `keep_runs` cycles per model — the
        rendered PNGs first, then their manifest rows, so the two never drift.

        The frames must go explicitly: deleting a manifest row does not touch the
        objects it points at, and the bucket is what actually fills up.
        """
        for model in ("hrrr", "gfs"):
            r = SESSION.get(f"{self.url}/rest/v1/model_runs",
                            headers=self.h, timeout=60,
                            params={"select": "id,cycle", "model": f"eq.{model}",
                                    "order": "cycle.desc"})
            if r.status_code >= 300:
                raise RuntimeError(f"purge list {model}: {r.status_code} {r.text[:180]}")
            stale = r.json()[keep_runs:]
            if not stale:
                continue

            for run in stale:
                cycle = datetime.fromisoformat(run["cycle"]).astimezone(timezone.utc)
                prefix = f"{model}/{cycle:%Y%m%d%H}/"
                frames = self.list_frames(prefix)
                if frames:
                    print(f"  purged {self.delete_frames(frames)} frames from {prefix}")

            # Filter values are URL-encoded by requests' params=, which is the
            # point: an ISO timestamp ends in "+00:00", and a raw "+" in a query
            # string decodes to a space, which PostgREST rejects as an invalid
            # timestamp (HTTP 400). Interpolating the cutoff straight into the
            # URL is why this purge silently did nothing for its first weeks.
            ids = ",".join(str(run["id"]) for run in stale)
            d = SESSION.delete(f"{self.url}/rest/v1/model_runs",
                               headers=self.h, timeout=60,
                               params={"id": f"in.({ids})"})
            if d.status_code >= 300:
                raise RuntimeError(f"purge rows {model}: {d.status_code} {d.text[:180]}")
            print(f"  purged {len(stale)} stale {model} manifest rows")



# ── one forecast hour, start to finish ───────────────────────────────────────
#
# WHY THIS IS ITS OWN FUNCTION
# A full HRRR run is 23 parameters over 19 forecast hours, and measured on a
# GitHub runner that is 437 frames in twenty-one minutes. Four of those a day,
# plus GFS and HREF, is roughly 6,000 Actions minutes a month against a private
# repository's free 2,000 — the render would simply stop somewhere around the
# tenth of the month, and nothing in the log would say why. Growing the
# parameter list from eight to sixty-one and doubling the frame size is what
# bought that bill; this is what pays it.
#
# The work is embarrassingly parallel by forecast hour: each hour reads its own
# index, pulls its own records and writes its own frames, and nothing crosses
# between them.
#
# PROCESSES, NOT THREADS, and the three things that make that safe:
#   · matplotlib is not thread-safe, and the canvas here is deliberately reused
#     between frames because rebuilding the cartopy furniture is most of the
#     cost of a frame. One canvas per PROCESS keeps that saving without sharing
#     anything.
#   · every temp path is already unique — `NamedTemporaryFile` for the GRIB
#     record, `{model}_{key}_{fhr}` for the PNG — and cfgrib is told to write no
#     index file at all, so there is nothing for two workers to collide over.
#   · `requests.Session` is module state, so each process gets its own.
#
# The one thing that is NOT safe in parallel is the first cartopy call, which
# downloads the Natural Earth shapefiles into a shared cache. The parent warms
# that cache before the pool starts; see `warm_features`.
def render_hour(job: tuple) -> tuple[int, dict, int, bool]:
    """One forecast hour. Never raises — see the note above `_render_hour`."""
    fhr = job[2]
    try:
        return _render_hour(job)
    except Exception as e:  # noqa: BLE001
        # A pool worker that raises takes the whole map down with it, and one
        # bad hour is not worth nineteen. The hour comes back marked missing and
        # the coverage guard in `main` decides whether the run still stands.
        print(f"  F{fhr:03d}: failed ({e})", file=sys.stderr)
        return fhr, {}, 0, False


def _render_hour(job: tuple) -> tuple[int, dict, int, bool]:
    model, cycle, fhr, params, url, key = job
    supa = Supa(url, key) if url and key else None
    frames: dict[str, list] = {}
    bytes_pulled = 0

    gurl = grib_url(model, cycle, fhr)
    # One retry, then skip the hour and keep going. Stopping at the first
    # gap is what turned a single transient 404 into a two-frame run; a hole
    # in the middle of an otherwise complete loop is worth far less than the
    # nineteen frames that stopping threw away.
    rows = None
    for attempt in (1, 2):
        try:
            rows = fetch_index(gurl)
            break
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                print(f"  F{fhr:03d}: index unavailable ({e}) — skipping this hour")
            else:
                time.sleep(3)
    if rows is None:
        # The hour is reported missing rather than raised: one gap must not take
        # the other eighteen hours down with it. `main` decides whether enough
        # of the run survived to be worth publishing.
        return fhr, {}, 0, False
    print(f"  F{fhr:03d}")
    for p in params:
        raw = fetch_record(gurl, rows, p.match, p.match_also)
        if not raw:
            print(f"    - {p.key}: not in index")
            continue
        bytes_pulled += len(raw)
        ds = open_grib(raw)
        if ds is None:
            continue

        # Parameters built from more than one record. A missing companion is
        # a skip, never a silent fall-back to the primary field on its own —
        # half of a shear vector plotted as if it were the shear would be
        # wrong everywhere the wind is not due west.
        if p.combine:
            parts = []
            ok = True
            for m in p.extra:
                r2 = fetch_record(gurl, rows, m)
                d2 = open_grib(r2) if r2 else None
                v2 = values_of(d2) if d2 is not None else None
                if v2 is None:
                    print(f"    - {p.key}: companion record missing ({m})")
                    ok = False
                    break
                bytes_pulled += len(r2)
                parts.append(v2)
            if not ok:
                continue
            base = values_of(ds)
            if base is None:
                continue
            if p.combine == "mag":
                combined = np.hypot(base, parts[0])
            elif p.combine == "vecdiff":
                # match = u0, extra = [v0, u1, v1]
                v0, u1, v1 = parts
                combined = np.hypot(u1 - base, v1 - v0)
            elif p.combine == "thetae":
                # match = TMP, extra = [DPT, PRES]
                td, pres = parts
                combined = bolton_theta_e(base, td, pres)
            elif p.combine == "lapse":
                # match = TMP lower, extra = [TMP upper, HGT lower, HGT upper]
                # °C per kilometre through the layer. GFS publishes no lapse
                # rate of its own, and 700-500 is the number a chaser reads
                # to decide whether the cap will break and how hard updrafts
                # will go once it does — it is four real records, divided.
                t_up, z_lo, z_up = parts
                dz = np.maximum(z_up - z_lo, 1.0) / 1000.0
                combined = (base - t_up) / dz
            else:
                print(f"    - {p.key}: unknown combine '{p.combine}'")
                continue
            if combined.shape != base.shape:
                print(f"    - {p.key}: companion grid mismatch "
                      f"{base.shape} vs {combined.shape}")
                continue
            # Rebuilt rather than written in place: a cfgrib array can come
            # back read-only, and a shallow Dataset.copy() would share it
            # with the record we just decoded.
            vname = next(iter(ds.data_vars))
            ds = ds.assign({vname: (ds[vname].dims, combined)})
        out = os.path.join(tempfile.gettempdir(), f"{model}_{p.key}_{fhr:03d}.png")
        if not render(ds, p, model, cycle, fhr, out):
            continue
        path = f"{model}/{cycle:%Y%m%d%H}/{p.key}/F{fhr:03d}.png"
        if supa:
            with open(out, "rb") as fh:
                supa.upload(path, fh.read())
        os.unlink(out)
        frames.setdefault(p.key, []).append({
            "fhr": fhr,
            "valid": (cycle + timedelta(hours=fhr)).isoformat(),
            "path": path,
        })
    return fhr, frames, bytes_pulled, True


def warm_features() -> None:
    """Pull the Natural Earth shapefiles into cartopy's cache, in the parent.

    Four workers each discovering a missing shapefile at the same moment is four
    concurrent downloads into one directory, and the loser of that race reads a
    half-written zip. Doing it here costs about ten seconds once and makes every
    worker's first canvas a local read.
    """
    for f in (cfeature.LAND, cfeature.OCEAN, cfeature.STATES,
              cfeature.COASTLINE, cfeature.BORDERS):
        try:
            list(f.with_scale("50m").geometries())
        except Exception as e:  # noqa: BLE001
            print(f"  ! could not pre-cache a map feature: {e}", file=sys.stderr)


# ── run discovery ────────────────────────────────────────────────────────────
def latest_cycle(model: str, last_fhr: int, max_back: int = 8) -> datetime | None:
    """The newest cycle that has FINISHED publishing.

    This used to probe the FIRST forecast hour, and that is why the HRRR viewer
    spent most of 13 September showing two frames.

    F00 appears within a minute or two of a cycle starting — it is the analysis,
    there is nothing to integrate — while the last hour of an HRRR run does not
    land for another forty minutes. Probing F00 therefore said "16Z is ready" at
    17:03 when 16Z had published exactly F00 and F01; the loop rendered those
    two, hit a 404 on F02, stopped, and wrote a two-frame manifest OVER a
    complete one.

    Probing the last hour we actually intend to render is the honest
    completeness test: if that file exists, everything before it does too. When
    it does not, we step back a cycle and render the one that finished, which is
    what a viewer wants anyway — a complete older run beats two frames of a
    newer one.
    """
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    step = 6 if model in ("gfs", "href") else 1
    now = now.replace(hour=(now.hour // step) * step)
    for i in range(max_back):
        c = now - timedelta(hours=i * step)
        if SESSION.head(grib_url(model, c, last_fhr), timeout=30).status_code == 200:
            return c
    return None


def grib_url(model: str, cycle: datetime, fhr: int) -> str:
    if model == "hrrr":
        return (f"{HRRR_BUCKET}/hrrr.{cycle:%Y%m%d}/conus/"
                f"hrrr.t{cycle:%H}z.wrfsfcf{fhr:02d}.grib2")
    if model == "href":
        return (f"{HREF_BASE}/href.{cycle:%Y%m%d}/ensprod/"
                f"href.t{cycle:%H}z.conus.prob.f{fhr:02d}.grib2")
    return (f"{GFS_BUCKET}/gfs.{cycle:%Y%m%d}/{cycle:%H}/atmos/"
            f"gfs.t{cycle:%H}z.pgrb2.0p25.f{fhr:03d}")


def quantise(path: str) -> None:
    """Re-save the PNG with a 256-colour palette.

    These are filled contour maps: a few dozen ramp colours, flat land, flat
    ocean. A truecolour PNG spends most of its bytes describing a palette it
    does not need, and the saving is roughly 40% at no visible cost.

    That matters more than it sounds. The parameter list has gone from twenty to
    sixty-one across three models, and this project has already been taken
    offline once by model maps filling its storage quota — see the retention
    migration. Halving every frame is the cheapest half of staying under it.
    """
    try:
        from PIL import Image
    except ImportError:
        return
    try:
        with Image.open(path) as im:
            im.convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT) \
              .save(path, optimize=True)
    except Exception as e:  # noqa: BLE001
        print(f"    ! quantise skipped: {e}", file=sys.stderr)


def legend_for(p: Param) -> list[dict]:
    cmap = CMAPS[p.cmap]
    n = len(p.levels)
    return [{"v": lv, "c": matplotlib.colors.to_hex(cmap(i / max(1, n - 1)))}
            for i, lv in enumerate(p.levels)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["hrrr", "gfs", "href"], required=True)
    ap.add_argument("--max-fhr", type=int, default=18)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--keep-runs", type=int, default=8,
                    help="cycles of frames to retain per model (the viewer shows 6)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--allow-fewer-params", action="store_true",
                    help="Permit publishing fewer parameters than the stored run. "
                         "Only for a deliberate reduction — see the regression "
                         "guard in main().")
    a = ap.parse_args()

    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not a.dry_run and not (url and key):
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        return 2
    supa = None if a.dry_run else Supa(url, key)

    params = {"hrrr": HRRR_PARAMS, "gfs": GFS_PARAMS, "href": HREF_PARAMS}[a.model]
    # HREF's probability files start at F01 and run hourly to F48; GFS is 3-hourly.
    step = a.step if a.model in ("hrrr", "href") else max(a.step, 3)

    first = FIRST_FHR.get(a.model, 0)
    hours = list(range(first, a.max_fhr + 1, step))

    cycle = latest_cycle(a.model, hours[-1])
    if cycle is None:
        print(f"no {a.model} cycle has finished publishing through F{hours[-1]:03d}",
              file=sys.stderr)
        return 1
    print(f"{a.model.upper()} cycle {cycle:%Y-%m-%d %HZ}  ->  "
          f"F{FIRST_FHR.get(a.model, 0):03d}-F{a.max_fhr:03d} step {step}")

    frames: dict[str, list] = {p.key: [] for p in params}
    bytes_pulled = 0
    missing: list[int] = []

    # One worker per core, and no more.
    #
    # Oversubscribing to four on this two-core runner was tried and measured: it
    # did not go faster, and seven of nineteen HRRR hours came back with the
    # remote end closing the connection. Half of each frame is I/O, so in
    # principle there is headroom — but the thing being waited on is a public
    # NOAA endpoint that pushes back, and there is no version of "be ruder to
    # the free data source" that ends well. Two workers with retries underneath
    # (see `_RETRY`) rendered 18/18 HREF hours cleanly.
    workers = max(1, min(os.cpu_count() or 2, len(hours), 4))
    print(f"  rendering {len(hours)} forecast hours across {workers} workers")
    warm_features()

    jobs = [(a.model, cycle, fhr, params, url, key) for fhr in hours]
    began = time.time()
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for fhr, got, pulled, ok in pool.map(render_hour, jobs):
            bytes_pulled += pulled
            if not ok:
                missing.append(fhr)
            for k, v in got.items():
                frames.setdefault(k, []).extend(v)

    # Frames arrive in whatever order the workers finished. The viewer sorts by
    # forecast hour itself, but the manifest is also read by people, and a run
    # whose hours are shuffled looks broken when it is not.
    for v in frames.values():
        v.sort(key=lambda f: f["fhr"])
    print(f"  {time.time() - began:.0f}s of render time")

    rendered = sum(len(v) for v in frames.values())
    done = len(hours) - len(missing)
    print(f"rendered {rendered} frames over {done}/{len(hours)} forecast hours · "
          f"pulled {bytes_pulled/1048576:.1f} MB of GRIB "
          f"(full files would have been ~{len(hours) * 140} MB)")
    if rendered == 0:
        return 1

    # A short run must never replace a complete one.
    #
    # The viewer shows the newest manifest for a model, so writing a manifest is
    # publishing — and publishing four frames of a cycle that is still uploading
    # takes the loop away from everyone looking at it. Below 80% coverage this
    # exits non-zero WITHOUT saving, which leaves the previous complete run in
    # place and turns a silent regression into a red job somebody can see.
    if done < 0.8 * len(hours):
        print(f"only {done}/{len(hours)} forecast hours rendered "
              f"(missing {missing}); refusing to publish a partial run",
              file=sys.stderr)
        return 1

    row = {
        "model": a.model,
        "cycle": cycle.isoformat(),
        "region": "conus",
        "max_fhr": a.max_fhr,
        "status": "complete",
        "params": [{"key": p.key, "label": p.label, "group": p.group,
                    "unit": p.unit, "legend": legend_for(p)}
                   for p in params if frames[p.key]],
        "frames": {k: v for k, v in frames.items() if v},
        "rendered_at": datetime.now(timezone.utc).isoformat(),
    }
    if supa:
        # ── REGRESSION GUARD ──────────────────────────────────────────────
        #
        # THE INCIDENT THIS EXISTS FOR. Scheduled GitHub Actions workflows
        # always run from the DEFAULT branch. While the parameter expansion sat
        # unmerged on a feature branch, every scheduled render kept executing
        # main's older copy of this script — 8 HRRR parameters instead of 23,
        # 6 GFS instead of 40, no HREF at all — and each run quietly overwrote
        # the viewer's newest manifest with the smaller set. Nothing failed.
        # Nothing logged. The Model Runs page simply lost most of its
        # parameters, and the only way to notice was to open it and count.
        #
        # So: a run that would publish materially fewer parameters than the one
        # already stored refuses to write, loudly, with a non-zero exit. The
        # frames it rendered are already uploaded and harmless; what it will not
        # do is replace a good manifest with a worse one.
        #
        # A real, intended reduction passes `--allow-fewer-params`.
        n_now = len(row["params"])
        n_prev = supa.newest_param_count(a.model)
        if (n_prev is not None and not a.allow_fewer_params
                and n_now < n_prev * FEWER_PARAMS_TOLERANCE):
            print(
                f"REFUSING TO SAVE: this render produced {n_now} parameters for "
                f"{a.model}, but the stored run has {n_prev}. That is the "
                f"signature of an older copy of this script running against a "
                f"newer manifest — check which branch the workflow checked out. "
                f"Pass --allow-fewer-params if the reduction is intended.",
                file=sys.stderr,
            )
            return 1

        supa.save_run(row)
        supa.purge(a.keep_runs)
        print(f"manifest saved ({n_now} parameters); old runs purged")
    else:
        print(json.dumps({**row, "frames": {k: len(v) for k, v in row["frames"].items()}}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
