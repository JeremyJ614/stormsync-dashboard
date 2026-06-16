// StormSync VIP — The SSWX Storm Engine (Phase 2, L5).
//
// Deployed to Supabase Edge Functions as `storm-engine`. Runs nightly (Supabase
// cron) — and on demand by an admin — to write ONE `daily_brief` row that every
// consumer reads (Daily Briefing, plain-language discussion, chase targets,
// pattern analysis, severe-weather history).
//
// Pipeline: ingest SPC outlooks + storm reports → build a deterministic risk
// overview → ask Claude to synthesize the brief → upsert `daily_brief`.
//
// AUTH (verify_jwt is false; checked inside): a request is authorized if it
// carries the `x-engine-secret` header matching `app_config.storm_engine_secret`
// (the cron path) OR a Bearer JWT belonging to an admin (the manual path).
//
// AI KEY: the brief needs ONE AI provider key as an Edge Function secret. The
// engine supports two, checked in this order:
//   1. GEMINI_API_KEY    — Google Gemini Flash, FREE tier (get one at
//                          https://aistudio.google.com/apikey, no card needed).
//   2. ANTHROPIC_API_KEY — Claude (paid). Used only if GEMINI_API_KEY is unset.
// Until at least one is set, the engine still runs and writes a deterministic,
// non-AI SPC risk overview (status `skipped`) so the Daily Briefing is never
// dead — the AI fields fill in automatically on the first run after a key is set.
//
// Provider-agnostic: swap the `*_MODEL` constants (and, if needed, the request
// shape in `callGemini`/`callAnthropic`) to change models. Redeploy via the
// Supabase MCP `deploy_edge_function` or `supabase functions deploy storm-engine`.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const AI_KEY_SET = Boolean(GEMINI_API_KEY || ANTHROPIC_API_KEY);

// One-line model swap (the plan's provider-agnostic wrapper).
const ANTHROPIC_MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Gemini 2.5 Flash is on the free tier (generous daily quota, no billing).
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const SPC = "https://www.spc.noaa.gov";
const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engine-secret",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ── SPC categorical ranking (deterministic, non-AI) ─────────────────────────────
const CAT_ORDER = ["TSTM", "MRGL", "SLGT", "ENH", "MDT", "HIGH"];
const CAT_NAMES: Record<string, string> = {
  TSTM: "General Thunder", MRGL: "Marginal", SLGT: "Slight", ENH: "Enhanced", MDT: "Moderate", HIGH: "High",
};
function maxCategory(labels: string[]): string | null {
  let best = -1;
  for (const l of labels) { const i = CAT_ORDER.indexOf(l); if (i > best) best = i; }
  return best >= 0 ? CAT_ORDER[best] : null;
}
// SPC probability outlooks label features as fractions ("0.05" = 5%); "SIGN"/"CIG1"
// mark the significant-severe hatched area (not a probability) and are ignored.
function maxProb(labels: string[]): number {
  let m = 0;
  for (const l of labels) {
    const f = parseFloat(l);
    if (Number.isNaN(f)) continue;
    const pct = f <= 1 ? Math.round(f * 100) : Math.round(f);
    if (pct > m) m = pct;
  }
  return m;
}
const uniq = (a: string[]) => [...new Set(a)];

async function fetchLabels(product: string): Promise<string[]> {
  for (const suffix of [".nolyr.geojson", ".lyr.geojson"]) {
    try {
      const r = await fetch(`${SPC}/products/outlook/${product}${suffix}`, {
        headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" },
      });
      if (!r.ok) continue;
      const geo = await r.json() as { features?: { properties?: { LABEL?: string } }[] };
      return (geo.features ?? []).map((f) => f.properties?.LABEL ?? "").filter(Boolean);
    } catch { /* try next */ }
  }
  return [];
}
async function countCsv(url: string): Promise<number> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return 0;
    const lines = (await r.text()).trim().split(/\r?\n/).filter((l) => l.length > 0);
    return Math.max(0, lines.length - 1); // first line is the CSV header
  } catch { return 0; }
}

interface SourceData {
  day1: { categories: string[]; max_category: string | null; tornado_prob_max: number; wind_prob_max: number; hail_prob_max: number };
  day2: { categories: string[]; max_category: string | null };
  day3: { categories: string[]; max_category: string | null };
  reports_today: { tornado: number; hail: number; wind: number };
  ingested_at: string;
}

async function ingest(): Promise<SourceData> {
  const [d1, torn, wind, hail, d2, d3] = await Promise.all([
    fetchLabels("day1otlk_cat"), fetchLabels("day1otlk_torn"), fetchLabels("day1otlk_wind"),
    fetchLabels("day1otlk_hail"), fetchLabels("day2otlk_cat"), fetchLabels("day3otlk_cat"),
  ]);
  const [tT, tH, tW] = await Promise.all([
    countCsv(`${SPC}/climo/reports/today_torn.csv`),
    countCsv(`${SPC}/climo/reports/today_hail.csv`),
    countCsv(`${SPC}/climo/reports/today_wind.csv`),
  ]);
  return {
    day1: { categories: uniq(d1), max_category: maxCategory(d1), tornado_prob_max: maxProb(torn), wind_prob_max: maxProb(wind), hail_prob_max: maxProb(hail) },
    day2: { categories: uniq(d2), max_category: maxCategory(d2) },
    day3: { categories: uniq(d3), max_category: maxCategory(d3) },
    reports_today: { tornado: tT, hail: tH, wind: tW },
    ingested_at: new Date().toISOString(),
  };
}

