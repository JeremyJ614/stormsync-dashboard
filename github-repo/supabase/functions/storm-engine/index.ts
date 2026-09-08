// StormSync VIP — The SSWX Storm Engine (Phase 2/4).
//
// Deployed to Supabase Edge Functions as `storm-engine`. Runs nightly (Supabase
// cron) — and on demand by an admin — to write:
//   • ONE `daily_brief` row (Daily Briefing, plain-language discussion, chase
//     targets, pattern analysis).
//   • The rolling `severe_history` summaries (U-19) from a `daily_report_counts`
//     ledger the engine maintains.
//   • Nightly Forecast Game scoring (U-20): scores yesterday's locked guesses
//     against SPC storm reports and rolls up monthly winners.
//
// AUTH (verify_jwt is false; checked inside): a request is authorized if it
// carries the `x-engine-secret` header matching `app_config.storm_engine_secret`
// (the cron path) OR a Bearer JWT belonging to an admin (the manual path).
//
// AI KEY: ONE provider key as an Edge Function secret. Checked in order:
//   1. GEMINI_API_KEY    — Google Gemini Flash, FREE tier.
//   2. ANTHROPIC_API_KEY — Claude (paid). Used only if GEMINI_API_KEY is unset.
// Without either, every AI step degrades to a deterministic write so no page is
// ever dead. Provider-agnostic — swap the `*_MODEL` constants.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const AI_KEY_SET = Boolean(GEMINI_API_KEY || ANTHROPIC_API_KEY);

const ANTHROPIC_MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// gemini-2.5-flash now returns 404 "no longer available to new users", which made
// every nightly brief fall through to the deterministic SPC-risk template. Try a
// chain, newest-usable first, and allow an env override without a redeploy.
/**
 * Which Gemini models to try, in order.
 *
 * Validated rather than trusted. `GEMINI_MODELS` is a secret, and a secret that
 * is meant to hold a comma-separated list of model names is one paste away from
 * holding an API key instead — which is exactly what happened: the whole
 * narrative came back as
 * `GenerateContentRequest.model: unexpected model name format`, because the
 * key was going into the URL where the model belongs. A model name is lower
 * case letters, digits, dots and hyphens, so anything else is discarded and the
 * built-in list is used. Silently degrading to a working default beats an AI
 * write that fails every day until somebody reads the error field.
 */
const DEFAULT_GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-2.5-flash"];
const IS_MODEL_NAME = /^[a-z0-9][a-z0-9.-]{2,60}$/;
function geminiModels(): string[] {
  const raw = (Deno.env.get("GEMINI_MODELS") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const good = raw.filter((m) => IS_MODEL_NAME.test(m));
  if (raw.length && !good.length) {
    console.warn("GEMINI_MODELS holds no usable model name; falling back to the built-in list");
  }
  return good.length ? good : DEFAULT_GEMINI_MODELS;
}
const GEMINI_MODELS = geminiModels();
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
const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The contest day, in Eastern time.
 *
 * The Forecast Game runs on a calendar day and this used to be the UTC one,
 * which in Eastern time turns over at 8pm — so an evening's picks were filed
 * against tomorrow, and yesterday's round was scored four hours after it was
 * already over for the people who played it. `en-CA` is not a style choice: it
 * is the locale that formats as YYYY-MM-DD, the shape the date column wants.
 * The zone carries its own daylight-saving rules, so this needs no offset
 * table and stays right across both changeovers.
 */
const GAME_TZ = "America/New_York";
const GAME_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const gameDate = (at: Date = new Date()) => GAME_DAY_FMT.format(at);
const gameDateOffset = (days: number, at: Date = new Date()) =>
  gameDate(new Date(at.getTime() + days * 86_400_000));


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

// ── SPC storm-report detail parsing ─────────────────────────────────────────
// Report CSVs are `Time,<metric>,Location,County,State,Lat,Lon,Comments` where
// <metric> is F_Scale / Size / Speed. Every field we want sits BEFORE Comments,
// which is the only field that can contain commas, so a naive split is safe.
//
// Two real quirks, both observed in live files:
//   • SPC repeats the header row mid-file when it concatenates sources.
//   • Size/Speed are frequently the literal string "UNK" (damage-only reports).
interface CsvRow { get(col: string): string }

async function fetchCsvRows(url: string): Promise<CsvRow[]> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return [];
    const lines = (await r.text()).trim().split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map((h) => h.trim());
    const out: CsvRow[] = [];
    for (const line of lines.slice(1)) {
      const c = line.split(",");
      if ((c[0] ?? "").trim() === "Time") continue;   // repeated header block
      out.push({ get: (col) => (c[header.indexOf(col)] ?? "").trim() });
    }
    return out;
  } catch { return []; }
}

/** Parse a numeric cell, treating SPC's "UNK"/blank as absent. */
function num(v: string): number | null {
  if (!v || /^unk$/i.test(v)) return null;
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : null;
}
const place = (r: CsvRow) => [r.get("Location"), r.get("State")].filter(Boolean).join(", ") || null;

export interface DayDetail {
  /** {state: tornado report count} for this day. The yearly "top state" rollup
   *  sums these — a per-day winner alone would undercount a state that places
   *  second every day but leads the season. */
  state_tornadoes: Record<string, number>;
  top_state: string | null;
  top_state_tornadoes: number | null;
  max_hail_in: number | null;
  max_hail_place: string | null;
  max_gust_kt: number | null;
  max_gust_place: string | null;
}

