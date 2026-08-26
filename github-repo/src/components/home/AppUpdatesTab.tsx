/**
 * App Updates.
 *
 * What has been happening around the app: badges people earned, releases that
 * went out, who took the Forecast Game, who got the trivia right, who just
 * joined.
 *
 * The copy is kept plain on purpose. Short sentences, ordinary words, no long
 * dashes. It should read like a person typed it, because the whole point of a
 * feed like this is that it feels like the room talking rather than a system
 * emitting rows.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Award, Megaphone, Trophy, Brain, UserPlus, ArrowUpCircle, Loader2, Filter,
} from "lucide-react";
import {
  fetchAppUpdates, groupByWhen, KIND_LABEL, KIND_COLOR, type UpdateKind,
} from "../../lib/appUpdates";
import { TTL } from "../../lib/queryClient";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";

const ICON: Record<UpdateKind, typeof Award> = {
  badge: Award, release: Megaphone, winner: Trophy,
  trivia: Brain, member: UserPlus, upgrade: ArrowUpCircle,
};

const FILTERS: { id: UpdateKind | "all"; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "release", label: "Updates" },
  { id: "badge", label: "Badges" },
  { id: "winner", label: "Game" },
  { id: "trivia", label: "Trivia" },
  { id: "member", label: "New members" },
];

export function AppUpdatesTab() {
  const [filter, setFilter] = useState<UpdateKind | "all">("all");
  const still = prefersReducedMotion();

  const q = useQuery({
    queryKey: ["app-updates"],
    queryFn: () => fetchAppUpdates(60),
    staleTime: TTL.quick,
  });

  const items = q.data ?? [];
  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );
  const groups = useMemo(() => groupByWhen(shown), [shown]);

  const counts = useMemo(() => {
    const m = new Map<UpdateKind, number>();
    for (const i of items) m.set(i.kind, (m.get(i.kind) ?? 0) + 1);
    return m;
  }, [items]);

  if (q.isLoading) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Catching up…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 mr-0.5" style={{ color: ROYAL.dim }} />
        {FILTERS.map((f) => {
          const on = filter === f.id;
          const n = f.id === "all" ? items.length : counts.get(f.id as UpdateKind) ?? 0;
          if (f.id !== "all" && n === 0) return null;
          const tone = f.id === "all" ? ROYAL.iris : KIND_COLOR[f.id as UpdateKind];
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-colors"
              style={on
                ? { background: `${tone}22`, borderColor: `${tone}77`, color: tone }
                : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
              {f.label}<span className="tabular-nums opacity-75">{n}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl p-10 text-center"
             style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <Megaphone className="w-8 h-8 mx-auto mb-2" style={{ color: ROYAL.dim }} />
          <p className="text-sm" style={{ color: ROYAL.text }}>Nothing to report yet.</p>
          <p className="text-xs mt-1" style={{ color: ROYAL.dim }}>
            Badges, game results and new releases all show up here as they happen.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label}>
              <h3 className="text-[11px] uppercase tracking-[0.24em] mb-2" style={{ color: ROYAL.gold }}>
                {g.label}
              </h3>
              <div className="space-y-1.5">
                {g.items.map((it, i) => {
                  const Icon = ICON[it.kind];
                  const tone = KIND_COLOR[it.kind];
                  return (
                    <motion.article
                      key={it.id}
                      initial={still ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.32, ease: EASE }}
                      className="rounded-xl px-3.5 py-3 flex items-start gap-3"
                      style={{ background: `${tone}0c`, border: `1px solid ${tone}2b` }}
                    >
                      <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                            style={{ background: `${tone}1f`, border: `1px solid ${tone}4d` }}>
                        <Icon className="w-4 h-4" style={{ color: tone }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>
                            {KIND_LABEL[it.kind]}
                          </span>
                          <time className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }} dateTime={it.at}>
                            {new Date(it.at).toLocaleString(undefined, {
                              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <p className="text-sm mt-0.5 leading-snug"
                           style={{ fontFamily: HEADING, color: ROYAL.text }}>
                          {it.text}
                        </p>
                        {it.detail && (
                          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: ROYAL.dim }}>
                            {it.detail}
                          </p>
                        )}
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-center" style={{ color: ROYAL.dim }}>
        Showing the last 45 days.
      </p>
    </div>
  );
}

export default AppUpdatesTab;
