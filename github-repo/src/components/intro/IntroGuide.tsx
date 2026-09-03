/**
 * The intro guide.
 *
 * Plays once, the first time somebody signs in. Six welcome cards that explain
 * the app, then the question: do you want the module tour? Yes runs through
 * every module grouped the way the sidebar is; no closes and never asks again.
 * Either way it can be replayed from My Profile, so nobody is punished for
 * skipping it on a phone in a car park.
 *
 * On the animation: this is somebody's first impression, so it gets the budget.
 * A geometric field drifts behind, cards arrive on a spring, and the progress
 * rail fills as you go. All of it still checks prefersReducedMotion, and all of
 * it collapses to a cross-fade when asked — a first impression that ignores an
 * accessibility setting is a worse first impression.
 *
 * The "seen" flag lives on the profile rather than in localStorage, because
 * somebody who signs in on a phone and then a laptop has still seen the intro.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronRight, ChevronLeft, Sparkles, BellRing, MapPin, LayoutDashboard,
  Compass, ShieldCheck, Check, PlayCircle, Layers, Award, Ticket, Smartphone, LayoutGrid,
} from "lucide-react";
import { guideByGroup, type ModuleGuideEntry } from "../../lib/moduleGuide";
import { MenuPicker } from "../MenuPicker";
import { ROYAL, HEADING, EASE, SPRING, prefersReducedMotion } from "../../lib/royal";

interface WelcomeCard {
  icon: typeof Sparkles;
  eyebrow: string;
  title: string;
  body: string;
  color: string;
  /** A slide that does something rather than only saying something. */
  action?: "menu";
}

const WELCOME: WelcomeCard[] = [
  {
    icon: Sparkles, color: "#d9b775", eyebrow: "Welcome",
    title: "This is StormSync",
    body: "A severe-weather desk built for people who actually watch the sky: spotters, chasers, broadcasters and anyone who would rather know early. Everything here comes from official feeds, and where we compute something ourselves we say so.",
  },
  {
    icon: MapPin, color: "#89cff0", eyebrow: "First thing",
    title: "Set your location",
    body: "Use the search box at the top, or the arrow to detect where you are. You can save several places. Almost every module and every alert works from the locations you save, so this is the one setting worth doing now.",
  },
  {
    icon: BellRing, color: "#ff8a3d", eyebrow: "How we reach you",
    title: "Alerts have five levels",
    body: "In-app alerts and push notifications are free to everyone. Above that you can add email and text to a real contact, morning outlook warnings with the Emergency Contact PIN, and a direct line where we contact you ourselves. Your plan includes some already.",
  },
  {
    icon: LayoutDashboard, color: "#ccccff", eyebrow: "Make it yours",
    title: "The Dashboard is a layout, not a page",
    body: "Press Customize and drag in the widgets you care about. It saves per device, so your phone can be lean and your desktop can be dense. The Daily Brief does the same job in one screen if you would rather just read it.",
  },
  {
    icon: ShieldCheck, color: "#ff4d55", eyebrow: "When it matters",
    title: "The app gets out of the way",
    body: "While a warning is active for your location, animation across the app stops. No drifting backgrounds, no sliding panels. During severe weather you should be reading, not watching things move.",
  },
  {
    icon: Compass, color: "#5fd9a8", eyebrow: "Finding your way",
    title: "Everything is in the sidebar",
    body: "Modules are grouped by what they are for. Anything not on your plan still shows, so you can see what exists and what it would cost. Nothing is hidden from you just because you have not bought it.",
  },
  {
    icon: Award, color: "#c084fc", eyebrow: "Along the way",
    title: "128 badges award themselves",
    body: "For turning up, for streaks, for how much of the app you have explored, for the games, for bringing people in. Your first saved location earns a region badge on its own. Each one is a struck medallion, and how ornate the rim is tells you how rare it was.",
  },
  {
    icon: Ticket, color: "#8fb2ff", eyebrow: "Worth having",
    title: "Your plan puts you in a draw",
    body: "Four raffles — monthly, yearly, one that can run at any time, and one that is simply given. Entries come with your plan and from taking part, and the pick is weighted by tickets, so holding four really is four chances. Most prizes land on your account the moment you win.",
  },
  {
    icon: LayoutGrid, color: "#c084fc", eyebrow: "Make it yours",
    title: "Pick how you get around",
    body: "There are fifteen menus and they are not variations on one idea — a radar scope, a departure board, a comic page, a neon street, a black hole. None of them is the right one, so choose whichever you like. It changes the moment you tap it, and you can change it again whenever you want from My Profile.",
    action: "menu",
  },
  {
    icon: Smartphone, color: "#5fd9a8", eyebrow: "On your phone",
    title: "Built for the field",
    body: "Pull down anywhere to refresh. Lose signal and the app says so rather than showing you old numbers as if they were new. Install it to your home screen and it opens instantly on a bad connection. My Profile has the button, and lists every device your alerts go to.",
  },
];