/** Per-day superlatives for one SPC report date (YYMMDD). */
async function fetchDayDetail(yymmdd: string): Promise<DayDetail> {
  const [torn, hail, wind] = await Promise.all([
    fetchCsvRows(`${SPC}/climo/reports/${yymmdd}_rpts_torn.csv`),
    fetchCsvRows(`${SPC}/climo/reports/${yymmdd}_rpts_hail.csv`),
    fetchCsvRows(`${SPC}/climo/reports/${yymmdd}_rpts_wind.csv`),
  ]);

  // Most tornado reports in a single state that day.
  const byState = new Map<string, number>();
  for (const r of torn) {
    const st = r.get("State");
    if (st) byState.set(st, (byState.get(st) ?? 0) + 1);
  }
  const top = [...byState.entries()].sort((a, b) => b[1] - a[1])[0];

  // Size is HUNDREDTHS of an inch (100 = 1.00").
  let maxHail: { v: number; where: string | null } | null = null;
  for (const r of hail) {
    const s = num(r.get("Size"));
    if (s === null) continue;
    if (!maxHail || s > maxHail.v) maxHail = { v: s, where: place(r) };
  }

  let maxGust: { v: number; where: string | null } | null = null;
  for (const r of wind) {
    const s = num(r.get("Speed"));
    if (s === null) continue;      // damage-only report, no measured gust
    if (!maxGust || s > maxGust.v) maxGust = { v: s, where: place(r) };
  }

  return {
    state_tornadoes: Object.fromEntries(byState),
    top_state: top?.[0] ?? null,
    top_state_tornadoes: top?.[1] ?? null,
    max_hail_in: maxHail ? Math.round(maxHail.v) / 100 : null,
    max_hail_place: maxHail?.where ?? null,
    max_gust_kt: maxGust ? Math.round(maxGust.v) : null,
    max_gust_place: maxGust?.where ?? null,
  };
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

// ── Generic AI runner (provider-agnostic structured JSON) ─────────────────────────
type AIRun =
  | { ok: true; data: Record<string, unknown>; model: string }
  | { ok: false; reason: "no_key" }
  | { ok: false; error: string };

function parseJSON(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* give up */ } }
  return null;
}

/**
 * One Gemini attempt with a specific model.
 *
 * `tryNext` says whether the NEXT model in the chain is worth attempting. It is
 * true only for failures that are about this model or this moment — retired
 * (404), rate-limited (429), server-side (5xx), or a transport error. A model
 * that answered but answered badly (safety block, unparseable JSON) means the
 * request itself is the problem, so walking the chain would just repeat it.
 */
async function geminiOnce(
  model: string, system: string, user: string, schemaGemini: unknown,
): Promise<{ ok: true; data: Record<string, unknown>; model: string } | { ok: false; error: string; tryNext: boolean }> {
  try {
    const r = await fetch(GEMINI_URL(model, GEMINI_API_KEY), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schemaGemini, temperature: 0.7, maxOutputTokens: 8192 },
      }),
    });
    if (!r.ok) {
      const tryNext = r.status === 404 || r.status === 429 || r.status >= 500;
      return { ok: false, error: `${r.status}: ${(await r.text()).slice(0, 200)}`, tryNext };
    }
    const data = await r.json() as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };
    if (data.promptFeedback?.blockReason) return { ok: false, error: `blocked: ${data.promptFeedback.blockReason}`, tryNext: false };
    const cand = data.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
      return { ok: false, error: `finishReason ${cand.finishReason}`, tryNext: false };
    }
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = text ? parseJSON(text) : null;
    if (!parsed) return { ok: false, error: "returned invalid JSON", tryNext: false };
    return { ok: true, data: parsed, model };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e), tryNext: true };
  }
}

// schemaGemini uses UPPERCASE OpenAPI-subset types; schemaAnthropic uses JSON-Schema.
async function aiJSON(system: string, user: string, schemaGemini: unknown, schemaAnthropic: unknown): Promise<AIRun> {
  if (GEMINI_API_KEY) {
    // Actually walk the chain. Pinning one model is what silently reduced every
    // nightly brief to the deterministic SPC template when gemini-2.5-flash was
    // retired — a single retirement must never take the brief down again.
    const tried: string[] = [];
    // Every model in the chain is Gemini, so they share a backend: a capacity
    // 503 rejects all three within a second and the brief drops to the
    // deterministic template. That accounted for roughly a quarter of nightly
    // runs. Transient failures (429/5xx) therefore get a second pass over the
    // chain after a short wait; hard failures (404 retirement, safety blocks)
    // still fall straight through.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 5000));
      let transient = false;
      for (const model of GEMINI_MODELS) {
        const res = await geminiOnce(model, system, user, schemaGemini);
        if (res.ok) return res;
        tried.push(`${model} -> ${res.error}`);
        if (!res.tryNext) { transient = false; break; }
        // 404 means the model is retired — another pass will not bring it back.
        if (!/^404:/.test(res.error)) transient = true;
      }
      if (!transient) break;
    }
    return { ok: false, error: `gemini failed (${tried.length} attempts) — ${tried.join(" | ")}` };
  }
  if (ANTHROPIC_API_KEY) {
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 16000, thinking: { type: "adaptive" },
          output_config: { effort: "high", format: { type: "json_schema", schema: schemaAnthropic } },
          system, messages: [{ role: "user", content: user }],
        }),
      });
      if (!r.ok) return { ok: false, error: `anthropic ${r.status}: ${(await r.text()).slice(0, 300)}` };
      const data = await r.json() as { stop_reason?: string; model?: string; content?: { type: string; text?: string }[] };
      if (data.stop_reason === "refusal") return { ok: false, error: "model declined (refusal)" };
      const text = (data.content ?? []).find((b) => b.type === "text")?.text;
      const parsed = text ? parseJSON(text) : null;
      if (!parsed) return { ok: false, error: "model returned invalid JSON" };
      return { ok: true, data: parsed, model: data.model ?? ANTHROPIC_MODEL };
    } catch (e) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  }
  return { ok: false, reason: "no_key" };
}

