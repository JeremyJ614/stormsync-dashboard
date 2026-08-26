/**
 * The alert ladder, drawn once and reused everywhere it is described.
 *
 * Three places need to show the same five levels: the signup page popup, the
 * member's own alert settings, and the admin panel preview. They were never
 * going to stay in agreement as three separate lists, and the one thing worse
 * than an unclear price is three different unclear prices.
 *
 * Each level is drawn as a rung. The rungs climb: the connector between them
 * fills in as you go up, which makes "everything in the level below, plus this"
 * a thing you can see rather than a sentence you have to read five times.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { Check, Lock, Plus, Sparkles, ChevronRight } from "lucide-react";
import {
  ALERT_LEVELS, TIER_NAME, priceFor, money,
  type AlertLevelDef, type AlertPriceRow, type HeldLevel, type LevelSource,
} from "../../lib/alerts";
import type { Tier } from "../../hooks/useAuth";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

interface Props {
  tier: Tier;
  prices: AlertPriceRow[];
  /** Levels the member actually holds. Omit on the signup page — nobody holds anything yet. */
  held?: HeldLevel[];
  /** Called when a level that costs money is chosen. Omit to render read-only. */
  onAdd?: (level: number, price: number) => void;
  still?: boolean;
  /** Compact rungs, for the signup popup where vertical space is scarce. */
  dense?: boolean;
}

const SOURCE_LABEL: Record<LevelSource, string> = {
  tier: "Included",
  purchased: "You added this",
  granted: "Given to you",
};

export const AlertLadder = memo(function AlertLadder({
  tier, prices, held, onAdd, still = false, dense = false,
}: Props) {
  const heldMap = new Map((held ?? []).map((h) => [h.level, h.source]));
  const priceRow = (lvl: number) => prices.find((p) => p.level === lvl);

  return (
    <div className="relative">
      {/* The rail the rungs hang off. */}
      <div className="absolute left-[19px] top-6 bottom-6 w-px"
           style={{ background: `linear-gradient(180deg, ${ALERT_LEVELS[0].color}55, ${ALERT_LEVELS[4].color}55)` }} />

      <div className="space-y-2.5">
        {ALERT_LEVELS.map((def, i) => (
          <Rung
            key={def.level}
            def={def}
            index={i}
            tier={tier}
            price={priceFor(priceRow(def.level), tier, def)}
            source={heldMap.get(def.level)}
            showHeld={!!held}
            onAdd={onAdd}
            still={still}
            dense={dense}
          />
        ))}
      </div>
    </div>
  );
});

function Rung({
  def, index, tier, price, source, showHeld, onAdd, still, dense,
}: {
  def: AlertLevelDef;
  index: number;
  tier: Tier;
  price: number | null;
  source?: LevelSource;
  showHeld: boolean;
  onAdd?: (level: number, price: number) => void;
  still: boolean;
  dense: boolean;
}) {
  const included = tier >= def.includedFrom;
  const has = showHeld ? !!source : included;
  const buyable = !has && price != null && price > 0;

  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: still ? 0.2 : 0.42, delay: still ? 0 : index * 0.08, ease: EASE }}
      className="relative flex gap-3"
    >
      {/* The rung number, sitting on the rail. */}
      <div className="relative shrink-0 z-10">
        <div className="w-10 h-10 rounded-xl grid place-items-center font-black text-sm"
             style={{
               background: has ? `${def.color}26` : "rgba(255,255,255,0.04)",
               border: `1px solid ${has ? def.color + "88" : ROYAL.hairline}`,
               color: has ? def.color : ROYAL.dim,
               boxShadow: has ? `0 0 20px -8px ${def.color}` : undefined,
             }}>
          {def.level}
        </div>
      </div>

      <div className="min-w-0 flex-1 rounded-2xl overflow-hidden"
           style={{
             background: has ? `${def.color}0b` : ROYAL.panel,
             border: `1px solid ${has ? def.color + "33" : ROYAL.hairline}`,
           }}>
        <div className={`flex items-start gap-2 flex-wrap ${dense ? "px-3.5 py-2.5" : "px-4 py-3"}`}>
          <div className="min-w-0 flex-1">
            <h4 className={`font-bold leading-tight ${dense ? "text-sm" : "text-base"}`}
                style={{ fontFamily: HEADING, color: has ? def.color : ROYAL.text }}>
              {def.name}
            </h4>
            <p className={`leading-snug ${dense ? "text-[11px]" : "text-[12px]"} mt-0.5`}
               style={{ color: ROYAL.dim }}>
              {def.tagline}
            </p>
          </div>

          <div className="shrink-0 text-right">
            {has ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: `${def.color}22`, color: def.color }}>
                <Check className="w-3 h-3" />
                {showHeld ? SOURCE_LABEL[source ?? "tier"] : "Included"}
              </span>
            ) : buyable ? (
              onAdd ? (
                <button
                  onClick={() => onAdd(def.level, price!)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-transform active:scale-95"
                  style={{ background: `linear-gradient(180deg, ${def.color}, ${def.color}c0)`, color: "#0d0d18" }}>
                  <Plus className="w-3.5 h-3.5" /> {money(price!)}/mo
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
                      style={{ background: `${def.color}18`, border: `1px solid ${def.color}44`, color: def.color }}>
                  {money(price!)}/mo
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.04)", color: ROYAL.dim }}>
                <Lock className="w-3 h-3" /> {TIER_NAME[def.includedFrom]}
              </span>
            )}
            {!has && (
              <div className="text-[9px] mt-1" style={{ color: ROYAL.dim }}>
                free from {TIER_NAME[def.includedFrom]}
              </div>
            )}
          </div>
        </div>

        {!dense && (
          <div className="px-4 pb-3">
            <div className="flex items-start gap-1.5 mb-2 text-[11px]" style={{ color: def.color }}>
              <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="font-semibold">{def.newHere}</span>
            </div>
            <ul className="space-y-1">
              {def.gives.map((g, k) => (
                <li key={k} className="flex gap-1.5 text-[12px] leading-relaxed" style={{ color: ROYAL.dim }}>
                  <ChevronRight className="w-3 h-3 mt-1 shrink-0" style={{ color: has ? def.color : ROYAL.dim }} />
                  <span style={{ color: k === 0 ? ROYAL.dim : ROYAL.text }}>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default AlertLadder;
