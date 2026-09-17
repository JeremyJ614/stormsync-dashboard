/**
 * How the admin panel organises its own tabs.
 *
 * The tab strip used to be a hardcoded array, which meant fifteen tabs in one
 * flat row and no way to change that without a deploy. The layout now lives in
 * `app_config` under `admin_groups`, so the panel can be reorganised from
 * inside the panel.
 *
 * The tab *registry* is still code — a tab exists because a component exists —
 * but which group it sits in and in what order is data. Tabs the saved layout
 * has never seen fall into "Everything else" rather than disappearing, so
 * adding a tab in code can never silently hide it.
 */
import { supabase } from "./supabase";
import { logger } from "./logger";

export interface AdminGroup {
  id: string;
  label: string;
  tabs: string[];
}

export interface AdminLayout {
  groups: AdminGroup[];
}

export const DEFAULT_LAYOUT: AdminLayout = {
  groups: [
    { id: "people",  label: "People",   tabs: ["users", "signups", "alerts", "points", "badges"] },
    { id: "money",   label: "Money",    tabs: ["money", "billing", "invoices"] },
    { id: "content", label: "Content",  tabs: ["news", "faq", "trivia", "broadcasts", "inbox"] },
    { id: "system",  label: "System",   tabs: ["health", "usage", "audit", "nav", "modules", "settings"] },
  ],
};

const KEY = "admin_groups";

export async function getAdminLayout(): Promise<AdminLayout> {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", KEY).maybeSingle();
  if (error || !data?.value) return DEFAULT_LAYOUT;
  const v = data.value as Partial<AdminLayout>;
  if (!Array.isArray(v.groups) || v.groups.length === 0) return DEFAULT_LAYOUT;
  return { groups: v.groups.filter((g) => g && typeof g.id === "string" && Array.isArray(g.tabs)) };
}

export async function saveAdminLayout(layout: AdminLayout): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: KEY, value: layout, is_public: false }, { onConflict: "key" });
  if (error) {
    logger.error("saveAdminLayout failed", { scope: "admin", error });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Fold the saved layout together with the tabs that actually exist.
 *
 * Ordering follows the layout; anything the layout has not placed is appended
 * under "Everything else". A tab in the layout whose component has been removed
 * is dropped silently — that one is safe, because there is nothing to show.
 */
export function resolveLayout(
  layout: AdminLayout,
  known: { id: string; label: string }[],
): { id: string; label: string; tabs: { id: string; label: string }[] }[] {
  const byId = new Map(known.map((t) => [t.id, t]));
  const placed = new Set<string>();
  const groups = layout.groups.map((g) => {
    const tabs = g.tabs.flatMap((id) => {
      const t = byId.get(id);
      if (!t) return [];
      placed.add(id);
      return [t];
    });
    return { id: g.id, label: g.label, tabs };
  });

  const leftovers = known.filter((t) => !placed.has(t.id));
  if (leftovers.length) {
    groups.push({ id: "__rest", label: "Everything else", tabs: leftovers });
  }
  return groups.filter((g) => g.tabs.length > 0);
}
