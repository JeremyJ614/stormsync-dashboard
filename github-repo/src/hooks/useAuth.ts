import { useCallback, useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { logger } from "../lib/logger";
import { navOverrideFor } from "../lib/navConfig";

export type Tier = 1 | 2 | 3 | 4;

export interface User {
  id: string;
  email: string;
  name: string;
  tier: Tier;
  isAdmin: boolean;
  createdAt: string;
  enabledModules: string[];
  referrals: number;
  joinedAt: string;
  badges: string[];
  customAnswers: Record<string, string>;
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

// `adminOnly` modules are visible and reachable ONLY for admins — they are hidden
// from every non-admin (not shown as "locked"), and excluded from the purchasable
// bundle/add-on lists in the billing admin so they can never be sold.
export const ALL_MODULES: { id: string; label: string; alwaysOn?: boolean; adminOnly?: boolean }[] = [
  { id: "/", label: "Home", alwaysOn: true },
  { id: "/dashboard", label: "Dashboard" },
  { id: "/forecast", label: "Forecast" },
  { id: "/discussion", label: "Forecast Discussion" },
  { id: "/comparator", label: "Run Comparator" },
  { id: "/spc", label: "SPC Outlook" },
  { id: "/thunder", label: "Thunderstorm Probability" },
  { id: "/hurricane", label: "Hurricane Tracker" },
  { id: "/meso", label: "Mesoscale Discussion" },
  { id: "/ingredients", label: "Storm Ingredients" },
  { id: "/swti", label: "Threat Index" },
  { id: "/timing", label: "Severe Timing" },
  { id: "/warnings", label: "Warning Center" },
  { id: "/aqi", label: "AQI Forecast" },
  { id: "/hazards", label: "Hazards & Drought" },
  { id: "/summary", label: "Daylight Tracker" },
  { id: "/sswxcon", label: "SSWXCon Score" },
  { id: "/mosquito", label: "Mosquito Index" },
  { id: "/moon", label: "Moon & Astronomy" },
  { id: "/aurora", label: "Aurora & Star Gazing" },
  { id: "/lightning-globe", label: "Lightning Density" },
  { id: "/rotation", label: "Radar & MRMS" },
  { id: "/climatology", label: "Tornado Climatology" },
  { id: "/wpi", label: "Weather Pattern AI" },
  { id: "/duel", label: "AI Forecast Duel" },
  { id: "/glossary", label: "Weather Glossary" },
  { id: "/chasing", label: "Storm Chasing", adminOnly: true },
  { id: "/history", label: "Severe Weather History" },
  { id: "/loyalty", label: "Loyalty Dashboard" },
  { id: "/game", label: "Forecast Game" },
  { id: "/trivia", label: "Daily Trivia" },
  { id: "/faq", label: "FAQ", alwaysOn: true },
  { id: "/contact", label: "Contact", alwaysOn: true },
];

// Modules that are built but intentionally hidden before launch. Delete the id
// from this set to re-enable it everywhere at once — sidebar, admin module
// toggles, FAQ guide, and routing all consult it. (AI Forecast Duel / U-18 is
// parked here until we settle its cost model post-launch.)
export const HIDDEN_MODULES = new Set<string>(["/duel"]);

// Core questions are rendered natively by the signup form; tier is intentionally
// absent — tiers are admin-assigned (§7.4 / D-01), never self-selected.
export const DEFAULT_QUESTIONS: SignupQuestion[] = [
  { id: "name", label: "Full Name", required: true, type: "text" },
  { id: "email", label: "Email Address", required: true, type: "email" },
  { id: "pin", label: "4-Digit PIN", required: true, type: "text" },
];

/**
 * The shape of a row from `public.profiles`. Auth credentials (the PIN) live in
 * Supabase Auth (`auth.users`), never here — so there is no `pin` column.
 */
export interface ProfileRow {
  id: string;
  email: string;
  name: string;
  tier: number;
  is_admin: boolean;
  enabled_modules: string[] | null;
  referrals: number | null;
  badges: string[] | null;
  custom_answers: Record<string, string> | null;
  joined_at: string;
  created_at: string;
}

export function rowToUser(r: ProfileRow): User {
  const tier = (r.tier >= 1 && r.tier <= 4 ? r.tier : 1) as Tier;
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    tier,
    isAdmin: r.is_admin,
    enabledModules: r.enabled_modules ?? [],
    referrals: r.referrals ?? 0,
    badges: r.badges ?? [],
    customAnswers: r.custom_answers ?? {},
    joinedAt: r.joined_at,
    createdAt: r.created_at,
  };
}

/**
 * Members sign in with a 4-digit PIN, but Supabase Auth enforces a 6-character
 * minimum password (a project-level setting we cannot change from here). We
 * deterministically expand the PIN into the actual Supabase password. The member
 * only ever types their PIN; effective security is identical to a raw 4-digit PIN.
 *
 * NOTE: the `admin-users` Edge Function must use this exact same transformation
 * when creating accounts or resetting PINs, or logins will not match.
 */
export function pinToPassword(pin: string): string {
  return `pin_${pin}_sswx`;
}

// ─── Shared auth store (one session/profile fetch shared by all components) ──────
interface AuthState {
  user: User | null;
  loading: boolean;
  /**
   * Set when we hold a VALID session but could not load the profile row.
   *
   * This is deliberately distinct from `user: null`. Previously any failure —
   * including the database being unreachable — collapsed into a null user, so a
   * PostgREST outage rendered the app as "signed out" even though sign-in had
   * genuinely succeeded. That is the worst possible message: it sends people to
   * retype passwords that were never wrong. Now the session is kept and the UI
   * can say the backend is unreachable.
   */
  backendDown: boolean;
}

let state: AuthState = { user: null, loading: isSupabaseConfigured, backendDown: false };
const listeners = new Set<() => void>();

function emit(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

type ProfileLoad =
  | { ok: true; user: User | null }     // reached the DB; user may legitimately not exist
  | { ok: false };                      // could not reach the DB at all

/** Loads the profile, retrying briefly so a momentary blip doesn't look like a logout. */
async function loadProfile(userId: string): Promise<ProfileLoad> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!error) return { ok: true, user: data ? rowToUser(data as ProfileRow) : null };
    logger.error("Failed to load profile", { scope: "auth", error, attempt });
    // 500/503 from the API gateway means PostgREST is down, not that the row is
    // missing — worth waiting out. Back off 0.4s, 1.2s.
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt * 2 + 1)));
  }
  return { ok: false };
}

