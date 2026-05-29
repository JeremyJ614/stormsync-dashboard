import { useEffect, useState, useCallback, useSyncExternalStore } from "react";

export type Tier = 1 | 2 | 3 | 4;

export interface User {
  id: string;
  email: string;
  pin: string;
  name: string;
  tier: Tier;
  isAdmin: boolean;
  createdAt: string;
  enabledModules: string[];
  referrals: number;
  joinedAt: string;
  badges?: string[];
  customAnswers?: Record<string, string>;
}

export type QuestionType = "text" | "email" | "select" | "textarea" | "number" | "tel" | "date" | "checkbox";

export interface SignupQuestion {
  id: string;
  label: string;
  required: boolean;
  type: QuestionType;
  options?: string[];
  placeholder?: string;
}

export interface BadgeDef {
  id: string;
  label: string;
  color: string;
  description: string;
  group: "Role" | "Tier" | "Achievement";
}

export const ALL_BADGES: BadgeDef[] = [
  { id: "sswx-member", label: "SSWX Member", color: "#7B8FD9", description: "Verified StormSync community member.", group: "Role" },
  { id: "sswx-dept-head", label: "Department Head", color: "#22d3ee", description: "Leads a department within StormSync Media.", group: "Role" },
  { id: "sswx-exec-board", label: "Executive Board", color: "#fde047", description: "Member of the SSWX Executive Board.", group: "Role" },
  { id: "tier-1", label: "Tier 1", color: "#94a3b8", description: "Tier 1 subscriber.", group: "Tier" },
  { id: "tier-2", label: "Tier 2", color: "#22d3ee", description: "Tier 2 subscriber.", group: "Tier" },
  { id: "tier-3", label: "Tier 3", color: "#a855f7", description: "Tier 3 subscriber.", group: "Tier" },
  { id: "tier-4", label: "Tier 4 Elite", color: "#fde047", description: "Tier 4 elite subscriber with emergency line access.", group: "Tier" },
  { id: "founder", label: "Founder", color: "#fb923c", description: "Founding member of StormSync Media.", group: "Achievement" },
  { id: "storm-chaser", label: "Storm Chaser", color: "#ef4444", description: "Active field storm chaser.", group: "Achievement" },
  { id: "spotter", label: "Trained Spotter", color: "#4ade80", description: "Skywarn trained severe weather spotter.", group: "Achievement" },
];

const USERS_KEY = "stormsync_users_v1";
const CURRENT_KEY = "stormsync_current_user_v1";
const QUESTIONS_KEY = "stormsync_signup_questions_v1";
const EMERGENCY_PIN_KEY = "stormsync_emergency_pin_v1";

export const ALL_MODULES: { id: string; label: string; alwaysOn?: boolean }[] = [
  { id: "/", label: "Home", alwaysOn: true },
  { id: "/dashboard", label: "Dashboard" },
  { id: "/forecast", label: "Forecast" },
  { id: "/discussion", label: "Forecast Discussion" },
  { id: "/comparator", label: "Run Comparator" },
  { id: "/spc", label: "SPC Outlook" },
  { id: "/thunder", label: "Thunderstorm Probability" },
  { id: "/meso", label: "Mesoscale Discussion" },
  { id: "/ingredients", label: "Storm Ingredients" },
  { id: "/swti", label: "Threat Index" },
  { id: "/timing", label: "Severe Timing" },
  { id: "/warnings", label: "Warning Center" },
  { id: "/aqi", label: "AQI Forecast" },
  { id: "/hazards", label: "Hazards & Drought" },
  { id: "/summary", label: "Recent Summary" },
  { id: "/sswxcon", label: "SSWXCon Score" },
  { id: "/mosquito", label: "Mosquito Index" },
  { id: "/moon", label: "Moon & Astronomy" },
  { id: "/skygazing", label: "Star & Skygazing" },
  { id: "/aurora", label: "Aurora Forecast" },
  { id: "/lightning-globe", label: "Lightning Density" },
  { id: "/rotation", label: "Rotational Map" },
  { id: "/climatology", label: "Tornado Climatology" },
  { id: "/wpi", label: "Weather Pattern AI" },
  { id: "/duel", label: "AI Forecast Duel" },
  { id: "/glossary", label: "Weather Glossary" },
  { id: "/learn", label: "Weather Learn" },
  { id: "/chasing", label: "Storm Chasing" },
  { id: "/history", label: "Severe Weather History" },
  { id: "/loyalty", label: "Loyalty Dashboard" },
  { id: "/game", label: "Forecast Game" },
  { id: "/faq", label: "FAQ", alwaysOn: true },
  { id: "/contact", label: "Contact", alwaysOn: true },
];

