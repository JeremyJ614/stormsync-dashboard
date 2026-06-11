// StormSync VIP — admin-only user management.
//
// Deployed to Supabase Edge Functions as `admin-users`. Unlike the public
// `weather` proxy, this performs PRIVILEGED auth operations (creating accounts,
// deleting accounts, resetting PINs) that require the service role. Every request
// is therefore re-checked: the caller must present a valid session JWT AND have
// `profiles.is_admin = true`. Non-privileged profile edits (tier, modules, badges)
// are done directly from the client under RLS and do NOT go through here.
//
// Body: { action: "create" | "delete" | "set-pin", ...payload }
//
// Redeploy: via the Supabase MCP `deploy_edge_function`, or
// `supabase functions deploy admin-users`.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Must match `pinToPassword` in src/hooks/useAuth.ts exactly, or logins won't match.
function pinToPassword(pin: string): string {
  return `pin_${pin}_sswx`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const ADMIN_EMAIL = "JayMyers@StormSync.Media";

/** Resolve the caller from the request JWT and confirm they are an admin. */
async function requireAdmin(req: Request): Promise<{ id: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Not authenticated" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ ok: false, error: "Not authenticated" }, 401);
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profErr || !profile?.is_admin) return json({ ok: false, error: "Admin access required" }, 403);
  return { id: userData.user.id };
}

interface CreateBody {
  name: string;
  email: string;
  pin: string;
  tier: number;
  isAdmin?: boolean;
  badges?: string[];
  customAnswers?: Record<string, string>;
}

async function handleCreate(body: CreateBody): Promise<Response> {
  const email = (body.email ?? "").trim();
  const pin = body.pin ?? "";
  const name = (body.name ?? "").trim();
  const tier = Number(body.tier);
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return json({ ok: false, error: "Invalid email" });
  if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: "PIN must be exactly 4 digits" });
  if (!name) return json({ ok: false, error: "Name required" });
  if (![1, 2, 3, 4].includes(tier)) return json({ ok: false, error: "Invalid tier" });

  // Create the auth user with email pre-confirmed (admin-provisioned). The
  // `handle_new_user` trigger creates the matching profile row from this metadata.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: pinToPassword(pin),
    email_confirm: true,
    user_metadata: { name, tier, custom_answers: body.customAnswers ?? {} },
  });
  if (createErr || !created.user) {
    return json({ ok: false, error: createErr?.message ?? "Could not create user" });
  }

  // Apply admin-only fields the signup trigger doesn't set from metadata.
  const patch: Record<string, unknown> = {};
  if (body.isAdmin) patch.is_admin = true;
  if (Array.isArray(body.badges) && body.badges.length) patch.badges = body.badges;
  if (Object.keys(patch).length) {
    const { error: patchErr } = await admin.from("profiles").update(patch).eq("id", created.user.id);
    if (patchErr) return json({ ok: false, error: patchErr.message });
  }

  const { data: profile } = await admin.from("profiles").select("*").eq("id", created.user.id).maybeSingle();
  return json({ ok: true, user: profile });
}

async function handleDelete(id: string, callerId: string): Promise<Response> {
  if (!id) return json({ ok: false, error: "Missing user id" });
  if (id === callerId) return json({ ok: false, error: "You cannot delete your own account" });
  // Block deleting the seed admin account regardless of who asks.
  const { data: target } = await admin.from("profiles").select("email").eq("id", id).maybeSingle();
  if (target?.email && target.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    return json({ ok: false, error: "The primary admin account cannot be deleted" });
  }
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return json({ ok: false, error: error.message });
  return json({ ok: true });
}

async function handleSetPin(id: string, pin: string): Promise<Response> {
  if (!id) return json({ ok: false, error: "Missing user id" });
  if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: "PIN must be exactly 4 digits" });
  const { error } = await admin.auth.admin.updateUserById(id, { password: pinToPassword(pin) });
  if (error) return json({ ok: false, error: error.message });
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  switch (body.action) {
    case "create":
      return handleCreate(body as unknown as CreateBody);
    case "delete":
      return handleDelete(String(body.id ?? ""), caller.id);
    case "set-pin":
      return handleSetPin(String(body.id ?? ""), String(body.pin ?? ""));
    default:
      return json({ ok: false, error: "Unknown action" }, 400);
  }
});
