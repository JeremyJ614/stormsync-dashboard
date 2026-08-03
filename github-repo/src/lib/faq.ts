/**
 * FAQ + Module-Guide store (P-16 / flexible rebuild). Backed by
 * `public.faq_categories` (editable category "pages") and `public.faq_entries`
 * (each entry has a free-form list of titled `sections`). RLS: public read,
 * admin write. When empty the app falls back to DEFAULT_FAQ so it's never blank.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface FaqSection { heading: string; body: string }
export interface FaqCategory { id: string; name: string; sortOrder: number }
export interface FaqEntry {
  id: string;
  categoryId: string | null;
  sortOrder: number;
  title: string;
  moduleId?: string;   // when set & starts with "/", the entry links to that module
  tier?: number;
  sections: FaqSection[];
}

// ── Categories ──────────────────────────────────────────────────────────────
export async function listCategories(): Promise<FaqCategory[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("faq_categories").select("*").order("sort_order");
  if (error) { logger.error("listCategories failed", { scope: "faq", error }); return []; }
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}
export async function createCategory(name: string, sortOrder: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("faq_categories").insert({ name, sort_order: sortOrder });
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function updateCategory(id: string, patch: { name?: string; sortOrder?: number }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  await supabase.from("faq_categories").update(row).eq("id", id);
}
export async function deleteCategory(id: string): Promise<void> {
  await supabase.from("faq_categories").delete().eq("id", id); // cascades to entries
}
export async function reorderCategories(items: { id: string; sortOrder: number }[]): Promise<void> {
  await Promise.all(items.map((c) => supabase.from("faq_categories").update({ sort_order: c.sortOrder }).eq("id", c.id)));
}

// ── Entries ─────────────────────────────────────────────────────────────────
interface Row {
  id: string; category_id: string | null; sort_order: number; title: string | null;
  module_id: string | null; tier: number | null; sections: FaqSection[] | null;
  question: string | null; label: string | null; kind: string | null;
}
const toEntry = (r: Row): FaqEntry => ({
  id: r.id, categoryId: r.category_id, sortOrder: r.sort_order,
  title: r.title ?? r.question ?? r.label ?? "",
  moduleId: r.module_id ?? undefined, tier: r.tier ?? undefined,
  sections: Array.isArray(r.sections) ? r.sections : [],
});
const toRow = (e: Partial<FaqEntry>) => ({
  category_id: e.categoryId ?? null,
  kind: e.moduleId ? "module" : "general", // legacy column kept satisfied
  sort_order: e.sortOrder ?? 0,
  title: e.title ?? null,
  module_id: e.moduleId ?? null,
  tier: e.tier ?? null,
  sections: e.sections ?? [],
  updated_at: new Date().toISOString(),
});

export async function listFaq(): Promise<FaqEntry[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("faq_entries").select("*").order("sort_order");
  if (error) { logger.error("listFaq failed", { scope: "faq", error }); throw error; }
  return (data ?? []).map((r) => toEntry(r as Row));
}
export async function createFaq(e: Partial<FaqEntry>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("faq_entries").insert(toRow(e));
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function updateFaq(id: string, e: Partial<FaqEntry>): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("faq_entries").update(toRow(e)).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function deleteFaq(id: string): Promise<void> {
  await supabase.from("faq_entries").delete().eq("id", id);
}
export async function reorderFaq(entries: { id: string; sortOrder: number }[]): Promise<void> {
  await Promise.all(entries.map((e) => supabase.from("faq_entries").update({ sort_order: e.sortOrder }).eq("id", e.id)));
}

import type { DefaultCategory } from "./faqDefaults";
/** Seed categories + entries from the shipped defaults so an admin edits a populated table. */
export async function seedFaqDefaults(defaults: DefaultCategory[]): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  // Ensure each category exists; map name → id.
  const existing = await listCategories();
  const byName = new Map(existing.map((c) => [c.name, c.id]));
  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i];
    if (!byName.has(d.name)) {
      await createCategory(d.name, i);
      const refreshed = await listCategories();
      const found = refreshed.find((c) => c.name === d.name);
      if (found) byName.set(d.name, found.id);
    }
  }
  const rows = defaults.flatMap((d) =>
    d.entries.map((e, i) => toRow({ categoryId: byName.get(d.name) ?? null, sortOrder: i, title: e.title, moduleId: e.moduleId, tier: e.tier, sections: e.sections })),
  );
  const { error } = await supabase.from("faq_entries").insert(rows);
  return error ? { ok: false, error: error.message } : { ok: true };
}
