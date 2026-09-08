import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "../hooks/useAuth";
import { SubmittingAsNotice } from "../components/SubmittingAsNotice";
import {
  getMyGuess, getLastScored, lockGuess, monthlyLeaderboard, getWinners,
  SEVERE_PLACES, SEVERE_CONSOLATION, TORNADO_PLACES, TORNADO_BULLSEYE,
  QUIET_DAY_BONUS, ordinal,
  type GameGuess, type LeaderRow, type WinnerRow, type Pin,
} from "../lib/gameDb";
import { Leaderboard } from "../components/Leaderboard";
import { gameDate, msUntilNextGameDay } from "../lib/gameDay";
import { useDailyBrief } from "../hooks/useDailyBrief";
import { geocodeLocation } from "../utils/weatherApi";
import usStatesAlbers from "../data/usStatesAlbers.json";
import {
  Gamepad2, Search, Trophy, Calendar, Crown, Target, Info,
  ExternalLink, Zap, Tornado, Lock, Layers, RotateCcw, CheckCircle2, Timer,
} from "lucide-react";

type Tab = "play" | "leaderboard";
type PinMode = "severe" | "tornado";

const US_STATES = (usStatesAlbers as { states: { name: string; d: string }[] }).states;
const MAP_W = 975;
const MAP_H = 610;

