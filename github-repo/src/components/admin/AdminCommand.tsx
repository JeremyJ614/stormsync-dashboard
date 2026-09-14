/**
 * Jump to a section by typing its name.
 *
 * The panel has twenty-two sections. However they are arranged, past about a
 * dozen the fastest route to one of them is to say its name — which is why every
 * serious tool grew a command palette and why this one has the same keystroke
 * everybody already knows.
 *
 * It earns its place twice. On a phone there is no room for a rail, so the same
 * component is the section picker: one list, one search box, one set of
 * behaviours, rather than a sidebar and a separate mobile menu that drift apart.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CornerDownLeft } from "lucide-react";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";

export interface CommandEntry {
  id: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  entries: CommandEntry[];
  value: string;
  /** Section ids, most recently opened first. Shown before anything is typed. */
  recent?: string[];
  onPick: (id: string) => void;
}

/** Subsequence match, so "aud lg" finds "Audit Log". */
function score(entry: CommandEntry, q: string): number {
  if (!q) return 1;
  const hay = `${entry.label} ${entry.group}`.toLowerCase();
  const direct = hay.indexOf(q);
  if (direct === 0) return 1000;
  if (direct > 0) return 500 - direct;
  let i = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const at = hay.indexOf(ch, i);
    if (at < 0) return 0;
    i = at + 1;
  }
  return 100 - i;
}

export function AdminCommand({ open, onClose, entries, value, recent = [], onPick }: Props) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const still = prefersReducedMotion();

  const needle = q.trim().toLowerCase();

  const hits = useMemo(() => {
    // Nothing typed: lead with where they have actually been, then the rest in
    // the order the panel itself is arranged.
    if (!needle) {
      const byId = new Map(entries.map((e) => [e.id, e]));
      const lead = recent.flatMap((id) => { const e = byId.get(id); return e ? [e] : []; });
      const seen = new Set(lead.map((e) => e.id));
      return [...lead, ...entries.filter((e) => !seen.has(e.id))];
    }
    return entries
      .map((e) => ({ e, s: score(e, needle) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.e);
  }, [entries, needle, recent]);

  const recentCount = needle ? 0 : Math.min(recent.length, hits.length);

  useEffect(() => { if (open) { setQ(""); setCursor(0); } }, [open]);
  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0.1 : 0.18 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Go to section"
        >
          <div className="absolute inset-0" style={{ background: "rgba(3,3,10,0.72)", backdropFilter: "blur(6px)" }} />

          <motion.div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden"
            initial={still ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: still ? 0.12 : 0.24, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            style={{
              border: `1px solid ${ROYAL.goldSoft}`,
              background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
              boxShadow: "0 40px 90px -40px rgba(0,0,0,1)",
            }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                  style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.gold}, transparent)` }} />

            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); const h = hits[cursor]; if (h) { onPick(h.id); onClose(); } }
                  else if (e.key === "Escape") { e.preventDefault(); onClose(); }
                }}
                placeholder="Go to a section…"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: ROYAL.text }}
                aria-label="Search sections"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded"
                   style={{ background: ROYAL.goldFaint, color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
                esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
              {hits.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: ROYAL.dim }}>
                  No section matches “{q}”.
                </div>
              ) : hits.map((h, i) => {
                const Icon = h.icon;
                const on = i === cursor;
                return (
                  <div key={h.id}>
                  {!needle && ((i === 0 && recentCount > 0) || i === recentCount) ? (
                    <div className="px-4 pt-2 pb-1 text-[9px] uppercase tracking-[0.26em] font-bold"
                         style={{ color: ROYAL.dim }}>
                      {i === 0 ? "Recent" : "All sections"}
                    </div>
                  ) : null}
                  <button
                    data-row={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => { onPick(h.id); onClose(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ background: on ? ROYAL.goldFaint : "transparent" }}
                  >
                    {/* lucide strokes with currentColor, so the tint goes on the wrapper
                        rather than on an icon whose prop type is only `className`. */}
                    <span className="shrink-0" style={{ color: on ? ROYAL.gold : ROYAL.dim }}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-semibold" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                      {h.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: ROYAL.dim }}>
                      {h.group}
                    </span>
                    {h.id === value && (
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.18em]"
                            style={{ color: ROYAL.gold }}>open</span>
                    )}
                    {on && h.id !== value && (
                      <span className="ml-auto" style={{ color: ROYAL.gold }}>
                        <CornerDownLeft className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default AdminCommand;
