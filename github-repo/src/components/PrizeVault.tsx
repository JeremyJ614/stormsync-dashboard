import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, Copy, Gift, Loader2, Sparkles, Swords, Trophy, Zap,
} from "lucide-react";
import {
  myBenefits, pointsLeaders, claimModuleCredit, claimPointsSteal, claimPointsWipe,
  type Benefit,
} from "../lib/raffles";
import { ALL_MODULES, useAuth } from "../hooks/useAuth";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/**
 * Everything you have won that has not finished happening yet.
 *
 * Three states matter and they read differently on purpose:
 *
 *   claimable — there is a button, and pressing it is the whole prize. Modules
 *               to pick, points to take off the leaders, a board to wipe. These
 *               go to the top and stay lit until they are used.
 *   active    — in force right now. Nothing to do.
 *   pending   — recorded and owed, waiting for something to attach to. Usually a
 *               discount won by somebody with no live subscription: it applies
 *               to their next invoice whenever that is, and saying so is the
 *               difference between a prize and a broken promise.
 *
 * Spent prizes stay listed, greyed. Winning something and then finding no trace
 * of it is worse than seeing it crossed off.
 */
const KIND_ICON: Record<string, typeof Gift> = {
  discount: Zap, discount_ladder: Zap, free_months: Gift, tier: Trophy,
  modules: Sparkles, module_credit: Sparkles, alert_levels: Zap,
  points_monthly: Trophy, points_steal: Swords, points_wipe: Swords,
  engraving: Trophy, beta_access: Sparkles, referral_gift: Gift,
  extra_draw: Trophy, manual: Gift,
};

const STATUS_COPY: Record<string, { label: string; tint: string; note: string }> = {
  claimable: { label: "Yours to take", tint: ROYAL.gold, note: "Waiting on you." },
  active:    { label: "In force",      tint: "#5fd9a8",   note: "Applied to your account." },
  pending:   { label: "Held for you",  tint: "#8fb2ff",   note: "Applies to your next invoice." },
  spent:     { label: "Used",          tint: ROYAL.dim,   note: "" },
};

export function PrizeVault() {
  const still = prefersReducedMotion();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["my-benefits"], queryFn: myBenefits, staleTime: 30_000 });
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["my-benefits"] });
    void qc.invalidateQueries({ queryKey: ["my-tickets"] });
  }, [qc]);

  const rows = q.data ?? [];
  const open = useMemo(() => rows.filter((b) => b.status !== "spent"), [rows]);
  const done = useMemo(() => rows.filter((b) => b.status === "spent"), [rows]);

  if (q.isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 grid place-items-center">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: ROYAL.dim }} />
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Trophy className="w-4 h-4" style={{ color: ROYAL.gold }} />
        <h3 className="text-sm font-semibold" style={{ fontFamily: HEADING }}>Your prizes</h3>
        <span className="ml-auto text-[11px]" style={{ color: ROYAL.dim }}>
          {open.length} open
        </span>
      </div>

      {note && (
        <p className="px-4 py-2 text-[12px] border-b border-border" style={{ color: ROYAL.gold }}>
          {note}
        </p>
      )}

      <div className="divide-y divide-border">
        {[...open, ...done].map((b) => (
          <PrizeRow
            key={b.id}
            benefit={b}
            still={still}
            busy={busy === b.id}
            ownedModules={user?.enabledModules ?? []}
            onBusy={setBusy}
            onNote={setNote}
            onDone={refresh}
          />
        ))}
      </div>
    </div>
  );
}

