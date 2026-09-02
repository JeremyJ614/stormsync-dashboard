// StormSync VIP — model-map retention.
//
// Why this exists: nothing ever deleted a rendered model frame. The renderer
// uploads a full parameter sweep every cycle, four cycles a day, two models —
// about 145 MB a day — and in twenty-six days that reached 3.7 GB and 18,642
// objects. Supabase restricted the entire project for exceeding its storage
// quota, which meant Auth, the Data API, Edge Functions and Storage all
// answered 402 and not one member could sign in. A viewer that shows six runs
// per model had taken the whole product down with frames nobody could open.
//
// So: keep the newest N cycles per model (12 by default, twice what the archive
// dropdown offers) and remove everything else, every day.
//
// Deletion goes through the Storage API deliberately. Deleting rows straight
// out of `storage.objects` leaves the real files behind — `protect_delete` on
// that table refuses direct deletes for that exact reason — and orphans cost
// the same money as frames while being invisible and unaddressable. This walks
// the sanctioned path so the bytes actually go.
//
// AUTH: `x-retention-secret`, matching the value in `app_config`. Same shape as
// the storm engine, so cron needs no service-role key in a job body.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BUCKET = "model-maps";
/** Storage removes in batches; this is comfortably inside what the API accepts. */
const BATCH = 100;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retention-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function authorized(req: Request): Promise<boolean> {
  const given = req.headers.get("x-retention-secret") ?? "";
  if (!given) return false;
  const { data } = await admin
    .from("app_config").select("value").eq("key", "model_retention_secret").maybeSingle();
  const want = (data?.value as { secret?: string } | null)?.secret ?? "";
  // Length-independent compare is overkill for a cron secret, but constant work
  // here costs nothing and keeps the check boring.
  if (!want || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!(await authorized(req))) return json({ ok: false, error: "Unauthorized" }, 401);

  let keepRuns: number | null = null;
  let dryRun = false;
  try {
    const body = await req.json();
    if (Number.isFinite(body?.keepRuns)) keepRuns = Math.max(1, Math.floor(Number(body.keepRuns)));
    dryRun = body?.dryRun === true;
  } catch { /* an empty body is the normal cron case */ }

  const { data: stale, error: listErr } = await admin
    .rpc("stale_model_map_objects", { keep_runs: keepRuns });
  if (listErr) return json({ ok: false, error: `Could not list stale frames: ${listErr.message}` }, 500);

  const rows = (stale ?? []) as { name: string; size: number | string }[];
  const bytes = rows.reduce((n, r) => n + (Number(r.size) || 0), 0);
  if (rows.length === 0) return json({ ok: true, deleted: 0, freedBytes: 0, runsPruned: 0, note: "nothing stale" });
  if (dryRun) return json({ ok: true, dryRun: true, wouldDelete: rows.length, wouldFreeBytes: bytes });

  // Remove the frames first. If this dies part-way the manifest rows stay put,
  // so the next pass sees the same cycles as stale and finishes the job —
  // whereas dropping the rows first would hide the leftovers forever.
  let deleted = 0;
  const failures: string[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const names = rows.slice(i, i + BATCH).map((r) => r.name);
    const { error } = await admin.storage.from(BUCKET).remove(names);
    if (error) {
      failures.push(error.message);
      // A restricted or unhealthy Storage API will fail every batch; stop rather
      // than grind through hundreds of identical errors.
      if (failures.length >= 3) break;
      continue;
    }
    deleted += names.length;
  }

  // Only prune manifests once the frames for them are actually gone.
  let runsPruned = 0;
  if (failures.length === 0) {
    const { data: pruned, error: pruneErr } = await admin.rpc("prune_model_runs", { keep_runs: keepRuns });
    if (pruneErr) failures.push(pruneErr.message);
    else runsPruned = Number(pruned ?? 0);
  }

  return json({
    ok: failures.length === 0,
    deleted,
    freedBytes: bytes,
    runsPruned,
    ...(failures.length ? { errors: failures.slice(0, 3) } : {}),
  });
});
