/**
 * Contact / Customer-Service / Emergency submissions (Phase 7 — moves the
 * contact inbox off browser-localStorage onto `public.contact_submissions`).
 *
 * RLS: anyone may INSERT (the public forms); only admins may read/update/delete.
 * The emergency `relay` Edge Function writes here too, so relayed emergencies
 * now appear in the admin inbox alongside the other channels.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type ContactKind = "contact" | "customer-service" | "emergency";

export interface ContactSubmissionRow {
  id: string;
  kind: ContactKind;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

export async function submitContact(input: { kind: ContactKind; name: string; email?: string; phone?: string; message: string }): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("contact_submissions").insert({
    kind: input.kind, name: input.name, email: input.email ?? null, phone: input.phone ?? null, message: input.message,
  });
  if (error) { logger.error("submitContact failed", { scope: "contact", error }); return { ok: false, error: "Could not send. Try again." }; }
  return { ok: true };
}

export async function listContactSubmissions(): Promise<ContactSubmissionRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("contact_submissions")
    .select("id,kind,name,email,phone,message,read,created_at")
    .order("created_at", { ascending: false });
  if (error) { logger.error("listContactSubmissions failed", { scope: "contact", error }); throw error; }
  return (data ?? []).map((r: { id: string; kind: ContactKind; name: string; email: string | null; phone: string | null; message: string; read: boolean; created_at: string }) =>
    ({ id: r.id, kind: r.kind, name: r.name, email: r.email, phone: r.phone, message: r.message, read: r.read, createdAt: r.created_at }));
}

export async function markContactRead(id: string): Promise<void> {
  const { error } = await supabase.from("contact_submissions").update({ read: true }).eq("id", id);
  if (error) logger.error("markContactRead failed", { scope: "contact", error });
}
export async function deleteContactSubmission(id: string): Promise<void> {
  const { error } = await supabase.from("contact_submissions").delete().eq("id", id);
  if (error) logger.error("deleteContactSubmission failed", { scope: "contact", error });
}
