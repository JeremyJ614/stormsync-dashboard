/**
 * StormSync VIP — Tropical Tracker (basin overview).
 *
 * Sea-surface temperature is the permanent basemap layer, the NHC's 7-day
 * formation odds are real dashed polygons parsed from the outlook shapefile
 * (there is no official GeoJSON), and every active system is plotted with
 * intensity colouring. Each storm links through to its own full tracker.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  RefreshCw, History, ChevronRight, Wind, Gauge, Navigation2,
  Eye, Compass, Thermometer, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  type Storm, type GtwoData, type ReconMission,
  tropicalFetch, intensityColor, classificationLabel, compass,
  formatCoord, formatClock, timeAgo, BASIN_NAME, GOLD, INTENSITY,
} from "../lib/tropical";
import TropicalMap, { sstDate, type LayerToggles } from "../components/tropical/TropicalMap";
import ReconPanel from "../components/tropical/ReconPanel";
import { Panel, StatTile, Toggle, Source, Spinner, Empty, TabBar, HEADING_FONT } from "../components/tropical/ui";

type View = "active" | "atlantic" | "pacific" | "worldwide";
const VIEWS: { key: View; label: string; center: [number, number, number] }[] = [
  { key: "active",    label: "Active Zone", center: [-60, 22, 3.2] },
  { key: "atlantic",  label: "Full Atlantic", center: [-52, 24, 2.7] },
  { key: "pacific",   label: "Pacific", center: [-150, 18, 2.7] },
  { key: "worldwide", label: "Worldwide", center: [-40, 16, 1.2] },
];

const SST_SCALE = [
  { c: "#0b1a6b", l: "20" }, { c: "#1064c8", l: "22" }, { c: "#12b6d8", l: "24" },
  { c: "#2fbf6a", l: "26" }, { c: "#e8d84a", l: "28" }, { c: "#e8833a", l: "30" },
  { c: "#c1443f", l: "32°C" },
];

export default function HurricaneTracker() {
  const [view, setView] = useState<View>("active");
  const [selected, setSelected] = useState<string | null>(null);
  const [aboutOpen, setAbout] = useState(false);
  const [toggles, setToggles] = useState<LayerToggles>({
    sst: true, gtwo: true, cone: false, radii: false,
    models: false, track: false, recon: false, labels: true,
  });
  const flip = (k: keyof LayerToggles) => setToggles((t) => ({ ...t, [k]: !t[k] }));

  const storms = useQuery<{ storms: Storm[]; updated: string }>({
    queryKey: ["tropical-storms"],
    queryFn: () => tropicalFetch("/storms"),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });
  const gtwo = useQuery<GtwoData>({
    queryKey: ["gtwo"],
    queryFn: () => tropicalFetch("/gtwo"),
    refetchInterval: 30 * 60_000,
    staleTime: 25 * 60_000,
  });
  const recon = useQuery<{ missions: ReconMission[] }>({
    queryKey: ["recon"],
    queryFn: () => tropicalFetch("/recon"),
    refetchInterval: 10 * 60_000,
    staleTime: 9 * 60_000,
  });

  const list = storms.data?.storms ?? [];
  const quiet = !storms.isLoading && list.length === 0;

  // "Active Zone" frames whatever is actually happening rather than a fixed
  // basin box — fit to the storms and the areas being watched.
  const activeFit = useMemo((): GeoJSON.FeatureCollection | null => {
    if (view !== "active" || !list.length) return null;
    return {
      type: "FeatureCollection",
      features: list.map((s) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
        properties: {},
      })),
    };
  }, [view, list]);

  const camera = view === "active"
    ? (list.length ? undefined : ([-60, 22, 3.2] as [number, number, number]))
    : VIEWS.find((v) => v.key === view)!.center;
  const areas = (gtwo.data?.areas?.features ?? []) as GeoJSON.Feature[];
  const activeRecon = (recon.data?.missions ?? []).filter((m) => m.status === "active");

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* ── hero ── */}
      <div className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0" style={{
          background: `radial-gradient(60% 130% at 8% 0%, rgba(217,183,117,0.16), transparent 58%),
                       radial-gradient(70% 130% at 92% 4%, rgba(120,110,255,0.16), transparent 60%),
                       linear-gradient(180deg, hsl(232 28% 10%), hsl(232 22% 7%))`,
        }} />
        <div className="relative max-w-5xl mx-auto px-4 py-6">
          <div className="text-[10px] uppercase tracking-[0.32em] mb-2" style={{ color: GOLD }}>
            StormSync VIP · Tropics
          </div>
          <h1 className="font-bold uppercase leading-[0.95] tracking-[0.01em]"
              style={{ fontFamily: HEADING_FONT, fontSize: "clamp(2.1rem,8vw,3.4rem)" }}>
            Tropical Tracker
          </h1>
          <p className="mt-2.5 text-[13px] text-muted-foreground max-w-xl leading-relaxed">
            Official NHC forecasts, live satellite, model guidance and Hurricane Hunter recon —
            drawn from the source data, not screenshots.
          </p>

          <div className="flex flex-wrap gap-2.5 mt-4">
            <HeroStat label="Active systems" value={list.length} tone={list.length ? "#d96a45" : undefined} />
            <HeroStat label="Areas watched" value={areas.length} tone={areas.length ? GOLD : undefined} />
            <HeroStat label="Recon airborne" value={activeRecon.length} tone={activeRecon.length ? "#4ade80" : undefined} />
          </div>
        </div>
      </div>

      {/* ── basin map ── */}
      <div className="border-b border-border/60 bg-[hsl(232_26%_8%)]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/40">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.26em]" style={{ color: GOLD }}>Live basin</div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: HEADING_FONT }}>
                The Tropics Right Now
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {storms.data && <span className="hidden sm:block text-[10px] text-muted-foreground tabular-nums">{timeAgo(storms.data.updated)}</span>}
              <button onClick={() => { storms.refetch(); gtwo.refetch(); }}
                      className="p-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${storms.isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <TropicalMap
            layers={{ storms: list, gtwo: gtwo.data, recon: recon.data?.missions }}
            toggles={toggles}
            view={camera}
            fitTo={activeFit}
            fitMaxZoom={4.4}
            height={430}
            selectedStormId={selected}
            onStormClick={(id) => setSelected((p) => (p === id ? null : id))}
          />

          <div className="flex overflow-x-auto no-scrollbar border-t border-border/40">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)}
                      className={`relative px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] whitespace-nowrap shrink-0 transition-colors
                        ${view === v.key ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"}`}
                      style={{ fontFamily: HEADING_FONT }}>
                {v.label}
                {view === v.key && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full" style={{ background: `linear-gradient(90deg,transparent,${GOLD},transparent)` }} />}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 px-4 py-3 border-t border-border/40">
            <Toggle on={toggles.sst} onClick={() => flip("sst")}>Sea surface temp</Toggle>
            <Toggle on={toggles.gtwo} onClick={() => flip("gtwo")}>7-day formation odds</Toggle>
            <Toggle on={toggles.recon} onClick={() => flip("recon")} color="#4ade80">Recon</Toggle>
            <Toggle on={toggles.labels} onClick={() => flip("labels")}>Labels</Toggle>
          </div>

          {/* legends */}
          <div className="grid sm:grid-cols-2 gap-4 px-4 pb-4">
            <div>
              <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
                <Thermometer className="w-3 h-3" /> Sea surface temp · {sstDate()}
              </div>
              <div className="flex rounded-md overflow-hidden h-3">
                {SST_SCALE.map((s) => <div key={s.l} className="flex-1" style={{ background: s.c }} />)}
              </div>
              <div className="flex justify-between mt-1 text-[8.5px] text-muted-foreground/70 tabular-nums">
                {SST_SCALE.map((s) => <span key={s.l}>{s.l}</span>)}
              </div>
              <p className="mt-1 text-[9.5px] text-muted-foreground/60">Above 26°C sustains development.</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
                <Wind className="w-3 h-3" /> Intensity
              </div>
              <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                {INTENSITY.map((t) => (
                  <span key={t.key} className="inline-flex items-center gap-1 text-[9.5px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-sm" style={{ background: t.color }} />{t.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {storms.isLoading && <Spinner label="Reading the National Hurricane Center…" />}
        {storms.isError && (
          <Panel><Empty title="Could not reach the tropical feed"
                        detail={(storms.error as Error)?.message}
                        action={<button onClick={() => storms.refetch()} className="px-4 py-2 rounded-xl border text-xs font-semibold uppercase tracking-wider" style={{ borderColor: GOLD + "66", color: GOLD }}>Retry</button>} /></Panel>
        )}

        {/* ── active systems ── */}
        {!quiet && list.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ fontFamily: HEADING_FONT }}>
                Active Systems
              </h2>
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Tap for the full tracker</span>
            </div>
            {list.map((s) => <StormCard key={s.id} storm={s} />)}
          </div>
        )}

        {quiet && (
          <Panel>
            <Empty
              title="The Tropics Are Quiet"
              detail="No active tropical cyclones right now. When one forms it gets its own live tracker here automatically — cone, satellite loop, model guidance, recon and advisories."
              action={
                <Link href="/hurricane/history">
                  <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold uppercase tracking-wider"
                          style={{ borderColor: GOLD + "66", color: GOLD }}>
                    <History className="w-3.5 h-3.5" /> Browse Past Storms
                  </button>
                </Link>
              }
            />
          </Panel>
        )}

        {/* ── areas to watch ── */}
        <Panel eyebrow={gtwo.data?.updated ? `Outlook ${formatOutlookStamp(gtwo.data.updated)}` : "NHC outlook"}
               title="Areas to Watch"
               action={<span className="text-[10px] text-muted-foreground tabular-nums">{areas.length} area{areas.length !== 1 ? "s" : ""}</span>}>
          {gtwo.isLoading && <Spinner />}
          {!gtwo.isLoading && areas.length === 0 && (
            <p className="text-xs text-muted-foreground">No areas of possible development are being watched right now.</p>
          )}
          <div className="space-y-2">
            {areas.map((f, i) => {
              const p = f.properties as Record<string, unknown>;
              const p7 = Number(p.prob7day), p2 = Number(p.prob2day);
              const c = String(p.__color);
              return (
                <div key={i} className="rounded-xl border border-border/55 bg-background/40 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c }} />
                    <span className="text-[12px] font-semibold">{String(p.basin)} · Area {String(p.area)}</span>
                    <span className="ml-auto text-[11px] font-bold tabular-nums" style={{ color: c, fontFamily: HEADING_FONT }}>
                      {p7}%
                    </span>
                    <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">7-day</span>
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    <ProbBar label="48 hours" pct={p2} color={c} />
                    <ProbBar label="7 days" pct={p7} color={c} />
                  </div>
                </div>
              );
            })}
          </div>
          <Source>
            NHC Tropical Weather Outlook areas, parsed from the outlook shapefile — the same
            polygons drawn on the map above. Yellow below 40%, orange to 60%, red above.
          </Source>
        </Panel>

        {/* ── recon ── */}
        <ReconPanel />

        {/* ── archive ── */}
        <Link href="/hurricane/history">
          <div className="group rounded-2xl border border-border/70 bg-card/50 px-4 py-4 flex items-center justify-between cursor-pointer hover:border-border transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                   style={{ background: GOLD + "1c", border: `1px solid ${GOLD}44` }}>
                <History className="w-4 h-4" style={{ color: GOLD }} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold" style={{ fontFamily: HEADING_FONT }}>Past Storms</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Every archived system — best track, peak intensity, graphics and final advisory
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </div>
        </Link>

        {/* ── about ── */}
        <Panel flush>
          <button onClick={() => setAbout((v) => !v)} className="w-full px-4 py-3.5 flex items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <Info className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-[13px] font-semibold" style={{ fontFamily: HEADING_FONT }}>Where this data comes from</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Sources, update cadence and how to read the cone</div>
              </div>
            </div>
            {aboutOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {aboutOpen && (
            <div className="px-4 pb-4 border-t border-border/50 pt-3.5 space-y-2.5 text-[11.5px] text-muted-foreground leading-relaxed">
              <p><B>Positions & intensity</B> — NHC CurrentStorms.json, refreshed every five minutes.</p>
              <p><B>Cone, forecast track and wind field</B> — the NHC's own GIS shapefiles for the current advisory, parsed into map geometry. Nothing here is a rasterised NHC image.</p>
              <p><B>Formation odds</B> — the Tropical Weather Outlook shapefile. NHC publishes no GeoJSON for it, so it is parsed server-side.</p>
              <p><B>Model guidance</B> — the ATCF a-deck, the same automated tracker aids the NHC forecasters use.</p>
              <p><B>Satellite</B> — GOES-18/19 ABI full-disk imagery via CIRA SLIDER, cropped to each storm using the ABI fixed-grid projection.</p>
              <p><B>Recon</B> — Vortex Data Messages and live High-Density Observations from the 53rd Weather Reconnaissance Squadron and NOAA Aircraft Operations Center.</p>
              <p><B>Sea surface temperature</B> — NASA/JPL MUR analysis at 1 km via NASA GIBS, roughly a three-day lag.</p>
              <p className="border-t border-border/40 pt-2.5">
                The cone shows where the <em>centre</em> of the storm may travel — about two-thirds of
                the time. Wind, surge and rain routinely reach far outside it. For life-safety
                decisions always defer to{" "}
                <a href="https://www.nhc.noaa.gov" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: GOLD }}>nhc.noaa.gov</a>{" "}
                and your local NWS office.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

const B = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground/85 font-semibold">{children}</span>
);

function HeroStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border px-3.5 py-2" style={{ borderColor: tone ? tone + "55" : "hsl(var(--border))", background: tone ? tone + "12" : "transparent" }}>
      <div className="text-xl font-bold tabular-nums leading-none" style={{ fontFamily: HEADING_FONT, color: tone }}>{value}</div>
      <div className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function ProbBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[9.5px] uppercase tracking-wider text-muted-foreground/80 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-background/80 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1.5)}%`, background: color, opacity: pct ? 1 : 0.25 }} />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function StormCard({ storm }: { storm: Storm }) {
  const c = intensityColor(storm.intensity_kt);
  return (
    <Link href={`/hurricane/${storm.id}`}>
      <div className="group relative rounded-2xl border overflow-hidden cursor-pointer transition-all hover:border-border"
           style={{ borderColor: c + "44", background: `linear-gradient(100deg, ${c}12, transparent 55%)` }}>
        <div className="absolute left-0 top-0 bottom-0 w-[2.5px]" style={{ background: c }} />
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: c + "20", border: `1px solid ${c}55` }}>
              <Eye className="w-4 h-4" style={{ color: c }} />
            </div>
            <div className="min-w-0">
              <div className="text-[9.5px] uppercase tracking-[0.2em]" style={{ color: c }}>
                {classificationLabel(storm.classification, storm.intensity_kt)}
              </div>
              <div className="text-lg font-bold uppercase tracking-wide leading-tight" style={{ fontFamily: HEADING_FONT }}>
                {storm.name}
              </div>
            </div>
            <div className="ml-auto text-right shrink-0">
              <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
                {BASIN_NAME[storm.basin] ?? storm.basin}
              </div>
              <div className="text-[10px] text-muted-foreground/70 tabular-nums mt-0.5">{formatCoord(storm.lat, storm.lon)}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <StatTile label="Winds" value={storm.intensity_mph} unit="mph" accent={c} icon={<Wind className="w-3 h-3" />} />
            <StatTile label="Gusts" value={storm.gust_mph ?? "—"} unit={storm.gust_mph ? "mph" : undefined} icon={<Compass className="w-3 h-3" />} />
            <StatTile label="Pressure" value={storm.pressure_mb ?? "—"} unit={storm.pressure_mb ? "mb" : undefined} icon={<Gauge className="w-3 h-3" />} />
            <StatTile label="Moving" value={compass(storm.movementDir)}
                      sub={storm.movementSpeed_mph != null ? `${storm.movementSpeed_mph} mph` : undefined}
                      icon={<Navigation2 className="w-3 h-3" />} />
          </div>

          <div className="flex items-center gap-3 mt-2.5 text-[10px] text-muted-foreground/75">
            {storm.advisoryNum && <span className="tabular-nums">Advisory #{storm.advisoryNum}</span>}
            <span className="tabular-nums">{formatClock(storm.lastUpdate)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** "202608221718" → "Aug 22, 5:18 PM" */
function formatOutlookStamp(s: string) {
  if (!/^\d{12}$/.test(s)) return s;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00Z`;
  return formatClock(iso);
}
