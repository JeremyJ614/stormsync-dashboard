/**
 * DaylightTracker — VIP Forecasts & Alerts
 * Replaces "Local Summary" — full daylight information page
 * Inspired by Max Velocity's daylight page, restyled for StormSync
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Location } from "../hooks/useLocation";
import { reverseGeocode } from "../utils/weatherApi";
import { MapPin, ChevronLeft, ChevronRight, X, Sun, ArrowLeftRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type maplibregl from "maplibre-gl";
import { BaseMap, type BaseMapHandle } from "../components/map/BaseMap";

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
  if (t >= 0) return { fillColor: "#4ade80", fillOpacity: 0.08 + t * 0.42 };
  return { fillColor: "#fbbf24", fillOpacity: 0.08 + (-t) * 0.42 };
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Sun Arc SVG ─────────────────────────────────────────────────────────────
function SunArcSvg({ riseMin, setMin }: { riseMin: number; setMin: number }) {
  const W = 280, H = 120;
  const groundY = H - 14;
  const xOf = (m: number) => Math.max(0, Math.min(W, (m / 1440) * W));
  const rX = xOf(riseMin), sX = xOf(setMin);
  const apexX = (rX + sX) / 2, apexY = 14;
  const cpY = apexY - 4;
  const arc = `M ${rX} ${groundY} C ${rX + (apexX - rX) * 0.5} ${cpY} ${sX - (sX - apexX) * 0.5} ${cpY} ${sX} ${groundY}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 110 }}>
      <defs>
        <linearGradient id="arcG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <line x1="0" y1={groundY} x2={W} y2={groundY} stroke="rgba(204,204,255,0.1)" strokeWidth="1" />
      {rX > 0 && <line x1="0" y1={groundY} x2={rX} y2={groundY} stroke="rgba(148,163,184,0.2)" strokeWidth="1.5" strokeDasharray="3 3" />}
      <path d={arc} stroke="url(#arcG)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {sX < W && <line x1={sX} y1={groundY} x2={W} y2={groundY} stroke="rgba(148,163,184,0.2)" strokeWidth="1.5" strokeDasharray="3 3" />}
      <circle cx={rX} cy={groundY} r="4" fill="#f97316" />
      <circle cx={sX} cy={groundY} r="4" fill="#818cf8" />
      <circle cx={apexX} cy={apexY + 2} r="5" fill="#fbbf24" style={{ filter: "drop-shadow(0 0 4px #fbbf24)" }} />
    </svg>
  );
}

// ─── Map Popup Panel ─────────────────────────────────────────────────────────
interface PopupData { lat: number; lon: number; name: string }

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

  return (
    <div
      className="absolute bottom-3 left-3 right-3 md:left-auto md:right-3 md:w-80 rounded-2xl overflow-hidden shadow-2xl"
      style={{ zIndex: 1000, background: "hsl(232 22% 8%)", border: "1px solid rgba(204,204,255,0.18)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-3 pt-3 pb-1">
        <div>
          <div className="font-bold text-sm text-white leading-tight truncate max-w-[220px]">{data.name}</div>
          <div className="text-[10px] text-[#A3A3CC] mt-0.5">
            {Math.abs(data.lat).toFixed(2)}°{data.lat >= 0 ? "N" : "S"} &nbsp;
            {Math.abs(data.lon).toFixed(2)}°{data.lon >= 0 ? "E" : "W"}
          </div>
        </div>
        <button onClick={onClose} className="ml-2 shrink-0 text-[#A3A3CC] hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Month nav + delta */}
      <div className="flex items-center gap-2 px-3 pb-1">
        <button onClick={() => onMonthChange((monthIdx - 1 + 12) % 12)} className="w-5 h-5 flex items-center justify-center rounded text-[#A3A3CC] hover:text-white hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="font-bold text-sm text-white tracking-wide">{MONTH_FULL[monthIdx].toUpperCase()}</span>
        <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${delta >= 0 ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}`}>
          {fmtDelta(delta)} vs {MONTHS[prevIdx]}
        </span>
        <button onClick={() => onMonthChange((monthIdx + 1) % 12)} className="ml-auto w-5 h-5 flex items-center justify-center rounded text-[#A3A3CC] hover:text-white hover:bg-white/10 transition-colors">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sun arc */}
      <div className="px-3 py-1">
        <SunArcSvg riseMin={mid.rise} setMin={mid.set} />
      </div>

      {/* Time stats */}
      <div className="grid grid-cols-3 px-3 pb-2 gap-1">
        {[
          { label: "SUNRISE", value: mid.polarNight ? "—" : fmtTime(mid.rise, tz), color: "#f97316" },
          { label: "SUNSET",  value: mid.polarNight ? "—" : fmtTime(mid.set, tz),  color: "#818cf8" },
          { label: "DAYLIGHT",value: fmtDur(mid.dl),                                color: "#ffffff" },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-[8px] text-[#6b7280] uppercase tracking-wider">{s.label}</div>
            <div className="text-xs font-bold mt-0.5" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Day/Night bar */}
      <div className="px-3 pb-2">
        <div className="flex rounded-full overflow-hidden h-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div style={{ width: `${pctDay}%`, background: "linear-gradient(90deg, #f97316, #fbbf24)" }} />
        </div>
        <div className="flex justify-between mt-0.5 text-[8px] text-[#6b7280]">
          <span>{pctDay}% day</span><span>{100 - pctDay}% night</span>
        </div>
      </div>

      {/* Through the month */}
      <div className="px-3 py-2 border-t border-[rgba(204,204,255,0.07)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] text-[#6b7280] uppercase tracking-wider font-semibold">Through the Month</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${delta >= 0 ? "text-green-400 bg-green-500/15" : "text-amber-400 bg-amber-500/15"}`}>
            {fmtDelta(delta)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-x-1 gap-y-1">
          {["DATE","RISE","SET","DAYLIGHT"].map((h) => (
            <div key={h} className="text-[8px] text-[#4b5563] uppercase font-semibold">{h}</div>
          ))}
          {thru.map((row) => (
            <>
              <div key={`d${row.day}`} className="text-[9px] text-white">{MONTHS[monthIdx].slice(0,1)}{MONTHS[monthIdx].slice(1,3).toLowerCase()} {row.day}</div>
              <div key={`r${row.day}`} className="text-[9px] text-[#f97316]">{row.polarNight ? "—" : fmtTime(row.rise, tz)}</div>
              <div key={`s${row.day}`} className="text-[9px] text-[#818cf8]">{row.polarNight ? "—" : fmtTime(row.set, tz)}</div>
              <div key={`l${row.day}`} className="text-[9px] text-white">{fmtDur(row.dl)}</div>
            </>
          ))}
        </div>
      </div>

      {/* Year overview */}
      <div className="px-3 pb-3 pt-2 border-t border-[rgba(204,204,255,0.07)]">
        <div className="text-[9px] text-[#6b7280] uppercase tracking-wider mb-2">Year Overview</div>
        <div className="flex items-end gap-0.5 h-7">
          {yr.map((d, i) => (
            <button
              key={i}
              onClick={() => onMonthChange(i)}
              title={`${MONTHS[i]}: ${fmtDur(d.dl)}`}
              className="flex-1 flex flex-col items-center justify-end h-full"
            >
              <div
                className="w-full rounded-sm transition-opacity"
                style={{
                  height: `${Math.max(10, Math.round((d.dl / maxDl) * 100))}%`,
                  background:
                    i === monthIdx
                      ? "#CCCCFF"
                      : i === longestIdx
                      ? "#4ade80"
                      : i === shortestIdx
                      ? "#f97316"
                      : "rgba(204,204,255,0.28)",
                  opacity: i === monthIdx ? 1 : 0.65,
                }}
              />
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[7px] text-[#4b5563]">
          {MONTHS.map((m) => <span key={m}>{m[0]}</span>)}
        </div>
        <div className="flex justify-between mt-1.5 text-[8px]">
          <span className="text-white">Longest: <span className="text-green-400">{MONTHS[longestIdx]} {fmtDur(maxDl)}</span></span>
          <span className="text-white">Shortest: <span className="text-amber-400">{MONTHS[shortestIdx]} {fmtDur(minDl)}</span></span>
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
      paint: { "circle-radius": 14, "circle-color": "#CCCCFF", "circle-opacity": 0.18, "circle-blur": 0.8 },
    });
    map.addLayer({
      id: "daylight-you",
      type: "circle",
      source: "daylight-you",
      paint: {
        "circle-radius": 7, "circle-color": "#CCCCFF",
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
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
    <div className="relative isolate rounded-xl overflow-hidden border border-[rgba(204,204,255,0.12)]" style={{ height: 420 }}>
      {/* Month toggle strip */}
      <div className="absolute top-2 left-0 right-0 z-[5] flex justify-center pointer-events-none">
        <div className="flex gap-0.5 pointer-events-auto bg-[rgba(9,9,21,0.88)] backdrop-blur-sm rounded-lg px-1.5 py-1 border border-[rgba(204,204,255,0.13)]">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => onMonthChange(i)}
              className={`text-[9px] md:text-[10px] font-bold px-1 md:px-1.5 py-0.5 md:py-1 rounded transition-all ${
                i === monthIdx ? "bg-[#CCCCFF] text-[#090915]" : "text-[#A3A3CC] hover:text-white hover:bg-white/10"
              }`}
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
      <div className="absolute bottom-3 left-3 z-[5] bg-[rgba(9,9,21,0.88)] backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-[rgba(204,204,255,0.1)]">
        <div className="text-[8px] text-[#6b7280] uppercase tracking-wider mb-1 font-semibold">Daylight Change</div>
        <div className="w-20 h-2 rounded-full" style={{ background: "linear-gradient(90deg, rgba(251,191,36,0.9) 0%, rgba(255,255,255,0.08) 50%, rgba(74,222,128,0.9) 100%)" }} />
        <div className="flex justify-between text-[7px] text-[#6b7280] mt-0.5">
          <span>-3h</span><span>0</span><span>+3h</span>
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


// ─── Main Daylight Tracker Page ──────────────────────────────────────────────
export default function DaylightTracker({ location }: Props) {
  const year = new Date().getFullYear();
  const curMonthIdx = new Date().getMonth();
  const [monthIdx, setMonthIdx] = useState(curMonthIdx);

  const { lat, lon, name } = location;
  const tz = tzOff(lon);

  // Compute full year data for the selected location
  const yr = yearData(lat, lon, year);
  const maxDl = Math.max(...yr.map((d) => d.dl));
  const minDl = Math.min(...yr.map((d) => d.dl));
  const longestIdx = yr.findIndex((d) => d.dl === maxDl);
  const shortestIdx = yr.findIndex((d) => d.dl === minDl);
  const annualSwing = maxDl - minDl;

  // Current month stats
  const cur = yr[monthIdx];
  const prevIdx = (monthIdx - 1 + 12) % 12;
  const prevCur = yr[prevIdx];
  const delta = cur.dl - prevCur.dl;
  const pctDay = Math.round((cur.dl / 1440) * 100);

  // Chart data
  const chartData = yr.map((d, i) => ({
    month: MONTHS[i],
    dl: Math.round(d.dl),
    delta: Math.round(d.dl - yr[(i - 1 + 12) % 12].dl),
    rise: d.polarNight ? "—" : fmtTime(d.rise, tz),
    set: d.polarNight ? "—" : fmtTime(d.set, tz),
    isActive: i === monthIdx,
  }));

  const TOOLTIP_STYLE = {
    background: "hsl(232 20% 10%)",
    border: "1px solid hsl(232 18% 16%)",
    borderRadius: 8,
    fontSize: 11,
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sun className="w-5 h-5 text-[#fbbf24]" />
          <h2 className="text-xl font-bold tracking-wide">Daylight Tracker</h2>
        </div>
        <div className="text-xs text-muted-foreground hidden md:block">
          See how daylight changes through the year for any location
        </div>
      </div>

      {/* Location bar */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
        <div className="w-7 h-7 rounded-full bg-[rgba(204,204,255,0.1)] border border-[rgba(204,204,255,0.2)] flex items-center justify-center shrink-0">
          <MapPin className="w-3.5 h-3.5 text-[#CCCCFF]" />
        </div>
        <div>
          <div className="font-semibold text-sm text-white leading-tight">{name}</div>
          <div className="text-xs text-muted-foreground">
            {Math.abs(lat).toFixed(2)}°{lat >= 0 ? "N" : "S"}, {Math.abs(lon).toFixed(2)}°{lon >= 0 ? "E" : "W"}
          </div>
        </div>
        <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
          Use the search bar above to change location
        </div>
      </div>

      {/* Interactive Map */}
      <DaylightMap
        lat={lat} lon={lon} year={year}
        monthIdx={monthIdx} onMonthChange={setMonthIdx}
      />

      {/* ── Daylight Breakdown ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold tracking-wide uppercase">Daylight Breakdown</h3>
          <div className="text-sm text-muted-foreground">{name}</div>
        </div>

        {/* Current Month Hero Card */}
        <div
          className="rounded-2xl border p-5"
          style={{ background: "hsl(232 20% 11%)", borderColor: "rgba(204,204,255,0.18)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-[#CCCCFF]" />
            <span className="font-bold text-sm text-white">
              {MONTH_FULL[monthIdx].toUpperCase()} — {monthIdx === curMonthIdx ? "CURRENT MONTH" : "SELECTED MONTH"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[rgba(255,255,255,0.04)] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">☀️</span>
                <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">Sunrise</span>
              </div>
              <div className="text-2xl font-bold text-[#f97316]">
                {cur.polarNight ? "Polar Night" : cur.polarDay ? "Never sets" : fmtTime(cur.rise, tz)}
              </div>
            </div>
            <div className="bg-[rgba(255,255,255,0.04)] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">🌙</span>
                <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">Sunset</span>
              </div>
              <div className="text-2xl font-bold text-[#818cf8]">
                {cur.polarNight ? "Polar Night" : cur.polarDay ? "Never rises" : fmtTime(cur.set, tz)}
              </div>
            </div>
            <div className="bg-[rgba(255,255,255,0.04)] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">⏱️</span>
                <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">Total Daylight</span>
              </div>
              <div className="text-2xl font-bold text-white">{fmtDur(cur.dl)}</div>
            </div>
            <div className="bg-[rgba(255,255,255,0.04)] rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`text-base`}>{delta >= 0 ? "📈" : "📉"}</span>
                <span className="text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">
                  vs {MONTHS[prevIdx]}
                </span>
              </div>
              <div className={`text-2xl font-bold ${delta >= 0 ? "text-green-400" : "text-amber-400"}`}>
                {fmtDelta(delta)}
              </div>
            </div>
          </div>
          {/* Day/Night bar */}
          <div className="flex rounded-full overflow-hidden h-3" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div style={{ width: `${pctDay}%`, background: "linear-gradient(90deg, #f97316, #fbbf24)" }} className="rounded-full" />
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>{pctDay}% daylight</span>
            <span>{100 - pctDay}% darkness</span>
          </div>
        </div>

        {/* Monthly Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {yr.map((d, i) => {
            const prevD = yr[(i - 1 + 12) % 12];
            const dlt = d.dl - prevD.dl;
            const isActive = i === monthIdx;
            const isLongest = i === longestIdx;
            const isShortest = i === shortestIdx;
            const barPct = Math.round((d.dl / maxDl) * 100);
            return (
              <button
                key={i}
                onClick={() => setMonthIdx(i)}
                className={`text-left rounded-xl p-3 border transition-all ${
                  isActive
                    ? "border-[#CCCCFF]/50 bg-[rgba(204,204,255,0.08)]"
                    : "border-border bg-card hover:border-[rgba(204,204,255,0.25)] hover:bg-[rgba(204,204,255,0.04)]"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-bold ${isActive ? "text-[#CCCCFF]" : "text-foreground"}`}>
                    {MONTHS[i]}
                  </span>
                  <div
                    className="h-1.5 rounded-full flex-1 ml-2"
                    style={{
                      background: isActive
                        ? "#CCCCFF"
                        : isLongest
                        ? "#4ade80"
                        : isShortest
                        ? "#f97316"
                        : "rgba(204,204,255,0.2)",
                      width: `${barPct}%`,
                      maxWidth: "100%",
                    }}
                  />
                </div>
                <div className="text-sm font-bold text-white">{fmtDur(d.dl)}</div>
                <div className={`text-xs font-semibold mt-0.5 ${dlt >= 0 ? "text-green-400" : "text-amber-400"}`}>
                  {fmtDelta(dlt)}
                </div>
                <div className="mt-1.5 space-y-0.5">
                  <div className="text-[9px] text-[#f97316]">
                    ↑ {d.polarNight ? "—" : fmtTime(d.rise, tz)}
                  </div>
                  <div className="text-[9px] text-[#818cf8]">
                    ↓ {d.polarNight ? "—" : fmtTime(d.set, tz)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Stats trio */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              icon: "☀️",
              label: "Longest Day",
              sub: `${MONTH_FULL[longestIdx]} — ${fmtDur(maxDl)}`,
              color: "#4ade80",
            },
            {
              icon: "🌙",
              label: "Shortest Day",
              sub: `${MONTH_FULL[shortestIdx]} — ${fmtDur(minDl)}`,
              color: "#818cf8",
            },
            {
              icon: "↔",
              label: "Annual Swing",
              sub: `${fmtDur(annualSwing)} difference`,
              color: "#fbbf24",
              iconCmp: <ArrowLeftRight className="w-5 h-5 text-[#fbbf24]" />,
            },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 bg-card border border-border rounded-xl p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${s.color}18` }}>
                {s.iconCmp ?? <span className="text-lg">{s.icon}</span>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</div>
                <div className="text-sm font-bold text-white mt-0.5">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Monthly Daylight Chart ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold tracking-wide uppercase">Monthly Daylight</h3>
          <span className="text-sm text-muted-foreground">
            {Math.abs(lat).toFixed(1)}°{lat >= 0 ? "N" : "S"}, {Math.abs(lon).toFixed(1)}°{lon >= 0 ? "E" : "W"}
          </span>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 overflow-x-auto">
          <div style={{ minWidth: 640 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 40, left: 10 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#4b5563" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.floor(v / 60)}h`}
                  domain={[0, maxDl + 60]}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => {
                    if (name === "dl") return [fmtDur(v), "Daylight"];
                    return [v, name];
                  }}
                  labelFormatter={(l) => l}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-[hsl(232_20%_10%)] border border-[hsl(232_18%_16%)] rounded-lg p-2.5 text-xs space-y-0.5">
                        <div className="font-bold text-white">{label}</div>
                        <div className="text-white">{fmtDur(d.dl)}</div>
                        <div className={d.delta >= 0 ? "text-green-400" : "text-amber-400"}>{fmtDelta(d.delta)}</div>
                        <div className="text-[#f97316]">↑ {d.rise}</div>
                        <div className="text-[#818cf8]">↓ {d.set}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="dl" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={
                        entry.isActive
                          ? "#CCCCFF"
                          : index === longestIdx
                          ? "#4ade80"
                          : index === shortestIdx
                          ? "#f97316"
                          : "rgba(204,204,255,0.3)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <span>→</span> Scroll to see all months · Times shown are approximate local time based on longitude
        </p>
      </div>
    </div>
  );
}