// Tiny helpers to build the parallel Gemini/JSON-Schema string-field shapes.
const gStr = { type: "STRING" };
const aStr = { type: "string" };

// ── Daily brief synthesis ─────────────────────────────────────────────────────────
interface Brief {
  headline: string; summary: string; discussion_plain: string; pattern: string;
  chase_targets: { area: string; reason: string; hazards: string }[];
  history_recap: string; confidence: string;
}
type BriefResult = { ok: true; brief: Brief; model: string } | { ok: false; reason: "no_key" } | { ok: false; error: string };

const BRIEF_SYSTEM =
  "You are the lead severe-weather forecaster for StormSync VIP (SSWX), a premium forecasting service. " +
  "You write a single nightly national brief from SPC convective-outlook data. Be accurate, vivid but not " +
  "alarmist, and grounded strictly in the data provided — never invent specific towns or numbers that aren't " +
  "supported. If there is no severe risk, say so plainly. Always defer to official NWS/SPC products for " +
  "life-safety decisions.";

async function generateBrief(src: SourceData): Promise<BriefResult> {
  const user =
    "Today's SPC convective outlook data (JSON):\n" + JSON.stringify(src, null, 2) +
    "\n\nWrite the SSWX daily severe-weather brief as JSON with these fields:\n" +
    "- headline: one punchy line summarizing today's national severe threat.\n" +
    "- summary: 2-4 sentence daily briefing for the dashboard.\n" +
    "- discussion_plain: a longer plain-language forecast discussion (no jargon), 3 short paragraphs separated by blank lines: (1) what's happening across the country today and why, (2) where the action is and who should pay attention over the next 24 hours, (3) the Day 2-3 trend and bottom-line takeaway. Conversational, ~9-12 sentences total.\n" +
    "- pattern: 2-3 sentences on the broader weather pattern and the Day 2-3 trend.\n" +
    "- chase_targets: 0-2 best storm-chase target areas (empty array if no real risk), each with area, reason, hazards.\n" +
    "- history_recap: 1-2 sentences recapping today's storm reports so far (tornado/hail/wind counts).\n" +
    "- confidence: one of low, moderate, high.";
  const schemaGemini = {
    type: "OBJECT",
    required: ["headline", "summary", "discussion_plain", "pattern", "chase_targets", "history_recap", "confidence"],
    properties: {
      headline: gStr, summary: gStr, discussion_plain: gStr, pattern: gStr,
      chase_targets: { type: "ARRAY", items: { type: "OBJECT", required: ["area", "reason", "hazards"], properties: { area: gStr, reason: gStr, hazards: gStr } } },
      history_recap: gStr, confidence: { type: "STRING", enum: ["low", "moderate", "high"] },
    },
  };
  const schemaAnthropic = {
    type: "object", additionalProperties: false,
    required: ["headline", "summary", "discussion_plain", "pattern", "chase_targets", "history_recap", "confidence"],
    properties: {
      headline: aStr, summary: aStr, discussion_plain: aStr, pattern: aStr,
      chase_targets: { type: "array", items: { type: "object", additionalProperties: false, required: ["area", "reason", "hazards"], properties: { area: aStr, reason: aStr, hazards: aStr } } },
      history_recap: aStr, confidence: { type: "string", enum: ["low", "moderate", "high"] },
    },
  };
  const res = await aiJSON(BRIEF_SYSTEM, user, schemaGemini, schemaAnthropic);
  if (!res.ok) return res;
  return { ok: true, brief: res.data as unknown as Brief, model: res.model };
}

// ── U-19 Severe Weather History ─────────────────────────────────────────────────
const BACKFILL_DAYS = 45;
// SPC keeps revising a day's report files after the fact — late reports arrive
// and duplicates are filtered out — so a day written once from the preliminary
// file drifts from SPC by hundreds of wind reports in either direction. Days
// inside this trailing window are re-fetched every run; older ones are only
// filled if missing.
const RESYNC_DAYS = 21;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type PeriodId = "week" | "lastmonth" | "thismonth" | "thisyear";
interface DayCount { report_date: string; tornado: number; hail: number; wind: number }
interface PeriodAgg {
  id: PeriodId; label: string; start: string; end: string;
  stats: { tornadoes: number; hail_reports: number; wind_reports: number; deaths: number | null };
  events: { date: string; title: string; location: string; category: string; impact: string }[];
}

