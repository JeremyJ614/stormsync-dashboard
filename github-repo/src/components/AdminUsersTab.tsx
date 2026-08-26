/**
 * The member list, sectioned by tier.
 *
 * The old flat list put a Free trial and a founding Advanced member on the same
 * row with the same weight, which is the wrong shape for the only questions
 * this screen gets asked: who is paying, who just arrived, and what does a
 * given person actually see. So: tiers are the spine, search cuts across all of
 * them, and a name opens the whole record rather than a row of controls guessed
 * at from initials.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Users, UserPlus, Search, Loader2, ChevronRight, KeyRound, Trash2, Eye,
  Crown, Star, Shield, Check, X, Mail, Calendar, Share2, Package,
} from "lucide-react";
import { useAuth, ALL_MODULES, type User, type BadgeDef, type Tier } from "../hooks/useAuth";
import {
  listUsers, adminDeleteUser, adminSetPin, setUserTier, setUserModules, setUserReferrals,
} from "../lib/userAdmin";
import { BadgeChip } from "./BadgeChip";
import { audit } from "../lib/adminAudit";
import { startViewingAs } from "../lib/impersonate";
import { getMemberTotals } from "../lib/gamePoints";
import { ROYAL, SPRING, prefersReducedMotion } from "../lib/royal";

const TIERS: { tier: Tier; label: string; blurb: string; icon: typeof Crown; color: string }[] = [
  { tier: 4, label: "Advanced", blurb: "Every module, always", icon: Crown,  color: "#d9b775" },
  { tier: 3, label: "VIP",      blurb: "Bundle plus picks",    icon: Star,   color: "#c084fc" },
  { tier: 2, label: "Basic",    blurb: "Bundle plus picks",    icon: Shield, color: "#5fd9a8" },
  { tier: 1, label: "Free",     blurb: "One module, on us",    icon: Users,  color: "#7f9fd8" },
];

const tierMeta = (t: Tier) => TIERS.find((x) => x.tier === t) ?? TIERS[3];

export function AdminUsersTab({
  badgeDefs, onCreate,
}: { badgeDefs: BadgeDef[]; onCreate: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<Tier>>(new Set());

  const refresh = useCallback(async () => {
    try {
      setUsers(await listUsers());
      setErr("");
    } catch {
      setErr("Failed to load members.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return users;
    return users.filter((u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      Object.values(u.customAnswers ?? {}).some((v) => String(v).toLowerCase().includes(q)));
  }, [users, q]);

  const byTier = useMemo(() => {
    const m = new Map<Tier, User[]>();
    for (const t of TIERS) m.set(t.tier, []);
    for (const u of matches) m.get(u.tier)?.push(u);
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [matches]);

  const detail = open ? users.find((u) => u.id === open) ?? null : null;

  function toggle(t: Tier) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* search + create */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or signup answers…"
            className="w-full bg-muted/25 border border-border rounded-lg pl-9 pr-8 py-2 text-sm outline-none focus:border-primary/50"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={onCreate}
          className="px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold flex items-center gap-1.5 hover:bg-primary/30">
          <UserPlus className="w-4 h-4" /> Create
        </button>
      </div>

      {q && (
        <p className="text-xs text-muted-foreground">
          {matches.length === 0
            ? `No members match “${query}”.`
            : `${matches.length} of ${users.length} members match “${query}”.`}
        </p>
      )}

      {err && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{err}</div>}

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading members…
        </div>
      ) : (
        <LayoutGroup id="admin-tiers">
          <div className="space-y-3">
            {TIERS.map(({ tier, label, blurb, icon: Icon, color }) => {
              const list = byTier.get(tier) ?? [];
              // While searching, an empty tier is noise; otherwise it is a fact
              // worth showing — "nobody is on Basic" is real information.
              if (q && list.length === 0) return null;
              const shut = collapsed.has(tier);
              return (
                <section key={tier} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggle(tier)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
                  >
                    <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                          style={{ background: `${color}1f`, border: `1px solid ${color}55` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold block truncate">{label}</span>
                      <span className="text-[11px] text-muted-foreground block truncate">{blurb}</span>
                    </span>
                    <span className="text-sm tabular-nums font-bold shrink-0" style={{ color }}>{list.length}</span>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${shut ? "" : "rotate-90"}`} />
                  </button>

                  <AnimatePresence initial={false}>
                    {!shut && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={prefersReducedMotion() ? { duration: 0.12 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        {list.length === 0 ? (
                          <p className="px-4 pb-4 pt-1 text-xs text-muted-foreground">Nobody on this tier yet.</p>
                        ) : (
                          <div className="divide-y divide-border border-t border-border">
                            {list.map((u) => (
                              <UserRow key={u.id} user={u} badgeDefs={badgeDefs} onOpen={() => setOpen(u.id)} />
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        </LayoutGroup>
      )}

      <AnimatePresence>
        {detail && (
          <UserDetail
            user={detail}
            badgeDefs={badgeDefs}
            onClose={() => setOpen(null)}
            onChanged={() => void refresh()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UserRow({ user, badgeDefs, onOpen }: { user: User; badgeDefs: BadgeDef[]; onOpen: () => void }) {
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <button onClick={onOpen} className="w-full p-3 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors">
      <span className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 grid place-items-center text-[11px] font-bold text-primary shrink-0">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
          {user.name}
          {user.isAdmin && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 uppercase">
              Admin
            </span>
          )}
          {(user.badges ?? []).slice(0, 3).map((id) => <BadgeChip key={id} id={id} defs={badgeDefs} />)}
        </span>
        <span className="text-xs text-muted-foreground block truncate">{user.email}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ─── detail sheet ────────────────────────────────────────────────────────────
function UserDetail({
  user, badgeDefs, onClose, onChanged,
}: { user: User; badgeDefs: BadgeDef[]; onClose: () => void; onChanged: () => void }) {
  const { realUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const still = prefersReducedMotion();
  const meta = tierMeta(user.tier);

  useEffect(() => {
    getMemberTotals().then((m) => setPoints(m.get(user.id)?.points ?? 0)).catch(() => setPoints(null));
  }, [user.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  async function changeTier(tier: Tier) {
    if (tier === user.tier) return;
    await run(async () => {
      await setUserTier(user.id, tier);
      await audit("user.tier", { type: "user", id: user.id, label: user.name }, { from: user.tier, to: tier });
      onChanged();
    });
  }

  async function toggleModule(id: string) {
    const has = user.enabledModules.includes(id);
    const next = has ? user.enabledModules.filter((m) => m !== id) : [...user.enabledModules, id];
    await run(async () => {
      await setUserModules(user.id, next);
      await audit("user.modules", { type: "user", id: user.id, label: user.name },
        { module: id, granted: !has });
      onChanged();
    });
  }

  async function bumpReferrals(delta: number) {
    const next = Math.max(0, user.referrals + delta);
    await run(async () => {
      await setUserReferrals(user.id, next);
      await audit("user.referrals", { type: "user", id: user.id, label: user.name }, { from: user.referrals, to: next });
      onChanged();
    });
  }

  async function resetPin() {
    const pin = window.prompt(`New 4-digit PIN for ${user.name}:`);
    if (pin == null) return;
    await run(async () => {
      const r = await adminSetPin(user.id, pin.trim());
      if (r.ok) await audit("user.pin", { type: "user", id: user.id, label: user.name });
      alert(r.ok ? "PIN updated." : (r.error ?? "Failed to set PIN"));
    });
  }

  async function remove() {
    if (!confirm(`Delete ${user.name}? This permanently removes their account.`)) return;
    await run(async () => {
      const r = await adminDeleteUser(user.id);
      if (!r.ok) { alert(r.error ?? "Delete failed"); return; }
      await audit("user.delete", { type: "user", id: user.id, label: user.name }, { email: user.email, tier: user.tier });
      onClose();
      onChanged();
    });
  }

  async function viewAs() {
    await audit("user.viewas", { type: "user", id: user.id, label: user.name });
    startViewingAs(user);
    onClose();
  }

  const joined = new Date(user.joinedAt);
  const answers = Object.entries(user.customAnswers ?? {}).filter(([, v]) => String(v).trim());
  const sellable = ALL_MODULES.filter((m) => !m.alwaysOn && !m.adminOnly);
  // Count against the same set the chips below show. `enabledModules` can also
  // carry always-on and admin-only ids, which is how this read "33 of 31".
  const sellableIds = new Set(sellable.map((m) => m.id));
  const grantedSellable = user.enabledModules.filter((id) => sellableIds.has(id)).length;
  const isSelf = realUser?.id === user.id;

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={still ? { opacity: 0 } : { y: 40, opacity: 0, scale: 0.98 }}
        animate={still ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
        exit={still ? { opacity: 0 } : { y: 30, opacity: 0, scale: 0.985 }}
        transition={still ? { duration: 0.15 } : SPRING.silk}
        className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-card border border-border rounded-t-2xl sm:rounded-2xl"
      >
        {/* header */}
        <div className="sticky top-0 z-10 px-5 py-4 border-b border-border bg-card/95 backdrop-blur flex items-start gap-3">
          <span className="w-11 h-11 rounded-full bg-primary/20 border border-primary/40 grid place-items-center text-sm font-bold text-primary shrink-0">
            {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold truncate flex items-center gap-2">
              {user.name}
              {user.isAdmin && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 uppercase">
                  Admin
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
              <Mail className="w-3 h-3 shrink-0" /> {user.email}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`p-5 space-y-5 ${busy ? "opacity-60 pointer-events-none" : ""}`}>
          {/* at a glance */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Tier" value={meta.label} tone={meta.color} />
            <Stat label="Modules" value={String(user.enabledModules.length)} />
            <Stat label="Referrals" value={String(user.referrals)} />
            <Stat label="Points" value={points === null ? "—" : String(points)} />
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            Joined {joined.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </p>

          {/* view as */}
          <div className="rounded-xl p-3 flex items-center gap-3"
               style={{ background: `${ROYAL.gold}12`, border: `1px solid ${ROYAL.gold}44` }}>
            <Eye className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold" style={{ color: ROYAL.gold }}>See the app as {user.name.split(" ")[0]}</p>
              <p className="text-[11px] text-muted-foreground">
                Their navigation and module access, read-only. You stay signed in as yourself.
              </p>
            </div>
            <button onClick={viewAs} disabled={isSelf}
              className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
              {isSelf ? "That's you" : "View as"}
            </button>
          </div>

          {/* tier */}
          <Section title="Tier">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIERS.map(({ tier, label, icon: Icon, color }) => {
                const on = user.tier === tier;
                return (
                  <button key={tier} onClick={() => changeTier(tier)}
                    className="px-2 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border"
                    style={on
                      ? { background: `${color}22`, borderColor: `${color}88`, color }
                      : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Changing tier resets module access to that tier's defaults.
            </p>
          </Section>

          {/* modules */}
          <Section title={`Module access (${grantedSellable} of ${sellable.length})`} icon={Package}>
            <div className="flex flex-wrap gap-1.5">
              {sellable.map((m) => {
                const on = user.enabledModules.includes(m.id);
                return (
                  <button key={m.id} onClick={() => toggleModule(m.id)}
                    className="px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors border"
                    style={on
                      ? { background: "rgba(217,183,117,0.16)", borderColor: "rgba(217,183,117,0.5)", color: ROYAL.gold }
                      : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
                    {on && <Check className="w-3 h-3" />}{m.label}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* badges */}
          {(user.badges ?? []).length > 0 && (
            <Section title="Badges">
              <div className="flex flex-wrap gap-1.5">
                {user.badges.map((id) => <BadgeChip key={id} id={id} defs={badgeDefs} />)}
              </div>
            </Section>
          )}

          {/* signup answers */}
          {answers.length > 0 && (
            <Section title="Signup answers">
              <dl className="space-y-1.5">
                {answers.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <dt className="text-muted-foreground shrink-0 min-w-[110px]">{k}</dt>
                    <dd className="text-foreground break-words">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {/* actions */}
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => bumpReferrals(1)}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5" /> + Referral
              </button>
              {user.referrals > 0 && (
                <button onClick={() => bumpReferrals(-1)}
                  className="px-2.5 py-1.5 rounded-lg text-xs bg-muted/30 text-muted-foreground hover:text-foreground">
                  − Referral
                </button>
              )}
              <button onClick={resetPin}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> Reset PIN
              </button>
              {!user.isAdmin && (
                <button onClick={remove}
                  className="px-2.5 py-1.5 rounded-lg text-xs bg-red-500/12 text-red-300 hover:bg-red-500/22 flex items-center gap-1.5 ml-auto">
                  <Trash2 className="w-3.5 h-3.5" /> Delete account
                </button>
              )}
            </div>
          </Section>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}` }}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon?: typeof Package; children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}{title}
      </h4>
      {children}
    </div>
  );
}

export default AdminUsersTab;
