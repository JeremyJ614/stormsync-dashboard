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
  if (dryRun) return json({ ok: true, dryRun: true, wouldDelete: rows.length, wouldFreeBytes: bytes });

  // No stale FRAMES is the normal quiet day, and it used to return here. That
  // was wrong: it also skipped the manifest sweeps below, which are the ones
  // that clean up rows pointing at frames that are already gone — so on every
  // day the bucket was tidy, the dropdown's dead entries survived untouched.

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

  const orphansSwept = failures.length === 0 ? await sweepOrphans() : 0;
  const emptyRuns = failures.length === 0 ? await pruneEmptyRuns() : 0;

  return json({
    ok: failures.length === 0,
    deleted,
    freedBytes: bytes,
    runsPruned,
    emptyRuns,
    orphansSwept,
    ...(rows.length === 0 ? { note: "no stale frames" } : {}),
    ...(failures.length ? { errors: failures.slice(0, 3) } : {}),
  });
});

/**
 * Drop manifest rows whose frames are gone.
 *
 * The archive dropdown is built from `model_runs`, and a row there is a promise
 * that the frames exist. When the old project blew its quota the files went and
 * the rows stayed, so the viewer offered twenty-four cycles that answered
 * "Frames unavailable" — one report of a broken module caused entirely by
 * bookkeeping. Neither of the two prunes above catches it: one looks for
 * objects outside the newest cycles, and there are none for these; the other
 * counts rows without asking whether they point at anything.
 */
async function pruneEmptyRuns(): Promise<number> {
  const { data, error } = await admin.rpc("prune_orphan_model_runs", { grace_minutes: 90 });
  if (error) return 0;
  return Number(data ?? 0);
}

/**
 * Work the backlog of files stranded by the one-time outage recovery.
 *
 * Getting back under quota needed a direct delete from `storage.objects` while
 * the Storage API itself was behind the 402, which left the real files with no
 * row to address them by. `model_map_orphans` remembers their names; each run
 * re-registers a batch, deletes it properly, and marks it done, so the backlog
 * walks down to zero over a few days and then this costs one cheap query a day.
 *
 * Deliberately bounded per run: this is cleanup of a debt, not the day's work,
 * and it must never be the reason retention times out.
 */
async function sweepOrphans(): Promise<number> {
  const PER_RUN = 500;
  let swept = 0;

  while (swept < PER_RUN) {
    const { data, error } = await admin.rpc("next_model_map_orphans", { batch: BATCH });
    if (error) return swept;
    const names = ((data ?? []) as (string | { name: string })[])
      .map((r) => (typeof r === "string" ? r : r.name));
    if (names.length === 0) return swept;

    const { error: regErr } = await admin.rpc("register_model_map_orphans", { names });
    if (regErr) return swept;

    const { error: rmErr } = await admin.storage.from(BUCKET).remove(names);
    // A name the store no longer holds still counts as dealt with — marking it
    // swept is what stops the same batch coming back round forever.
    if (rmErr && !/not found/i.test(rmErr.message)) return swept;

    const { error: markErr } = await admin.rpc("mark_model_map_orphans_swept", { names });
    if (markErr) return swept;
    swept += names.length;
  }
  return swept;
}
