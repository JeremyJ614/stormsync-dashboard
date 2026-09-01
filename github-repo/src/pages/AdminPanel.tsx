import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Link } from "wouter";
import { renderMarkdown } from "../lib/markdown";
import { useAuth, ALL_MODULES, HIDDEN_MODULES, type User, type BadgeDef, type SignupQuestion, type QuestionType, type Tier } from "../hooks/useAuth";
import {
  listUsers, adminCreateUser, adminDeleteUser, adminSetPin,
  setUserTier, setUserModules, setUserBadges, setUserReferrals,
  getQuestions, saveQuestions, getEmergencyPin, saveEmergencyPin,
  getEmergencyRecipients, saveEmergencyRecipients,
} from "../lib/userAdmin";
import {
  listBadgeDefs, createBadge, updateBadge, deleteBadge,
  listBadgeRules, saveBadgeRule, deleteBadgeRule, backfillBadges, slugifyBadgeId,
  BADGE_KINDS, BADGE_REGIONS, type BadgeRule,
} from "../lib/badges";
import { getLoyaltyRules, saveLoyaltyRules, awardLoyaltyPoints, getUserLoyaltyTotal, slugifyEarnKey, type LoyaltyRules, type EarnRule } from "../lib/loyalty";
import { BadgeChip } from "../components/BadgeChip";
import { AdminNavTab } from "../components/AdminNavTab";
import { AdminTriviaTab } from "../components/AdminTriviaTab";
import AdminBillingTab from "../components/AdminBillingTab";
import { AdminPointsTab } from "../components/AdminPointsTab";
import { AdminInvoicesTab } from "../components/AdminInvoicesTab";
import { AdminUsersTab } from "../components/AdminUsersTab";
import { AdminAlertsTab } from "../components/admin/AdminAlertsTab";
import { AdminMoneyTab } from "../components/AdminMoneyTab";
import { AdminHealthTab } from "../components/AdminHealthTab";
import { AdminUsageTab } from "../components/AdminUsageTab";
import { AdminAuditTab } from "../components/AdminAuditTab";
import { AdminMenuStyleCard } from "../components/admin/AdminMenuStyleCard";
import { AdminOwnerNotifyCard } from "../components/admin/AdminOwnerNotifyCard";
import { AdminTiersTab } from "../components/admin/AdminTiersTab";
// Rich-text editing is a couple of hundred kilobytes of ProseMirror. It loads
// when somebody opens the News tab, not when they open the admin panel.
const NewsEditor = lazy(() => import("../components/admin/NewsEditor").then((m) => ({ default: m.NewsEditor })));
import { getAdminLayout, resolveLayout, DEFAULT_LAYOUT, type AdminLayout } from "../lib/adminGroups";
import { audit } from "../lib/adminAudit";
import { listAllNews, createNews, updateNews, patchNews, deleteNews, type NewsPost, type NewsInput, type NewsStatus } from "../lib/news";
import { listFaq, createFaq, updateFaq, deleteFaq, reorderFaq, listCategories, createCategory, updateCategory, deleteCategory, reorderCategories, seedFaqDefaults, type FaqEntry, type FaqCategory, type FaqSection } from "../lib/faq";
import { DEFAULT_FAQ } from "../lib/faqDefaults";
import { listBroadcasts, createBroadcast, deleteBroadcast, type Broadcast } from "../lib/broadcasts";
import { listContactSubmissions, markContactRead, deleteContactSubmission, type ContactSubmissionRow } from "../lib/contactInbox";
import { adminListAlertOptins, type AlertOptin } from "../lib/notifications";
import { supabase } from "../lib/supabase";
import { Shield, Users, Crown, Bell, BellRing, Mail, MessageSquare, Phone, MapPin, Newspaper, DollarSign, Settings, Trash2, Plus, Check, AlertTriangle, Award, UserPlus, X, KeyRound, Loader2, ClipboardList, Pencil, ArrowUp, ArrowDown, HelpCircle, Pin, PinOff, Eye, EyeOff, Calendar, Tag, FileText, Clock, Save, ListOrdered, Brain, Trophy, Activity, BarChart3, ScrollText, RotateCcw } from "lucide-react";

type Tab =
  | "users" | "nav" | "modules" | "badges" | "signups" | "broadcasts" | "inbox" | "alerts"
  | "news" | "trivia" | "points" | "faq" | "billing" | "invoices" | "settings"
  | "money" | "health" | "usage" | "audit" | "tiers";

/**
 * Every tab that exists, as data.
 *
 * Grouping and order come from `app_config.admin_groups` (see lib/adminGroups)
 * and are edited inside the panel itself. This registry only says what exists —
 * a tab added here with nowhere to file it lands under "Everything else" rather
 * than vanishing.
 */
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "users",      label: "Members",           icon: Users },
  { id: "signups",    label: "Signups",           icon: ClipboardList },
  { id: "alerts",     label: "Alert Opt-ins",     icon: BellRing },
  { id: "points",     label: "Points",            icon: Trophy },
  { id: "badges",     label: "Badges",            icon: Award },
  { id: "tiers",      label: "Tiers",             icon: Crown },
  { id: "money",      label: "Money",             icon: DollarSign },
  { id: "billing",    label: "Pricing",           icon: Tag },
  { id: "invoices",   label: "Invoices",          icon: FileText },
  { id: "news",       label: "SSWX News",         icon: Newspaper },
  { id: "faq",        label: "FAQ & Guide",       icon: HelpCircle },
  { id: "trivia",     label: "Daily Trivia",      icon: Brain },
  { id: "broadcasts", label: "Send Notification", icon: Bell },
  { id: "inbox",      label: "Contact Inbox",     icon: Mail },
  { id: "health",     label: "System Health",     icon: Activity },
  { id: "usage",      label: "Module Usage",      icon: BarChart3 },
  { id: "audit",      label: "Audit Log",         icon: ScrollText },
  { id: "nav",        label: "Sidebar & Modules", icon: ListOrdered },
  { id: "modules",    label: "Module Access",     icon: Settings },
  { id: "settings",   label: "Settings",          icon: Settings },
];

