/**
 * The admin panel's frame.
 *
 * WHAT WAS WRONG
 * Twenty-two sections were presented as twenty-two identical chips in four
 * wrapped rows, stacked above the content. Three consequences, all of them felt
 * every single time the panel was used: the rows pushed the actual work half a
 * screen down; nothing told you where you were once you had scrolled past them;
 * and with every section styled identically at the same weight, finding one was
 * a linear read of twenty-two labels.
 *
 * WHAT IT IS NOW
 * A rail down the side that stays put while you work, with the groups as
 * headings and one travelling champagne slab marking your place — so the panel
 * always answers "where am I" without scrolling. The content gets the full
 * height of the page back.
 *
 * A masthead that says who is operating it. An admin panel is the one screen in
 * an application where the identity of the person using it is load-bearing, and
 * it was the one screen that did not state it.
 *
 * And a command palette on the keystroke everybody already knows, because past
 * about a dozen sections the fastest route to one is to type its name. On a
 * phone the same palette *is* the rail — one list, one search, one set of
 * behaviours, instead of a sidebar and a separate mobile menu that drift apart.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Shield, Command, ChevronRight } from "lucide-react";
import { AdminCommand, type CommandEntry } from "./AdminCommand";
import { useSticky } from "../../lib/stickyState";
import { ROYAL, HEADING, SPRING, EASE, prefersReducedMotion } from "../../lib/royal";

export interface ShellGroup {
  id: string;
  label: string;
  tabs: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

interface Props {
  groups: ShellGroup[];
  value: string;
  onChange: (id: string) => void;
  operator: { name: string; role: string };
  children: ReactNode;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

function RailButton({
  tab, on, onPick, still,
}: {
  tab: ShellGroup["tabs"][number];
  on: boolean;
  onPick: () => void;
  still: boolean;
}) {
  const Icon = tab.icon;
  return (
    <button
      onClick={onPick}
      aria-current={on ? "page" : undefined}
      className="relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left outline-none focus-visible:ring-2 transition-colors"
      style={{
        // @ts-expect-error custom property for the focus ring colour
        "--tw-ring-color": ROYAL.goldSoft,
      }}
    >
      {on && (
        <motion.span
          aria-hidden
          layoutId="admin-rail-active"
          className="absolute inset-0 rounded-lg"
          transition={still ? { duration: 0 } : SPRING.silk}
          style={{
            background: `linear-gradient(90deg, ${ROYAL.goldFaint}, rgba(217,183,117,0.02))`,
            borderLeft: `2px solid ${ROYAL.gold}`,
          }}
        />
      )}
      {/* lucide strokes with currentColor, so the tint goes on the wrapper
          rather than on an icon whose prop type is only `className`. */}
      <span className="relative shrink-0" style={{ color: on ? ROYAL.gold : ROYAL.dim }}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="relative text-[13px] font-semibold truncate"
            style={{ color: on ? ROYAL.text : ROYAL.dim }}>
        {tab.label}
      </span>
    </button>
  );
}