export const DEFAULT_QUESTIONS: SignupQuestion[] = [
  { id: "name", label: "Full Name", required: true, type: "text" },
  { id: "email", label: "Email Address", required: true, type: "email" },
  { id: "pin", label: "4-Digit PIN", required: true, type: "text" },
  { id: "tier", label: "Tier", required: true, type: "select", options: ["1", "2", "3", "4"] },
];

const ADMIN_EMAIL = "JayMyers@StormSync.Media";
const ADMIN_PIN = "1337";

function seedAdmin(): User[] {
  return [{
    id: "admin-jay",
    email: ADMIN_EMAIL,
    pin: ADMIN_PIN,
    name: "Jay Myers",
    tier: 4,
    isAdmin: true,
    createdAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
    enabledModules: ALL_MODULES.map(m => m.id),
    referrals: 0,
    badges: ["sswx-exec-board", "tier-4", "founder"],
    customAnswers: {},
  }];
}

export function adminCreateUser(input: {
  name: string; email: string; pin: string; tier: Tier; isAdmin?: boolean; badges?: string[]; customAnswers?: Record<string, string>;
}): { ok: boolean; error?: string; user?: User } {
  if (!/^\d{4}$/.test(input.pin)) return { ok: false, error: "PIN must be exactly 4 digits" };
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(input.email)) return { ok: false, error: "Invalid email" };
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === input.email.toLowerCase())) {
    return { ok: false, error: "Email already registered" };
  }
  const tierMods = (t: Tier): string[] => {
    const base = ALL_MODULES.filter(m => m.alwaysOn).map(m => m.id);
    const tier1 = ["/", "/forecast", "/aqi", "/moon", "/skygazing", "/glossary", "/learn", "/dashboard"];
    const tier2 = [...tier1, "/spc", "/warnings", "/sswxcon", "/history", "/loyalty", "/game", "/lightning-globe", "/aurora"];
    const tier3 = [...tier2, "/thunder", "/meso", "/ingredients", "/swti", "/timing", "/hazards", "/summary", "/rotation", "/climatology", "/mosquito", "/chasing", "/comparator", "/wpi"];
    const tier4 = ALL_MODULES.map(m => m.id);
    const mods = t === 1 ? tier1 : t === 2 ? tier2 : t === 3 ? tier3 : tier4;
    return [...new Set([...base, ...mods])];
  };
  const user: User = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    email: input.email,
    pin: input.pin,
    name: input.name,
    tier: input.tier,
    isAdmin: !!input.isAdmin,
    createdAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
    enabledModules: tierMods(input.tier),
    referrals: 0,
    badges: input.badges ?? [`tier-${input.tier}`],
    customAnswers: input.customAnswers ?? {},
  };
  saveUsers([...users, user]);
  return { ok: true, user };
}

export function setUserBadges(userId: string, badgeIds: string[]) {
  const users = loadUsers().map(u => u.id === userId ? { ...u, badges: badgeIds } : u);
  saveUsers(users);
}

function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      const seeded = seedAdmin();
      localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as User[];
    if (!parsed.some(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase())) {
      const merged = [...parsed, ...seedAdmin()];
      localStorage.setItem(USERS_KEY, JSON.stringify(merged));
      return merged;
    }
    return parsed;
  } catch {
    return seedAdmin();
  }
}

function saveUsers(users: User[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  window.dispatchEvent(new Event("stormsync-auth-changed"));
}

function loadCurrent(): User | null {
  try {
    const id = localStorage.getItem(CURRENT_KEY);
    if (!id) return null;
    return loadUsers().find(u => u.id === id) ?? null;
  } catch { return null; }
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const handler = () => cb();
  window.addEventListener("stormsync-auth-changed", handler);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("stormsync-auth-changed", handler);
  };
}
function getSnapshot(): string {
  return localStorage.getItem(CURRENT_KEY) ?? "";
}
function getServerSnapshot() { return ""; }

