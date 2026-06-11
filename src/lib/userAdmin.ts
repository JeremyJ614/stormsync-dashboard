/**
 * Admin-only user & signup management, backed by Supabase.
 *
 * Reads and non-privileged writes go straight to the `profiles` / `app_config` /
 * `signup_questions` tables and are authorized by Row Level Security (only admins
 * pass `private.is_admin()`). Privileged auth operations that need the service role
 * — creating accounts, deleting accounts, resetting a PIN — are delegated to the
 * `admin-users` Edge Function, which re-checks that the caller is an admin.
 */
import { supabase } from "./supabase";
import { logger } from "./logger";
import { rowToUser, type User, type Tier, type SignupQuestion, type QuestionType, type ProfileRow } from "../hooks/useAuth";

export interface MutationResult {
  ok: boolean;
  error?: string;
}

async function readFnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  try {
    const body = (await ctx?.json?.()) as { error?: string } | undefined;
    if (body?.error) return body.error;
  } catch {
    /* response body not JSON — fall through */
  }
  return (error as { message?: string })?.message ?? "Request failed";
}

async function invokeAdmin(body: Record<string, unknown>): Promise<MutationResult> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    const message = await readFnError(error);
    logger.error("admin-users invoke failed", { scope: "admin", error: message });
    return { ok: false, error: message };
  }
  return (data ?? { ok: false, error: "No response from server" }) as MutationResult;
}

// ─── Users ──────────────────────────────────────────────────────────────────
export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("joined_at", { ascending: true });
  if (error) {
    logger.error("Failed to list users", { scope: "admin", error });
    throw error;
  }
  return (data as ProfileRow[]).map(rowToUser);
}

export function adminCreateUser(input: {
  name: string;
  email: string;
  pin: string;
  tier: Tier;
  isAdmin?: boolean;
  badges?: string[];
  customAnswers?: Record<string, string>;
}): Promise<MutationResult> {
  if (!/^\d{4}$/.test(input.pin)) return Promise.resolve({ ok: false, error: "PIN must be exactly 4 digits" });
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(input.email)) return Promise.resolve({ ok: false, error: "Invalid email" });
  if (!input.name.trim()) return Promise.resolve({ ok: false, error: "Name required" });
  return invokeAdmin({
    action: "create",
    name: input.name.trim(),
    email: input.email.trim(),
    pin: input.pin,
    tier: input.tier,
    isAdmin: !!input.isAdmin,
    badges: input.badges ?? [`tier-${input.tier}`],
    customAnswers: input.customAnswers ?? {},
  });
}

export function adminDeleteUser(id: string): Promise<MutationResult> {
  return invokeAdmin({ action: "delete", id });
}

export function adminSetPin(id: string, pin: string): Promise<MutationResult> {
  if (!/^\d{4}$/.test(pin)) return Promise.resolve({ ok: false, error: "PIN must be exactly 4 digits" });
  return invokeAdmin({ action: "set-pin", id, pin });
}

async function updateProfile(id: string, patch: Record<string, unknown>): Promise<MutationResult> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) {
    logger.error("Failed to update profile", { scope: "admin", error });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function setUserTier(id: string, tier: Tier): Promise<MutationResult> {
  return updateProfile(id, { tier });
}

export function setUserModules(id: string, enabledModules: string[]): Promise<MutationResult> {
  return updateProfile(id, { enabled_modules: enabledModules });
}

export function setUserBadges(id: string, badges: string[]): Promise<MutationResult> {
  return updateProfile(id, { badges });
}

export function setUserReferrals(id: string, referrals: number): Promise<MutationResult> {
  return updateProfile(id, { referrals });
}

// ─── Signup questions ─────────────────────────────────────────────────────────
interface QuestionRow {
  id: string;
  label: string;
  required: boolean;
  qtype: string;
  options: string[] | null;
  placeholder: string | null;
  sort_order: number | null;
}

export async function getQuestions(): Promise<SignupQuestion[]> {
  const { data, error } = await supabase
    .from("signup_questions")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false });
  if (error) {
    logger.error("Failed to load signup questions", { scope: "admin", error });
    throw error;
  }
  return (data as QuestionRow[]).map((r) => ({
    id: r.id,
    label: r.label,
    required: r.required,
    type: r.qtype as QuestionType,
    options: r.options ?? undefined,
    placeholder: r.placeholder ?? undefined,
  }));
}

export async function saveQuestions(questions: SignupQuestion[]): Promise<MutationResult> {
  const rows = questions.map((q, i) => ({
    id: q.id,
    label: q.label,
    required: q.required,
    qtype: q.type,
    options: q.options ?? null,
    placeholder: q.placeholder ?? null,
    sort_order: i,
  }));
  const keepIds = rows.map((r) => r.id);

  // Drop any questions the admin removed, then upsert the current set.
  const { data: existing, error: readErr } = await supabase.from("signup_questions").select("id");
  if (readErr) return { ok: false, error: readErr.message };
  const toDelete = (existing as { id: string }[]).map((r) => r.id).filter((id) => !keepIds.includes(id));
  if (toDelete.length) {
    const { error: delErr } = await supabase.from("signup_questions").delete().in("id", toDelete);
    if (delErr) return { ok: false, error: delErr.message };
  }
  const { error: upErr } = await supabase.from("signup_questions").upsert(rows);
  if (upErr) {
    logger.error("Failed to save signup questions", { scope: "admin", error: upErr });
    return { ok: false, error: upErr.message };
  }
  return { ok: true };
}

// ─── Emergency contact PIN (app_config) ─────────────────────────────────────────
export async function getEmergencyPin(): Promise<string> {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "emergency_pin").maybeSingle();
  if (error) {
    logger.error("Failed to read emergency PIN", { scope: "admin", error });
    return "";
  }
  const value = (data?.value ?? {}) as { pin?: string };
  return value.pin ?? "";
}

export async function saveEmergencyPin(pin: string): Promise<MutationResult> {
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "PIN must be exactly 4 digits" };
  const { error } = await supabase.from("app_config").update({ value: { pin } }).eq("key", "emergency_pin");
  if (error) {
    logger.error("Failed to save emergency PIN", { scope: "admin", error });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
