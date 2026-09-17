import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TTL } from "../lib/queryClient";
import type { Location } from "../hooks/useLocation";
import { Layers, ExternalLink, RefreshCw, AlertTriangle, Clock, MapPin, Info, ChevronDown, Tornado, Wind, CloudHail } from "lucide-react";
import { MAP_W, MAP_H, project } from "../lib/usAlbers";
import { UsStatesBackdrop, UsStateLabels } from "../components/UsStatesBackdrop";

interface Props { location: Location }

const IEM = "https://mesonet.agron.iastate.edu/api/1";

interface RawFeature {
  geometry: GeoJSON.Geometry;
  properties: { product_id: string; num: number; year: number; concerning: string | null; issue: string; expire: string; watch_confidence: number | null };
}
interface MD {
  id: string;
  num: number;
  concerning: string;
  issue: string;
  expire: string;
  geomD: string;
  areas: string | null;
  prob: number | null;
  summary: string | null;
  discussion: string | null;
  hazards: string[];
  raw: string | null;
}

function geometryToPath(geom: GeoJSON.Geometry): string {
  const polys: number[][][][] =
    geom.type === "Polygon" ? [(geom as GeoJSON.Polygon).coordinates]
    : geom.type === "MultiPolygon" ? (geom as GeoJSON.MultiPolygon).coordinates
    : [];
  let d = "";
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach((co, i) => { const p = project(co[0], co[1]); d += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; });
      d += "Z";
    }
  }
  return d;
}

function parseMDText(raw: string): Pick<MD, "areas" | "prob" | "summary" | "discussion" | "hazards"> {
  const clean = (s?: string) => s?.replace(/\s+/g, " ").trim() || null;
  const areas = clean(raw.match(/Areas affected\.{2,}([\s\S]*?)\n\s*\n/i)?.[1]);
  const probM = raw.match(/Probability of Watch Issuance\.{2,}\s*(\d+)\s*percent/i);
  const summary = clean(raw.match(/SUMMARY\.{2,}([\s\S]*?)(?:\n\s*\n|DISCUSSION)/i)?.[1]);
  const discussion = clean(raw.match(/DISCUSSION\.{2,}([\s\S]*?)(?:\n\s*\n\.{2,}|\n\s*\n[A-Z][a-z]+\.{2,}|$)/i)?.[1]);
  const lower = raw.toLowerCase();
  const hazards: string[] = [];
  if (/tornad/.test(lower)) hazards.push("tornado");
  if (/hail/.test(lower)) hazards.push("hail");
  if (/(damaging|severe).{0,12}(wind|gust)|wind gust|gusts/.test(lower)) hazards.push("wind");
  return { areas, prob: probM ? Number(probM[1]) : null, summary, discussion, hazards };
}

// A deterministic plain-language read of what the discussion means for a member.
function plainSummary(md: MD): string {
  const where = md.areas ? md.areas.replace(/\.$/, "") : "the highlighted area";
  const hz = md.hazards.length
    ? md.hazards.map(h => h === "tornado" ? "tornadoes" : h === "hail" ? "large hail" : "damaging wind").join(", ")
    : "severe storms";
  const watchMatch = md.concerning.match(/(tornado|severe thunderstorm) watch\s*(\d+)/i);
  if (watchMatch) {
    const kind = /tornado/i.test(watchMatch[1]) ? "Tornado" : "Severe Thunderstorm";
    return `Forecasters are tracking an ongoing threat tied to ${kind} Watch ${watchMatch[2]} across ${where}. ${hz.charAt(0).toUpperCase() + hz.slice(1)} are the main concern over the next 1–2 hours. If you're in the area, stay weather-aware and be ready to act if a warning is issued.`;
  }
  if (md.prob != null) {
    const urgency = md.prob >= 80 ? "very likely" : md.prob >= 60 ? "likely" : md.prob >= 40 ? "possible" : md.prob >= 20 ? "uncertain but watched" : "low but non-zero";
    return `There's a ${md.prob}% chance a severe-weather watch is issued for ${where} in the next few hours (${urgency}). ${hz.charAt(0).toUpperCase() + hz.slice(1)} are the primary threats. Now is a good time to review your safety plan and keep notifications on.`;
  }
  return `Forecasters are highlighting a developing severe-weather concern across ${where}, with ${hz} the main threats over the next few hours. No watch is mentioned yet, but conditions are being monitored closely — keep an eye on alerts.`;
}

function timeLeft(expire: string): { text: string; expired: boolean } {
  const ms = new Date(expire).getTime() - Date.now();
  if (ms <= 0) return { text: "Expired", expired: true };
  const mins = Math.round(ms / 60000);
  if (mins < 60) return { text: `${mins} min left`, expired: false };
  return { text: `${Math.floor(mins / 60)}h ${mins % 60}m left`, expired: false };
}

const HAZ_META: Record<string, { label: string; color: string; Icon: typeof Tornado }> = {
  tornado: { label: "Tornado", color: "#FA003F", Icon: Tornado },
  hail: { label: "Large Hail", color: "#22d3ee", Icon: CloudHail },
  wind: { label: "Damaging Wind", color: "#fbbf24", Icon: Wind },
};

