import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDailyBrief } from "../hooks/useDailyBrief";
import type { Location } from "../hooks/useLocation";
import { Car, ExternalLink, Crosshair, Brain, MapPin, Clock, Flame, RefreshCw } from "lucide-react";
import { computeSRHFromProfile, compute06kmShear, computeSWTI, cToF, mpsToKnots } from "../utils/weatherCalc";
import { CHASE_CITIES } from "../data/usChaseCities";
import { US_STATES, MAP_W, MAP_H, project } from "../lib/usAlbers";
import { BASE_API } from "../config";

interface Props { location: Location }

const CHASE_RESOURCES = [
  { label: "SPC Day 1 Outlook", url: "https://www.spc.noaa.gov/products/outlook/day1otlk.html", desc: "Official convective outlook" },
  { label: "SPC Watches", url: "https://www.spc.noaa.gov/products/watch/", desc: "Active tornado/severe watches" },
  { label: "SPC Mesoanalysis", url: "https://www.spc.noaa.gov/exper/mesoanalysis/", desc: "Real-time atmospheric analysis" },
  { label: "RadarScope", url: "https://www.radarscope.app/", desc: "Professional radar app" },
  { label: "Spotter Network", url: "https://www.spotternetwork.org/", desc: "Real-time spotter positions" },
  { label: "Pivotal Weather", url: "https://www.pivotalweather.com/", desc: "Model data and maps" },
];

// Simplified fixed-layer Significant Tornado Parameter from available fields.
function computeSTP(cape: number, srh: number, shearKts: number, li: number): number {
  const capeT = cape / 1500, srhT = srh / 150;
  let shrT = shearKts / 20; if (shearKts < 12.5) shrT = 0; else if (shearKts > 30) shrT = 1.5;
  const liT = li <= -4 ? 1 : li <= -2 ? 0.85 : li <= 0 ? 0.6 : 0.3;
  return Math.max(0, Math.round(capeT * srhT * shrT * liT * 10) / 10);
}

interface ScanLoc { latitude: number; longitude: number; hourly?: Record<string, (number | null)[]> & { time?: string[] }; }
const VARS = [
  "cape", "lifted_index", "dew_point_2m", "temperature_2m", "temperature_850hPa", "precipitation_probability",
  "wind_speed_10m", "wind_direction_10m", "wind_speed_925hPa", "wind_direction_925hPa",
  "wind_speed_850hPa", "wind_direction_850hPa", "wind_speed_700hPa", "wind_direction_700hPa",
  "wind_speed_500hPa", "wind_direction_500hPa",
].join(",");

