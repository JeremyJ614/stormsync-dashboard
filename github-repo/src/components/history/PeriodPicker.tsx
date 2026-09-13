/**
 * The tornado archive's period control.
 *
 * Warning history is a rolling window — IEM keeps a few weeks and the only
 * useful question is "how far back from now". Tornado history is an ARCHIVE:
 * surveyed tracks that do not change once they are written, going back years.
 * The same row of days-back pills cannot ask the question people actually have
 * about an archive, which is "show me May 2024".
 *
 * So the control does both. The pills stay for the rolling view, and a year and
 * an optional month sit beside them for the archive. Choosing one clears the
 * other, because a period is one thing and a control that lets you select two
 * at once is a control that has to explain which one won.
 *
 * Months outside the window are not rendered at all rather than rendered and
 * refused — a dropdown whose entries do nothing is worse than a shorter
 * dropdown.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { ROYAL } from "../../lib/royal";
import { torYears, torMonths, type TorPeriod } from "../../lib/severeHistoryData";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface QuickSpan { days: number; label: string }

interface Props {
  spans: readonly QuickSpan[];
  value: TorPeriod;
  onChange: (p: TorPeriod) => void;
  still: boolean;
  /** Ties the sliding pill to this control. */
  layoutId: string;
  /** Archive controls only make sense for the tornado tab. */
  archive?: boolean;
}

export const PeriodPicker = memo(function PeriodPicker({
  spans, value, onChange, still, layoutId, archive,
}: Props) {
  const years = torYears();
  const selectedYear = value.kind === "days" ? "" : String(value.year);
  const selectedMonth = value.kind === "month" ? String(value.month) : "";
  const months = value.kind === "days" ? [] : torMonths(value.year);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-[0.24em] mr-1" style={{ color: ROYAL.dim }}>Period</span>

      {spans.map((s) => {
        const on = value.kind === "days" && value.days === s.days;
        return (
          <button key={s.days} onClick={() => onChange({ kind: "days", days: s.days })}
            className="relative px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors"
            style={{ color: on ? "#120f1e" : ROYAL.dim }}>
            {on && (
              <motion.span aria-hidden layoutId={layoutId} className="absolute inset-0 rounded-lg"
                transition={still ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                style={{ background: ROYAL.gold }} />
            )}
            <span className="relative">{s.label}</span>
          </button>
        );
      })}

      {archive && (
        <>
          <span className="text-[11px] mx-1" style={{ color: ROYAL.dim }}>or</span>

          <select
            aria-label="Year"
            className="sx-input !w-auto !py-1.5 !text-[11.5px] !font-semibold"
            value={selectedYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              if (!y) { onChange({ kind: "days", days: spans[0].days }); return; }
              onChange({ kind: "year", year: y });
            }}
          >
            <option value="">Year…</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <select
            aria-label="Month"
            disabled={value.kind === "days"}
            className="sx-input !w-auto !py-1.5 !text-[11.5px] !font-semibold disabled:opacity-40"
            value={selectedMonth}
            onChange={(e) => {
              if (value.kind === "days") return;
              const m = Number(e.target.value);
              onChange(m ? { kind: "month", year: value.year, month: m } : { kind: "year", year: value.year });
            }}
          >
            <option value="">Whole year</option>
            {months.map((m) => <option key={m} value={m}>{MONTH_SHORT[m - 1]}</option>)}
          </select>
        </>
      )}
    </div>
  );
});