// Fetch SPC per-day report counts for any days missing from the ledger (bounded).
async function backfillCounts(): Promise<void> {
  const today = new Date();
  const wanted: string[] = [];
  for (let i = 1; i <= BACKFILL_DAYS; i++) { const d = new Date(today); d.setUTCDate(today.getUTCDate() - i); wanted.push(isoDate(d)); }
  const oldest = wanted[wanted.length - 1];
  const { data } = await admin.from("daily_report_counts").select("report_date").gte("report_date", oldest);
  const have = new Set((data ?? []).map((r: { report_date: string }) => r.report_date));
  // wanted[] runs newest-first, so the first RESYNC_DAYS entries are the recent
  // window that gets refreshed regardless of whether a row already exists.
  const stale = wanted.slice(0, RESYNC_DAYS);
  const missing = wanted.slice(RESYNC_DAYS).filter((d) => !have.has(d));
  const targets = [...stale, ...missing];
  for (const grp of chunk(targets, 6)) {
    await Promise.all(grp.map(async (d) => {
      const yymmdd = d.slice(2).replace(/-/g, ""); // YYMMDD
      const [t, h, w] = await Promise.all([
        countCsv(`${SPC}/climo/reports/${yymmdd}_rpts_torn.csv`),
        countCsv(`${SPC}/climo/reports/${yymmdd}_rpts_hail.csv`),
        countCsv(`${SPC}/climo/reports/${yymmdd}_rpts_wind.csv`),
      ]);
      await admin.from("daily_report_counts").upsert({ report_date: d, tornado: t, hail: h, wind: w, updated_at: new Date().toISOString() }, { onConflict: "report_date" });
    }));
  }
}