async function fetchNationalScan(): Promise<ScanLoc[]> {
  const lats = CHASE_CITIES.map(c => c.lat.toFixed(2)).join(",");
  const lons = CHASE_CITIES.map(c => c.lon.toFixed(2)).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=${VARS}&forecast_days=2&timezone=auto&wind_speed_unit=ms`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const d = await r.json();
  return Array.isArray(d) ? d : [d];
}

// ── SPC categorical (for risk-area alignment) ───────────────────────────────────
const CAT_RANK: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };
type RiskPoly = { rings: number[][][]; rank: number };
async function fetchSpcRisk(): Promise<RiskPoly[]> {
  const r = await fetch(`${BASE_API}/spc/outlook-geojson?product=day1otlk_cat`);
  if (!r.ok) return [];
  const d = await r.json();
  const out: RiskPoly[] = [];
  for (const f of d.features ?? []) {
    const rank = CAT_RANK[String(f.properties?.LABEL ?? "").toUpperCase()] ?? 0;
    const g = f.geometry;
    const polys: number[][][][] = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) out.push({ rings: poly, rank });
  }
  return out;
}
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function spcRankAt(lon: number, lat: number, polys: RiskPoly[]): number {
  let best = 0;
  for (const p of polys) { if (p.rank > best && p.rings.length && pointInRing(lon, lat, p.rings[0])) best = p.rank; }
  return best;
}

interface Target {
  name: string; state: string; lat: number; lon: number;
  cape: number; srhV: number; shearKts: number; swti: number; stp: number; li: number; dewC: number; lclM: number; cap850: number;
  precip: number; peakLabel: string; spcRank: number; hype: number; composite: number;
}

function tierFor(hype: number) {
  if (hype >= 8) return { tier: "PRIME", color: "#d946ef", flames: 3 };
  if (hype >= 6) return { tier: "GOOD", color: "#ef4444", flames: 2 };
  if (hype >= 4) return { tier: "MODERATE", color: "#f97316", flames: 1 };
  if (hype >= 2) return { tier: "LOW-END", color: "#fde047", flames: 0 };
  return { tier: "NO SETUP", color: "#4ade80", flames: 0 };
}
function capRead(t850: number) {
  if (t850 >= 16) return { text: "Strong cap", color: "#ef4444" };
  if (t850 >= 13) return { text: "Moderate cap", color: "#f97316" };
  if (t850 >= 10) return { text: "Weak cap", color: "#fde047" };
  return { text: "Uncapped", color: "#4ade80" };
}

function buildTake(t: Target): string {
  const parts: string[] = [];
  const capeTxt = t.cape >= 3000 ? "extreme instability" : t.cape >= 2000 ? "strong instability" : t.cape >= 1000 ? "moderate instability" : "limited instability";
  const shearTxt = t.shearKts >= 50 ? "intense deep-layer shear" : t.shearKts >= 35 ? "supercell-supporting shear" : t.shearKts >= 20 ? "modest shear" : "weak shear";
  parts.push(`${capeTxt[0].toUpperCase() + capeTxt.slice(1)} (CAPE ~${Math.round(t.cape).toLocaleString()} J/kg) overlapping ${shearTxt} (~${Math.round(t.shearKts)} kt) near ${t.name}, ${t.state}.`);
  if (t.srhV >= 250 && t.shearKts >= 35 && t.cape >= 1500) parts.push(`Low-level helicity is high (${Math.round(t.srhV)} m²/s²) and the cloud base is ${t.lclM <= 1000 ? "low" : "moderate"} — a tornado-favorable, discrete-supercell setup.`);
  else if (t.shearKts >= 30 && t.cape >= 1000) parts.push(`Organized storms — including supercells with large hail and damaging wind — are the main mode.`);
  else if (t.cape >= 800) parts.push(`Mostly pulse/multicell storms; isolated strong cells possible but organization is limited.`);
  else parts.push(`Thermodynamics are too weak for organized severe storms.`);
  if (t.cap850 >= 16 && t.cape >= 1500) parts.push(`A strong cap may limit initiation — storms that break it could be explosive, but a bust is a real risk.`);
  else if (t.cap850 < 10 && t.cape >= 1500) parts.push(`Little capping — expect numerous storms once the trigger arrives.`);
  return parts.join(" ");
}
function buildExcitement(hype: number): string {
  if (hype >= 8) return "This is a go day. If you can get to the target, do it — high-end supercell/tornado potential.";
  if (hype >= 6) return "Worth the drive. Favorable parameters; set up early and play the best cell.";
  if (hype >= 4) return "Marginal but chaseable. Reasonable if you're local — keep expectations measured.";
  if (hype >= 2) return "Low-end. Only worth it if it's in your backyard; mostly a structure/lightning day.";
  return "Not a chase day. Parameters are too weak anywhere in the country — rest up for the next setup.";
}

export default function StormChasingOutlook(_props: Props) {
  void _props;
  const [tab, setTab] = useState<"targets" | "resources">("targets");
  const { data: brief } = useDailyBrief();
  const { data: scan, isLoading, isError, refetch, isFetching } = useQuery({ queryKey: ["chase-scan"], queryFn: fetchNationalScan, staleTime: 30 * 60 * 1000 });
  const { data: spcRisk } = useQuery({ queryKey: ["chase-spc-risk"], queryFn: fetchSpcRisk, staleTime: 30 * 60 * 1000 });

  const ranked = useMemo<Target[]>(() => {
    if (!scan) return [];
    const polys = spcRisk ?? [];
    const out = scan.map((loc, idx) => {
      const city = CHASE_CITIES[idx];
      if (!city) return null;
      const h = loc.hourly; if (!h?.time) return null;
      const n = h.time.length;
      let bestSwti = -1, bestJ = 0;
      for (let j = 4; j < Math.min(n, 34); j++) {
        const cape = h.cape?.[j] ?? 0, li = h.lifted_index?.[j] ?? 0, dewC = h.dew_point_2m?.[j] ?? 10;
        const sh = compute06kmShear(h.wind_speed_10m?.[j] ?? 0, h.wind_direction_10m?.[j] ?? 0, h.wind_speed_500hPa?.[j] ?? 0, h.wind_direction_500hPa?.[j] ?? 0);
        const srhV = computeSRHFromProfile(h.wind_speed_10m?.[j] ?? 0, h.wind_direction_10m?.[j] ?? 0, h.wind_speed_925hPa?.[j] ?? 0, h.wind_direction_925hPa?.[j] ?? 0, h.wind_speed_850hPa?.[j] ?? 0, h.wind_direction_850hPa?.[j] ?? 0, h.wind_speed_700hPa?.[j] ?? 0, h.wind_direction_700hPa?.[j] ?? 0, h.wind_speed_500hPa?.[j] ?? 0, h.wind_direction_500hPa?.[j] ?? 0);
        const res = computeSWTI({ cape, srh: srhV, shear06km: sh, liftedIndex: li, dewPointC: dewC });
        if (res.score > bestSwti) { bestSwti = res.score; bestJ = j; }
      }
      const j = bestJ;
      const cape = h.cape?.[j] ?? 0, li = h.lifted_index?.[j] ?? 0, dewC = h.dew_point_2m?.[j] ?? 10;
      const t2m = h.temperature_2m?.[j] ?? dewC, t850 = h.temperature_850hPa?.[j] ?? 0;
      const sh = compute06kmShear(h.wind_speed_10m?.[j] ?? 0, h.wind_direction_10m?.[j] ?? 0, h.wind_speed_500hPa?.[j] ?? 0, h.wind_direction_500hPa?.[j] ?? 0);
      const srhV = computeSRHFromProfile(h.wind_speed_10m?.[j] ?? 0, h.wind_direction_10m?.[j] ?? 0, h.wind_speed_925hPa?.[j] ?? 0, h.wind_direction_925hPa?.[j] ?? 0, h.wind_speed_850hPa?.[j] ?? 0, h.wind_direction_850hPa?.[j] ?? 0, h.wind_speed_700hPa?.[j] ?? 0, h.wind_direction_700hPa?.[j] ?? 0, h.wind_speed_500hPa?.[j] ?? 0, h.wind_direction_500hPa?.[j] ?? 0);
      const shearKts = mpsToKnots(sh);
      const swti = computeSWTI({ cape, srh: srhV, shear06km: sh, liftedIndex: li, dewPointC: dewC }).score;
      const stp = computeSTP(cape, srhV, shearKts, li);
      const spcRank = spcRankAt(city.lon, city.lat, polys);
      const composite = swti + spcRank * 5;
      const hype = Math.max(0, Math.min(10, Math.round(swti / 11 + spcRank * 0.8)));
      const lclM = Math.max(0, Math.round(125 * (t2m - dewC)));
      const peakRaw = h.time?.[j] ?? "";
      let peakLabel = "";
      try { peakLabel = new Date(peakRaw).toLocaleString("en-US", { weekday: "short", hour: "numeric" }); } catch { peakLabel = ""; }
      return { name: city.name, state: city.state, lat: city.lat, lon: city.lon, cape, srhV, shearKts, swti, stp, li, dewC, lclM, cap850: t850, precip: h.precipitation_probability?.[j] ?? 0, peakLabel, spcRank, hype, composite } as Target;
    }).filter((x): x is Target => x !== null);
    out.sort((a, b) => b.composite - a.composite);
    return out;
  }, [scan, spcRisk]);

  const targets = ranked.slice(0, 2);
  const bestHype = targets[0]?.hype ?? 0;
  const verdict = tierFor(bestHype);
  const aiTargets = brief?.content.chase_targets ?? [];
  const dotColor = (hype: number) => tierFor(hype).color;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2"><Car className="w-5 h-5 text-primary" /><h1 className="text-xl font-bold tracking-wide uppercase">Storm Chasing Outlook</h1></div>
          <p className="text-sm text-muted-foreground mt-0.5">Live national scan · the day's 2 best chase targets, ranked &amp; explained</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40 disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Rescan
        </button>
      </div>

      {!isLoading && !isError && (
        <div className="rounded-2xl border-2 p-5 text-center" style={{ borderColor: verdict.color + "66", background: verdict.color + "10" }}>
          <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-1">National Chase Verdict</div>
          <div className="text-3xl font-black tracking-wider" style={{ color: verdict.color }}>{verdict.tier === "NO SETUP" ? "NOT A CHASE DAY" : `${verdict.tier} CHASE DAY`}</div>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-lg mx-auto">{buildExcitement(bestHype)}</p>
        </div>
      )}

      <div className="flex gap-2">
        {(["targets", "resources"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
            {t === "targets" ? "Targets & Scan" : "Resources"}
          </button>
        ))}
      </div>

      {tab === "targets" && (
        <>
          {isLoading && <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">Scanning the country…</div>}
          {isError && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">Could not run the national scan. Try Rescan.</div>}

          {!isLoading && !isError && ranked.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-black/30"><h3 className="text-sm font-semibold flex items-center gap-1.5"><Crosshair className="w-4 h-4 text-primary" /> National Scan — {ranked.length} cities</h3></div>
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: "100%", height: "auto", display: "block", background: "#0a0e1a" }}>
                {US_STATES.map((s, i) => <path key={i} d={s.d} fill="#141a28" stroke="#2b3650" strokeWidth={0.8} />)}
                {ranked.map((t, i) => { const p = project(t.lon, t.lat); return <circle key={i} cx={p.x} cy={p.y} r={4 + t.hype * 0.9} fill={dotColor(t.hype)} fillOpacity={0.85} stroke="#0a0e1a" strokeWidth={1} />; })}
                {targets.map((t, i) => { const p = project(t.lon, t.lat); return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={18} fill="none" stroke="#ffffff" strokeWidth={2.5} />
                    <text x={p.x} y={p.y - 24} textAnchor="middle" fill="#ffffff" fontSize={20} fontWeight={800} fontFamily="system-ui, sans-serif">{i + 1}</text>
                  </g>
                ); })}
              </svg>
            </div>
          )}

          {!isLoading && !isError && targets.map((t, i) => {
            const tier = tierFor(t.hype);
            const cap = capRead(t.cap850);
            const aiMatch = aiTargets.find(a => a.area && (a.area.toLowerCase().includes(t.state.toLowerCase()) || a.area.toLowerCase().includes(t.name.toLowerCase().split("–")[0])));
            const stats = [
              { k: "CAPE", v: Math.round(t.cape).toLocaleString(), u: "J/kg" },
              { k: "0–6 SHEAR", v: Math.round(t.shearKts), u: "kt" },
              { k: "0–3 SRH", v: Math.round(t.srhV), u: "m²/s²" },
              { k: "SWTI", v: t.swti, u: "/100" },
              { k: "STP", v: t.stp.toFixed(1), u: "" },
              { k: "LCL", v: t.lclM.toLocaleString(), u: "m" },
              { k: "DEWPOINT", v: Math.round(cToF(t.dewC)), u: "°F" },
              { k: "CAP", v: cap.text, u: "" },
            ];
            return (
              <div key={i} className="bg-card border rounded-2xl overflow-hidden" style={{ borderColor: tier.color + "55" }}>
                <div className="px-4 py-3 border-b border-border flex items-center justify-between" style={{ background: tier.color + "12" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm" style={{ background: tier.color + "22", color: tier.color }}>{i + 1}</div>
                    <div>
                      <div className="font-bold flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /> {t.name}, {t.state}</div>
                      <div className="text-[11px] flex items-center gap-1.5" style={{ color: tier.color }}>
                        {tier.tier}{t.peakLabel && <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> peak {t.peakLabel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-0.5 justify-end">{Array.from({ length: 3 }).map((_, f) => <Flame key={f} className="w-4 h-4" style={{ color: f < tier.flames ? tier.color : "#2b3650" }} />)}</div>
                    <div className="text-2xl font-black leading-none mt-0.5" style={{ color: tier.color }}>{t.hype}<span className="text-xs text-muted-foreground">/10</span></div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">hype</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-px bg-border">
                  {stats.map(s => (
                    <div key={s.k} className="bg-card p-2.5 text-center">
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
                      <div className="text-base font-bold mt-0.5">{s.v}<span className="text-[10px] text-muted-foreground font-normal"> {s.u}</span></div>
                    </div>
                  ))}
                </div>
                <div className="p-4 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">Why this target</div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{buildTake(t)}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed"><strong className="text-foreground">What to expect:</strong> {buildExcitement(t.hype)}</p>
                  {aiMatch && <div className="mt-1 bg-primary/5 border border-primary/20 rounded-lg p-2.5 text-xs"><span className="font-semibold text-primary flex items-center gap-1 mb-0.5"><Brain className="w-3 h-3" /> SSWX AI note</span> <span className="text-muted-foreground">{aiMatch.reason}{aiMatch.hazards ? ` Hazards: ${aiMatch.hazards}` : ""}</span></div>}
                </div>
              </div>
            );
          })}

          {brief?.content?.discussion_plain && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Brain className="w-4 h-4 text-primary" /> SSWX National Discussion</h3>
              {brief.headline && <div className="font-semibold text-sm mb-1">{brief.headline}</div>}
              <p className="text-xs text-muted-foreground leading-relaxed">{brief.content.discussion_plain}</p>
              {brief.content.pattern && <p className="text-xs text-muted-foreground leading-relaxed mt-2"><strong className="text-foreground">Pattern: </strong>{brief.content.pattern}</p>}
            </div>
          )}
        </>
      )}

      {tab === "resources" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CHASE_RESOURCES.map(r => (
            <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer" className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors flex items-start gap-2">
              <ExternalLink className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div><div className="text-sm font-semibold">{r.label}</div><div className="text-xs text-muted-foreground">{r.desc}</div></div>
            </a>
          ))}
        </div>
      )}

      <div className="bg-muted/20 border border-border rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
        Targets are ranked live from a national model scan (Open-Meteo) blended with the SPC Day 1 risk area, then explained with the nightly SSWX AI discussion. This is decision-support, not a substitute for official SPC outlooks, watches, and warnings. Chase safe.
      </div>
    </div>
  );
}
