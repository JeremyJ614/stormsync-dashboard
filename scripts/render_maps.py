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
import json
import os
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np
import requests

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, LinearSegmentedColormap, ListedColormap

import cartopy.crs as ccrs
import cartopy.feature as cfeature

import xarray as xr

HRRR_BUCKET = "https://noaa-hrrr-bdp-pds.s3.amazonaws.com"
GFS_BUCKET = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "StormSyncVIP-renderer/1.0"

# ── styling ──────────────────────────────────────────────────────────────────
BG = "#0b0e17"
LAND = "#171b26"
COAST = "#5b6780"
BORDER = "#7c8aa8"


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


def fetch_record(url: str, rows: list[dict], match: str) -> bytes | None:
    """HTTP Range fetch for just the record(s) matching `match`."""
    # Some fields appear twice in the index — an instantaneous record and a
    # time-averaged one (TCDC, for instance, is also published as "6-12 hour ave
    # fcst"). Always prefer the instantaneous record; falling through to
    # whichever happened to be indexed first would silently plot an average.
    candidates = [r for r in rows if match in r["line"]]
    if not candidates:
        return None
    hit = next((r for r in candidates if "ave fcst" not in r["line"]), candidates[0])
    rng = f"bytes={hit['start']}-" + ("" if hit["end"] is None else str(hit["end"]))
    r = SESSION.get(url, headers={"Range": rng}, timeout=120)
    if r.status_code not in (200, 206):
        return None
    return r.content


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
    return data


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
    else:
        # HRRR is a 2-D curvilinear CONUS grid; pcolormesh handles 2-D coords
        # regardless of ordering, so it only needs the -180..180 mapping.
        lons = np.where(lons > 180, lons - 360, lons)

    fig = plt.figure(figsize=(12.8, 7.6), dpi=100)
    fig.patch.set_facecolor(BG)
    ax = plt.axes(projection=ccrs.LambertConformal(
        central_longitude=-97.5, central_latitude=38.5, standard_parallels=(38.5, 38.5)))
    ax.set_extent([-121, -73, 22.5, 50.5], crs=ccrs.PlateCarree())
    ax.set_facecolor(BG)
    ax.add_feature(cfeature.LAND.with_scale("50m"), facecolor=LAND, zorder=0)
    ax.add_feature(cfeature.OCEAN.with_scale("50m"), facecolor=BG, zorder=0)

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

    ax.add_feature(cfeature.STATES.with_scale("50m"), edgecolor=BORDER, linewidth=0.55, zorder=2)
    ax.add_feature(cfeature.COASTLINE.with_scale("50m"), edgecolor=COAST, linewidth=0.65, zorder=2)
    ax.add_feature(cfeature.BORDERS.with_scale("50m"), edgecolor=COAST, linewidth=0.65, zorder=2)
    ax.spines["geo"].set_visible(False)

    valid = cycle + timedelta(hours=fhr)
    ax.set_title("")
    fig.text(0.012, 0.955, f"{model.upper()}  {p.label.upper()}", color="#ffffff",
             fontsize=17, fontweight="bold", ha="left", va="center")
    fig.text(0.012, 0.918,
             f"{cycle:%HZ %b %d} run  ·  F{fhr:03d}  ·  valid {valid:%a %b %d %H:%MZ}",
             color="#aab4c8", fontsize=10.5, ha="left", va="center")
    fig.text(0.988, 0.955, "VIP.SSWX.SPACE", color="#8e7ad6", fontsize=11,
             fontweight="bold", ha="right", va="center")

    cb = fig.colorbar(mesh, ax=ax, orientation="horizontal", pad=0.035,
                      fraction=0.045, aspect=60, ticks=p.levels)
    cb.set_label(p.unit, color="#aab4c8", fontsize=9)
    cb.ax.tick_params(colors="#aab4c8", labelsize=8)
    cb.outline.set_edgecolor("#2a3446")

    fig.subplots_adjust(left=0.01, right=0.99, top=0.90, bottom=0.06)
    fig.savefig(out, facecolor=BG, edgecolor="none")
    plt.close(fig)
    return True


