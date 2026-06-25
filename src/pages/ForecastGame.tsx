import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "../hooks/useAuth";
import { getMyGuess, lockGuess, monthlyLeaderboard, getWinners, type GameGuess, type LeaderRow, type WinnerRow } from "../lib/gameDb";
import { useDailyBrief } from "../hooks/useDailyBrief";
import { geocodeLocation } from "../utils/weatherApi";
import usStatesAlbers from "../data/usStatesAlbers.json";
import { Gamepad2, Search, MapPin, Trophy, Calendar, Crown, Target, Info, ExternalLink, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type Tab = "play" | "leaderboard";

const BASE = import.meta.env.BASE_URL;
const US_STATES = (usStatesAlbers as { states: { name: string; d: string }[] }).states;

// us-atlas albers-USA projection size (matches api-server /api/us-states)
const MAP_W = 975;
const MAP_H = 610;

// Inverse Albers USA approximation: use a calibrated affine fit to map
// projected (x,y) back to (lon,lat) for the contiguous US. Good enough for
// guessing — accurate to ~15-25 mi over CONUS.
// Calibrated against known cities projected by d3-geo geoAlbersUsa scaled to fit 975×610.
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
// Solve x = a + b*lon + c*lat, y = d + e*lon + f*lat (least squares)
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
  // normal equations 3x3
  const A = [
    [n,     sLon,    sLat   ],
    [sLon,  sLonLon, sLonLat],
    [sLat,  sLonLat, sLatLat],
  ];
  const bx = [sX,   sXLon, sXLat];
  const by = [sY,   sYLon, sYLat];
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
  // invert 2x2 using b,c | e,f
  const { a, b, c, d, e, f } = AFFINE;
  const det = b * f - c * e;
  const lon = (f * (x - a) - c * (y - d)) / det;
  const lat = (-e * (x - a) + b * (y - d)) / det;
  return { lat, lon };
}

// Major metros for on-map orientation labels (projected through the same affine).
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

const CAT_RANK: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };
const CAT_MEANING: Record<string, string> = {
  TSTM: "General thunderstorms — not severe.",
  MRGL: "Marginal — isolated severe possible.",
  SLGT: "Slight — scattered severe storms.",
  ENH: "Enhanced — numerous severe storms likely.",
  MDT: "Moderate — widespread, intense severe.",
  HIGH: "High — a severe/tornado outbreak.",
};

interface SPCOutlookInfo {
  day: number;
  issued: string | null;
  riskAreas: { label: string; color: string; code: string }[];
}

