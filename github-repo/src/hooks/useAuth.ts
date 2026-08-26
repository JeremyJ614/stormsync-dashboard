import { useCallback, useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { logger } from "../lib/logger";
import { navOverrideFor } from "../lib/navConfig";
import { viewingAs, subscribeViewAs } from "../lib/impersonate";

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
  /** When they finished the intro guide. Null means it has not been shown. */
  introSeenAt: string | null;
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
  { id: "/subscription", label: "Subscription", alwaysOn: true },
  { id: "/dashboard", label: "Dashboard" },
  { id: "/forecast", label: "Daily Brief & Forecast" },
  { id: "/discussion", label: "Forecast Discussion" },
  { id: "/comparator", label: "Run Comparator" },
  { id: "/spc", label: "SPC Outlook" },
  { id: "/thunder", label: "Thunderstorm Probability" },
  { id: "/hurricane", label: "Hurricane Tracker" },
  { id: "/meso", label: "Mesoscale Discussion" },
  { id: "/ingredients", label: "Storm Ingredients" },
  { id: "/swti", label: "Threat Index" },
  { id: "/timing", label: "Severe Timing" },
  { id: "/warnings", label: "Warnings & Reports" },
  { id: "/aqi", label: "AQI Forecast" },
  { id: "/hazards", label: "Hazards & Drought" },
  { id: "/rivers", label: "River & Flood Gauges" },
  { id: "/fire", label: "Fire Weather" },
  { id: "/winter", label: "Winter Center" },
  { id: "/cameras", label: "Traffic Cameras" },
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
  { id: "/chasing", label: "Storm Chasing" },
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
  intro_seen_at?: string | null;
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
    introSeenAt: r.intro_seen_at ?? null,
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
}

let state: AuthState = { user: null, loading: isSupabaseConfigured };
const listeners = new Set<() => void>();

function emit(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

async function loadProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    logger.error("Failed to load profile", { scope: "auth", error });
    return null;
  }
  return data ? rowToUser(data as ProfileRow) : null;
}

let initialized = false;
function init() {
  if (initialized) return;
  initialized = true;
  if (!isSupabaseConfigured) {
    emit({ user: null, loading: false });
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
      if (!state.user) emit({ user: null, loading: true });
      setTimeout(async () => {
        emit({ user: await loadProfile(uid), loading: false });
        // Award anything newly qualified for. Runs after the profile is in
        // hand so the UI is never waiting on it, and is a no-op when there is
        // nothing to give — the database refuses a second award for the same
        // badge, so this cannot double-notify however often it fires.
        try {
          const { data: earned } = await supabase.rpc("evaluate_badges");
          if (Array.isArray(earned) && earned.length) {
            emit({ user: await loadProfile(uid), loading: false });
          }
        } catch { /* a badge is never worth breaking sign-in over */ }
      }, 0);
    } else {
      emit({ user: null, loading: false });
    }
  });
}

/**
 * Reload the signed-in member's profile and push it to every subscriber.
 *
 * The store is otherwise driven only by Supabase auth events, which do not fire
 * when a row changes underneath us. Anything that writes to `profiles` and
 * expects the UI to notice — finishing the intro guide, an admin granting a
 * module — calls this afterwards.
 */
export async function refreshProfile(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) return;
  emit({ user: await loadProfile(uid), loading: false });
}

function subscribe(cb: () => void) {
  init();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): AuthState {
  return state;
}
const SERVER_SNAPSHOT: AuthState = { user: null, loading: true };
function getServerSnapshot(): AuthState {
  return SERVER_SNAPSHOT;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export function useAuth() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const realUser = snap.user;

  // "View as this member" (lib/impersonate). The lens replaces the profile that
  // drives gating and navigation; it never touches the Supabase session, so
  // every read and write is still authorised as the admin who is signed in.
  // Non-admins have nothing to view as, so the lens is ignored for them.
  const lens = useSyncExternalStore(subscribeViewAs, viewingAs, () => null);
  const viewAs = realUser?.isAdmin ? lens : null;
  const user = viewAs ?? realUser;

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

  return {
    user,
    /** The signed-in account, regardless of any "view as" lens. */
    realUser,
    /** The member being viewed through the lens, or null. */
    viewAs,
    loading: snap.loading,
    login, signup, logout, loyaltyPoints, monthsActive,
  };
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
  // Advanced means every module, as a rule rather than as a list.
  //
  // Access was decided purely by `enabled_modules`, which is written once when
  // somebody buys. That silently broke every time a module was added: the tier
  // that the Plans page describes as "everything, nothing to choose" and the FAQ
  // describes as "every module in the app" was showing "not in your plan" for
  // anything newer than the member's purchase. Real Advanced members were
  // sitting on 34 to 37 of 38.
  //
  // Encoding it here means the rule cannot go stale again the next time a
  // module ships. Lower tiers still read their own list, because for them the
  // list IS the product.
  if (user.tier >= 4) return true;
  return user.enabledModules.includes(path);
}

/**
 * Whether a module should appear in the sidebar at all — as opposed to whether
 * the member can open it (`hasModuleAccess`).
 *
 * These are deliberately different questions. A module the member has not paid
 * for still belongs in the menu, shown locked, because a module nobody can see
 * is a module nobody buys. Only three things remove a row entirely: it is
 * parked pre-launch, it is admin-only, or an admin has hidden it.
 */
export function navVisible(user: User | null, path: string): boolean {
  if (HIDDEN_MODULES.has(path)) return false;
  const mod = ALL_MODULES.find((m) => m.id === path);
  const nav = navOverrideFor(path);
  if (nav?.adminOnly || mod?.adminOnly) return !!user?.isAdmin;
  if (nav && !nav.visible && !user?.isAdmin) return false;
  return true;
}

/**
 * Verify the Emergency Storm Contact PIN without ever reading it client-side
 * (the PIN is not selectable by members under RLS — see `check_emergency_pin`).
 */
/**
 * Result of an emergency-PIN check.
 *
 * "wrong" and "unavailable" have to be told apart. `check_emergency_pin` is
 * granted to `authenticated` and not to `anon`, so a signed-out visitor gets a
 * permission error — and collapsing that into `false` tells them their PIN is
 * wrong and sends them hunting for digits, when the actual problem is that they
 * are not signed in. On a line meant for someone watching a wall cloud, that is
 * the worst possible moment to give a misleading answer.
 */
export type PinResult = "ok" | "wrong" | "unavailable";

export async function verifyEmergencyPin(candidate: string): Promise<PinResult> {
  if (!isSupabaseConfigured) return "unavailable";
  const { data, error } = await supabase.rpc("check_emergency_pin", { candidate });
  if (error) {
    logger.error("Emergency PIN check failed", { scope: "auth", error });
    return "unavailable";
  }
  return data === true ? "ok" : "wrong";
}

/** Boolean form, for callers that genuinely only need pass/fail. */
export async function checkEmergencyPin(candidate: string): Promise<boolean> {
  return (await verifyEmergencyPin(candidate)) === "ok";
}

/**
 * Record that the member has been through the intro guide.
 *
 * `intro_seen_at` is the member's own preference about their own onboarding, so
 * it is not one of the columns `protect_profile_columns` guards and they write
 * it directly. Passing null is how the replay control in My Profile arms it to
 * run again on the next load.
 */
export async function setIntroSeen(seen: boolean): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return false;
  const { error } = await supabase
    .from("profiles")
    .update({ intro_seen_at: seen ? new Date().toISOString() : null })
    .eq("id", uid);
  return !error;
}