function riskOverview(src: SourceData) {
  const d = src.day1;
  return {
    day1_category: d.max_category,
    day1_category_name: d.max_category ? CAT_NAMES[d.max_category] : "No severe risk",
    tornado_prob_max: d.tornado_prob_max,
    wind_prob_max: d.wind_prob_max,
    hail_prob_max: d.hail_prob_max,
    day2_category: src.day2.max_category,
    day3_category: src.day3.max_category,
  };
}
function deterministicHeadline(src: SourceData): string {
  const cat = src.day1.max_category;
  return cat ? `${CAT_NAMES[cat]} risk of severe storms today` : "No organized severe weather expected today";
}

// ── AI synthesis ────────────────────────────────────────────────────────────────
interface Brief {
  headline: string; summary: string; discussion_plain: string; pattern: string;
  chase_targets: { area: string; reason: string; hazards: string }[];
  history_recap: string; confidence: string;
}
type AIResult =
  | { ok: true; brief: Brief; model: string }
  | { ok: false; reason: "no_key" }
  | { ok: false; error: string };

const SYSTEM_PROMPT =
  "You are the lead severe-weather forecaster for StormSync VIP (SSWX), a premium forecasting service. " +
  "You write a single nightly national brief from SPC convective-outlook data. Be accurate, vivid but not " +
  "alarmist, and grounded strictly in the data provided — never invent specific towns or numbers that aren't " +
  "supported. If there is no severe risk, say so plainly. Always defer to official NWS/SPC products for " +
  "life-safety decisions.";
function userPrompt(src: SourceData): string {
  return "Today's SPC convective outlook data (JSON):\n" + JSON.stringify(src, null, 2) +
    "\n\nWrite the SSWX daily severe-weather brief as JSON with these fields:\n" +
    "- headline: one punchy line summarizing today's national severe threat.\n" +
    "- summary: 2-4 sentence daily briefing for the dashboard.\n" +
    "- discussion_plain: a plain-language forecast discussion (no jargon) of ~4-6 sentences.\n" +
    "- pattern: 2-3 sentences on the broader weather pattern and the Day 2-3 trend.\n" +
    "- chase_targets: 0-2 best storm-chase target areas (empty array if no real risk), each with area, reason, hazards.\n" +
    "- history_recap: 1-2 sentences recapping today's storm reports so far (tornado/hail/wind counts).\n" +
    "- confidence: one of low, moderate, high.";
}

function parseBrief(text: string): Brief | null {
  try { return JSON.parse(text) as Brief; } catch { /* fall through */ }
  // Some models wrap JSON in ```json fences or add prose — extract the object.
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as Brief; } catch { /* give up */ } }
  return null;
}

// Provider dispatch: Gemini (free) first, then Anthropic (paid), else no_key.
async function generateBrief(src: SourceData): Promise<AIResult> {
  if (GEMINI_API_KEY) return callGemini(src);
  if (ANTHROPIC_API_KEY) return callAnthropic(src);
  return { ok: false, reason: "no_key" };
}

// ── Google Gemini (free tier) ─────────────────────────────────────────────────────
async function callGemini(src: SourceData): Promise<AIResult> {
  // Gemini structured output uses an OpenAPI-subset schema (UPPERCASE types).
  const schema = {
    type: "OBJECT",
    required: ["headline", "summary", "discussion_plain", "pattern", "chase_targets", "history_recap", "confidence"],
    properties: {
      headline: { type: "STRING" },
      summary: { type: "STRING" },
      discussion_plain: { type: "STRING" },
      pattern: { type: "STRING" },
      chase_targets: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          required: ["area", "reason", "hazards"],
          properties: { area: { type: "STRING" }, reason: { type: "STRING" }, hazards: { type: "STRING" } },
        },
      },
      history_recap: { type: "STRING" },
      confidence: { type: "STRING", enum: ["low", "moderate", "high"] },
    },
  };
  try {
    const r = await fetch(GEMINI_URL(GEMINI_MODEL, GEMINI_API_KEY), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(src) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    });
    if (!r.ok) return { ok: false, error: `gemini ${r.status}: ${(await r.text()).slice(0, 300)}` };
    const data = await r.json() as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };
    if (data.promptFeedback?.blockReason) return { ok: false, error: `gemini blocked: ${data.promptFeedback.blockReason}` };
    const cand = data.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
      return { ok: false, error: `gemini finishReason ${cand.finishReason}` };
    }
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) return { ok: false, error: "no text in gemini response" };
    const brief = parseBrief(text);
    if (!brief) return { ok: false, error: "gemini returned invalid JSON" };
    return { ok: true, brief, model: GEMINI_MODEL };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

