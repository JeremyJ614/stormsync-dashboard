# StormSync / SSWX — Master Build Plan

> **Status:** Living document. This is the single source of truth for the rebuild.
> Update the checklists and the Bug-Fix Log as work lands. Do not delete history —
> check items off and append notes.
>
> **Owner:** Jeremy (@JeremyJ614) · **Branch:** `claude/vip-forecasts-alerts-beta-9jnfnr`
> **Last updated:** 2026-06-09

---

## 0. The Golden Rules (read before every change)

These are non-negotiable guardrails for anyone — human or AI — working in this repo.

1. **Do not touch anything you were not instructed to touch.** No "drive-by"
   refactors, renames, dependency bumps, or deletions outside the current task's
   scope. If you spot something else worth fixing, add it to the Bug-Fix Log and
   move on — do not act on it without sign-off.
2. **One phase at a time, in order.** Do not start a later phase before the
   current one is checked off and verified.
3. **Never break a working module to build a new one.** If a change risks an
   existing feature, stop and confirm first.
4. **Every external call must fail gracefully.** No dead spinners, no silent
   blanks. A module that can't load shows a real status (loading / error /
   empty), never a frozen state. (See Phase 0 health-check standard.)
5. **No secrets in the repo.** API keys live in Supabase Edge Function secrets /
   environment config only. Never commit keys, never put them in `VITE_*`
   client vars unless they are public-by-design (publishable keys only).
6. **Verify before claiming done.** A task is "done" only after it's been run
   and observed working. Report failures honestly with the actual output.
7. **Keep this document current.** Check boxes, add dated notes, log decisions.

---

## 1. The Diagnosis (why we're doing this)

The deployed app is **frontend-only**. A separate **Render backend** (`VITE_API_URL`)
did two jobs: (a) proxied NOAA/NWS/SPC data to the browser, and (b) ran all AI
features. **That backend is down (HTTP 502), which is the single root cause of
most reported bugs** — blank maps, "AI unavailable," always-peaceful SSWXCon,
zeroed storm reports, and the Storm Chasing 502.

Secondary problem: **auth, users, badges, tiers, and loyalty live only in
`localStorage`** — per-device, wipeable, not a real backend. Four Supabase
projects exist but the frontend never connects to any of them.

**The fix:** retire the Render backend entirely and consolidate onto **Supabase**
(Postgres + Auth + Edge Functions + Web Push), which gives us a real database,
server-side data caching, and a home for the AI — all on the free tier.

---

## 2. Locked Tech Stack & Decisions

