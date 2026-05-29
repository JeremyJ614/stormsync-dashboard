import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, type Tier } from "../hooks/useAuth";
import { LogIn, UserPlus, Lock, Mail, User as UserIcon, AlertCircle } from "lucide-react";
const logoUrl = "/logo.png";

export default function Login() {
  const [, navigate] = useLocation();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier>(2);
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      const r = login(email, pin);
      if (!r.ok) { setError(r.error || "Login failed"); return; }
      navigate("/");
    } else {
      const r = signup({ name, email, pin, tier });
      if (!r.ok) { setError(r.error || "Signup failed"); return; }
      navigate("/");
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-5">
        <div className="text-center space-y-2">
          <img src={logoUrl} alt="StormSync Media" className="w-20 h-20 mx-auto rounded-xl object-cover" />
          <h1 className="text-2xl font-bold tracking-widest uppercase">StormSync Media</h1>
          <p className="text-xs text-muted-foreground">{mode === "login" ? "Welcome back. Log in with your email and 4-digit PIN." : "Create your StormSync account."}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-muted/30 rounded-xl p-1">
          <button onClick={() => { setMode("login"); setError(""); }}
            className={`py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${mode === "login" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <LogIn className="w-4 h-4" /> Log in
          </button>
          <button onClick={() => { setMode("signup"); setError(""); }}
            className={`py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${mode === "signup" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <UserPlus className="w-4 h-4" /> Sign up
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <label className="block">
              <span className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-1"><UserIcon className="w-3 h-3" /> Full Name</span>
              <input value={name} onChange={e => setName(e.target.value)} required type="text"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
            </label>
          )}
          <label className="block">
            <span className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-1"><Mail className="w-3 h-3" /> Email</span>
            <input value={email} onChange={e => setEmail(e.target.value)} required type="email" autoComplete="email"
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 mb-1"><Lock className="w-3 h-3" /> 4-Digit PIN</span>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} required
              type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 tracking-[1em] text-center font-mono" />
          </label>
          {mode === "signup" && (
            <label className="block">
              <span className="text-xs text-muted-foreground uppercase tracking-widest mb-1 block">Choose Tier</span>
              <select value={tier} onChange={e => setTier(Number(e.target.value) as Tier)}
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40">
                <option value={1}>Tier 1 — Essentials</option>
                <option value={2}>Tier 2 — Core Severe</option>
                <option value={3}>Tier 3 — Pro</option>
                <option value={4}>Tier 4 — Elite</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Your assigned tier unlocks a default module set. Admin can adjust your access anytime.</p>
            </label>
          )}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </div>
          )}
          <button type="submit" className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-semibold py-2.5 rounded-lg transition-colors">
            {mode === "login" ? "Log in" : "Create Account"}
          </button>
        </form>

        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          Accounts are stored locally in this browser. Migrate to a server-backed DB
          (Postgres via @workspace/db) for production multi-device access.
        </p>
      </div>
    </div>
  );
}
