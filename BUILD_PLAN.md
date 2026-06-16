# StormSync / SSWX VIP — Master Build Plan (Beta Launch)

> **This is the single source of truth for the VIP Forecasts & Alerts build.**
> Any AI or person working in this repo reads this file first and obeys Section 0.
> Keep it current: check boxes as phases complete, and append to the Fix Log (Section 8).
>
> **Product:** SSWX — VIP Forecasts & Alerts Group (paid, tiered PWA web app)
> **Owner:** Jeremy (@JeremyJ614) · **Goal:** Ship a working **Beta**.
> **Repo:** `jeremyj614/stormsync-dashboard` · **Branch:** `claude/vip-forecasts-alerts-beta-9jnfnr`
> **Last updated:** 2026-06-10

---

## 0. THE RULES — read before touching anything (non-negotiable)

**TO ALL AI PROGRAMS AND CONTRIBUTORS:**

1. **DO NOT modify, add, remove, rename, or change ANYTHING that you were not
   explicitly instructed to change.** No exceptions. No "while I was in here" edits,
   no drive-by refactors, no dependency upgrades, no reformatting, no deleting code
   you think is unused. If you touch it, it must be in your assigned task.
2. **If you find another problem, do NOT fix it.** Add it to the Fix Log (Section 8)
   as "Discovered — awaiting approval" and keep going on your assigned task.
3. **One phase at a time, in order.** Finish and verify the current phase before
   starting the next.
4. **Never break a working feature to build a new one.** If a change risks an
   existing module, stop and ask first.
5. **No dead UI.** Every module must show a real state — loading, error, or empty —
   never a frozen spinner or silent blank.
6. **No secrets in the repo, ever.** Keys live in Supabase Edge Function secrets or
   Vercel env vars. The only key allowed client-side is the Supabase *publishable
   (anon)* key, via env var — never hardcoded.
7. **Verify before you claim done.** Run it, observe it working, report honestly.
8. **Update this document** every work session: check boxes + append to the Fix Log.

---

## 1. What this product is

SSWX VIP is a **paid, tiered PWA web app** for weather enthusiasts and storm chasers.
- **Tiers** unlock progressively better modules and benefits.
- Each tier includes a number of complimentary **Add-Ons** (weather data/forecasting
  products) — higher tier = more complimentary Add-Ons.
- It's deployed on **Vercel**; the backend is **Supabase**.

The Beta goal: every module works with real data, the AI features work, payments/tiers
gate correctly, and the app looks polished enough to wow a new subscriber at login.

---

## 2. The Diagnosis (why so much is broken)

1. **A separate Render backend (`VITE_API_URL`) is DOWN (HTTP 502).** It did two jobs:
   (a) proxied NOAA/NWS/SPC weather data to the browser, and (b) ran all AI features.
   Its death is the root cause of most "broken module" reports (blank maps, "AI
   unavailable", always-peaceful SSWXCon, zeroed storm reports, Storm Chasing 502).
2. **Auth/users/badges/tiers/loyalty live only in `localStorage`** — per-device,
   wipeable, not a real backend.
3. The frontend **does not currently connect to Supabase at all.**

**The fix:** retire Render entirely and build the backend on a dedicated Supabase
project, with the AI consolidated into one nightly "Storm Engine."

---

## 3. LOCKED Tech Stack & Key Facts (handoff info for any AI)

| Area | Decision / Value |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui (no framework change) |
| Hosting | Vercel (custom domain lives here, not Supabase) |
| **Backend project** | **Supabase `stormsync-vip`** — ref **`djonpetxdjuwcbgftqmt`**, region `us-east-2`, org `fyulghldxgakcncruwyy` |
| Database | Supabase Postgres — **RLS on every table + indexes from day 1** |
| Auth | Supabase Auth (replacing localStorage) |
| Data proxy | Supabase **Edge Functions** w/ server-side caching, rate-limit + retry |
| AI / Storm Engine | **Google Gemini Flash (free)**, with **Anthropic Claude** as paid fallback, behind a provider-agnostic wrapper (1-line model swap) |
| Maps | **Leaflet**, consolidated into ONE shared, reusable map component |
| SPC-style maps | One reusable "SPC Map Engine" (custom colors + legends) powering #7/#11/#15/#20 |
| Notifications | Web Push (VAPID) — free |
| Cron | Supabase scheduled functions (nightly Storm Engine) |
| Error logging | Centralized (Sentry or Supabase logs) |
| CI | Typecheck + build gate on every push; TypeScript **strict** mode |
| Client key | Supabase **publishable/anon** key via env var only (never hardcoded) |

**DO NOT touch these other Supabase projects** — they are NOT this product:
`stormsync-app-center` (live applications site), `SSWX Team Portal` (paused),
`stormsync-archive`, `stormsync-academy`.

**Cost:** Infrastructure = **$0** (Supabase free tier + Web Push + Vercel). The
once-nightly Storm Engine AI can run on **Google Gemini Flash's free tier = $0** (one
request/night is far under the free quota); the paid Claude path is ≈ **a few cents–$1/month**.

