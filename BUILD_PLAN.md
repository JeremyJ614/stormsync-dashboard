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
| AI / Storm Engine | **Anthropic Claude**, behind a provider-agnostic wrapper (1-line model swap) |
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

**Cost:** Infrastructure = **$0** (Supabase free tier + Web Push + Vercel). Only cost
is Claude API for the once-nightly Storm Engine ≈ **a few cents–$1/month**.

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

> 📸 **Screenshots referenced** for items U-07, U-11, U-15, U-19, U-20 — attach these
> to the repo (e.g. `/docs/examples/`) before building those modules so the AI matches
> your expectations exactly.

---

## 5. PHASE CHECKLIST (cross off as we go)

### ☐ Phase 0 — Foundation & Guardrails
- [ ] Install `@supabase/supabase-js`; wire client to `stormsync-vip` (anon key via env)
- [ ] Enable TypeScript **strict**; fix resulting errors *(L2)*
- [ ] CI: typecheck + build must pass on every push *(L2)*
- [ ] Centralized error logging + global error-boundary standard *(L2)*
- [ ] Module status standard (loading/error/empty/ok) — no dead spinners *(L2)*

### ☐ Phase 1 — Backend Migration: Render → Supabase (KEYSTONE)
- [ ] **1A Schema** (RLS + indexes on all): `profiles`, `tiers`, `addons`,
      `tier_addons`, `badges`, `user_badges`, `saved_locations`, `loyalty_points`,
      `loyalty_rules`, `referrals`, `app_config` (versioned *L2*), `push_subscriptions`,
      `weather_cache`, `news_posts`, `signup_form_fields`, `game_*`, `contact_pins`
- [ ] **1B Auth** migration off localStorage → Supabase Auth *(U-pervasive, L2)*
- [ ] **1C Data-proxy Edge Functions** (cached, rate-limited, retrying *L2*):
      `nws-proxy`, `spc-proxy`, `storm-reports`, `mrms-proxy`, tile/image cache *L2*
- [ ] Point frontend at Edge Functions; **remove `VITE_API_URL` / Render entirely**
- [ ] Verify Forecast Discussion (U-03), SSWXCon (U-05), Warning Center (U-06) load real data
- [ ] Run `get_advisors` (security + performance) and resolve findings

### ☐ Phase 2 — The SSWX Storm Engine (Claude, nightly) *(L5)*
- [ ] `storm-engine` Edge Function + provider-agnostic AI wrapper (Claude default)
- [ ] Ingest SPC outlooks + severe params nationwide; write one nightly `daily_brief`
- [ ] Schedule via Supabase cron *(L2)*
- [ ] Wire consumers: Daily Briefing · Storm Chasing targets (U-16) · Forecast Game
      answer key (U-20) · SSWXCon score (U-05) · Severe Weather History (U-19) ·
      Pattern Analysis (U-17) · Forecast Discussion (U-03)

### ☐ Phase 3 — SPC Map Engine (reusable, custom colors + legends)
- [ ] **U-07** Automated SPC Outlook days 1–6, Tornado/Wind/Hail subtabs, your colors + legend
- [ ] **U-11** Thunderstorm Probability map (SPC-style, custom legend = t-storm probability)
- [ ] **U-15** Star/Stargazing Night Sky outlook (cloud cover, moonlight, transparency,
      precip, wind) **+ Aurora view lines from NOAA SWPC Kp** (à la Ryan Hall)
- [ ] Engine reused by Forecast Game overlays (U-20)

### ☐ Phase 4 — Interactive AI Modules (built on Storm Engine)
- [ ] **U-16** Storm Chasing Dash rebuilt: map + nightly AI nationwide param scan →
      2 best chase targets + reasons summary + supporting params + "today's overview" subtab
- [ ] **U-20** Forecast Game: interactive map w/ easy toggleable overlays (SPC categories,
      fronts/dryline/low, simplified CAPE/shear) → drop pin on worst-weather/tornado spot;
      closest wins, next 3 score; **leaderboard subtab**, **monthly-winners subtab** (points
      reset monthly), yearly winner = big prize
