/**
 * Owner notifications, in the admin panel.
 *
 * Four switches and a test button. The test button is the important one: the
 * chain runs through a service worker, a push subscription and a third-party
 * push service, and the only honest way to know it works on a particular phone
 * is to make that phone buzz. It reports how many devices it reached, so "it
 * said it sent and nothing arrived" is distinguishable from "no device is
 * registered".
 */
import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Loader2, Send, RefreshCw } from "lucide-react";
import {
  OWNER_CATEGORIES, getOwnerNotifyPrefs, saveOwnerNotifyPrefs,
  recentOwnerEvents, sendOwnerTestPush, drainOwnerEvents,
  type OwnerNotifyPrefs, type OwnerEvent,
} from "../../lib/ownerNotify";
import { ROYAL } from "../../lib/royal";

const MARK: Record<string, string> = { signup: "👋", contact: "✉️", money: "💷", activity: "📍" };

export function AdminOwnerNotifyCard() {
  const [prefs, setPrefs] = useState<OwnerNotifyPrefs | null>(null);
  const [events, setEvents] = useState<OwnerEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(() => {
    void getOwnerNotifyPrefs().then(setPrefs);
    void recentOwnerEvents(12).then(setEvents).catch(() => setEvents([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function toggle(key: keyof OwnerNotifyPrefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setBusy(key); setNote(null);
    const r = await saveOwnerNotifyPrefs(next);
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not save that."); setPrefs(prefs); }
  }

  async function test() {
    setBusy("test"); setNote(null);
    const r = await sendOwnerTestPush();
    setBusy(null);
    setNote(r.ok
      ? r.devices === 0
        ? "No device is registered for push yet. Turn on storm alerts in your profile on the phone you want notified, then try again."
        : `Sent to ${r.sent} of ${r.devices} registered device${r.devices === 1 ? "" : "s"}.`
      : r.error ?? "The test failed.");
  }

  async function drain() {
    setBusy("drain"); setNote(null);
    const r = await drainOwnerEvents();
    setBusy(null);
    setNote(r.ok ? `Pushed ${r.events} queued event${r.events === 1 ? "" : "s"}.` : r.error ?? "Could not send.");
    reload();
  }

  const when = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <BellRing className="w-4 h-4" style={{ color: ROYAL.gold }} /> Notify me on my phone
      </h3>
      <p className="text-xs text-muted-foreground">
        Real push notifications to every device you have turned storm alerts on for. Events are queued the
        instant they happen and sent within two minutes — queued rather than sent inline, so a slow push
        service can never hold up somebody's signup.
      </p>

      {!prefs ? (
        <div className="py-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {OWNER_CATEGORIES.map((c) => {
            const on = prefs[c.key];
            return (
              <button key={c.key} onClick={() => toggle(c.key)} disabled={busy === c.key}
                className="text-left rounded-xl px-3 py-2.5 flex items-start gap-2.5 disabled:opacity-60"
                style={{
                  background: on ? "rgba(217,183,117,0.10)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${on ? ROYAL.goldSoft : ROYAL.hairline}`,
                }}>
                <span className="text-base leading-none mt-0.5">{MARK[c.key]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold" style={{ color: on ? ROYAL.gold : ROYAL.text }}>
                    {c.label}
                  </span>
                  <span className="block text-[11px] leading-snug" style={{ color: ROYAL.dim }}>{c.blurb}</span>
                </span>
                {on && <Check className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={test} disabled={busy === "test"}
          className="px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60">
          {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send a test push
        </button>
        <button onClick={drain} disabled={busy === "drain"}
          className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60">
          {busy === "drain" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Send queued now
        </button>
        {note && <span className="text-[11.5px]" style={{ color: ROYAL.dim }}>{note}</span>}
      </div>

      {events.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${ROYAL.hairline}` }}>
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.2em]"
               style={{ color: ROYAL.gold, borderBottom: `1px solid ${ROYAL.hairline}` }}>
            Recent
          </div>
          {events.map((e) => (
            <div key={e.id} className="px-3 py-1.5 flex items-center gap-2 text-[11.5px]"
                 style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
              <span>{MARK[e.category]}</span>
              <span className="truncate flex-1" style={{ color: ROYAL.text }}>{e.body}</span>
              {!e.dispatchedAt && (
                <span className="shrink-0 text-[10px]" style={{ color: ROYAL.gold }}>queued</span>
              )}
              <span className="shrink-0" style={{ color: ROYAL.dim }}>{when(e.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminOwnerNotifyCard;
