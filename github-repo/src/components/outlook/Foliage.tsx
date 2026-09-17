/**
 * Fall colour: the report and the map.
 *
 * Both views read the same record — the USA National Phenology Network's
 * first-colour dates for this season — because they are answering the same
 * question from two directions. The report ranks it (who has turned, and when);
 * the map places it (how far south the turn has reached). Neither models
 * anything or predicts anything, and both say so.
 */
import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { AlbersPanZoom } from "../map/AlbersPanZoom";
import { UsStatesBackdrop } from "../UsStatesBackdrop";
import { MAP_W, MAP_H, US_STATE_LABELS, project } from "../../lib/usAlbers";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { leafColour, type FoliageReport } from "../../lib/foliage";

/* ── the map ─────────────────────────────────────────────────────────────── */

interface Dot { id: string; x: number; y: number; c: string; days: number; label: string }

export const FallColorsMap = memo(function FallColorsMap({
  report, still, height = 470,
}: { report: FoliageReport; still: boolean; height?: number }) {
  const dots = useMemo<Dot[]>(
    () => report.sites.map((s) => {
      const p = project(s.lon, s.lat);
      return {
        id: s.id,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        c: leafColour(s.daysAgo),
        days: s.daysAgo,
        label: `${s.species} — ${s.state || "site"} — first colour ${s.date}`,
      };
    }),
    [report.sites],
  );

  return (
    <div className="w-full overflow-hidden rounded-2xl"
         style={{ background: ROYAL.ink, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="relative" style={{ height }}>
        <AlbersPanZoom width={MAP_W} height={MAP_H} maxZoom={10} className="w-full h-full"
                       ariaLabel="Sites reporting their first colour this season">
          {(k) => (
            <>
              <UsStatesBackdrop labels={false} />
              <motion.g
                initial={still ? { opacity: 0 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: still ? 0.2 : 0.55, ease: EASE }}
              >
                {dots.map((d) => (
                  <g key={d.id}>
                    {d.days <= 7 && (
                      <circle cx={d.x} cy={d.y} r={6 / k} fill={d.c} fillOpacity={0.18} />
                    )}
                    <circle
                      cx={d.x} cy={d.y} r={3.1 / k}
                      fill={d.c} fillOpacity={0.92}
                      stroke="#05060d" strokeWidth={0.8 / k}
                    >
                      <title>{d.label}</title>
                    </circle>
                  </g>
                ))}
              </motion.g>
              <g style={{ pointerEvents: "none" }}>
                {US_STATE_LABELS.map((l) => (
                  <text key={l.abbr} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
                        fill="#e6ecf7" fillOpacity={0.6} fontSize={10 / k} fontWeight={700}
                        fontFamily="system-ui, sans-serif"
                        stroke="#05060d" strokeWidth={1.4 / k} paintOrder="stroke">{l.abbr}</text>
                ))}
              </g>
            </>
          )}
        </AlbersPanZoom>

        {dots.length === 0 && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="px-5 py-3 rounded-2xl text-center"
                 style={{ background: "rgba(7,7,19,0.88)", border: `1px solid ${ROYAL.goldSoft}` }}>
              <div className="text-sm font-bold" style={{ color: ROYAL.gold, fontFamily: HEADING }}>
                Nothing has turned yet
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex items-center gap-3 flex-wrap"
           style={{ borderTop: `1px solid ${ROYAL.hairline}`, background: "rgba(8,8,18,0.6)" }}>
        <span className="text-[9px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>
          When it turned
        </span>
        <span className="h-2.5 flex-1 min-w-[140px] rounded-full"
              style={{ background: `linear-gradient(90deg, ${leafColour(0)}, ${leafColour(14)}, ${leafColour(28)}, ${leafColour(42)})` }} />
        <span className="text-[10px]" style={{ color: ROYAL.dim }}>this week → six weeks ago</span>
      </div>
    </div>
  );
});

/* ── the report ──────────────────────────────────────────────────────────── */

function Stat({ label, value, sub, tone = ROYAL.text }: {
  label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div className="px-4 py-3" style={{ background: "rgba(8,8,18,0.72)" }}>
      <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>{label}</div>
      <div className="text-xl font-bold tabular-nums leading-tight mt-0.5"
           style={{ color: tone, fontFamily: HEADING }}>{value}</div>
      {sub && <div className="text-[10px] mt-px" style={{ color: ROYAL.dim }}>{sub}</div>}
    </div>
  );
}

export const FoliageReportView = memo(function FoliageReportView({
  report, still,
}: { report: FoliageReport; still: boolean }) {
  const peakWeek = report.weeks.reduce((a, b) => (b.sites > (a?.sites ?? -1) ? b : a), report.weeks[0]);
  const maxWeek = Math.max(1, ...report.weeks.map((w) => w.sites));
  const topState = report.states[0];
  const recent = report.sites.filter((s) => s.daysAgo <= 14).length;
  const maxStateSites = Math.max(1, ...report.states.map((s) => s.sites));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden"
           style={{ background: ROYAL.hairline, border: `1px solid ${ROYAL.hairline}` }}>
        <Stat label="Sites turned" value={String(report.total)} sub={`since ${report.seasonStart.slice(5)}`} />
        <Stat label="States reporting" value={String(report.statesReporting)} tone={ROYAL.iris} />
        <Stat label="In the last fortnight" value={String(recent)} tone={ROYAL.gold}
              sub={recent ? "newly coloured" : "none yet"} />
        <Stat label="Busiest week" value={peakWeek ? peakWeek.label : "—"}
              sub={peakWeek ? `${peakWeek.sites} sites` : undefined} />
      </div>

      {/* the turn, week by week */}
      <div className="rounded-2xl p-4"
           style={{ background: "rgba(10,10,22,0.5)", border: `1px solid ${ROYAL.hairline}` }}>
        <div className="flex items-baseline gap-3 mb-3">
          <h3 className="text-sm font-semibold" style={{ color: ROYAL.text }}>When the turn arrived</h3>
          <span className="ml-auto text-[10px]" style={{ color: ROYAL.dim }}>sites recording their first colour</span>
        </div>
        <div className="flex items-end gap-1 h-[92px]">
          {report.weeks.map((w, i) => (
            <div key={w.start} className="flex-1 min-w-0 flex flex-col justify-end items-center gap-1">
              <motion.span
                className="w-full rounded-t-[3px]"
                style={{
                  background: `linear-gradient(180deg, ${leafColour((report.weeks.length - 1 - i) * 7)}, rgba(217,183,117,0.12))`,
                }}
                initial={still ? { height: `${(w.sites / maxWeek) * 72}px` } : { height: 0 }}
                animate={{ height: `${(w.sites / maxWeek) * 72}px` }}
                transition={still ? { duration: 0 } : { duration: 0.5, delay: i * 0.035, ease: EASE }}
              />
              <span className="text-[9px] tabular-nums truncate w-full text-center"
                    style={{ color: ROYAL.dim }}>{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* the ranking */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: "rgba(10,10,22,0.5)", border: `1px solid ${ROYAL.hairline}` }}>
        <header className="px-4 py-3 flex items-baseline gap-3 border-b" style={{ borderColor: ROYAL.hairline }}>
          <h3 className="text-sm font-semibold" style={{ color: ROYAL.text }}>Where it has turned</h3>
          {topState && (
            <span className="ml-auto text-[10px]" style={{ color: ROYAL.dim }}>
              {topState.state} leads with {topState.sites} sites
            </span>
          )}
        </header>
        {report.states.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: ROYAL.dim }}>
            No state has recorded a first colour yet this season.
          </div>
        ) : (
          <ol className="divide-y" style={{ borderColor: ROYAL.hairline }}>
            {report.states.slice(0, 14).map((s, i) => (
              <motion.li
                key={s.state}
                className="relative px-4 py-2.5 flex items-center gap-3"
                initial={still ? { opacity: 0 } : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: still ? 0.2 : 0.36, delay: still ? 0 : Math.min(i, 10) * 0.03, ease: EASE }}
              >
                <span aria-hidden className="absolute inset-y-0 left-0"
                      style={{
                        width: `${(s.sites / maxStateSites) * 100}%`,
                        background: `linear-gradient(90deg, ${leafColour(s.medianDaysAgo)}, transparent)`,
                        opacity: 0.16,
                      }} />
                <span className="relative w-6 text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>{i + 1}</span>
                <span className="relative w-9 text-sm font-bold" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                  {s.state}
                </span>
                <span className="relative text-[11px]" style={{ color: ROYAL.dim }}>
                  {s.species} species
                </span>
                <span className="relative ml-auto text-[11px] tabular-nums text-right" style={{ color: ROYAL.dim }}>
                  median {s.medianDate}
                </span>
                <span className="relative w-12 text-right text-sm font-bold tabular-nums"
                      style={{ color: ROYAL.gold, fontFamily: HEADING }}>{s.sites}</span>
              </motion.li>
            ))}
          </ol>
        )}
      </div>

      {/* what turned */}
      {report.species.length > 0 && (
        <div className="rounded-2xl p-4"
             style={{ background: "rgba(10,10,22,0.5)", border: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: ROYAL.text }}>The trees doing it</h3>
          <div className="flex flex-wrap gap-2">
            {report.species.map((sp) => (
              <span key={sp.name}
                    className="px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5"
                    style={{ background: ROYAL.goldFaint, border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
                {sp.name}
                <span className="tabular-nums font-bold" style={{ color: ROYAL.gold }}>{sp.sites}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
