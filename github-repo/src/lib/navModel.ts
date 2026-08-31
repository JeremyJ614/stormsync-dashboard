/**
 * The navigation model: the sections, their modules, and who may see them.
 *
 * This lives outside Layout because the sidebar is no longer the only thing
 * that renders it. The five menu styles (Golden Spiral, Gooey FAB, Canvas Push,
 * Holographic Fan, Singularity) all present the same two levels — section, then
 * the modules inside it — and they must agree with the sidebar about what a
 * member can actually see. One model, five presentations.
 */
import { useMemo, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, CalendarDays, MessageSquare, Zap, Layers,
  Brain, Swords, BookOpen, FlaskConical,
  Moon, Wind, BarChart3, Activity, AlertCircle,
  Map, Tornado, Sparkles,
  Bug, Globe, Home, HelpCircle, Mail, Shield, Trophy,
  Gamepad2, Satellite, Target, RotateCcw, ShieldAlert, ScanSearch,
  GitCompareArrows, Radar, Waypoints, History, Compass,
  BookMarked, CloudRain, Sun, Waves, CreditCard, Flame, Snowflake, Video,
} from "lucide-react";
import { subscribeNav, getNavSnapshot, getNavServerSnapshot } from "./navConfig";
import { hasModuleAccess, navVisible, ALL_MODULES, type User } from "../hooks/useAuth";
import { sectionIcon } from "./navIcons";

export interface NavEntry { label: string; path: string; icon: LucideIcon; locked?: boolean }
export interface NavSection { label: string; icon: LucideIcon; items: NavEntry[] }

export const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { label: "Home",                path: "/",           icon: Home },
      { label: "Dashboard",           path: "/dashboard",  icon: LayoutDashboard },
      { label: "Daily Brief & Forecast", path: "/forecast",   icon: CalendarDays },
      { label: "Forecast Discussion", path: "/discussion", icon: MessageSquare },
      { label: "AQI Forecast",        path: "/aqi",        icon: Wind },
      { label: "Daylight Tracker",      path: "/summary",    icon: Sun },
    ],
  },
  {
    label: "Severe Weather",
    items: [
      { label: "SSWXCon Score",           path: "/sswxcon",     icon: Activity },
      { label: "Warnings & Reports",      path: "/warnings",    icon: AlertCircle },
      { label: "SPC Outlook",             path: "/spc",         icon: ShieldAlert },
      { label: "Mesoscale Discussions",   path: "/meso",        icon: ScanSearch },
      { label: "Atmosphere Ingredients",  path: "/ingredients", icon: FlaskConical },
      { label: "Severe Threat Index",     path: "/swti",        icon: Shield },
      { label: "Storm Timing",            path: "/timing",      icon: BarChart3 },
      { label: "Thunderstorm Probability",path: "/thunder",     icon: CloudRain },
      { label: "Hurricane Tracker",       path: "/hurricane",   icon: Wind },
    ],
  },
  {
    label: "Environmental & Model Data",
    items: [
      { label: "Model Runs",       path: "/comparator",      icon: GitCompareArrows },
      { label: "Lightning Monitor",path: "/lightning-globe", icon: Zap },
      { label: "Radar & MRMS",     path: "/rotation",        icon: Radar },
      { label: "Hazards & Drought",path: "/hazards",         icon: Map },
      { label: "River & Flood Gauges", path: "/rivers",     icon: Waves },
      { label: "Fire Weather",     path: "/fire",            icon: Flame },
      { label: "Winter Center",      path: "/winter",   icon: Snowflake },
      { label: "Traffic Cameras",    path: "/cameras",  icon: Video },
      { label: "Tornado Climatology",path:"/climatology",    icon: History },
    ],
  },
  {
    label: "Astro Panel",
    items: [
      { label: "Moon & Astronomy",   path: "/moon",      icon: Moon },
      { label: "Aurora & Star Gazing", path: "/aurora", icon: Sparkles },
    ],
  },
  {
    label: "Advanced Tools",
    items: [
      { label: "Storm Chasing",        path: "/chasing",  icon: Compass },
      { label: "Mosquito Index",       path: "/mosquito", icon: Bug },
      { label: "Weather Patterns",     path: "/wpi",      icon: Waypoints },
      { label: "AI Knowledge Battle",  path: "/duel",     icon: Swords },
      { label: "Severe Weather History",path:"/history",  icon: BookMarked },
    ],
  },
  {
    label: "Everything Else",
    items: [
      { label: "Forecast Game",     path: "/game",     icon: Gamepad2 },
      { label: "Daily Trivia",      path: "/trivia",   icon: Brain },
      { label: "Loyalty Dashboard", path: "/loyalty",  icon: Trophy },
      { label: "Weather Glossary",  path: "/glossary", icon: BookOpen },
      { label: "Subscription",      path: "/subscription", icon: CreditCard },
      { label: "FAQ",               path: "/faq",      icon: HelpCircle },
      { label: "Contact Us",        path: "/contact",  icon: Mail },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

// Icon lookup so DB-driven modules keep their icon; unknown ids fall back.
export const ICON_BY_PATH: Record<string, LucideIcon> = Object.fromEntries(
  ALL_NAV_ITEMS.map(i => [i.path, i.icon as LucideIcon]),
);

/**
 * The sections a given member should actually see, in order.
 *
 * Structure comes from the admin-managed DB config; until that loads (or if it
 * fails) the hardcoded NAV_SECTIONS render instead, so navigation is never
 * blank. `locked` marks a module that is visible but not in the member's plan —
 * every menu style shows those rather than hiding them, because the catalogue
 * being browsable is the point.
 */
export function useNavSections(user: User | null): NavSection[] {
  const navCfg = useSyncExternalStore(subscribeNav, getNavSnapshot, getNavServerSnapshot);

  return useMemo(() => {
    if (!navCfg.loaded || navCfg.sections.length === 0) {
      return NAV_SECTIONS.map((sec) => ({
        ...sec,
        icon: sectionIcon(sec.label, sec.items[0]?.icon as LucideIcon | undefined),
        items: sec.items
          .filter((item) => navVisible(user, item.path))
          .map((item) => ({ ...item, locked: !hasModuleAccess(user, item.path) })),
      })).filter((sec) => sec.items.length > 0);
    }
    const known = new Set(ALL_MODULES.map((m) => m.id));
    return [...navCfg.sections]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((sec) => ({
        label: sec.name,
        icon: sectionIcon(sec.name, ICON_BY_PATH[navCfg.modules.find((m) => m.sectionId === sec.id)?.moduleId ?? ""]),
        items: navCfg.modules
          .filter((m) => m.sectionId === sec.id && known.has(m.moduleId) && navVisible(user, m.moduleId))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((m) => ({
            label: m.label ?? ALL_MODULES.find((x) => x.id === m.moduleId)?.label ?? m.moduleId,
            path: m.moduleId,
            icon: ICON_BY_PATH[m.moduleId] ?? Layers,
            locked: !hasModuleAccess(user, m.moduleId),
          })),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [user, navCfg]);
}
