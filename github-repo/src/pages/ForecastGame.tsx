import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "../hooks/useAuth";
import {
  getMyGuess, getLastScored, lockGuess, monthlyLeaderboard, getWinners,
  SEVERE_BANDS, SEVERE_MISS, TORNADO_BANDS, QUIET_DAY_BONUS,
  type GameGuess, type LeaderRow, type WinnerRow, type Pin,
} from "../lib/gameDb";
import { Leaderboard } from "../components/Leaderboard";
import { useDailyBrief } from "../hooks/useDailyBrief";
import { geocodeLocation } from "../utils/weatherApi";
import usStatesAlbers from "../data/usStatesAlbers.json";
import {
  Gamepad2, Search, Trophy, Calendar, Crown, Target, Info,
  ExternalLink, Zap, Tornado, Lock, Layers, RotateCcw, CheckCircle2,
} from "lucide-react";

type Tab = "play" | "leaderboard";
/** Which pin a map click currently drops. */
type PinMode = "severe" | "tornado";

const US_STATES = (usStatesAlbers as { states: { name: string; d: string }[] }).states;

// us-atlas albers-USA projection size (matches api-server /api/us-states)
const MAP_W = 975;
const MAP_H = 610;

// Inverse Albers USA approximation: a calibrated affine fit mapping projected
// (x,y) back to (lon,lat) for the contiguous US — accurate to ~15-25 mi, which
// is well inside the 25 mi bullseye band.
const CITIES_CAL: { name: string; lat: number; lon: number; x: number; y: number }[] = [
  { name: "Seattle",       lat: 47.61, lon: -122.33, x: 137, y: 116 },
  { name: "Los Angeles",   lat: 34.05, lon: -118.24, x: 207, y: 357 },
  { name: "Denver",        lat: 39.74, lon: -104.99, x: 422, y: 274 },
  { name: "Chicago",       lat: 41.88, lon:  -87.63, x: 644, y: 254 },
  { name: "Houston",       lat: 29.76, lon:  -95.37, x: 541, y: 466 },
  { name: "Miami",         lat: 25.76, lon:  -80.19, x: 814, y: 522 },
  { name: "New York",      lat: 40.71, lon:  -74.00, x: 838, y: 245 },
  { name: "Atlanta",       lat: 33.75, lon:  -84.39, x: 715, y: 384 },
  { name: "Oklahoma City", lat: 35.47, lon:  -97.52, x: 521, y: 372 },
];
function solveAffine(): { a: number; b: number; c: number; d: number; e: number; f: number } {
  let sX = 0, sY = 0, sLon = 0, sLat = 0, sXLon = 0, sXLat = 0, sYLon = 0, sYLat = 0;
  let sLonLon = 0, sLatLat = 0, sLonLat = 0;
  const n = CITIES_CAL.length;
  for (const c of CITIES_CAL) {
    sX += c.x; sY += c.y; sLon += c.lon; sLat += c.lat;
    sXLon += c.x * c.lon; sXLat += c.x * c.lat;
    sYLon += c.y * c.lon; sYLat += c.y * c.lat;
    sLonLon += c.lon * c.lon; sLatLat += c.lat * c.lat; sLonLat += c.lon * c.lat;
  }
  const A = [[n, sLon, sLat], [sLon, sLonLon, sLonLat], [sLat, sLonLat, sLatLat]];
  const bx = [sX, sXLon, sXLat];
  const by = [sY, sYLon, sYLat];
  function solve3(M: number[][], v: number[]): number[] {
    const m = M.map((r, i) => [...r, v[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
      [m[i], m[p]] = [m[p], m[i]];
      for (let k = i + 1; k < 3; k++) {
        const f = m[k][i] / m[i][i];
        for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
      }
    }
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let s = m[i][3];
      for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j];
      x[i] = s / m[i][i];
    }
    return x;
  }
  const [a, b, c] = solve3(A, bx);
  const [d, e, f] = solve3(A, by);
  return { a, b, c, d, e, f };
}
const AFFINE = solveAffine();