---

## 4. Scope — your approved additions (from my suggestion lists)

- **L1 (innovation):** Live push alerts · "My Locations" (save/switch places) ·
  Offline/true PWA · Tier-gated unlock teasers · Referral deep-links
- **L2 (perf/longevity):** Migrate off localStorage · Server-side NOAA caching ·
  Slim/lazy splash · Image/tile CDN caching · Centralized error logging ·
  Health-checks + graceful fallbacks · Rate-limit + retry · One shared map component ·
  DB indexes + RLS · Automated cron jobs · TS strict + CI typecheck · Versioned config in DB
- **L3 (new module):** Hurricane / Tropical Tracker
- **L4 (customization):** Multiple dark themes · Accent color (hex) picker ·
  Drag-and-drop dashboard layouts · Glassmorphism design-system pass
- **L5 (legendary):** **The SSWX Storm Engine** — one nightly Claude pipeline that
  writes once and feeds the daily briefing, storm-chasing targets, forecast-game
  answer key, SSWXCon score, severe-weather history, and pattern analysis.

> 📸 **Design references saved** in `/docs/examples/` (see its `README.md`) for
> **U-07, U-11, U-15, U-19**. Build those modules to match the style/behavior shown.
> ⏳ Still needed: a reference for **U-20** (Forecast Game) if you have one.

---

## 5. PHASE CHECKLIST (cross off as we go)

### ✅ Phase 0 — Foundation & Guardrails  (COMPLETE — 2026-06-10)
- [x] Install `@supabase/supabase-js`; wire client to `stormsync-vip` (anon key via env)
      → `src/lib/supabase.ts`, `src/vite-env.d.ts`, `.env.example`
- [x] Enable TypeScript **strict**; fix resulting errors *(L2)* — strict was already on
      but never enforced; fixed 3 latent type errors (see Fix Log F-01..F-03)
- [x] CI: typecheck + build must pass on every push *(L2)* → `.github/workflows/ci.yml`
      (verified locally: typecheck clean, build succeeds)
- [x] Centralized error logging + global error-boundary standard *(L2)*
      → `src/lib/logger.ts` (+ global handlers), `ErrorBoundary` wired, root boundary in `main.tsx`
- [x] Module status standard (loading/error/empty/ok) — no dead spinners *(L2)*
      → `src/components/ModuleStatus.tsx` (`<ModuleState>`, `ModuleError/Empty/Loading`)
- [x] Bonus: added `.gitignore` (none existed — `.env`/`node_modules` were untracked-risk)

### ◐ Phase 1 — Backend Migration: Render → Supabase (KEYSTONE) — IN PROGRESS
- [x] **1A Schema** (RLS + indexes on all) — migration `phase1_core_schema` on
      `stormsync-vip`: `profiles`, `app_config` (versioned *L2*), `badge_defs`,
      `signup_questions`, `news_posts`, `broadcasts`/`broadcast_seen`,
      `contact_submissions`, `game_guesses`/`game_winners`, `saved_locations`,
      `loyalty_events`, `referrals`, `push_subscriptions`, `weather_cache`.
      Auto-profile trigger + tier-escalation guard; seeds for tier_modules,
      emergency_pin, loyalty_rules, badges, signup questions. **Tiers admin-assigned**
      (no payment processor — §7.4). Source: `supabase/README.md`.
- [x] **1A Security hardening** — `phase1_security_hardening`; advisors down to 3
      intentional notices (Decision Log). RLS on every table.
- [x] **1C Data-proxy Edge Function** `weather` (`supabase/functions/weather/index.ts`):
      NWS points/alerts/forecast, SPC storm-reports, SPC outlook GeoJSON; best-effort
      cache; CORS; SSRF-guard. **Verified live** (258 alerts, real storm reports, SPC polygons).