function PrizeRow({
  benefit, still, busy, ownedModules, onBusy, onNote, onDone,
}: {
  benefit: Benefit; still: boolean; busy: boolean; ownedModules: string[];
  onBusy: (id: string | null) => void;
  onNote: (s: string | null) => void;
  onDone: () => void;
}) {
  const Icon = KIND_ICON[benefit.kind] ?? Gift;
  const st = STATUS_COPY[benefit.status] ?? STATUS_COPY.pending;
  const claimable = benefit.status === "claimable";
  const lit = claimable && !still;

  return (
    <motion.div
      className="relative p-3 flex items-start gap-3"
      initial={false}
      animate={lit
        ? { backgroundColor: ["rgba(217,183,117,0)", "rgba(217,183,117,0.06)", "rgba(217,183,117,0)"] }
        : { backgroundColor: "rgba(217,183,117,0)" }}
      transition={lit ? { duration: 3.2, repeat: Infinity, ease: EASE } : { duration: 0.2 }}
    >
      <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg"
            style={{ background: `${st.tint}1f`, border: `1px solid ${st.tint}44` }}>
        <Icon className="w-4 h-4" style={{ color: st.tint }} />
      </span>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold"
                style={{ color: benefit.status === "spent" ? ROYAL.dim : ROYAL.text }}>
            {benefit.label}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.12em]"
                style={{ background: `${st.tint}1f`, color: st.tint }}>
            {st.label}
          </span>
        </div>

        {benefit.detail && (
          <p className="text-[11.5px] leading-snug" style={{ color: ROYAL.dim }}>{benefit.detail}</p>
        )}
        {benefit.status !== "spent" && st.note && (
          <p className="text-[10.5px]" style={{ color: ROYAL.dim }}>{st.note}</p>
        )}

        {benefit.couponCode && <CouponCode code={benefit.couponCode} />}

        {claimable && (
          <ClaimAction
            benefit={benefit}
            busy={busy}
            ownedModules={ownedModules}
            onBusy={onBusy}
            onNote={onNote}
            onDone={onDone}
          />
        )}
      </div>
    </motion.div>
  );
}

/** A code is only useful if it can be got out of the page in one tap. */
function CouponCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }).catch(() => { /* clipboard is not available everywhere */ });
      }}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-[11px]"
      style={{ border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(217,183,117,0.08)", color: ROYAL.gold }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {code}
    </button>
  );
}

// ── the things you press ─────────────────────────────────────────────────────

function ClaimAction({
  benefit, busy, ownedModules, onBusy, onNote, onDone,
}: {
  benefit: Benefit; busy: boolean; ownedModules: string[];
  onBusy: (id: string | null) => void;
  onNote: (s: string | null) => void;
  onDone: () => void;
}) {
  if (benefit.kind === "module_credit") {
    return <ModulePicker benefit={benefit} busy={busy} ownedModules={ownedModules}
                         onBusy={onBusy} onNote={onNote} onDone={onDone} />;
  }
  if (benefit.kind === "points_steal" || benefit.kind === "points_wipe") {
    return <PointsRaid benefit={benefit} busy={busy} onBusy={onBusy} onNote={onNote} onDone={onDone} />;
  }
  // `manual` and `extra_draw` are things a person does at the other end.
  return (
    <p className="text-[11px]" style={{ color: ROYAL.gold }}>
      Jay will be in touch to set this one up.
    </p>
  );
}