function project(lon: number, lat: number): { x: number; y: number } {
  const { a, b, c, d, e, f } = AFFINE;
  return { x: a + b * lon + c * lat, y: d + e * lon + f * lat };
}
function unproject(x: number, y: number): { lat: number; lon: number } {
  const { a, b, c, d, e, f } = AFFINE;
  const det = b * f - c * e;
  const lon = (f * (x - a) - c * (y - d)) / det;
  const lat = (-e * (x - a) + b * (y - d)) / det;
  return { lat, lon };
}

const GAME_CITIES: { name: string; lat: number; lon: number }[] = [
  { name: "Seattle", lat: 47.61, lon: -122.33 }, { name: "Portland", lat: 45.52, lon: -122.68 },
  { name: "San Francisco", lat: 37.77, lon: -122.42 }, { name: "Los Angeles", lat: 34.05, lon: -118.24 },
  { name: "Las Vegas", lat: 36.17, lon: -115.14 }, { name: "Phoenix", lat: 33.45, lon: -112.07 },
  { name: "Salt Lake City", lat: 40.76, lon: -111.89 }, { name: "Denver", lat: 39.74, lon: -104.99 },
  { name: "Albuquerque", lat: 35.08, lon: -106.65 }, { name: "Dallas", lat: 32.78, lon: -96.80 },
  { name: "Houston", lat: 29.76, lon: -95.37 }, { name: "San Antonio", lat: 29.42, lon: -98.49 },
  { name: "Oklahoma City", lat: 35.47, lon: -97.52 }, { name: "Kansas City", lat: 39.10, lon: -94.58 },
  { name: "Minneapolis", lat: 44.98, lon: -93.27 }, { name: "St. Louis", lat: 38.63, lon: -90.20 },
  { name: "Chicago", lat: 41.88, lon: -87.63 }, { name: "Detroit", lat: 42.33, lon: -83.05 },
  { name: "Nashville", lat: 36.16, lon: -86.78 }, { name: "Memphis", lat: 35.15, lon: -90.05 },
  { name: "New Orleans", lat: 29.95, lon: -90.07 }, { name: "Atlanta", lat: 33.75, lon: -84.39 },
  { name: "Miami", lat: 25.76, lon: -80.19 }, { name: "Tampa", lat: 27.95, lon: -82.46 },
  { name: "Charlotte", lat: 35.23, lon: -80.84 }, { name: "Washington", lat: 38.90, lon: -77.04 },
  { name: "New York", lat: 40.71, lon: -74.00 }, { name: "Boston", lat: 42.36, lon: -71.06 },
];

// ── Overlays ────────────────────────────────────────────────────────────────
// All four are SPC GeoJSON products, so they run through the SAME affine as the
// basemap and land in the right place. (SPC's mesoanalysis STP / 3km-CAPE
// fields are raster GIFs on a Lambert Conformal grid with no georeference
// published, so they cannot be aligned to this albersUsa SVG — the probability
// vectors are both correctly placed AND more directly useful here: tornado
// probability is exactly what the 🌪 pin is guessing at.)
const CAT_RANK: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };
const CAT_COLORS: Record<string, string> = {
  TSTM: "#84CC16", MRGL: "#48a832", SLGT: "#f7e98e",
  ENH: "#e6a23c", MDT: "#dc2626", HIGH: "#ff00ff",
};
const CAT_MEANING: Record<string, string> = {
  TSTM: "General thunderstorms — not severe.",
  MRGL: "Marginal — isolated severe possible.",
  SLGT: "Slight — scattered severe storms.",
  ENH: "Enhanced — numerous severe storms likely.",
  MDT: "Moderate — widespread, intense severe.",
  HIGH: "High — a severe/tornado outbreak.",
};
// SPC's own probability ramp.
const PROB_COLORS: { p: number; color: string }[] = [
  { p: 0.02, color: "#008B00" }, { p: 0.05, color: "#8B4726" }, { p: 0.10, color: "#FFC800" },
  { p: 0.15, color: "#FF0000" }, { p: 0.30, color: "#FF00FF" }, { p: 0.45, color: "#912CEE" },
  { p: 0.60, color: "#104E8B" },
];
const probColor = (p: number) =>
  [...PROB_COLORS].reverse().find((s) => p >= s.p)?.color ?? "#008B00";

