/**
 * Daylight Tracker.
 *
 * REDESIGNED. The maths were always right and the page never showed them. It
 * opened with a hand-rolled header in the old generic theme, then four tiles
 * carrying emoji — ☀️ 🌙 ⏱️ 📈 — each with its figure in a different colour, a
 * grid of twelve cards setting sunrise and sunset at nine pixels, and a 110px
 * sun arc buried inside a map popup. Five palettes, no hierarchy, and the one
 * drawing that actually showed anything was the smallest thing on the screen.
 *
 * The subject of this module is a shape: the day gets longer, then shorter.
 * So the shape leads. `DayArc` draws the whole twenty-four hours with the sun's
 * path across the daylight in it, and `YearRibbon` puts the twelve months on
 * one baseline so the curve of the year is simply visible — and is also the
 * month picker, so the year view and the control are one object rather than two
 * that have to agree.
 *
 * Every solar calculation below this comment is untouched.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Location } from "../hooks/useLocation";
import { reverseGeocode } from "../utils/weatherApi";
import { MapPin, ChevronLeft, ChevronRight, X, ArrowLeftRight, Sunrise, Sunset } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type * as maplibregl from "maplibre-gl";
import { BaseMap, type BaseMapHandle } from "../components/map/BaseMap";
import { ModuleShell, Panel } from "../components/ModuleShell";
import { DayArc } from "../components/daylight/DayArc";
import { YearRibbon, type YearMonth } from "../components/daylight/YearRibbon";
import { ROYAL, HEADING, prefersReducedMotion } from "../lib/royal";

interface Props { location: Location }

// ─── Solar Calculation (NOAA simplified algorithm) ──────────────────────────
function _jd(year: number, month: number, day: number): number {
  let y = year, m = month;
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day + B - 1524.5
  );
}

function sunTimes(lat: number, lon: number, year: number, month: number, day: number) {
  const d2r = Math.PI / 180;
  const r2d = 180 / Math.PI;
  const JD = _jd(year, month, day);
  const T = (JD - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - T * 0.0001537);
  const C =
    Math.sin(d2r * M) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(d2r * 2 * M) * (0.019993 - 0.000101 * T) +
    Math.sin(d2r * 3 * M) * 0.000289;
  const om = 125.04 - 1934.136 * T;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin(d2r * om);
  const e0 =
    23 +
    (26 +
      (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) /
    60;
  const eps = e0 + 0.00256 * Math.cos(d2r * om);
  const decl = r2d * Math.asin(Math.sin(d2r * eps) * Math.sin(d2r * lam));
  const y2 = Math.tan(d2r * (eps / 2)) ** 2;
  const Mr = d2r * M;
  const L0r = d2r * L0;
  const eot =
    4 *
    r2d *
    (y2 * Math.sin(2 * L0r) -
      2 * 0.016708634 * Math.sin(Mr) +
      4 * 0.016708634 * y2 * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y2 * y2 * Math.sin(4 * L0r) -
      1.25 * 0.016708634 ** 2 * Math.sin(2 * Mr));
  const cosHA =
    (Math.cos(d2r * 90.833) -
      Math.sin(d2r * lat) * Math.sin(d2r * decl)) /
    (Math.cos(d2r * lat) * Math.cos(d2r * decl));
  if (cosHA < -1) return { rise: 0, set: 1440, dl: 1440, polarDay: true, polarNight: false };
  if (cosHA > 1)  return { rise: 720, set: 720, dl: 0, polarDay: false, polarNight: true };
  const ha = r2d * Math.acos(cosHA);
  const noon = 720 - 4 * lon - eot;
  return {
    rise: noon - ha * 4,
    set: noon + ha * 4,
    dl: ha * 8,
    polarDay: false,
    polarNight: false,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function tzOff(lon: number): number { return Math.round(lon / 15); }

/** UTC minutes past midnight → local minutes past midnight, wrapped. */
function localMin(utcMin: number, tzHours: number): number {
  return ((utcMin + tzHours * 60) % 1440 + 1440) % 1440;
}

