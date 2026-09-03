/**
 * Admin: the alert ladder.
 *
 * The old tab listed two flat opt-in lists and a live "is this location under a
 * warning right now" glow. The glow was the good part and it survives, because
 * it is the only thing on the screen that creates an obligation to act. The
 * rest is rebuilt around the five levels: who holds what, what each level costs
 * at each tier, and who is waiting on a decision.
 *
 * Three sub-panels rather than one long page, because they answer three
 * different questions and get used at three different moments.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BellRing, Users, Tag, Inbox, Loader2, Check, X, Search, Phone, Mail,
  ShieldCheck, Save, AlertTriangle, MapPin, Send, Smartphone, Radio,
} from "lucide-react";
import {
  ALERT_LEVELS, TIER_NAME, money,
  fetchAlertPrices, adminAlertRoster, adminSetAlertLevel, adminSaveAlertPrice,
  adminAlertRequests, adminHandleAlertRequest, sendManualAlert,
  type AlertPriceRow, type AlertRosterRow, type AdminRequest, type ManualResult,
} from "../../lib/alerts";
import { audit } from "../../lib/adminAudit";
import { ROYAL, HEADING, EASE, SPRING } from "../../lib/royal";

type Pane = "roster" | "send" | "pricing" | "requests";

const PANES: { id: Pane; label: string; icon: typeof Users }[] = [
  { id: "roster", label: "Who has what", icon: Users },
  { id: "send", label: "Send an alert", icon: Send },
  { id: "pricing", label: "Prices", icon: Tag },
  { id: "requests", label: "Requests", icon: Inbox },
];

export function AdminAlertsTab() {
  const [pane, setPane] = useState<Pane>("roster");
  const [roster, setRoster] = useState<AlertRosterRow[]>([]);
  const [prices, setPrices] = useState<AlertPriceRow[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = () =>
    Promise.all([adminAlertRoster(), fetchAlertPrices(), adminAlertRequests()])
      .then(([r, p, q]) => { setRoster(r); setPrices(p); setRequests(q); setErr(null); })
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setLoading(false));

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Loading alert ladder…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-xl px-3.5 py-2.5 text-sm flex items-center gap-2"
             style={{ background: "rgba(255,77,85,0.1)", border: "1px solid rgba(255,77,85,0.35)", color: "#ffb3b6" }}>
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      <div className="flex gap-1 rounded-2xl p-1.5 overflow-x-auto"
           style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${ROYAL.hairline}` }}>
        {PANES.map((p) => {
          const on = pane === p.id;
          const badge = p.id === "requests" ? requests.length : 0;
          return (
            <button key={p.id} onClick={() => setPane(p.id)}
              className="relative shrink-0 px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5"
              style={{ color: on ? "#0d0d18" : ROYAL.dim, fontFamily: HEADING }}>
              {on && (
                <motion.span layoutId="admin-alerts-pill" className="absolute inset-0 rounded-xl"
                             style={{ background: ROYAL.gold }} transition={SPRING.silk} />
              )}
              <span className="relative flex items-center gap-1.5">
                <p.icon className="w-3.5 h-3.5" /> {p.label}
                {badge > 0 && (
                  <span className="px-1.5 rounded-full text-[10px] font-black"
                        style={{ background: on ? "#0d0d18" : "#ff4d55", color: on ? ROYAL.gold : "#fff" }}>
                    {badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={pane}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.24, ease: EASE }}>
          {pane === "roster" && <RosterPane rows={roster} onChanged={reload} />}
          {pane === "send" && <SendPane rows={roster} />}
          {pane === "pricing" && <PricingPane prices={prices} onChanged={reload} />}
          {pane === "requests" && <RequestsPane rows={requests} onChanged={reload} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── send an alert ───────────────────────────────────────────────────────────
/**
 * The manual half of the ladder.
 *
 * Level 5 is a promise that a person is watching and will make contact, and no
 * amount of cron satisfies that. This is where a person keeps it: pick members
 * (or everyone at a level), write the thing, choose the channels, send.
 *
 * Two guard rails, both deliberate. The result reports what actually went out
 * per channel rather than claiming success, because a text that the carrier
 * silently dropped is not a text that arrived. And the server re-checks
 * entitlements, so nothing here can text somebody who never bought a level that
 * includes text — a ladder you can route around is not a ladder.
 */