export default function ForecastGame() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("play");
  const [todayGuess, setTodayGuess] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [locked, setLocked] = useState(false);
  const [myResult, setMyResult] = useState<GameGuess | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const states = US_STATES;
  const [outlook, setOutlook] = useState<SPCOutlookInfo | null>(null);
  const [riskPolys, setRiskPolys] = useState<{ d: string; color: string; rank: number }[]>([]);
  const { data: brief } = useDailyBrief();
  const svgRef = useRef<SVGSVGElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const yyyymm = today.slice(0, 7);

  // Pull today's SPC categorical outlook to show inline
  useEffect(() => {
    const url = `https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson`;
    fetch(url).then(r => r.ok ? r.json() : null).then(d => {
      if (!d || !d.features) { setOutlook({ day: 1, issued: null, riskAreas: [] }); return; }
      const colorMap: Record<string, string> = {
        "TSTM": "#84CC16", "MRGL": "#48a832", "SLGT": "#f7e98e",
        "ENH": "#e6a23c", "MDT": "#dc2626", "HIGH": "#ff00ff",
      };
      const seen = new Set<string>();
      const areas: { label: string; color: string }[] = [];
      const polys: { d: string; color: string; rank: number }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of d.features as any[]) {
        const code: string = f.properties?.LABEL || "";
        const lbl: string = f.properties?.LABEL2 || code || "";
        const color = colorMap[code] || "#7B8FD9";
        if (lbl && !seen.has(lbl)) { seen.add(lbl); areas.push({ label: lbl, color, code }); }
        // Project the polygon geometry onto the SVG so the risk shows on the map.
        const g = f.geometry;
        const rings: number[][][][] = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
        for (const poly of rings) {
          let path = "";
          for (const ring of poly) {
            ring.forEach((co, idx) => {
              const p = project(co[0], co[1]);
              path += `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            });
            path += "Z";
          }
          polys.push({ d: path, color, rank: CAT_RANK[code] ?? 0 });
        }
      }
      polys.sort((p1, p2) => p1.rank - p2.rank); // higher categories drawn on top
      setRiskPolys(polys);
      setOutlook({ day: 1, issued: new Date().toISOString(), riskAreas: areas });
    }).catch(() => { setOutlook({ day: 1, issued: null, riskAreas: [] }); setRiskPolys([]); });
  }, []);

  // Load my locked guess for today + the leaderboard/winners from Supabase.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const mine = await getMyGuess(user.id, today);
      if (cancelled) return;
      if (mine) { setTodayGuess({ lat: mine.lat, lon: mine.lon, label: mine.label }); setLocked(true); setMyResult(mine); }
      const [lb, wn] = await Promise.all([monthlyLeaderboard(yyyymm), getWinners()]);
      if (cancelled) return;
      setLeaderboard(lb); setWinners(wn);
    })();
    return () => { cancelled = true; };
  }, [user, today, yyyymm]);

  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || locked) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((e.clientY - rect.top) / rect.height) * MAP_H;
    const { lat, lon } = unproject(x, y);
    setTodayGuess({ lat, lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` });
  }

  async function searchCity() {
    if (!cityQuery.trim()) return;
    setSearching(true); setSearchErr("");
    try {
      const results = await geocodeLocation(cityQuery);
      const us = results.find(r => r.name.toUpperCase().includes("US")) || results[0];
      if (!us) { setSearchErr("City not found"); return; }
      setTodayGuess({ lat: us.lat, lon: us.lon, label: us.name });
      setCityQuery("");
    } catch { setSearchErr("Search failed"); }
    finally { setSearching(false); }
  }

  async function submit() {
    if (!user || !todayGuess || locked) return;
    const res = await lockGuess({ userId: user.id, userName: user.name, lat: todayGuess.lat, lon: todayGuess.lon, label: todayGuess.label, date: today });
    if (res.ok) {
      setLocked(true);
      setMyResult({ lat: todayGuess.lat, lon: todayGuess.lon, label: todayGuess.label, points: null });
    } else {
      setSearchErr(res.error);
      if (res.error.includes("already")) setLocked(true);
    }
  }

  const monthName = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  if (!user) {
    return (
      <div className="p-6 text-center space-y-3">
        <Gamepad2 className="w-10 h-10 text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Sign in to play the Forecast Game.</p>
        <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm">Sign in</Link>
      </div>
    );
  }

  const pt = todayGuess ? project(todayGuess.lon, todayGuess.lat) : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Forecast Game</h1>
      </div>
      <p className="text-sm text-muted-foreground">Place a dot where you think the worst severe weather will hit today. Scoring runs after midnight UTC against the day's NWS storm reports.</p>

      <div className="grid grid-cols-2 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setTab("play")} className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${tab === "play" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}><Target className="w-4 h-4" /> Play Today</button>
        <button onClick={() => setTab("leaderboard")} className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${tab === "leaderboard" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}><Trophy className="w-4 h-4" /> Leaderboard</button>
      </div>

      {tab === "play" && (
        <div className="space-y-4">
          {/* Inline outlook info */}
          {outlook && (
            <div className="bg-gradient-to-r from-card via-card to-red-900/10 border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">SPC Day 1 Outlook:</span>{" "}
                {outlook.riskAreas.length === 0
                  ? <span className="text-muted-foreground">No severe weather risk areas issued.</span>
                  : <span className="text-muted-foreground">Active risk areas →</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {outlook.riskAreas.map(r => (
                  <span key={r.label} className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border" style={{ background: r.color + "20", color: r.color, borderColor: r.color + "60" }}>{r.label}</span>
                ))}
              </div>
              <Link href="/spc" className="text-[10px] text-primary hover:underline ml-auto">Open full outlook →</Link>
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input value={cityQuery} onChange={e => setCityQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") searchCity(); }} placeholder="Type a city to drop a pin..." className="bg-transparent outline-none text-sm flex-1" />
              </div>
              <button onClick={searchCity} disabled={searching || locked} className="px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold disabled:opacity-50">{searching ? "..." : "Place Pin"}</button>
              <button onClick={submit} disabled={!todayGuess || locked} className="px-3 py-2 rounded-lg bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"><Target className="w-3 h-3" /> {locked ? "Locked In" : "Lock In Guess"}</button>
            </div>
            {searchErr && <div className="text-xs text-red-400">{searchErr}</div>}
            {todayGuess && <div className="text-xs text-primary flex items-center gap-1"><MapPin className="w-3 h-3" /> Pin at <span className="font-mono">{todayGuess.label}</span></div>}
            {locked && (
              <div className="text-xs rounded-lg px-3 py-2 bg-yellow-400/10 border border-yellow-400/30 text-yellow-200">
                {myResult && myResult.points !== null
                  ? <>✅ Yesterday's guess scored <strong>{myResult.points.toLocaleString()} pts</strong>. Today's guess is locked — scoring runs tonight against SPC storm reports.</>
                  : <>🔒 Today's guess is locked in. Scoring runs tonight (after 00 UTC) against the day's SPC storm reports — check the leaderboard tomorrow.</>}
              </div>
            )}

            <div className="relative bg-black rounded-xl overflow-hidden border border-border">
              <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} onClick={handleMapClick} className="w-full h-auto cursor-crosshair">
                <defs>
                  <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#050818" />
                    <stop offset="100%" stopColor="#0a0f24" />
                  </linearGradient>
                </defs>
                <rect width={MAP_W} height={MAP_H} fill="url(#bg)" />
                {states.length === 0 && (
                  <text x={MAP_W / 2} y={MAP_H / 2} textAnchor="middle" fill="#475569" fontSize={14}>Loading US states…</text>
                )}
                {states.map((s, i) => (
                  <path key={i} d={s.d} fill="#172033" stroke="#283449" strokeWidth={0.8}>
                    <title>{s.name}</title>
                  </path>
                ))}
                {/* SPC risk polygons — the scouting overlay */}
                {riskPolys.map((p, i) => (
                  <path key={`r${i}`} d={p.d} fill={p.color} fillOpacity={0.32} stroke={p.color} strokeOpacity={0.75} strokeWidth={0.8} pointerEvents="none" />
                ))}
                {/* City orientation labels */}
                {GAME_CITIES.map(ci => {
                  const p = project(ci.lon, ci.lat);
                  return (
                    <g key={ci.name} pointerEvents="none">
                      <circle cx={p.x} cy={p.y} r={2.2} fill="#e2e8f0" stroke="#000" strokeWidth={0.5} />
                      <text x={p.x + 4} y={p.y + 3} fill="#cbd5e1" fontSize={8.5} fontFamily="system-ui" style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 1.6 }}>{ci.name}</text>
                    </g>
                  );
                })}
                {pt && (
                  <g>
                    <circle cx={pt.x} cy={pt.y} r={18} fill="none" stroke="#fde047" strokeWidth={2} opacity={0.6}>
                      <animate attributeName="r" from="18" to="30" dur="1.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="1.4s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={pt.x} cy={pt.y} r={9} fill="#fde047" stroke="#000" strokeWidth={1.5} />
                  </g>
                )}
                <text x={20} y={28} fill="#64748b" fontSize={11} fontFamily="monospace">CLICK ANY STATE TO PLACE A PIN</text>
              </svg>
            </div>
          </div>

          {/* Scouting Report — helps the player pick a target */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Scouting Report</h3>
            {brief?.headline && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-primary font-semibold">National picture: </span>{brief.headline}
                {brief.content?.risk_overview?.day1_category_name && <span className="text-foreground"> · SPC Day 1: {brief.content.risk_overview.day1_category_name}</span>}
              </p>
            )}
            {outlook && outlook.riskAreas.length > 0 ? (
              <div className="space-y-1.5">
                {[...outlook.riskAreas].sort((x, y) => (CAT_RANK[y.code] ?? 0) - (CAT_RANK[x.code] ?? 0)).map(r => (
                  <div key={r.label} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
                    <span><strong style={{ color: r.color }}>{r.label}</strong> <span className="text-muted-foreground">— {CAT_MEANING[r.code] ?? "Severe risk area."}</span></span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No SPC severe risk areas issued today — a quiet-day pin still scores 25 pts, so aim where storms are most likely.</p>
            )}
            <p className="text-[11px] text-primary/90">🎯 The shaded areas on the map are today's SPC risk. Drop your pin inside the highest category for the best shot at points + the tornado bonus.</p>
          </div>

          {/* Scoring rules */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Info className="w-4 h-4 text-primary" /> Scoring Rules</h3>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside leading-relaxed">
              <li><strong className="text-foreground">Bullseye (≤ 25 mi):</strong> 1000 points.</li>
              <li><strong className="text-foreground">Close (≤ 75 mi):</strong> 600 points.</li>
              <li><strong className="text-foreground">Near (≤ 150 mi):</strong> 300 points.</li>
              <li><strong className="text-foreground">Distant (≤ 300 mi):</strong> 100 points.</li>
              <li><strong className="text-foreground">Way off (&gt; 300 mi) or a quiet day:</strong> 25 points.</li>
              <li><strong className="text-yellow-300">Tornado bonus:</strong> +500 if your pin lands within 50 mi of a tornado report.</li>
              <li>Leaderboard resets the first of each month; the monthly winner is crowned automatically.</li>
            </ul>
            <p className="text-[10px] text-muted-foreground/70 mt-2">Your guess is scored against the nearest SPC storm report (tornado / hail / wind) for the day. Scoring runs nightly.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Link href="/spc" className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> <span className="text-sm">Check today's SPC Outlook before guessing</span>
            </Link>
            <Link href="/discussion" className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> <span className="text-sm">Read the NWS Forecast Discussion</span>
            </Link>
          </div>
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Trophy className="w-4 h-4 text-yellow-400" /> Top 5 — {monthName}</h2>
            {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">No guesses scored yet this month. Be the first.</p>}
            <div className="space-y-2">
              {leaderboard.slice(0, 5).map((row, i) => (
                <div key={row.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? "bg-yellow-400/20 text-yellow-300" : i === 1 ? "bg-gray-400/20 text-gray-300" : i === 2 ? "bg-orange-700/20 text-orange-300" : "bg-muted/40 text-muted-foreground"}`}>
                    {i === 0 ? <Crown className="w-4 h-4" /> : `#${i + 1}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.games} games</div>
                  </div>
                  <div className="text-lg font-bold tabular-nums text-primary">{row.points.toLocaleString()} pts</div>
                </div>
              ))}
            </div>
            {leaderboard.length > 0 && (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={leaderboard.slice(0, 5).map(r => ({ name: r.name.split(" ")[0], points: r.points }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip contentStyle={{ background: "#0a0a18", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="points" radius={[4, 4, 0, 0]}>
                      {leaderboard.slice(0, 5).map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "#fde047" : i === 1 ? "#9ca3af" : i === 2 ? "#fb923c" : "#7B8FD9"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-primary" /> Monthly Winners</h2>
            {winners.length === 0 && <p className="text-sm text-muted-foreground">No champions crowned yet. Will it be you?</p>}
            <div className="space-y-1.5">
              {winners.map(w => (
                <div key={w.month} className="flex items-center justify-between p-2.5 bg-muted/20 rounded-lg">
                  <div className="text-sm font-medium">{w.month}</div>
                  <div className="flex items-center gap-2">
                    <Crown className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-sm font-semibold">{w.userName}</span>
                    <span className="text-xs text-muted-foreground">({w.points.toLocaleString()} pts)</span>
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
