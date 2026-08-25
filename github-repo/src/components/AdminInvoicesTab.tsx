/**
 * Invoices — the template members receive after every sale.
 *
 * Built to be edited on a phone: one column of labelled fields, a preview that
 * collapses out of the way, and a send-to-myself button so the thing can be
 * checked in a real inbox rather than trusted from a thumbnail.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Save, Loader2, Check, AlertCircle, Send, Eye, EyeOff, RotateCcw, Info,
} from "lucide-react";
import {
  getInvoiceSettings, saveInvoiceSettings, previewInvoice, sendTestInvoice,
  DEFAULT_INVOICE_SETTINGS, type InvoiceSettings,
} from "../lib/invoices";
import { ROYAL, EASE } from "../lib/royal";

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground block mb-1">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] text-muted-foreground block mt-1">{hint}</span>}
    </label>
  );
}

const INPUT = "w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40";

export function AdminInvoicesTab() {
  const [s, setS] = useState<InvoiceSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [testTo, setTestTo] = useState("");

  useEffect(() => { void getInvoiceSettings().then(setS); }, []);

  function set<K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) {
    setS((p) => (p ? { ...p, [k]: v } : p));
    setDirty(true); setMsg(null);
  }

  async function save() {
    if (!s) return;
    setBusy(true);
    const r = await saveInvoiceSettings(s);
    setBusy(false);
    setMsg(r.ok ? { kind: "ok", text: "Saved. New sales use this template." } : { kind: "err", text: r.error ?? "Save failed." });
    if (r.ok) setDirty(false);
  }

  async function openPreview() {
    if (!s) return;
    setShowPreview((v) => !v);
    if (showPreview) return;
    setBusy(true);
    try { setPreviewHtml(await previewInvoice(s)); }
    catch { setMsg({ kind: "err", text: "Could not render the preview." }); }
    finally { setBusy(false); }
  }

  async function sendTest() {
    if (!s) return;
    if (!/.+@.+\..+/.test(testTo)) { setMsg({ kind: "err", text: "Enter an e-mail address to send the sample to." }); return; }
    setBusy(true);
    const r = await sendTestInvoice(testTo, s);
    setBusy(false);
    setMsg(r.ok ? { kind: "ok", text: `Sample sent to ${testTo}.` } : { kind: "err", text: r.error ?? "Send failed." });
  }

  if (!s) {
    return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></div>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-primary" /> Invoice template
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={openPreview} disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-muted/40 border border-border disabled:opacity-50">
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPreview ? "Hide" : "Preview"}
            </button>
            <button onClick={save} disabled={busy || !dirty}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          </div>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          Sent automatically after every completed sale and renewal. Everything here appears on the member's copy.
        </p>
      </div>

      <AnimatePresence>
        {showPreview && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }}
                      className="overflow-hidden">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Live preview</span>
                <button onClick={openPreview} className="text-[11px] text-primary flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Refresh
                </button>
              </div>
              <iframe title="Invoice preview" srcDoc={previewHtml} sandbox=""
                      className="w-full bg-[#0d0d1a]" style={{ height: 560, border: 0 }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3.5">
        <Field label="Business name">
          <input value={s.businessName} onChange={(e) => set("businessName", e.target.value)} className={INPUT} />
        </Field>
        <Field label="Tagline" hint="One line under the name. Leave blank to omit.">
          <input value={s.tagline} onChange={(e) => set("tagline", e.target.value)} className={INPUT} />
        </Field>
        <Field label="Logo URL" hint="Shown at 44 px. Must be a public https address.">
          <input value={s.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} className={INPUT} inputMode="url" />
        </Field>
        <Field label="Support e-mail" hint="Where a member replies with a billing question.">
          <input value={s.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} className={INPUT} inputMode="email" />
        </Field>
        <Field label="Business address" hint="One line per row. Optional — many sole traders leave this blank.">
          <textarea value={s.addressLines.join("\n")} rows={3}
                    onChange={(e) => set("addressLines", e.target.value.split("\n"))}
                    className={`${INPUT} resize-none`} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3.5">
          <Field label="Accent colour" hint="Rules, totals and the button.">
            <div className="flex gap-2">
              <input type="color" value={s.accent} onChange={(e) => set("accent", e.target.value)}
                     className="w-11 h-[38px] rounded-lg border border-border bg-transparent p-1 shrink-0" />
              <input value={s.accent} onChange={(e) => set("accent", e.target.value)} className={`${INPUT} font-mono`} />
            </div>
          </Field>
          <Field label="Invoice number prefix" hint="e.g. SSWX-2026-0148">
            <input value={s.numberPrefix} onChange={(e) => set("numberPrefix", e.target.value.toUpperCase().slice(0, 8))}
                   className={`${INPUT} font-mono uppercase`} />
          </Field>
        </div>

        <Field label="E-mail subject" hint="{{business}} and {{number}} are filled in automatically.">
          <input value={s.emailSubject} onChange={(e) => set("emailSubject", e.target.value)} className={INPUT} />
        </Field>
        <Field label="Terms" hint="Small print above the footer.">
          <textarea value={s.terms} rows={2} onChange={(e) => set("terms", e.target.value)} className={`${INPUT} resize-none`} />
        </Field>
        <Field label="Closing note" hint="The last line the member reads.">
          <input value={s.footerNote} onChange={(e) => set("footerNote", e.target.value)} className={INPUT} />
        </Field>

        <label className="flex items-start gap-2.5 cursor-pointer pt-1">
          <input type="checkbox" checked={s.sendAutomatically}
                 onChange={(e) => set("sendAutomatically", e.target.checked)}
                 className="mt-0.5 w-4 h-4 shrink-0 accent-[#d9b775]" />
          <span className="text-[12.5px] text-muted-foreground">
            Send automatically after every sale and renewal.
            <span className="block text-[11px]">Turn this off to keep the template but stop the e-mails.</span>
          </span>
        </label>

        <div className="pt-1">
          <button onClick={() => { setS(DEFAULT_INVOICE_SETTINGS); setDirty(true); }}
                  className="text-[11.5px] text-muted-foreground hover:text-primary flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Reset to defaults
          </button>
        </div>
      </div>

      {/* Test send */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
          <Send className="w-4 h-4 text-primary" /> Send yourself a sample
        </h3>
        <p className="text-[11.5px] text-muted-foreground mb-3">
          Uses the settings above, saved or not — check it in a real inbox before it goes to a customer.
        </p>
        <div className="flex gap-2">
          <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com"
                 inputMode="email" className={INPUT} />
          <button onClick={sendTest} disabled={busy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold shrink-0 disabled:opacity-50"
                  style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {msg && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-xs flex items-center gap-1.5"
                    style={{ color: msg.kind === "ok" ? "#5fd9a8" : msg.kind === "err" ? "#f3a3a5" : ROYAL.dim }}>
            {msg.kind === "ok" ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            {msg.text}
          </motion.p>
        )}
      </AnimatePresence>

      {/* One-time setup */}
      <div className="rounded-xl p-4 text-[11.5px] leading-relaxed"
           style={{ background: "rgba(217,183,117,0.07)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.dim }}>
        <div className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: ROYAL.gold }}>
          <Info className="w-3.5 h-3.5" /> One-time setup, to turn on automatic sending
        </div>
        In Stripe → Developers → Webhooks, add an endpoint pointing at
        <code className="mx-1 px-1.5 py-0.5 rounded font-mono text-[10.5px]"
              style={{ background: "rgba(217,183,117,0.12)", color: ROYAL.gold }}>
          /functions/v1/invoice
        </code>
        subscribed to <strong>invoice.paid</strong> and <strong>checkout.session.completed</strong>, then save its
        signing secret as <strong>STRIPE_WEBHOOK_SECRET_INVOICE</strong> in the Supabase function settings. Until that
        exists the template still previews and test-sends, but nothing goes out automatically. Your existing Stripe
        webhook is untouched — this is a second, separate endpoint, so a mail failure can never affect a purchase.
      </div>
    </div>
  );
}

export default AdminInvoicesTab;