- [ ] **U-19** Severe Weather History: AI summaries for last month / last week / current
      week / last year
- [ ] **U-17** AI Weather Pattern Analysis fixed
- [ ] **U-18** AI Knowledge Battle fixed

### ☐ Phase 5 — Reported Bug-Fix Sweep (non-AI)
- [ ] **U-08** Maps render over the sidebar (Leaflet stacking-context vs. z-40 sidebar)
- [ ] **U-29** Regular weather news broken + page-stretch/overflow bug
- [ ] **U-13** MRMS subtabs not working + provide list of available MRMS products to add
- [ ] **U-12** Model Runs: add ~10–15 more parameters
- [ ] **U-14** Tornado Climatology: clean embed (no full webpage chrome)

### ☐ Phase 6 — Member & Account Features
- [ ] **U-02** Dashboard → interchangeable, customizable basic-forecast area, tier-gated
      *(L4 drag-drop layouts, L1 tier-gated teasers)*
- [ ] **L1** "My Locations" — save/switch multiple places everywhere
- [ ] **U-21** Loyalty Dashboard: admin-configurable; points for referrals *(L1)*, renewals,
      game wins; prizes = discounts/coupons; fair-but-not-easy point system (proposed below)
- [ ] **U-27** Badge system: admin CRUD + assign to users; glowing text badges w/ **hex
      color picker**; SVG icons if cheaply available
- [ ] **U-28** Richer, less-boring user profiles
- [ ] **U-23** Emergency Storm Contact → "SSWX Emergency Storm Contact — Direct
      Administrative Line"; remove personal phone from description; correct PIN opens a
      **direct line to admin** (email/SMS relay)
- [ ] **U-22** FAQ / Module Guide: remove tier correlation; explain modules + add-ons only

### ☐ Phase 7 — Admin & Content Tools
- [ ] **U-24** Admin: signup-form builder (custom questions/fields, its own section, richer)
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
- **Forecast Game win (closest):** 50 pts · 2nd: 30 · 3rd: 20 · 4th: 10
- **Sample prize ladder:** 500 pts = 10% off one month · 1,200 = 25% off one month ·
  2,500 = 50% off one month · 5,000 = one free month
- Monthly game points reset after monthly winner; loyalty points persist toward prizes.

---

## 7. Open Questions for Jeremy

1. **Screenshots** for U-07, U-11, U-15, U-19, U-20 — please add to `/docs/examples/`.
2. **U-23 direct line** — preferred relay: email forward, SMS (e.g. Twilio — small cost),
   or both? Twilio SMS isn't free; email is. Your call.
3. **Anthropic API key** — do you have one, or provision at Phase 2?
4. **Payments/tiers** — which processor (Stripe?) is handling the paid subscriptions?
   Not in your 29 items but required for a paid Beta — confirm current setup.
5. **Loyalty point values** (Section 6) — approve or adjust.

---

## 8. FIX LOG (updated every session)

> Format for every entry: **What needed fixing · What it does · Why it happened ·
> What we learned · What we did to fix it.** Append, never delete.

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

*(Remaining U-items 01,02,04,09,10,12,14,15,21,22,23,24,25,26,27,28 are redesigns/new
features tracked in the Phase Checklist; they move into this log if a regression/bug arises.)*

---

## 9. Decision Log
- **2026-06-09** — Retire Render; consolidate backend on Supabase. *(keystone)*
- **2026-06-09** — Storm Engine AI = Anthropic Claude (provider-agnostic), nightly only.
- **2026-06-10** — Backend gets a **dedicated** project `stormsync-vip`
  (ref `djonpetxdjuwcbgftqmt`) for isolation from the live `app-center` site.
  Paused the dormant `SSWX Team Portal` (data preserved) to stay on the free tier. $0/mo.
