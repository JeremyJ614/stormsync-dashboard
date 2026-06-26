import { useEffect, useState } from "react";
import { Download, Check, Share, SquarePlus, MoreVertical, Smartphone } from "lucide-react";
import { canInstall, promptInstall, isStandalone, subscribeInstall } from "../lib/pwa";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = () => /android/i.test(navigator.userAgent);

function Instructions() {
  return (
    <div className="mt-3 space-y-3 text-xs text-muted-foreground">
      {isIos() ? (
        <div className="flex items-start gap-2"><Share className="w-4 h-4 mt-0.5 text-primary shrink-0" /><span>On iPhone/iPad: tap the <strong className="text-foreground">Share</strong> icon in Safari, then choose <strong className="text-foreground">“Add to Home Screen”</strong>.</span></div>
      ) : isAndroid() ? (
        <div className="flex items-start gap-2"><MoreVertical className="w-4 h-4 mt-0.5 text-primary shrink-0" /><span>On Android: tap the <strong className="text-foreground">⋮ menu</strong> in Chrome, then <strong className="text-foreground">“Install app”</strong> / “Add to Home screen”.</span></div>
      ) : (
        <>
          <div className="flex items-start gap-2"><SquarePlus className="w-4 h-4 mt-0.5 text-primary shrink-0" /><span>On desktop: click the <strong className="text-foreground">install icon</strong> in the address bar, or the browser menu → <strong className="text-foreground">“Install StormSync”</strong>.</span></div>
          <div className="flex items-start gap-2"><Share className="w-4 h-4 mt-0.5 text-primary shrink-0" /><span>On iPhone: Safari <strong className="text-foreground">Share</strong> → <strong className="text-foreground">Add to Home Screen</strong>. On Android: Chrome <strong className="text-foreground">⋮</strong> → Install app.</span></div>
        </>
      )}
    </div>
  );
}

export function InstallApp({ variant = "card" }: { variant?: "card" | "compact" }) {
  const [, force] = useState(0);
  const [showHow, setShowHow] = useState(false);
  useEffect(() => subscribeInstall(() => force((n) => n + 1)), []);

  const installed = isStandalone();
  const installable = canInstall();

  if (variant === "compact") {
    if (installed) return null;
    return (
      <div className="inline-flex flex-col items-start">
        <button
          onClick={() => (installable ? promptInstall() : setShowHow((s) => !s))}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/25 transition-colors">
          <Download className="w-4 h-4" /> Install app
        </button>
        {showHow && !installable && <div className="mt-2 bg-card border border-border rounded-lg p-3 max-w-sm"><Instructions /></div>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Smartphone className="w-4 h-4 text-primary" /> Install StormSync</h2>
      {installed ? (
        <div className="flex items-center gap-2 text-sm text-green-400 mt-2"><Check className="w-4 h-4" /> Installed on this device — you're all set.</div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Add StormSync to your home screen for a full-screen, app-like experience and the most reliable alert delivery.</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {installable && (
              <button onClick={() => promptInstall()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors">
                <Download className="w-4 h-4" /> Install now
              </button>
            )}
            <button onClick={() => setShowHow((s) => !s)} className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm hover:border-primary/40 transition-colors">
              {showHow ? "Hide steps" : "How to install"}
            </button>
          </div>
          {(showHow || !installable) && <Instructions />}
        </>
      )}
    </div>
  );
}