function aggregatePeriods(rows: DayCount[], today: Date): { periods: PeriodAgg[]; trackingSince: string | null } {
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const weekStart = new Date(today); weekStart.setUTCDate(today.getUTCDate() - 6);
  const thisMonthStart = new Date(Date.UTC(y, m, 1));
  const lastMonthStart = new Date(Date.UTC(y, m - 1, 1));
  const lastMonthEnd = new Date(Date.UTC(y, m, 0));
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const lm = lastMonthStart.getUTCMonth(), lmy = lastMonthStart.getUTCFullYear();
  const defs: { id: PeriodId; label: string; start: string; end: string }[] = [
    { id: "week", label: "Past 7 days", start: isoDate(weekStart), end: isoDate(today) },
    { id: "lastmonth", label: `${MONTHS[lm]} ${lmy}`, start: isoDate(lastMonthStart), end: isoDate(lastMonthEnd) },
    { id: "thismonth", label: `${MONTHS[m]} ${y} (so far)`, start: isoDate(thisMonthStart), end: isoDate(today) },
    { id: "thisyear", label: `${y} year-to-date`, start: isoDate(yearStart), end: isoDate(today) },
  ];
  const periods = defs.map((d) => {
    const inRange = rows.filter((r) => r.report_date >= d.start && r.report_date <= d.end);
    const stats = {
      tornadoes: inRange.reduce((s, r) => s + r.tornado, 0),
      hail_reports: inRange.reduce((s, r) => s + r.hail, 0),
      wind_reports: inRange.reduce((s, r) => s + r.wind, 0),
      deaths: null as number | null, // no authoritative fatalities feed wired — shown as "—"
    };
    const top = [...inRange]
      .map((r) => ({ ...r, total: r.tornado * 3 + r.hail + r.wind }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
    const events = top.map((r) => {
      const dt = new Date(r.report_date + "T00:00:00Z");
      const date = `${MONTHS[dt.getUTCMonth()].slice(0, 3)} ${dt.getUTCDate()}`;
      const category = r.tornado >= 3 ? "Tornado" : "Severe Storms";
      const title = r.tornado > 0 ? `${r.tornado} tornado report${r.tornado !== 1 ? "s" : ""} nationwide` : `${r.hail + r.wind} severe report${r.hail + r.wind !== 1 ? "s" : ""}`;
      return { date, title, location: "Nationwide", category, impact: `SPC logged ${r.tornado} tornado, ${r.hail} hail and ${r.wind} wind reports this day.` };
    });
    return { ...d, stats, events };
  });
  const trackingSince = rows.length ? rows.map((r) => r.report_date).sort()[0] : null;
  return { periods, trackingSince };
}

async function generateHistoryNarratives(periods: PeriodAgg[]): Promise<{ map: Record<string, { headline: string; summary: string }>; model: string | null }> {
  const compact = periods.map((p) => ({ period: p.id, label: p.label, range: `${p.start}..${p.end}`, ...p.stats }));
  const user =
    "US national severe-weather report tallies per period (from SPC storm reports SSWX has tracked):\n" +
    JSON.stringify(compact, null, 2) +
    "\n\nFor EACH period id (week, lastmonth, thismonth, thisyear), write a JSON object with:\n" +
    "- headline: one factual line with the period label and the headline numbers.\n" +
    "- summary: 2-3 sentences contextualizing the activity. Stay strictly grounded in these counts — " +
    "do NOT invent specific towns, dates, fatalities, or named events. Note if a period looks quiet or active.\n" +
    "Return an object keyed exactly by those four period ids.";
  const perObj = (str: typeof gStr) => ({ type: str.type === "STRING" ? "OBJECT" : "object", ...(str.type === "STRING" ? {} : { additionalProperties: false }), required: ["headline", "summary"], properties: { headline: str, summary: str } });
  const schemaGemini = { type: "OBJECT", properties: { week: perObj(gStr), lastmonth: perObj(gStr), thismonth: perObj(gStr), thisyear: perObj(gStr) } };
  const schemaAnthropic = { type: "object", additionalProperties: false, required: ["week", "lastmonth", "thismonth", "thisyear"], properties: { week: perObj(aStr), lastmonth: perObj(aStr), thismonth: perObj(aStr), thisyear: perObj(aStr) } };
  const res = await aiJSON("You are a severe-weather data summarizer. Be factual, concise, and grounded strictly in the counts provided.", user, schemaGemini, schemaAnthropic);
  if (!res.ok) return { map: {}, model: null };
  return { map: res.data as unknown as Record<string, { headline: string; summary: string }>, model: res.model };
}

function deterministicPeriodNarrative(p: PeriodAgg): { headline: string; summary: string } {
  const { tornadoes, hail_reports, wind_reports } = p.stats;
  const total = tornadoes + hail_reports + wind_reports;
  return {
    headline: total > 0
      ? `${p.label}: ${tornadoes} tornado, ${hail_reports} hail & ${wind_reports} wind reports`
      : `${p.label}: a quiet stretch nationally`,
    summary: total > 0
      ? `SSWX tracked ${tornadoes.toLocaleString()} tornado, ${hail_reports.toLocaleString()} hail and ${wind_reports.toLocaleString()} wind reports across the U.S. during this period.`
      : `No significant severe-weather reports were logged nationally for this period.`,
  };
}

// Orchestrates the history update. Best-effort and never throws.
// How many days' superlatives to backfill per run. The ledger predates these
// columns, so `details_at is null` is the work queue; bounding it keeps one
// invocation inside its time budget and the backlog drains over a few nights.
const DETAIL_BACKFILL_PER_RUN = 25;

async function backfillDetails(): Promise<number> {
  // Two kinds of work, not one.
  //
  // `details_at is null` is the original queue: rows written before these
  // columns existed. But a day could also be *stamped* with nothing in it —
  // which is exactly what happened to every recent day. Today's detail was
  // written at 11:00 UTC from the SPC archive file for today, and SPC's
  // convective day runs 12Z to 12Z, so that file is still a bare header when
  // the engine reads it. The row got zeros and a `details_at`, and the queue
  // never looked at it again.
  //
  // So a finished day that has reports but no superlative is work too.
  const [{ data: never }, { data: empty }] = await Promise.all([
    admin.from("daily_report_counts").select("report_date")
      .is("details_at", null)
      .order("report_date", { ascending: false })
      .limit(DETAIL_BACKFILL_PER_RUN),
    admin.from("daily_report_counts").select("report_date")
      .is("top_state", null).is("max_hail_in", null).is("max_gust_kt", null)
      .or("tornado.gt.0,hail.gt.0,wind.gt.0")
      .lt("report_date", isoDate(new Date(Date.now() - 36 * 3600_000)))
      .order("report_date", { ascending: false })
      .limit(DETAIL_BACKFILL_PER_RUN),
  ]);
  const dates = [...new Set([
    ...((never ?? []) as { report_date: string }[]).map((r) => r.report_date),
    ...((empty ?? []) as { report_date: string }[]).map((r) => r.report_date),
  ])].slice(0, DETAIL_BACKFILL_PER_RUN);
  for (const grp of chunk(dates, 5)) {
    await Promise.all(grp.map(async (d) => {
      const detail = await fetchDayDetail(d.slice(2).replace(/-/g, ""));
      await admin.from("daily_report_counts")
        .update({ ...detail, details_at: new Date().toISOString() })
        .eq("report_date", d);
    }));
  }
  return dates.length;
}

async function updateHistory(src: SourceData): Promise<{ model: string | null; detailsBackfilled: number }> {
  const today = new Date();
  const todayStr = isoDate(today);
  // 1) Record today's live counts AND superlatives. Today's row is rewritten on
  //    every run because reports keep landing through the day.
  //
  //    `details_at` is deliberately NOT set here. SPC's convective day runs 12Z
  //    to 12Z, so the archive file for today is still filling — often a bare
  //    header at the hour this runs. Stamping it would mark the day finished
  //    and take it out of the backfill queue forever, which is how twenty-five
  //    consecutive days ended up with a thousand wind reports and no peak gust.
  //    The superlatives are still written, so the page shows what is known so
  //    far; the day is stamped once it is over.
  const todayDetail = await fetchDayDetail(todayStr.slice(2).replace(/-/g, ""));
  await admin.from("daily_report_counts").upsert(
    {
      report_date: todayStr,
      tornado: src.reports_today.tornado, hail: src.reports_today.hail, wind: src.reports_today.wind,
      ...todayDetail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "report_date" },
  );
  // 2) Fill any recent gaps from the SPC archive.
  await backfillCounts();
  // 2b) Fill superlatives for days recorded before those columns existed.
  const detailsBackfilled = await backfillDetails();
  // 3) Aggregate the four periods from the ledger.
  const yearStart = isoDate(new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1)));
  const { data } = await admin.from("daily_report_counts").select("report_date,tornado,hail,wind").gte("report_date", yearStart).order("report_date");
  const { periods, trackingSince } = aggregatePeriods((data ?? []) as DayCount[], today);
  // 4) AI narratives (deterministic fallback per period).
  const { map, model } = await generateHistoryNarratives(periods);
  const now = new Date().toISOString();
  for (const p of periods) {
    const ai = map[p.id];
    const det = deterministicPeriodNarrative(p);
    await admin.from("severe_history").upsert({
      period: p.id,
      period_label: p.label,
      headline: ai?.headline ?? det.headline,
      summary: ai?.summary ?? det.summary,
      stats: p.stats,
      events: p.events,
      tracking_since: trackingSince,
      updated_at: now,
    }, { onConflict: "period" });
  }
  return { model, detailsBackfilled };
}

