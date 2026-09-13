/**
 * One module on the dashboard wall.
 *
 * The design problem here is that forty tiles is a lot of tiles, and the usual
 * answer — make each one interesting — produces a page that is exhausting and
 * says nothing. So the tiles are deliberately UNEQUAL. A tile with nothing to
 * report is a quiet plate: its name, its mark, a hairline. A tile with a real
 * number carries it at display size. A tile with something worth acting on
 * lights its rail and warms its ground.
 *
 * That is the whole instrument: you should be able to open this page, not read
 * a word, and know where to look.
 *
 * Motion is one stagger on entry and one spring on hover, and it is cheap on
 * purpose. Forty tiles each running their own loop is how a dashboard becomes
 * the reason a phone gets warm — the app has been here before, with a splash
 * screen that rotated 60 kB of path for ever.
 */
import { memo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { ROYAL, HEADING, SPRING } from "../../lib/royal";
import type { ModuleTile as Tile, Reading, Tone } from "../../lib/dashboardModules";

const TONE: Record<Tone, { rail: string; wash: string; ink: string }> = {
  quiet:   { rail: "rgba(204,204,255,0.16)", wash: "transparent", ink: ROYAL.text },
  notable: { rail: ROYAL.gold, wash: "rgba(217,183,117,0.07)", ink: ROYAL.gold },
  alert:   { rail: "#ff5257", wash: "rgba(255,82,87,0.09)", ink: "#ff8a8e" },
};

interface Props {
  tile: Tile;
  reading: Reading | null;
  still: boolean;
  /** Position in the wall, for the entry stagger. */
  index: number;
}

export const ModuleTile = memo(function ModuleTile({ tile, reading, still, index }: Props) {
  const tone = TONE[reading?.tone ?? "quiet"];
  const Icon = tile.icon;
  const hasFigure = !!reading?.value;

  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={still
        ? { duration: 0.2, delay: Math.min(index * 0.01, 0.2) }
        // Capped: past about forty tiles the stagger stops being a reveal and
        // starts being a wait.
        : { ...SPRING.silk, delay: Math.min(index * 0.022, 0.5) }}
      whileHover={still ? undefined : { y: -3 }}
    >
      <Link href={tile.path} className="block h-full group">
        <div
          className="relative h-full rounded-2xl overflow-hidden px-3.5 py-3 transition-colors"
          style={{
            background: `linear-gradient(180deg, ${tone.wash}, transparent 70%), ${ROYAL.panel}`,
            border: `1px solid ${ROYAL.hairline}`,
            minHeight: 112,
          }}
        >
          {/* The rail is the loudest thing a quiet tile has, and the quietest
              thing a live one has. It is what makes the wall scannable. */}
          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[2px] transition-opacity"
                style={{ background: tone.rail, opacity: reading?.tone && reading.tone !== "quiet" ? 1 : 0.5 }} />

          <div className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: tone.ink, opacity: 0.85 }} />
            <span className="text-[9.5px] uppercase tracking-[0.18em] font-semibold truncate"
                  style={{ color: ROYAL.dim }}>{tile.label}</span>
            <ArrowUpRight className="w-3 h-3 ml-auto shrink-0 opacity-0 group-hover:opacity-70 transition-opacity"
                          style={{ color: ROYAL.gold }} />
          </div>

          {hasFigure ? (
            <>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-[26px] leading-none font-bold tabular-nums truncate"
                      style={{ fontFamily: HEADING, color: tone.ink }}>{reading!.value}</span>
                {reading!.unit && (
                  <span className="text-[11px] shrink-0" style={{ color: ROYAL.dim }}>{reading!.unit}</span>
                )}
              </div>
              {reading!.note && (
                <div className="text-[10.5px] mt-1 truncate" style={{ color: ROYAL.dim }}>{reading!.note}</div>
              )}
              {reading!.fill !== undefined && (
                <div className="mt-2 h-[3px] rounded-full overflow-hidden"
                     style={{ background: "rgba(204,204,255,0.10)" }}>
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: tone.rail }}
                    initial={still ? false : { width: 0 }}
                    animate={{ width: `${Math.round(Math.max(0, Math.min(1, reading!.fill)) * 100)}%` }}
                    transition={still ? { duration: 0 } : { ...SPRING.silk, delay: 0.25 }}
                  />
                </div>
              )}
            </>
          ) : (
            /*
             * Waiting, not empty. Only modules with a reading are on the wall
             * at all now, so a blank tile means its source has not landed yet
             * — a shimmer says that, where a dash would read as a measurement
             * of nothing.
             */
            <div className="mt-3 space-y-2" aria-label="loading">
              <span className="block h-[22px] w-1/2 rounded-md sx-tile-wait" />
              <span className="block h-[10px] w-3/4 rounded-md sx-tile-wait" />
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
});
