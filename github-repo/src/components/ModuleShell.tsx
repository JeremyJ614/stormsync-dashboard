/**
 * ModuleShell — the frame every module opens in.
 *
 * Before this, thirty-odd pages each hand-rolled their own header: different
 * paddings, different title sizes, some with a source line and some without,
 * entrance animations invented per file. The app read as a set of separately
 * built pages rather than one instrument, and every new module started by
 * copying whichever page happened to be open.
 *
 * The shell fixes the parts that should never vary — the measure, the rhythm,
 * the way a page arrives — and leaves everything below the header free.
 *
 * The design direction is Instrument: apparatus in cold periwinkle, exactly one
 * warm champagne trace, and hierarchy that runs source → name → what it is for.
 * The eyebrow is not decoration. Naming the actual upstream source at the top
 * of every module is a claim the app has to keep, and it is the first thing a
 * forecaster looks for.
 */
import { memo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Apparatus } from "./instrument/Apparatus";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

interface Props {
  /** The upstream source, set small and in champagne. e.g. "SPC · NOAA". */
  eyebrow?: string;
  title: ReactNode;
  /** One sentence on what this module is for. */
  subtitle?: ReactNode;
  /** Controls that belong beside the title — a refresh, a range picker. */
  actions?: ReactNode;
  /** Optional strip directly under the header: status, totals, a warning. */
  status?: ReactNode;
  children: ReactNode;
  /** Wider measure for map-led modules. */
  wide?: boolean;
  /**
   * Narrower measure for modules that are mostly prose or a form.
   *
   * A contact form or an FAQ set across the full six-column measure gives
   * reading lines of 140 characters and input fields a foot wide, which is
   * uncomfortable to read and slightly absurd to type into.
   */
  narrow?: boolean;
  /** Suppresses the geometry, for modules whose own content is already dense. */
  bare?: boolean;
}

export const ModuleShell = memo(function ModuleShell({
  eyebrow, title, subtitle, actions, status, children, wide, narrow, bare,
}: Props) {
  const still = prefersReducedMotion();

  // One entrance vocabulary. Each band is a beat later than the one above it,
  // so a page assembles downward instead of popping in all at once.
  const rise = (delay: number) => ({
    initial: still ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: still ? 0.2 : 0.5, delay: still ? 0 : delay, ease: EASE },
  });

  return (
    <div className={`p-4 md:p-6 mx-auto space-y-4 ${wide ? "max-w-7xl" : narrow ? "max-w-3xl" : "max-w-6xl"}`}>
      <motion.header {...rise(0)} className="relative overflow-hidden rounded-2xl">
        {!bare && <Apparatus height={172} intensity={0.9} />}

        <div className="relative pl-7 pr-1 py-1 md:py-2 flex items-start gap-4 flex-wrap">
          <div className="min-w-0 flex-1 space-y-1">
            {eyebrow && (
              <div className="text-[10px] uppercase tracking-[0.3em] font-semibold flex items-center gap-2"
                   style={{ color: ROYAL.gold }}>
                <span className="inline-block w-1 h-1 rounded-full" style={{ background: ROYAL.gold }} />
                {eyebrow}
              </div>
            )}
            <h1 className="text-2xl md:text-[27px] font-bold tracking-[0.01em] leading-tight"
                style={{ fontFamily: HEADING, color: ROYAL.text }}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm max-w-2xl leading-relaxed" style={{ color: ROYAL.dim }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>

        {/* the rule under the header, drawn rather than placed */}
        <motion.div
          className="relative h-px mt-3 ml-7 mr-1"
          style={{
            background: `linear-gradient(90deg, ${ROYAL.gold}, ${ROYAL.goldSoft} 42%, transparent)`,
            transformOrigin: "left",
          }}
          initial={still ? { opacity: 0 } : { scaleX: 0 }}
          animate={still ? { opacity: 1 } : { scaleX: 1 }}
          transition={{ duration: still ? 0.2 : 0.85, delay: still ? 0 : 0.18, ease: EASE }}
        />
      </motion.header>

      {status && <motion.div {...rise(0.06)}>{status}</motion.div>}
      <motion.div {...rise(status ? 0.12 : 0.06)} className="space-y-4">{children}</motion.div>
    </div>
  );
});

/**
 * The standard panel. A glass surface with a champagne top-rule.
 *
 * `defer` sets `content-visibility: auto`, which lets the browser skip layout
 * and paint for panels below the fold entirely. The paired
 * `contain-intrinsic-size` is what stops the scrollbar jumping as they come
 * into view — without it the browser guesses zero height for everything
 * off-screen.
 */
export function Panel({
  title, aside, children, className = "", defer, padded = true,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  defer?: boolean;
  padded?: boolean;
}) {
  return (
    <section
      className={`royal-glass relative rounded-2xl overflow-hidden ${className}`}
      style={{
        border: `1px solid ${ROYAL.hairline}`,
        boxShadow: `0 20px 44px -30px rgba(0,0,0,0.95)`,
        ...(defer ? { contentVisibility: "auto", containIntrinsicSize: "480px" } as React.CSSProperties : {}),
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
      {(title || aside) && (
        <header className="px-4 py-3 flex items-center gap-3 border-b" style={{ borderColor: ROYAL.hairline }}>
          {title && (
            <h2 className="text-sm font-semibold min-w-0 truncate" style={{ color: ROYAL.text }}>{title}</h2>
          )}
          {aside && <div className="ml-auto shrink-0 flex items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export default ModuleShell;