function ModulePicker({
  benefit, busy, ownedModules, onBusy, onNote, onDone,
}: {
  benefit: Benefit; busy: boolean; ownedModules: string[];
  onBusy: (id: string | null) => void;
  onNote: (s: string | null) => void;
  onDone: () => void;
}) {
  const want = Number((benefit.config as { n?: number }).n ?? 1);
  const [picked, setPicked] = useState<string[]>([]);
  const owned = useMemo(() => new Set(ownedModules), [ownedModules]);
  const choices = useMemo(
    () => ALL_MODULES.filter((m) => !m.alwaysOn && !m.adminOnly && !owned.has(m.id)),
    [owned],
  );

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= want ? p : [...p, id]));

  return (
    <div className="space-y-1.5 pt-0.5">
      <p className="text-[10.5px]" style={{ color: ROYAL.dim }}>
        Pick {want}. {picked.length}/{want} chosen.
      </p>
      <div className="flex flex-wrap gap-1">
        {choices.map((m) => {
          const on = picked.includes(m.id);
          return (
            <button key={m.id} onClick={() => toggle(m.id)}
                    className="px-2 py-1 rounded-md text-[10.5px]"
                    style={{
                      border: `1px solid ${on ? ROYAL.gold : ROYAL.hairline}`,
                      background: on ? "rgba(217,183,117,0.14)" : "transparent",
                      color: on ? ROYAL.gold : ROYAL.dim,
                    }}>
              {m.label}
            </button>
          );
        })}
      </div>
      <button
        disabled={picked.length !== want || busy}
        onClick={async () => {
          onBusy(benefit.id); onNote(null);
          const r = await claimModuleCredit(benefit.id, picked);
          onBusy(null);
          onNote(r.ok ? `Added ${picked.length} module${picked.length === 1 ? "" : "s"} to your plan.`
                      : r.error ?? "Could not claim that.");
          if (r.ok) onDone();
        }}
        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-40 flex items-center gap-1.5"
        style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        Claim
      </button>
    </div>
  );
}

/**
 * The two prizes that take points off other people.
 *
 * The leaders are named before the button is pressed, deliberately. The prize
 * has no expiry and is worth timing, and a button that says only "take points"
 * gives no way to time it.
 */
function PointsRaid({
  benefit, busy, onBusy, onNote, onDone,
}: {
  benefit: Benefit; busy: boolean;
  onBusy: (id: string | null) => void;
  onNote: (s: string | null) => void;
  onDone: () => void;
}) {
  const steal = benefit.kind === "points_steal";
  const cfg = benefit.config as { each?: number; from_top?: number; below_rank?: number };
  const top = Number(cfg.from_top ?? 3);
  const leaders = useQuery({
    queryKey: ["points-leaders", top],
    queryFn: () => pointsLeaders(steal ? top : 8),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-1.5 pt-0.5">
      <div className="rounded-lg p-2 space-y-1"
           style={{ border: `1px solid ${ROYAL.hairline}`, background: "rgba(255,255,255,0.02)" }}>
        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: ROYAL.dim }}>
          {steal ? `This year's top ${top}` : "The board right now"}
        </div>
        {(leaders.data ?? []).map((l, i) => (
          <div key={l.userId} className="flex items-center gap-2 text-[11.5px]">
            <span className="w-4 tabular-nums" style={{ color: ROYAL.dim }}>{i + 1}</span>
            <span className="flex-1 min-w-0 truncate" style={{ color: ROYAL.text }}>{l.display}</span>
            <span className="tabular-nums" style={{ color: ROYAL.dim }}>{l.points.toLocaleString()}</span>
          </div>
        ))}
        {(leaders.data ?? []).length === 0 && (
          <p className="text-[11px]" style={{ color: ROYAL.dim }}>Nobody has scored yet this year.</p>
        )}
      </div>

      <button
        disabled={busy}
        onClick={async () => {
          const msg = steal
            ? `Take ${cfg.each?.toLocaleString()} points from each of the top ${top}? You only get one press.`
            : `Wipe everyone ranked ${cfg.below_rank} and below and take their points? You only get one press.`;
          if (!confirm(msg)) return;
          onBusy(benefit.id); onNote(null);
          const r = steal ? await claimPointsSteal(benefit.id) : await claimPointsWipe(benefit.id);
          onBusy(null);
          onNote(r.ok ? `${(r.taken ?? 0).toLocaleString()} points are yours.`
                      : r.error ?? "Could not do that.");
          if (r.ok) onDone();
        }}
        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-40 flex items-center gap-1.5"
        style={{ background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.34)", color: "#f87171" }}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Swords className="w-3 h-3" />}
        {steal ? "Take the points" : "Wipe them out"}
      </button>
    </div>
  );
}
