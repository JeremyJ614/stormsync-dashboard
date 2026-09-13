/**
 * The tornado archive's period control.
 *
 * Warning history is a rolling window — IEM keeps a few weeks and the only
 * useful question is "how far back from now". Tornado history is an ARCHIVE:
 * surveyed tracks that do not change once they are written, going back years.
 * The same row of days-back pills cannot ask the question people actually have
 * about an archive, which is "show me May 2024" — or, once the window is ten
 * years deep, "show me every May".
 *
 * So the control does both. The pills stay for the rolling view, and a year and
 * a month sit beside them for the archive. Choosing one clears the other,
 * because a period is one thing and a control that lets you select two at once
 * is a control that has to explain which one won.
 *
 * "Any year" is the cross-year cut: pick it with a month and you get that month
 * in every year the window reaches, which is the shape of the question people
 * ask about tornadoes more than any other — when is the season, and is this one
 * like the last ten.
 *
 * Two things are deliberately visible rather than hidden:
 *
 *   • Months outside the window are not rendered at all rather than rendered
 *     and refused. A dropdown whose entries do nothing is worse than a shorter
 *     dropdown.
 *
 *   • Years before the toolkit's coverage settled are marked "partial". They
 *     are real surveyed tracks and worth looking at, but 2016 holding a third
 *     of 2024's count is the survey growing, not the weather calming down, and
 *     a year picker that says nothing invites exactly that misreading.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { ROYAL } from "../../lib/royal";
import {
  torYears, torMonths, MONTH_ABBR, TOR_FULL_SURVEY_YEAR, type TorPeriod,
} from "../../lib/severeHistoryData";

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

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const PeriodPicker = memo(function PeriodPicker({
  spans, value, onChange, still, layoutId, archive,
}: Props) {
  const years = torYears();

  const yearValue =
    value.kind === "days" ? "" :
    value.kind === "monthAll" ? "any" :
    String(value.year);

  const monthValue =
    value.kind === "month" || value.kind === "monthAll" ? String(value.month) : "";

  // Every month is offered for the cross-year cut, because over a ten-year
  // window every month has happened. A single year is trimmed at both ends.
  const months =
    value.kind === "monthAll" ? ALL_MONTHS :
    value.kind === "days" ? [] :
    torMonths(value.year);

  function pickYear(raw: string) {
    if (!raw) { onChange({ kind: "days", days: spans[0].days }); return; }
    if (raw === "any") {
      // Needs a month to mean anything — without one it is just the widest
      // pill, which is already a click away.
      const m = value.kind === "month" || value.kind === "monthAll"
        ? value.month : new Date().getMonth() + 1;
      onChange({ kind: "monthAll", month: m });
      return;
    }
    const y = Number(raw);
    const keep = (value.kind === "month" || value.kind === "monthAll") ? value.month : 0;
    onChange(keep && torMonths(y).includes(keep)
      ? { kind: "month", year: y, month: keep }
      : { kind: "year", year: y });
  }

  function pickMonth(raw: string) {
    if (value.kind === "days") return;
    const m = Number(raw);
    if (value.kind === "monthAll") {
      // Clearing the month leaves "any year" meaning nothing, so fall back to
      // the widest rolling span rather than to an empty map.
      onChange(m ? { kind: "monthAll", month: m } : { kind: "days", days: spans[spans.length - 1].days });
      return;
    }
    onChange(m
      ? { kind: "month", year: value.year, month: m }
      : { kind: "year", year: value.year });
  }

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
            value={yearValue}
            onChange={(e) => pickYear(e.target.value)}
          >
            <option value="">Year…</option>
            <option value="any">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}{y < TOR_FULL_SURVEY_YEAR ? " · partial" : ""}
              </option>
            ))}
          </select>

          <select
            aria-label="Month"
            disabled={value.kind === "days"}
            className="sx-input !w-auto !py-1.5 !text-[11.5px] !font-semibold disabled:opacity-40"
            value={monthValue}
            onChange={(e) => pickMonth(e.target.value)}
          >
            <option value="">{value.kind === "monthAll" ? "Month…" : "Whole year"}</option>
            {months.map((m) => <option key={m} value={m}>{MONTH_ABBR[m - 1]}</option>)}
          </select>
        </>
      )}
    </div>
  );
});