function SendPane({ rows }: { rows: AlertRosterRow[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [minLevel, setMinLevel] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("/");
  const [severity, setSeverity] = useState<"moderate" | "severe" | "extreme">("moderate");
  const [ch, setCh] = useState({ inapp: true, push: true, email: true, text: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ManualResult | null>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows.slice(0, 12);
    return rows.filter((r) =>
      r.name?.toLowerCase().includes(needle) || r.email?.toLowerCase().includes(needle)).slice(0, 12);
  }, [rows, q]);

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Naming members and naming a level are two different sends, so choosing one
  // clears the other rather than quietly doing both.
  const audience = picked.size > 0
    ? `${picked.size} member${picked.size === 1 ? "" : "s"}`
    : minLevel
      ? `everyone at ${ALERT_LEVELS.find((l) => l.level === minLevel)?.name ?? `level ${minLevel}`} or above`
      : null;

  const canSend = Boolean(title.trim() && body.trim() && audience && !busy);

  async function send() {
    setBusy(true); setResult(null);
    const r = await sendManualAlert({
      ...(picked.size > 0 ? { userIds: [...picked] } : { minLevel: minLevel ?? undefined }),
      title: title.trim(), body: body.trim(), link, severity, channels: ch,
    });
    setResult(r);
    setBusy(false);
    if (r.ok) {
      void audit(
        "alert.manual_send",
        { type: "alert", label: title.trim() },
        { recipients: r.recipients, inapp: r.inapp, push: r.push, emails: r.emails, texts: r.texts },
      );
      setTitle(""); setBody("");
    }
  }

  const CHANNELS: { key: keyof typeof ch; label: string; icon: typeof Mail; need: string }[] = [
    { key: "inapp", label: "In-app", icon: BellRing, need: "everyone" },
    { key: "push", label: "Push", icon: Radio, need: "level 2+" },
    { key: "email", label: "Email", icon: Mail, need: "level 3+, opted in" },
    { key: "text", label: "Text", icon: Smartphone, need: "level 3+, opted in" },
  ];

  return (
    <div className="space-y-4">
      {/* ── who ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-3.5" style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2.5" style={{ color: ROYAL.gold }}>
          Who it goes to
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ALERT_LEVELS.map((l) => {
            const on = minLevel === l.level;
            return (
              <button key={l.level}
                onClick={() => { setMinLevel(on ? null : l.level); setPicked(new Set()); }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                style={on
                  ? { background: `${l.color}26`, border: `1px solid ${l.color}`, color: l.color }
                  : { background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
                {l.name}+
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-2"
             style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="…or find specific members"
                 className="flex-1 bg-transparent outline-none text-sm" style={{ color: ROYAL.text }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {matches.map((r) => {
            const on = picked.has(r.user_id);
            return (
              <button key={r.user_id}
                onClick={() => { toggle(r.user_id); setMinLevel(null); }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                style={on
                  ? { background: `${ROYAL.gold}22`, border: `1px solid ${ROYAL.gold}77`, color: ROYAL.gold }
                  : { background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
                {on && <Check className="w-3 h-3" />}{r.name || r.email}
                <span className="opacity-55">L{Math.max(0, ...r.levels)}</span>
              </button>
            );
          })}
          {matches.length === 0 && (
            <span className="text-[12px]" style={{ color: ROYAL.dim }}>Nobody matches that.</span>
          )}
        </div>
      </div>

      {/* ── what ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-3.5 space-y-2.5" style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-[11px] uppercase tracking-[0.24em] font-bold" style={{ color: ROYAL.gold }}>
          What it says
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={90}
               placeholder="Rotation on the storm heading for Findlay"
               className="w-full rounded-xl px-3 py-2 text-sm"
               style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={400}
                  placeholder="I am watching this one for you. If it holds together it is at your place in about 25 minutes — get to your safe spot now and I will keep an eye on it."
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }} />
        <div className="flex flex-wrap gap-2">
          <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}
                  className="rounded-lg px-2.5 py-1.5 text-xs"
                  style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
            <option value="extreme">Extreme</option>
          </select>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/warnings"
                 className="rounded-lg px-2.5 py-1.5 text-xs flex-1 min-w-[120px]"
                 style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }} />
        </div>
        <p className="text-[11px]" style={{ color: ROYAL.dim }}>
          A text is cut to 300 characters by the gateway, so put the thing they have to do first.
        </p>
      </div>

      {/* ── how ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-3.5" style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2.5" style={{ color: ROYAL.gold }}>
          How it reaches them
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map(({ key, label, icon: Icon, need }) => {
            const on = ch[key];
            return (
              <button key={key} onClick={() => setCh({ ...ch, [key]: !on })}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                style={on
                  ? { background: `${ROYAL.gold}22`, border: `1px solid ${ROYAL.gold}77`, color: ROYAL.gold }
                  : { background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
                <Icon className="w-3.5 h-3.5" /> {label}
                <span className="opacity-55 font-normal">{need}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] mt-2" style={{ color: ROYAL.dim }}>
          Members who do not hold the level for a channel are skipped on that channel and still get the ones
          they do hold. Nobody is dropped from the send entirely.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button onClick={() => void send()} disabled={!canSend}
                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-45"
                style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send {audience ? `to ${audience}` : ""}
        </button>
        {!audience && (
          <span className="text-[12px]" style={{ color: ROYAL.dim }}>Pick a level or some members first.</span>
        )}
      </div>

      {result && (
        <div className="rounded-xl px-3.5 py-3 text-sm"
             style={{
               background: result.ok ? "rgba(95,217,168,0.10)" : "rgba(255,77,85,0.10)",
               border: `1px solid ${result.ok ? "rgba(95,217,168,0.4)" : "rgba(255,77,85,0.4)"}`,
               color: ROYAL.text,
             }}>
          {result.ok ? (
            <>
              Sent to {result.recipients} member{result.recipients === 1 ? "" : "s"} —{" "}
              {result.inapp} in-app, {result.push} push, {result.emails} email, {result.texts} text.
              {result.texts === 0 && ch.text && (
                <span style={{ color: ROYAL.dim }}>
                  {" "}No texts went out: nobody in this send holds level 3 with a number, a carrier and the
                  text opt-in all set.
                </span>
              )}
            </>
          ) : result.error}
        </div>
      )}
    </div>
  );
}

// ─── who has what ────────────────────────────────────────────────────────────
function RosterPane({ rows, onChanged }: { rows: AlertRosterRow[]; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [onlyLevel, setOnlyLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [risk, setRisk] = useState<Record<string, string>>({});

  /**
   * Level 5 promises that a person makes contact. The panel therefore has to
   * show, right now, which of those members are somewhere with an active
   * warning. It is the one thing on this screen that is a job rather than a
   * record, so it is checked live against their primary saved location and
   * shown first.
   */
  const directLine = useMemo(() => rows.filter((r) => r.levels.includes(5)), [rows]);

  useEffect(() => {
    let cancelled = false;
    const withPoint = directLine.filter((r) => r.lat != null && r.lon != null);
    if (withPoint.length === 0) { setRisk({}); return; }
    (async () => {
      const out: Record<string, string> = {};
      await Promise.all(withPoint.map(async (r) => {
        try {
          const res = await fetch(
            `https://api.weather.gov/alerts/active?status=actual&point=${r.lat!.toFixed(4)},${r.lon!.toFixed(4)}`,
            { headers: { Accept: "application/geo+json" } },
          );
          if (!res.ok) return;
          const d = await res.json() as { features?: { properties?: { event?: string } }[] };
          const ev = (d.features ?? [])
            .map((f) => String(f.properties?.event ?? ""))
            .find((e) => /warning$/i.test(e)) ??
            (d.features ?? []).map((f) => String(f.properties?.event ?? "")).find((e) => /watch$/i.test(e));
          if (ev) out[r.user_id] = ev;
        } catch { /* one member failing must not blank the whole panel */ }
      }));
      if (!cancelled) setRisk(out);
    })();
    return () => { cancelled = true; };
  }, [directLine]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyLevel && !r.levels.includes(onlyLevel)) return false;
      if (!needle) return true;
      return `${r.name} ${r.email}`.toLowerCase().includes(needle);
    });
  }, [rows, q, onlyLevel]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) for (const l of r.levels) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  }, [rows]);

  async function toggle(row: AlertRosterRow, level: number, on: boolean) {
    setBusy(`${row.user_id}:${level}`);
    const res = await adminSetAlertLevel(row.user_id, level, on);
    if (res.ok) {
      void audit(on ? "alert.grant" : "alert.revoke",
        { type: "user", id: row.user_id, label: row.name || row.email }, { level });
      onChanged();
    }
    setBusy(null);
  }

  /**
   * Move somebody to a level in one action.
   *
   * The five squares could always do this, one tap at a time, but nobody read
   * them as an up/downgrade control — they read as five unlabelled buttons, and
   * "put this member on Contact Alerts" meant working out which of the five to
   * press and in which direction. This says what it does: everything up to the
   * target is granted, everything above it is revoked, and levels their tier
   * already includes are left alone because those are not ours to take.
   */
  async function setTo(row: AlertRosterRow, target: number) {
    setBusy(`${row.user_id}:set`);
    const changes: { level: number; on: boolean }[] = [];
    for (const l of ALERT_LEVELS) {
      const has = row.levels.includes(l.level);
      const byTier = has && !row.purchased.includes(l.level);
      if (byTier) continue;                       // included with their plan
      const want = l.level <= target;
      if (want !== has) changes.push({ level: l.level, on: want });
    }
    for (const c of changes) {
      const res = await adminSetAlertLevel(row.user_id, c.level, c.on);
      if (!res.ok) break;
      void audit(c.on ? "alert.grant" : "alert.revoke",
        { type: "user", id: row.user_id, label: row.name || row.email }, { level: c.level, via: "set-level" });
    }
    if (changes.length) onChanged();
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      {/* The five counts, so the shape of the base is visible at a glance. */}
      <div className="grid grid-cols-5 gap-px rounded-2xl overflow-hidden"
           style={{ background: ROYAL.hairline }}>
        {ALERT_LEVELS.map((l) => (
          <button key={l.level} onClick={() => setOnlyLevel(onlyLevel === l.level ? null : l.level)}
            className="px-2 py-3 text-center transition-colors"
            style={{ background: onlyLevel === l.level ? `${l.color}1f` : ROYAL.ink2 }}>
            <div className="text-[9px] uppercase tracking-wider truncate" style={{ color: l.color }}>{l.name}</div>
            <div className="text-xl font-black tabular-nums" style={{ color: ROYAL.text }}>{counts.get(l.level) ?? 0}</div>
          </button>
        ))}
      </div>
      {onlyLevel && (
        <p className="text-[11px] px-1" style={{ color: ROYAL.dim }}>
          Filtered to level {onlyLevel}. Tap it again to clear.
        </p>
      )}

      {directLine.length > 0 && (
        <div className="rounded-2xl p-3.5"
             style={{ background: "rgba(255,77,85,0.08)", border: "1px solid rgba(255,77,85,0.32)" }}>
          <div className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2 flex items-center gap-1.5 flex-wrap"
               style={{ color: "#ff6b70" }}>
            <ShieldCheck className="w-3.5 h-3.5" /> Direct Line — {directLine.length} member{directLine.length === 1 ? "" : "s"} we contact personally
            {Object.keys(risk).length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-normal animate-pulse"
                    style={{ background: "#ff4d55", color: "#fff" }}>
                {Object.keys(risk).length} under an active alert right now
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {directLine.map((r) => (
              <div key={r.user_id} className="flex items-start gap-2 text-[12px] flex-wrap">
                <span className="font-semibold" style={{ color: ROYAL.text }}>{r.name || r.email}</span>
                {risk[r.user_id] && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black"
                        style={{ background: "#ff4d55", color: "#fff" }}>
                    {risk[r.user_id]}
                  </span>
                )}
                {r.alert_phone && (
                  <a href={`tel:${r.alert_phone}`} className="inline-flex items-center gap-1" style={{ color: "#ff8a3d" }}>
                    <Phone className="w-3 h-3" />{r.alert_phone}
                  </a>
                )}
                {r.alert_email && (
                  <a href={`mailto:${r.alert_email}`} className="inline-flex items-center gap-1" style={{ color: "#ff8a3d" }}>
                    <Mail className="w-3 h-3" />{r.alert_email}
                  </a>
                )}
                <span className="inline-flex items-center gap-1" style={{ color: ROYAL.dim }}>
                  <MapPin className="w-3 h-3" />{r.place ?? `${r.locations} saved`}
                </span>
                {r.direct_note && (
                  <span className="w-full text-[11px] pl-1" style={{ color: ROYAL.dim }}>
                    “{r.direct_note}”
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: ROYAL.dim }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email"
          className="w-full rounded-xl pl-9 pr-3 py-2 text-sm"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${ROYAL.hairline}` }}>
        {shown.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: ROYAL.dim }}>Nobody matches that.</div>
        ) : shown.map((r, i) => (
          <div key={r.user_id} className="px-3.5 py-3 flex items-center gap-3 flex-wrap"
               style={{ background: ROYAL.ink2, borderTop: i ? `1px solid ${ROYAL.hairline}` : undefined }}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate" style={{ color: ROYAL.text }}>
                {r.name || "(no name)"}
              </div>
              <div className="text-[11px] truncate" style={{ color: ROYAL.dim }}>
                {r.email} · {TIER_NAME[r.tier]} · scope {r.scope}
              </div>
            </div>
            {/* Up/downgrade in one control, next to the per-level squares that
                do the same thing a rung at a time. */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[9px] uppercase tracking-[0.16em] mr-0.5" style={{ color: ROYAL.dim }}>Set</span>
              {(() => {
                const cur = r.levels.length ? Math.max(...r.levels) : 0;
                const key = `${r.user_id}:set`;
                return (
                  <>
                    <button
                      onClick={() => void setTo(r, Math.max(0, cur - 1))}
                      disabled={cur === 0 || busy === key}
                      title="Down one level"
                      className="w-7 h-8 rounded-lg grid place-items-center text-sm font-black disabled:opacity-30"
                      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}
                    >−</button>
                    <span className="w-10 text-center text-[11px] font-black tabular-nums"
                          style={{ color: cur ? (ALERT_LEVELS.find((l) => l.level === cur)?.color ?? ROYAL.text) : ROYAL.dim }}>
                      {busy === key ? "…" : cur === 0 ? "—" : `L${cur}`}
                    </span>
                    <button
                      onClick={() => void setTo(r, Math.min(5, cur + 1))}
                      disabled={cur === 5 || busy === key}
                      title="Up one level"
                      className="w-7 h-8 rounded-lg grid place-items-center text-sm font-black disabled:opacity-30"
                      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}
                    >+</button>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-1 shrink-0">
              {ALERT_LEVELS.map((l) => {
                const has = r.levels.includes(l.level);
                const byTier = has && !r.purchased.includes(l.level);
                const key = `${r.user_id}:${l.level}`;
                return (
                  <button key={l.level}
                    disabled={byTier || busy === key}
                    onClick={() => toggle(r, l.level, !has)}
                    title={byTier
                      ? `Included with ${TIER_NAME[r.tier]} — change their tier to change this`
                      : has ? "Revoke this level" : "Grant this level"}
                    className="w-8 h-8 rounded-lg text-xs font-black grid place-items-center disabled:cursor-default"
                    style={{
                      background: has ? `${l.color}26` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${has ? l.color + (byTier ? "44" : "99") : ROYAL.hairline}`,
                      color: has ? l.color : ROYAL.dim,
                      opacity: busy === key ? 0.4 : 1,
                    }}>
                    {l.level}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] px-1" style={{ color: ROYAL.dim }}>
        <strong style={{ color: ROYAL.text }}>Set</strong> moves somebody up or down the ladder in one go: everything
        up to the new level is granted and everything above it is taken away. The five squares do the same thing one
        rung at a time. A dim outline means the level comes with their tier and cannot be revoked here — change the
        tier instead. A bright outline means it was bought or granted, and tapping it takes it away. Revoking a level
        somebody is <em>paying</em> for stops their access but not their Stripe subscription — cancel that from their
        billing portal, or have them drop it from their own alert settings, which does both.
      </p>
    </div>
  );
}

// ─── prices ──────────────────────────────────────────────────────────────────
function PricingPane({ prices, onChanged }: { prices: AlertPriceRow[]; onChanged: () => void }) {
  const [draft, setDraft] = useState<Record<number, Partial<AlertPriceRow>>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const val = (row: AlertPriceRow, k: "free_price" | "basic_price" | "vip_price") => {
    const d = draft[row.level]?.[k];
    return d === undefined ? row[k] : (d as number | null);
  };
  const edit = (level: number, k: string, v: string) =>
    setDraft((p) => ({ ...p, [level]: { ...p[level], [k]: v.trim() === "" ? null : Number(v) } }));

  async function save(row: AlertPriceRow) {
    const patch = draft[row.level];
    if (!patch) return;
    setBusy(row.level);
    const res = await adminSaveAlertPrice(row.level, patch);
    setBusy(null);
    if (res.ok) {
      void audit("alert.price", { type: "alert_level", id: String(row.level), label: row.label }, patch);
      setDraft((p) => { const n = { ...p }; delete n[row.level]; return n; });
      setSaved(row.level); setTimeout(() => setSaved(null), 1800);
      onChanged();
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] px-1 leading-relaxed" style={{ color: ROYAL.dim }}>
        What a member of each tier pays to add a level they do not already have. Leave a box empty when the level
        is already included at that tier — an empty box means "not for sale to them", which is different from free.
        Advanced has no column because it includes everything and can never be charged an add-on price.
      </p>

      {prices.map((row) => {
        const def = ALERT_LEVELS.find((l) => l.level === row.level)!;
        const dirty = !!draft[row.level];
        return (
          <div key={row.level} className="rounded-2xl overflow-hidden"
               style={{ background: ROYAL.ink2, border: `1px solid ${def.color}2e` }}>
            <div className="px-4 py-2.5 flex items-center gap-2.5"
                 style={{ background: `${def.color}0f`, borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <span className="w-7 h-7 rounded-lg grid place-items-center text-xs font-black"
                    style={{ background: `${def.color}26`, color: def.color }}>{row.level}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>{def.name}</div>
                <div className="text-[11px]" style={{ color: ROYAL.dim }}>
                  Free with {TIER_NAME[def.includedFrom]} and above
                </div>
              </div>
              {saved === row.level && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: "#5fd9a8" }}>
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              )}
            </div>

            <div className="p-3 grid grid-cols-3 gap-2">
              {(["free", "basic", "vip"] as const).map((tk, idx) => {
                const tierNo = idx + 1;
                const included = tierNo >= def.includedFrom;
                const key = `${tk}_price` as "free_price" | "basic_price" | "vip_price";
                const v = val(row, key);
                return (
                  <div key={tk}>
                    <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: ROYAL.dim }}>
                      {TIER_NAME[tierNo]}
                    </label>
                    {included ? (
                      <div className="rounded-lg px-2.5 py-2 text-[12px] text-center"
                           style={{ background: `${def.color}12`, border: `1px solid ${def.color}33`, color: def.color }}>
                        Included
                      </div>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: ROYAL.dim }}>$</span>
                        <input
                          type="number" min={0} step="0.01" inputMode="decimal"
                          value={v == null ? "" : String(v)}
                          onChange={(e) => edit(row.level, key, e.target.value)}
                          placeholder="—"
                          className="w-full rounded-lg pl-6 pr-2 py-2 text-sm tabular-nums"
                          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {dirty && (
              <div className="px-3 pb-3 flex gap-2">
                <button onClick={() => save(row)} disabled={busy === row.level}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: def.color, color: "#0d0d18" }}>
                  {busy === row.level ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save {def.name}
                </button>
                <button onClick={() => setDraft((p) => { const n = { ...p }; delete n[row.level]; return n; })}
                  className="px-3 py-1.5 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.05)", color: ROYAL.dim }}>
                  Discard
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── requests ────────────────────────────────────────────────────────────────
function RequestsPane({ rows, onChanged }: { rows: AdminRequest[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function handle(r: AdminRequest, approve: boolean) {
    setBusy(r.id);
    const res = await adminHandleAlertRequest(r.id, approve);
    if (res.ok) {
      void audit(approve ? "alert.request.approve" : "alert.request.decline",
        { type: "user", id: r.user_id, label: r.name || r.email }, { level: r.level, price: r.quoted_price });
      onChanged();
    }
    setBusy(null);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: ROYAL.dim }} />
        <p className="text-sm font-bold" style={{ color: ROYAL.text, fontFamily: HEADING }}>Nothing waiting</p>
        <p className="text-[12px] mt-1 max-w-sm mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>
          When a member asks for a level that costs money it lands here. Approving it grants the level and records
          the price they were quoted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] px-1 leading-relaxed" style={{ color: ROYAL.dim }}>
        Approving grants the level immediately and records it as purchased at the quoted price. Billing is not
        automatic yet, so add it to their next invoice yourself.
      </p>
      {rows.map((r) => {
        const def = ALERT_LEVELS.find((l) => l.level === r.level)!;
        return (
          <div key={r.id} className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"
               style={{ background: ROYAL.ink2, border: `1px solid ${def.color}33` }}>
            <span className="w-9 h-9 rounded-xl grid place-items-center text-sm font-black shrink-0"
                  style={{ background: `${def.color}26`, color: def.color }}>{r.level}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" style={{ color: ROYAL.text }}>
                {r.name || r.email} wants {def.name}
              </div>
              <div className="text-[11px]" style={{ color: ROYAL.dim }}>
                {TIER_NAME[r.tier]} tier · quoted {r.quoted_price != null ? `${money(r.quoted_price)}/mo` : "no price on file"}
                {" · "}{new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => handle(r, true)} disabled={busy === r.id}
                className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: def.color, color: "#0d0d18" }}>
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => handle(r, false)} disabled={busy === r.id}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.05)", color: ROYAL.dim }}>
                <X className="w-3.5 h-3.5" /> Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AdminAlertsTab;
