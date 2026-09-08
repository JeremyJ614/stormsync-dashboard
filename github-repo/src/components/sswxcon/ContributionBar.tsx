import { motion } from "framer-motion";
import { ROYAL, EASE } from "../../lib/royal";

/**
 * What the score is actually made of.
 *
 * The components were seven separate progress bars, each scaled to a shared
 * max of 60 that matched none of their real caps — so a fire score of 15, which
 * is fire weather completely maxed out, drew as a quarter-full bar, and a
 * tornado score of 60, which is halfway up its own scale, drew as a full one.
 * Every bar was lying about the same thing in a different direction, and none
 * of them answered the only question the page is for: what is driving the
 * number today.
 *
 * One stacked bar answers it. Each segment is a component's share of the
 * total, so the widths add to the whole and the widest segment IS the reason
 * the score is what it is. Nothing is scaled against anything invented.
 *
 * A segment narrower than about two percent gets no width of its own — it
 * would render as a sliver too thin to see and too thin to hover, and reading
 * "0.4" in the list below is more honest than a line of pixels pretending to
 * be a quantity.
 */
export interface Contribution {
  label: string;
  short: string;
  score: number;
  color: string;
  detail: string;
  missing: boolean;
}

export function ContributionBar({
  parts, total, calm,
}: { parts: Contribution[]; total: number; calm: boolean }) {
  const live = parts.filter((p) => !p.missing && p.score > 0);
  const sum = live.reduce((a, p) => a + p.score, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>
          What is driving it
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
          {sum > 0 ? `${live.length} of ${parts.length} contributing` : "nothing contributing"}
        </span>
      </div>

      <div className="relative h-7 rounded-lg overflow-hidden flex"
           style={{ background: "rgba(204,204,255,0.05)", border: `1px solid ${ROYAL.hairline}` }}>
        {sum === 0 ? (
          <div className="w-full grid place-items-center text-[10px] uppercase tracking-[0.2em]"
               style={{ color: ROYAL.dim }}>
            Quiet nationwide
          </div>
        ) : (
          live.map((p, i) => {
            const pct = (p.score / sum) * 100;
            return (
              <motion.div
                key={p.label}
                title={`${p.label} — ${p.score.toFixed(1)} of ${total.toFixed(1)}`}
                initial={calm ? false : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={calm ? { duration: 0 } : { duration: 0.7, delay: i * 0.06, ease: EASE }}
                className="relative h-full grid place-items-center overflow-hidden"
                style={{
                  background: `linear-gradient(180deg, ${p.color}, ${p.color}bb)`,
                  borderRight: i < live.length - 1 ? "1px solid rgba(7,7,19,0.55)" : undefined,
                }}
              >
                {pct > 11 && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1 truncate"
                        style={{ color: "#0b0b12" }}>
                    {p.short}
                  </span>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* The full list, including the components sitting at zero — a quiet
          bucket is information, and hiding it would make the bar look like the
          whole scale rather than the part of it that fired today. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {parts.map((p) => {
          const share = sum > 0 && !p.missing ? (p.score / sum) * 100 : 0;
          return (
            <div key={p.label} className="flex items-center gap-2 py-0.5">
              <span className="w-2 h-2 rounded-sm shrink-0"
                    style={{ background: p.missing || p.score === 0 ? "rgba(163,163,204,0.25)" : p.color }} />
              <span className="text-[11px] flex-1 min-w-0 truncate"
                    style={{ color: p.score > 0 && !p.missing ? ROYAL.text : ROYAL.dim }}>
                {p.short}
                <span className="ml-1.5" style={{ color: ROYAL.dim }}>{p.missing ? p.detail : p.detail}</span>
              </span>
              <span className="text-[11px] font-bold tabular-nums shrink-0"
                    style={{ color: p.missing ? ROYAL.dim : p.score > 0 ? p.color : ROYAL.dim }}>
                {p.missing ? "—" : p.score.toFixed(1)}
              </span>
              <span className="w-9 text-[10px] tabular-nums text-right shrink-0" style={{ color: ROYAL.dim }}>
                {p.missing || share < 0.5 ? "" : `${share.toFixed(0)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
