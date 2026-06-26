import { useEffect, useState } from "react";
import { Mail, MessageSquare, MapPin, Check } from "lucide-react";
import { getPrefs, savePrefs } from "../lib/notifications";
import { listSavedLocations, type SavedLocation } from "../lib/savedLocations";
import type { User } from "../hooks/useAuth";

// Tier-3 alert delivery opt-in. Members choose to receive outlook-escalation /
// warning emails (and request texts, sent personally by the StormSync team), with
// a dedicated email + phone kept separate from their sign-up details if they wish.
export function AlertContactCard({ user }: { user: User }) {
  const [emailOptin, setEmailOptin] = useState(false);
  const [textOptin, setTextOptin] = useState(false);
  const [alertEmail, setAlertEmail] = useState(user.email);
  const [alertPhone, setAlertPhone] = useState("");
  const [locName, setLocName] = useState("");
  const [locs, setLocs] = useState<SavedLocation[]>([]);
  const [saved, setSaved] = useState(false);
  const signupPhone = user.customAnswers?.phone || user.customAnswers?.Phone || "";

  useEffect(() => {
    getPrefs(user.id).then((p) => {
      setEmailOptin(p.email_optin); setTextOptin(p.text_optin);
      setAlertEmail(p.alert_email || user.email);
      setAlertPhone(p.alert_phone || signupPhone);
      setLocName(p.text_location || "");
    });
    listSavedLocations().then(setLocs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function save() {
    const loc = locs.find((l) => l.name === locName);
    await savePrefs(user.id, {
      email_optin: emailOptin, text_optin: textOptin,
      alert_email: alertEmail.trim() || null, alert_phone: alertPhone.trim() || null,
      text_location: locName || null, text_lat: loc?.lat ?? null, text_lon: loc?.lon ?? null,
    });
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Email &amp; Text Alerts</h2>
        <p className="text-xs text-muted-foreground mt-1">Tier 3 perk — get outlook escalations &amp; warnings by email, and request personal text alerts for one location. These can stay separate from your sign-up contact details.</p>
      </div>

      {/* Email */}
      <div className="rounded-lg border border-border p-3 space-y-2">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-xs font-medium flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-primary" /> Email alerts</span>
          <input type="checkbox" checked={emailOptin} onChange={(e) => setEmailOptin(e.target.checked)} className="accent-primary w-4 h-4" />
        </label>
        {emailOptin && (
          <input value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} type="email" placeholder="you@email.com"
            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
        )}
      </div>

      {/* Text */}
      <div className="rounded-lg border border-border p-3 space-y-2">
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-xs font-medium flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-primary" /> Text alerts</span>
          <input type="checkbox" checked={textOptin} onChange={(e) => setTextOptin(e.target.checked)} className="accent-primary w-4 h-4" />
        </label>
        {textOptin && (
          <div className="space-y-2">
            <input value={alertPhone} onChange={(e) => setAlertPhone(e.target.value)} type="tel" placeholder="(555) 555-5555"
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <select value={locName} onChange={(e) => setLocName(e.target.value)}
                className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40">
                <option value="">Choose a saved location to watch…</option>
                {locs.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground">Texts are sent personally by the StormSync team when your chosen area is threatened. Add saved locations from the header search.</p>
          </div>
        )}
      </div>

      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors flex items-center gap-1.5">
        {saved ? <><Check className="w-4 h-4" /> Saved</> : "Save alert contacts"}
      </button>
    </div>
  );
}
