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
const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

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

// schemaGemini uses UPPERCASE OpenAPI-subset types; schemaAnthropic uses JSON-Schema.
async function aiJSON(system: string, user: string, schemaGemini: unknown, schemaAnthropic: unknown): Promise<AIRun> {
  if (GEMINI_API_KEY) {
    try {
      const r = await fetch(GEMINI_URL(GEMINI_MODEL, GEMINI_API_KEY), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schemaGemini, temperature: 0.7, maxOutputTokens: 8192 },
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
      const parsed = text ? parseJSON(text) : null;
      if (!parsed) return { ok: false, error: "gemini returned invalid JSON" };
      return { ok: true, data: parsed, model: GEMINI_MODEL };
    } catch (e) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
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
    "- discussion_plain: a plain-language forecast discussion (no jargon) of ~4-6 sentences.\n" +
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
  const missing = wanted.filter((d) => !have.has(d));
  for (const grp of chunk(missing, 6)) {
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
async function updateHistory(src: SourceData): Promise<{ model: string | null }> {
  const today = new Date();
  // 1) Record today's live counts.
  await admin.from("daily_report_counts").upsert(
    { report_date: isoDate(today), tornado: src.reports_today.tornado, hail: src.reports_today.hail, wind: src.reports_today.wind, updated_at: new Date().toISOString() },
    { onConflict: "report_date" },
  );
  // 2) Fill any recent gaps from the SPC archive.
  await backfillCounts();
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
  return { model };
}

// ── U-20 Forecast Game scoring ───────────────────────────────────────────────────
// Distance-banded points: closest guess to any storm report wins. Tornado reports
// grant a bonus band. Runs once nightly for the just-completed (yesterday) round.
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
function scoreGuess(lat: number, lon: number, pts: ReportPt[]): number {
  if (pts.length === 0) return 0;
  let best = Infinity, bestKind: ReportPt["kind"] = "wind";
  for (const p of pts) {
    const d = haversineMi(lat, lon, p.lat, p.lon);
    if (d < best) { best = d; bestKind = p.kind; }
  }
  let pts0 = best <= 25 ? 1000 : best <= 75 ? 600 : best <= 150 ? 300 : best <= 300 ? 100 : 25;
  if (best <= 50 && bestKind === "torn") pts0 += 500; // tornado bullseye bonus
  return pts0;
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
  if (today.getUTCDate() !== 1) return;
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
async function scoreGame(): Promise<{ scored: number }> {
  const today = new Date();
  await rollupMonth(today); // runs even on a day with no new guesses
  const yest = new Date(today); yest.setUTCDate(today.getUTCDate() - 1);
  const dateStr = isoDate(yest);
  const { data: guesses } = await admin.from("game_guesses").select("id,lat,lon,points").eq("guess_date", dateStr).is("points", null);
  if (!guesses || guesses.length === 0) return { scored: 0 };
  const pts = await fetchReportPoints(dateStr.slice(2).replace(/-/g, ""));
  for (const g of guesses as { id: string; lat: number; lon: number }[]) {
    const score = scoreGuess(g.lat, g.lon, pts);
    await admin.from("game_guesses").update({ points: score }).eq("id", g.id);
  }
  return { scored: guesses.length };
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
