/**
 * "Show me that again."
 *
 * The intro guide runs once and then never bothers anybody again, which is only
 * fair if there is a way back to it. This is that way. It opens the guide in
 * place rather than clearing the flag and reloading, so the member gets what
 * they asked for immediately instead of on some future page load.
 *
 * Two entry points, because they are genuinely different requests: the whole
 * thing from the start, or straight into the module tour for somebody who just
 * wants to look up what a module does.
 */
import { Suspense, lazy, useState } from "react";
import { PlayCircle, Layers, Compass } from "lucide-react";
import { MODULE_GUIDE } from "../../lib/moduleGuide";
import { ROYAL, HEADING } from "../../lib/royal";

const IntroGuide = lazy(() => import("./IntroGuide").then((m) => ({ default: m.IntroGuide })));

export function ReplayIntroCard() {
  const [open, setOpen] = useState<null | "welcome" | "tour">(null);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"
          style={{ fontFamily: HEADING, color: ROYAL.text }}>
        <Compass className="w-4 h-4" style={{ color: ROYAL.gold }} /> Intro &amp; module guide
      </h2>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: ROYAL.dim }}>
        The walkthrough new members get. Replay it whenever you like, or jump straight to the
        guide for all {MODULE_GUIDE.length} modules.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setOpen("welcome")}
          className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5"
          style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
          <PlayCircle className="w-3.5 h-3.5" /> Replay the intro
        </button>
        <button onClick={() => setOpen("tour")}
          className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
          <Layers className="w-3.5 h-3.5" /> Module guide only
        </button>
      </div>

      {open && (
        <Suspense fallback={null}>
          <IntroGuide
            startInTour={open === "tour"}
            onClose={() => setOpen(null)}
            // Replaying does not need to write anything: they have already seen
            // it, and the flag being set is what let them get here.
            onFinished={() => { /* nothing to record on a replay */ }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ReplayIntroCard;
