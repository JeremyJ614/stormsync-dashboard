import { useEffect, useState } from "react";
import { isPushSupported, isSubscribed, subscribePush, unsubscribePush } from "../lib/push";
import { Bell, BellOff, Loader2 } from "lucide-react";

export function StormAlertsCard({ userId }: { userId: string }) {
  const supported = isPushSupported();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { isSubscribed().then(setOn); }, []);

  async function toggle() {
    setBusy(true); setErr("");
    if (on) {
      await unsubscribePush();
      setOn(false);
    } else {
      const r = await subscribePush(userId);
      if (!r.ok) setErr(r.error ?? "Could not enable alerts.");
      else setOn(true);
    }
    setBusy(false);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        {on ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />} Storm Alerts
      </h2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Get a push notification on this device the moment an NWS <strong className="text-foreground">warning</strong> is issued
        for one of your saved locations — even when the app is closed.
      </p>
      {!supported ? (
        <div className="text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg px-3 py-2">
          Push notifications aren't supported in this browser. On iPhone, first <strong className="text-foreground">Add to Home Screen</strong>, then open the app from there.
        </div>
      ) : (
        <button onClick={toggle} disabled={busy}
          className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 ${on ? "bg-muted/40 border border-border text-foreground hover:bg-muted/60" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : on ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          {on ? "Turn off alerts" : "Enable storm alerts"}
        </button>
      )}
      {err && <div className="text-xs text-red-400">{err}</div>}
      {on && <div className="text-[11px] text-green-400">✓ Alerts are on for this device. Make sure you've saved at least one location (bookmark menu, top bar).</div>}
    </div>
  );
}