| Area | Decision | Notes |
|---|---|---|
| Frontend | Keep React + Vite + TypeScript + Tailwind + shadcn/ui | No framework change |
| Maps | Leaflet, **consolidated into one shared map component** | Kills ~10 near-dup setups (List 2 #10) |
| Backend | **Supabase** — retire Render entirely | Keystone migration |
| Supabase project | **`stormsync-app-center`** (`mmtuorpttubtxqfxnbwa`, ACTIVE) | Reuse existing; avoid new project to stay on free tier |
| Database | Supabase Postgres, **RLS on every table + proper indexes from day 1** | List 2 #11 |
| Auth | Supabase Auth (migrate off localStorage) | List 2 #1 |
| Data proxy | Supabase **Edge Functions** w/ server-side caching, rate-limit + retry | List 2 #2, #4, #9 |
| AI / Storm Engine | **Anthropic Claude**, provider-agnostic wrapper (1-line model swap) | List 5 #1; runs nightly only |
| Notifications | **Web Push** (VAPID) — free | List 1 #1 |
| Cron | Supabase **scheduled functions** | List 2 #12; nightly Storm Engine |
| Error logging | Centralized (Sentry or Supabase logs) | List 2 #7 |
| CI | Typecheck + build gate on every push, **TS strict mode** | List 2 #13 |

**Cost summary:** Infrastructure = **$0** (Supabase free tier + Web Push + Vercel).
Only cost is Claude API for the nightly Storm Engine run ≈ **a few cents–$1/month**.

---

## 3. Scope — what we're building (your picks, mapped)

**Keystone:** Render → Supabase backend migration.

**List 1 (innovation):** #1 Live push alerts · #2 "My Locations" · #7 Offline/true PWA ·
#9 Tier-gated unlock teasers · #14 Referral deep-links

**List 2 (performance/longevity):** #1 Migrate off localStorage · #2 Server-side
NOAA caching · #3 Slim/lazy splash screen · #4 Image/tile CDN caching · #7 Centralized
error logging · #8 Health-checks + graceful fallbacks · #9 Rate-limit + retry wrapper ·
#10 One shared map component · #11 DB indexes + RLS · #12 Automated cron jobs ·
#13 TS strict + CI typecheck · #15 Versioned config in DB

**List 3 (new module):** #1 Hurricane / Tropical Tracker

**List 4 (customization):** #1 Multiple dark themes · #2 Accent color picker ·
#5 Custom drag-and-drop dashboard layouts · #7 Glassmorphism design-system pass

**List 5 (legendary):** #1 **The SSWX "Storm Engine"** — one nightly Claude pipeline
that writes once and feeds the daily briefing, chase targets, forecast game answer
key, SSWXCon score, severe-weather history, and pattern analysis.

---

## 4. Phased Roadmap

### Phase 0 — Foundation & Guardrails  ⬜
*Make the project safe to build on before changing behavior.*
- [ ] Enable TypeScript **strict** mode; fix resulting type errors (List 2 #13)
- [ ] Add CI: typecheck + build must pass on every push (List 2 #13)
- [ ] Add centralized error logging + a global error boundary standard (List 2 #7)
- [ ] Define the **module status standard** (loading / error / empty / ok) — no dead spinners (List 2 #8)
- [ ] Install `@supabase/supabase-js`; wire the client to `stormsync-app-center` (publishable key only)

### Phase 1 — Backend Migration: Render → Supabase (KEYSTONE)  ⬜
*Fixes the majority of the bug list by replacing the dead backend.*
- **1A — Database schema** (RLS + indexes on every table from day 1):
  - [ ] `profiles` / `users`, `tiers`, `badges`, `user_badges`
  - [ ] `saved_locations` (List 1 #2), `loyalty_points` + `referrals` (List 1 #14)
  - [ ] `app_config` — versioned config so tiers/modules/points change without redeploy (List 2 #15)
  - [ ] `push_subscriptions` (List 1 #1)
  - [ ] `weather_cache` — server-side NOAA/SPC cache (List 2 #2)
  - [ ] RLS policies + indexes reviewed via `get_advisors`
- **1B — Auth migration:**
  - [ ] Move signup/login from localStorage → Supabase Auth
  - [ ] Migrate existing roles/tiers/badges model into DB
- **1C — Data-proxy Edge Functions** (replaces Render proxy):
  - [ ] `nws-proxy` (alerts, forecast, discussion) — cached, rate-limited, retrying (List 2 #9)
  - [ ] `spc-proxy` (`/spc/outlook-geojson`, etc.) — fixes blank SPC/thunderstorm maps
  - [ ] `storm-reports` proxy — fixes zeroed Warning Center
  - [ ] Tile/image caching strategy (List 2 #4)
  - [ ] Point frontend at Edge Functions; **remove `VITE_API_URL` / Render** entirely
- [ ] **Verify:** Forecast Discussion, SSWXCon, Warning Center, SPC Outlook,
      Thunderstorm Probability, and Storm Chasing all load real data.

### Phase 2 — The SSWX Storm Engine (List 5 #1)  ⬜
*One nightly Claude pipeline; one voice; every module agrees.*
- [ ] `storm-engine` Edge Function: ingest SPC outlooks + model data nationwide
- [ ] Provider-agnostic AI wrapper (Claude default, 1-line swap)
- [ ] Single nightly run writes a `daily_brief` record consumed by:
  - [ ] Daily Briefing · [ ] Storm Chasing targets · [ ] Forecast Game answer key ·
        [ ] SSWXCon score · [ ] Severe Weather History · [ ] Pattern Analysis
- [ ] Schedule via Supabase cron (List 2 #12)
- [ ] **Verify:** all six modules read from the same nightly brief and agree.

### Phase 3 — Reported Bug-Fix Sweep  ⬜
*Burn down the Bug-Fix Log (Section 5). Includes confirmed: maps render over the
sidebar (Leaflet stacking-context fix vs. z-40 sidebar).*

### Phase 4 — Member Features  ⬜
- [ ] **My Locations** — save/switch multiple places everywhere (List 1 #2)
- [ ] **Live Push Alerts** — fire Web Push when an NWS polygon hits a saved location (List 1 #1)
- [ ] **Offline / true PWA** — cache last forecast + alerts; installable (List 1 #7)
- [ ] **Tier-gated unlock teasers** — blurred preview + upgrade CTA on locked modules (List 1 #9)
- [ ] **Referral deep-links** — unique invite link, auto-credits loyalty on signup (List 1 #14)

### Phase 5 — New Module: Hurricane / Tropical Tracker  ⬜
- [ ] Cone + spaghetti models, active-storm list (List 3 #1) — built on the shared map component

### Phase 6 — Customization & Design System  ⬜
- [ ] **One shared map component** refactor (List 2 #10) — do before/with theming
- [ ] **Multiple dark themes** (Midnight, Storm Purple, NOAA Classic, Amber Chase) (List 4 #1)
- [ ] **Accent color picker** (List 4 #2)
- [ ] **Drag-and-drop dashboard layouts**, persisted per user (List 4 #5)
- [ ] **Glassmorphism + glow** design-system pass (List 4 #7)
- [ ] **Slim & lazy-load the splash screen** (currently heavy) (List 2 #3)

### Phase 7 — Performance Hardening & Polish  ⬜
- [ ] Code-split heavy maps; bundle-size budget in CI
- [ ] Tune React Query stale-while-revalidate across all weather data
- [ ] Final pass with `get_advisors` (security + performance) on Supabase

---

## 5. Bug-Fix Log (living)

> ⚠️ **Reconcile needed:** the original list of **29 reported issues** was compacted
> from the working session. Below are the items I personally confirmed in the code.
> **Jeremy — please paste the full 29 so I can complete this table.** Each gets an ID,
> status, root cause, and a checkbox.

| # | Issue | Confirmed cause | Status |
|---|---|---|---|
| B-01 | Maps render on top of the sidebar | Sidebar is `z-40`; Leaflet panes stack ~`z-600`. Needs stacking-context fix | ⬜ Open |
| B-02 | Forecast Discussion: "AI unavailable" | Dead Render AI endpoint → fixed by Phase 1C/2 | ⬜ Open |
| B-03 | SSWXCon always "peaceful" | No live alert/report data → Phase 1C | ⬜ Open |
| B-04 | Warning Center storm reports always 0 | storm-reports proxy fails to 0 → Phase 1C | ⬜ Open |
| B-05 | SPC Outlook map blank | Needs `/spc/outlook-geojson` proxy → Phase 1C | ⬜ Open |
| B-06 | Thunderstorm Probability blank | Same SPC proxy dependency → Phase 1C | ⬜ Open |
| B-07 | Storm Chasing "HTTP 502" | Render backend down → Phase 1 | ⬜ Open |
| B-08 | AI Pattern Analysis broken | Backend AI endpoint → Phase 2 | ⬜ Open |
| B-09 | AI Knowledge Battle broken | Backend AI endpoint → Phase 2 | ⬜ Open |
| B-10 | Severe Weather History broken | Backend AI endpoint → Phase 2 | ⬜ Open |
| B-11 | Forecast Game answer key | Needs nightly engine answer key → Phase 2 | ⬜ Open |
| — | *(remaining reported issues to be added)* | | |

---

## 6. Decision Log

- **2026-06-09** — Retire Render backend; consolidate on Supabase. *(keystone)*
- **2026-06-09** — Use existing `stormsync-app-center` project; do **not** create a
  new Supabase project (stay on free tier). Active projects: app-center, SSWX Team Portal.
- **2026-06-09** — Storm Engine AI = **Anthropic Claude** ("paid but pennies"),
  built provider-agnostic for a 1-line swap.
- **2026-06-09** — Infra cost target = **$0**; only AI calls cost (cents/month).

---

## 7. Open Questions for Jeremy

1. **The full 29-item bug list** — please paste so Section 5 is complete.
2. **Supabase project confirmation** — OK to build on `stormsync-app-center`?
   (Or should `SSWX Team Portal` / a different project be the main backend?)
3. Anthropic API key — do you already have one, or should we provision it when we
   reach Phase 2?
