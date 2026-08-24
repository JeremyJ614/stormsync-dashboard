/**
 * The dashboard's opening statement.
 *
 * A single aurora-washed slab: the temperature set as a display figure, the
 * condition glyph carrying its own light, and the readings you actually glance
 * at laid along the bottom rail. Everything enters on one stagger so the panel
 * assembles itself rather than popping in.
 */
import { motion } from "framer-motion";
import { MapPin, Wind, Droplets, Thermometer, ArrowUp, ArrowDown } from "lucide-react";
import { ROYAL, HEADING, EASE, auroraStyle } from "../../lib/royal";
import { CountUp } from "./CountUp";

interface Rail { label: string; value: React.ReactNode; icon: React.ElementType }

export function ConditionsHero({
  tempF, feelsF, condition, place, glyph,
  hiF, loF, windMph, windDir, humidity, loading,
}: {
  tempF: number | null; feelsF: number | null;
  condition: string; place: string; glyph: string;
  hiF: number | null; loF: number | null;
  windMph: number | null; windDir: string; humidity: number | null;
  loading: boolean;
}) {
  const rail: Rail[] = [
    { label: "Feels like", value: <><CountUp value={feelsF} />°</>, icon: Thermometer },
    { label: "High / Low", value: <><CountUp value={hiF} />° / <CountUp value={loF} />°</>, icon: ArrowUp },
    { label: "Wind", value: <><CountUp value={windMph} /> <span className="text-[11px] font-normal opacity-70">mph {windDir}</span></>, icon: Wind },
    { label: "Humidity", value: <><CountUp value={humidity} />%</>, icon: Droplets },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border"
      style={{ borderColor: ROYAL.hairline, ...auroraStyle }}
    >
      {/* Champagne top rule. */}
      <span className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      {/* Slow ambient sheen — the only thing on the page that keeps moving. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-y-full w-1/3"
        style={{ background: `linear-gradient(90deg, transparent, rgba(217,183,117,0.06), transparent)` }}
        animate={{ x: ["-40%", "340%"] }}
        transition={{ duration: 11, repeat: Infinity, ease: "linear", repeatDelay: 5 }}
      />

      <div className="relative px-5 pt-5 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.45, ease: EASE }}
          className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em]"
          style={{ color: ROYAL.gold }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping"
                  style={{ background: ROYAL.gold }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: ROYAL.gold }} />
          </span>
          Live conditions
        </motion.div>

        <div className="mt-3 flex items-start gap-4 flex-wrap">
          {/* Glyph with its own halo. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 16 }}
            className="relative shrink-0 leading-none"
            style={{ fontSize: "clamp(3rem, 11vw, 4.6rem)" }}
          >
            <span className="absolute inset-0 blur-2xl opacity-40" aria-hidden>{glyph}</span>
            <span className="relative">{glyph}</span>
          </motion.div>

          <div className="min-w-0 flex-1">
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.5, ease: EASE }}
              className="flex items-start leading-[0.86]"
            >
              <span className="font-bold" style={{ fontFamily: HEADING, fontSize: "clamp(3.2rem, 13vw, 5.4rem)", color: ROYAL.text }}>
                {loading ? "—" : <CountUp value={tempF} />}
              </span>
              <span className="mt-2 ml-1 text-2xl font-light" style={{ color: ROYAL.gold }}>°F</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: EASE }}
              className="mt-1.5"
            >
              <div className="text-[15px] font-semibold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
                {condition}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: ROYAL.dim }}>
                <MapPin className="w-3 h-3" style={{ color: ROYAL.gold }} />
                <span className="truncate">{place}</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Reading rail. */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 border-t" style={{ borderColor: ROYAL.hairline }}>
        {rail.map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26 + i * 0.06, duration: 0.45, ease: EASE }}
            className="px-4 py-3 border-r last:border-r-0 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r"
            style={{ borderColor: ROYAL.hairline }}
          >
            <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em]" style={{ color: ROYAL.dim }}>
              <r.icon className="w-3 h-3" style={{ color: ROYAL.gold }} />
              {r.label}
            </div>
            <div className="mt-1 text-lg font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
              {loading ? "—" : r.value}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

export default ConditionsHero;
