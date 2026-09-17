/**
 * What has already happened, period by period.
 *
 * Yesterday, this week, the week before, this month, last month, the year. The
 * counts are the Storm Prediction Center's own storm reports out of the ledger
 * the Storm Engine keeps; the superlatives — largest hail, strongest measured
 * gust, busiest day — are read straight off the same rows rather than
 * summarised by anything. Where the engine has written prose for a period it is
 * shown above the figures; where it has not, the figures stand on their own and
 * say so by simply not pretending otherwise.
 *
 * The period is a rail rather than six stacked blocks: these are alternatives,
 * not a list, and six narratives down a page is a scroll nobody finishes.
 */
import { memo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarRange } from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { SegmentedTabs, type Segment } from "../forecast/SegmentedTabs";
import { stateName, type PeriodStats } from "../../lib/patternSummary";

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex-1 min-w-[92px]">
      <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>{label}</div>
      <div className="text-[26px] font-black tabular-nums leading-none mt-1"
           style={{ color: tone, fontFamily: HEADING }}>{value.toLocaleString()}</div>
    </div>
  );
}

export const HistoryRecap = memo(function HistoryRecap({
  periods, loading, still,
}: { periods: PeriodStats[]; loading: boolean; still: boolean }) {
  const [id, setId] = useState<string>("yesterday");
  const active = periods.find((p) => p.id === id) ?? periods[0];

  const segments: Segment<string>[] = periods.map((p) => ({ id: p.id, label: p.label }));

  return (
    <section className="rounded-2xl overflow-hidden"
             style={{ background: "rgba(10,10,22,0.5)", border: `1px solid ${ROYAL.hairline}` }}>
      <header className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: ROYAL.hairline }}>
        <CalendarRange className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
        <h2 className="text-sm font-semibold" style={{ color: ROYAL.text }}>What has already happened</h2>
        <span className="ml-auto text-[10px]" style={{ color: ROYAL.dim }}>SPC storm reports</span>
      </header>

      <div className="p-3.5 space-y-3.5">
        {periods.length > 0 && (
          <SegmentedTabs segments={segments} value={active?.id ?? id} onChange={setId}
                         layoutId="pattern-period" controls="pattern-period-panel" label="Period" />
        )}

        <div id="pattern-period-panel">
          {loading || !active ? (
            <div className="py-8 text-center text-[12px]" style={{ color: ROYAL.dim }}>
              {loading ? "Reading the report ledger…" : "No reports recorded for this period yet."}
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active.id}
                initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: still ? 0.14 : 0.26, ease: EASE }}
                className="space-y-3.5"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
                    {active.start === active.end ? active.start : `${active.start} → ${active.end}`}
                  </span>
                  <span className="text-[11px]" style={{ color: ROYAL.dim }}>
                    · {active.days} {active.days === 1 ? "day" : "days"} on the ledger
                  </span>
                </div>

                {active.headline && (
                  <div className="text-[15px] font-bold leading-snug"
                       style={{ color: ROYAL.text, fontFamily: HEADING }}>
                    {active.headline}
                  </div>
                )}
                {active.summary && (
                  <p className="text-[13px] leading-relaxed max-w-[74ch]" style={{ color: ROYAL.dim }}>
                    {active.summary}
                  </p>
                )}

                <div className="flex gap-3 flex-wrap rounded-xl px-4 py-3"
                     style={{ background: "rgba(8,8,18,0.6)", border: `1px solid ${ROYAL.hairline}` }}>
                  <Figure label="Tornadoes" value={active.tornado} tone="#ff7a63" />
                  <Figure label="Hail reports" value={active.hail} tone={ROYAL.iris} />
                  <Figure label="Wind reports" value={active.wind} tone={ROYAL.gold} />
                </div>

                {active.states.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.24em] mb-1.5" style={{ color: ROYAL.dim }}>
                      Where the tornadoes were
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {active.states.map((s) => (
                        <span key={s.abbr}
                              className="px-2.5 py-1 rounded-full text-[11.5px] flex items-center gap-1.5"
                              style={{ background: ROYAL.goldFaint, border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
                          {stateName(s.abbr)}
                          <span className="font-bold tabular-nums" style={{ color: ROYAL.gold }}>{s.n}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {active.highlights.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.24em] mb-1.5" style={{ color: ROYAL.dim }}>
                      Highlights
                    </div>
                    <ul className="space-y-1.5">
                      {active.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-[12.5px]" style={{ color: ROYAL.text }}>
                          <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: ROYAL.gold }} />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </section>
  );
});

export default HistoryRecap;
