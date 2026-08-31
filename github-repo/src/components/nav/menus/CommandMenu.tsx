import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Clock, CornerDownLeft, Lock, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Command.
 *
 * Search first. Thirty-seven modules is past the point where scanning beats
 * typing, and this is the only style where finding "Mesoscale Discussions" is
 * four keystrokes instead of two taps and a read. Everything else here is a way
 * of looking at the list; this is a way of skipping it.
 *
 * Matching is a scored subsequence, so "msd" finds Mesoscale Discussions and
 * "rivr" finds River & Flood Gauges. Section names match too — typing "severe"
 * brings back the whole section. The matched characters are picked out in
 * champagne as you type, which is what makes a fuzzy match trustworthy: you can
 * see why a result is there.
 *
 * Recents are recorded from actual navigation rather than from clicks in here,
 * so arriving at a module any other way still promotes it.
 */
const RECENTS_KEY = "stormsync_recent_modules_v1";
const RECENTS_MAX = 5;

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, RECENTS_MAX) : [];
  } catch { return []; }
}

/**
 * Score a candidate against the query.
 *
 * Returns null when the query is not a subsequence at all. Higher is better: a
 * prefix beats a word start, a word start beats a loose scatter, and a tighter
 * run of consecutive hits beats a looser one. `hits` carries the matched
 * indices so the caller can highlight them.
 */
function score(text: string, q: string): { score: number; hits: number[] } | null {
  const lt = text.toLowerCase();
  let s = 0;
  const hits: number[] = [];
  let at = 0;
  let prev = -2;
  for (const ch of q) {
    const i = lt.indexOf(ch, at);
    if (i === -1) return null;
    hits.push(i);
    if (i === prev + 1) s += 6;                                   // consecutive
    if (i === 0) s += 10;                                          // prefix
    else if (!/[a-z0-9]/.test(lt[i - 1] ?? "")) s += 7;            // word start
    prev = i;
    at = i + 1;
  }
  // Shorter labels are more likely to be what a short query meant.
  return { score: s - text.length * 0.06, hits };
}

function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i)
          ? <span key={i} style={{ color: ROYAL.gold, fontWeight: 700 }}>{ch}</span>
          : <span key={i}>{ch}</span>,
      )}
    </>
  );
}

interface Row {
  key: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  to: string | null;
  sectionIndex: number;
  locked: boolean;
  hits: number[];
  recent?: boolean;
}