// ── U-20 Forecast Game scoring (two-pin, P-5.1) ─────────────────────────────────
// Each round has TWO calls, scored independently and summed:
//   ⚡ severe pin  — how close you got to the day's storm reports, ANY kind
//   🌪 tornado pin — how close you got to a TORNADO report, or a deliberate
//                    "no tornadoes today" call
//
// THE SCORING IS A CONTEST, NOT A TEST. It used to be neither: each pin was
// scored alone against fixed distance bands, so on a quiet day nobody could
// score and on a big day everybody maxed out, and two people 30 miles apart in
// the same county both banked the same 1000. Now the field is ranked — the
// closest pin of the day wins the day — and the bands are what everybody else
// gets for being close. What a good call is worth depends on what everybody
// else called, which is what makes it a game.
//
// These numbers are duplicated in src/lib/gameDb.ts purely so the rules card
// can render them. THIS copy is authoritative — scoring must never be computed
// from anything the browser sends. Change one, change both.

/** ⚡ Placement, closest first. */
const SEVERE_PLACES = [1000, 950, 750, 500, 250];
/** ⚡ And for everyone outside the placings, paid on distance alone. */
const SEVERE_CONSOLATION: [number, number][] = [[75, 175], [100, 125], [250, 100]];

/**
 * 🌪 Placement, closest first — awarded however far away the closest pin was.
 *
 * Deliberately unconditional: on a day with tornadoes, somebody was the
 * closest to one, and being the closest is the thing being rewarded. A
 * distance floor here would mean nobody wins the tornado call on the days it
 * is hardest to win.
 */
const TORNADO_PLACES = [1000, 750, 500];
/** 🌪 And actually landing on one pays more than winning the day. */
const TORNADO_BULLSEYE_MI = 25;
const TORNADO_BULLSEYE = 1500;
/** 🌪 Awarded when a member calls "no tornadoes" and the day verifies with zero. */
const QUIET_DAY_BONUS = 750;

interface ReportPt { lat: number; lon: number; kind: "torn" | "hail" | "wind" }
function haversineMi(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
async function fetchReportPoints(yymmdd: string): Promise<ReportPt[]> {
  const out: ReportPt[] = [];
  const kinds: ReportPt["kind"][] = ["torn", "hail", "wind"];
  await Promise.all(kinds.map(async (kind) => {
    try {
      const r = await fetch(`${SPC}/climo/reports/${yymmdd}_rpts_${kind}.csv`, { headers: { "User-Agent": UA } });
      if (!r.ok) return;
      const lines = (await r.text()).trim().split(/\r?\n/);
      const header = lines.shift()?.split(",") ?? [];
      const latI = header.findIndex((h) => /lat/i.test(h)), lonI = header.findIndex((h) => /lon/i.test(h));
      if (latI < 0 || lonI < 0) return;
      for (const line of lines) {
        const c = line.split(",");
        const lat = parseFloat(c[latI]), lon = parseFloat(c[lonI]);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) out.push({ lat, lon, kind });
      }
    } catch { /* skip kind */ }
  }));
  return out;
}
/** Miles from (lat,lon) to the closest report, or Infinity when there are none. */
function nearestMi(lat: number, lon: number, pts: ReportPt[]): number {
  let best = Infinity;
  for (const p of pts) {
    const d = haversineMi(lat, lon, p.lat, p.lon);
    if (d < best) best = d;
  }
  return best;
}
function bandPoints(dist: number, bands: [number, number][]): number {
  for (const [within, pts] of bands) if (dist <= within) return pts;
  return 0;
}

/**
 * Standard competition ranking over a field of distances.
 *
 * `dist[i] === null` means that member is not in the running at all (no pin, or
 * nothing to be near) and is skipped rather than ranked last — being absent
 * from a contest is not the same as coming last in it.
 *
 * Equal distances share the best award still on the table and consume the
 * places they tie for, so two pins in the same spot cannot be separated by
 * whichever row the database happened to return first. Distances are floats
 * off a haversine, so "equal" is to a thousandth of a mile — about six feet,
 * far below the precision of an SPC report's own coordinates.
 */
function rankedAwards(dist: (number | null)[], places: number[]): number[] {
  const out: number[] = new Array(dist.length).fill(0);
  const field = dist
    .map((d, index) => ({ index, d }))
    .filter((e): e is { index: number; d: number } => e.d !== null && Number.isFinite(e.d))
    .sort((a, b) => a.d - b.d);
  let i = 0;
  while (i < field.length && i < places.length) {
    let j = i;
    while (j + 1 < field.length && Math.abs(field[j + 1].d - field[i].d) < 1e-3) j++;
    for (let k = i; k <= j; k++) out[field[k].index] = places[i];
    i = j + 1;
  }
  return out;
}

interface PinSet { lat: number; lon: number; tor: { lat: number; lon: number } | null }

/**
 * ⚡ pins — the five closest to the day's reports place, everybody else is
 * paid on distance. A day with no reports anywhere pays nothing: there was
 * nothing to forecast, and the tornado call is what carries a quiet day.
 */
