/**
 * The top of the Weather Patterns module: what today is, in words.
 *
 * A gauge tells you a number. This tells you the thing the number stands for —
 * the hazard, and the ground it covers — which is what anybody opening a
 * national severe-weather page actually came to find out.
 *
 * The written paragraph is the Storm Engine's nightly brief. Everything below
 * it is assembled from the issuing centres' own polygons, so a concern cannot
 * name a state the risk does not cover and cannot invent a figure. The two are
 * visually distinct on purpose: prose reads as prose, and the concerns read as
 * readings off an instrument.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import {
  Tornado, CloudHail, Wind, CloudLightning, CloudRain, Waves,
  Flame, Thermometer, Snowflake, CheckCircle2, MapPin,
} from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import type { Concern, ConcernKind, NationalSummary as Summary } from "../../lib/patternSummary";

const ICON: Record<ConcernKind, React.ComponentType<{ className?: string }>> = {
  tornado: Tornado, hail: CloudHail, wind: Wind, storm: CloudLightning,
  rain: CloudRain, flood: Waves, fire: Flame, heat: Thermometer,
  cold: Thermometer, winter: Snowflake, quiet: CheckCircle2,
};

/**
 * Colour carries severity, not hazard type.
 *
 * Giving every hazard its own hue makes a list of five concerns read as five
 * unrelated things. Severity is the only ranking that matters when you are
 * scanning for what to worry about first, so that is what the colour says, and
 * the glyph says which hazard.
 */
const TONE = ["#7f7f9c", ROYAL.iris, ROYAL.gold, "#ff7a63"] as const;

const ConcernRow = memo(function ConcernRow({ c, i, still }: { c: Concern; i: number; still: boolean }) {
  const Icon = ICON[c.kind] ?? CloudLightning;
  const tone = TONE[Math.min(3, Math.max(0, c.weight))];
  return (
    <motion.li
      className="flex items-start gap-3 py-2.5"
      initial={still ? { opacity: 0 } : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: still ? 0.2 : 0.38, delay: still ? 0 : 0.06 * Math.min(i, 8), ease: EASE }}
    >
      <span
        className="shrink-0 grid place-items-center w-8 h-8 rounded-lg mt-px"
        style={{ color: tone, background: `${tone}1f`, border: `1px solid ${tone}33` }}
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] leading-snug" style={{ color: ROYAL.text }}>{c.text}</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] mt-1" style={{ color: ROYAL.dim }}>
          {c.source}
        </span>
      </span>
    </motion.li>
  );
});

interface Props {
  summary: Summary | undefined;
  loading: boolean;
  /** The Storm Engine's own written brief. */
  headline?: string | null;
  prose?: string | null;
  still: boolean;
}

export const NationalSummary = memo(function NationalSummary({
  summary, loading, headline, prose, still,
}: Props) {
  return (
    <section
      className="relative rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${ROYAL.hairline}`,
        background:
          `radial-gradient(64% 130% at 4% -25%, rgba(217,183,117,0.15), transparent 60%),`
          + `radial-gradient(60% 120% at 98% 0%, rgba(120,110,255,0.12), transparent 62%),`
          + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      {/* the forecast, in the forecaster's words */}
      <div className="p-4 sm:p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
          The national picture
        </div>
        <h2
          className="font-black mt-2 leading-[1.05] tracking-[-0.01em]"
          style={{ fontFamily: HEADING, color: ROYAL.text, fontSize: "clamp(20px, 3.6vw, 30px)" }}
        >
          {headline || "Today across the country"}
        </h2>
        {prose && (
          <p className="text-[13.5px] leading-relaxed mt-2.5 max-w-[72ch]" style={{ color: ROYAL.dim }}>
            {prose}
          </p>
        )}
      </div>

      {/* the concerns */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5" style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-[10px] uppercase tracking-[0.28em] font-bold pt-4 pb-1"
             style={{ color: ROYAL.gold }}>
          Key concerns
        </div>

        {loading ? (
          <div className="py-6 text-[12px] flex items-center gap-2" style={{ color: ROYAL.dim }}>
            <motion.span className="w-1.5 h-1.5 rounded-full" style={{ background: ROYAL.gold }}
                         animate={{ opacity: [0.3, 1, 0.3] }}
                         transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
            Reading the outlooks from SPC, WPC and CPC…
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: ROYAL.hairline }}>
            {(summary?.concerns ?? []).map((c, i) => (
              <ConcernRow key={c.id} c={c} i={i} still={still} />
            ))}
          </ul>
        )}

        {summary && summary.regions.length > 0 && (
          <div className="mt-4 pt-3.5" style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
            <div className="text-[10px] uppercase tracking-[0.28em] font-bold mb-2 flex items-center gap-1.5"
                 style={{ color: ROYAL.gold }}>
              <MapPin className="w-3 h-3" /> Regions under the day's risk
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.regions.map((r) => (
                <span key={r} className="px-2.5 py-1 rounded-full text-[11.5px]"
                      style={{ background: ROYAL.goldFaint, border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {summary && !summary.complete && (
          <div className="text-[10.5px] mt-3" style={{ color: ROYAL.dim }}>
            One of the centres did not answer; the concerns above are what did.
          </div>
        )}
      </div>
    </section>
  );
});

export default NationalSummary;