function fmtTime(utcMin: number, tzHours: number): string {
  const local = ((utcMin + tzHours * 60) % 1440 + 1440) % 1440;
  const h = Math.floor(local / 60);
  const m = Math.floor(local % 60);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function fmtDur(min: number): string {
  if (min >= 1440) return "24h (Polar Day)";
  if (min <= 0) return "0h (Polar Night)";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDelta(min: number): string {
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const s = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (min >= 0 ? "+" : "-") + s;
}

function monthMid(lat: number, lon: number, year: number, mIdx: number) {
  return sunTimes(lat, lon, year, mIdx + 1, 15);
}

function throughMonth(lat: number, lon: number, year: number, mIdx: number) {
  const m = mIdx + 1;
  const last = new Date(year, m, 0).getDate();
  return [1, 10, 20, last].map((d) => ({ day: d, ...sunTimes(lat, lon, year, m, d) }));
}

function yearData(lat: number, lon: number, year: number) {
  return Array.from({ length: 12 }, (_, i) => monthMid(lat, lon, year, i));
}

// Choropleth color: green = gaining daylight, amber = losing
function choroStyle(diffMin: number): { fillColor: string; fillOpacity: number } {
  const t = Math.max(-1, Math.min(1, diffMin / 180));
  // Champagne for latitudes gaining light, periwinkle for those losing it. It
  // was spring green against amber, two hues that appear nowhere else in the
  // app and read as a traffic light rather than as a direction.
  if (t >= 0) return { fillColor: "#d9b775", fillOpacity: 0.06 + t * 0.40 };
  return { fillColor: "#ccccff", fillOpacity: 0.06 + (-t) * 0.40 };
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Sun arc, small ──────────────────────────────────────────────────────────
/**
 * The compact arc used inside the map popup. Same drawing as `DayArc`, reduced
 * to what survives at 280px: horizon, path, endpoints. Its old gradient ran
 * orange → amber → indigo, three hues from outside this app's palette; it is
 * champagne into periwinkle now, which is sunrise into night in the colours the
 * rest of the page already uses.
 */
function SunArcSvg({ riseMin, setMin }: { riseMin: number; setMin: number }) {
  const W = 280, H = 110;
  const groundY = H - 16;
  const xOf = (m: number) => Math.max(0, Math.min(W, (m / 1440) * W));
  const rX = xOf(riseMin), sX = xOf(setMin);
  const apexX = (rX + sX) / 2, apexY = 16;
  const cpY = apexY - 4;
  const arc = `M ${rX} ${groundY} C ${rX + (apexX - rX) * 0.5} ${cpY} ${sX - (sX - apexX) * 0.5} ${cpY} ${sX} ${groundY}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 104 }}>
      <defs>
        <linearGradient id="arcG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={ROYAL.gold} />
          <stop offset="55%" stopColor="#e6d2a8" />
          <stop offset="100%" stopColor={ROYAL.iris} />
        </linearGradient>
      </defs>
      {rX > 0 && <rect x="0" y="0" width={rX} height={groundY} fill="rgba(204,204,255,0.05)" />}
      {sX < W && <rect x={sX} y="0" width={W - sX} height={groundY} fill="rgba(204,204,255,0.05)" />}
      <line x1="0" y1={groundY} x2={W} y2={groundY} stroke="rgba(204,204,255,0.16)" strokeWidth="1" />
      <path d={arc} stroke="url(#arcG)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx={rX} cy={groundY} r="4" fill={ROYAL.ink} stroke={ROYAL.gold} strokeWidth="2" />
      <circle cx={sX} cy={groundY} r="4" fill={ROYAL.ink} stroke={ROYAL.iris} strokeWidth="2" />
      <circle cx={apexX} cy={apexY + 2} r="4.5" fill={ROYAL.gold}
              style={{ filter: `drop-shadow(0 0 6px ${ROYAL.goldSoft})` }} />
    </svg>
  );
}

// ─── Map popup ───────────────────────────────────────────────────────────────
interface PopupData { lat: number; lon: number; name: string }

/**
 * A location's daylight, on the map.
 *
 * The old one packed six sections into 320px at seven, eight and nine pixels —
 * a size at which a table of times is decoration rather than information — and
 * coloured them from a palette the rest of the app does not use. It also mapped
 * rows into an unkeyed fragment, which React warns about on every render.
 *
 * Same six sections, set so they can be read, in the page's own colours, with
 * the year strip doubling as the month control the way the ribbon below does.
 */
function MapPopupPanel({
  data, year, monthIdx, onClose, onMonthChange,
}: {
  data: PopupData; year: number; monthIdx: number;
  onClose: () => void; onMonthChange: (i: number) => void;
}) {
  const tz = tzOff(data.lon);
  const mid = monthMid(data.lat, data.lon, year, monthIdx);
  const prevIdx = (monthIdx - 1 + 12) % 12;
  const prevMid = monthMid(data.lat, data.lon, year, prevIdx);
  const delta = mid.dl - prevMid.dl;
  const pctDay = Math.round((mid.dl / 1440) * 100);
  const thru = throughMonth(data.lat, data.lon, year, monthIdx);
  const yr = yearData(data.lat, data.lon, year);
  const maxDl = Math.max(...yr.map((d) => d.dl));
  const longestIdx = yr.findIndex((d) => d.dl === maxDl);
  const minDl = Math.min(...yr.map((d) => d.dl));
  const shortestIdx = yr.findIndex((d) => d.dl === minDl);
  const gaining = delta >= 0;

  return (
    <div
      className="absolute bottom-3 left-3 right-3 md:left-auto md:right-3 md:w-[21rem] rounded-2xl overflow-hidden"
      style={{
        zIndex: 10,
        background: "rgba(9,9,21,0.94)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${ROYAL.hairline}`,
        boxShadow: "0 30px 60px -30px rgba(0,0,0,0.95)",
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <div className="flex items-start justify-between gap-2 px-3.5 pt-3.5 pb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight truncate"
               style={{ fontFamily: HEADING, color: ROYAL.text }}>{data.name}</div>
          <div className="text-[11px] tabular-nums mt-0.5" style={{ color: ROYAL.dim }}>
            {Math.abs(data.lat).toFixed(2)}°{data.lat >= 0 ? "N" : "S"}
            {"  "}
            {Math.abs(data.lon).toFixed(2)}°{data.lon >= 0 ? "E" : "W"}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close"
                className="shrink-0 p-1 rounded-md transition-colors hover:bg-white/10"
                style={{ color: ROYAL.dim }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-3.5 pb-1">
        <button onClick={() => onMonthChange((monthIdx - 1 + 12) % 12)} aria-label="Previous month"
                className="w-6 h-6 grid place-items-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: ROYAL.dim }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[11px] uppercase tracking-[0.22em] font-semibold"
              style={{ color: ROYAL.gold }}>{MONTH_FULL[monthIdx]}</span>
        <span className="ml-auto text-[11px] tabular-nums"
              style={{ color: gaining ? ROYAL.gold : ROYAL.iris }}>
          {fmtDelta(delta)} vs {MONTHS[prevIdx]}
        </span>
        <button onClick={() => onMonthChange((monthIdx + 1) % 12)} aria-label="Next month"
                className="w-6 h-6 grid place-items-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: ROYAL.dim }}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3.5 py-1">
        <SunArcSvg riseMin={mid.rise} setMin={mid.set} />
      </div>

      <div className="grid grid-cols-3 gap-2 px-3.5 pb-2.5">
        {[
          { label: "Sunrise", value: mid.polarNight ? "—" : fmtTime(mid.rise, tz), color: ROYAL.gold },
          { label: "Sunset", value: mid.polarNight ? "—" : fmtTime(mid.set, tz), color: ROYAL.iris },
          { label: "Daylight", value: fmtDur(mid.dl), color: ROYAL.text },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: ROYAL.dim }}>{s.label}</div>
            <div className="text-[13px] font-semibold tabular-nums mt-0.5" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="px-3.5 pb-3">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(204,204,255,0.08)" }}>
          <div style={{ width: `${pctDay}%`, height: "100%",
                        background: `linear-gradient(90deg, ${ROYAL.gold}, rgba(217,183,117,0.55))` }} />
        </div>
        <div className="flex justify-between mt-1 text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
          <span>{pctDay}% day</span><span>{100 - pctDay}% night</span>
        </div>
      </div>

      <div className="px-3.5 py-2.5 border-t" style={{ borderColor: ROYAL.hairline }}>
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1.5" style={{ color: ROYAL.dim }}>
          Through the month
        </div>
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr>
              {["Date", "Rise", "Set", "Length"].map((h) => (
                <th key={h} className="text-left font-medium pb-1"
                    style={{ color: ROYAL.dim, opacity: 0.8 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {thru.map((row) => (
              <tr key={row.day}>
                <td style={{ color: ROYAL.text }}>
                  {MONTHS[monthIdx].slice(0, 1)}{MONTHS[monthIdx].slice(1, 3).toLowerCase()} {row.day}
                </td>
                <td style={{ color: ROYAL.gold }}>{row.polarNight ? "—" : fmtTime(row.rise, tz)}</td>
                <td style={{ color: ROYAL.iris }}>{row.polarNight ? "—" : fmtTime(row.set, tz)}</td>
                <td style={{ color: ROYAL.text }}>{fmtDur(row.dl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3.5 pb-3.5 pt-2.5 border-t" style={{ borderColor: ROYAL.hairline }}>
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: ROYAL.dim }}>
          The year here
        </div>
        <div className="flex items-end gap-0.5 h-9">
          {yr.map((d, i) => (
            <button
              key={i}
              onClick={() => onMonthChange(i)}
              title={`${MONTHS[i]}: ${fmtDur(d.dl)}`}
              className="flex-1 flex items-end h-full"
            >
              <span
                className="block w-full rounded-sm transition-colors"
                style={{
                  height: `${Math.max(12, Math.round((d.dl / maxDl) * 100))}%`,
                  background: i === monthIdx ? ROYAL.gold : "rgba(204,204,255,0.22)",
                }}
              />
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[9px]" style={{ color: ROYAL.dim }}>
          {MONTHS.map((m, i) => (
            <span key={m} style={{ color: i === monthIdx ? ROYAL.gold : undefined }}>{m[0]}</span>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
          <span>Longest <span style={{ color: ROYAL.text }}>{MONTHS[longestIdx]} {fmtDur(maxDl)}</span></span>
          <span>Shortest <span style={{ color: ROYAL.text }}>{MONTHS[shortestIdx]} {fmtDur(minDl)}</span></span>
        </div>
      </div>
    </div>
  );
}

// ─── Daylight choropleth, on the shared MapLibre base ────────────────────────
/**
 * Seventy latitude bands, each shaded by how much daylight that latitude gains
 * or loses between the middle of last month and the middle of this one. It was
 * seventy Leaflet rectangles redrawn from scratch on every month change; it is
 * now one GeoJSON source whose fills are driven by feature properties, so
 * changing month is a `setData` rather than a teardown.
 */
function DaylightMap({
  lat, lon, year, monthIdx, onMonthChange,
}: {
  lat: number; lon: number; year: number; monthIdx: number;
  onMonthChange: (i: number) => void;
}) {
  const handle = useRef<BaseMapHandle>(null);
  const monthIdxRef = useRef(monthIdx);
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [popupMonth, setPopupMonth] = useState(monthIdx);
  const [ready, setReady] = useState(false);

  useEffect(() => { monthIdxRef.current = monthIdx; }, [monthIdx]);

  /** The band collection for one month — pure, so it memoises cleanly. */
  const bands = useMemo<GeoJSON.FeatureCollection>(() => {
    const prevM = ((monthIdx - 1 + 12) % 12) + 1;
    const curM = monthIdx + 1;
    const features: GeoJSON.Feature[] = [];
    for (let lb = -66; lb < 74; lb += 2) {
      const latMid = lb + 1;
      const cur = sunTimes(latMid, 0, year, curM, 15);
      const prv = sunTimes(latMid, 0, year, prevM, 15);
      const { fillColor, fillOpacity } = choroStyle(cur.dl - prv.dl);
      features.push({
        type: "Feature",
        properties: { fillColor, fillOpacity },
        geometry: {
          type: "Polygon",
          coordinates: [[[-180, lb], [180, lb], [180, lb + 2], [-180, lb + 2], [-180, lb]]],
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [monthIdx, year]);

  const you = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }],
  }), [lat, lon]);

  function onReady(map: maplibregl.Map, beneath: string | undefined) {
    map.addSource("daylight-bands", { type: "geojson", data: bands });
    map.addLayer({
      id: "daylight-bands",
      type: "fill",
      source: "daylight-bands",
      paint: { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "fillOpacity"] },
    }, beneath);

    map.addSource("daylight-you", { type: "geojson", data: you });
    map.addLayer({
      id: "daylight-you-glow",
      type: "circle",
      source: "daylight-you",
      paint: { "circle-radius": 15, "circle-color": "#d9b775", "circle-opacity": 0.22, "circle-blur": 0.8 },
    });
    map.addLayer({
      id: "daylight-you",
      type: "circle",
      source: "daylight-you",
      paint: {
        "circle-radius": 6, "circle-color": "#d9b775",
        "circle-stroke-color": "#070713", "circle-stroke-width": 2,
      },
    });

    map.on("click", (e) => {
      const { lat: clat, lng: clon } = e.lngLat;
      setPopup({
        lat: clat, lon: clon,
        name: `${Math.abs(clat).toFixed(2)}°${clat >= 0 ? "N" : "S"}, ${Math.abs(clon).toFixed(2)}°${clon >= 0 ? "E" : "W"}`,
      });
      setPopupMonth(monthIdxRef.current);
      void reverseGeocode(clat, clon).then((name) => setPopup((prev) => (prev ? { ...prev, name } : prev)));
    });

    setReady(true);
  }

  // Month change is a data swap, not a rebuild.
  useEffect(() => {
    if (!ready) return;
    const src = handle.current?.map()?.getSource("daylight-bands") as maplibregl.GeoJSONSource | undefined;
    src?.setData(bands);
  }, [bands, ready]);

  useEffect(() => {
    if (!ready) return;
    const src = handle.current?.map()?.getSource("daylight-you") as maplibregl.GeoJSONSource | undefined;
    src?.setData(you);
  }, [you, ready]);

  return (
    // `isolate` creates a stacking context around the map so the overlay chrome
    // below can never escape above the app sidebar.
    <div className="relative isolate overflow-hidden" style={{ height: 440 }}>
      {/* The month strip. Champagne on the selected month, to match the ribbon
          below, so the two controls plainly drive the same thing. */}
      <div className="absolute top-2.5 left-0 right-0 z-[5] flex justify-center pointer-events-none px-2">
        <div className="flex gap-0.5 pointer-events-auto rounded-xl px-1.5 py-1 max-w-full overflow-x-auto"
             style={{
               background: "rgba(9,9,21,0.9)",
               backdropFilter: "blur(10px)",
               WebkitBackdropFilter: "blur(10px)",
               border: `1px solid ${ROYAL.hairline}`,
             }}>
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => onMonthChange(i)}
              aria-pressed={i === monthIdx}
              className="text-[10px] md:text-[11px] font-semibold px-1.5 md:px-2 py-1 rounded-lg
                         transition-colors shrink-0 hover:bg-white/10"
              style={{
                background: i === monthIdx ? ROYAL.gold : "transparent",
                color: i === monthIdx ? ROYAL.ink : ROYAL.dim,
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <BaseMap
        ref={handle}
        center={{ lat, lon }}
        zoom={3.2}
        height="100%"
        className="w-full h-full"
        onReady={onReady}
      />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[5] rounded-xl px-3 py-2"
           style={{
             background: "rgba(9,9,21,0.9)",
             backdropFilter: "blur(10px)",
             WebkitBackdropFilter: "blur(10px)",
             border: `1px solid ${ROYAL.hairline}`,
           }}>
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1.5" style={{ color: ROYAL.dim }}>
          Change this month
        </div>
        <div className="w-28 h-2 rounded-full"
             style={{ background: "linear-gradient(90deg, rgba(204,204,255,0.85), rgba(255,255,255,0.06) 50%, rgba(217,183,117,0.9))" }} />
        <div className="flex justify-between text-[10px] tabular-nums mt-1" style={{ color: ROYAL.dim }}>
          <span>losing</span><span>0</span><span>gaining</span>
        </div>
      </div>

      {/* Popup */}
      {popup && (
        <MapPopupPanel
          data={popup}
          year={year}
          monthIdx={popupMonth}
          onClose={() => setPopup(null)}
          onMonthChange={setPopupMonth}
        />
      )}
    </div>
  );
}


// ─── The page ────────────────────────────────────────────────────────────────
export default function DaylightTracker({ location }: Props) {
  const still = prefersReducedMotion();
  const year = new Date().getFullYear();
  const curMonthIdx = new Date().getMonth();
  const [monthIdx, setMonthIdx] = useState(curMonthIdx);

  const { lat, lon, name } = location;
  const tz = tzOff(lon);

  const yr = useMemo(() => yearData(lat, lon, year), [lat, lon, year]);
  const maxDl = Math.max(...yr.map((d) => d.dl));
  const minDl = Math.min(...yr.map((d) => d.dl));
  const longestIdx = yr.findIndex((d) => d.dl === maxDl);
  const shortestIdx = yr.findIndex((d) => d.dl === minDl);
  const annualSwing = maxDl - minDl;

  const cur = yr[monthIdx];
  const prevIdx = (monthIdx - 1 + 12) % 12;
  const delta = cur.dl - yr[prevIdx].dl;

  const ribbon: YearMonth[] = yr.map((d, i) => ({
    short: MONTHS[i],
    minutes: d.dl,
    lengthLabel: fmtDur(d.dl),
    deltaLabel: fmtDelta(d.dl - yr[(i - 1 + 12) % 12].dl),
  }));

  const chartData = yr.map((d, i) => ({
    month: MONTHS[i],
    dl: Math.round(d.dl),
    delta: Math.round(d.dl - yr[(i - 1 + 12) % 12].dl),
    rise: d.polarNight ? "—" : fmtTime(d.rise, tz),
    set: d.polarNight ? "—" : fmtTime(d.set, tz),
    isActive: i === monthIdx,
  }));

  return (
    <ModuleShell
      wide
      eyebrow="Solar geometry · computed on this device"
      title="Daylight Tracker"
      subtitle="How the length of the day changes through the year, anywhere on earth. Sunrise and sunset are computed from the NOAA solar position algorithm, not fetched."
      status={
        <div className="relative rounded-2xl overflow-hidden px-4 py-3 flex items-center gap-4 flex-wrap"
             style={{
               border: `1px solid ${ROYAL.hairline}`,
               background: `linear-gradient(180deg, rgba(18,18,34,0.72), rgba(10,10,22,0.72))`,
             }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
          <MapPin className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate"
                 style={{ fontFamily: HEADING, color: ROYAL.text }}>{name}</div>
            <div className="text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
              {Math.abs(lat).toFixed(2)}°{lat >= 0 ? "N" : "S"}, {Math.abs(lon).toFixed(2)}°{lon >= 0 ? "E" : "W"}
              {" · "}search above to change it
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2.5 shrink-0">
            <ArrowLeftRight className="w-4 h-4" style={{ color: ROYAL.dim }} />
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>
                Annual swing
              </div>
              <div className="text-sm font-semibold tabular-nums" style={{ color: ROYAL.text }}>
                {fmtDur(annualSwing)}
              </div>
            </div>
          </div>
        </div>
      }
    >
      <DayArc
        // LOCAL minutes, not the UTC ones `sunTimes` returns. Handing the raw
        // values straight to the drawing put Denver's sunrise at half past
        // twelve in the afternoon — the arc was correct and sitting seven hours
        // to the right of where the labels underneath it said it was.
        riseMin={localMin(cur.rise, tz)}
        setMin={localMin(cur.set, tz)}
        polarDay={!!cur.polarDay}
        polarNight={!!cur.polarNight}
        riseLabel={cur.polarNight ? "Does not rise" : cur.polarDay ? "Always up" : fmtTime(cur.rise, tz)}
        setLabel={cur.polarNight ? "Does not rise" : cur.polarDay ? "Never sets" : fmtTime(cur.set, tz)}
        lengthLabel={fmtDur(cur.dl)}
        deltaLabel={fmtDelta(delta)}
        deltaUp={delta >= 0}
        deltaCaption={`vs ${MONTHS[prevIdx]}`}
        monthLabel={`${MONTH_FULL[monthIdx]}${monthIdx === curMonthIdx ? " · this month" : ""}`}
        still={still}
      />

      <YearRibbon
        months={ribbon}
        selected={monthIdx}
        longest={longestIdx}
        shortest={shortestIdx}
        onSelect={setMonthIdx}
        still={still}
      />

      <Panel title="Where the light is changing"
             aside={<span className="text-[11px]" style={{ color: ROYAL.dim }}>Tap anywhere for that latitude</span>}
             padded={false}>
        <DaylightMap lat={lat} lon={lon} year={year} monthIdx={monthIdx} onMonthChange={setMonthIdx} />
      </Panel>

      <Panel title="Month by month" defer
             aside={
               <span className="text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
                 {Math.abs(lat).toFixed(1)}°{lat >= 0 ? "N" : "S"}, {Math.abs(lon).toFixed(1)}°{lon >= 0 ? "E" : "W"}
               </span>
             }>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 620 }}>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: ROYAL.dim, fontWeight: 600 }}
                       tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false} axisLine={false}
                       tickFormatter={(v) => `${Math.floor(v / 60)}h`} domain={[0, maxDl + 60]} width={34} />
                <Tooltip
                  cursor={{ fill: "rgba(204,204,255,0.05)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="rounded-xl px-3 py-2 text-[11px] space-y-0.5 tabular-nums"
                           style={{ background: "rgba(9,9,21,0.96)", border: `1px solid ${ROYAL.hairline}` }}>
                        <div className="font-semibold" style={{ color: ROYAL.text, fontFamily: HEADING }}>{label}</div>
                        <div style={{ color: ROYAL.text }}>{fmtDur(d.dl)}</div>
                        <div style={{ color: d.delta >= 0 ? ROYAL.gold : ROYAL.iris }}>{fmtDelta(d.delta)}</div>
                        <div className="flex items-center gap-1.5" style={{ color: ROYAL.gold }}>
                          <Sunrise className="w-3 h-3" /> {d.rise}
                        </div>
                        <div className="flex items-center gap-1.5" style={{ color: ROYAL.iris }}>
                          <Sunset className="w-3 h-3" /> {d.set}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="dl" radius={[4, 4, 0, 0]} onClick={(_, i) => setMonthIdx(i)}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} cursor="pointer"
                          fill={entry.isActive ? ROYAL.gold : "rgba(204,204,255,0.2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: ROYAL.dim }}>
          Times are local to the longitude shown, to the nearest hour of offset — close enough to plan around,
          and not a substitute for a clock that knows about daylight saving.
        </p>
      </Panel>
    </ModuleShell>
  );
}