export function useAuth() {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [user, setUser] = useState<User | null>(() => loadCurrent());

  useEffect(() => {
    const handler = () => setUser(loadCurrent());
    window.addEventListener("stormsync-auth-changed", handler);
    return () => window.removeEventListener("stormsync-auth-changed", handler);
  }, []);

  const login = useCallback((email: string, pin: string): { ok: boolean; error?: string } => {
    const users = loadUsers();
    const u = users.find(x => x.email.toLowerCase() === email.toLowerCase() && x.pin === pin);
    if (!u) return { ok: false, error: "Invalid email or PIN" };
    localStorage.setItem(CURRENT_KEY, u.id);
    window.dispatchEvent(new Event("stormsync-auth-changed"));
    setUser(u);
    return { ok: true };
  }, []);

  const signup = useCallback((data: { name: string; email: string; pin: string; tier: Tier }): { ok: boolean; error?: string } => {
    if (!/^\d{4}$/.test(data.pin)) return { ok: false, error: "PIN must be exactly 4 digits" };
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(data.email)) return { ok: false, error: "Invalid email" };
    const users = loadUsers();
    if (users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      return { ok: false, error: "Email already registered" };
    }
    const tierMods = (t: Tier): string[] => {
      const base = ALL_MODULES.filter(m => m.alwaysOn).map(m => m.id);
      const tier1 = ["/", "/forecast", "/aqi", "/moon", "/skygazing", "/glossary", "/learn", "/dashboard"];
      const tier2 = [...tier1, "/spc", "/warnings", "/sswxcon", "/history", "/loyalty", "/game", "/lightning-globe", "/aurora"];
      const tier3 = [...tier2, "/thunder", "/meso", "/ingredients", "/swti", "/timing", "/hazards", "/summary", "/rotation", "/climatology", "/mosquito", "/chasing", "/comparator", "/wpi"];
      const tier4 = ALL_MODULES.map(m => m.id);
      const mods = t === 1 ? tier1 : t === 2 ? tier2 : t === 3 ? tier3 : tier4;
      return [...new Set([...base, ...mods])];
    };
    const newUser: User = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      email: data.email,
      pin: data.pin,
      name: data.name,
      tier: data.tier,
      isAdmin: false,
      createdAt: new Date().toISOString(),
      joinedAt: new Date().toISOString(),
      enabledModules: tierMods(data.tier),
      referrals: 0,
    };
    saveUsers([...users, newUser]);
    localStorage.setItem(CURRENT_KEY, newUser.id);
    window.dispatchEvent(new Event("stormsync-auth-changed"));
    setUser(newUser);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(CURRENT_KEY);
    window.dispatchEvent(new Event("stormsync-auth-changed"));
    setUser(null);
  }, []);

  const monthsActive = user ? Math.max(1, Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / (30 * 24 * 60 * 60_000)) + 1) : 0;
  const loyaltyPoints = user ? monthsActive * 100 + user.referrals * 250 : 0;

  return { user, login, signup, logout, loyaltyPoints, monthsActive };
}

export function hasModuleAccess(user: User | null, path: string): boolean {
  const mod = ALL_MODULES.find(m => m.id === path);
  if (mod?.alwaysOn) return true;
  if (!user) return path === "/" || path === "/faq" || path === "/contact" || path === "/login";
  return user.enabledModules.includes(path);
}

export function listUsers(): User[] { return loadUsers(); }
export function persistUsers(users: User[]) { saveUsers(users); }
export function getQuestions(): SignupQuestion[] {
  try {
    const raw = localStorage.getItem(QUESTIONS_KEY);
    if (!raw) return DEFAULT_QUESTIONS;
    return JSON.parse(raw) as SignupQuestion[];
  } catch { return DEFAULT_QUESTIONS; }
}
export function saveQuestions(q: SignupQuestion[]) {
  localStorage.setItem(QUESTIONS_KEY, JSON.stringify(q));
}
export function getEmergencyPin(): string {
  return localStorage.getItem(EMERGENCY_PIN_KEY) ?? "0077";
}
export function saveEmergencyPin(p: string) {
  localStorage.setItem(EMERGENCY_PIN_KEY, p);
}
