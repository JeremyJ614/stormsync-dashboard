import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth, type SignupQuestion } from "../hooks/useAuth";
import { getQuestions } from "../lib/userAdmin";
import { LogIn, UserPlus, Lock, Mail, User as UserIcon, AlertCircle } from "lucide-react";
const logoUrl = "/logo.png";

// These are rendered natively above; only admin-added questions render dynamically.
const CORE_QUESTION_IDS = ["name", "email", "pin", "tier"];

function CustomQuestionField({ q, value, onChange }: { q: SignupQuestion; value: string; onChange: (v: string) => void }) {
  const base = "w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40";
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground uppercase tracking-widest mb-1 block">
        {q.label}{q.required ? " *" : ""}
      </span>
      {q.type === "textarea" ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} required={q.required}
          placeholder={q.placeholder} rows={3} className={`${base} resize-none`} />
      ) : q.type === "select" ? (
        <select value={value} onChange={e => onChange(e.target.value)} required={q.required} className={base}>
          <option value="">— select —</option>
          {(q.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : q.type === "checkbox" ? (
        <div className="space-y-1.5">
          {(q.options ?? []).map(o => {
            const selected = value ? value.split(", ") : [];
            const on = selected.includes(o);
            return (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={on} onChange={() => {
                  const next = on ? selected.filter(x => x !== o) : [...selected, o];
                  onChange(next.join(", "));
                }} />
                {o}
              </label>
            );
          })}
        </div>
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} required={q.required}
          type={q.type} placeholder={q.placeholder} className={base} />
      )}
    </label>
  );
}

export default function Login() {
  const [, navigate] = useLocation();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [customQuestions, setCustomQuestions] = useState<SignupQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Admin-defined signup questions (the Signups tab in the admin panel edits these).
  useEffect(() => {
    getQuestions()
      .then(qs => setCustomQuestions(qs.filter(q => !CORE_QUESTION_IDS.includes(q.id))))
      .catch(() => setCustomQuestions([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        const r = await login(email, pin);
        if (!r.ok) { setError(r.error || "Login failed"); return; }
        navigate("/");
      } else {
        // Keyed by question label so answers stay readable if questions are later edited.
        const customAnswers: Record<string, string> = {};
        for (const q of customQuestions) {
          if (q.required && !(answers[q.id] ?? "").trim()) { setError(`"${q.label}" is required`); return; }
          if ((answers[q.id] ?? "").trim()) customAnswers[q.label] = answers[q.id].trim();
        }
        const r = await signup({ name, email, pin, customAnswers });
        if (!r.ok) { setError(r.error || "Signup failed"); return; }
        // Accounts are created already-confirmed and signed in immediately.
        navigate("/");
      }
    } finally {
      setSubmitting(false);
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
          {mode === "signup" && customQuestions.map(q => (
            <CustomQuestionField key={q.id} q={q} value={answers[q.id] ?? ""}
              onChange={v => setAnswers(a => ({ ...a, [q.id]: v }))} />
          ))}
          {mode === "signup" && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              New accounts start at <strong className="text-foreground">Tier 1</strong>. Your tier is
              upgraded by a StormSync admin after your membership is set up.
            </p>
          )}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-xs text-primary">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {notice}
            </div>
          )}
          <button type="submit" disabled={submitting} className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create Account"}
          </button>
        </form>

        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          Accounts are secured by StormSync's Supabase backend with multi-device sync.
          Sign in with your email and 4-digit PIN.
        </p>
      </div>
    </div>
  );
}
