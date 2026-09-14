/**
 * The way in.
 *
 * The rail and the palette are both good at *going* somewhere and both bad at
 * the first question anybody actually has when they open an admin panel, which
 * is "what is in here". A rail answers it only if all twenty-two sections fit
 * on screen, and they do not; a palette answers it only if you already know the
 * name of the thing you are looking for.
 *
 * So the panel opens on the whole map of itself: every section, grouped, all
 * visible, nothing behind a scroll or a keystroke. Choosing one is then a
 * choice rather than a search — and the rail and the palette are still there
 * for the second and third trip.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import type { ShellGroup } from "./AdminShell";

interface Props {
  groups: ShellGroup[];
  recent: string[];
  onPick: (id: string) => void;
  still: boolean;
}

function Card({
  tab, i, onPick, still, recent,
}: {
  tab: ShellGroup["tabs"][number];
  i: number;
  onPick: () => void;
  still: boolean;
  recent: boolean;
}) {
  const Icon = tab.icon;
  return (
    <motion.button
      onClick={onPick}
      className="group relative text-left rounded-xl p-3 flex items-center gap-3 outline-none focus-visible:ring-2 transition-colors hover:bg-white/[0.04]"
      style={{
        border: `1px solid ${recent ? ROYAL.goldSoft : ROYAL.hairline}`,
        background: recent ? ROYAL.goldFaint : "rgba(10,10,22,0.42)",
        // @ts-expect-error custom property for the focus ring colour
        "--tw-ring-color": ROYAL.goldSoft,
      }}
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0.18 : 0.34, delay: still ? 0 : Math.min(i, 14) * 0.02, ease: EASE }}
      whileTap={still ? undefined : { scale: 0.975 }}
    >
      <span
        className="shrink-0 grid place-items-center w-9 h-9 rounded-lg"
        style={{
          color: ROYAL.gold,
          background: "rgba(217,183,117,0.10)",
          border: `1px solid ${ROYAL.hairline}`,
        }}
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold truncate"
              style={{ color: ROYAL.text, fontFamily: HEADING }}>
          {tab.label}
        </span>
        {recent && (
          <span className="block text-[9px] uppercase tracking-[0.2em]" style={{ color: ROYAL.gold }}>
            recent
          </span>
        )}
      </span>
      <ChevronRight
        className="shrink-0 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: ROYAL.dim }}
      />
    </motion.button>
  );
}

export const AdminOverview = memo(function AdminOverview({ groups, recent, onPick, still }: Props) {
  let n = 0;
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.id}>
          <header className="flex items-center gap-3 mb-2.5">
            <h2 className="text-[10px] uppercase tracking-[0.28em] font-bold" style={{ color: ROYAL.gold }}>
              {g.label}
            </h2>
            <span className="h-px flex-1" style={{ background: ROYAL.hairline }} />
            <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
              {g.tabs.length}
            </span>
          </header>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {g.tabs.map((t) => (
              <Card key={t.id} tab={t} i={n++} still={still}
                    recent={recent[0] === t.id}
                    onPick={() => onPick(t.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});

export default AdminOverview;
