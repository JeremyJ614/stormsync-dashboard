/**
 * Model guidance — spaghetti tracks drawn from the real ATCF a-deck, plus an
 * intensity leaderboard.
 *
 * The a-deck is ~2 MB gzipped and comma-delimited, so it is parsed server-side;
 * this panel only ever sees the newest cycle's tracks. NHC publishes no
 * model-track *graphic* for Central Pacific storms, which is why nothing here
 * falls back to an NHC PNG.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Trophy, GitBranch } from "lucide-react";
import { type ModelsData, type Storm, tropicalFetch, intensityColor, GOLD, formatClock } from "../../lib/tropical";
import TropicalMap, { type LayerToggles } from "./TropicalMap";
import { Panel, Source, Spinner, Empty, TabBar, HEADING_FONT } from "./ui";

const OFF: LayerToggles = {
  sst: false, gtwo: false, cone: false, radii: false,
  models: true, track: false, recon: false, labels: false,
};

export default function ModelsPanel({ storm }: { storm: Storm }) {
  const [ensemble, setEnsemble] = useState(false);
  const [tab, setTab] = useState<"tracks" | "intensity">("tracks");
  const [hover, setHover] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<ModelsData>({
    queryKey: ["models", storm.id, ensemble],
    queryFn: () => tropicalFetch(`/models/${storm.atcfId}?ensemble=${ensemble ? 1 : 0}`),
    staleTime: 20 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  // Peak intensity per model, strongest first — the leaderboard.
  const leaderboard = useMemo(() => {
    if (!data?.models) return [];
    return [...data.models]
      .filter((m) => m.peak_kt > 0)
      .sort((a, b) => b.peak_kt - a.peak_kt);
  }, [data]);

  const maxPeak = leaderboard[0]?.peak_mph ?? 1;

  return (
    <div className="space-y-4">
      <Panel
        flush
        eyebrow={data?.initialized ? `Initialized ${formatClock(data.initialized)}` : "Model guidance"}
        title={ensemble ? "GEFS Ensemble Members" : "Model Guidance"}
        action={
          <button
            onClick={() => setEnsemble((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10.5px] font-semibold uppercase tracking-wider transition-colors"
            style={{ borderColor: GOLD + "66", color: GOLD }}
          >
            <GitBranch className="w-3.5 h-3.5" />
            {ensemble ? "Operational" : "Ensemble"}
          </button>
        }
      >
        <TabBar
          className="px-2"
          tabs={[
            { key: "tracks" as const, label: "Spaghetti", badge: data?.count },
            { key: "intensity" as const, label: "Intensity" },
          ]}
          active={tab}
          onChange={setTab}
        />

        {isLoading && <Spinner label="Parsing the ATCF a-deck…" />}
        {isError && <Empty title="Model guidance unavailable" detail={(error as Error)?.message} />}

        {data && !isLoading && data.count === 0 && (
          <Empty
            title="No model tracks in the latest cycle"
            detail="The a-deck for this storm has no multi-point track guidance yet. It usually appears within an hour of each 6-hourly synoptic cycle."
          />
        )}

        {data && data.count > 0 && tab === "tracks" && (
          <>
            <TropicalMap
              layers={{ storms: [storm], models: data }}
              toggles={OFF}
              fitTo={{
                type: "FeatureCollection",
                features: data.models.map((m) => ({
                  type: "Feature" as const,
                  geometry: { type: "LineString" as const, coordinates: m.points.map((p) => [p.lon, p.lat]) },
                  properties: {},
                })),
              }}
              height={380}
            />
            {/* legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 p-4">
              {data.models.map((m) => (
                <span
                  key={m.id}
                  onMouseEnter={() => setHover(m.id)}
                  onMouseLeave={() => setHover(null)}
                  className="inline-flex items-center gap-1.5 text-[10.5px] transition-opacity"
                  style={{ opacity: hover && hover !== m.id ? 0.35 : 1 }}
                >
                  <span
                    className="inline-block rounded-full"
                    style={{ width: m.official ? 12 : 9, height: 2.5, background: m.color }}
                  />
                  <span className={m.official ? "font-bold text-foreground" : "text-muted-foreground"}>
                    {m.id}
                  </span>
                  <span className="text-muted-foreground/50">{m.name}</span>
                </span>
              ))}
            </div>
          </>
        )}

        {data && data.count > 0 && tab === "intensity" && (
          <div className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 mb-2.5 text-[10px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              <Trophy className="w-3.5 h-3.5" /> Peak sustained wind by model
            </div>
            {leaderboard.map((m, i) => (
              <div key={m.id} className="flex items-center gap-2.5">
                <span className="w-5 text-[10px] tabular-nums text-muted-foreground/60 text-right">{i + 1}</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                <span className={`w-16 shrink-0 text-[11px] ${m.official ? "font-bold" : "font-medium text-muted-foreground"}`}>
                  {m.id}
                </span>
                <span className="hidden sm:block flex-1 min-w-0 text-[10.5px] text-muted-foreground/60 truncate">{m.name}</span>
                <div className="flex-1 sm:flex-none sm:w-40 h-2.5 rounded-full bg-background/70 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(4, (m.peak_mph / maxPeak) * 100)}%`, background: intensityColor(m.peak_kt) }}
                  />
                </div>
                <span className="w-14 text-right text-[11px] font-bold tabular-nums" style={{ fontFamily: HEADING_FONT }}>
                  {m.peak_mph}
                </span>
                <span className="w-10 text-[9px] uppercase tracking-wider text-right" style={{ color: intensityColor(m.peak_kt) }}>
                  {m.points.length ? intensityLabel(m.peak_kt) : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 pb-4">
          <Source>
            NOAA/NHC ATCF automated tracker aids (a-deck), cycle{" "}
            <span className="tabular-nums">{data?.cycle ?? "—"}</span>. Each track is one model's
            forecast of the storm centre — spread shows uncertainty, not storm size. Guidance only;
            the official forecast is the white OFCL track.
          </Source>
        </div>
      </Panel>

      {storm.basin === "CP" && (
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
          <Layers className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          Note: the NHC publishes no model-track graphic for Central Pacific storms. These tracks are
          drawn from the raw a-deck instead, so this panel stays live for CP systems.
        </p>
      )}
    </div>
  );
}

function intensityLabel(kt: number) {
  if (kt >= 137) return "C5"; if (kt >= 113) return "C4"; if (kt >= 96) return "C3";
  if (kt >= 83) return "C2"; if (kt >= 64) return "C1"; if (kt >= 34) return "TS";
  return "TD";
}