// Inverse Albers USA approximation: a calibrated affine fit mapping projected
// (x,y) back to (lon,lat) — accurate to ~15-25 mi, well inside the 25 mi bullseye.
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
function solveAffine() {
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
  const [a, b, c] = solve3(A, [sX, sXLon, sXLat]);
  const [d, e, f] = solve3(A, [sY, sYLon, sYLat]);
  return { a, b, c, d, e, f };
}
const AFFINE = solveAffine();
function project(lon: number, lat: number) {
  const { a, b, c, d, e, f } = AFFINE;
  return { x: a + b * lon + c * lat, y: d + e * lon + f * lat };
}
function unproject(x: number, y: number) {
  const { a, b, c, d, e, f } = AFFINE;
  const det = b * f - c * e;
  return {
    lon: (f * (x - a) - c * (y - d)) / det,
    lat: (-e * (x - a) + b * (y - d)) / det,
  };
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
// All four are SPC GeoJSON, so they run through the SAME affine as the basemap
// and land in the right place. SPC's mesoanalysis STP / 3km-CAPE fields are
// Lambert Conformal rasters with no published georeference and cannot be
// aligned to this albersUsa SVG — the probability vectors are both correctly
// placed AND more useful: tornado probability is what the 🌪 pin is guessing at.
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
const PROB_COLORS: { p: number; color: string }[] = [
  { p: 0.02, color: "#008B00" }, { p: 0.05, color: "#8B4726" }, { p: 0.10, color: "#FFC800" },
  { p: 0.15, color: "#FF0000" }, { p: 0.30, color: "#FF00FF" }, { p: 0.45, color: "#912CEE" },
  { p: 0.60, color: "#104E8B" },
];
const probColor = (p: number) => [...PROB_COLORS].reverse().find((s) => p >= s.p)?.color ?? "#008B00";

interface OverlayDef { id: string; label: string; product: string; kind: "cat" | "prob"; pin: PinMode | "both"; blurb: string }
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

interface Poly { d: string; color: string; rank: number }
interface OverlayData { polys: Poly[]; legend: { label: string; color: string; code: string }[] }

function buildOverlay(geo: unknown, kind: "cat" | "prob"): OverlayData {
  const d = geo as { features?: { properties?: Record<string, string>; geometry?: { type?: string; coordinates?: number[][][] | number[][][][] } }[] };
  const polys: Poly[] = [];
  const seen = new Set<string>();
  const legend: { label: string; color: string; code: string }[] = [];

  for (const f of d.features ?? []) {
    const code = f.properties?.LABEL ?? "";
    let color: string, rank: number, label: string;
    if (kind === "cat") {
      if (!CAT_COLORS[code]) continue;
      color = CAT_COLORS[code]; rank = CAT_RANK[code] ?? 0; label = f.properties?.LABEL2 || code;
    } else {
      const p = parseFloat(code);
      // SPC ships non-numeric rows in the probability files (e.g. "CIG1" in the
      // hail product). parseFloat gives NaN — drop rather than paint garbage.
      if (Number.isNaN(p)) continue;
      color = probColor(p); rank = p; label = `${Math.round(p * 100)}%`;
    }
    if (!seen.has(label)) { seen.add(label); legend.push({ label, color, code }); }

    const g = f.geometry;
    const rings: number[][][][] =
      g?.type === "Polygon" ? [g.coordinates as number[][][]]
      : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][]) : [];
    for (const poly of rings) {
      let path = "";
      for (const ring of poly) {
        ring.forEach((co, idx) => {
          const pt = project(co[0], co[1]);
          path += `${idx === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        });
        path += "Z";
      }
      polys.push({ d: path, color, rank });
    }
  }
  polys.sort((a, b) => a.rank - b.rank);
  legend.sort((a, b) => (parseFloat(b.code) || (CAT_RANK[b.code] ?? 0)) - (parseFloat(a.code) || (CAT_RANK[a.code] ?? 0)));
  return { polys, legend };
}

const fmt = (n: number) => n.toLocaleString();

/** Time remaining until the 00 UTC scoring cut-off. */
/** Time left in the round, counted to midnight Eastern — the same clock the
 *  round itself turns over on, rather than to UTC midnight, which is 8pm here
 *  and was four hours adrift of the moment it claimed to be counting to. */
function useLockCountdown(): string {
  const [s, setS] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = msUntilNextGameDay();
      const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
      setS(`${h}h ${String(m).padStart(2, "0")}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return s;
}

/**
 * The current contest day, which changes under the page at midnight.
 *
 * Somebody who leaves the game open overnight — which on a phone is everybody,
 * since the tab is never really closed — should watch the board reset rather
 * than sit on a finished round until they think to reload. The timer is armed
 * for the exact moment of the turnover and re-armed after it.
 */
function useGameDate(): string {
  const [date, setDate] = useState(() => gameDate());
  useEffect(() => {
    const id = setTimeout(() => setDate(gameDate()), msUntilNextGameDay() + 1_000);
    return () => clearTimeout(id);
  }, [date]);
  return date;
}

export default function ForecastGame() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("play");

  const [severePin, setSeverePin] = useState<Pin | null>(null);
  const [tornadoPin, setTornadoPin] = useState<Pin | null>(null);
  const [quietDay, setQuietDay] = useState(false);
  const [mode, setMode] = useState<PinMode>("severe");

  const [cityQuery, setCityQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [locked, setLocked] = useState(false);
  const [lastScored, setLastScored] = useState<{ date: string; guess: GameGuess } | null>(null);
  const [gameBoard, setGameBoard] = useState<LeaderRow[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);

  const [overlayId, setOverlayId] = useState("cat");
  const [overlays, setOverlays] = useState<Record<string, OverlayData>>({});

  const { data: brief } = useDailyBrief();
  const svgRef = useRef<SVGSVGElement>(null);
  const today = useGameDate();
  const yyyymm = today.slice(0, 7);
  const countdown = useLockCountdown();

  useEffect(() => {
    let cancelled = false;
    Promise.all(OVERLAYS.map(async (o) => {
      try {
        const r = await fetch(`https://www.spc.noaa.gov/products/outlook/${o.product}.nolyr.geojson`);
        if (!r.ok) return [o.id, { polys: [], legend: [] }] as const;
        return [o.id, buildOverlay(await r.json(), o.kind)] as const;
      } catch { return [o.id, { polys: [], legend: [] }] as const; }
    })).then((entries) => { if (!cancelled) setOverlays(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [g, last, lb, wn] = await Promise.all([
        getMyGuess(user.id, today), getLastScored(user.id, today),
        monthlyLeaderboard(yyyymm), getWinners(),
      ]);
      if (cancelled) return;
      // Reset first. This effect re-runs when the day turns over, and without
      // clearing, last night's locked pins stayed on the map over today's
      // outlook — the exact thing that made a finished round look live.
      setLocked(false); setSeverePin(null); setTornadoPin(null); setQuietDay(false);
      if (g) {
        setLocked(true);
        setSeverePin(g.severe); setTornadoPin(g.tornado); setQuietDay(g.tornado === null);
      }
      setLastScored(last); setGameBoard(lb); setWinners(wn);
    })();
    return () => { cancelled = true; };
  }, [user, today, yyyymm]);

  function pickOverlay(id: string) {
    setOverlayId(id);
    const o = OVERLAYS.find((x) => x.id === id);
    if (!locked && o && o.pin !== "both") setMode(o.pin);
  }

  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || locked) return;
    if (mode === "tornado" && quietDay) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((e.clientY - rect.top) / rect.height) * MAP_H;
    const { lat, lon } = unproject(x, y);
    const pin: Pin = { lat, lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
    if (mode === "severe") { setSeverePin(pin); setMode("tornado"); }
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
    if (res.ok) setLocked(true);
    else { setErr(res.error); if (res.error.includes("already")) setLocked(true); }
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

  const myRank = user ? gameBoard.findIndex((r) => r.userId === user.id) + 1 : 0;
  const myPoints = user ? gameBoard.find((r) => r.userId === user.id)?.points ?? 0 : 0;
  const myPlays = user ? gameBoard.find((r) => r.userId === user.id)?.games ?? 0 : 0;

  // Step 1 severe → step 2 tornado → step 3 lock.
  const step = locked ? 3 : !severePin ? 0 : (!tornadoPin && !quietDay) ? 1 : 2;

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
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <style>{CSS}</style>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="sswx-fg-hero" aria-hidden="true" />
        <div className="relative p-4 md:p-5">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-black tracking-wide uppercase">Forecast Game</h1>
            {!locked && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-yellow-300 bg-yellow-400/10 border border-yellow-400/30 rounded-full px-2.5 py-1">
                <Timer className="w-3 h-3" /> {countdown} to lock
              </span>
            )}
            {locked && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2.5 py-1">
                <CheckCircle2 className="w-3 h-3" /> Locked in
              </span>
            )}
          </div>
          <p className="text-xs md:text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Two calls a day: where the worst <span className="text-yellow-300 font-semibold">severe weather</span> hits,
            and where a <span className="text-red-400 font-semibold">tornado</span> touches down.
          </p>

          {/* stat strip */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { k: "Rank", v: myRank > 0 ? `#${myRank}` : "—", s: monthName.split(" ")[0] },
              { k: "Points", v: fmt(myPoints), s: "this month" },
              { k: "Rounds", v: fmt(myPlays), s: "played" },
            ].map((x) => (
              <div key={x.k} className="rounded-xl bg-muted/25 border border-border/70 px-3 py-2">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{x.k}</div>
                <div className="text-lg font-black tabular-nums leading-tight">{x.v}</div>
                <div className="text-[9px] text-muted-foreground">{x.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="relative bg-card border border-border rounded-2xl p-1.5">
        <div className="sswx-fg-pill" style={{ left: tab === "play" ? "6px" : "calc(50% + 0px)" }} />
        <div className="relative grid grid-cols-2">
          {([["play", "Play Today", Target], ["leaderboard", "Leaderboard", Trophy]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`relative z-10 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                tab === id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "play" && (
        <div className="space-y-4">
          {/* ── Last round ── */}
          {lastScored && (
            <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">Last round · {lastScored.date}</span>
                <span className="ml-auto text-2xl font-black tabular-nums text-primary sswx-fg-pop">
                  {fmt(lastScored.guess.points ?? 0)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-yellow-400/10 border border-yellow-400/25 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-yellow-300 font-bold"><Zap className="w-3 h-3" /> Severe</div>
                  <div className="text-base font-black tabular-nums">{fmt(lastScored.guess.severePoints ?? 0)}</div>
                </div>
                <div className="rounded-xl bg-red-500/10 border border-red-500/25 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 text-red-400 font-bold">
                    <Tornado className="w-3 h-3" /> {lastScored.guess.tornado ? "Tornado" : "Quiet call"}
                  </div>
                  <div className="text-base font-black tabular-nums">{fmt(lastScored.guess.tornadoPoints ?? 0)}</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step rail ── */}
          <div className="flex items-center gap-1.5 px-1">
            {["Severe pin", "Tornado pin", "Lock in"].map((label, i) => (
              <div key={label} className="flex-1 flex items-center gap-1.5">
                <div className={`flex-1 h-1.5 rounded-full transition-colors ${
                  step > i ? "bg-primary" : step === i ? "bg-primary/45" : "bg-muted/40"}`} />
                <span className={`text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${
                  step > i ? "text-primary" : step === i ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Pin selector ── */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => !locked && setMode("severe")} disabled={locked}
                className={`sswx-fg-card group rounded-2xl px-3 py-3 border text-left transition-all disabled:opacity-80 ${
                  mode === "severe" && !locked
                    ? "border-yellow-400/70 bg-yellow-400/[0.09] ring-1 ring-yellow-400/40 sswx-fg-glow-y"
                    : "border-border bg-muted/20 hover:border-yellow-400/40"}`}>
                <div className="flex items-center gap-1.5 text-yellow-300 text-[10px] font-black uppercase tracking-widest">
                  <Zap className="w-3.5 h-3.5" /> Severe
                </div>
                <div className={`text-xs mt-1.5 truncate font-semibold ${severePin ? "text-foreground" : "text-muted-foreground"}`}>
                  {severePin ? severePin.label : "Not placed"}
                </div>
              </button>

              <button onClick={() => !locked && setMode("tornado")} disabled={locked}
                className={`sswx-fg-card group rounded-2xl px-3 py-3 border text-left transition-all disabled:opacity-80 ${
                  mode === "tornado" && !locked
                    ? "border-red-500/70 bg-red-500/[0.09] ring-1 ring-red-500/40 sswx-fg-glow-r"
                    : "border-border bg-muted/20 hover:border-red-500/40"}`}>
                <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-black uppercase tracking-widest">
                  <Tornado className="w-3.5 h-3.5" /> Tornado
                </div>
                <div className={`text-xs mt-1.5 truncate font-semibold ${quietDay || tornadoPin ? "text-foreground" : "text-muted-foreground"}`}>
                  {quietDay ? "Quiet day called" : tornadoPin ? tornadoPin.label : "Not placed"}
                </div>
              </button>
            </div>

            <label className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 border cursor-pointer transition-colors ${
              quietDay ? "bg-sky-500/10 border-[#d9b775]/40 text-[#e3c88f]" : "bg-muted/20 border-border text-muted-foreground hover:border-sky-500/30"} ${locked ? "opacity-70 pointer-events-none" : ""}`}>
              <input type="checkbox" className="accent-sky-400" checked={quietDay} disabled={locked}
                onChange={(e) => { setQuietDay(e.target.checked); if (e.target.checked) setTornadoPin(null); }} />
              <span><strong>No tornadoes anywhere today.</strong> Worth <strong className="text-[#d9b775]">+{QUIET_DAY_BONUS}</strong> if it verifies with zero.</span>
            </label>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[190px] flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchCity(); }} disabled={locked}
                  placeholder={`Search a city for the ${mode === "severe" ? "⚡ severe" : "🌪 tornado"} pin…`}
                  className="bg-transparent outline-none text-sm flex-1 min-w-0 disabled:opacity-60" />
              </div>
              <button onClick={searchCity} disabled={searching || locked}
                className="px-3 py-2 rounded-xl bg-primary/20 border border-primary/40 text-primary text-sm font-bold disabled:opacity-50">
                {searching ? "…" : "Place"}
              </button>
              {!locked && (severePin || tornadoPin) && (
                <button onClick={resetPins} title="Clear both pins"
                  className="px-3 py-2 rounded-xl bg-muted/30 border border-border text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <SubmittingAsNotice what="A forecast" />
              <button onClick={submit} disabled={!severePin || locked || (!quietDay && !tornadoPin)}
                className={`px-4 py-2 rounded-xl text-sm font-black flex items-center gap-1.5 transition-all border ${
                  !severePin || locked || (!quietDay && !tornadoPin)
                    ? "bg-muted/25 border-border text-muted-foreground opacity-60"
                    : "bg-yellow-400/20 border-yellow-400/50 text-yellow-200 sswx-fg-ready"}`}>
                <Lock className="w-3.5 h-3.5" /> {locked ? "Locked" : "Lock In"}
              </button>
            </div>

            {err && <div className="text-xs text-red-400">{err}</div>}
            {!locked && (
              <div className="text-xs text-muted-foreground">
                {mode === "severe" ? "Tap the map (or search) to drop your ⚡ severe pin."
                  : quietDay ? "Quiet day called — no 🌪 pin needed. Lock in when ready."
                  : "Now drop your 🌪 tornado pin."}
              </div>
            )}

            {/* overlay switcher */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {OVERLAYS.map((o) => {
                const empty = (overlays[o.id]?.polys.length ?? 0) === 0;
                return (
                  <button key={o.id} onClick={() => pickOverlay(o.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      overlayId === o.id
                        ? "bg-primary/20 border-primary/50 text-primary scale-105"
                        : "bg-muted/20 border-border text-muted-foreground hover:text-foreground"}`}>
                    {o.label}{empty && <span className="opacity-50"> ·0</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{activeDef.blurb}</p>

            {/* ── Map ── */}
            <div className="relative bg-black rounded-2xl overflow-hidden border border-border">
              <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} onClick={handleMapClick}
                className={`w-full h-auto ${locked ? "cursor-default" : "cursor-crosshair"}`}>
                <defs>
                  <radialGradient id="sswx-fg-bg" cx="50%" cy="40%" r="75%">
                    <stop offset="0%" stopColor="#101a33" />
                    <stop offset="100%" stopColor="#04060f" />
                  </radialGradient>
                  <filter id="sswx-fg-blur"><feGaussianBlur stdDeviation="7" /></filter>
                </defs>
                <rect width={MAP_W} height={MAP_H} fill="url(#sswx-fg-bg)" />

                {US_STATES.map((s, i) => (
                  <path key={i} d={s.d} fill="#141d2e" stroke="#2c3b57" strokeWidth={0.8}>
                    <title>{s.name}</title>
                  </path>
                ))}

                {/* soft glow pass under the crisp polygons — reads as weather, not vector art */}
                <g filter="url(#sswx-fg-blur)" opacity={0.5} pointerEvents="none">
                  {active.polys.map((p, i) => <path key={`b${overlayId}${i}`} d={p.d} fill={p.color} fillOpacity={0.5} />)}
                </g>
                {active.polys.map((p, i) => (
                  <path key={`${overlayId}-${i}`} d={p.d} fill={p.color} fillOpacity={0.22}
                    stroke={p.color} strokeOpacity={0.9} strokeWidth={1} pointerEvents="none" />
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

                {sevPt && (
                  <g pointerEvents="none" className="sswx-fg-drop">
                    <circle cx={sevPt.x} cy={sevPt.y} r={16} fill="none" stroke="#fde047" strokeWidth={2} opacity={0.7}>
                      <animate attributeName="r" from="14" to="34" dur="1.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={sevPt.x} cy={sevPt.y} r={13} fill="#fde047" stroke="#1a1400" strokeWidth={2} />
                    <path d={boltPath(sevPt.x, sevPt.y)} fill="#1a1400" />
                  </g>
                )}
                {torPt && (
                  <g pointerEvents="none" className="sswx-fg-drop">
                    <circle cx={torPt.x} cy={torPt.y} r={16} fill="none" stroke="#f87171" strokeWidth={2} opacity={0.7}>
                      <animate attributeName="r" from="14" to="34" dur="1.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={torPt.x} cy={torPt.y} r={13} fill="#ef4444" stroke="#2a0505" strokeWidth={2} />
                    <path d={funnelPath(torPt.x, torPt.y)} fill="#2a0505" />
                  </g>
                )}

                <text x={20} y={28} fill="#64748b" fontSize={11} fontFamily="monospace">
                  {locked ? "PICKS LOCKED" : mode === "severe" ? "TAP TO PLACE ⚡ SEVERE PIN"
                    : quietDay ? "QUIET DAY CALLED" : "TAP TO PLACE 🌪 TORNADO PIN"}
                </text>
              </svg>

              {active.legend.length > 0 && (
                <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 max-w-[92%]">
                  {active.legend.map((l) => (
                    <span key={l.label} className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border backdrop-blur-sm"
                      style={{ background: l.color + "33", color: l.color, borderColor: l.color + "80" }}>{l.label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Scouting ── */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Scouting Report</h3>
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
                No SPC risk areas today — which makes the ⚡ pin a guess about where anything at all
                fires, and calling "no tornadoes" worth {QUIET_DAY_BONUS}.
              </p>
            )}
          </div>

          {/* ── Scoring ── */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-2"><Info className="w-4 h-4 text-primary" /> Scoring</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-yellow-300 text-[10px] font-black uppercase tracking-widest mb-2">
                  <Zap className="w-3.5 h-3.5" /> Severe pin
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Ranked on distance to the nearest storm report of any kind. The five closest pins
                  of the day place.
                </p>
                <ul className="text-xs space-y-1">
                  {SEVERE_PLACES.map((pts, i) => (
                    <li key={i} className="flex justify-between tabular-nums">
                      <span className="text-muted-foreground">{ordinal(i + 1)} closest</span>
                      <strong>{fmt(pts)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground/80 mt-2 mb-1 uppercase tracking-wider">
                  Outside the top five
                </p>
                <ul className="text-xs space-y-1">
                  {SEVERE_CONSOLATION.map((b) => (
                    <li key={b.within} className="flex justify-between tabular-nums">
                      <span className="text-muted-foreground">Within {b.within} mi</span>
                      <strong>{fmt(b.points)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-black uppercase tracking-widest mb-2">
                  <Tornado className="w-3.5 h-3.5" /> Tornado pin
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Ranked on distance to the nearest <em>tornado</em> report. The three closest place —
                  however far away that turns out to be.
                </p>
                <ul className="text-xs space-y-1">
                  <li className="flex justify-between tabular-nums">
                    <span className="text-red-300">Within {TORNADO_BULLSEYE.within} mi of a tornado</span>
                    <strong className="text-red-300">{fmt(TORNADO_BULLSEYE.points)}</strong>
                  </li>
                  {TORNADO_PLACES.map((pts, i) => (
                    <li key={i} className="flex justify-between tabular-nums">
                      <span className="text-muted-foreground">{ordinal(i + 1)} closest</span>
                      <strong>{fmt(pts)}</strong>
                    </li>
                  ))}
                  <li className="flex justify-between tabular-nums">
                    <span className="text-[#d9b775]">Correct quiet-day call</span>
                    <strong className="text-[#d9b775]">{fmt(QUIET_DAY_BONUS)}</strong>
                  </li>
                </ul>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              Both pins are added together and feed the same week/month/year board as Daily Trivia.
              Placings are decided against everybody who played that day, so what a call is worth
              depends on what everybody else called. Scoring is computed server-side from SPC storm
              reports — never in your browser.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Link href="/spc" className="bg-card border border-border rounded-2xl p-3 hover:border-primary/40 transition-colors flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> <span className="text-sm">Check today's SPC Outlook</span>
            </Link>
            <Link href="/discussion" className="bg-card border border-border rounded-2xl p-3 hover:border-primary/40 transition-colors flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> <span className="text-sm">Read the NWS Forecast Discussion</span>
            </Link>
          </div>
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="space-y-5">
          <Leaderboard meId={user.id} />

          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-yellow-400" /> Forecast Game only — {monthName}
            </h2>
            {gameBoard.length === 0 && <p className="text-sm text-muted-foreground">No rounds scored yet this month.</p>}
            <div className="space-y-1.5">
              {gameBoard.slice(0, 10).map((row, i) => (
                <div key={row.userId} className={`flex items-center gap-3 p-2.5 rounded-xl ${row.userId === user.id ? "bg-primary/10" : "bg-muted/20"}`}>
                  <div className={`w-7 h-7 rounded-full grid place-items-center font-black text-xs ${
                    i === 0 ? "bg-yellow-400/20 text-yellow-300" : i === 1 ? "bg-gray-400/20 text-foreground/80"
                    : i === 2 ? "bg-orange-700/20 text-orange-300" : "bg-muted/40 text-muted-foreground"}`}>
                    {i === 0 ? <Crown className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{row.name}</div>
                    <div className="text-[10px] text-muted-foreground">{row.games} round{row.games === 1 ? "" : "s"}</div>
                  </div>
                  <div className="text-base font-black tabular-nums text-primary">{fmt(row.points)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Forecast Game champions
            </h2>
            {/* Named for its board on purpose: the Hall of Fame above crowns the
                site-wide points month, this one crowns the Forecast Game month,
                and the two are often different people. */}
            <p className="text-[11px] text-muted-foreground mb-3">
              Who won the Forecast Game each month — scored on rounds played here, not on site-wide points.
            </p>
            {winners.length === 0 && <p className="text-sm text-muted-foreground">No champions crowned yet.</p>}
            <div className="space-y-1.5">
              {winners.map((w) => (
                <div key={w.month} className="flex items-center justify-between p-2.5 bg-muted/20 rounded-xl">
                  <div className="text-sm font-semibold">{w.month}</div>
                  <div className="flex items-center gap-2">
                    <Crown className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-sm font-bold">{w.userName}</span>
                    <span className="text-xs text-muted-foreground">({fmt(w.points)})</span>
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

/** Lightning bolt centred on (cx, cy), drawn inside the ⚡ pin disc. */
function boltPath(cx: number, cy: number): string {
  const s = 0.6;
  const p = (dx: number, dy: number) => `${(cx + dx * s).toFixed(1)},${(cy + dy * s).toFixed(1)}`;
  return `M${p(2, -11)}L${p(-7, 2)}L${p(-1, 2)}L${p(-3, 11)}L${p(7, -2)}L${p(1, -2)}Z`;
}
/** Funnel centred on (cx, cy), drawn inside the 🌪 pin disc. */
function funnelPath(cx: number, cy: number): string {
  const s = 0.6;
  const p = (dx: number, dy: number) => `${(cx + dx * s).toFixed(1)},${(cy + dy * s).toFixed(1)}`;
  return `M${p(-10, -9)}L${p(10, -9)}L${p(6, -3)}L${p(-6, -3)}Z ` +
         `M${p(-6, -1)}L${p(6, -1)}L${p(3, 5)}L${p(-3, 5)}Z ` +
         `M${p(-3, 7)}L${p(3, 7)}L${p(1, 12)}L${p(-1, 12)}Z`;
}

const CSS = `
.sswx-fg-hero{position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(60% 120% at 15% 0%, rgba(253,224,71,.10), transparent 60%),
    radial-gradient(50% 120% at 85% 10%, rgba(239,68,68,.10), transparent 60%);}
.sswx-fg-pill{position:absolute;top:6px;bottom:6px;width:calc(50% - 6px);border-radius:.75rem;
  background:linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary)/.75));
  transition:left .3s cubic-bezier(.22,1,.36,1);z-index:0}
.sswx-fg-glow-y{box-shadow:0 0 0 1px rgba(253,224,71,.25),0 6px 22px -8px rgba(253,224,71,.55)}
.sswx-fg-glow-r{box-shadow:0 0 0 1px rgba(239,68,68,.25),0 6px 22px -8px rgba(239,68,68,.55)}
.sswx-fg-ready{animation:sswx-fg-pulse 2.2s ease-in-out infinite}
@keyframes sswx-fg-pulse{
  0%,100%{box-shadow:0 0 0 0 rgba(253,224,71,.35)}
  50%{box-shadow:0 0 0 7px rgba(253,224,71,0)}}
.sswx-fg-drop{animation:sswx-fg-plant .42s cubic-bezier(.2,1.5,.4,1) both;transform-origin:center}
@keyframes sswx-fg-plant{from{opacity:0;transform:translateY(-16px) scale(.5)}to{opacity:1;transform:none}}
.sswx-fg-pop{display:inline-block;animation:sswx-fg-popin .55s cubic-bezier(.16,1.6,.3,1) both}
@keyframes sswx-fg-popin{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  .sswx-fg-pill{transition:none}
  .sswx-fg-ready,.sswx-fg-drop,.sswx-fg-pop{animation:none!important;opacity:1!important;transform:none!important}
  svg animate{display:none}
}
`;