- [x] Pointed frontend at the Edge Function (`src/config.ts`; legacy `VITE_API_URL` kept
      only as fallback). Typecheck + build green.
- [x] Ran `get_advisors` (security) — all resolved except 3 intentional.
- [x] **1B Auth** migration off localStorage → Supabase Auth *(U-pervasive, L2)* —
      **DONE 2026-06-11.** Decision: **email + 4-digit PIN** (kept the existing UX). The
      PIN is deterministically expanded to the Supabase password via `pinToPassword`
      (`pin_<PIN>_sswx`) in both `src/hooks/useAuth.ts` and the Edge Function, because
      the project's 6-char password minimum can't be changed from here. Rewrote
      `useAuth` as a shared Supabase-session store (async `login`/`signup`/`logout`,
      `loading` flag); `User` now mirrors `profiles` (no `pin`). New `src/lib/userAdmin.ts`
      drives admin user management (list via RLS, tier/modules/badges/referrals via
      direct table writes, signup questions + emergency PIN via `signup_questions`/
      `app_config`). Privileged auth ops (create/delete/reset-PIN) go through the new
      `admin-users` Edge Function (verify_jwt + `is_admin` re-check, service role).
      Contact's emergency line now verifies via the `check_emergency_pin` RPC instead of
      reading the PIN. Seeded the admin auth account (`JayMyers@StormSync.Media`, PIN 1337).
      **Verified end-to-end** (admin login, create→member login, non-admin create blocked 403,
      RLS scoping, set-pin, delete-cascade). Typecheck + build green.
      *(News/broadcasts/contact-inbox remain localStorage — they belong to Phase 7.)*
- [x] **In-app browser verification (DONE 2026-06-11)** — drove the real UI headless
      (Chromium/Playwright vs the Vite dev server + live Supabase): login/signup flows,
      admin panel CRUD (users, badges, signups), profile, gating. Module data checks:
      **U-03** real NWS AFD renders (AI plain-language tab still pending Phase 2) ·
      **U-05** SSWXCon live (score 9.4, real alert counts, auto-refresh) ·
      **U-06** real storm reports (13 torn/37 hail/353 wind — "always 0" bug gone) ·
      **U-07** live SPC risk polygons render · **U-11** map renders but the
      `day1probotlk_torn` overlay had 0 upstream features at test time — module is
      already slated for the Phase 3 rebuild ("likely built wrong").
      Note: the U-29 weather-news 404 (`/news/weather` route not implemented in the
      `weather` proxy) confirmed pre-existing, still pending Phase 5.
- [x] **D-01 self-signup tier escalation FIXED** (2026-06-11) — see Fix Log F-06.
- [x] **U-27 Badge system pulled forward & DONE** (2026-06-11) — admin Badge Library
      CRUD (create/edit/delete) with hex color picker + live glowing-badge preview;
      `admin_delete_badge` RPC strips deleted ids from every profile; badges render
      glowing in admin lists and on user profiles. *(SVG icons: not included — revisit
      post-Beta if wanted.)*
- [x] **Signups admin area (U-24 first pass) DONE** (2026-06-11) — dedicated "Signups"
      tab: question builder (add/edit/delete/reorder) and the questions now **render
      live on the public signup form**, with answers stored to the member's profile
      (`custom_answers`). Tier question removed (admin-assigned). Richer styling/branding
      for the form builder can still grow in Phase 7.
- [x] **Remove legacy `VITE_API_URL`/Render references entirely** (2026-06-13) —
      `config.ts` now targets only the Supabase `weather` Edge Function; dropped the
      `VITE_API_URL` env type, `.env.example` entry, and stale "Render" comments.

### ◐ Phase 2 — The SSWX Storm Engine (Claude, nightly) *(L5)* — IN PROGRESS (2026-06-13)
- [x] `storm-engine` Edge Function + provider-agnostic AI wrapper. **Two providers,
      checked in order:** `GEMINI_API_KEY` (Google Gemini Flash, **free tier**,
      `gemini-2.5-flash`) first, else `ANTHROPIC_API_KEY` (Claude `claude-opus-4-8`,
      adaptive thinking) as paid fallback — both via one-line `*_MODEL` swap and
      structured-JSON output. `verify_jwt=false` with internal auth: cron-secret header
      **or** admin JWT. *(Gemini path added & deployed 2026-06-15.)*
