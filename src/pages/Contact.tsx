import { useState } from "react";
import { contactStore } from "../lib/adminStore";
import { getEmergencyPin } from "../hooks/useAuth";
import { Mail, Headphones, AlertTriangle, Send, Lock, CheckCircle, Phone } from "lucide-react";

type Tab = "general" | "service" | "emergency";

const EMERGENCY_EMAILS = [
  "JayMyers@StormSync.Media",
  "Administration@StormSync.Media",
  "KeatonPreston@StormSync.Media",
];
const EMERGENCY_PHONE = "5672044402";
const CUSTOMER_SERVICE_EMAIL = "customerservice@stormsync.media";

export default function Contact() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Mail className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Contact StormSync</h1>
      </div>
      <p className="text-sm text-muted-foreground">Three contact channels — pick the one that fits.</p>

      <div className="grid grid-cols-3 gap-2 bg-card border border-border rounded-xl p-1.5">
        {([
          { id: "general", label: "Contact Form", icon: Mail },
          { id: "service", label: "Customer Service", icon: Headphones },
          { id: "emergency", label: "Emergency Storm", icon: AlertTriangle },
        ] as { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === t.id ? (t.id === "emergency" ? "bg-red-500/15 text-red-300" : "bg-primary/15 text-primary") : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "general" && <GeneralForm />}
      {tab === "service" && <ServiceForm />}
      {tab === "emergency" && <EmergencyTab />}
    </div>
  );
}

function GeneralForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    contactStore.add({ kind: "contact", name, email, message });
    setSent(true); setName(""); setEmail(""); setMessage("");
    setTimeout(() => setSent(false), 4000);
  }

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-3">
      <h2 className="text-sm font-semibold">General Contact</h2>
      <p className="text-xs text-muted-foreground">Goes directly to the admin inbox. Replies come from the admin team.</p>
      <input value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
      <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="Email" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
      <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={6} placeholder="Your message..." className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 resize-none" />
      <button type="submit" className="w-full px-4 py-2.5 rounded-lg bg-primary/20 border border-primary/40 text-primary font-semibold hover:bg-primary/30 flex items-center justify-center gap-2">
        <Send className="w-4 h-4" /> Send Message
      </button>
      {sent && <div className="flex items-center gap-2 text-xs text-green-400"><CheckCircle className="w-4 h-4" /> Message delivered to admin inbox.</div>}
    </form>
  );
}

function ServiceForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    contactStore.add({ kind: "customer-service", name, email, message });
    const body = encodeURIComponent(`From: ${name} <${email}>\n\n${message}`);
    const subject = encodeURIComponent(`StormSync Customer Service from ${name}`);
    window.location.href = `mailto:${CUSTOMER_SERVICE_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true); setName(""); setEmail(""); setMessage("");
    setTimeout(() => setSent(false), 6000);
  }

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Headphones className="w-4 h-4 text-primary" /> Customer Service</h2>
      <p className="text-xs text-muted-foreground">Goes to <span className="text-primary">{CUSTOMER_SERVICE_EMAIL}</span> via your default mail app. A copy is also stored in the admin inbox.</p>
      <input value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
      <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="Email" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
      <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={6} placeholder="What can customer service help you with?" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 resize-none" />
      <button type="submit" className="w-full px-4 py-2.5 rounded-lg bg-primary/20 border border-primary/40 text-primary font-semibold hover:bg-primary/30 flex items-center justify-center gap-2">
        <Send className="w-4 h-4" /> Send to Customer Service
      </button>
      {sent && <div className="flex items-center gap-2 text-xs text-green-400"><CheckCircle className="w-4 h-4" /> Opened your mail app and stored a copy in admin inbox.</div>}
    </form>
  );
}

function EmergencyTab() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  if (!unlocked) {
    return (
      <div className="bg-card border-2 border-red-500/40 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-red-400" />
          <h2 className="text-base font-bold text-red-300">Emergency Storm Contact — PIN Required</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Enter your 4-digit emergency PIN to access this form.
        </p>
        <div className="flex items-center gap-2">
          <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
            type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
            className="w-40 bg-muted/30 border border-border rounded-lg px-3 py-2 text-center tracking-[1em] font-mono outline-none focus:border-red-500/60" />
          <button onClick={() => {
            if (pin === getEmergencyPin()) { setUnlocked(true); setErr(""); }
            else setErr("Incorrect PIN");
          }} className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-semibold hover:bg-red-500/30">
            Unlock
          </button>
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}

        <div className="border-t border-border pt-4 space-y-2">
          <h3 className="text-sm font-semibold text-red-300">Who is this for?</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The <strong className="text-foreground">Emergency Storm Contact</strong> line is reserved for <strong className="text-foreground">Tier 4 elite members</strong> during active severe weather emergencies — tornadoes on the ground, flash flooding in progress, or any life-threatening storm situation where you need an immediate human response from the StormSync team.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">What it does:</strong> Submissions go directly to Jay Myers' phone (567-204-4402) and three priority email addresses with an URGENT tag. Expect a reply within minutes.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Don't use this for:</strong> general questions, billing, feature requests, or non-time-critical issues. Use the Contact Form or Customer Service tabs instead.
          </p>
        </div>
      </div>
    );
  }

  return <EmergencyForm />;
}

function EmergencyForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [situation, setSituation] = useState("");
  const [location, setLocation] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const message = `URGENT — EMERGENCY STORM CONTACT\nLocation: ${location}\nPhone: ${phone}\n\nSituation:\n${situation}`;
    contactStore.add({ kind: "emergency", name, email, phone, message });
    const subject = encodeURIComponent(`🚨 URGENT — Emergency Storm Contact from ${name}`);
    const body = encodeURIComponent(`URGENT EMERGENCY\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nLocation: ${location}\n\nSituation:\n${situation}\n\n-- Sent via StormSync Emergency Storm Contact`);
    window.location.href = `mailto:${EMERGENCY_EMAILS.join(",")}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="bg-gradient-to-br from-red-950/40 to-card border-2 border-red-500/40 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
        <h2 className="text-base font-bold text-red-300">Emergency Storm Contact</h2>
      </div>
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-[11px] text-red-200/90 leading-relaxed">
        Delivers to phone <span className="font-bold">{EMERGENCY_PHONE.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}</span> and emails <span className="font-bold">{EMERGENCY_EMAILS.join(", ")}</span> with an URGENT tag.
      </div>
      <input value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" className="w-full bg-muted/30 border border-red-500/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/60" />
      <div className="grid grid-cols-2 gap-2">
        <input value={phone} onChange={e => setPhone(e.target.value)} required type="tel" placeholder="Your phone" className="bg-muted/30 border border-red-500/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/60" />
        <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="Your email" className="bg-muted/30 border border-red-500/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/60" />
      </div>
      <input value={location} onChange={e => setLocation(e.target.value)} required placeholder="Current city, state (be specific)" className="w-full bg-muted/30 border border-red-500/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/60" />
      <textarea value={situation} onChange={e => setSituation(e.target.value)} required rows={6} placeholder="Describe the emergency — what storm? What's happening? What do you need?" className="w-full bg-muted/30 border border-red-500/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-500/60 resize-none" />
      <button type="submit" className="w-full px-4 py-3 rounded-lg bg-red-500/30 border-2 border-red-500/60 text-red-200 font-bold hover:bg-red-500/40 flex items-center justify-center gap-2 uppercase tracking-widest text-sm">
        <Phone className="w-4 h-4" /> SEND URGENT
      </button>
      {sent && <div className="flex items-center gap-2 text-xs text-green-400"><CheckCircle className="w-4 h-4" /> Emergency dispatched. Watch your phone for a response.</div>}
    </form>
  );
}
