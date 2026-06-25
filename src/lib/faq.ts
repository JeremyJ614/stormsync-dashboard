/**
 * FAQ + Module-Guide store (P-16) — backed by `public.faq_entries`
 * (RLS: public read, admin write). When the table is empty the app falls back
 * to DEFAULT_GENERAL / DEFAULT_MODULES so the FAQ is never blank.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type FaqKind = "general" | "module";

export interface FaqEntry {
  id: string;
  kind: FaqKind;
  sortOrder: number;
  // general
  question?: string;
  answer?: string;
  // module
  moduleId?: string;
  label?: string;
  tier?: number;
  description?: string;
  what?: string;
  howto?: string;
  tips?: string;
}

interface Row {
  id: string; kind: FaqKind; sort_order: number;
  question: string | null; answer: string | null;
  module_id: string | null; label: string | null; tier: number | null;
  description: string | null; what: string | null; howto: string | null; tips: string | null;
}

const toEntry = (r: Row): FaqEntry => ({
  id: r.id, kind: r.kind, sortOrder: r.sort_order,
  question: r.question ?? undefined, answer: r.answer ?? undefined,
  moduleId: r.module_id ?? undefined, label: r.label ?? undefined, tier: r.tier ?? undefined,
  description: r.description ?? undefined, what: r.what ?? undefined, howto: r.howto ?? undefined, tips: r.tips ?? undefined,
});

const toRow = (e: Partial<FaqEntry>) => ({
  kind: e.kind, sort_order: e.sortOrder ?? 0,
  question: e.question ?? null, answer: e.answer ?? null,
  module_id: e.moduleId ?? null, label: e.label ?? null, tier: e.tier ?? null,
  description: e.description ?? null, what: e.what ?? null, howto: e.howto ?? null, tips: e.tips ?? null,
  updated_at: new Date().toISOString(),
});

export async function listFaq(): Promise<FaqEntry[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("faq_entries").select("*").order("kind").order("sort_order");
  if (error) { logger.error("listFaq failed", { scope: "faq", error }); throw error; }
  return (data ?? []).map((r) => toEntry(r as Row));
}

export async function createFaq(e: Partial<FaqEntry>): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("faq_entries").insert(toRow(e));
  if (error) { logger.error("createFaq failed", { scope: "faq", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function updateFaq(id: string, e: Partial<FaqEntry>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("faq_entries").update(toRow(e)).eq("id", id);
  if (error) { logger.error("updateFaq failed", { scope: "faq", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function deleteFaq(id: string): Promise<void> {
  const { error } = await supabase.from("faq_entries").delete().eq("id", id);
  if (error) logger.error("deleteFaq failed", { scope: "faq", error });
}

/** Persist a new ordering by writing each row's sort_order. */
export async function reorderFaq(entries: { id: string; sortOrder: number }[]): Promise<void> {
  await Promise.all(entries.map((e) =>
    supabase.from("faq_entries").update({ sort_order: e.sortOrder }).eq("id", e.id),
  ));
}

/** Bulk-insert the shipped defaults so an admin can edit from a populated table. */
export async function seedFaqDefaults(
  general: { q: string; a: string }[],
  modules: { id: string; label: string; tier: number; desc: string; what: string; how: string; tips?: string }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const rows = [
    ...general.map((g, i) => toRow({ kind: "general", sortOrder: i, question: g.q, answer: g.a })),
    ...modules.map((m, i) => toRow({ kind: "module", sortOrder: i, moduleId: m.id, label: m.label, tier: m.tier, description: m.desc, what: m.what, howto: m.how, tips: m.tips })),
  ];
  const { error } = await supabase.from("faq_entries").insert(rows);
  if (error) { logger.error("seedFaqDefaults failed", { scope: "faq", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}