function scoreSevereField(pins: PinSet[], all: ReportPt[]): number[] {
  const dist = pins.map((p) => (all.length === 0 ? null : nearestMi(p.lat, p.lon, all)));
  const placed = rankedAwards(dist, SEVERE_PLACES);
  return dist.map((d, i) => (placed[i] > 0 ? placed[i] : d === null ? 0 : bandPoints(d, SEVERE_CONSOLATION)));
}

/**
 * 🌪 pins — the three closest to a tornado place, at any distance, and a pin
 * that actually lands on one beats all three. No pin at all is the explicit
 * quiet-day call, which pays only when the day really did verify with zero
 * tornado reports.
 */
function scoreTornadoField(pins: PinSet[], torn: ReportPt[]): number[] {
  const dist = pins.map((p) =>
    p.tor === null || torn.length === 0 ? null : nearestMi(p.tor.lat, p.tor.lon, torn));
  const placed = rankedAwards(dist, TORNADO_PLACES);
  return pins.map((p, i) => {
    if (p.tor === null) return torn.length === 0 ? QUIET_DAY_BONUS : 0;
    if (torn.length === 0) return 0;   // called a tornado on a day with none
    const bullseye = dist[i] !== null && dist[i]! <= TORNADO_BULLSEYE_MI ? TORNADO_BULLSEYE : 0;
    return Math.max(placed[i], bullseye);
  });
}
// Loyalty point values for game placements (admin-configurable in app_config).
async function loyaltyGameAwards(): Promise<number[]> {
  const { data } = await admin.from("app_config").select("value").eq("key", "loyalty_rules").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, number>;
  return [v.game_win_1st ?? 35, v.game_win_2nd ?? 25, v.game_win_3rd ?? 15, v.game_win_4th ?? 10];
}
const PLACE = ["1st", "2nd", "3rd", "4th"];
// Settle the previous month once (idempotent — skips if the winner row exists):
// crown the winner and credit the top-4 their game-win loyalty points.
async function rollupMonth(today: Date): Promise<void> {
  // The month ends on the Eastern clock too, so a run in the small hours of
  // the 1st settles the month that has actually just ended.
  if (gameDate(today).slice(-2) !== "01") return;
  const pm = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const month = `${pm.getUTCFullYear()}-${String(pm.getUTCMonth() + 1).padStart(2, "0")}`;
  const { data: existing } = await admin.from("game_winners").select("month").eq("month", month).maybeSingle();
  if (existing) return; // already settled — don't double-award
  const start = isoDate(pm), end = isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)));
  const { data: rows } = await admin.from("game_guesses").select("user_id,user_name,points").gte("guess_date", start).lte("guess_date", end).not("points", "is", null);
  const tally = new Map<string, { name: string; points: number }>();
  for (const r of (rows ?? []) as { user_id: string; user_name: string; points: number }[]) {
    const cur = tally.get(r.user_id) ?? { name: r.user_name, points: 0 };
    cur.points += r.points ?? 0; tally.set(r.user_id, cur);
  }
  const ranked = [...tally.entries()].map(([user_id, v]) => ({ user_id, ...v })).sort((a, b) => b.points - a.points);
  if (ranked.length === 0) return;
  await admin.from("game_winners").upsert({ month, user_id: ranked[0].user_id, user_name: ranked[0].name, points: ranked[0].points }, { onConflict: "month" });
  const awards = await loyaltyGameAwards();
  for (let i = 0; i < Math.min(4, ranked.length); i++) {
    if (awards[i] > 0) {
      await admin.from("loyalty_events").insert({ user_id: ranked[i].user_id, kind: "game_win", points: awards[i], note: `Forecast Game ${PLACE[i]} place — ${month}` });
    }
  }
}
interface GuessRow {
  id: string; user_id: string; user_name: string;
  lat: number; lon: number; tor_lat: number | null; tor_lon: number | null;
  points: number | null;
}
async function scoreGame(): Promise<{ scored: number; entrants: number; tornadoReports: number }> {
  const runAt = new Date();
  await rollupMonth(runAt); // runs even on a day with no new guesses
  // Yesterday's round, on the Eastern clock the round itself ran on. Taking
  // "yesterday" off the UTC date meant that between midnight and 8pm Eastern
  // the two disagreed, and the job scored a day that was not the one that had
  // just finished for the people who played it.
  const dateStr = gameDateOffset(-1, runAt);

  /*
   * THE WHOLE DAY IS READ, not only the unscored rows.
   *
   * Placement is relative, so a member's score depends on where everybody else
   * pinned. Ranking only the rows still waiting to be scored would mean that if
   * a run ever half-finished, the survivors would be ranked against a field
   * missing the people who beat them — and somebody would be handed first place
   * they did not win. So the field is every entry for the day; `points is null`
   * stays the guard on WRITING, which is what keeps the ledger from being
   * credited twice.
   */
  const { data: guesses } = await admin
    .from("game_guesses").select("id,user_id,user_name,lat,lon,tor_lat,tor_lon,points")
    .eq("guess_date", dateStr);
  const field = (guesses ?? []) as GuessRow[];
  const pending = field.filter((g) => g.points === null);
  if (pending.length === 0) return { scored: 0, entrants: field.length, tornadoReports: 0 };

  const all = await fetchReportPoints(dateStr.slice(2).replace(/-/g, ""));
  const torn = all.filter((p) => p.kind === "torn");
  const now = new Date().toISOString();

  const pins: PinSet[] = field.map((g) => ({
    lat: g.lat, lon: g.lon,
    tor: g.tor_lat !== null && g.tor_lon !== null ? { lat: g.tor_lat, lon: g.tor_lon } : null,
  }));
  const severeAll = scoreSevereField(pins, all);
  const tornadoAll = scoreTornadoField(pins, torn);

  let scored = 0;
  for (let i = 0; i < field.length; i++) {
    const g = field[i];
    if (g.points !== null) continue;
    const severe = severeAll[i], tornado = tornadoAll[i];
    const total = severe + tornado;
    await admin.from("game_guesses").update({
      severe_points: severe, tornado_points: tornado, points: total, scored_at: now,
    }).eq("id", g.id);

    // Mirror into the shared ledger so the Forecast Game and Trivia total into
    // one week/month/year board.
    await admin.from("game_points").insert({
      user_id: g.user_id, user_name: g.user_name, source: "forecast_game",
      points: total, earned_on: dateStr,
      detail: { severe_points: severe, tornado_points: tornado, quiet_day_call: g.tor_lat === null },
    });
    scored++;
  }
  return { scored, entrants: field.length, tornadoReports: torn.length };
}

