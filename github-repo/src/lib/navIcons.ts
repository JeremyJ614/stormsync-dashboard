/**
 * Icons for navigation.
 *
 * Module icons come from the nav model. Section icons cannot: section names are
 * admin-editable free text ("Severe Weather", "The Other Section"), so there is
 * nothing stable to key a lookup on. Instead the name is matched against a small
 * keyword table, most specific first, and anything unrecognised falls back to a
 * neutral mark rather than to something confidently wrong.
 */
import type { LucideIcon } from "lucide-react";
import {
  Tornado, CloudSun, Wind, Sparkles, Satellite, GraduationCap,
  Users, CreditCard, Compass, Snowflake, Flame, Waves, Radar,
  Bug, Trophy, LayoutGrid,
} from "lucide-react";

/** Ordered most specific first — the first substring that matches wins. */
const SECTION_KEYWORDS: [RegExp, LucideIcon][] = [
  [/severe|storm|tornado|warning/i, Tornado],
  [/winter|snow|ice/i,              Snowflake],
  [/fire|burn/i,                    Flame],
  [/river|flood|water|marine/i,     Waves],
  [/radar|model|technolog|mrms|satellite|data/i, Satellite],
  [/astro|sky|space|aurora|moon|star/i, Sparkles],
  [/educat|inform|learn|glossary|faq|guide/i, GraduationCap],
  [/account|plan|billing|subscri|profile/i, CreditCard],
  [/communit|social|game|trivia|loyalt/i, Trophy],
  [/forecast|outlook|predict/i,     CloudSun],
  [/air|aqi|pollen|wind/i,          Wind],
  [/advanced|tool|chase/i,          Compass],
  [/environment|earth|hazard|drought/i, Radar],
  [/mosquito|bug|pest/i,            Bug],
  [/member|user|people/i,           Users],
];

/**
 * The icon for a section, chosen from its name.
 *
 * `fallback` is the section's first module icon where the caller has one — a
 * section of nothing but radar pages reads better as a radar than as a generic
 * grid, even when its name says nothing useful.
 */
export function sectionIcon(name: string, fallback?: LucideIcon): LucideIcon {
  for (const [re, icon] of SECTION_KEYWORDS) if (re.test(name)) return icon;
  return fallback ?? LayoutGrid;
}
