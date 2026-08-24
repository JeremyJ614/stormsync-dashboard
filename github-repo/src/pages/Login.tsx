/**
 * Sign in.
 *
 * Creating an account now happens on the join page, where the account fields,
 * the tier picker and the module picker are one flow — so this page is only
 * ever about getting a returning member back in.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { LogIn, Mail, AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { AuthAurora } from "../components/auth/AuthAurora";
import { PinField } from "../components/auth/AccountFields";
import { ROYAL, HEADING, EASE } from "../lib/royal";

const logoUrl = "/logo.png";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const r = await login(email, pin);
    setSubmitting(false);
    if (!r.ok) { setError(r.error ?? "Could not sign you in — check your email and PIN."); return; }
    navigate("/");
  }

  return (
    <div className="relative min-h-[86vh] flex items-center justify-center p-4">
      <AuthAurora />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative z-10 w-full max-w-md rounded-2xl p-6 space-y-5 overflow-hidden royal-panel"
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

        <div className="text-center space-y-2.5">
          <motion.img
            src={logoUrl} alt="StormSync Media"
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, type: "spring", stiffness: 220, damping: 17 }}
            className="w-16 h-16 mx-auto rounded-2xl object-cover"
            style={{ boxShadow: `0 0 34px -10px ${ROYAL.gold}` }}
          />
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: ROYAL.gold }}>
              VIP Forecast Group
            </div>
            <h1 className="text-2xl font-bold tracking-[0.04em] uppercase mt-0.5"
                style={{ fontFamily: HEADING, color: ROYAL.text }}>
              StormSync
            </h1>
          </div>
          <p className="text-xs" style={{ color: ROYAL.dim }}>
            Welcome back. Sign in with your email and 4-digit PIN.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.18em] flex items-center gap-1.5 mb-1.5"
                  style={{ color: ROYAL.dim }}>
              <Mail className="w-3 h-3" style={{ color: ROYAL.gold }} /> Email
            </span>
            <input
              value={email} onChange={(e) => setEmail(e.target.value)} required
              type="email" autoComplete="email"
              className="w-full bg-[hsl(var(--muted)/0.35)] border rounded-lg px-3 py-2.5 text-sm outline-none transition-colors focus:border-[rgba(217,183,117,0.55)]"
              style={{ borderColor: "hsl(var(--border))" }}
            />
          </label>

          <PinField value={pin} onChange={setPin} />

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "rgba(226,55,60,0.10)", border: "1px solid rgba(226,55,60,0.32)", color: "#f3a3a5" }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </motion.div>
          )}

          <motion.button
            type="submit" disabled={submitting}
            whileTap={{ scale: 0.985 }}
            className="relative w-full font-semibold py-2.5 rounded-lg overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: "rgba(217,183,117,0.14)",
              border: `1px solid ${ROYAL.goldSoft}`,
              color: ROYAL.gold,
              fontFamily: HEADING,
              letterSpacing: "0.04em",
            }}
          >
            {/* Sheen that crosses the button while a request is in flight. */}
            {submitting && (
              <motion.span
                aria-hidden className="absolute inset-y-0 w-1/3"
                style={{ background: "linear-gradient(90deg, transparent, rgba(217,183,117,0.22), transparent)" }}
                animate={{ x: ["-120%", "360%"] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
              />
            )}
            <LogIn className="w-4 h-4" />
            {submitting ? "Signing you in…" : "Sign in"}
          </motion.button>
        </form>

        {/* Route to the join page, where account + plan are one flow. */}
        <button
          onClick={() => navigate("/plans")}
          className="w-full rounded-xl px-3 py-3 text-left flex items-center gap-3 group transition-colors"
          style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.22)" }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: "rgba(217,183,117,0.12)", border: `1px solid ${ROYAL.goldSoft}` }}>
            <ShieldCheck className="w-4 h-4" style={{ color: ROYAL.gold }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
              New here? Create your account
            </div>
            <div className="text-[11px]" style={{ color: ROYAL.dim }}>
              Account, tier and modules — all on one page.
            </div>
          </div>
          <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      style={{ color: ROYAL.gold }} />
        </button>

        <p className="text-[10px] text-center leading-relaxed" style={{ color: ROYAL.dim }}>
          Secured by StormSync's Supabase backend with multi-device sync.
        </p>
      </motion.div>
    </div>
  );
}