export function CommandMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;
  const [pathname, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecents()));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Every module in the app, flattened once, with the section it belongs to.
  const flat = useMemo(
    () => sections.flatMap((s, si) =>
      s.items.map((it) => ({
        key: it.path, label: it.label, sub: s.label, icon: it.icon,
        to: it.path, sectionIndex: si, locked: Boolean(it.locked),
      }))),
    [sections],
  );

  // Record navigation, wherever it came from.
  useEffect(() => {
    if (!flat.some((f) => f.to === pathname)) return;
    setRecents((prev) => {
      const next = [pathname, ...prev.filter((p) => p !== pathname)].slice(0, RECENTS_MAX);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [pathname, flat]);

  // Ctrl/⌘-K anywhere, and "/" when the caret is not already in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      const typing = e.target instanceof HTMLElement
        && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && k === "k") { e.preventDefault(); toggle(); return; }
      if (k === "/" && !typing && !open) { e.preventDefault(); toggle(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, open]);

  useEffect(() => {
    if (!open) { setQ(""); return; }
    // A phone should not throw up a keyboard the instant the menu appears.
    const coarse = typeof window !== "undefined"
      && window.matchMedia?.("(pointer: coarse)").matches;
    if (!coarse) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => { setActive(0); }, [q, section]);

  const query = q.trim().toLowerCase();

  const rows: Row[] = useMemo(() => {
    if (query) {
      const scored: (Row & { s: number })[] = [];
      for (const f of flat) {
        const own = score(f.label, query);
        const viaSection = own ? null : score(f.sub, query);
        const hit = own ?? viaSection;
        if (!hit) continue;
        scored.push({
          ...f, sub: f.sub, hits: own ? hit.hits : [],
          s: hit.score + (own ? 12 : 0) + (recents.includes(f.to) ? 4 : 0),
        });
      }
      scored.sort((a, b) => b.s - a.s);
      return scored.slice(0, 40).map(({ s: _s, ...r }) => r);
    }

    if (current) {
      return current.items.map((it) => ({
        key: it.path, label: it.label, sub: current.label, icon: it.icon,
        to: it.path, sectionIndex: section ?? -1, locked: Boolean(it.locked), hits: [],
      }));
    }

    const recentRows: Row[] = recents
      .map((p) => flat.find((f) => f.to === p))
      .filter((f): f is typeof flat[number] => Boolean(f))
      .map((f) => ({ ...f, hits: [], recent: true, key: `r-${f.to}` }));

    const sectionRows: Row[] = sections.map((s, i) => ({
      key: `s-${s.label}`, label: s.label, sub: `${s.items.length} module${s.items.length === 1 ? "" : "s"}`,
      icon: s.icon, to: null, sectionIndex: i, locked: false, hits: [],
    }));

    return [...recentRows, ...sectionRows];
  }, [query, flat, current, section, sections, recents]);

  const go = useCallback((r: Row) => {
    if (r.to) return;                       // <Link> handles navigation itself
    openSection(r.sectionIndex);
  }, [openSection]);

  // Arrow keys move the selection; Enter takes it. Escape is owned by useMenuNav.
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") {
      const r = rows[active];
      if (!r) return;
      e.preventDefault();
      if (r.to) { close(); navigate(r.to); }
      else go(r);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, rows.length]);

  const firstRecents = !query && !current ? recents.length : 0;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{ background: "rgba(3,3,10,0.72)", backdropFilter: "blur(16px)", pointerEvents: open ? "auto" : "none" }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.24 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute left-1/2 flex flex-col overflow-hidden rounded-2xl"
            style={{
              top: 64, width: "min(560px, calc(100vw - 28px))", marginLeft: "max(-280px, calc(-50vw + 14px))",
              maxHeight: "min(620px, calc(100vh - 150px))",
              background: "rgba(10,10,20,0.96)",
              border: `1px solid ${ROYAL.goldSoft}`,
              boxShadow: "0 40px 90px -30px rgba(0,0,0,0.95)",
              pointerEvents: "auto",
            }}
            initial={calm ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={calm ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            transition={calm ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
            role="dialog"
            aria-label="Search modules"
          >
            {/* A champagne seam that runs across the top on entry. */}
            {!calm && (
              <motion.span
                aria-hidden
                className="absolute top-0 left-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.gold}, transparent)`, width: "45%" }}
                initial={{ x: "-100%", opacity: 0 }}
                animate={{ x: "260%", opacity: [0, 1, 0] }}
                transition={{ duration: 1.05, ease: EASE, delay: 0.05 }}
              />
            )}

            {/* ── query row ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-2.5 px-4 shrink-0" style={{ height: 56, borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={current ? `Search ${current.label}…` : "Search every module…"}
                autoComplete="off" autoCorrect="off" spellCheck={false}
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
                style={{ color: ROYAL.text }}
                aria-label="Search modules"
              />
              {q && (
                <button onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear the search">
                  <X className="w-4 h-4" style={{ color: ROYAL.dim }} />
                </button>
              )}
            </div>

            {/* ── context row ───────────────────────────────────────────── */}
            {(current || query) && (
              <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
                {current && !query && (
                  <button
                    onClick={back}
                    className="text-[11px] rounded-full px-2.5 py-1"
                    style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}` }}
                  >
                    ← Everything
                  </button>
                )}
                <span className="text-[11px]" style={{ color: ROYAL.dim }}>
                  {rows.length} result{rows.length === 1 ? "" : "s"}
                </span>
              </div>
            )}

            {/* ── results ───────────────────────────────────────────────── */}
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-1.5 [scrollbar-width:thin]">
              {rows.length === 0 && (
                <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: ROYAL.dim }}>
                  Nothing matches “{q}”.
                </div>
              )}

              {rows.map((r, i) => {
                const Icon = r.icon;
                const isActive = i === active;
                const heading =
                  !query && !current && (i === 0 && firstRecents > 0
                    ? "Recent"
                    : i === firstRecents ? "Sections" : null);

                const inner = (
                  <>
                    <span
                      className="grid place-items-center rounded-lg shrink-0"
                      style={{
                        width: 30, height: 30,
                        background: isActive ? "rgba(217,183,117,0.16)" : "rgba(255,255,255,0.05)",
                        color: isActive ? ROYAL.gold : ROYAL.dim,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-[13.5px]" style={{ color: ROYAL.text }}>
                        <Highlight text={r.label} hits={r.hits} />
                      </span>
                      <span className="block truncate text-[10.5px] mt-px" style={{ color: ROYAL.dim }}>
                        {r.sub}
                      </span>
                    </span>
                    {r.recent && <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />}
                    {r.locked && <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />}
                    {isActive
                      ? <CornerDownLeft className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />
                      : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "transparent" }} />}
                  </>
                );

                const common = {
                  "data-idx": i,
                  onMouseEnter: () => setActive(i),
                  className: "w-full flex items-center gap-3 px-3 mx-1.5 rounded-xl text-left",
                  style: {
                    height: 46,
                    width: "calc(100% - 12px)",
                    background: isActive ? "rgba(217,183,117,0.09)" : "transparent",
                    boxShadow: isActive ? `inset 0 0 0 1px ${ROYAL.goldSoft}` : "none",
                  },
                };

                return (
                  <div key={r.key}>
                    {heading && (
                      <div className="px-4 pt-2.5 pb-1 text-[9.5px] uppercase tracking-[0.28em]" style={{ color: ROYAL.gold }}>
                        {heading}
                      </div>
                    )}
                    <motion.div
                      initial={calm ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={calm ? { duration: 0 } : { duration: 0.2, delay: Math.min(0.16, i * 0.018) }}
                    >
                      {r.to
                        ? <Link href={r.to} onClick={close} {...common}>{inner}</Link>
                        : <button onClick={() => go(r)} {...common}>{inner}</button>}
                    </motion.div>
                  </div>
                );
              })}
            </div>

            <div
              className="shrink-0 flex items-center gap-3 px-4 py-2 text-[10px]"
              style={{ borderTop: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}
            >
              <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
              <span className="ml-auto" style={{ color: ROYAL.gold, opacity: 0.8 }}>⌘K</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── the trigger ───────────────────────────────────────────────────── */}
      <button
        onClick={() => toggle()}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full overflow-hidden"
        style={{
          right: 22, bottom: 22, width: 56, height: 56, zIndex: 80,
          background: open ? "rgba(180,69,31,0.92)" : "rgba(8,8,18,0.92)",
          border: `1px solid ${open ? "rgba(255,255,255,0.35)" : ROYAL.goldSoft}`,
          color: open ? "#fff" : ROYAL.gold,
          boxShadow: "0 10px 26px rgba(0,0,0,.55)",
          pointerEvents: "auto",
        }}
      >
        {/* A caret blinking behind the glass — the closed control still reads as
            a text field, which is the whole idea of this style. */}
        {!open && !calm && (
          <motion.span
            aria-hidden
            className="absolute rounded-[1px]"
            style={{ right: 13, bottom: 15, width: 2, height: 11, background: ROYAL.gold }}
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, times: [0, 0.45, 0.5, 1] }}
          />
        )}
        {open ? <X className="w-5 h-5" /> : <Search className="w-5 h-5 relative" style={{ marginRight: 4 }} />}
      </button>
    </div>
  );
}
