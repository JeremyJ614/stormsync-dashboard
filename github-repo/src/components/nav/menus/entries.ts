import type { LucideIcon } from "lucide-react";
import type { MenuNav } from "./useMenuNav";

/**
 * The one list a menu actually draws.
 *
 * Every style presents the same two levels — sections, then the modules inside
 * the chosen one — and every style was deriving that list itself, with its own
 * small differences in what it called the fields. This flattens the current
 * level into one shape so a menu can concentrate on how it looks, and so a
 * change to the traversal happens once.
 */
export interface MenuEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  /** A route, for a module. Null for a section, which drills in instead. */
  to: string | null;
  locked: boolean;
  /** Index into `nav.sections`, or −1 for a module. */
  index: number;
  /** How many modules a section holds. 0 for a module. */
  count: number;
}

export function entriesFor(nav: MenuNav): MenuEntry[] {
  const { current, sections } = nav;
  return current
    ? current.items.map((it) => ({
        key: it.path, label: it.label, icon: it.icon,
        to: it.path as string | null, locked: Boolean(it.locked), index: -1, count: 0,
      }))
    : sections.map((s, i) => ({
        key: s.label, label: s.label, icon: s.icon,
        to: null as string | null, locked: false, index: i, count: s.items.length,
      }));
}

/** Total modules across every visible section — the figure menus like to show. */
export function moduleCount(nav: MenuNav): number {
  return nav.sections.reduce((n, s) => n + s.items.length, 0);
}
