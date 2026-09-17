/**
 * Per-storm tracker: Forecast · Satellite · Map · Models · Recon · Graphics · Advisories.
 *
 * Everything on the Forecast tab comes from CurrentStorms.json except gusts,
 * which come from the cone archive's forecast-points layer at hour 0 — the same
 * NHC GIS product that draws the cone, so there is no second source to drift.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft, Wind, Gauge, Navigation2, Waves, Eye, FileText,
  Clock, ExternalLink, MapPin, Activity,
} from "lucide-react";
import {
  type Storm, type ConeData, type RadiiData, type TrackPoint,
  tropicalFetch, intensityColor, intensityOf, classificationLabel,
  compass, formatCoord, formatClock, timeAgo, BASIN_NAME, GOLD, INTENSITY,
} from "../lib/tropical";
import TropicalMap, { type LayerToggles } from "../components/tropical/TropicalMap";
import SatelliteLoop from "../components/tropical/SatelliteLoop";
import ModelsPanel from "../components/tropical/ModelsPanel";
import ReconPanel from "../components/tropical/ReconPanel";
import GraphicsPanel from "../components/tropical/GraphicsPanel";
import AdvisoryPanel from "../components/tropical/AdvisoryPanel";
import { Panel, StatTile, TabBar, Toggle, Source, Spinner, Empty, HEADING_FONT } from "../components/tropical/ui";

type Tab = "forecast" | "satellite" | "map" | "models" | "recon" | "graphics" | "advisories";
const TABS: { key: Tab; label: string }[] = [
  { key: "forecast", label: "Forecast" }, { key: "satellite", label: "Satellite" },
  { key: "map", label: "Map" }, { key: "models", label: "Models" },
  { key: "recon", label: "Recon" }, { key: "graphics", label: "Graphics" },
  { key: "advisories", label: "Advisories" },
];

export default function StormDetail() {
  const [, params] = useRoute("/hurricane/:stormId");
  const stormId = (params?.stormId ?? "").toLowerCase();
  const [tab, setTab] = useState<Tab>("forecast");
  const [toggles, setToggles] = useState<LayerToggles>({
    sst: true, gtwo: false, cone: true, radii: true,
    models: false, track: true, recon: false, labels: true,
  });
  const flip = (k: keyof LayerToggles) => setToggles((t) => ({ ...t, [k]: !t[k] }));

  const { data: stormsData, isLoading } = useQuery<{ storms: Storm[] }>({
    queryKey: ["tropical-storms"],
    queryFn: () => tropicalFetch("/storms"),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });
  const storms = stormsData?.storms ?? [];
  const storm = storms.find((s) => s.id.toLowerCase() === stormId) ?? null;

  const { data: cone } = useQuery<ConeData>({
    queryKey: ["cone", stormId],
    queryFn: () => tropicalFetch(`/cone/${stormId.toUpperCase()}`),
    enabled: !!storm, staleTime: 10 * 60_000, retry: 1,
  });
  const { data: radii } = useQuery<RadiiData>({
    queryKey: ["radii", stormId],
    queryFn: () => tropicalFetch(`/radii/${stormId.toUpperCase()}`),
    enabled: !!storm, staleTime: 10 * 60_000, retry: 1,
  });
  const { data: track } = useQuery<{ track: TrackPoint[] }>({
    queryKey: ["track", stormId],
    queryFn: () => tropicalFetch(`/track/${stormId.toUpperCase()}`),
    enabled: !!storm, staleTime: 30 * 60_000, retry: 1,
  });

  if (isLoading) return <div className="min-h-screen bg-background"><Spinner label="Loading storm…" /></div>;

  if (!storm) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 max-w-3xl mx-auto">
        <BackLink />
        <Panel className="mt-4">
          <Empty
            title="This storm is no longer active"
            detail={<>NHC has stopped issuing advisories for {stormId.toUpperCase()}. Completed storms move to the archive with their full best track and graphics.</>}
            action={
              <Link href="/hurricane/history">
                <button className="px-4 py-2 rounded-xl border text-xs font-semibold uppercase tracking-wider" style={{ borderColor: GOLD + "66", color: GOLD }}>
                  Open Past Storms
                </button>
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  const tint = intensityColor(storm.intensity_kt);
  const t0 = cone?.points?.find((p) => p.tau === 0);

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* ── header ── */}
      <div className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0" style={{
          background: `radial-gradient(70% 120% at 12% 0%, ${tint}22, transparent 62%),
                       radial-gradient(60% 120% at 88% 10%, rgba(217,183,117,0.12), transparent 60%),
                       linear-gradient(180deg, hsl(232 26% 9%), hsl(232 22% 7%))`,
        }} />
        <div className="relative max-w-5xl mx-auto px-4 pt-4 pb-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <BackLink />
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 tabular-nums">
              <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />{timeAgo(storm.lastUpdate)}
            </span>
          </div>

          <div className="flex items-end gap-3.5 flex-wrap">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                 style={{ background: tint + "22", border: `1px solid ${tint}66`, boxShadow: `0 0 26px -8px ${tint}` }}>
              <Eye className="w-5 h-5" style={{ color: tint }} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: GOLD }}>
                {BASIN_NAME[storm.basin] ?? storm.basin} · {storm.atcfId}
              </div>
              <h1 className="font-bold uppercase leading-none tracking-[0.02em] mt-1"
                  style={{ fontFamily: HEADING_FONT, fontSize: "clamp(1.9rem,7vw,3rem)" }}>
                {storm.name}
              </h1>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm font-semibold" style={{ color: tint, fontFamily: HEADING_FONT }}>
                {classificationLabel(storm.classification, storm.intensity_kt)}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                <MapPin className="w-3 h-3 inline mr-1 -mt-0.5" />{formatCoord(storm.lat, storm.lon)}
              </div>
            </div>
          </div>

          {/* storm switcher */}
          {storms.length > 1 && (
            <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar">
              {storms.map((s) => {
                const on = s.id === storm.id;
                const c = intensityColor(s.intensity_kt);
                return (
                  <Link key={s.id} href={`/hurricane/${s.id}`}>
                    <button className="flex items-center gap-2 rounded-xl border px-3 py-1.5 shrink-0 transition-all"
                            style={{ borderColor: on ? c + "88" : "hsl(var(--border))", background: on ? c + "18" : "transparent" }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">{s.name}</span>
                      <span className="text-[9.5px] text-muted-foreground">{s.short}</span>
                    </button>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4">
        <TabBar tabs={TABS} active={tab} onChange={setTab} className="sticky top-0 z-20 bg-background/92 backdrop-blur-md -mx-4 px-4" />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {tab === "forecast" && (
          <>
            <Panel eyebrow={storm.advisoryIssuance ? `Valid ${formatClock(storm.advisoryIssuance)}` : undefined}
                   title="Current Conditions"
                   action={storm.advisoryNum && <span className="text-[11px] tabular-nums text-muted-foreground">Advisory #{storm.advisoryNum}</span>}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                <StatTile label="Sustained" value={storm.intensity_mph} unit="mph" accent={tint}
                          icon={<Wind className="w-3 h-3" />} sub={`${storm.intensity_kt} kt`} />
                <StatTile label="Gusts" value={storm.gust_mph ?? "—"} unit={storm.gust_mph ? "mph" : undefined}
                          icon={<Waves className="w-3 h-3" />} sub={storm.gust_kt ? `${storm.gust_kt} kt` : "not reported"} />
                <StatTile label="Pressure" value={storm.pressure_mb ?? "—"} unit={storm.pressure_mb ? "mb" : undefined}
                          icon={<Gauge className="w-3 h-3" />} sub="minimum central" />
                <StatTile label="Movement" value={compass(storm.movementDir)}
                          icon={<Navigation2 className="w-3 h-3" />}
                          sub={storm.movementSpeed_mph != null ? `at ${storm.movementSpeed_mph} mph` : "stationary"} />
                <StatTile label="Type" value={storm.classification || "—"}
                          icon={<Activity className="w-3 h-3" />} sub={classificationLabel(storm.classification, storm.intensity_kt)} />
                <StatTile label="Category" value={storm.short} accent={tint}
                          icon={<Eye className="w-3 h-3" />} sub={intensityOf(storm.intensity_kt).range} />
              </div>

              <div className="flex flex-wrap gap-2 mt-3.5">
                {[
                  ["NHC Advisory", storm.links.publicAdvisory],
                  ["Discussion", storm.links.discussion],
                  ["Forecast Advisory", storm.links.forecastAdvisory],
                  ["Cone Graphic", storm.links.graphics],
                ].filter(([, u]) => u).map(([label, u]) => (
                  <a key={label as string} href={u as string} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors hover:bg-white/5"
                     style={{ borderColor: "hsl(var(--border))" }}>
                    <ExternalLink className="w-3 h-3" style={{ color: GOLD }} />{label as string}
                  </a>
                ))}
              </div>
              <Source>
                Position, intensity, pressure and motion: NHC CurrentStorms.json. Gusts:
                the NHC forecast-points GIS layer at hour 0 (advisory {cone?.advisory ?? storm.advisoryNum ?? "—"}).
              </Source>
            </Panel>

            {/* cone map, drawn from GIS geometry */}
            <Panel flush eyebrow={cone?.advisoryDate ?? "Official forecast"} title="Forecast Cone & Track">
              {cone ? (
                <>
                  <TropicalMap
                    layers={{ storms: [storm], cone, radii, track: track?.track }}
                    toggles={{ ...toggles, models: false, gtwo: false, recon: false }}
                    fitTo={cone.cone}
                    height={400}
                  />
                  <div className="px-4 pt-3 pb-1 flex flex-wrap gap-1.5">
                    <Toggle on={toggles.sst} onClick={() => flip("sst")}>Sea surface temp</Toggle>
                    <Toggle on={toggles.cone} onClick={() => flip("cone")} color="#e8e4ff">Cone</Toggle>
                    <Toggle on={toggles.radii} onClick={() => flip("radii")} color="#e0954e">Wind field</Toggle>
                    <Toggle on={toggles.track} onClick={() => flip("track")} color="#8fa3bf">Past track</Toggle>
                    <Toggle on={toggles.labels} onClick={() => flip("labels")}>Labels</Toggle>
                  </div>
                  <div className="px-4 pb-4">
                    <Source>
                      Cone, forecast track and wind field are drawn from the NHC's own GIS
                      shapefiles for advisory {cone.advisory} — not a screenshot of the NHC image.
                      The cone shows where the centre may go; hazards extend well beyond it.
                    </Source>
                  </div>
                </>
              ) : <Spinner label="Building the cone from NHC GIS…" />}
            </Panel>

            {/* forecast table */}
            {cone?.points?.length ? (
              <Panel title="Forecast Positions" eyebrow={`${cone.points.length} points · through ${cone.points.at(-1)!.tau}h`} flush>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/70 border-b border-border/50">
                        <th className="text-left font-medium px-4 py-2.5">Valid</th>
                        <th className="text-right font-medium px-3 py-2.5">Hour</th>
                        <th className="text-right font-medium px-3 py-2.5">Wind</th>
                        <th className="text-right font-medium px-3 py-2.5">Gust</th>
                        <th className="hidden sm:table-cell text-left font-medium px-3 py-2.5">Position</th>
                        <th className="text-left font-medium px-4 py-2.5">Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cone.points.map((p) => {
                        const c = intensityColor(p.maxwind_kt);
                        return (
                          <tr key={p.tau} className="border-b border-border/25 last:border-0">
                            <td className="px-4 py-2.5 font-medium whitespace-nowrap">{p.dateLabel || `+${p.tau}h`}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">+{p.tau}h</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: c }}>{p.maxwind_mph}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{p.gust_mph || "—"}</td>
                            <td className="hidden sm:table-cell px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">{formatCoord(p.lat, p.lon)}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                    style={{ background: c + "22", color: c }}>{p.short}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 pb-4 pt-1">
                  <Source>NHC forecast track points, advisory {cone.advisory}. Winds are 1-minute sustained.</Source>
                </div>
              </Panel>
            ) : null}

            <IntensityLegend />
          </>
        )}

        {tab === "satellite" && <SatelliteLoop stormId={storm.atcfId} stormName={storm.name} />}

        {tab === "map" && (
          <Panel flush title="Interactive Map" eyebrow="All layers">
            <TropicalMap
              layers={{ storms, cone, radii, track: track?.track }}
              toggles={toggles}
              view={[storm.lon, storm.lat, 4.6]}
              height={520}
              selectedStormId={storm.id}
            />
            <div className="p-4 flex flex-wrap gap-1.5">
              <Toggle on={toggles.sst} onClick={() => flip("sst")}>Sea surface temp</Toggle>
              <Toggle on={toggles.cone} onClick={() => flip("cone")} color="#e8e4ff">Predicted path</Toggle>
              <Toggle on={toggles.radii} onClick={() => flip("radii")} color="#e0954e">Wind field</Toggle>
              <Toggle on={toggles.track} onClick={() => flip("track")} color="#8fa3bf">Past track</Toggle>
              <Toggle on={toggles.labels} onClick={() => flip("labels")}>Labels</Toggle>
            </div>
            <div className="px-4 pb-4"><Source>Drag to pan, scroll to zoom. Sea-surface temperature is NASA/JPL MUR via NASA GIBS.</Source></div>
          </Panel>
        )}

        {tab === "models" && <ModelsPanel storm={storm} />}
        {tab === "recon" && <ReconPanel stormName={storm.name} />}
        {tab === "graphics" && <GraphicsPanel storm={storm} />}
        {tab === "advisories" && <AdvisoryPanel storm={storm} />}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/hurricane">
      <button className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> All tropical activity
      </button>
    </Link>
  );
}

export function IntensityLegend() {
  return (
    <Panel title="Saffir-Simpson Scale" eyebrow="Reference">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {INTENSITY.map((t) => (
          <div key={t.key} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
            <span className="text-[11px] font-semibold">{t.label}</span>
            <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{t.range}</span>
          </div>
        ))}
      </div>
      <Source>Wind speeds are 1-minute sustained at 10 m. Category describes wind only — surge, rainfall and tornado risk are not captured by it.</Source>
    </Panel>
  );
}