// ── Anthropic Claude (paid fallback) ──────────────────────────────────────────────
async function callAnthropic(src: SourceData): Promise<AIResult> {
  const schema = {
    type: "object", additionalProperties: false,
    required: ["headline", "summary", "discussion_plain", "pattern", "chase_targets", "history_recap", "confidence"],
    properties: {
      headline: { type: "string" },
      summary: { type: "string" },
      discussion_plain: { type: "string" },
      pattern: { type: "string" },
      chase_targets: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["area", "reason", "hazards"],
          properties: { area: { type: "string" }, reason: { type: "string" }, hazards: { type: "string" } },
        },
      },
      history_recap: { type: "string" },
      confidence: { type: "string", enum: ["low", "moderate", "high"] },
    },
  };
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema } },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt(src) }],
      }),
    });
    if (!r.ok) return { ok: false, error: `anthropic ${r.status}: ${(await r.text()).slice(0, 300)}` };
    const data = await r.json() as { stop_reason?: string; model?: string; content?: { type: string; text?: string }[] };
    if (data.stop_reason === "refusal") return { ok: false, error: "model declined (refusal)" };
    const text = (data.content ?? []).find((b) => b.type === "text")?.text;
    if (!text) return { ok: false, error: "no text block in model response" };
    const brief = parseBrief(text);
    if (!brief) return { ok: false, error: "model returned invalid JSON" };
    return { ok: true, brief, model: data.model ?? ANTHROPIC_MODEL };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

// ── Persistence ─────────────────────────────────────────────────────────────────
async function upsertBrief(row: Record<string, unknown>): Promise<void> {
  await admin.from("daily_brief").upsert(row, { onConflict: "brief_date" });
}
async function logRun(row: Record<string, unknown>): Promise<void> {
  try { await admin.from("storm_engine_runs").insert(row); } catch { /* best-effort */ }
}

// ── Auth ────────────────────────────────────────────────────────────────────────
async function authorize(req: Request): Promise<{ trigger: string } | Response> {
  const secret = req.headers.get("x-engine-secret");
  if (secret) {
    const { data } = await admin.from("app_config").select("value").eq("key", "storm_engine_secret").maybeSingle();
    const expected = (data?.value as { secret?: string } | null)?.secret;
    if (expected && secret === expected) return { trigger: "cron" };
    return json({ ok: false, error: "Invalid engine secret" }, 401);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false }, global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (u?.user) {
      const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
      if (prof?.is_admin) return { trigger: "manual" };
    }
  }
  return json({ ok: false, error: "Unauthorized" }, 401);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const dryRun = body.dryRun === true || body.action === "dry-run";
  const briefDate = new Date().toISOString().slice(0, 10);
  const started = Date.now();

  try {
    const src = await ingest();
    const overview = riskOverview(src);

    if (dryRun) {
      await logRun({ brief_date: briefDate, status: "dry-run", trigger: auth.trigger, duration_ms: Date.now() - started, detail: "dry run — no write" });
      return json({
        ok: true, dryRun: true, source_data: src, risk_overview: overview,
        ai_key_configured: AI_KEY_SET,
        ai_provider: GEMINI_API_KEY ? "gemini" : ANTHROPIC_API_KEY ? "anthropic" : null,
      });
    }

    const ai = await generateBrief(src);

    if (ai.ok) {
      await upsertBrief({
        brief_date: briefDate, status: "ok", model: ai.model,
        headline: ai.brief.headline, summary: ai.brief.summary,
        content: { ...ai.brief, risk_overview: overview }, source_data: src,
        error: null, generated_at: new Date().toISOString(),
      });
      await logRun({ brief_date: briefDate, status: "ok", model: ai.model, trigger: auth.trigger, duration_ms: Date.now() - started });
      return json({ ok: true, status: "ok", brief_date: briefDate });
    }

    if ("reason" in ai && ai.reason === "no_key") {
      // No AI key yet — write the deterministic SPC risk overview so the UI isn't dead.
      await upsertBrief({
        brief_date: briefDate, status: "skipped", model: null,
        headline: deterministicHeadline(src),
        summary: "Automated SPC risk overview. The AI daily brief activates once the Storm Engine API key is configured.",
        content: { risk_overview: overview }, source_data: src, error: null, generated_at: null,
      });
      await logRun({ brief_date: briefDate, status: "skipped", trigger: auth.trigger, duration_ms: Date.now() - started, detail: "no AI key set (GEMINI_API_KEY or ANTHROPIC_API_KEY)" });
      return json({ ok: true, status: "skipped", reason: "no_key", risk_overview: overview });
    }

    const errMsg = "error" in ai ? ai.error : "unknown AI error";
    await upsertBrief({
      brief_date: briefDate, status: "error", model: null,
      headline: deterministicHeadline(src), summary: "",
      content: { risk_overview: overview }, source_data: src, error: errMsg, generated_at: null,
    });
    await logRun({ brief_date: briefDate, status: "error", trigger: auth.trigger, duration_ms: Date.now() - started, detail: errMsg });
    return json({ ok: false, status: "error", error: errMsg }, 502);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    await logRun({ brief_date: briefDate, status: "error", trigger: auth.trigger, duration_ms: Date.now() - started, detail: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
