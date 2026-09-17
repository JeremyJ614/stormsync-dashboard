/**
 * Rating and state filters for the tornado archive.
 *
 * Both narrow an already-fetched period rather than re-querying it, which is
 * what makes them worth having: a decade of tracks is one download, and after
 * that "EF3 and up, Oklahoma and Kansas" is instant and costs the service
 * nothing.
 *
 * TWO DECISIONS ABOUT THE COUNTS
 *
 * Every chip carries the number of tracks behind it, and those numbers come
 * from the WHOLE period, not from what is left after the other filter has run.
 * Tick EF4 and the state list still says how many tracks each state holds
 * overall. The alternative — recomputing each list against the other — reads
 * as helpful for about two clicks and then becomes impossible to reason about,
 * because the number next to Kansas changes when you tick a rating that has
 * nothing to do with Kansas.
 *
 * And a rating or a state with nothing behind it in this period is not offered
 * at all. An EF5 chip reading 0 is a dead control that looks live; leaving it
 * out says the same thing more honestly and makes the row shorter.
 *
 * The state panel is a popover rather than a row of forty-nine chips for the
 * obvious reason, and it is ordered by count rather than alphabetically,
 * because the question is nearly always "where did these happen" and the
 * answer should be at the top.
 */
import { memo, useMemo, useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, X, Check } from "lucide-react";
import { ROYAL, EASE, SPRING } from "../../lib/royal";
import { EF_ORDER, efHistoryColor } from "../../lib/severeHistoryData";

interface Props {
  /** Tracks per EF rating across the whole period. */
  efCounts: Record<string, number>;
  /** Tracks per state postal code across the whole period. */
  stateCounts: Record<string, number>;
  /** Full state names, for the popover. */
  stateNames: Record<string, string>;
  ef: string[];
  states: string[];
  onEf: (next: string[]) => void;
  onStates: (next: string[]) => void;
  still: boolean;
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export const TornadoFilters = memo(function TornadoFilters({
  efCounts, stateCounts, stateNames, ef, states, onEf, onStates, still,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Both, because a popover that only
  // closes one way is a popover somebody gets stuck in.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const ratings = useMemo(
    () => EF_ORDER.filter((r) => (efCounts[r] ?? 0) > 0),
    [efCounts],
  );

  const stateRows = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return Object.entries(stateCounts)
      .filter(([code]) => !needle ||
        code.includes(needle) || (stateNames[code] ?? "").toUpperCase().includes(needle))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [stateCounts, stateNames, q]);

  const anyFilter = ef.length > 0 || states.length > 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-[0.24em] mr-1" style={{ color: ROYAL.dim }}>Rating</span>

      {ratings.map((r) => {
        const on = ef.includes(r);
        const c = efHistoryColor(r);
        return (
          <button
            key={r}
            onClick={() => onEf(toggle(ef, r))}
            aria-pressed={on}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold tabular-nums transition-colors"
            style={{
              // The rating IS the colour on the map, so the chip wears it too —
              // an active EF4 chip is the same scarlet as an EF4 track.
              color: on ? "#0c0a14" : c,
              background: on ? c : "transparent",
              border: `1px solid ${on ? c : ROYAL.hairline}`,
            }}
          >
            {r === "EFU" ? "Unrated" : r}
            <span className="ml-1.5 opacity-60">{efCounts[r]}</span>
          </button>
        );
      })}

      <div className="relative" ref={wrap}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="px-3 py-1.5 rounded-lg text-[11.5px] font-bold flex items-center gap-1.5 transition-colors"
          style={{
            color: states.length ? "#120f1e" : ROYAL.dim,
            background: states.length ? ROYAL.gold : "transparent",
            border: `1px solid ${states.length ? ROYAL.gold : ROYAL.hairline}`,
          }}
        >
          <MapPin className="w-3.5 h-3.5" />
          {states.length === 0 ? "All states"
            : states.length <= 3 ? states.join(" · ")
            : `${states.length} states`}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={still ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={still ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
              transition={still ? { duration: 0.12 } : SPRING.pop}
              className="absolute z-30 mt-2 w-60 rounded-xl overflow-hidden left-0"
              style={{
                border: `1px solid ${ROYAL.hairline}`,
                background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
                boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
              }}
            >
              <div className="p-2 border-b" style={{ borderColor: ROYAL.hairline }}>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Find a state…"
                  className="sx-input !py-1.5 !text-[11.5px]"
                />
              </div>

              <div className="max-h-60 overflow-y-auto">
                {stateRows.length === 0 && (
                  <p className="px-3 py-4 text-[11px] text-center" style={{ color: ROYAL.dim }}>
                    No tracks match.
                  </p>
                )}
                {stateRows.map(([code, n]) => {
                  const on = states.includes(code);
                  return (
                    <button
                      key={code}
                      onClick={() => onStates(toggle(states, code))}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11.5px] transition-colors hover:bg-white/5"
                      style={{ color: on ? ROYAL.gold : ROYAL.text }}
                    >
                      <span className="w-3.5 shrink-0">
                        {on && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="font-semibold w-7 shrink-0">{code}</span>
                      <span className="truncate flex-1" style={{ color: ROYAL.dim }}>{stateNames[code] ?? ""}</span>
                      <span className="tabular-nums opacity-70">{n}</span>
                    </button>
                  );
                })}
              </div>

              {states.length > 0 && (
                <button
                  onClick={() => onStates([])}
                  className="w-full px-3 py-2 text-[11px] font-semibold border-t transition-colors hover:bg-white/5"
                  style={{ borderColor: ROYAL.hairline, color: ROYAL.dim }}
                >
                  Clear {states.length} selected
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {anyFilter && (
          <motion.button
            initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={still ? { duration: 0.12 } : { duration: 0.22, ease: EASE }}
            onClick={() => { onEf([]); onStates([]); }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1"
            style={{ color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}
          >
            <X className="w-3 h-3" /> Clear
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});
