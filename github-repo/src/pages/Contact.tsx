/**
 * Contact.
 *
 * Three channels that are genuinely different, so they are drawn differently
 * rather than as three identical forms behind three identical tabs.
 *
 * Two decisions worth stating, because both look like oversights otherwise:
 *
 *  1. Customer Service names no address. It says the message goes to SSWX
 *     Internal Affairs and nothing more. The old form opened a `mailto:` to a
 *     published inbox, which put a real address in the page for anyone to
 *     scrape and made a one-person operation look like a help desk with a
 *     public queue. Submissions now go server-side, the same path the general
 *     form uses.
 *  2. The emergency channel is a vault, not a form with a password on it. The
 *     door is drawn and it opens — that pause is deliberate. This line exists
 *     for tornadoes on the ground, and a moment of ceremony before it opens is
 *     the difference between a channel people respect and one they use to ask
 *     about billing.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Link } from "wouter";
import {
  Mail, Headphones, AlertTriangle, Send, Lock, CheckCircle, Phone, ShieldCheck,
  Loader2, MapPin, Clock, ChevronRight, Delete, LogIn, KeyRound,
} from "lucide-react";
import { submitContact } from "../lib/contactInbox";
import { verifyEmergencyPin, useAuth } from "../hooks/useAuth";
import { fetchMyEmergencyPin } from "../lib/alerts";
import { RELAY_API } from "../config";
import { ROYAL, SPRING, prefersReducedMotion } from "../lib/royal";

type Tab = "general" | "service" | "emergency";

const TABS: { id: Tab; label: string; short: string; icon: typeof Mail; tone: string }[] = [
  { id: "general",   label: "General",          short: "General",   icon: Mail,          tone: ROYAL.iris },
  { id: "service",   label: "Customer Service", short: "Service",   icon: Headphones,    tone: ROYAL.gold },
  { id: "emergency", label: "Emergency Storm",  short: "Emergency", icon: AlertTriangle, tone: "#e2373c" },
];

export default function Contact() {
  const [tab, setTab] = useState<Tab>("general");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-wide uppercase flex items-center gap-2">
          <Mail className="w-6 h-6" style={{ color: ROYAL.gold }} /> Contact StormSync
        </h1>
        <p className="text-sm text-muted-foreground">
          Three channels, and they are not interchangeable. Pick the one that matches how fast you need an answer.
        </p>
      </header>

      <LayoutGroup id="contact-tabs">
        <div className="grid grid-cols-3 gap-1 bg-card border border-border rounded-xl p-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="relative py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                style={{ color: on ? t.tone : undefined }}>
                {on && (
                  <motion.span
                    layoutId="contact-slab"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: `${t.tone}1c`, border: `1px solid ${t.tone}44` }}
                    transition={prefersReducedMotion() ? { duration: 0 } : SPRING.silk}
                  />
                )}
                <span className={`relative flex items-center gap-1.5 ${on ? "" : "text-muted-foreground"}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.short}</span>
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={prefersReducedMotion() ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion() ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === "general" && <GeneralForm />}
          {tab === "service" && <ServiceForm />}
          {tab === "emergency" && <EmergencyVault />}
        </motion.div>
      </AnimatePresence>

      <p className="text-[11px] text-muted-foreground text-center">
        Typical reply on {active.id === "emergency" ? "the emergency line: minutes" : "this channel: within a day"}.
      </p>
    </div>
  );
}

// ─── shared field furniture ──────────────────────────────────────────────────
function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

const input =
  "w-full bg-muted/25 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors";

function Sent({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={prefersReducedMotion() ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
      style={{ background: "rgba(95,217,168,0.1)", color: "#8fe6c4" }}
    >
      <CheckCircle className="w-4 h-4 shrink-0 mt-px" /> <span>{children}</span>
    </motion.div>
  );
}

// ─── general ─────────────────────────────────────────────────────────────────
const TOPICS = [
  "A question about a module",
  "Something looks wrong or broken",
  "A feature I'd like to see",
  "Data or forecast accuracy",
  "Partnership or media",
  "Something else",
];

function GeneralForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await submitContact({ kind: "contact", name, email, message: `[${topic}]\n\n${message}` });
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not send."); return; }
    setSent(true); setName(""); setEmail(""); setMessage("");
    setTimeout(() => setSent(false), 6000);
  }

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4" style={{ color: ROYAL.iris }} /> General contact
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Questions, ideas, bug reports, anything that is not urgent. It lands in the team inbox and a person reads it.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={input} placeholder="Jane Doe" />
        </Field>
        <Field label="Email" hint="So there is somewhere to reply.">
          <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className={input} placeholder="you@example.com" />
        </Field>
      </div>

      <Field label="What is this about?">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={input}>
          {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>

      <Field label="Message" hint="Specifics help — which module, what you expected, what happened instead.">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={7}
                  className={`${input} resize-none`} placeholder="Tell us what's on your mind…" />
      </Field>

      <button type="submit" disabled={busy}
        className="w-full px-4 py-2.5 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: `${ROYAL.iris}1e`, border: `1px solid ${ROYAL.iris}55`, color: ROYAL.iris }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? "Sending…" : "Send message"}
      </button>

      {sent && <Sent>Delivered. Someone will read this and get back to you.</Sent>}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </form>
  );
}

// ─── customer service ────────────────────────────────────────────────────────
const SERVICE_TOPICS = [
  "Billing or a charge I don't recognise",
  "Subscription, upgrade or cancellation",
  "I can't get into my account",
  "A module I paid for isn't showing",
  "Refund request",
  "Something else",
];

const URGENCY = [
  { id: "whenever", label: "Whenever", note: "No rush" },
  { id: "soon", label: "This week", note: "Mildly annoying" },
  { id: "blocked", label: "I'm blocked", note: "Can't use the app" },
] as const;

function ServiceForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(SERVICE_TOPICS[0]);
  const [urgency, setUrgency] = useState<string>("soon");
  const [orderRef, setOrderRef] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const body = [
      `Topic: ${topic}`,
      `Urgency: ${URGENCY.find((u) => u.id === urgency)?.label ?? urgency}`,
      orderRef.trim() ? `Reference: ${orderRef.trim()}` : null,
      "",
      message,
    ].filter((l) => l !== null).join("\n");
    // Stored server-side. No address appears anywhere in this page — see the
    // note at the top of the file.
    const r = await submitContact({ kind: "customer-service", name, email, message: body });
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not send."); return; }
    setSent(true); setName(""); setEmail(""); setOrderRef(""); setMessage("");
    setTimeout(() => setSent(false), 8000);
  }

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Headphones className="w-4 h-4" style={{ color: ROYAL.gold }} /> Customer service
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Billing, access and account problems.
        </p>
      </div>

      <div className="rounded-lg px-3 py-2.5 flex items-start gap-2.5"
           style={{ background: `${ROYAL.gold}12`, border: `1px solid ${ROYAL.gold}3a` }}>
        <ShieldCheck className="w-4 h-4 shrink-0 mt-px" style={{ color: ROYAL.gold }} />
        <p className="text-[11px] leading-relaxed">
          <strong style={{ color: ROYAL.gold }}>Routed to SSWX Internal Affairs.</strong>
          <span className="text-muted-foreground">
            {" "}Account and billing matters are handled internally rather than through a public inbox.
            Your message is logged with a reference and worked by a person — you will get a reply at the
            email you give below.
          </span>
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={input} placeholder="Jane Doe" />
        </Field>
        <Field label="Account email" hint="Use the address your account is under.">
          <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className={input} placeholder="you@example.com" />
        </Field>
      </div>

      <Field label="What do you need help with?">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={input}>
          {SERVICE_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>

      <Field label="How urgent is it?">
        <div className="grid grid-cols-3 gap-2">
          {URGENCY.map((u) => {
            const on = urgency === u.id;
            return (
              <button key={u.id} type="button" onClick={() => setUrgency(u.id)}
                className="px-2 py-2 rounded-lg text-[11px] font-semibold border transition-colors text-center"
                style={on
                  ? { background: `${ROYAL.gold}1e`, borderColor: `${ROYAL.gold}66`, color: ROYAL.gold }
                  : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
                <span className="block">{u.label}</span>
                <span className="block text-[9px] font-normal opacity-70">{u.note}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Reference" hint="Invoice number or transaction id, if you have one. Optional.">
        <input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className={input} placeholder="e.g. INV-2026-0142" />
      </Field>

      <Field label="Details" hint="Dates, amounts and what you already tried all speed this up.">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={7}
                  className={`${input} resize-none`} placeholder="What happened, and what you'd like done about it…" />
      </Field>

      <button type="submit" disabled={busy}
        className="w-full px-4 py-2.5 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? "Filing…" : "File with Internal Affairs"}
      </button>

      {sent && <Sent>Filed with Internal Affairs. You'll get a reply at the address you gave.</Sent>}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </form>
  );
}

// ─── the vault ───────────────────────────────────────────────────────────────
type VaultState = "locked" | "checking" | "opening" | "open" | "denied";

function EmergencyVault() {
  const { user } = useAuth();
  const [state, setState] = useState<VaultState>("locked");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const still = prefersReducedMotion();

  // Alert level 4 is partly defined as "and they receive the PIN", so the people
  // entitled to it should not have to have written it down somewhere. The RPC
  // returns null for anyone without the level, so this is safe to call for
  // everyone signed in and tells us nothing we should not know.
  useEffect(() => {
    if (!user) { setHint(null); return; }
    let cancelled = false;
    void fetchMyEmergencyPin().then((p) => { if (!cancelled) setHint(p); });
    return () => { cancelled = true; };
  }, [user]);

  async function attempt(code: string) {
    setState("checking");
    setErr("");
    const result = await verifyEmergencyPin(code);
    if (result !== "ok") {
      setState("denied");
      // Saying "wrong PIN" when the real problem is an expired or missing
      // session sends someone hunting for digits they already have right.
      setErr(result === "unavailable"
        ? "Could not verify — your session may have expired. Sign in and try again."
        : "That PIN is not recognised.");
      setTimeout(() => { setState("locked"); setPin(""); }, result === "unavailable" ? 2600 : 900);
      return;
    }
    setState("opening");
    // The door takes a beat. On a line reserved for tornadoes on the ground,
    // the ceremony is doing real work: it marks the channel as different.
    setTimeout(() => setState("open"), still ? 200 : 1250);
  }

  // Four digits in, and it tries on its own — nobody hunts for a button here.
  useEffect(() => {
    if (pin.length === 4 && state === "locked") void attempt(pin);

  }, [pin, state]);

  if (state === "open") return <EmergencyForm pin={pin} />;

  // The PIN check is only granted to signed-in members, so a keypad shown to a
  // signed-out visitor could never open — better to say so than to let someone
  // stand there entering a PIN that was always going to be refused.
  if (!user) return <VaultNeedsSignIn />;

  return <VaultDoor state={state} pin={pin} setPin={setPin} err={err} still={still} hint={hint} />;
}

function VaultNeedsSignIn() {
  return (
    <div className="bg-card border-2 rounded-2xl p-6 space-y-4 text-center"
         style={{ borderColor: "rgba(226,55,60,0.3)" }}>
      <span className="w-14 h-14 rounded-2xl grid place-items-center mx-auto"
            style={{ background: "rgba(226,55,60,0.12)", border: "1px solid rgba(226,55,60,0.4)" }}>
        <Lock className="w-6 h-6" style={{ color: "#e2373c" }} />
      </span>
      <div>
        <h2 className="text-base font-bold" style={{ color: "#f0a2a5" }}>Emergency Storm Contact</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
          This line is tied to your membership, so you have to be signed in before the PIN will do anything.
        </p>
      </div>
      <Link href="/login"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
        style={{ background: "rgba(226,55,60,0.25)", border: "1px solid rgba(226,55,60,0.55)", color: "#ffd7d8" }}>
        <LogIn className="w-4 h-4" /> Sign in
      </Link>
      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
        If a storm is on you right now and you cannot get in, call 911. Do not spend the next five minutes
        on a login screen.
      </p>
    </div>
  );
}

function VaultDoor({
  state, pin, setPin, err, still, hint,
}: {
  state: VaultState; pin: string; setPin: (v: string) => void; err: string; still: boolean;
  /** The member's own PIN, when their alert level entitles them to it. */
  hint?: string | null;
}) {
  const shut = state === "locked" || state === "checking" || state === "denied";
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { boxRef.current?.focus(); }, []);

  function key(d: string) {
    if (state !== "locked") return;
    if (d === "back") setPin(pin.slice(0, -1));
    else if (pin.length < 4) setPin(pin + d);
  }

  return (
    <div className="bg-card border-2 rounded-2xl overflow-hidden" style={{ borderColor: "rgba(226,55,60,0.35)" }}>
      {/* the door */}
      <div
        ref={boxRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (/^[0-9]$/.test(e.key)) key(e.key);
          else if (e.key === "Backspace") key("back");
        }}
        className="relative h-64 grid place-items-center outline-none"
        style={{ background: "radial-gradient(circle at 50% 45%, rgba(226,55,60,0.14), transparent 62%)" }}
      >
        {/* The dial turns; its face does not.

            Two layers on purpose. Everything that should rotate — rim, bolts —
            lives in the animated element; the lock, the PIN dots and the OPEN
            mark sit in a static sibling on top. With one layer the spin carried
            the label round with it and "OPEN" arrived upside down at 540°. */}
        <div className="relative w-40 h-40">
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              border: "2px solid rgba(226,55,60,0.4)",
              background: "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.05), rgba(0,0,0,0.35))",
              boxShadow: "inset 0 0 40px rgba(0,0,0,0.6)",
            }}
            animate={
              still ? {}
              : state === "checking" ? { rotate: 360 }
              : state === "opening" ? { rotate: 540 }
              : state === "denied" ? { x: [0, -9, 9, -6, 6, 0] }
              : { rotate: pin.length * 27 }
            }
            transition={
              state === "checking" ? { duration: 1.1, repeat: Infinity, ease: "linear" }
              : state === "opening" ? { duration: 1.2, ease: [0.22, 1, 0.36, 1] }
              : state === "denied" ? { duration: 0.42 }
              : SPRING.silk
            }
          >
            {/* Bolts around the rim; two retract per digit entered.

                Position and animation are deliberately on separate elements. Put
                them on one and Framer's `scale` rewrites the element's transform,
                wiping the rotate/translate that places the bolt — every bolt then
                stacks in the middle of the wheel, invisible behind the lock. */}
            <div className="absolute inset-0 grid place-items-center">
              {Array.from({ length: 8 }).map((_, i) => {
                const engaged = shut && i >= pin.length * 2;
                return (
                  <span
                    key={i}
                    className="absolute w-2 h-2"
                    style={{ transform: `rotate(${i * 45}deg) translateY(-70px)` }}
                  >
                    <motion.span
                      className="block w-2 h-2 rounded-full"
                      style={{ background: engaged ? "rgba(226,55,60,0.9)" : "rgba(95,217,168,0.9)" }}
                      animate={still ? {} : { opacity: engaged ? 1 : 0.3, scale: engaged ? 1 : 0.6 }}
                      transition={{ duration: 0.25 }}
                    />
                  </span>
                );
              })}
            </div>
          </motion.div>

          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            {state === "opening" ? (
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                <ShieldCheck className="w-9 h-9 mx-auto" style={{ color: "#5fd9a8" }} />
                <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "#5fd9a8" }}>Open</p>
              </motion.div>
            ) : (
              <div className="text-center">
                <Lock className="w-7 h-7 mx-auto" style={{ color: "#e2373c" }} />
                <div className="flex gap-2 justify-center mt-2.5">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.span key={i} className="w-2.5 h-2.5 rounded-full"
                      style={{ background: i < pin.length ? "#e2373c" : "rgba(255,255,255,0.14)" }}
                      animate={still ? {} : { scale: i === pin.length - 1 ? [1.5, 1] : 1 }}
                      transition={{ duration: 0.22 }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4 border-t" style={{ borderColor: "rgba(226,55,60,0.2)" }}>
        <div className="text-center">
          <h2 className="text-base font-bold" style={{ color: "#f0a2a5" }}>Emergency Storm Contact</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {state === "checking" ? "Checking…"
              : state === "opening" ? "Opening the line…"
              : "Enter your 4-digit emergency PIN."}
          </p>

          {/* Someone whose plan includes the PIN should not have to have written
              it down. Shown, not auto-entered: the deliberate act of keying it
              in is part of what marks this channel as different from a form. */}
          {hint && state === "locked" && (
            <button
              type="button"
              onClick={() => setPin(hint)}
              className="mt-2 mx-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{ background: "rgba(255,138,61,0.14)", border: "1px solid rgba(255,138,61,0.4)", color: "#ff8a3d" }}
            >
              <KeyRound className="w-3 h-3" />
              Your PIN is <span className="tracking-[0.3em] tabular-nums font-black">{hint}</span> — tap to enter
            </button>
          )}
        </div>

        {/* keypad — this is used one-handed, in the dark, in a hurry */}
        <div className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button key={d} type="button" onClick={() => key(d)} disabled={state !== "locked"}
              className="py-3 rounded-lg text-lg font-semibold tabular-nums transition-colors disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
              {d}
            </button>
          ))}
          <span />
          <button type="button" onClick={() => key("0")} disabled={state !== "locked"}
            className="py-3 rounded-lg text-lg font-semibold tabular-nums transition-colors disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
            0
          </button>
          <button type="button" onClick={() => key("back")} disabled={state !== "locked"} aria-label="Delete"
            className="py-3 rounded-lg grid place-items-center transition-colors disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
            <Delete className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {err && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-xs text-center" style={{ color: "#f0a2a5" }}>
              {err}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="border-t pt-4 space-y-2.5" style={{ borderColor: ROYAL.hairline }}>
          <h3 className="text-[11px] uppercase tracking-wider" style={{ color: "#f0a2a5" }}>What this line is for</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            An active, life-threatening storm where you need a person now — a tornado on the ground near you,
            flash flooding in progress, a decision you have minutes to make. It reaches the team with an urgent
            tag on both email and text.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Not for</strong> billing, account access, feature requests, or
            "is it going to storm this weekend". Those belong on the other two tabs and will be answered there.
          </p>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            The PIN comes with Advanced tier. If you have one and it isn't working, use Customer Service — do not
            keep guessing here.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmergencyForm({ pin }: { pin: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [situation, setSituation] = useState("");
  const [location, setLocation] = useState("");
  const [sheltering, setSheltering] = useState<string>("unsure");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const still = prefersReducedMotion();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setErr(""); setResult(null);
    try {
      const body = [
        `Sheltered: ${sheltering}`,
        "",
        situation,
      ].join("\n");
      const res = await fetch(RELAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "emergency", name, email, phone, location, message: body, pin }),
      });
      const data = await res.json() as { ok?: boolean; note?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send. Try again.");
      setResult(data.note ?? "Emergency dispatched.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={still ? { duration: 0.15 } : SPRING.silk}
      className="rounded-2xl p-5 space-y-4 border-2"
      style={{
        borderColor: "rgba(226,55,60,0.45)",
        background: "linear-gradient(160deg, rgba(58,10,14,0.5), hsl(var(--card)))",
      }}
    >
      <div className="flex items-center gap-2">
        <motion.span animate={still ? {} : { opacity: [1, 0.45, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
          <AlertTriangle className="w-5 h-5" style={{ color: "#e2373c" }} />
        </motion.span>
        <h2 className="text-base font-bold" style={{ color: "#f0a2a5" }}>Line open</h2>
        <span className="ml-auto text-[10px] uppercase tracking-widest flex items-center gap-1" style={{ color: "#5fd9a8" }}>
          <ShieldCheck className="w-3 h-3" /> Verified
        </span>
      </div>

      <p className="text-[11px] leading-relaxed rounded-lg px-3 py-2"
         style={{ background: "rgba(226,55,60,0.1)", border: "1px solid rgba(226,55,60,0.3)", color: "#f0b8ba" }}>
        This goes out with an urgent tag on email and text at once. If you are in immediate danger,
        call 911 first — this line is for storm guidance, not rescue.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={input} />
        </Field>
        <Field label="Phone" hint="The fastest way to reach you.">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" className={input} />
        </Field>
      </div>

      <Field label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className={input} />
      </Field>

      <Field label="Exactly where you are" hint="City and state at minimum. A cross street or county is better.">
        <div className="relative">
          <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} required
                 className={`${input} pl-9`} placeholder="Norman, OK — near Main & Porter" />
        </div>
      </Field>

      <Field label="Are you in shelter?">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
            { id: "unsure", label: "Moving there" },
          ].map((o) => {
            const on = sheltering === o.id;
            return (
              <button key={o.id} type="button" onClick={() => setSheltering(o.id)}
                className="px-2 py-2 rounded-lg text-[11px] font-semibold border transition-colors"
                style={on
                  ? { background: "rgba(226,55,60,0.18)", borderColor: "rgba(226,55,60,0.55)", color: "#f0a2a5" }
                  : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
                {o.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="What is happening" hint="What you can see, what you've been told, and what you need decided.">
        <textarea value={situation} onChange={(e) => setSituation(e.target.value)} required rows={6}
                  className={`${input} resize-none`}
                  placeholder="Wall cloud to my southwest, sirens going, unsure whether to move…" />
      </Field>

      <button type="submit" disabled={sending}
        className="w-full px-4 py-3 rounded-lg font-bold uppercase tracking-widest text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "rgba(226,55,60,0.3)", border: "2px solid rgba(226,55,60,0.6)", color: "#ffd7d8" }}>
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
        {sending ? "Dispatching…" : "Send urgent"}
      </button>

      {result && <Sent>{result}</Sent>}
      {err && <p className="text-xs text-red-400">{err}</p>}

      <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
        <Clock className="w-3 h-3" /> Expect a reply in minutes. Keep your phone unlocked and to hand.
        <ChevronRight className="w-3 h-3 opacity-0" />
      </p>
    </motion.form>
  );
}
