/**
 * The icon a badge wears.
 *
 * A curated set rather than all of lucide: the map is what gets bundled, and
 * an open-ended lookup would either pull in the whole icon library or need a
 * dynamic import per badge. Twenty-five covers everything the catalogue awards
 * for, and adding one is a line here plus a line in the admin picker.
 */
import {
  Award, Bell, BellRing, Brain, Calendar, Compass, Crown, Droplets, Flame, Gem,
  Heart, Layers, MapPin, Moon, Mountain, Radio, Route, Shield, Snowflake,
  Sparkles, Star, Sun, Target, Ticket, Tornado, Trophy, Users, Wind, Zap,
  type LucideIcon,
} from "lucide-react";

export const BADGE_ICONS: Record<string, LucideIcon> = {
  award: Award, bell: Bell, "bell-ring": BellRing, brain: Brain,
  calendar: Calendar, compass: Compass, crown: Crown, droplets: Droplets,
  flame: Flame, gem: Gem, heart: Heart, layers: Layers, "map-pin": MapPin,
  moon: Moon, mountain: Mountain, radio: Radio, route: Route, shield: Shield,
  snowflake: Snowflake, sparkles: Sparkles, star: Star, sun: Sun,
  target: Target, ticket: Ticket, tornado: Tornado, trophy: Trophy,
  users: Users, wind: Wind, zap: Zap,
};

export const BADGE_ICON_NAMES = Object.keys(BADGE_ICONS);

export const iconFor = (name: string | null | undefined): LucideIcon =>
  (name && BADGE_ICONS[name]) || Award;

export type BadgeRarity = "common" | "rare" | "epic" | "legendary";

export const RARITY: { key: BadgeRarity; label: string; blurb: string }[] = [
  { key: "common",    label: "Common",    blurb: "A plain rim." },
  { key: "rare",      label: "Rare",      blurb: "Brighter, with a glow." },
  { key: "epic",      label: "Epic",      blurb: "Double rim." },
  { key: "legendary", label: "Legendary", blurb: "Double rim and a turning light." },
];
