import { useSyncExternalStore, useState } from "react";
import { canInstall, subscribeInstall, promptInstall, isStandalone } from "../lib/pwa";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "stormsync_install_dismissed";

export function InstallPrompt() {
  const installable = useSyncExternalStore(subscribeInstall, canInstall, () => false);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  if (!installable || dismissed || isStandalone()) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="glass-strong glow-primary rounded-xl p-3 flex items-center gap-3 shadow-xl">
        <img src="/img/logo.webp" alt="" width={36} height={36} className="w-9 h-9 rounded-lg object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Install StormSync</div>
          <div className="text-[11px] text-muted-foreground">Add to your home screen for instant, offline-ready access.</div>
        </div>
        <button
          onClick={async () => { const ok = await promptInstall(); if (!ok) { setDismissed(true); sessionStorage.setItem(DISMISS_KEY, "1"); } }}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shrink-0"
        >
          <Download className="w-3.5 h-3.5" /> Install
        </button>
        <button onClick={() => { setDismissed(true); sessionStorage.setItem(DISMISS_KEY, "1"); }} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