interface OverlayDef {
  id: string; label: string; product: string; kind: "cat" | "prob";
  pin: PinMode | "both"; blurb: string;
}
const OVERLAYS: OverlayDef[] = [
  { id: "cat",  label: "Categorical", product: "day1otlk_cat",  kind: "cat",  pin: "both",
    blurb: "SPC Day 1 categorical risk — the overall severe threat." },
  { id: "torn", label: "Tornado %",   product: "day1otlk_torn", kind: "prob", pin: "tornado",
    blurb: "Probability of a tornado within 25 mi of a point. Aim the 🌪 pin here." },
  { id: "wind", label: "Wind %",      product: "day1otlk_wind", kind: "prob", pin: "severe",
    blurb: "Probability of damaging wind within 25 mi of a point." },
  { id: "hail", label: "Hail %",      product: "day1otlk_hail", kind: "prob", pin: "severe",
    blurb: "Probability of large hail within 25 mi of a point." },
];

interface Poly { d: string; color: string; rank: number; label: string }
interface OverlayData { polys: Poly[]; legend: { label: string; color: string; code: string }[] }

/** Project one SPC GeoJSON product into SVG paths + a de-duplicated legend. */
function buildOverlay(geo: unknown, kind: "cat" | "prob"): OverlayData {
  const d = geo as { features?: { properties?: Record<string, string>; geometry?: { type?: string; coordinates?: number[][][] | number[][][][] } }[] };
  const polys: Poly[] = [];
  const seen = new Set<string>();
  const legend: { label: string; color: string; code: string }[] = [];

  for (const f of d.features ?? []) {
    const code = f.properties?.LABEL ?? "";
    let color: string, rank: number, label: string;

    if (kind === "cat") {
      if (!CAT_COLORS[code]) continue;                 // skip anything not a risk category
      color = CAT_COLORS[code];
      rank = CAT_RANK[code] ?? 0;
      label = f.properties?.LABEL2 || code;
    } else {
      const p = parseFloat(code);
      // SPC ships non-numeric rows in the probability files (e.g. "CIG1" in the
      // hail product, "" in sigtorn). parseFloat gives NaN — drop them rather
      // than painting a bogus polygon.
      if (Number.isNaN(p)) continue;
      color = probColor(p);
      rank = p;
      label = `${Math.round(p * 100)}%`;
    }

    if (!seen.has(label)) { seen.add(label); legend.push({ label, color, code }); }

    const g = f.geometry;
    const rings: number[][][][] =
      g?.type === "Polygon" ? [g.coordinates as number[][][]]
      : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][])
      : [];
    for (const poly of rings) {
      let path = "";
      for (const ring of poly) {
        ring.forEach((co, idx) => {
          const pt = project(co[0], co[1]);
          path += `${idx === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        });
        path += "Z";
      }
      polys.push({ d: path, color, rank, label });
    }
  }
  polys.sort((a, b) => a.rank - b.rank);   // strongest category/probability on top
  legend.sort((a, b) => (parseFloat(b.code) || (CAT_RANK[b.code] ?? 0)) - (parseFloat(a.code) || (CAT_RANK[a.code] ?? 0)));
  return { polys, legend };
}

const fmt = (n: number) => n.toLocaleString();

export default function ForecastGame() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("play");

  const [severePin, setSeverePin] = useState<Pin | null>(null);
  const [tornadoPin, setTornadoPin] = useState<Pin | null>(null);
  const [quietDay, setQuietDay] = useState(false);      // explicit "no tornadoes" call
  const [mode, setMode] = useState<PinMode>("severe");

  const [cityQuery, setCityQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [locked, setLocked] = useState(false);
  const [mine, setMine] = useState<GameGuess | null>(null);
  const [lastScored, setLastScored] = useState<{ date: string; guess: GameGuess } | null>(null);

  const [gameBoard, setGameBoard] = useState<LeaderRow[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);

  const [overlayId, setOverlayId] = useState("cat");
  const [overlays, setOverlays] = useState<Record<string, OverlayData>>({});

  const { data: brief } = useDailyBrief();
  const svgRef = useRef<SVGSVGElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const yyyymm = today.slice(0, 7);

  // Fetch every SPC overlay once, in parallel. A product that fails just leaves
  // its tab empty rather than taking the page down.
  useEffect(() => {
    let cancelled = false;
    Promise.all(OVERLAYS.map(async (o) => {
      try {
        const r = await fetch(`https://www.spc.noaa.gov/products/outlook/${o.product}.nolyr.geojson`);
        if (!r.ok) return [o.id, { polys: [], legend: [] }] as const;
        return [o.id, buildOverlay(await r.json(), o.kind)] as const;
      } catch { return [o.id, { polys: [], legend: [] }] as const; }
    })).then((entries) => {
      if (!cancelled) setOverlays(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, []);

  // Load my locked picks + boards.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [g, last, lb, wn] = await Promise.all([
        getMyGuess(user.id, today), getLastScored(user.id, today),
        monthlyLeaderboard(yyyymm), getWinners(),
      ]);
      if (cancelled) return;
      if (g) {
        setMine(g); setLocked(true);
        setSeverePin(g.severe); setTornadoPin(g.tornado); setQuietDay(g.tornado === null);
      }
      setLastScored(last); setGameBoard(lb); setWinners(wn);
    })();
    return () => { cancelled = true; };
  }, [user, today, yyyymm]);

  // Switching to the tornado overlay implies you're about to place that pin.
  function pickOverlay(id: string) {
    setOverlayId(id);
    const o = OVERLAYS.find((x) => x.id === id);
    if (!locked && o && o.pin !== "both") setMode(o.pin);
  }

  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || locked) return;
    if (mode === "tornado" && quietDay) return;        // quiet-day call means no pin
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((e.clientY - rect.top) / rect.height) * MAP_H;
    const { lat, lon } = unproject(x, y);
    const pin: Pin = { lat, lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
    if (mode === "severe") { setSeverePin(pin); setMode("tornado"); }  // advance to pin 2
    else setTornadoPin(pin);
    setErr("");
  }

  async function searchCity() {
    if (!cityQuery.trim() || locked) return;
    setSearching(true); setErr("");
    try {
      const results = await geocodeLocation(cityQuery);
      const us = results.find((r) => r.name.toUpperCase().includes("US")) || results[0];
      if (!us) { setErr("City not found"); return; }
      const pin: Pin = { lat: us.lat, lon: us.lon, label: us.name };
      if (mode === "severe") { setSeverePin(pin); setMode("tornado"); }
      else { setTornadoPin(pin); setQuietDay(false); }
      setCityQuery("");
    } catch { setErr("Search failed"); }
    finally { setSearching(false); }
  }

  async function submit() {
    if (!user || !severePin || locked) return;
    if (!quietDay && !tornadoPin) { setErr("Place a 🌪 tornado pin, or call a quiet day."); return; }
    const res = await lockGuess({
      userId: user.id, userName: user.name, date: today,
      severe: severePin, tornado: quietDay ? null : tornadoPin,
    });
    if (res.ok) {
      setLocked(true);
      setMine({
        severe: severePin, tornado: quietDay ? null : tornadoPin,
        severePoints: null, tornadoPoints: null, points: null, scoredAt: null,
      });
    } else {
      setErr(res.error);
      if (res.error.includes("already")) setLocked(true);
    }
  }

  function resetPins() {
    if (locked) return;
    setSeverePin(null); setTornadoPin(null); setQuietDay(false); setMode("severe"); setErr("");
  }

  const active = overlays[overlayId] ?? { polys: [], legend: [] };
  const activeDef = OVERLAYS.find((o) => o.id === overlayId)!;
  const catLegend = overlays["cat"]?.legend ?? [];
  const monthName = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  const sevPt = useMemo(() => severePin ? project(severePin.lon, severePin.lat) : null, [severePin]);
  const torPt = useMemo(() => tornadoPin && !quietDay ? project(tornadoPin.lon, tornadoPin.lat) : null, [tornadoPin, quietDay]);

  if (!user) {
    return (
      <div className="p-6 text-center space-y-3">
        <Gamepad2 className="w-10 h-10 text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Sign in to play the Forecast Game.</p>
        <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <style>{GAME_CSS}</style>

      <div className="flex items-center gap-2">
        <Gamepad2 className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Forecast Game</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Two calls a day: where the worst <span className="text-yellow-300 font-semibold">severe weather</span> hits,
        and where a <span className="text-red-400 font-semibold">tornado</span> touches down. Scoring runs after
        00 UTC against the day's SPC storm reports.
      </p>

      <div className="grid grid-cols-2 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setTab("play")} className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "play" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Target className="w-4 h-4" /> Play Today</button>
        <button onClick={() => setTab("leaderboard")} className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "leaderboard" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><Trophy className="w-4 h-4" /> Leaderboard</button>
      </div>

      {tab === "play" && (
        <div className="space-y-4">
          {/* ── Yesterday's result ── */}
          {lastScored && (
            <div className="bg-gradient-to-r from-card to-primary/5 border border-primary/30 rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Your last round — {lastScored.date}</span>
                <span className="ml-auto text-lg font-extrabold tabular-nums text-primary">
                  {fmt(lastScored.guess.points ?? 0)} pts
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-yellow-400/10 border border-yellow-400/25 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-yellow-300 font-semibold"><Zap className="w-3 h-3" /> Severe pin</div>
                  <div className="text-muted-foreground mt-0.5">{fmt(lastScored.guess.severePoints ?? 0)} pts</div>
                </div>
                <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-red-400 font-semibold"><Tornado className="w-3 h-3" /> {lastScored.guess.tornado ? "Tornado pin" : "Quiet-day call"}</div>
                  <div className="text-muted-foreground mt-0.5">{fmt(lastScored.guess.tornadoPoints ?? 0)} pts</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Pin selector ── */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => !locked && setMode("severe")}
                disabled={locked}
                className={`rounded-xl px-3 py-2.5 border text-left transition-all disabled:opacity-70 ${
                  mode === "severe" && !locked
                    ? "border-yellow-400/70 bg-yellow-400/10 ring-1 ring-yellow-400/40"
                    : "border-border bg-muted/20 hover:border-yellow-400/40"}`}>
                <div className="flex items-center gap-1.5 text-yellow-300 text-xs font-bold uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5" /> Severe pin
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                  {severePin ? severePin.label : "Not placed"}
                </div>
              </button>

              <button
                onClick={() => !locked && setMode("tornado")}
                disabled={locked}
                className={`rounded-xl px-3 py-2.5 border text-left transition-all disabled:opacity-70 ${
                  mode === "tornado" && !locked
                    ? "border-red-500/70 bg-red-500/10 ring-1 ring-red-500/40"
                    : "border-border bg-muted/20 hover:border-red-500/40"}`}>
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-bold uppercase tracking-wider">
                  <Tornado className="w-3.5 h-3.5" /> Tornado pin
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                  {quietDay ? "Calling a quiet day" : tornadoPin ? tornadoPin.label : "Not placed"}
                </div>
              </button>
            </div>

            {/* quiet-day call */}
            <label className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border cursor-pointer ${
              quietDay ? "bg-sky-500/10 border-sky-500/40 text-sky-200" : "bg-muted/20 border-border text-muted-foreground"} ${locked ? "opacity-70 pointer-events-none" : ""}`}>
              <input type="checkbox" className="accent-sky-400" checked={quietDay} disabled={locked}
                onChange={(e) => { setQuietDay(e.target.checked); if (e.target.checked) setTornadoPin(null); }} />
              <span>
                <strong>No tornadoes anywhere today.</strong> Skip the 🌪 pin — worth{" "}
                <strong className="text-sky-300">+{QUIET_DAY_BONUS}</strong> if the day verifies with zero tornado reports.
              </span>
            </label>

            {/* search + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchCity(); }}
                  disabled={locked}
                  placeholder={`Search a city for the ${mode === "severe" ? "⚡ severe" : "🌪 tornado"} pin…`}
                  className="bg-transparent outline-none text-sm flex-1 disabled:opacity-60" />
              </div>
              <button onClick={searchCity} disabled={searching || locked}
                className="px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold disabled:opacity-50">
                {searching ? "…" : "Place"}
              </button>
              {!locked && (severePin || tornadoPin) && (
                <button onClick={resetPins} title="Clear both pins"
                  className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-muted-foreground text-sm font-semibold hover:text-foreground">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={submit} disabled={!severePin || locked || (!quietDay && !tornadoPin)}
                className="px-3 py-2 rounded-lg bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> {locked ? "Locked In" : "Lock In Picks"}
              </button>
            </div>

            {err && <div className="text-xs text-red-400">{err}</div>}

            {locked && (
              <div className="text-xs rounded-lg px-3 py-2 bg-yellow-400/10 border border-yellow-400/30 text-yellow-200">
                🔒 Today's picks are locked. Scoring runs tonight after 00 UTC against the day's SPC storm reports.
              </div>
            )}
            {!locked && (
              <div className="text-xs text-muted-foreground">
                {mode === "severe"
                  ? "Click the map (or search) to drop your ⚡ severe pin."
                  : quietDay ? "Quiet day called — no 🌪 pin needed. Lock in when ready."
                  : "Now drop your 🌪 tornado pin."}
              </div>
            )}

            {/* ── Overlay switcher ── */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              {OVERLAYS.map((o) => {
                const empty = (overlays[o.id]?.polys.length ?? 0) === 0;
                return (
                  <button key={o.id} onClick={() => pickOverlay(o.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      overlayId === o.id
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-muted/20 border-border text-muted-foreground hover:text-foreground"}`}>
                    {o.label}{empty && <span className="opacity-50"> ·0</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{activeDef.blurb}</p>

            {/* ── Map ── */}
            <div className="relative bg-black rounded-xl overflow-hidden border border-border">
              <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} onClick={handleMapClick}
                className={`w-full h-auto ${locked ? "cursor-default" : "cursor-crosshair"}`}>
                <defs>
                  <linearGradient id="sswx-game-bg" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#050818" />
                    <stop offset="100%" stopColor="#0a0f24" />
                  </linearGradient>
                </defs>
                <rect width={MAP_W} height={MAP_H} fill="url(#sswx-game-bg)" />

                {US_STATES.map((s, i) => (
                  <path key={i} d={s.d} fill="#141d2e" stroke="#2a3852" strokeWidth={0.8}>
                    <title>{s.name}</title>
                  </path>
                ))}

                {active.polys.map((p, i) => (
                  <path key={`${overlayId}-${i}`} d={p.d} fill={p.color} fillOpacity={0.3}
                    stroke={p.color} strokeOpacity={0.8} strokeWidth={0.9} pointerEvents="none" />
                ))}

                {GAME_CITIES.map((ci) => {
                  const p = project(ci.lon, ci.lat);
                  return (
                    <g key={ci.name} pointerEvents="none">
                      <circle cx={p.x} cy={p.y} r={2.2} fill="#e2e8f0" stroke="#000" strokeWidth={0.5} />
                      <text x={p.x + 4} y={p.y + 3} fill="#cbd5e1" fontSize={8.5} fontFamily="system-ui"
                        style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 1.6 }}>{ci.name}</text>
                    </g>
                  );
                })}

                {/* ⚡ severe pin */}
                {sevPt && (
                  <g pointerEvents="none">
                    <circle cx={sevPt.x} cy={sevPt.y} r={16} fill="none" stroke="#fde047" strokeWidth={2} opacity={0.65}>
                      <animate attributeName="r" from="16" to="30" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.65" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={sevPt.x} cy={sevPt.y} r={12} fill="#fde047" stroke="#000" strokeWidth={1.5} />
                    <path d={boltPath(sevPt.x, sevPt.y)} fill="#1a1400" />
                  </g>
                )}

                {/* 🌪 tornado pin */}
                {torPt && (
                  <g pointerEvents="none">
                    <circle cx={torPt.x} cy={torPt.y} r={16} fill="none" stroke="#f87171" strokeWidth={2} opacity={0.65}>
                      <animate attributeName="r" from="16" to="30" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.65" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={torPt.x} cy={torPt.y} r={12} fill="#ef4444" stroke="#000" strokeWidth={1.5} />
                    <path d={funnelPath(torPt.x, torPt.y)} fill="#2a0505" />
                  </g>
                )}

                <text x={20} y={28} fill="#64748b" fontSize={11} fontFamily="monospace">
                  {locked ? "PICKS LOCKED" : mode === "severe" ? "CLICK TO PLACE ⚡ SEVERE PIN" : quietDay ? "QUIET DAY CALLED" : "CLICK TO PLACE 🌪 TORNADO PIN"}
                </text>
              </svg>

              {/* overlay legend */}
              {active.legend.length > 0 && (
                <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 max-w-[92%]">
                  {active.legend.map((l) => (
                    <span key={l.label} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border backdrop-blur-sm"
                      style={{ background: l.color + "33", color: l.color, borderColor: l.color + "80" }}>{l.label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Scouting report ── */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Scouting Report</h3>
            {brief?.headline && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-primary font-semibold">National picture: </span>{brief.headline}
                {brief.content?.risk_overview?.day1_category_name && (
                  <span className="text-foreground"> · SPC Day 1: {brief.content.risk_overview.day1_category_name}</span>
                )}
              </p>
            )}
            {catLegend.length > 0 ? (
              <div className="space-y-1.5">
                {catLegend.map((r) => (
                  <div key={r.label} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
                    <span><strong style={{ color: r.color }}>{r.label}</strong>{" "}
                      <span className="text-muted-foreground">— {CAT_MEANING[r.code] ?? "Severe risk area."}</span></span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No SPC severe risk areas today — a quiet day. Your ⚡ pin still banks {SEVERE_MISS} pts,
                and calling "no tornadoes" is worth {QUIET_DAY_BONUS}.
              </p>
            )}
            <p className="text-[11px] text-primary/90">
              🎯 Switch to <strong>Tornado %</strong> to aim the 🌪 pin, and <strong>Wind %</strong> / <strong>Hail %</strong> for the ⚡ pin.
            </p>
          </div>

          {/* ── Scoring rules ── */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Info className="w-4 h-4 text-primary" /> Scoring</h3>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-yellow-400/25 bg-yellow-400/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-yellow-300 text-xs font-bold uppercase tracking-wider mb-2">
                  <Zap className="w-3.5 h-3.5" /> Severe pin
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">Distance to the nearest storm report of any kind (tornado, hail or wind).</p>
                <ul className="text-xs space-y-1">
                  {SEVERE_BANDS.map((b) => (
                    <li key={b.within} className="flex justify-between tabular-nums">
                      <span className="text-muted-foreground">{b.label} (≤ {b.within} mi)</span>
                      <strong>{fmt(b.points)}</strong>
                    </li>
                  ))}
                  <li className="flex justify-between tabular-nums">
                    <span className="text-muted-foreground">Anything else</span><strong>{SEVERE_MISS}</strong>
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <Tornado className="w-3.5 h-3.5" /> Tornado pin
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">Distance to the nearest <em>tornado</em> report only — harder, so it pays more.</p>
                <ul className="text-xs space-y-1">
                  {TORNADO_BANDS.map((b) => (
                    <li key={b.within} className="flex justify-between tabular-nums">
                      <span className="text-muted-foreground">{b.label} (≤ {b.within} mi)</span>
                      <strong>{fmt(b.points)}</strong>
                    </li>
                  ))}
                  <li className="flex justify-between tabular-nums">
                    <span className="text-sky-300">Correct quiet-day call</span><strong className="text-sky-300">{QUIET_DAY_BONUS}</strong>
                  </li>
                </ul>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/70">
              Your daily score is both pins added together, and it feeds the same week/month/year board as Daily Trivia.
              Scoring is computed server-side from SPC storm reports — never from the browser.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Link href="/spc" className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> <span className="text-sm">Check today's SPC Outlook</span>
            </Link>
            <Link href="/discussion" className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> <span className="text-sm">Read the NWS Forecast Discussion</span>
            </Link>
          </div>
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="space-y-5">
          {/* Combined board (Forecast Game + Trivia) */}
          <Leaderboard meId={user.id} />

          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-yellow-400" /> Forecast Game only — {monthName}
            </h2>
            {gameBoard.length === 0 && <p className="text-sm text-muted-foreground">No rounds scored yet this month. Be the first.</p>}
            <div className="space-y-2">
              {gameBoard.slice(0, 10).map((row, i) => (
                <div key={row.userId} className={`flex items-center gap-3 p-3 rounded-lg ${row.userId === user.id ? "bg-primary/10" : "bg-muted/20"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    i === 0 ? "bg-yellow-400/20 text-yellow-300" : i === 1 ? "bg-gray-400/20 text-gray-300"
                    : i === 2 ? "bg-orange-700/20 text-orange-300" : "bg-muted/40 text-muted-foreground"}`}>
                    {i === 0 ? <Crown className="w-4 h-4" /> : `#${i + 1}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.games} round{row.games === 1 ? "" : "s"}</div>
                  </div>
                  <div className="text-lg font-bold tabular-nums text-primary">{fmt(row.points)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-primary" /> Monthly Champions</h2>
            {winners.length === 0 && <p className="text-sm text-muted-foreground">No champions crowned yet. Will it be you?</p>}
            <div className="space-y-1.5">
              {winners.map((w) => (
                <div key={w.month} className="flex items-center justify-between p-2.5 bg-muted/20 rounded-lg">
                  <div className="text-sm font-medium">{w.month}</div>
                  <div className="flex items-center gap-2">
                    <Crown className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-sm font-semibold">{w.userName}</span>
                    <span className="text-xs text-muted-foreground">({fmt(w.points)} pts)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A small lightning bolt centred on (cx, cy), drawn inside the ⚡ pin disc. */
function boltPath(cx: number, cy: number): string {
  const s = 0.55;
  const p = (dx: number, dy: number) => `${(cx + dx * s).toFixed(1)},${(cy + dy * s).toFixed(1)}`;
  return `M${p(2, -11)}L${p(-7, 2)}L${p(-1, 2)}L${p(-3, 11)}L${p(7, -2)}L${p(1, -2)}Z`;
}
/** A small funnel centred on (cx, cy), drawn inside the 🌪 pin disc. */
function funnelPath(cx: number, cy: number): string {
  const s = 0.55;
  const p = (dx: number, dy: number) => `${(cx + dx * s).toFixed(1)},${(cy + dy * s).toFixed(1)}`;
  return `M${p(-10, -9)}L${p(10, -9)}L${p(6, -3)}L${p(-6, -3)}Z ` +
         `M${p(-6, -1)}L${p(6, -1)}L${p(3, 5)}L${p(-3, 5)}Z ` +
         `M${p(-3, 7)}L${p(3, 7)}L${p(1, 12)}L${p(-1, 12)}Z`;
}

const GAME_CSS = `
@media (prefers-reduced-motion: reduce){
  svg animate{display:none}
}
`;
