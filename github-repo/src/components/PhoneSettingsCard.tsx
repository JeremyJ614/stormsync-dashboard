import { useState } from "react";
import { Smartphone, Vibrate } from "lucide-react";
import { hapticsEnabled, setHaptics, haptic } from "../lib/haptics";
import { isStandalone } from "../lib/pwa";

/**
 * The handful of settings that only mean anything on a phone.
 *
 * Small on purpose. Haptics is the only one worth a switch today — the rest of
 * the mobile work (safe areas, pull-to-refresh, the offline strip) is either
 * right or wrong and does not want a preference.
 */
export function PhoneSettingsCard() {
  const [on, setOn] = useState(hapticsEnabled);
  const supported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-primary" /> On your phone
      </h2>

      <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${supported ? "cursor-pointer border-border" : "border-border/60 opacity-60"}`}>
        <Vibrate className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm">Haptics</span>
          <span className="block text-[11px] text-muted-foreground">
            {supported
              ? "A short buzz when a menu opens or a refresh lands."
              : "This browser has no vibration API — iOS Safari is one of them."}
          </span>
        </span>
        <input
          type="checkbox"
          disabled={!supported}
          checked={on}
          onChange={(e) => { setOn(e.target.checked); setHaptics(e.target.checked); }}
          className="accent-primary w-4 h-4 shrink-0"
        />
      </label>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => haptic("success")}
          disabled={!supported || !on}
          className="px-2.5 py-1 rounded-md border border-border bg-muted/30 hover:border-primary/40 disabled:opacity-40"
        >
          Try it
        </button>
        <span>
          Pull down on any page to refresh it.
          {isStandalone() ? " You're running the installed app." : ""}
        </span>
      </div>
    </div>
  );
}

export default PhoneSettingsCard;
