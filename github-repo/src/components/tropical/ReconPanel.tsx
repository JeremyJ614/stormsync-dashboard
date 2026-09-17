/**
 * Hurricane Hunter reconnaissance.
 *
 * Rows are built from Vortex Data Messages — the centre-fix report, whose field
 * D is the true minimum sea-level pressure — merged with live High-Density
 * Observations, which is what shows a mission still airborne.
 *
 * Pressure is deliberately blank for a mission that has not filed a centre fix
 * yet. The HDOB stream carries a number in that position, but above the 550 mb
 * level it is a height departure, not a pressure; printing it yields the
 * impossible ~1040 mb readings other trackers show for tropical storms.
 */
import { useQuery } from "@tanstack/react-query";
import { Plane, Radio } from "lucide-react";
import { type ReconMission, tropicalFetch, formatClock, timeAgo, GOLD } from "../../lib/tropical";
import { Panel, Source, Spinner, Empty, HEADING_FONT } from "./ui";

export default function ReconPanel({ stormName }: { stormName?: string }) {
  const { data, isLoading, isError, error } = useQuery<{ missions: ReconMission[]; count: number; updated: string }>({
    queryKey: ["recon"],
    queryFn: () => tropicalFetch("/recon"),
    refetchInterval: 10 * 60_000,
    staleTime: 9 * 60_000,
  });

  const all = data?.missions ?? [];
  const missions = stormName
    ? all.filter((m) => m.stormName.toUpperCase() === stormName.toUpperCase())
    : all;

  return (
    <Panel
      eyebrow="Aircraft reconnaissance"
      title="Hurricane Hunters"
      action={data && <span className="text-[10px] text-muted-foreground tabular-nums">{timeAgo(data.updated)}</span>}
      flush
    >
      {isLoading && <Spinner label="Reading vortex data messages…" />}
      {isError && <Empty title="Recon feed unavailable" detail={(error as Error)?.message} />}

      {data && missions.length === 0 && (
        <Empty
          title={stormName ? `No recon into ${stormName}` : "No recon missions in the last 30 hours"}
          detail="The Hurricane Hunters fly when a system threatens land or when NHC needs a fix. Missions appear here within minutes of the first transmission."
        />
      )}

      {missions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]" style={{ minWidth: 640 }}>
            <thead>
              <tr className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/70 border-b border-border/50">
                <th className="text-left font-medium px-4 py-2.5">Mission</th>
                <th className="text-left font-medium px-3 py-2.5">Storm</th>
                <th className="text-right font-medium px-3 py-2.5">Flight-level</th>
                <th className="text-right font-medium px-3 py-2.5">Surface</th>
                <th className="text-right font-medium px-3 py-2.5">Pressure</th>
                <th className="text-left font-medium px-3 py-2.5">Last fix</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((m) => {
                const live = m.status === "active";
                return (
                  <tr key={m.key} className="border-b border-border/25 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Plane className="w-3.5 h-3.5 shrink-0" style={{ color: live ? "#4ade80" : "hsl(var(--muted-foreground))" }} />
                        <span className="font-semibold tabular-nums tracking-tight">{m.mission}</span>
                      </div>
                      {m.obNumber && <div className="text-[10px] text-muted-foreground/60 mt-0.5 pl-5.5">Ob #{m.obNumber}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{m.stormName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {m.maxFlWind_mph != null ? <>{m.maxFlWind_mph}<span className="text-[9px] text-muted-foreground ml-0.5">mph</span></> : <Dash />}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {m.maxSfcWind_mph != null ? <>{m.maxSfcWind_mph}<span className="text-[9px] text-muted-foreground ml-0.5">mph</span></> : <Dash />}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {m.mslp != null ? <>{m.mslp}<span className="text-[9px] text-muted-foreground ml-0.5">mb</span></> : <Dash title="No centre fix filed yet" />}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">
                      {m.fixTime ? formatClock(m.fixTime, { month: undefined, day: undefined }) : (m.lastObTime ? `ob ${m.lastObTime.slice(11, 16)}Z` : "—")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider"
                        style={{
                          background: live ? "rgba(74,222,128,0.14)" : "rgba(143,163,191,0.12)",
                          color: live ? "#4ade80" : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {live && <Radio className="w-2.5 h-2.5 animate-pulse" />}
                        {live ? "In the storm" : "Completed"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 pb-4 pt-1">
        <Source>
          NOAA/NHC Vortex Data Messages (centre fix, minimum sea-level pressure) merged with live
          High-Density Observations (flight track, SFMR surface wind). Flight-level wind is measured
          at altitude and typically exceeds the surface wind by 10–20%. Pressure is shown only where
          an aircraft has actually fixed the centre.
        </Source>
      </div>
    </Panel>
  );
}

const Dash = ({ title }: { title?: string }) => (
  <span className="text-muted-foreground/40" title={title}>—</span>
);