export function IntroGuide({
  onClose, onFinished, startInTour = false,
}: {
  onClose: () => void;
  /** Called when the member reaches the end, so the profile flag can be set. */
  onFinished: () => void;
  startInTour?: boolean;
}) {
  const still = prefersReducedMotion();
  const groups = useMemo(() => guideByGroup(), []);
  const modules = useMemo(() => groups.flatMap((g) => g.entries.map((e) => ({ ...e, groupLabel: g.group }))), [groups]);

  // Stages: the welcome cards, the question, then the module tour.
  const [stage, setStage] = useState<"welcome" | "ask" | "tour">(startInTour ? "tour" : "welcome");
  const [i, setI] = useState(0);

  const total = stage === "welcome" ? WELCOME.length : modules.length;
  const atEnd = i >= total - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener("keydown", onKey); };
  });

  function finish() { onFinished(); onClose(); }

  function next() {
    if (stage === "welcome") {
      if (atEnd) { setStage("ask"); return; }
      setI((n) => n + 1);
      return;
    }
    if (stage === "tour") {
      if (atEnd) { finish(); return; }
      setI((n) => n + 1);
    }
  }

  function prev() {
    if (i > 0) { setI((n) => n - 1); return; }
    if (stage === "tour") { setStage("ask"); return; }
    if (stage === "ask") { setStage("welcome"); setI(WELCOME.length - 1); }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog" aria-modal="true" aria-label="StormSync intro guide"
    >
      <Backdrop still={still} />

      <motion.div
        initial={still ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING.silk}
        className="relative w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: `radial-gradient(120% 90% at 50% 0%, rgba(217,183,117,0.10), ${ROYAL.ink} 60%)`,
          border: `1px solid ${ROYAL.hairline}`,
          maxHeight: "100dvh",
        }}
      >
        {/* rail */}
        <div className="h-1 shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            className="h-full"
            style={{ background: `linear-gradient(90deg, ${ROYAL.gold}, #ccccff)`, transformOrigin: "left center" }}
            initial={false}
            animate={{ scaleX: stage === "ask" ? 1 : (i + 1) / Math.max(1, total) }}
            transition={{ duration: still ? 0 : 0.45, ease: EASE }}
          />
        </div>

        <div className="px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: ROYAL.dim }}>
            {stage === "welcome" ? `Welcome · ${i + 1} of ${WELCOME.length}`
              : stage === "ask" ? "One question"
              : `Module guide · ${i + 1} of ${modules.length}`}
          </span>
          <button onClick={finish} className="ml-auto p-1.5 rounded-lg shrink-0"
                  aria-label="Close the guide"
                  style={{ background: "rgba(255,255,255,0.05)", color: ROYAL.dim }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
          <AnimatePresence mode="wait">
            {stage === "welcome" && (
              <Slide key={`w-${i}`} still={still}>
                <WelcomeSlide card={WELCOME[i]} still={still} />
              </Slide>
            )}
            {stage === "ask" && (
              <Slide key="ask" still={still}>
                <AskSlide
                  still={still}
                  count={modules.length}
                  onYes={() => { setStage("tour"); setI(0); }}
                  onNo={finish}
                />
              </Slide>
            )}
            {stage === "tour" && modules[i] && (
              <Slide key={`t-${i}`} still={still}>
                <ModuleSlide entry={modules[i]} groupLabel={modules[i].groupLabel} still={still} />
              </Slide>
            )}
          </AnimatePresence>
        </div>

        {stage !== "ask" && (
          <div className="px-4 sm:px-6 py-3.5 flex items-center gap-2 shrink-0"
               style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
            <button onClick={prev} disabled={stage === "welcome" && i === 0}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1 disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.05)", color: ROYAL.dim }}>
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            {stage === "tour" && (
              <button onClick={finish} className="px-3 py-2 rounded-lg text-sm"
                      style={{ color: ROYAL.dim }}>
                Skip the rest
              </button>
            )}

            <button onClick={next}
              className="ml-auto px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5"
              style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
              {stage === "tour" && atEnd ? <>Finish <Check className="w-4 h-4" /></>
                : <>Next <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function Slide({ children, still }: { children: React.ReactNode; still: boolean }) {
  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, x: 34 }}
      animate={{ opacity: 1, x: 0 }}
      exit={still ? { opacity: 0 } : { opacity: 0, x: -28 }}
      transition={{ duration: still ? 0.18 : 0.36, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The geometric field behind everything.
 *
 * Concentric rings and a slow orbit, drawn once in SVG rather than as a stack
 * of animated DOM nodes, so it costs one compositor layer instead of thirty.
 */
function Backdrop({ still }: { still: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "rgba(4,4,12,0.9)", backdropFilter: "blur(10px)" }}>
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true"
           viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
        {[120, 200, 280, 360, 440].map((r, k) => (
          <motion.circle
            key={r} cx={400} cy={400} r={r} fill="none"
            stroke={k % 2 ? "#ccccff" : ROYAL.gold} strokeWidth={0.7}
            opacity={0.1 - k * 0.012}
            animate={still ? undefined : { rotate: k % 2 ? 360 : -360 }}
            transition={{ duration: 90 + k * 25, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "400px 400px" }}
          />
        ))}
        {Array.from({ length: 36 }).map((_, k) => {
          const a = (k / 36) * Math.PI * 2;
          return (
            <line key={k}
              x1={400 + Math.cos(a) * 452} y1={400 + Math.sin(a) * 452}
              x2={400 + Math.cos(a) * 468} y2={400 + Math.sin(a) * 468}
              stroke={ROYAL.gold} strokeWidth={1} opacity={0.09} />
          );
        })}
        {!still && [0, 1, 2].map((k) => (
          <motion.circle
            key={`o-${k}`} r={3} fill={k === 1 ? "#ccccff" : ROYAL.gold} opacity={0.5}
            animate={{ rotate: 360 }}
            transition={{ duration: 26 + k * 9, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "400px 400px" }}
            cx={400 + [200, 280, 360][k]} cy={400}
          />
        ))}
      </svg>
    </div>
  );
}

function WelcomeSlide({ card, still }: { card: WelcomeCard; still: boolean }) {
  const Icon = card.icon;
  return (
    <div className="py-6 sm:py-10 text-center max-w-lg mx-auto">
      <motion.span
        initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: -20 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: still ? 0 : 0.05 }}
        className="w-16 h-16 rounded-2xl grid place-items-center mx-auto mb-5"
        style={{
          background: `${card.color}1f`, border: `1px solid ${card.color}55`,
          boxShadow: `0 0 40px -12px ${card.color}`,
        }}
      >
        <Icon className="w-7 h-7" style={{ color: card.color }} />
      </motion.span>

      <div className="text-[10px] uppercase tracking-[0.32em] mb-2" style={{ color: card.color }}>
        {card.eyebrow}
      </div>
      <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-3"
          style={{ fontFamily: HEADING, color: ROYAL.text }}>
        {card.title}
      </h2>
      <p className="text-sm sm:text-[15px] leading-relaxed" style={{ color: ROYAL.dim }}>
        {card.body}
      </p>

      {/* A slide that is a control, not a caption. Choosing here applies the
          menu straight away, so the next thing they open is the one they
          picked — which is the only way to actually judge one of these. */}
      {card.action === "menu" && (
        <div className="mt-5 text-left">
          <MenuPicker compact />
        </div>
      )}
    </div>
  );
}

