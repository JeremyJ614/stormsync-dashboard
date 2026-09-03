import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Sparkles, Ticket, Trophy } from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import {
  DRAWS, drawMeta, myTickets, raffleCatalogue, describeEffect,
  type CatalogueEntry, type DrawType,
} from "../lib/raffles";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/**
 * The prize wall.
 *
 * Four draws, twenty-five prizes each, and the odds of every one of them
 * printed next to it. Nothing here is a secret: a raffle where you cannot see
 * what is in it is a raffle nobody plays twice, and the whole point of putting
 * this in front of members is that the list is genuinely good.
 *
 * Prizes are shown BEST FIRST and the ladder is drawn as a ladder, because the
 * shape of the list is the pitch — you should be able to see, at a glance, that
 * the top of the Blessed draw is a different order of thing from the top of the
 * Monthly.
 *
 * The odds come from the server already worked out. A prize's chance depends on
 * every other prize in its draw, so computing it here would mean the number
 * moving about as rows arrived.
 */
export default function Raffles() {
  const still = prefersReducedMotion();
  const [draw, setDraw] = useState<DrawType>("monthly");
  const [open, setOpen] = useState<string | null>(null);

  const cat = useQuery({
    queryKey: ["raffle-catalogue"], queryFn: raffleCatalogue, staleTime: 10 * 60_000,
  });
  const tix = useQuery({ queryKey: ["my-tickets"], queryFn: myTickets, staleTime: 60_000 });

  const prizes = useMemo(
    () => (cat.data ?? []).filter((p) => p.drawType === draw).sort((a, b) => b.rank - a.rank),
    [cat.data, draw],
  );
  const held = useMemo(() => {
    const m = new Map<DrawType, number>();
    for (const t of tix.data ?? []) m.set(t.drawType, (m.get(t.drawType) ?? 0) + t.tickets);
    return m;
  }, [tix.data]);

  return (
    <ModuleShell
      eyebrow="StormSync"
      title="Raffles"
      subtitle="Four draws, a hundred prizes, and the odds on every single one."
    >
      {/* ── the four draws ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {DRAWS.map((d) => (
          <DrawCard
            key={d.key}
            meta={d}
            on={draw === d.key}
            tickets={held.get(d.key) ?? 0}
            count={(cat.data ?? []).filter((p) => p.drawType === d.key).length}
            onClick={() => { setDraw(d.key); setOpen(null); }}
            still={still}
          />
        ))}
      </div>

      {cat.isLoading ? (
        <div className="py-16 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: ROYAL.dim }} />
        </div>
      ) : prizes.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Trophy className="w-10 h-10 mx-auto mb-3" style={{ color: ROYAL.goldSoft }} />
          <p className="text-sm font-semibold">No prizes listed for this draw yet</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: ROYAL.gold, fontFamily: HEADING }}>
              {drawMeta(draw).label} — best first
            </h3>
            <span className="text-[11px]" style={{ color: ROYAL.dim }}>
              Tap any prize for what it actually gets you
            </span>
          </div>

          <div className="space-y-1.5">
            {prizes.map((p, i) => (
              <PrizeRow
                key={`${p.drawType}-${p.rank}`}
                prize={p}
                place={i + 1}
                tint={drawMeta(draw).tint}
                open={open === `${p.drawType}-${p.rank}`}
                onToggle={() => setOpen((o) => (o === `${p.drawType}-${p.rank}` ? null : `${p.drawType}-${p.rank}`))}
                still={still}
              />
            ))}
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: ROYAL.dim }}>
            Odds are per draw and are worked out from the weight on each prize, so they always add
            up to a hundred. Anything you win that cannot be applied straight away is held on your
            account and shown in your profile — nothing expires quietly.
          </p>
        </>
      )}
    </ModuleShell>
  );
}

// ── the draw picker ──────────────────────────────────────────────────────────

function DrawCard({
  meta, on, tickets, count, onClick, still,
}: {
  meta: typeof DRAWS[number];
  on: boolean; tickets: number; count: number; onClick: () => void; still: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl px-3.5 py-3 text-left transition-colors"
      style={{
        border: `1px solid ${on ? meta.tint : ROYAL.hairline}`,
        background: on
          ? `linear-gradient(150deg, ${meta.tint}22, ${meta.tint}08)`
          : "rgba(255,255,255,0.022)",
      }}
    >
      {/* A slow sweep across the selected card. One element, and it is the only
          thing on this screen that moves on its own. */}
      {on && !still && (
        <motion.span
          className="pointer-events-none absolute inset-y-0 w-20"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.tint}30, transparent)` }}
          initial={{ x: -100 }}
          animate={{ x: 460 }}
          transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.2, ease: EASE }}
          aria-hidden
        />
      )}
      <div className="relative flex items-center gap-1.5">
        <Ticket className="w-3.5 h-3.5 shrink-0" style={{ color: on ? meta.tint : ROYAL.dim }} />
        <span className="text-[13px] font-bold tracking-tight"
              style={{ color: on ? meta.tint : ROYAL.text, fontFamily: HEADING }}>
          {meta.label}
        </span>
      </div>
      <p className="relative text-[10.5px] mt-1 leading-snug" style={{ color: ROYAL.dim }}>
        {meta.blurb}
      </p>
      <div className="relative mt-2 flex items-center gap-2 text-[10px]" style={{ color: ROYAL.dim }}>
        <span>{count} prizes</span>
        <span aria-hidden>·</span>
        <span style={{ color: tickets > 0 ? meta.tint : ROYAL.dim }}>
          {tickets > 0 ? `${tickets} ticket${tickets === 1 ? "" : "s"} held` : "no tickets yet"}
        </span>
      </div>
    </button>
  );
}

// ── one prize ────────────────────────────────────────────────────────────────

/**
 * The treatment steps up for the top of each ladder.
 *
 * Not decoration for its own sake: a list of twenty-five equal rows tells you
 * nothing about which of them you actually want, and the difference between the
 * first three and the rest is the reason to enter.
 */
function tierOf(place: number): { ring: string; glow: boolean; weight: number } {
  if (place === 1) return { ring: ROYAL.gold, glow: true, weight: 800 };
  if (place <= 3) return { ring: "rgba(217,183,117,0.5)", glow: true, weight: 700 };
  if (place <= 8) return { ring: "rgba(204,204,255,0.22)", glow: false, weight: 650 };
  return { ring: ROYAL.hairline, glow: false, weight: 600 };
}

function PrizeRow({
  prize, place, tint, open, onToggle, still,
}: {
  prize: CatalogueEntry; place: number; tint: string;
  open: boolean; onToggle: () => void; still: boolean;
}) {
  const t = tierOf(place);
  const lit = t.glow && !still;

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl"
      style={{
        border: `1px solid ${open ? tint : t.ring}`,
        background: open ? `${tint}0d` : place <= 3 ? "rgba(217,183,117,0.045)" : "hsl(var(--card))",
      }}
      initial={false}
      animate={lit
        ? { boxShadow: ["0 0 0 0 rgba(217,183,117,0)", "0 0 22px -8px rgba(217,183,117,0.5)", "0 0 0 0 rgba(217,183,117,0)"] }
        : { boxShadow: "0 0 0 0 rgba(217,183,117,0)" }}
      transition={lit ? { duration: 3.4, repeat: Infinity, ease: EASE } : { duration: 0.25 }}
    >
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-center gap-3">
        {/* Place on the ladder, not the raw rank — "1" reads as the top prize. */}
        <span
          className="w-7 h-7 shrink-0 grid place-items-center rounded-lg text-[11px] tabular-nums"
          style={{
            fontFamily: HEADING, fontWeight: t.weight,
            color: place <= 3 ? ROYAL.gold : ROYAL.dim,
            background: place <= 3 ? "rgba(217,183,117,0.13)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${place <= 3 ? ROYAL.goldSoft : ROYAL.hairline}`,
          }}
        >
          {place}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] leading-snug"
                style={{ color: ROYAL.text, fontFamily: HEADING, fontWeight: t.weight }}>
            {prize.label}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-[12px] tabular-nums font-semibold" style={{ color: tint }}>
            {prize.odds.toFixed(2)}%
          </span>
          <span className="block text-[9px] uppercase tracking-[0.14em]" style={{ color: ROYAL.dim }}>
            chance
          </span>
        </span>

        <ChevronDown
          className="w-3.5 h-3.5 shrink-0"
          style={{
            color: ROYAL.dim,
            transform: open ? "rotate(180deg)" : "none",
            transition: `transform .25s cubic-bezier(${EASE.join(",")})`,
          }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={still ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: still ? 0 : 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pl-[52px] space-y-2">
              {prize.description && (
                <p className="text-[12.5px] leading-relaxed" style={{ color: ROYAL.text }}>
                  {prize.description}
                </p>
              )}
              <div className="rounded-lg p-2.5 space-y-1"
                   style={{ border: `1px solid ${ROYAL.hairline}`, background: "rgba(255,255,255,0.02)" }}>
                <div className="text-[9px] uppercase tracking-[0.18em] mb-1" style={{ color: ROYAL.dim }}>
                  What lands on your account
                </div>
                {prize.effects.length === 0 ? (
                  <p className="text-[11.5px]" style={{ color: ROYAL.dim }}>Handed over personally.</p>
                ) : prize.effects.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11.5px]" style={{ color: ROYAL.text }}>
                    <Sparkles className="w-3 h-3 mt-[3px] shrink-0" style={{ color: tint }} />
                    <span className="min-w-0">{describeEffect(e)}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