# ── Supabase ─────────────────────────────────────────────────────────────────
class Supa:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self.h = {"apikey": key, "Authorization": f"Bearer {key}"}

    def upload(self, path: str, data: bytes) -> str:
        u = f"{self.url}/storage/v1/object/model-maps/{path}"
        r = SESSION.post(u, headers={**self.h, "Content-Type": "image/png",
                                     "x-upsert": "true"}, data=data, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"upload {path}: {r.status_code} {r.text[:180]}")
        return f"{self.url}/storage/v1/object/public/model-maps/{path}"

    def save_run(self, row: dict):
        u = f"{self.url}/rest/v1/model_runs?on_conflict=model,cycle,region"
        r = SESSION.post(u, headers={**self.h, "Content-Type": "application/json",
                                     "Prefer": "resolution=merge-duplicates"},
                         data=json.dumps(row), timeout=60)
        if r.status_code >= 300:
            raise RuntimeError(f"save_run: {r.status_code} {r.text[:200]}")

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


# ── run discovery ────────────────────────────────────────────────────────────
def latest_cycle(model: str, max_back: int = 8) -> datetime | None:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    step = 6 if model == "gfs" else 1
    now = now.replace(hour=(now.hour // step) * step)
    for i in range(max_back):
        c = now - timedelta(hours=i * step)
        if SESSION.head(grib_url(model, c, 0), timeout=30).status_code == 200:
            return c
    return None


def grib_url(model: str, cycle: datetime, fhr: int) -> str:
    if model == "hrrr":
        return (f"{HRRR_BUCKET}/hrrr.{cycle:%Y%m%d}/conus/"
                f"hrrr.t{cycle:%H}z.wrfsfcf{fhr:02d}.grib2")
    return (f"{GFS_BUCKET}/gfs.{cycle:%Y%m%d}/{cycle:%H}/atmos/"
            f"gfs.t{cycle:%H}z.pgrb2.0p25.f{fhr:03d}")


def legend_for(p: Param) -> list[dict]:
    cmap = CMAPS[p.cmap]
    n = len(p.levels)
    return [{"v": lv, "c": matplotlib.colors.to_hex(cmap(i / max(1, n - 1)))}
            for i, lv in enumerate(p.levels)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["hrrr", "gfs"], required=True)
    ap.add_argument("--max-fhr", type=int, default=18)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--keep-runs", type=int, default=8,
                    help="cycles of frames to retain per model (the viewer shows 6)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not a.dry_run and not (url and key):
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        return 2
    supa = None if a.dry_run else Supa(url, key)

    params = HRRR_PARAMS if a.model == "hrrr" else GFS_PARAMS
    step = a.step if a.model == "hrrr" else max(a.step, 3)

    cycle = latest_cycle(a.model)
    if cycle is None:
        print(f"no available {a.model} cycle found", file=sys.stderr)
        return 1
    print(f"{a.model.upper()} cycle {cycle:%Y-%m-%d %HZ}  ->  F000-F{a.max_fhr:03d} step {step}")

    frames: dict[str, list] = {p.key: [] for p in params}
    bytes_pulled = 0

    for fhr in range(0, a.max_fhr + 1, step):
        gurl = grib_url(a.model, cycle, fhr)
        try:
            rows = fetch_index(gurl)
        except Exception as e:  # noqa: BLE001
            print(f"  F{fhr:03d}: index unavailable ({e}) — stopping")
            break
        print(f"  F{fhr:03d}")
        for p in params:
            raw = fetch_record(gurl, rows, p.match)
            if not raw:
                print(f"    - {p.key}: not in index")
                continue
            bytes_pulled += len(raw)
            ds = open_grib(raw)
            if ds is None:
                continue
            out = os.path.join(tempfile.gettempdir(), f"{a.model}_{p.key}_{fhr:03d}.png")
            if not render(ds, p, a.model, cycle, fhr, out):
                continue
            path = f"{a.model}/{cycle:%Y%m%d%H}/{p.key}/F{fhr:03d}.png"
            if supa:
                with open(out, "rb") as fh:
                    supa.upload(path, fh.read())
            os.unlink(out)
            frames[p.key].append({
                "fhr": fhr,
                "valid": (cycle + timedelta(hours=fhr)).isoformat(),
                "path": path,
            })

    rendered = sum(len(v) for v in frames.values())
    print(f"rendered {rendered} frames · pulled {bytes_pulled/1048576:.1f} MB of GRIB "
          f"(full files would have been ~{(a.max_fhr//step + 1) * 140} MB)")
    if rendered == 0:
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
        supa.save_run(row)
        supa.purge(a.keep_runs)
        print("manifest saved; old runs purged")
    else:
        print(json.dumps({**row, "frames": {k: len(v) for k, v in row["frames"].items()}}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