// ── Persistence ─────────────────────────────────────────────────────────────────
async function upsertBrief(row: Record<string, unknown>): Promise<void> {
  await admin.from("daily_brief").upsert(row, { onConflict: "brief_date" });
}
async function logRun(row: Record<string, unknown>): Promise<void> {
  // Best-effort, but not silent. A `.insert()` that fails resolves with an
  // error rather than throwing, so the `catch` here never saw the two days this
  // table spent rejecting every row for want of a grant on its own sequence.
  try {
    const { error } = await admin.from("storm_engine_runs").insert(row);
    if (error) console.error("storm_engine_runs insert failed:", error.message);
  } catch (e) { console.error("storm_engine_runs insert threw:", String(e)); }
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

  /*
   * Scoring on its own, without the brief.
   *
   * The round now ends at midnight Eastern, and the members who played it
   * should see their score when it ends rather than at breakfast — but the
   * full run generates the daily brief off an AI call and reads five feeds,
   * which is a morning job and has no business firing at midnight. So the
   * scorer is reachable by itself, and the cron calls it twice: once at each
   * of the two UTC hours that can be midnight Eastern, since cron has no
   * concept of a time zone. Whichever of the two lands after the turnover does
   * the work; the other finds yesterday already scored and does nothing, which
   * is exactly what `points is null` has always guaranteed.
   */
  if (body.action === "score-game") {
    try {
      const game = await scoreGame();
      await logRun({ brief_date: briefDate, status: "game-scored", trigger: auth.trigger,
                     duration_ms: Date.now() - started, detail: JSON.stringify(game) });
      return json({ ok: true, game });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      await logRun({ brief_date: briefDate, status: "game-error", trigger: auth.trigger, detail: msg });
      return json({ ok: false, error: msg }, 500);
    }
  }

  try {
    const src = await ingest();
    const overview = riskOverview(src);

    if (dryRun) {
      await logRun({ brief_date: briefDate, status: "dry-run", trigger: auth.trigger, duration_ms: Date.now() - started, detail: "dry run — no write" });
      return json({ ok: true, dryRun: true, source_data: src, risk_overview: overview, ai_key_configured: AI_KEY_SET, ai_provider: GEMINI_API_KEY ? "gemini" : ANTHROPIC_API_KEY ? "anthropic" : null });
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
    } else if ("reason" in ai && ai.reason === "no_key") {
      await upsertBrief({
        brief_date: briefDate, status: "skipped", model: null,
        headline: deterministicHeadline(src),
        summary: "Automated SPC risk overview. The AI daily brief activates once the Storm Engine API key is configured.",
        content: { risk_overview: overview }, source_data: src, error: null, generated_at: null,
      });
      await logRun({ brief_date: briefDate, status: "skipped", trigger: auth.trigger, duration_ms: Date.now() - started, detail: "no AI key set (GEMINI_API_KEY or ANTHROPIC_API_KEY)" });
    } else {
      const errMsg = "error" in ai ? ai.error : "unknown AI error";
      await upsertBrief({
        brief_date: briefDate, status: "error", model: null,
        headline: deterministicHeadline(src), summary: "",
        content: { risk_overview: overview }, source_data: src, error: errMsg, generated_at: null,
      });
      await logRun({ brief_date: briefDate, status: "error", trigger: auth.trigger, duration_ms: Date.now() - started, detail: errMsg });
    }

    // Secondary jobs are best-effort — they never fail the brief.
    let history: unknown = null, game: unknown = null;
    try { history = await updateHistory(src); } catch (e) { await logRun({ brief_date: briefDate, status: "history-error", trigger: auth.trigger, detail: String(e instanceof Error ? e.message : e) }); }
    try { game = await scoreGame(); } catch (e) { await logRun({ brief_date: briefDate, status: "game-error", trigger: auth.trigger, detail: String(e instanceof Error ? e.message : e) }); }

    return json({ ok: true, status: ai.ok ? "ok" : ("reason" in ai ? "skipped" : "error"), brief_date: briefDate, history, game });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    await logRun({ brief_date: briefDate, status: "error", trigger: auth.trigger, duration_ms: Date.now() - started, detail: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
