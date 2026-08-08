// StormSync VIP — Daily Trivia generator (Phase 5).
// Slot 1 = weather, slot 2 = deliberately random. One AI call per slot per day.
// Admin-authored questions are never overwritten.
// AUTH: x-engine-secret (cron) or admin Bearer. SECRET: GEMINI_KEY_TRIVIA.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GEMINI_KEY = Deno.env.get("GEMINI_KEY_TRIVIA") ?? Deno.env.get("GEMINI_API_KEY") ?? "";
// Ordered newest-usable FIRST. gemini-2.5-flash now 404s ("no longer available
// to new users"), so leading with it burnt a wasted request on every single
// generation before falling through. Overridable without a redeploy.
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? "gemini-flash-latest,gemini-2.0-flash,gemini-2.5-flash")
  .split(",").map((m) => m.trim()).filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engine-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function authorize(req: Request): Promise<boolean | Response> {
  const secret = req.headers.get("x-engine-secret");
  if (secret) {
    const { data } = await admin.from("app_config").select("value").eq("key", "storm_engine_secret").maybeSingle();
    const expected = (data?.value as { secret?: string } | null)?.secret;
    if (expected && secret === expected) return true;
    return json({ ok: false, error: "Invalid engine secret" }, 401);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (u?.user) {
      const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
      if (prof?.is_admin) return true;
    }
  }
  return json({ ok: false, error: "Unauthorized" }, 401);
}

interface Q { question: string; choices: string[]; answer_index: number; explanation: string }

/** Try each model in turn; return the question plus a diagnostic trail. */
async function ask(prompt: string): Promise<{ q: Q | null; diag: string[] }> {
  const diag: string[] = [];
  if (!GEMINI_KEY) return { q: null, diag: ["no key set"] };
  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 1.0, responseMimeType: "application/json" },
          }),
        },
      );
      const raw = await r.text();
      if (!r.ok) { diag.push(`${model}: HTTP ${r.status} ${raw.slice(0, 160)}`); continue; }
      const data = JSON.parse(raw);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { diag.push(`${model}: no text in response`); continue; }
      const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const q = JSON.parse(cleaned) as Q;
      if (!q?.question || !Array.isArray(q.choices) || q.choices.length < 2) {
        diag.push(`${model}: malformed question`); continue;
      }
      q.answer_index = Math.max(0, Math.min(q.choices.length - 1, Number(q.answer_index) || 0));
      diag.push(`${model}: ok`);
      return { q, diag };
    } catch (e) {
      diag.push(`${model}: ${String(e).slice(0, 120)}`);
    }
  }
  return { q: null, diag };
}

const SHAPE = `Return ONLY JSON: {"question":string,"choices":[string,string,string,string],"answer_index":number,"explanation":string}. answer_index is the 0-based index of the correct choice.`;

const WEATHER_PROMPT = (seed: string) => `Write ONE multiple-choice trivia question about weather or meteorology.
Make it genuinely interesting to a severe-weather enthusiast - radar, storm structure, forecasting, records, or atmospheric physics.
Avoid the most obvious textbook facts. Exactly 4 choices, only one correct. Question under 190 characters.
The explanation should be one or two sentences and teach something.
Vary the subject; variation seed ${seed}.\n${SHAPE}`;

const RANDOM_PROMPT = (seed: string) => `Write ONE multiple-choice trivia question about ANY topic EXCEPT weather or meteorology.
It must be unique, fun and specific - a surprising piece of history, science, space, nature, food, language, sport or pop culture.
Do NOT ask a generic quiz-night question (no "capital of", no "how many continents").
Aim for something that makes the reader say "huh, I did not know that".
Exactly 4 choices, only one correct. Question under 190 characters.
The explanation should be one or two sentences and genuinely interesting.
Vary the subject; variation seed ${seed}.\n${SHAPE}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  let body: { date?: string; force?: boolean; debug?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const day = body.date ?? new Date().toISOString().slice(0, 10);
  const seed = `${day}-${Math.floor(Math.random() * 100000)}`;

  const { data: existing } = await admin
    .from("trivia_questions").select("id,slot,source").eq("ask_date", day);
  const bySlot = new Map((existing ?? []).map((r) => [r.slot as number, r]));

  const results: Record<string, string> = {};
  const diagnostics: Record<string, string[]> = {};

  for (const [slot, category, prompt] of [
    [1, "weather", WEATHER_PROMPT(seed)],
    [2, "random", RANDOM_PROMPT(seed)],
  ] as [number, string, string][]) {
    const cur = bySlot.get(slot);
    // An admin-authored question is final — the generator must never clobber it,
    // not even with ?force=true. This is what makes the admin editor's "override
    // slot 1/2" actually stick.
    if (cur && cur.source === "admin") { results[`slot${slot}`] = "skipped (admin-authored)"; continue; }
    if (cur && !body.force) { results[`slot${slot}`] = "already generated"; continue; }

    const { q, diag } = await ask(prompt);
    diagnostics[`slot${slot}`] = diag;
    if (!q) { results[`slot${slot}`] = GEMINI_KEY ? "generation failed" : "no GEMINI_KEY_TRIVIA set"; continue; }

    const row = {
      ask_date: day, slot, category,
      question: q.question, choices: q.choices, answer_index: q.answer_index,
      explanation: q.explanation, points: 100, source: "ai", active: true,
    };
    const { error } = await admin.from("trivia_questions").upsert(row, { onConflict: "ask_date,slot" });
    results[`slot${slot}`] = error ? `error: ${error.message}` : "generated";
  }

  return json({ ok: true, date: day, results, ...(body.debug ? { diagnostics, keySet: !!GEMINI_KEY } : {}) });
});