let initialized = false;
function init() {
  if (initialized) return;
  initialized = true;
  if (!isSupabaseConfigured) {
    emit({ user: null, loading: false, backendDown: false });
    return;
  }
  // onAuthStateChange fires immediately with the initial session (INITIAL_SESSION),
  // so it doubles as our first load — no separate getSession() call needed.
  // NOTE: we must NOT `await` other supabase calls synchronously inside this
  // callback (it holds an internal lock and can deadlock); defer with setTimeout.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      const uid = session.user.id;
      // Show loading only on first sign-in; on token refresh keep the current user
      // visible (avoids a skeleton flash every time the token rotates).
      if (!state.user) emit({ user: null, loading: true, backendDown: false });
      setTimeout(async () => {
        const res = await loadProfile(uid);
        if (res.ok) emit({ user: res.user, loading: false, backendDown: false });
        // Keep whatever user we already had — a refresh that cannot reach the DB
        // must not silently sign someone out mid-session.
        else emit({ user: state.user, loading: false, backendDown: true });
      }, 0);
    } else {
      emit({ user: null, loading: false, backendDown: false });
    }
  });
}

function subscribe(cb: () => void) {
  init();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): AuthState {
  return state;
}
const SERVER_SNAPSHOT: AuthState = { user: null, loading: true, backendDown: false };
function getServerSnapshot(): AuthState {
  return SERVER_SNAPSHOT;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export function useAuth() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const user = snap.user;

  const login = useCallback(async (email: string, pin: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
    if (!/^\d{4}$/.test(pin)) return { ok: false, error: "PIN must be exactly 4 digits" };
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pinToPassword(pin),
    });
    if (error) return { ok: false, error: "Invalid email or PIN" };
    return { ok: true };
  }, []);

  // Self-signup never carries a tier — new accounts start at Tier 1 and an admin
  // raises them (the DB trigger ignores any client-supplied tier; see D-01).
  //
  // We create the account through the `signup` Edge Function (service role), which
  // sets `email_confirm: true` so there is no confirmation email to chase — then we
  // immediately sign the member in so they land straight in the app.
  const signup = useCallback(
    async (data: { name: string; email: string; pin: string; customAnswers?: Record<string, string> }): Promise<AuthResult> => {
      if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
      if (!/^\d{4}$/.test(data.pin)) return { ok: false, error: "PIN must be exactly 4 digits" };
      if (!/^[^@]+@[^@]+\.[^@]+$/.test(data.email)) return { ok: false, error: "Invalid email" };
      const email = data.email.trim();
      const { data: result, error } = await supabase.functions.invoke("signup", {
        body: { name: data.name.trim(), email, pin: data.pin, customAnswers: data.customAnswers ?? {} },
      });
      if (error) return { ok: false, error: "Could not create your account. Please try again." };
      if (!result?.ok) return { ok: false, error: result?.error ?? "Could not create your account. Please try again." };
      // Account exists and is confirmed — log them straight in.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: pinToPassword(data.pin),
      });
      if (signInErr) return { ok: false, error: "Account created, but sign-in failed. Try logging in with your email and PIN." };
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const monthsActive = user
    ? Math.max(1, Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / (30 * 24 * 60 * 60_000)) + 1)
    : 0;
  const loyaltyPoints = user ? monthsActive * 100 + user.referrals * 250 : 0;

  return { user, loading: snap.loading, backendDown: snap.backendDown, login, signup, logout, loyaltyPoints, monthsActive };
}

export function hasModuleAccess(user: User | null, path: string): boolean {
  if (HIDDEN_MODULES.has(path)) return false; // parked pre-launch (see HIDDEN_MODULES)
  const mod = ALL_MODULES.find((m) => m.id === path);
  // Admin-managed sidebar config (P-2.1) overrides the code registry when loaded.
  const nav = navOverrideFor(path);
  if (nav?.adminOnly || mod?.adminOnly) return !!user?.isAdmin;
  if (nav && !nav.visible && !user?.isAdmin) return false; // hidden by an admin
  if (mod?.alwaysOn) return true;
  if (!user) return path === "/" || path === "/faq" || path === "/contact" || path === "/login";
  // Tier 4 (Advanced) is sold as "every module ever made, plus early access to
  // anything new". That promise must not depend on `enabled_modules` having been
  // backfilled for each member every time a module ships — so grant everything
  // outright. adminOnly and HIDDEN_MODULES are already excluded above, which is
  // what keeps Storm Chasing out.
  if (user.tier === 4) return true;
  return user.enabledModules.includes(path);
}

/**
 * Verify the Emergency Storm Contact PIN without ever reading it client-side
 * (the PIN is not selectable by members under RLS — see `check_emergency_pin`).
 */
export async function checkEmergencyPin(candidate: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc("check_emergency_pin", { candidate });
  if (error) {
    logger.error("Emergency PIN check failed", { scope: "auth", error });
    return false;
  }
  return data === true;
}