export function AdminShell({ groups, value, onChange, operator, children }: Props) {
  const [palette, setPalette] = useState(false);
  const still = prefersReducedMotion();

  /**
   * The last few sections, remembered across visits.
   *
   * Admin work is interrupted by design — you go and check a member, then a
   * payment, then come back. In practice a handful of sections account for
   * almost every visit, and the palette offering those before you have typed
   * anything is what turns it from a search box into somewhere to start.
   */
  const [recent, setRecent] = useSticky<string[]>(
    "admin.recent", [],
    (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string"),
  );

  const go = useCallback((id: string) => {
    setRecent([id, ...recent.filter((r) => r !== id)].slice(0, 5));
    onChange(id);
  }, [recent, setRecent, onChange]);

  const entries = useMemo<CommandEntry[]>(
    () => groups.flatMap((g) => g.tabs.map((t) => ({ id: t.id, label: t.label, group: g.label, icon: t.icon }))),
    [groups],
  );

  const here = useMemo(() => {
    for (const g of groups) {
      const t = g.tabs.find((x) => x.id === value);
      if (t) return { group: g.label, tab: t };
    }
    return null;
  }, [groups, value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Icon = here?.tab.icon ?? Shield;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* ── masthead ────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden mb-4"
        style={{
          border: `1px solid ${ROYAL.hairline}`,
          background:
            `radial-gradient(60% 140% at 2% -30%, rgba(217,183,117,0.16), transparent 60%),`
            + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
        }}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
        <div className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <Shield className="w-5 h-5 shrink-0" style={{ color: ROYAL.gold }} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
              Administration
            </div>
            <div className="text-sm font-bold truncate" style={{ color: ROYAL.text, fontFamily: HEADING }}>
              {operator.name}
              <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded"
                    style={{ background: ROYAL.goldFaint, color: ROYAL.gold, border: `1px solid ${ROYAL.hairline}` }}>
                {operator.role}
              </span>
            </div>
          </div>

          <button
            onClick={() => setPalette(true)}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] transition-colors hover:bg-white/[0.05]"
            style={{ border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}
          >
            <Command className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Go to section</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded"
                 style={{ background: ROYAL.goldFaint, color: ROYAL.gold }}>
              {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-5">
        {/* ── the rail ──────────────────────────────────────────────────── */}
        <nav
          aria-label="Admin sections"
          className="hidden lg:block self-start sticky top-4 rounded-2xl p-2 space-y-3 max-h-[calc(100vh-2rem)] overflow-y-auto"
          style={{
            background: ROYAL.panel,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: `1px solid ${ROYAL.hairline}`,
          }}
        >
          {groups.map((g) => (
            <div key={g.id}>
              <div className="px-2.5 pt-1 pb-1.5 text-[9px] uppercase tracking-[0.26em] font-bold"
                   style={{ color: ROYAL.dim }}>
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.tabs.map((t) => (
                  <RailButton key={t.id} tab={t} on={t.id === value} still={still}
                              onPick={() => go(t.id)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── the work ──────────────────────────────────────────────────── */}
        <div className="min-w-0">
          {/* On a phone this is the only way in, so it is a control, not a crumb. */}
          <button
            onClick={() => setPalette(true)}
            className="lg:hidden w-full flex items-center gap-2.5 px-3.5 py-3 rounded-2xl mb-3 text-left"
            style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}
          >
            <span className="shrink-0" style={{ color: ROYAL.gold }}><Icon className="w-4 h-4" /></span>
            <span className="min-w-0">
              <span className="block text-[9px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>
                {here?.group ?? "Section"}
              </span>
              <span className="block text-sm font-bold truncate"
                    style={{ color: ROYAL.text, fontFamily: HEADING }}>
                {here?.tab.label ?? "Choose a section"}
              </span>
            </span>
            <ChevronRight className="ml-auto w-4 h-4 shrink-0" style={{ color: ROYAL.dim }} />
          </button>

          <motion.header
            key={value}
            className="hidden lg:flex items-center gap-2.5 mb-3"
            initial={still ? { opacity: 0 } : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: still ? 0.15 : 0.32, ease: EASE }}
          >
            <span className="shrink-0" style={{ color: ROYAL.gold }}><Icon className="w-4 h-4" /></span>
            <span className="text-[10px] uppercase tracking-[0.26em]" style={{ color: ROYAL.dim }}>
              {here?.group}
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: ROYAL.dim }} />
            <h1 className="text-base font-bold" style={{ color: ROYAL.text, fontFamily: HEADING }}>
              {here?.tab.label}
            </h1>
          </motion.header>

          <div className="space-y-5">{children}</div>
        </div>
      </div>

      <AdminCommand
        open={palette}
        onClose={() => setPalette(false)}
        entries={entries}
        value={value}
        recent={recent}
        onPick={go}
      />
    </div>
  );
}

export default AdminShell;
