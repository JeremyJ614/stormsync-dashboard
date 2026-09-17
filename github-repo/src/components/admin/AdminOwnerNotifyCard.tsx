/**
 * Owner notifications, in the admin panel.
 *
 * Four switches, the devices they go to, and a test.
 *
 * The device list is here because of a real failure: the test reported
 * `sent: 1` and no phone ever buzzed. Both halves were true. A push service
 * returns 201 for any subscription it still recognises — including one
 * belonging to a browser profile wiped months ago — so the server genuinely
 * could not tell delivery from acceptance, and the card repeated what the
 * server said.
 *
 * So the device answers for itself now. The service worker acknowledges a test
 * push, and this waits a few seconds for that acknowledgement before saying
 * anything. Accepted-but-never-acknowledged is a dead registration and reads as
 * one, with "Register this device" one tap away.
 */
import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Loader2, Send, RefreshCw, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import {
  OWNER_CATEGORIES, getOwnerNotifyPrefs, saveOwnerNotifyPrefs,
  recentOwnerEvents, sendOwnerTestPush, drainOwnerEvents,
  type OwnerNotifyPrefs, type OwnerEvent,
} from "../../lib/ownerNotify";
import {
  listMyPushDevices, forgetPushDevice, describeDevice, subscribePush,
  isPushSupported, thisDeviceRegistered, type PushDevice,
} from "../../lib/push";
import { useAuth } from "../../hooks/useAuth";
import { ROYAL } from "../../lib/royal";

const MARK: Record<string, string> = { signup: "👋", contact: "✉️", money: "💷", activity: "📍" };

export function AdminOwnerNotifyCard() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<OwnerNotifyPrefs | null>(null);
  const [events, setEvents] = useState<OwnerEvent[]>([]);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [hereRegistered, setHereRegistered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reloadDevices = useCallback(async () => {
    setDevices(await listMyPushDevices());
    setHereRegistered(await thisDeviceRegistered());
  }, []);

  const reload = useCallback(() => {
    void getOwnerNotifyPrefs().then(setPrefs);
    void recentOwnerEvents(12).then(setEvents).catch(() => setEvents([]));
    void reloadDevices();
  }, [reloadDevices]);
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
    const before = Date.now();
    const r = await sendOwnerTestPush();
    if (!r.ok) { setBusy(null); setNote(r.error ?? "The test failed."); return; }
    if ((r.devices ?? 0) === 0) {
      setBusy(null);
      setNote("No device is registered yet. Use “Register this device” below on the phone you want notified.");
      return;
    }

    // Wait for the phones to answer. Accepting a push takes milliseconds;
    // delivering one takes a moment longer, and a dead registration never
    // answers at all — which is the case worth naming.
    setNote(`Accepted by ${r.sent} of ${r.devices} device${r.devices === 1 ? "" : "s"} — waiting for them to confirm…`);
    let acked = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise((res) => setTimeout(res, 1200));
      const list = await listMyPushDevices();
      setDevices(list);
      acked = list.filter((d) => d.lastAckAt && new Date(d.lastAckAt).getTime() >= before).length;
      if (acked >= (r.sent ?? 0)) break;
    }
    setBusy(null);
    setNote(
      acked > 0
        ? `Delivered to ${acked} device${acked === 1 ? "" : "s"}.`
        : `Accepted by the push service, but no device confirmed it. Those registrations are stale — the browsers they were made in are gone. Register this device below and try again.`,
    );
  }

  async function registerHere() {
    if (!user) return;
    setBusy("register"); setNote(null);
    const r = await subscribePush(user.id);
    await reloadDevices();
    setBusy(null);
    setNote(r.ok ? "This device is registered. Send a test push to prove it." : r.error ?? "Could not register this device.");
  }

  async function forget(id: string) {
    setBusy(`forget:${id}`);
    await forgetPushDevice(id);
    await reloadDevices();
    setBusy(null);
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

      {/* ── devices ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${ROYAL.hairline}` }}>
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] flex items-center gap-1.5"
             style={{ color: ROYAL.gold, borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <Smartphone className="w-3 h-3" /> Your devices
        </div>

        {devices === null ? (
          <div className="px-3 py-3 text-[11.5px]" style={{ color: ROYAL.dim }}>Checking…</div>
        ) : devices.length === 0 ? (
          <div className="px-3 py-3 text-[11.5px]" style={{ color: ROYAL.dim }}>
            Nothing is registered, so nothing can arrive.
          </div>
        ) : devices.map((d) => {
          const proven = !!d.lastAckAt;
          const stale = !!d.lastPushAt && !proven;
          return (
            <div key={d.id} className="px-3 py-2 flex items-center gap-2 text-[11.5px]"
                 style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ color: ROYAL.text }}>
                  {describeDevice(d)}
                  {d.isThisDevice && <span style={{ color: ROYAL.gold }}> · this device</span>}
                </span>
                <span className="block" style={{ color: stale ? "#e2a06a" : ROYAL.dim }}>
                  {stale
                    ? <><TriangleAlert className="w-3 h-3 inline -mt-0.5" /> pushed to, never confirmed — probably gone</>
                    : proven
                      ? `confirmed ${when(d.lastAckAt!)}`
                      : `registered ${when(d.createdAt)} · not yet tested`}
                </span>
              </span>
              <button onClick={() => forget(d.id)} disabled={busy === `forget:${d.id}`}
                title="Forget this device"
                className="shrink-0 w-7 h-7 grid place-items-center rounded-md disabled:opacity-50"
                style={{ border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {isPushSupported() && hereRegistered === false && (
          <div className="px-3 py-2" style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
            <button onClick={registerHere} disabled={busy === "register"}
              className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 disabled:opacity-60"
              style={{ background: "rgba(217,183,117,0.12)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
              {busy === "register" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
              Register this device
            </button>
          </div>
        )}
      </div>

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