export default function AdminPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [badgeDefs, setBadgeDefs] = useState<BadgeDef[]>([]);
  const [layout, setLayout] = useState<AdminLayout>(DEFAULT_LAYOUT);
  const [showCreate, setShowCreate] = useState(false);
  const reloadBadges = useCallback(() => { listBadgeDefs().then(setBadgeDefs).catch(() => {}); }, []);
  useEffect(() => { reloadBadges(); }, [reloadBadges]);
  useEffect(() => { getAdminLayout().then(setLayout).catch(() => {}); }, []);

  const groups = useMemo(() => resolveLayout(layout, TABS), [layout]);

  if (!user || !user.isAdmin) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-3">
        <Shield className="w-10 h-10 text-yellow-400 mx-auto" />
        <h1 className="text-xl font-bold">Admin Only</h1>
        <p className="text-sm text-muted-foreground">You must be signed in as an administrator.</p>
        <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Admin Panel</h1>
      </div>


      {/* Tabs, grouped by the layout saved in app_config. */}
      <div className="space-y-2 border-b border-border pb-2">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-20 shrink-0">
              {g.label}
            </span>
            <div className="flex gap-1 flex-wrap">
              {g.tabs.map((t) => {
                const meta = TABS.find((x) => x.id === t.id)!;
                const Icon = meta.icon;
                const on = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id as Tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      on ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                    style={on ? { background: "hsl(var(--primary) / 0.14)", border: "1px solid hsl(var(--primary) / 0.35)" }
                              : { border: "1px solid transparent" }}>
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {tab === "users" && <AdminUsersTab badgeDefs={badgeDefs} onCreate={() => setShowCreate(true)} />}
      {showCreate && <CreateUserModal badgeDefs={badgeDefs} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />}
      {tab === "tiers" && <AdminTiersTab />}
      {tab === "money" && <AdminMoneyTab />}
      {tab === "health" && <AdminHealthTab />}
      {tab === "usage" && <AdminUsageTab />}
      {tab === "audit" && <AdminAuditTab />}
      {tab === "nav" && <AdminNavTab knownAdminTabs={TABS} />}
      {tab === "modules" && <ModulesTab />}
      {tab === "badges" && <BadgesTab badgeDefs={badgeDefs} reloadBadges={reloadBadges} />}
      {tab === "signups" && <SignupsTab />}
      {tab === "broadcasts" && <BroadcastsTab />}
      {tab === "inbox" && <InboxTab />}
      {tab === "alerts" && <AdminAlertsTab />}
      {tab === "news" && <NewsTab adminName={user.name} />}
      {tab === "trivia" && <AdminTriviaTab />}
      {tab === "points" && <AdminPointsTab />}
      {tab === "faq" && <FaqTab />}
      {tab === "billing" && <AdminBillingTab />}
      {tab === "invoices" && <AdminInvoicesTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

function CreateUserModal({ badgeDefs, onClose, onCreated }: { badgeDefs: BadgeDef[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [tier, setTier] = useState<Tier>(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleBadge(id: string) {
    setBadges(b => b.includes(id) ? b.filter(x => x !== id) : [...b, id]);
  }

  async function submit() {
    setError("");
    if (!name.trim()) { setError("Name required"); return; }
    setSubmitting(true);
    try {
      const result = await adminCreateUser({ name: name.trim(), email: email.trim(), pin, tier, isAdmin, badges });
      if (!result.ok) { setError(result.error ?? "Failed"); return; }
      onCreated(); onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" /> Create User</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted/30"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4-digit PIN" inputMode="numeric" maxLength={4} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm tracking-[0.5em] text-center font-mono" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Tier:</label>
            <select value={tier} onChange={e => setTier(Number(e.target.value) as Tier)} className="bg-muted/30 border border-border rounded-lg px-2 py-1 text-xs">
              <option value={1}>Tier 1</option><option value={2}>Tier 2</option><option value={3}>Tier 3</option><option value={4}>Tier 4 Elite</option>
            </select>
            <label className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
              <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Admin
            </label>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Badges</div>
          <div className="flex flex-wrap gap-1.5">
            {badgeDefs.map(b => (
              <button key={b.id} onClick={() => toggleBadge(b.id)}
                className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border transition-colors"
                style={{ background: badges.includes(b.id) ? b.color + "30" : "transparent", color: badges.includes(b.id) ? b.color : "#64748b", borderColor: badges.includes(b.id) ? b.color + "80" : "#1e293b" }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-muted/30 border border-border text-sm">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-3 py-1.5 rounded bg-primary/20 border border-primary/40 text-primary text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModulesTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await listUsers();
        setUsers(u);
        setSelectedId(prev => prev || u[0]?.id || "");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const selected = users.find(u => u.id === selectedId);

  async function toggle(path: string) {
    if (!selected) return;
    const enabled = selected.enabledModules.includes(path)
      ? selected.enabledModules.filter(m => m !== path)
      : [...selected.enabledModules, path];
    setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, enabledModules: enabled } : u)); // optimistic
    const r = await setUserModules(selected.id, enabled);
    if (!r.ok) { alert(r.error ?? "Failed to update modules"); setUsers(await listUsers()); }
  }

  if (loading) return <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold">Select User</h3></div>
        <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
          {users.map(u => (
            <button key={u.id} onClick={() => setSelectedId(u.id)}
              className={`w-full text-left px-4 py-2.5 ${selectedId === u.id ? "bg-primary/10" : "hover:bg-muted/30"}`}>
              <div className="text-sm font-medium truncate">{u.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">{selected ? `Modules for ${selected.name}` : "Pick a user"}</h3>
          <p className="text-[11px] text-muted-foreground">Toggle to enable/disable each page. Always-on modules cannot be disabled.</p>
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[500px] overflow-y-auto">
          {selected && ALL_MODULES.filter(m => !m.adminOnly && !HIDDEN_MODULES.has(m.id)).map(m => {
            const on = selected.enabledModules.includes(m.id);
            return (
              <button key={m.id} disabled={m.alwaysOn} onClick={() => toggle(m.id)}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                  on ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted/20 text-muted-foreground"
                } ${m.alwaysOn ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"}`}>
                <span className="truncate">{m.label}{m.alwaysOn ? " 🔒" : ""}</span>
                {on && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
        {selected && <AwardPointsCard userId={selected.id} userName={selected.name} />}
      </div>
    </div>
  );
}

function AwardPointsCard({ userId, userName }: { userId: string; userName: string }) {
  const [rules, setRules] = useState<LoyaltyRules | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [kind, setKind] = useState("");
  const [points, setPoints] = useState(0);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const reloadTotal = useCallback(() => { getUserLoyaltyTotal(userId).then(setTotal); }, [userId]);
  useEffect(() => { getLoyaltyRules().then(r => { setRules(r); if (r.earn_rules[0]) { setKind(r.earn_rules[0].key); setPoints(r.earn_rules[0].points); } }); }, []);
  useEffect(() => { reloadTotal(); }, [reloadTotal]);

  // Prefill the point value from the selected earn rule whenever it changes.
  useEffect(() => {
    const rule = rules?.earn_rules.find(r => r.key === kind);
    if (rule) setPoints(rule.points);
  }, [kind, rules]);

  async function award() {
    const r = await awardLoyaltyPoints(userId, kind, points, note.trim() || undefined);
    if (!r.ok) { alert(r.error ?? "Failed to award points"); return; }
    setNote(""); setSaved(true); setTimeout(() => setSaved(false), 1500); reloadTotal();
  }

  return (
    <div className="border-t border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Loyalty Points — {userName}</h4>
        <span className="text-sm font-bold text-yellow-300 tabular-nums">{total === null ? "…" : total.toLocaleString()} pts</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Reason</span>
          <select value={kind} onChange={e => setKind(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40">
            {(rules?.earn_rules ?? []).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Points</span>
          <input type="number" value={points} onChange={e => setPoints(parseInt(e.target.value) || 0)}
            className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Note (optional)</span>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. referred Jane"
            className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
        </label>
        <button onClick={award} className="px-4 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30">
          {saved ? "Awarded ✓" : "Award"}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">Negative points allowed for corrections. Game-win points post automatically.</p>
    </div>
  );
}

const BADGE_GROUPS: Array<BadgeDef["group"]> = ["Role", "Tier", "Achievement"];

function BadgeEditor({ initial, rule, onSave, onCancel, saving }: {
  initial: Omit<BadgeDef, "id"> & { id?: string };
  /** The automation attached to this badge, if it has one. */
  rule?: BadgeRule;
  onSave: (b: Omit<BadgeDef, "id">, rule: BadgeRule | null) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [label, setLabel] = useState(initial.label);
  const [color, setColor] = useState(initial.color);
  const [description, setDescription] = useState(initial.description);
  const [group, setGroup] = useState<BadgeDef["group"]>(initial.group);
  // A badge with no rule is awarded by hand, which is still the right answer for
  // the honorary ones — so automation is opt-in rather than assumed.
  const [auto, setAuto] = useState(Boolean(rule));
  const [kind, setKind] = useState(rule?.kind ?? "points_total");
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? 100));
  const [region, setRegion] = useState(rule?.param ?? BADGE_REGIONS[0].key);
  const [ruleOn, setRuleOn] = useState(rule?.enabled ?? true);
  const kindMeta = BADGE_KINDS.find((k) => k.kind === kind);
  const previewDef: BadgeDef = { id: "__preview", label: label || "Badge Preview", color, description, group };

  return (
    <div className="space-y-2 bg-muted/20 rounded-lg p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Badge label"
          className="bg-card border border-border rounded px-2 py-1.5 text-sm flex-1 min-w-[140px]" />
        <select value={group} onChange={e => setGroup(e.target.value as BadgeDef["group"])}
          className="bg-card border border-border rounded px-2 py-1.5 text-xs">
          {BADGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (shown on hover)"
        className="w-full bg-card border border-border rounded px-2 py-1.5 text-xs" />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Color</span>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#7B8FD9"}
          onChange={e => setColor(e.target.value)}
          className="w-9 h-8 bg-transparent border border-border rounded cursor-pointer p-0.5" />
        <input value={color} onChange={e => setColor(e.target.value)} placeholder="#22d3ee" maxLength={7}
          className="w-24 bg-card border border-border rounded px-2 py-1.5 text-xs font-mono" />
        <span className="ml-auto"><BadgeChip id="__preview" defs={[previewDef]} size="md" /></span>
      </div>
      {/* ── what earns it ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/70 p-2.5 space-y-2" style={{ background: "rgba(255,255,255,0.02)" }}>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} className="accent-primary" />
          <span className="font-semibold">Award this automatically</span>
          <span className="text-muted-foreground">— otherwise you hand it out yourself</span>
        </label>
        {auto && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={kind} onChange={e => setKind(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1.5 text-xs">
                {BADGE_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
              {kind === "region" ? (
                <select value={region} onChange={e => setRegion(e.target.value)}
                  className="bg-card border border-border rounded px-2 py-1.5 text-xs">
                  {BADGE_REGIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              ) : (
                <>
                  <span className="text-[11px] text-muted-foreground">reaches</span>
                  <input value={threshold} onChange={e => setThreshold(e.target.value)} inputMode="numeric"
                    className="w-24 bg-card border border-border rounded px-2 py-1.5 text-xs tabular-nums" />
                  <span className="text-[11px] text-muted-foreground">{kindMeta?.unit}</span>
                </>
              )}
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-auto cursor-pointer">
                <input type="checkbox" checked={ruleOn} onChange={e => setRuleOn(e.target.checked)} className="accent-primary" />
                Rule active
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {kind === "region"
                ? "Awarded from the first location a member ever saved. Nothing to earn — it is a nickname for where they watch from."
                : `Awarded the first time a member's ${kindMeta?.label.toLowerCase()} reaches this number. Existing members get it on their next visit, or immediately if you re-run the rules.`}
            </p>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1 rounded bg-muted/30 border border-border text-xs">Cancel</button>
        <button
          onClick={() => onSave(
            { label, color, description, group },
            auto
              ? { badgeId: initial.id ?? "", kind, threshold: Number(threshold) || 0, param: region, enabled: ruleOn }
              : null,
          )}
          disabled={saving}
          className="px-3 py-1 rounded bg-primary/20 border border-primary/40 text-primary text-xs font-semibold disabled:opacity-60 flex items-center gap-1.5">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}

function BadgeLibrary({ badgeDefs, reloadBadges }: { badgeDefs: BadgeDef[]; reloadBadges: () => void }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<Record<string, BadgeRule>>({});
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);

  const reloadRules = useCallback(() => { void listBadgeRules().then(setRules); }, []);
  useEffect(() => { reloadRules(); }, [reloadRules]);

  async function doSave(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setSaving(true);
    try {
      const r = await fn();
      if (!r.ok) { alert(r.error ?? "Failed"); return false; }
      reloadBadges();
      return true;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Persist the automation alongside the badge.
   *
   * A rule is a separate row keyed by badge id, so a new badge has to be saved
   * before its rule can point at it — hence the id being resolved from the
   * label when the caller does not have one yet.
   */
  async function persistRule(badgeId: string, rule: BadgeRule | null) {
    const r = rule
      ? await saveBadgeRule({ ...rule, badgeId })
      : await deleteBadgeRule(badgeId);
    if (!r.ok) alert(r.error ?? "The badge saved, but its rule did not.");
    reloadRules();
  }

  async function runBackfill() {
    if (!confirm("Re-run every badge rule against every member? Members who qualify for badges they do not have will be given them, and each gets one summary notification.")) return;
    setBackfilling(true); setBackfillNote(null);
    const r = await backfillBadges();
    setBackfilling(false);
    setBackfillNote(r.ok
      ? `Awarded ${r.awarded} badge${r.awarded === 1 ? "" : "s"} across ${r.members} member${r.members === 1 ? "" : "s"}.`
      : r.error ?? "The backfill failed.");
    reloadBadges();
  }

  async function remove(b: BadgeDef) {
    if (!confirm(`Delete the "${b.label}" badge? It will be removed from every user who has it.`)) return;
    await doSave(() => deleteBadge(b.id));
    void audit("badge.delete", { type: "badge", id: b.id, label: b.label });
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-yellow-400" /> Badge Library ({badgeDefs.length})</h3>
          <p className="text-[11px] text-muted-foreground">Create, edit, and delete badge definitions. Pick any hex color — the badge glows with it.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {backfillNote && <span className="text-[11px] text-muted-foreground">{backfillNote}</span>}
          <button onClick={runBackfill} disabled={backfilling} title="Award every badge that members have already earned"
            className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60">
            {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Re-run rules
          </button>
          <button onClick={() => { setCreating(true); setEditingId(null); }}
            className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/30">
            <Plus className="w-3.5 h-3.5" /> New Badge
          </button>
        </div>
      </div>
      <div className="p-3 space-y-3 max-h-[460px] overflow-y-auto">
        {creating && (
          <BadgeEditor saving={saving}
            initial={{ label: "", color: "#7B8FD9", description: "", group: "Achievement" }}
            onCancel={() => setCreating(false)}
            onSave={async (b, rule) => {
              if (await doSave(() => createBadge(b))) {
                void audit("badge.create", { type: "badge", label: b.label });
                await persistRule(slugifyBadgeId(b.label), rule);
                setCreating(false);
              }
            }} />
        )}
        {BADGE_GROUPS.map(g => {
          const inGroup = badgeDefs.filter(b => b.group === g);
          if (!inGroup.length) return null;
          return (
            <div key={g}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{g} Badges</div>
              <div className="space-y-1.5">
                {inGroup.map(b => editingId === b.id ? (
                  <BadgeEditor key={b.id} saving={saving} initial={b} rule={rules[b.id]}
                    onCancel={() => setEditingId(null)}
                    onSave={async (patch, rule) => {
                      if (await doSave(() => updateBadge(b.id, patch))) {
                        void audit("badge.update", { type: "badge", id: b.id, label: b.label });
                        await persistRule(b.id, rule);
                        setEditingId(null);
                      }
                    }} />
                ) : (
                  <div key={b.id} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2">
                    <BadgeChip id={b.id} defs={badgeDefs} />
                    <span className="text-xs text-muted-foreground flex-1 truncate">{b.description}</span>
                    {rules[b.id] && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              background: rules[b.id].enabled ? "rgba(217,183,117,0.14)" : "rgba(255,255,255,0.05)",
                              color: rules[b.id].enabled ? "#d9b775" : "#64748b",
                            }}>
                        {rules[b.id].kind === "region"
                          ? BADGE_REGIONS.find(r => r.key === rules[b.id].param)?.label ?? "region"
                          : `${BADGE_KINDS.find(k => k.kind === rules[b.id].kind)?.label ?? rules[b.id].kind} ≥ ${rules[b.id].threshold}`}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">{b.color}</span>
                    <button onClick={() => { setEditingId(b.id); setCreating(false); }} title="Edit"
                      className="p-1.5 rounded hover:bg-primary/15 text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(b)} title="Delete"
                      className="p-1.5 rounded hover:bg-red-500/15 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BadgesTab({ badgeDefs, reloadBadges }: { badgeDefs: BadgeDef[]; reloadBadges: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await listUsers();
        setUsers(u);
        setSelectedId(prev => prev || u[0]?.id || "");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const selected = users.find(u => u.id === selectedId);

  async function toggle(badgeId: string) {
    if (!selected) return;
    const next = (selected.badges ?? []).includes(badgeId)
      ? (selected.badges ?? []).filter(b => b !== badgeId)
      : [...(selected.badges ?? []), badgeId];
    setUsers(prev => prev.map(u => u.id === selected.id ? { ...u, badges: next } : u)); // optimistic
    const r = await setUserBadges(selected.id, next);
    if (!r.ok) { alert(r.error ?? "Failed to update badges"); setUsers(await listUsers()); }
  }

  if (loading) return <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <BadgeLibrary badgeDefs={badgeDefs} reloadBadges={reloadBadges} />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold">Select User</h3></div>
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {users.map(u => (
              <button key={u.id} onClick={() => setSelectedId(u.id)} className={`w-full text-left px-4 py-2.5 ${selectedId === u.id ? "bg-primary/10" : "hover:bg-muted/30"}`}>
                <div className="text-sm font-medium truncate">{u.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">{(u.badges ?? []).map(id => <BadgeChip key={id} id={id} defs={badgeDefs} />)}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-yellow-400" /> {selected ? `Badges for ${selected.name}` : "Pick a user"}</h3>
            <p className="text-[11px] text-muted-foreground">Click any badge to toggle. Badges appear next to the user's name throughout the app.</p>
          </div>
          <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
            {selected && BADGE_GROUPS.map(g => (
              <div key={g}>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{g} Badges</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {badgeDefs.filter(b => b.group === g).map(b => {
                    const on = (selected.badges ?? []).includes(b.id);
                    return (
                      <button key={b.id} onClick={() => toggle(b.id)}
                        className="text-left p-3 rounded-lg border transition-colors"
                        style={{ borderColor: on ? b.color + "80" : "#1e293b", background: on ? b.color + "15" : "transparent" }}>
                        <div className="flex items-center gap-2">
                          <BadgeChip id={b.id} defs={badgeDefs} />
                          {on && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1.5">{b.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BroadcastsTab() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { listUsers().then(setUsers).catch(() => setUsers([])); }, []);
  const [items, setItems] = useState<Broadcast[]>([]);
  const [msg, setMsg] = useState("");
  const [level, setLevel] = useState<"info" | "warning" | "alert">("info");
  const [target, setTarget] = useState<string>("");
  const refresh = useCallback(async () => { try { setItems(await listBroadcasts()); } catch { /* empty state */ } }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function send() {
    if (!msg.trim()) return;
    const r = await createBroadcast({ message: msg.trim(), level, targetUserId: target || null });
    if (!r.ok) { alert(r.error ?? "Failed to send"); return; }
    void audit("broadcast.send", { type: "broadcast", label: target ? "one member" : "everyone" },
      { level, chars: msg.trim().length });
    setMsg(""); void refresh();
  }
  async function remove(id: string) {
    await deleteBroadcast(id); void refresh();
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Send In-App Notification</h3>
        <div className="bg-muted/30 border border-border rounded-lg p-2 text-[11px] text-muted-foreground">
          <strong>Note:</strong> Delivers as an in-app toast next time the user opens the app. Real phone push requires a service worker, VAPID keys, and user push subscriptions.
        </div>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} placeholder="Type the message users will see..."
          className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 resize-none" />
        <div className="flex flex-wrap gap-2">
          <select value={level} onChange={e => setLevel(e.target.value as "info" | "warning" | "alert")}
            className="bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs">
            <option value="info">Info</option><option value="warning">Warning</option><option value="alert">Alert</option>
          </select>
          <select value={target} onChange={e => setTarget(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs flex-1 min-w-[200px]">
            <option value="">→ All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
          <button onClick={send} className="px-4 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30">
            Send
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold">History ({items.length})</h3></div>
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No notifications sent yet</div>}
          {items.map(b => (
            <div key={b.id} className="p-3 flex items-start gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${b.level === "alert" ? "bg-red-500/20 text-red-300" : b.level === "warning" ? "bg-orange-500/20 text-orange-300" : "bg-primary/20 text-primary"}`}>{b.level}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{b.message}</div>
                <div className="text-[10px] text-muted-foreground">{new Date(b.createdAt).toLocaleString()} {b.targetUserId ? "· Targeted" : "· All users"}</div>
              </div>
              <button onClick={() => remove(b.id)} className="p-1 rounded hover:bg-red-500/15 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InboxTab() {
  const [items, setItems] = useState<ContactSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setItems(await listContactSubmissions()); } catch { /* surfaced via empty state */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const unread = items.filter(s => !s.read).length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Contact Inbox ({items.length}{unread ? ` · ${unread} unread` : ""})</h3>
        <button onClick={() => void refresh()} className="text-xs text-muted-foreground hover:text-primary">Refresh</button>
      </div>
      <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
        {loading && <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
        {!loading && items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No submissions yet</div>}
        {items.map(s => (
          <div key={s.id} className={`p-4 ${s.read ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${s.kind === "emergency" ? "bg-red-500/20 text-red-300" : s.kind === "customer-service" ? "bg-yellow-400/20 text-yellow-300" : "bg-primary/20 text-primary"}`}>{s.kind}</span>
                <span className="text-sm font-medium">{s.name}</span>
                {s.email && <a href={`mailto:${s.email}`} className="text-xs text-primary hover:underline">{s.email}</a>}
                {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
              </div>
              <div className="flex items-center gap-1">
                {!s.read && <button onClick={async () => { await markContactRead(s.id); void refresh(); }} className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25">Mark read</button>}
                <button onClick={async () => { await deleteContactSubmission(s.id); void refresh(); }} className="p-1 rounded hover:bg-red-500/15 text-red-400"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
            <div className="text-sm whitespace-pre-wrap mt-1 leading-relaxed">{s.message}</div>
            <div className="text-[10px] text-muted-foreground mt-2">{new Date(s.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const NEWS_CATEGORIES = ["Announcement", "Forecast", "Severe Weather", "Education", "Event", "Community", "Update"];
const NEWS_TIERS = [
  { v: 1, label: "Everyone (Tier 1+)" },
  { v: 2, label: "Tier 2+" },
  { v: 3, label: "Tier 3+" },
  { v: 4, label: "Tier 4 Elite only" },
];
const isoToLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function NewsTab({ adminName }: { adminName: string }) {
  const [items, setItems] = useState<NewsPost[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [embedHtml, setEmbedHtml] = useState("");
  const [pinned, setPinned] = useState(false);
  const [status, setStatus] = useState<NewsStatus>("published");
  const [schedule, setSchedule] = useState("");      // datetime-local string
  const [minTier, setMinTier] = useState(1);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => { try { setItems(await listAllNews()); } catch { /* empty state */ } }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  function reset() {
    setEditingId(null); setTitle(""); setExcerpt(""); setCategory(""); setTags([]); setTagInput("");
    setBody(""); setImageUrl(""); setVideoUrl(""); setEmbedHtml(""); setPinned(false);
    setStatus("published"); setSchedule(""); setMinTier(1); 
  }
  function loadForEdit(p: NewsPost) {
    setEditingId(p.id); setTitle(p.title); setExcerpt(p.excerpt ?? ""); setCategory(p.category ?? "");
    setTags(p.tags); setTagInput(""); setBody(p.body); setImageUrl(p.imageUrl ?? "");
    setVideoUrl(p.videoUrl ?? ""); setEmbedHtml(p.embedHtml ?? ""); setPinned(p.pinned);
    setStatus(p.status); setSchedule(isoToLocalInput(p.publishAt)); setMinTier(p.minTier); 
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function addTag(raw: string) {
    const t = raw.trim().replace(/,$/, "");
    if (t && !tags.includes(t) && tags.length < 10) setTags([...tags, t]);
    setTagInput("");
  }

  async function save(asStatus: NewsStatus) {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    const input: NewsInput = {
      title: title.trim(), body: body.trim(), excerpt: excerpt.trim() || undefined,
      category: category.trim() || undefined, tags,
      imageUrl: imageUrl.trim() || undefined, videoUrl: videoUrl.trim() || undefined, embedHtml: embedHtml.trim() || undefined,
      pinned, status: asStatus,
      publishAt: asStatus === "published" && schedule ? new Date(schedule).toISOString() : null,
      minTier,
    };
    const r = editingId ? await updateNews(editingId, input) : await createNews({ ...input, author: adminName });
    setBusy(false);
    if (!r.ok) { alert(r.error ?? "Failed to save"); return; }
    reset(); void refresh();
  }
  async function del(id: string) {
    if (!confirm("Delete this post?")) return;
    if (editingId === id) reset();
    await deleteNews(id); void refresh();
  }
  async function togglePin(p: NewsPost) { await patchNews(p.id, { pinned: !p.pinned }); void refresh(); }
  async function toggleStatus(p: NewsPost) { await patchNews(p.id, { status: p.status === "published" ? "draft" : "published" }); void refresh(); }

  const fieldCls = "w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40";

  return (
    <div className="space-y-4">
      <div ref={formRef} className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-primary" /> {editingId ? "Edit SSWX News Post" : "Add SSWX News Post"}
          </h3>
          {editingId && <button onClick={reset} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"><X className="w-3 h-3" /> Cancel edit</button>}
        </div>

        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className={fieldCls} />
        <input value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Excerpt / summary (optional — shown in the feed preview)" className={`${fieldCls} text-xs`} />

        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1"><Tag className="w-3 h-3" /> Category</label>
            <input list="news-cats" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Severe Weather" className={`${fieldCls} text-xs`} />
            <datalist id="news-cats">{NEWS_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1"><Eye className="w-3 h-3" /> Audience</label>
            <select value={minTier} onChange={e => setMinTier(Number(e.target.value))} className={`${fieldCls} text-xs`}>
              {NEWS_TIERS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Tags</label>
          <div className="flex flex-wrap items-center gap-1.5 bg-muted/30 border border-border rounded-lg px-2 py-1.5">
            {tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 text-primary text-[11px]">
                {t}<button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); addTag(tagInput); } else if (e.key === "Backspace" && !tagInput && tags.length) { setTags(tags.slice(0, -1)); } }}
              onBlur={() => tagInput.trim() && addTag(tagInput)}
              placeholder={tags.length ? "" : "Add tags (Enter to add)"} className="flex-1 min-w-[8rem] bg-transparent text-xs outline-none py-0.5" />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Article body</label>
          <Suspense fallback={<div className="h-[300px] rounded-lg bg-muted/20 border border-border animate-pulse" />}>
            <NewsEditor
              value={body}
              onChange={setBody}
              resetToken={editingId ?? "new"}
              placeholder="Write the post. Use the toolbar for headings, colour, size and links — no Markdown to remember."
            />
          </Suspense>
        </div>

        <div className="grid md:grid-cols-3 gap-2">
          <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Cover image URL" className={`${fieldCls} text-xs`} />
          <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Video URL (mp4/youtube)" className={`${fieldCls} text-xs`} />
          <input value={embedHtml} onChange={e => setEmbedHtml(e.target.value)} placeholder='Embed HTML (<iframe …>)' className={`${fieldCls} text-xs font-mono`} />
        </div>

        <div className="grid md:grid-cols-2 gap-2 items-end">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none bg-muted/20 border border-border rounded-lg px-3 py-2">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="accent-primary" />
            <Pin className="w-3.5 h-3.5" /> Pin to top of the feed
          </label>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1"><Clock className="w-3 h-3" /> Schedule (optional)</label>
            <input type="datetime-local" value={schedule} onChange={e => setSchedule(e.target.value)} className={`${fieldCls} text-xs`} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => save("published")} disabled={busy} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 disabled:opacity-50 flex items-center gap-1.5">
            {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {busy ? "Saving…" : schedule ? "Schedule" : editingId ? "Update & Publish" : "Publish"}
          </button>
          <button onClick={() => save("draft")} disabled={busy} className="px-4 py-2 rounded-lg bg-muted/30 border border-border text-sm font-medium hover:border-primary/40 disabled:opacity-50 flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Save as draft
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold">Posts ({items.length})</h3></div>
        <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
          {items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No posts yet.</div>}
          {items.map(p => {
            const scheduled = p.status === "published" && p.publishAt && new Date(p.publishAt).getTime() > Date.now();
            return (
              <div key={p.id} className={`p-4 flex items-start gap-3 ${editingId === p.id ? "bg-primary/5" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                    <span className="text-sm font-semibold truncate">{p.title}</span>
                    {p.status === "draft" && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-400">Draft</span>}
                    {scheduled && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-500/15 text-[#d9b775] flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" /> Scheduled</span>}
                    {p.category && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-primary/15 text-primary">{p.category}</span>}
                    {p.minTier > 1 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-fuchsia-500/15 text-fuchsia-300">T{p.minTier}+</span>}
                  </div>
                  {p.excerpt && <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{p.excerpt}</div>}
                  <div className="text-[10px] text-muted-foreground/70 mt-1">
                    {scheduled ? `Publishes ${new Date(p.publishAt!).toLocaleString()}` : new Date(p.createdAt).toLocaleString()} · {p.author}
                    {p.tags.length > 0 && <> · {p.tags.map(t => `#${t}`).join(" ")}</>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => togglePin(p)} title={p.pinned ? "Unpin" : "Pin"} className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary">{p.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}</button>
                  <button onClick={() => toggleStatus(p)} title={p.status === "published" ? "Unpublish" : "Publish"} className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary">{p.status === "published" ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                  <button onClick={() => loadForEdit(p)} title="Edit" className="p-1.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(p.id)} title="Delete" className="p-1.5 rounded hover:bg-red-500/15 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setPin(await getEmergencyPin());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveP() {
    if (!/^\d{4}$/.test(pin)) { alert("PIN must be exactly 4 digits"); return; }
    const r = await saveEmergencyPin(pin);
    if (!r.ok) { alert(r.error ?? "Failed to save PIN"); return; }
    setSavedPin(true); setTimeout(() => setSavedPin(false), 1500);
  }

  if (loading) return <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Emergency Contact PIN</h3>
        <p className="text-xs text-muted-foreground">Users entering the Emergency Storm Contact tab must enter this 4-digit PIN. Share with Tier 4 customers only.</p>
        <div className="flex items-center gap-2">
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
            className="w-32 bg-muted/30 border border-border rounded-lg px-3 py-2 text-center tracking-[1em] font-mono outline-none focus:border-primary/40" />
          <button onClick={saveP} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30">
            {savedPin ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
      <AdminOwnerNotifyCard />

      <AdminMenuStyleCard />
      <EmergencyRecipientsCard />
      <LoyaltyRulesCard />
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs text-muted-foreground">Signup form questions moved to the <strong className="text-foreground">Signups</strong> tab.</p>
      </div>
    </div>
  );
}

function EmergencyRecipientsCard() {
  const [emails, setEmails] = useState("");
  const [sms, setSms] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getEmergencyRecipients().then(r => { setEmails(r.emails.join("\n")); setSms(r.sms_gateways.join("\n")); }).finally(() => setLoading(false));
  }, []);

  const lines = (s: string) => s.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
  async function save() {
    const r = await saveEmergencyRecipients({ emails: lines(emails), sms_gateways: lines(sms) });
    if (!r.ok) { alert(r.error ?? "Failed to save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }
  if (loading) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Emergency Relay Recipients</h3>
      <p className="text-xs text-muted-foreground">Where the Emergency Storm Contact form delivers. One per line. Live email/SMS sending requires the <code className="text-foreground">RESEND_API_KEY</code> Edge Function secret; until it's set, submissions are still stored in the inbox.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin emails</span>
          <textarea value={emails} onChange={e => setEmails(e.target.value)} rows={3} placeholder="admin@stormsync.media"
            className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 resize-none font-mono" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Carrier SMS gateways</span>
          <textarea value={sms} onChange={e => setSms(e.target.value)} rows={3} placeholder="5551234567@vtext.com"
            className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 resize-none font-mono" />
        </label>
      </div>
      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30">
        {saved ? "Saved ✓" : "Save recipients"}
      </button>
    </div>
  );
}

function LoyaltyRulesCard() {
  const [rules, setRules] = useState<LoyaltyRules | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { getLoyaltyRules().then(setRules); }, []);
  if (!rules) return null;
  const r = rules; // narrowed

  const gameNum = (k: "game_win_1st" | "game_win_2nd" | "game_win_3rd" | "game_win_4th") => (
    <input type="number" value={r[k]} onChange={e => setRules({ ...r, [k]: parseInt(e.target.value) || 0 })}
      className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
  );
  const setEarn = (i: number, patch: Partial<EarnRule>) =>
    setRules({ ...r, earn_rules: r.earn_rules.map((x, j) => j === i ? { ...x, ...patch } : x) });
  const setPrize = (i: number, patch: Partial<{ points: number; prize: string }>) =>
    setRules({ ...r, prizes: r.prizes.map((p, j) => j === i ? { ...p, ...patch } : p) });

  async function save() {
    // Give every earn rule a stable, unique key derived from its label if missing.
    const seen = new Set<string>();
    const earn_rules = r.earn_rules
      .filter(x => x.label.trim())
      .map(x => {
        let key = x.key?.trim() || slugifyEarnKey(x.label);
        while (seen.has(key)) key += "_2";
        seen.add(key);
        return { key, label: x.label.trim(), points: x.points };
      });
    const next = { ...r, earn_rules, prizes: [...r.prizes].filter(p => p.prize.trim()).sort((a, b) => a.points - b.points) };
    const res = await saveLoyaltyRules(next);
    if (!res.ok) { alert(res.error ?? "Failed to save"); return; }
    setRules(next); setSaved(true); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-5">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-yellow-400" /> Loyalty Program</h3>

      {/* Ways to earn — fully editable */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Ways to Earn Points</span>
          <button onClick={() => setRules({ ...r, earn_rules: [...r.earn_rules, { key: "", label: "", points: 0 }] })}
            className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add earn rule</button>
        </div>
        <div className="space-y-2">
          {r.earn_rules.map((er, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={er.label} onChange={e => setEarn(i, { label: e.target.value })} placeholder="What they did (e.g. Wrote a review)"
                className="flex-1 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
              <input type="number" value={er.points} onChange={e => setEarn(i, { points: parseInt(e.target.value) || 0 })} title="Points"
                className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
              <span className="text-xs text-muted-foreground">pts</span>
              <button onClick={() => setRules({ ...r, earn_rules: r.earn_rules.filter((_, j) => j !== i) })}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {r.earn_rules.length === 0 && <p className="text-xs text-muted-foreground">No earn rules yet — add one above.</p>}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">These appear in the member "How to earn" list and in the admin Award Points dropdown. Add anything you want to reward.</p>
      </div>

      {/* Forecast Game placement points (engine-awarded) */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Forecast Game Placement (auto-awarded monthly)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="flex items-center justify-between gap-2 text-sm">1st {gameNum("game_win_1st")}</label>
          <label className="flex items-center justify-between gap-2 text-sm">2nd {gameNum("game_win_2nd")}</label>
          <label className="flex items-center justify-between gap-2 text-sm">3rd {gameNum("game_win_3rd")}</label>
          <label className="flex items-center justify-between gap-2 text-sm">4th {gameNum("game_win_4th")}</label>
        </div>
      </div>

      {/* Prizes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Prizes</span>
          <button onClick={() => setRules({ ...r, prizes: [...r.prizes, { points: 0, prize: "" }] })}
            className="text-xs text-primary hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add prize</button>
        </div>
        <div className="space-y-2">
          {r.prizes.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="number" value={p.points} onChange={e => setPrize(i, { points: parseInt(e.target.value) || 0 })}
                className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
              <span className="text-xs text-muted-foreground">pts →</span>
              <input value={p.prize} onChange={e => setPrize(i, { prize: e.target.value })} placeholder="Prize description"
                className="flex-1 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
              <button onClick={() => setRules({ ...r, prizes: r.prizes.filter((_, j) => j !== i) })}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30">
        {saved ? "Saved ✓" : "Save loyalty rules"}
      </button>
    </div>
  );
}

function SignupsTab() {
  const [questions, setQuestions] = useState<SignupQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // New question editor state
  const [qLabel, setQLabel] = useState("");
  const [qType, setQType] = useState<QuestionType>("text");
  const [qRequired, setQRequired] = useState(false);
  const [qPlaceholder, setQPlaceholder] = useState("");
  const [qOptions, setQOptions] = useState("");

  // Edit state for existing question
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setQuestions(await getQuestions());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function commit(next: SignupQuestion[]) {
    setQuestions(next);
    const r = await saveQuestions(next);
    if (!r.ok) { alert(r.error ?? "Failed to save questions"); setQuestions(await getQuestions()); }
  }

  function move(id: string, dir: -1 | 1) {
    const i = questions.findIndex(q => q.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    void commit(next);
  }

  function addQ() {
    if (!qLabel.trim()) return;
    const q: SignupQuestion = {
      id: `q_${Date.now()}`,
      label: qLabel.trim(),
      required: qRequired,
      type: qType,
      placeholder: qPlaceholder.trim() || undefined,
      options: (qType === "select" || qType === "checkbox") ? qOptions.split(",").map(s => s.trim()).filter(Boolean) : undefined,
    };
    void commit([...questions, q]);
    setQLabel(""); setQPlaceholder(""); setQOptions(""); setQRequired(false); setQType("text");
  }
  function delQ(id: string) {
    if (!confirm("Delete this question?")) return;
    void commit(questions.filter(q => q.id !== id));
  }
  // Local-only edit; persisted when the admin clicks "Done" (avoids a write per keystroke).
  function updateQ(id: string, patch: Partial<SignupQuestion>) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
  }

  const isCore = (id: string) => ["name", "email", "pin"].includes(id);

  if (loading) return <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" /> Signup Form Builder</h3>
        <p className="text-xs text-muted-foreground">
          These questions render live on the public signup form, in this order. Core questions
          (name/email/PIN) are locked. Tier is <strong className="text-foreground">not</strong> asked at
          signup — every new account starts at Tier 1 and an admin assigns the real tier in the Users tab.
          Members' answers appear in their profile's custom answers.
        </p>

        <div className="space-y-1.5">
          {questions.map(q => {
            const core = isCore(q.id);
            const editing = editingId === q.id;
            return (
              <div key={q.id} className="bg-muted/20 rounded-lg p-2.5 space-y-2">
                {!editing ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm flex-1 min-w-[120px]">{q.label}</span>
                    <span className="text-[10px] text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/40">{q.type}</span>
                    {q.required && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">required</span>}
                    {core && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-300">core</span>}
                    {!core && (
                      <>
                        <button onClick={() => move(q.id, -1)} title="Move up" className="p-1 rounded hover:bg-primary/15 text-primary"><ArrowUp className="w-3 h-3" /></button>
                        <button onClick={() => move(q.id, 1)} title="Move down" className="p-1 rounded hover:bg-primary/15 text-primary"><ArrowDown className="w-3 h-3" /></button>
                        <button onClick={() => setEditingId(q.id)} className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25">Edit</button>
                        <button onClick={() => delQ(q.id)} className="p-1 rounded hover:bg-red-500/15 text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input value={q.label} onChange={e => updateQ(q.id, { label: e.target.value })} className="w-full bg-card border border-border rounded px-2 py-1 text-xs" />
                    <div className="flex gap-1.5 flex-wrap items-center">
                      <select value={q.type} onChange={e => updateQ(q.id, { type: e.target.value as QuestionType })} className="bg-card border border-border rounded px-2 py-1 text-xs">
                        <option value="text">Text</option><option value="email">Email</option><option value="number">Number</option>
                        <option value="tel">Phone</option><option value="date">Date</option><option value="textarea">Long text</option>
                        <option value="select">Dropdown</option><option value="checkbox">Checkbox group</option>
                      </select>
                      <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={q.required} onChange={e => updateQ(q.id, { required: e.target.checked })} /> Required</label>
                      <input value={q.placeholder ?? ""} onChange={e => updateQ(q.id, { placeholder: e.target.value })} placeholder="Placeholder" className="bg-card border border-border rounded px-2 py-1 text-xs flex-1 min-w-[120px]" />
                    </div>
                    {(q.type === "select" || q.type === "checkbox") && (
                      <input value={(q.options ?? []).join(", ")} onChange={e => updateQ(q.id, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} placeholder="Option A, Option B, Option C" className="w-full bg-card border border-border rounded px-2 py-1 text-xs" />
                    )}
                    <div className="flex justify-end">
                      <button onClick={() => { setEditingId(null); void commit(questions); }} className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25">Done</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Add new question</div>
          <input value={qLabel} onChange={e => setQLabel(e.target.value)} placeholder="Question label (e.g. 'Phone number')" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2 items-center">
            <select value={qType} onChange={e => setQType(e.target.value as QuestionType)} className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs">
              <option value="text">Text</option><option value="email">Email</option><option value="number">Number</option>
              <option value="tel">Phone</option><option value="date">Date</option><option value="textarea">Long text</option>
              <option value="select">Dropdown</option><option value="checkbox">Checkbox group</option>
            </select>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={qRequired} onChange={e => setQRequired(e.target.checked)} /> Required</label>
            <input value={qPlaceholder} onChange={e => setQPlaceholder(e.target.value)} placeholder="Placeholder (optional)" className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[150px]" />
          </div>
          {(qType === "select" || qType === "checkbox") && (
            <input value={qOptions} onChange={e => setQOptions(e.target.value)} placeholder="Comma-separated options (e.g. Beginner, Intermediate, Expert)" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-xs" />
          )}
          <button onClick={addQ} className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Question</button>
        </div>
      </div>
    </div>
  );
}

// ── FAQ & Module-Guide editor (P-16) ─────────────────────────────────────────
function FaqTab() {
  const [cats, setCats] = useState<FaqCategory[]>([]);
  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FaqEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newCat, setNewCat] = useState("");

  const refresh = useCallback(async () => {
    try { const [c, e] = await Promise.all([listCategories(), listFaq()]); setCats(c); setEntries(e); setErr(""); }
    catch { setErr("Failed to load."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function seed() { setBusy(true); const r = await seedFaqDefaults(DEFAULT_FAQ); setBusy(false); if (!r.ok) { setErr(r.error || "Seed failed"); return; } refresh(); }
  async function addCategory() { if (!newCat.trim()) return; await createCategory(newCat.trim(), cats.length); setNewCat(""); refresh(); }
  async function removeCategory(id: string) { if (!confirm("Delete this page and ALL its entries?")) return; await deleteCategory(id); refresh(); }
  async function moveCat(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= cats.length) return;
    await reorderCategories([{ id: cats[i].id, sortOrder: cats[j].sortOrder }, { id: cats[j].id, sortOrder: cats[i].sortOrder }]); refresh();
  }
  async function removeEntry(id: string) { await deleteFaq(id); refresh(); }
  async function moveEntry(list: FaqEntry[], i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= list.length) return;
    await reorderFaq([{ id: list[i].id, sortOrder: list[j].sortOrder }, { id: list[j].id, sortOrder: list[i].sortOrder }]); refresh();
  }
  async function save(e: FaqEntry) {
    setBusy(true); const r = e.id ? await updateFaq(e.id, e) : await createFaq(e); setBusy(false);
    if (!r.ok) { setErr(r.error || "Save failed"); return; } setEditing(null); refresh();
  }
  function addEntry(categoryId: string) {
    const n = entries.filter((x) => x.categoryId === categoryId).length;
    setEditing({ id: "", categoryId, sortOrder: n, title: "", sections: [{ heading: "", body: "" }] });
  }

  if (loading) return <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      {entries.length === 0 && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4 text-sm text-yellow-100/90 space-y-2">
          <p>No entries yet — the public Help page is showing the built-in defaults. Load them here to start editing (fills the pages below with the current content), or create your own pages &amp; entries.</p>
          <button onClick={seed} disabled={busy} className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold disabled:opacity-50">{busy ? "Loading…" : "Load defaults to edit"}</button>
        </div>
      )}
      {err && <div className="text-xs text-red-400">{err}</div>}

      {/* Add a page/category */}
      <div className="flex items-center gap-2">
        <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New page name (e.g. Billing, Getting Started)…"
          className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
        <button onClick={addCategory} className="px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> Add page</button>
      </div>

      {cats.map((c, ci) => {
        const list = entries.filter((e) => e.categoryId === c.id).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div key={c.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-black/20">
              <input defaultValue={c.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) updateCategory(c.id, { name: v }).then(refresh); }}
                className="flex-1 bg-transparent text-sm font-bold outline-none focus:bg-muted/30 rounded px-1.5 py-1" />
              <span className="text-[10px] text-muted-foreground">{list.length}</span>
              <button onClick={() => moveCat(ci, -1)} disabled={ci === 0} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => moveCat(ci, 1)} disabled={ci === cats.length - 1} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => addEntry(c.id)} className="px-2 py-1 rounded bg-primary/15 border border-primary/30 text-primary text-[11px] font-semibold flex items-center gap-1"><Plus className="w-3 h-3" /> Entry</button>
              <button onClick={() => removeCategory(c.id)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="divide-y divide-border/60">
              {list.length === 0 && <p className="text-xs text-muted-foreground p-3">No entries yet.</p>}
              {list.map((e, i) => (
                <div key={e.id} className="px-3 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.title || "(untitled)"}{e.moduleId && <span className="text-[10px] text-muted-foreground ml-1.5">{e.moduleId}{e.tier ? ` · T${e.tier}` : ""}</span>}</div>
                    <div className="text-xs text-muted-foreground truncate">{e.sections.map((s) => s.heading).filter(Boolean).join(" · ") || e.sections[0]?.body?.slice(0, 60)}</div>
                  </div>
                  <button onClick={() => moveEntry(list, i, -1)} disabled={i === 0} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => moveEntry(list, i, 1)} disabled={i === list.length - 1} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => setEditing(e)} className="p-1 text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeEntry(e.id)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {editing && <FaqEditor entry={editing} busy={busy} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function FaqEditor({ entry, busy, onCancel, onSave }: { entry: FaqEntry; busy: boolean; onCancel: () => void; onSave: (e: FaqEntry) => void }) {
  const [e, setE] = useState<FaqEntry>({ ...entry, sections: entry.sections.length ? entry.sections : [{ heading: "", body: "" }] });
  const inp = "w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40";
  const lbl = "text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block";

  const setSection = (i: number, patch: Partial<FaqSection>) => setE((p) => ({ ...p, sections: p.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const addSection = () => setE((p) => ({ ...p, sections: [...p.sections, { heading: "", body: "" }] }));
  const removeSection = (i: number) => setE((p) => ({ ...p, sections: p.sections.filter((_, j) => j !== i) }));
  const moveSection = (i: number, dir: -1 | 1) => setE((p) => { const j = i + dir; if (j < 0 || j >= p.sections.length) return p; const s = [...p.sections]; [s[i], s[j]] = [s[j], s[i]]; return { ...p, sections: s }; });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-lg max-h-[88vh] overflow-y-auto space-y-3" onClick={(ev) => ev.stopPropagation()}>
        <h3 className="text-sm font-bold">{e.id ? "Edit" : "New"} entry</h3>
        <label className="block"><span className={lbl}>Title / Question</span><input className={inp} value={e.title} onChange={(ev) => setE((p) => ({ ...p, title: ev.target.value }))} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className={lbl}>Link route (optional)</span><input className={inp} placeholder="/spc" value={e.moduleId ?? ""} onChange={(ev) => setE((p) => ({ ...p, moduleId: ev.target.value || undefined }))} /></label>
          <label className="block"><span className={lbl}>Tier (optional)</span>
            <select className={inp} value={e.tier ?? 0} onChange={(ev) => setE((p) => ({ ...p, tier: Number(ev.target.value) || undefined }))}>
              <option value={0}>—</option>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>Tier {t}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-2 pt-1">
          <span className={lbl}>Sections (add your own — "What it does", "Pro tip", anything)</span>
          {e.sections.map((s, i) => (
            <div key={i} className="border border-border rounded-lg p-2.5 space-y-1.5 bg-muted/10">
              <div className="flex items-center gap-1.5">
                <input className={`${inp} py-1.5`} placeholder="Section heading (leave blank for plain text)" value={s.heading} onChange={(ev) => setSection(i, { heading: ev.target.value })} />
                <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => moveSection(i, 1)} disabled={i === e.sections.length - 1} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => removeSection(i)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <textarea rows={3} className={`${inp} resize-y`} placeholder="Section text…" value={s.body} onChange={(ev) => setSection(i, { body: ev.target.value })} />
            </div>
          ))}
          <button onClick={addSection} className="w-full py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> Add section</button>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-muted/40 text-sm">Cancel</button>
          <button onClick={() => onSave({ ...e, sections: e.sections.filter((s) => s.heading.trim() || s.body.trim()) })} disabled={busy || !e.title.trim()} className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
