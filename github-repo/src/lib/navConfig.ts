/**
 * DB-driven sidebar configuration (P-2.1).
 *
 * Section names/order, module placement/order, label overrides, visibility and
 * admin-only flags live in `public.nav_sections` / `public.nav_modules` so an
 * admin can restructure the sidebar without a deploy.
 *
 * Loaded once into a module-level snapshot at boot (same pattern as the auth
 * store) so `hasModuleAccess` can stay a synchronous function. Until it resolves —
 * or if it fails — callers fall back to the hardcoded defaults in Layout.tsx, so
 * the sidebar is never blank and routing never breaks.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface NavSection { id: string; name: string; sortOrder: number }
export interface NavModule {
  id: string;
  moduleId: string;
  label: string | null;
  sectionId: string | null;
  sortOrder: number;
  visible: boolean;
  adminOnly: boolean;
}
export interface NavConfig { sections: NavSection[]; modules: NavModule[]; loaded: boolean }

let snapshot: NavConfig = { sections: [], modules: [], loaded: false };
const listeners = new Set<() => void>();
const emit = (next: NavConfig) => { snapshot = next; listeners.forEach((l) => l()); };

export function getNavSnapshot(): NavConfig { return snapshot; }
export function subscribeNav(cb: () => void): () => void {
  listeners.add(cb);
  void loadNavConfig();
  return () => { listeners.delete(cb); };
}
const SERVER_SNAPSHOT: NavConfig = { sections: [], modules: [], loaded: false };
export function getNavServerSnapshot(): NavConfig { return SERVER_SNAPSHOT; }

let inflight: Promise<void> | null = null;
export function loadNavConfig(force = false): Promise<void> {
  if (!isSupabaseConfigured) return Promise.resolve();
  if (!force && (snapshot.loaded || inflight)) return inflight ?? Promise.resolve();
  inflight = (async () => {
    try {
      const [{ data: secs }, { data: mods }] = await Promise.all([
        supabase.from("nav_sections").select("id,name,sort_order").order("sort_order"),
        supabase.from("nav_modules").select("id,module_id,label,section_id,sort_order,visible,admin_only").order("sort_order"),
      ]);
      emit({
        sections: (secs ?? []).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order })),
        modules: (mods ?? []).map((r) => ({
          id: r.id, moduleId: r.module_id, label: r.label, sectionId: r.section_id,
          sortOrder: r.sort_order, visible: r.visible, adminOnly: r.admin_only,
        })),
        loaded: true,
      });
    } catch (error) {
      logger.error("loadNavConfig failed", { scope: "nav", error });
      emit({ ...snapshot, loaded: true }); // fall back to code defaults
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Sync lookup used by gating. Returns undefined when config isn't loaded. */
export function navOverrideFor(moduleId: string): NavModule | undefined {
  if (!snapshot.loaded) return undefined;
  return snapshot.modules.find((m) => m.moduleId === moduleId);
}

// ─── Admin mutations ─────────────────────────────────────────────────────────
export async function createSection(name: string, sortOrder: number) {
  const { error } = await supabase.from("nav_sections").insert({ name, sort_order: sortOrder });
  await loadNavConfig(true);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function renameSection(id: string, name: string) {
  await supabase.from("nav_sections").update({ name }).eq("id", id);
  await loadNavConfig(true);
}
export async function deleteSection(id: string) {
  // modules fall to "Unassigned" (section_id -> null) rather than disappearing
  await supabase.from("nav_sections").delete().eq("id", id);
  await loadNavConfig(true);
}
export async function reorderSections(items: { id: string; sortOrder: number }[]) {
  await Promise.all(items.map((s) => supabase.from("nav_sections").update({ sort_order: s.sortOrder }).eq("id", s.id)));
  await loadNavConfig(true);
}
export async function updateNavModule(id: string, patch: Partial<Pick<NavModule, "label" | "sectionId" | "sortOrder" | "visible" | "adminOnly">>) {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.sectionId !== undefined) row.section_id = patch.sectionId;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.visible !== undefined) row.visible = patch.visible;
  if (patch.adminOnly !== undefined) row.admin_only = patch.adminOnly;
  await supabase.from("nav_modules").update(row).eq("id", id);
  await loadNavConfig(true);
}
export async function reorderNavModules(items: { id: string; sortOrder: number }[]) {
  await Promise.all(items.map((m) => supabase.from("nav_modules").update({ sort_order: m.sortOrder }).eq("id", m.id)));
  await loadNavConfig(true);
}
/** Insert rows for any code-registry module missing from the table. */
export async function syncMissingModules(all: { id: string; label: string }[]) {
  const have = new Set(snapshot.modules.map((m) => m.moduleId));
  const missing = all.filter((m) => !have.has(m.id));
  if (!missing.length) return 0;
  await supabase.from("nav_modules").insert(
    missing.map((m, i) => ({ module_id: m.id, label: m.label, section_id: null, sort_order: 900 + i, visible: true, admin_only: false })),
  );
  await loadNavConfig(true);
  return missing.length;
}