function MDCard({ md }: { md: MD }) {
  const [open, setOpen] = useState(false);
  const tl = timeLeft(md.expire);
  const probColor = md.prob == null ? "#8FAEC0" : md.prob >= 80 ? "#FA003F" : md.prob >= 40 ? "#f97316" : "#fde047";
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-rose-500/10 to-transparent">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <div>
            <div className="font-bold text-sm">Mesoscale Discussion #{md.num}</div>
            <div className="text-[11px] text-muted-foreground">{md.concerning || "Severe weather potential"}</div>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide flex items-center gap-1 ${tl.expired ? "bg-muted/40 text-muted-foreground" : "bg-rose-500/15 text-rose-300"}`}>
          <Clock className="w-3 h-3" /> {tl.text}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-0">
        <div className="border-b md:border-b-0 md:border-r border-border bg-[#0a0e1a]">
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: "100%", height: "auto", display: "block" }} xmlns="http://www.w3.org/2000/svg">
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#0a0e1a" />
            <UsStatesBackdrop labels={false} />
            <path d={md.geomD} fill="#FA003F" fillOpacity={0.32} stroke="#FA003F" strokeWidth={2.6} />
            <UsStateLabels />
          </svg>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-stretch gap-3">
            <div className="flex-1 bg-muted/20 rounded-lg p-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Watch Probability</div>
              <div className="text-3xl font-black mt-0.5" style={{ color: probColor }}>{md.prob != null ? `${md.prob}%` : "—"}</div>
              <div className="text-[10px] text-muted-foreground">{md.prob != null ? "of a new watch being issued" : "tied to an active watch"}</div>
            </div>
          </div>

          {md.hazards.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {md.hazards.map(h => { const m = HAZ_META[h]; const Icon = m.Icon; return (
                <span key={h} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold" style={{ background: m.color + "1f", color: m.color }}>
                  <Icon className="w-3 h-3" /> {m.label}
                </span>
              ); })}
            </div>
          )}

          {md.areas && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /><span>{md.areas}</span>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary uppercase tracking-widest mb-1"><Info className="w-3.5 h-3.5" /> What this means for you</div>
            <p className="text-xs text-foreground/90 leading-relaxed">{plainSummary(md)}</p>
          </div>
        </div>
      </div>

      {(md.summary || md.discussion || md.raw) && (
        <div className="border-t border-border">
          {md.summary && <div className="px-4 py-3 text-xs"><span className="font-semibold text-foreground">Summary — </span><span className="text-muted-foreground">{md.summary}</span></div>}
          <button onClick={() => setOpen((o: boolean) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-primary hover:bg-primary/5 transition-colors border-t border-border">
            <span>Full forecaster discussion</span><ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="px-4 pb-4 space-y-2">
              {md.discussion && <p className="text-xs text-muted-foreground leading-relaxed">{md.discussion}</p>}
              <a href={`https://www.spc.noaa.gov/products/md/md${String(md.num).padStart(4, "0")}.html`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Official MD on SPC
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Live SPC mesoscale discussions, with each product's raw text pulled alongside. */
async function loadMDs(): Promise<MD[]> {
  const r = await fetch(`${IEM}/nws/spc_mcd.geojson`);
  if (!r.ok) throw new Error(String(r.status));
  const data: { features?: RawFeature[] } = await r.json();
  const out = await Promise.all((data.features ?? []).map(async (f): Promise<MD> => {
    const p = f.properties;
    let raw: string | null = null;
    try { const tr = await fetch(`${IEM}/nwstext/${p.product_id}`); if (tr.ok) raw = await tr.text(); } catch { /* text optional */ }
    const parsed = raw ? parseMDText(raw) : { areas: null, prob: null, summary: null, discussion: null, hazards: [] as string[] };
    return {
      id: p.product_id, num: p.num, concerning: p.concerning ?? "", issue: p.issue, expire: p.expire,
      geomD: geometryToPath(f.geometry), raw, ...parsed,
    };
  }));
  return out.sort((a, b) => new Date(b.issue).getTime() - new Date(a.issue).getTime());
}

export default function MesoscaleDiscussion({ location }: Props) {
  // Through React Query so the discussions cache, dedupe and survive a remount
  // like the rest of the app, rather than re-fetching on every visit.
  const q = useQuery({ queryKey: ["spc-mcd"], queryFn: loadMDs, staleTime: TTL.quick });
  const mds = q.data ?? [];
  const status: "loading" | "ok" | "error" =
    q.isLoading ? "loading" : q.isError ? "error" : "ok";
  const load = () => { void q.refetch(); };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-wide">Mesoscale Discussions</h2>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className={`w-3 h-3 ${status === "loading" ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · NOAA SPC short-fuse severe outlooks · Live</p>

      {status === "loading" && <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">Scanning for active mesoscale discussions…</div>}
      {status === "error" && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">Could not reach the SPC mesoscale feed. Try again shortly.</div>}

      {status === "ok" && mds.length === 0 && (
        <div className="aurora-bg glass rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🌤️</div>
          <h3 className="text-lg font-bold">No active mesoscale discussions</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            The SPC isn't tracking any short-fuse severe convective threats nationwide right now. MDs appear here automatically — usually 1–6 hours before a tornado or severe thunderstorm watch — the moment one is issued.
          </p>
        </div>
      )}

      {status === "ok" && mds.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">{mds.length} active discussion{mds.length > 1 ? "s" : ""} nationwide</div>
          {mds.map(md => <MDCard key={md.id} md={md} />)}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">About Mesoscale Discussions</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          SPC Mesoscale Discussions are short-fuse bulletins issued when severe convective weather is rapidly developing or imminent — typically 1–6 hours before a tornado or severe thunderstorm watch. Each one above shows the affected area, the probability a watch gets issued, the hazards in play, and a plain-language read of what it means for you.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="https://www.spc.noaa.gov/products/md/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors"><ExternalLink className="w-3.5 h-3.5 text-primary" /> Active MD List</a>
          <a href="https://www.spc.noaa.gov/products/watch/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors"><ExternalLink className="w-3.5 h-3.5 text-primary" /> Active Watches</a>
          <a href="https://www.spc.noaa.gov/exper/mesoanalysis/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors"><ExternalLink className="w-3.5 h-3.5 text-primary" /> Mesoanalysis Viewer</a>
        </div>
      </div>
    </div>
  );
}