- [x] Ingest SPC outlooks (Day 1-3 categorical + Day 1 tornado/wind/hail probabilities)
      and today's storm-report counts; write one `daily_brief` row (schema migration
      `phase2_storm_engine_schema`: `daily_brief` + `storm_engine_runs`, RLS read-for-
      members, writes service-role-only). **Graceful no-key path:** until an AI key
      (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`) is set the engine writes a deterministic
      SPC risk overview (status `skipped`) so the UI is never dead; the AI narrative fills
      in automatically on the first keyed run.
- [x] Schedule via Supabase cron *(L2)* — `pg_cron` + `pg_net`, job `storm-engine-nightly`
      at 11:00 UTC; reads the secret from `app_config` and posts to the function.
      **Verified end-to-end**: dry-run ingest (live SPC), no-key skip write, RLS read
      scoping, cron→function secret-auth path (logged a `cron` run).
- [x] First consumer wired: **Daily Briefing** card on Home (`DailyBriefing.tsx` +
      `lib/dailyBrief.ts`) — renders the risk overview today, AI summary/chase targets
      when status `ok`. **Verified in-browser.**
- [x] **API KEY SET — first real run verified (2026-06-16):** `GEMINI_API_KEY` (free tier)
      live; engine ran end-to-end on `gemini-2.5-flash`, status `ok`, wrote today's brief
      (grounded headline/summary/discussion/pattern + correctly-empty chase_targets on a
      Marginal day). `ANTHROPIC_API_KEY` remains the paid fallback.
- [◐] Remaining consumers (now building against the live AI brief via shared
      `useDailyBrief` hook): **DONE 2026-06-16** — Forecast Discussion plain-language tab
      (U-03), Weather Pattern AI (U-17), Storm Chasing targets (U-16). **Still open:**
      Forecast Game answer key (U-20) · SSWXCon (U-05) · Severe Weather History (U-19,
      needs a new nightly engine job for week/month/year recaps).

### ◐ Phase 3 — SPC Map Engine (reusable, custom colors + legends) — DONE 2026-06-13/15
- [x] **U-07** SPC Outlook **Days 1-6** with SSWX custom colors + legend words — reusable
      `SPCLeafletMap` engine. Days 1-2: Overview + Tornado/Wind/Hail; Day 3: categorical;
      Days 4-6: combined "any severe" (`weather` proxy extended to the SPC day4-8 product;
      distinct "Predictability Too Low" state). Levels 0-5 = Platinum→Carbon-Black (your
      hexes + words); significant = neon border; **Level 5 = near-black `#1E1B29` with a
      slow-pulsing lilac-gray border** (per your iterations). Verified in-browser.
- [x] **U-11** Thunderstorm Probability — was fetching dead `dayNprobotlk_*` URLs; pointed
      it at the working `dayNotlk_{torn,wind,hail}` so it renders through the engine with
      the SSWX styling. Verified.
- [◐] **U-15** **Aurora view lines from NOAA SWPC Kp (à la Ryan Hall) — DONE.** New
      `AuroraViewMap`: peak-3-day + current Kp "view line" latitudes on a North-America map
      with an "aurora possible" band and a your-location marker. Fixed two real SWPC bugs:
      current Kp read a non-existent field (`kp_frac`/`kp`="1M" → NaN; now `estimated_kp`),
      and the Kp forecast chart parsed the wrong JSON shape (array-of-objects, not arrays)
      so it was empty. *(Star/Stargazing cloud/moon page pre-exists; aurora was the new ask.)*
- [ ] Engine reuse by Forecast Game overlays (U-20) — **deferred to Phase 4** (the Forecast
      Game itself is a Phase 4 module).

### ◑ Phase 4 — Interactive AI Modules (built on Storm Engine) — DONE 2026-06-16 (U-18 parked)
- [x] **Shared consumer hook** `useDailyBrief` (React Query, 1-hr cache) — every AI module
      reads the ONE nightly brief instead of making its own AI call (keeps the free tier).
- [x] **U-16** Storm Chasing targets wired to `brief.chase_targets` (area/hazards/reason
      cards + national SSWX briefing); the live **local SWTI gauge + Local Outlook timeline**
      (Open-Meteo, no AI) are retained. *(Per-target CAPE/SRH map pins dropped — the brief
      gives regions, not coords; a future engine pass can add geocoded params.)*
- [x] **U-17** Weather Pattern AI wired to `brief.pattern` + `summary` + a deterministic
      national severe-activity gauge from the SPC `risk_overview` (no per-request AI).
- [x] **U-03** Forecast Discussion: Plain-Language tab reads `brief.discussion_plain`
      (Technical tab keeps the local NWS AFD).
- [x] **U-05** SSWXCon: live alert-based score retained; added a national-picture banner
      from the nightly brief headline + SPC Day-1 category.
- [x] **U-19** Severe Weather History: new nightly engine job maintains a `daily_report_counts`
      ledger (today live + 45-day SPC backfill) and publishes AI-summarized `severe_history`
      rows for week / last-month / this-month / year-to-date (real counts, honest
      "tracking since" labeling, most-active-days from the ledger). Page reads Supabase.
- [x] **U-20** Forecast Game: guesses persist to `game_guesses` (one/day), nightly engine
      scores them by distance to SPC storm reports (tornado bonus) and auto-crowns the
      monthly winner; leaderboard + monthly-winners read Supabase. US map now uses a
      bundled Albers states asset (dead `api/us-states` retired).
- [~] **U-18** AI Knowledge Battle / Forecast Duel — **parked pre-launch** behind
      `HIDDEN_MODULES` (code + route intact; cost model TBD post-launch).

### ◑ Phase 5 — Reported Bug-Fix Sweep (non-AI) — DONE 2026-06-16
- [x] **U-08** Leaflet z-index capped below the fixed sidebar (global `index.css` rule) —
      maps no longer render over the navigation.
- [x] **U-29** Weather news restored: new `/news/weather` route on the `weather` Edge
      Function (Google News RSS parsed server-side). Layout already overflow-safe.
- [x] **U-13** MRMS/radar tabs rebuilt on verified IEM USCOMP composites (reflectivity,
      legacy reflectivity, 1-hr & storm-total precip); old `4326/mrms/*` URLs were 404.
      Live rotation tracks linked out to NSSL's MRMS viewer.
- [x] **U-12** Model Runs: 6 → 20 parameters; `wind_speed_unit=ms` so mph is correct.
- [x] **U-14** Tornado Climatology: full-page SPC iframes replaced with clean per-tool
      launcher cards; native climatology charts / EF scale / outbreaks retained.

### ◐ Phase 6 — Member & Account Features — IN PROGRESS (2026-06-16)
- [ ] **U-02** Dashboard → interchangeable, customizable basic-forecast area, tier-gated
      *(L4 drag-drop layouts, L1 tier-gated teasers)*
- [x] **L1** "My Locations" — save/switch multiple places. Backed by `saved_locations`
      (RLS own-rows); `lib/savedLocations.ts` + `SavedLocations` header control (bookmark
      menu: switch, set-primary ⭐, remove, save-current). Visible to signed-in members.
- [x] **U-21** Loyalty Dashboard: points are now a real `loyalty_events` ledger (balance =
      sum of rows). Member page shows balance, how-to-earn (from config), prize ladder with
      progress, and points history. **Admin-configurable** via the admin Settings tab (edit
      point values + prize ladder in `app_config.loyalty_rules`) and an "award points" form
      per user (referral/renewal/bonus/adjustment). Game wins auto-credit the top-4 at the
      monthly rollup (engine v7). Profile loyalty stat reads the same ledger.
- [x] **U-27** Badge system: admin CRUD + assign to users; glowing text badges w/ **hex
      color picker** — **DONE EARLY in Phase 1B follow-up (2026-06-11)**; SVG icons
      deferred post-Beta
- [x] **U-28** Richer user profiles: gradient hero (avatar/tier/admin/join date), stats
      (loyalty/referrals/member-for/badges), badge showcase, an "About You" section from
      the member's custom signup answers, a saved-locations strip, and quick actions.
- [ ] **U-23** Emergency Storm Contact → "SSWX Emergency Storm Contact — Direct
      Administrative Line"; remove personal phone from description; correct PIN opens a
      **direct line to admin** via **email relay + free carrier email-to-SMS gateway**
- [x] **U-22** FAQ / Module Guide: removed the tier filter + T1–T4 badges; the guide now
      just explains what each module/add-on does (access is admin-enabled, not a tier sheet).

### ☐ Phase 7 — Admin & Content Tools
- [◐] **U-24** Admin: signup-form builder (custom questions/fields, its own section, richer)
      — **first pass done 2026-06-11** (own "Signups" tab; questions render live on the
      public signup form; reorder/edit/delete). "Richer" polish can continue here.
- [ ] **U-25** SSWX News: robust rich-text editor
- [ ] **U-21/U-27** Admin sections for Loyalty rules + Badges CRUD
- [ ] **L2** Versioned `app_config`: change tiers/modules/points without redeploy

### ☐ Phase 8 — Notifications & PWA
- [ ] **U-26 / L1** Web Push phone notifications (fire on NWS warning hitting a saved location)
- [ ] **L1** Offline / true installable PWA (cache last forecast + alerts)

### ☐ Phase 9 — Design System & Redesigns
- [ ] **U-01** Intro/splash screen: **demolish & rebuild** — dark, awe-inspiring,
      cool animations, not too slow *(L2 slim/lazy-load, L4 glassmorphism)*
- [ ] **U-04** AQI Forecast redesign (cooler)
- [ ] **U-09** Atmospheric Ingredients redesign (advanced look)
- [ ] **U-10** Severe Weather Threat Index redesign (advanced look)
- [ ] **L4** Multiple dark themes (Midnight / Storm Purple / NOAA Classic / Amber Chase)
- [ ] **L4** Accent color (hex) picker
- [ ] **L4** Glassmorphism + glow design-system pass

### ☐ Phase 10 — New Module + Performance Hardening
- [ ] **L3** Hurricane / Tropical Tracker (cone + spaghetti models) on the shared map
- [ ] **L2** Code-split heavy maps; bundle-size budget in CI
- [ ] **L2** Tune React Query stale-while-revalidate across weather data
- [ ] Final `get_advisors` security + performance pass

---

## 6. Proposed Loyalty Points System (U-21 — for your approval)

Fair but not easy. All values editable from the admin panel.
- **Referral that converts to paid:** 100 pts
- **Membership renewal:** 50 pts/month renewed
- **Forecast Game win (closest):** 35 pts · 2nd: 25 · 3rd: 15 · 4th: 10  *(approved 2026-06-10)*
- **Sample prize ladder:** 500 pts = 10% off one month · 1,200 = 25% off one month ·
  2,500 = 50% off one month · 5,000 = one free month
- Monthly game points reset after monthly winner; loyalty points persist toward prizes.

---

## 7. Answers / Resolved Decisions (2026-06-10)

1. **Screenshots** — ✅ Provided & saved in `/docs/examples/` for U-07, U-11, U-15, U-19.
   Still open: a U-20 (Forecast Game) reference if one exists.
2. **U-23 direct line** — ✅ **Email + SMS, both free.** Implementation: email relay
   (free) for sure; SMS via **carrier email-to-SMS gateway** (e.g. `number@vtext.com`,
   `@tmomail.net`) which is **free** because the recipient is the admin (we know the
   carrier). No Twilio / paid SMS needed for Beta.
3. **AI provider key** — ✅ **Free path chosen (2026-06-15):** use **Google Gemini Flash's
   free tier** (`GEMINI_API_KEY`, from https://aistudio.google.com/apikey, no card) to keep
   Beta cost at $0; the engine also supports `ANTHROPIC_API_KEY` (Claude) as a paid fallback.
   Store whichever key in Supabase Edge Function secrets (never in the repo or client).
4. **Payments/tiers** — ✅ **Manual for Beta.** Members sign up via a **third-party app**,
   then an **admin handles payment during a setup meeting**. So **no payment-processor
   integration is needed for Beta**; tiers are **assigned/managed by an admin** in the
   admin panel. (Revisit automated billing post-Beta.)
5. **Loyalty point values** — ✅ Approved with one change (game wins now 35/25/15/10).

6. **PIN vs. password** (Phase 1B) — ✅ **Email + 4-digit PIN** (keep existing UX). The
   PIN is expanded to the Supabase password internally; security equals a raw 4-digit PIN.

### Still open
- A **U-20 Forecast Game** visual reference (optional but helpful).

---

## 8. FIX LOG (updated every session)

> Format for every entry: **What needed fixing · What it does · Why it happened ·
> What we learned · What we did to fix it.** Append, never delete.

### Fixed
| ID | What needed fixing | What it does (the module) | Why it happened | What we learned | What we did to fix it |
|---|---|---|---|---|---|
| F-01 | Type error in `ExtendedForecast.tsx` (`.map` callback typed `t: string`) | 7-day extended forecast table | Open-Meteo `daily.time` is typed `(string\|number)[]`; callback declared `string`, so the signatures didn't match under strict `tsc` | Strict was on in tsconfig but **never enforced** — Vercel's `vite build` strips types and skips `tsc`, so latent type bugs shipped silently | Widened the param to `string \| number` (body already casts with `as string`) |
| F-02 | Same error in `PrecipitationMap.tsx` | Precipitation map / daily precip | Identical `daily.time` typing issue | Same root cause as F-01 — recurring pattern across map modules | Widened param to `string \| number` |
| F-03 | Type error in `Forecast.tsx` (`nwsPeriods` is `unknown[]`) | NWS official forecast list | `properties.periods` typed `unknown[]`; `.map` callback declared the full object shape, incompatible with `(value: unknown)` | Untyped API responses need an explicit cast at the boundary, not at each call site | Cast `nwsPeriods` to the period shape once at definition; simplified the `.map` callback |

> All three were **pre-existing** (surfaced the moment the CI `tsc` gate was added in
> Phase 0). The new CI workflow now blocks any future type regression on push/PR.

| F-04 | National alerts returned HTTP 400 | Warning Center / all-US alerts (U-06) | New `weather` proxy mirrored the legacy `/alerts/active?limit=500`; NWS has **removed** the `limit` parameter ("not recognized") | Don't assume legacy upstream params still exist — verify against the live API | Dropped `limit`; use `/alerts/active?status=actual` (returns all active alerts). Verified 258 features |
| F-05 | Hand-seeded admin login failed with `Database error querying schema` (HTTP 500) | Supabase Auth sign-in for the seed admin (Phase 1B) | When inserting the admin straight into `auth.users` via SQL, GoTrue's token columns (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) were left `NULL`; GoTrue can't scan `NULL` into Go strings | Manually-seeded auth users must set those token columns to `''`, not `NULL` (the admin API does this automatically — only raw SQL inserts are affected) | `coalesce(...,'')` on all token columns for the seed row; login then returns a token. Users created via the `admin-users` function / `signUp` are unaffected |
| F-06 (was D-01) | Self-signup could pick **any tier** (incl. Tier 4); worse, raw API callers could put `tier`/`is_admin` in signup metadata | Public signup / tier assignment | The signup trigger trusted client-supplied `raw_user_meta_data->>'tier'`, carried over from the localStorage version; `auth.signUp` metadata is fully client-controlled | **Never derive privilege from client metadata** — the UI hiding a field doesn't stop a raw API call | Migration `phase1b_signup_tier_lockdown`: trigger now hard-codes Tier 1 (admin email exception only); tier picker removed from the signup form; admins assign tiers via new `admin_set_user_tier` RPC (also refreshes the tier's module set). **Verified by attack**: signup requesting tier 4 + is_admin landed Tier 1/non-admin |

### Discovered during investigation (awaiting their phase)
| ID | What needed fixing | What it does (the module) | Why it happened | What we learned | Fix (when done) |
|---|---|---|---|---|---|
| U-08 | Maps cover the sidebar | Sidebar nav overlaps with map modules | Sidebar is `z-40`; Leaflet panes stack ~`z-600` | Leaflet creates high z-index stacking contexts that ignore app z-layers | _pending Phase 5_ |
| U-03 | Forecast Discussion says "AI Service Unavailable" | Plain-language AI forecast discussion | Dead Render AI backend | All AI was centralized on one dead server | _pending Phase 1C/2_ |
| U-05 | SSWXCon always "peaceful", low score | Severe-weather threat scoring | No live alert/report data from dead backend | Score silently defaults to calm on data failure (no error state) | _pending Phase 1C/2_ |
| U-06 | Warning Center storm reports always 0 | Live storm reports count | storm-reports proxy fails → returns 0 | Failures must surface as errors, not zeros | _pending Phase 1C_ |
| U-07 | SPC Outlook not automated/customizable | Days 1–6 SPC risk maps | Needs `/spc/outlook-geojson` proxy (down) + custom render | — | _pending Phase 3_ |
| U-11 | Thunderstorm Probability map blank | T-storm probability map | Same SPC proxy dependency; likely built wrong | — | _pending Phase 3_ |
| U-16 | Storm Chasing "HTTP 502" | Chase-target dashboard | Render backend down | — | _pending Phase 1/2/4_ |
| U-17 | AI Weather Pattern Analysis broken | AI pattern analysis | Dead AI backend | — | _pending Phase 2/4_ |
| U-18 | AI Knowledge Battle broken | AI trivia/quiz | Dead AI backend | — | _pending Phase 4_ |
| U-19 | Severe Weather History broken/incorrect | AI severe-weather recaps | Dead AI backend + wrong scope | — | _pending Phase 2/4_ |
| U-20 | Forecast Game not working / wrong design | Daily prediction game | Built incorrectly; no backend | — | _pending Phase 2/4_ |
| U-29 | Weather news broken + page stretch | Weather news feed | Data source + CSS overflow | — | _pending Phase 5_ |
| U-13 | MRMS subtabs not working | MRMS radar products | Proxy/config | — | _pending Phase 5_ |

*(D-01 was approved 2026-06-11 and fixed — moved to the Fixed table as **F-06**.)*

*(Remaining U-items 01,02,04,09,10,12,14,15,21,22,23,24,25,26,27,28 are redesigns/new
features tracked in the Phase Checklist; they move into this log if a regression/bug arises.)*

---

## 9. Decision Log
- **2026-06-09** — Retire Render; consolidate backend on Supabase. *(keystone)*
- **2026-06-09** — Storm Engine AI = Anthropic Claude (provider-agnostic), nightly only.
- **2026-06-10** — Backend gets a **dedicated** project `stormsync-vip`
  (ref `djonpetxdjuwcbgftqmt`) for isolation from the live `app-center` site.
  Paused the dormant `SSWX Team Portal` (data preserved) to stay on the free tier. $0/mo.
- **2026-06-10** — Design references for U-07/U-11/U-15/U-19 saved to `/docs/examples/`.
- **2026-06-10** — U-23 relay = email + **free** carrier email-to-SMS gateway (no Twilio).
- **2026-06-10** — **No payment processor for Beta**; signup via third-party app, admin
  handles payment at setup meeting and assigns tiers in the admin panel.
- **2026-06-10** — Anthropic API key to be provisioned; stored in Edge Function secrets.
- **2026-06-15** — **AI provider = Google Gemini Flash free tier** (`GEMINI_API_KEY`) to
  hold Beta at $0; Claude (`ANTHROPIC_API_KEY`) kept as a paid fallback. Engine checks
  Gemini first, then Anthropic, else deterministic no-key mode. *(supersedes the 06-09
  "AI = Anthropic Claude" default; the provider-agnostic wrapper made it a config swap.)*
- **2026-06-10** — Forecast Game points set to 35/25/15/10.
- **2026-06-10 (Phase 1)** — `weather` Edge Function deployed with `verify_jwt = false`:
  it proxies only PUBLIC NOAA/NWS/SPC data and writes solely to a service-role cache, so
  it is intentionally public (matches the frontend's header-less `fetch` calls).
- **2026-06-10 (Phase 1)** — Accepted 3 security-advisor notices as intentional:
  `weather_cache` (service-role-only, RLS-on-no-policy), `contact_submissions` anon INSERT
  (public contact form), `check_emergency_pin` callable by authenticated (members verify PIN).
- **2026-06-10 (Phase 1)** — Internal helpers `is_admin`/`modules_for_tier` moved to a
  non-REST-exposed `private` schema; policies resolve them by OID and keep working.
- **2026-06-11 (Phase 1B)** — Auth = **email + 4-digit PIN** (kept existing UX). PIN is
  deterministically expanded to the Supabase password (`pin_<PIN>_sswx`) since the 6-char
  minimum isn't changeable from here; effective security equals a raw 4-digit PIN.
- **2026-06-11 (Phase 1B)** — Privileged auth ops (create/delete/reset-PIN) live in the
  `admin-users` Edge Function (verify_jwt=true + `is_admin` re-check + service role);
  non-privileged profile edits (tier/modules/badges/referrals) go direct via RLS.
- **2026-06-11 (Phase 1B)** — `auth_leaked_password_protection` (HaveIBeenPwned) left
  **disabled**: it would conflict with the PIN-derived password scheme. Accepted.
- **2026-06-11 (Phase 1B follow-up)** — Jeremy approved: fix D-01 now, pull U-27 badge
  CRUD forward, and give signups a dedicated admin area. All three done & verified.
- **2026-06-11 (Phase 1B follow-up)** — New admin RPCs `admin_set_user_tier` (tier change
  also refreshes the module set) and `admin_delete_badge` (deletes a def + strips the id
  from all profiles). Both `SECURITY DEFINER` with an internal `is_admin()` guard —
  the resulting two security-advisor notices are **intentional** (same pattern as
  `check_emergency_pin`; verified non-admins get "admin only").
- **2026-06-11 (Phase 1B follow-up)** — Tier is no longer a signup question (row deleted);
  signup answers are stored keyed by question label in `profiles.custom_answers`.
