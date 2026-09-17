/**
 * Invoice template settings.
 *
 * Stored as one `billing_config` row so it edits like the other billing config
 * and needs no new table. Rendering and sending live in the `invoice` edge
 * function — the browser never touches the mail key.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface InvoiceSettings {
  businessName: string;
  tagline: string;
  addressLines: string[];
  supportEmail: string;
  logoUrl: string;
  accent: string;
  footerNote: string;
  terms: string;
  emailSubject: string;
  numberPrefix: string;
  sendAutomatically: boolean;
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  businessName: "StormSync Media",
  tagline: "Severe weather intelligence",
  addressLines: [],
  supportEmail: "jaywx@yahoo.com",
  logoUrl: "https://vip.sswx.space/img/logo.webp",
  accent: "#d9b775",
  footerNote: "Thank you for supporting independent weather coverage.",
  terms: "Charges are billed by Stripe. Manage or cancel any time from Subscription inside the app.",
  emailSubject: "Your {{business}} invoice {{number}}",
  numberPrefix: "SSWX",
  sendAutomatically: true,
};

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  if (!isSupabaseConfigured) return DEFAULT_INVOICE_SETTINGS;
  const { data, error } = await supabase.from("billing_config").select("value").eq("key", "invoice_settings").maybeSingle();
  if (error || !data?.value) return DEFAULT_INVOICE_SETTINGS;
  return { ...DEFAULT_INVOICE_SETTINGS, ...(data.value as Partial<InvoiceSettings>) };
}

export async function saveInvoiceSettings(v: InvoiceSettings): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("billing_config")
    .upsert({ key: "invoice_settings", value: v, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) { logger.error("saveInvoiceSettings failed", { scope: "billing", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

/** Rendered HTML for the live preview, using unsaved edits. */
export async function previewInvoice(settings: InvoiceSettings): Promise<string> {
  const { data, error } = await supabase.functions.invoke("invoice", { body: { mode: "preview", settings } });
  if (error) throw error;
  return typeof data === "string" ? data : String(data ?? "");
}

export async function sendTestInvoice(to: string, settings: InvoiceSettings): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("invoice", { body: { mode: "test", to, settings } });
  if (error) return { ok: false, error: "Could not reach the invoice service." };
  return data?.ok ? { ok: true } : { ok: false, error: data?.error ?? "Send failed." };
}