function AskSlide({
  count, onYes, onNo, still,
}: { count: number; onYes: () => void; onNo: () => void; still: boolean }) {
  return (
    <div className="py-8 sm:py-12 text-center max-w-lg mx-auto">
      <motion.span
        initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 18 }}
        className="w-16 h-16 rounded-2xl grid place-items-center mx-auto mb-5"
        style={{ background: `${ROYAL.gold}1f`, border: `1px solid ${ROYAL.gold}55`, boxShadow: `0 0 40px -12px ${ROYAL.gold}` }}
      >
        <Layers className="w-7 h-7" style={{ color: ROYAL.gold }} />
      </motion.span>

      <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-3"
          style={{ fontFamily: HEADING, color: ROYAL.text }}>
        Want the module guide?
      </h2>
      <p className="text-sm leading-relaxed mb-6" style={{ color: ROYAL.dim }}>
        {count} modules, one card each, about what it is and the first thing to do with it. Two minutes.
        You can stop anywhere, and replay the whole thing from My Profile whenever you like.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button onClick={onYes}
          className="px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
          <PlayCircle className="w-4 h-4" /> Yes, show me
        </button>
        <button onClick={onNo}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
          No thanks, take me in
        </button>
      </div>
    </div>
  );
}

function ModuleSlide({
  entry, groupLabel, still,
}: { entry: ModuleGuideEntry; groupLabel: string; still: boolean }) {
  const rows: { label: string; body: string }[] = [
    { label: "What it does", body: entry.does },
    { label: "Start with", body: entry.use },
    ...(entry.tip ? [{ label: "Worth knowing", body: entry.tip }] : []),
  ];

  return (
    <div className="py-5 sm:py-7 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.28em]" style={{ color: ROYAL.dim }}>
          {groupLabel}
        </span>
        {entry.isNew && (
          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black"
                style={{ background: `${ROYAL.gold}26`, color: ROYAL.gold }}>NEW</span>
        )}
      </div>

      <h2 className="text-2xl sm:text-[28px] font-black leading-tight"
          style={{ fontFamily: HEADING, color: ROYAL.text }}>
        {entry.title}
      </h2>
      <p className="text-[15px] mt-1.5 leading-relaxed" style={{ color: ROYAL.gold }}>
        {entry.what}
      </p>

      <div className="mt-5 space-y-2.5">
        {rows.map((r, k) => (
          <motion.div
            key={r.label}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: still ? 0.2 : 0.4, delay: still ? 0 : 0.08 + k * 0.08, ease: EASE }}
            className="rounded-xl px-3.5 py-3"
            style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${ROYAL.hairline}` }}
          >
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: ROYAL.dim }}>
              {r.label}
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: ROYAL.text }}>{r.body}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default IntroGuide;
