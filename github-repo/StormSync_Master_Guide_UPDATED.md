# StormSync v4.1 — Weather Dashboard Master Build Guide
**For Jay Myers | SSWX / StormSync.Media**
*Use this document every time you start a new AI session. Paste the relevant section to get the AI up to speed instantly.*

*Last updated: May 24, 2026 — after Phase 2 redo + Storm Chasing rebuild*

---

## ⚠️ CRITICAL RULES — READ FIRST, GIVE TO EVERY AI

> **"DO NOT ADD, CHANGE, EDIT OR DELETE ANYTHING OTHER THAN WHAT I AM SPECIFICALLY ASKING YOU TO DO IN THIS SESSION."**
> **"COMPLETE THE ENTIRE TASK IN ONE GO WITHOUT STOPPING."**
> **"DO NOT TOUCH `/aurora` (AuroraForecast.tsx) — IT IS APPROVED AND LOCKED."**

Every AI you work with must receive these three rules before any task prompt. They are non-negotiable.

---

## PROJECT CONTEXT BLOCK
*(Paste this at the top of every new AI conversation)*

```
PROJECT: StormSync v4.1 Weather Dashboard
STACK: React + Vite (TypeScript) frontend; Express + Node API server (pnpm monorepo)
OWNER: Jay Myers | JayMyers@StormSync.Media | Admin PIN: 1337
PURPOSE: A severe weather intelligence dashboard for SSWX subscribers.
         Tiered subscription levels: Free, VIP, Advanced VIP.
DELIVERY: Web app (PWA-capable). Subscribers access via browser.
LAYOUT:  artifacts/stormsync/   (frontend pages)
         artifacts/api-server/  (backend routes, image rendering, AI proxy)
         lib/*                  (shared utilities + weather calc)

RULES FOR THIS AI SESSION:
1. Do NOT add, change, edit, or delete ANYTHING other than what I specifically ask.
2. Complete the entire task in one go without stopping for any reason.
3. Return the complete modified file(s) only — no partial snippets unless I ask.
4. DO NOT TOUCH /aurora (AuroraForecast.tsx). It is locked.
```

---

## HOW TO USE THIS GUIDE

1. **Find your current Phase and Step** using the checklist below.
2. **Copy the Context Block** above into a fresh AI chat.
3. **Copy the specific task prompt** from that step.
4. **Paste both together** into the AI.
5. When done, **check the box** on the checklist and move to the next step.
6. If the AI runs out of credits or fails, **start a new chat** with the same context + same prompt.

---

## ✅ MASTER CHECKLIST
*(Check off each step as you complete it)*

### PHASE 1 — Quick Bug Fixes (CSS / Simple JS) ✅ COMPLETE
- [x] **1A** — Fix SSWXCon score gauge (floating number + make it look cooler)
- [x] **1B** — Fix Mosquito Activity Index gauge (floating number)
- [x] **1C** — Fix Aurora Forecast error (`latestkP.toFixed`)

### PHASE 2 — Map & Iframe Fixes ✅ COMPLETE (REDONE — see Phase 2 Redo notes)
- [x] **2A** — Fix SPC Outlooks & Mesoscale Discussions ✅ *(rebuilt as server-rendered maps, not iframes)*
- [x] **2B** — Fix NWS Hazards Map ✅ *(switched to clean PNG via image proxy)*
- [x] **2C** — Fix Ohio Drought Map ✅ *(switched to clean PNG via image proxy)*
- [x] **2D** — Fix Storm Chasing Outlook map ✅ *(replaced by Phase 4D rebuild, see below)*
- [x] **2E** — Fix Forecast Discussion AI (already wired to Anthropic via Replit AI Integrations) ✅

### PHASE 3 — Replace / Rebuild Broken Maps ✅ COMPLETE
- [x] **3A** — Replace Lightning Heat Map ✅ *(rebuilt as 2-tab module: GOES-19 GLM Flash Extent Density via NESDIS image proxy + Blitzortung global real-time iframe)*
- [x] **3B** — Fix Rotational Tracks Map ✅ *(server-rendered MRMS composite: Iowa Mesonet PNG composited onto US states basemap with `lighter` blend; 4 product tabs — 0–2 km Azimuthal Shear, Low-Level Reflectivity, 24h/48h QPE)*
- [x] **3C** — Fix Tornado Climatology Map ✅ *(rebuilt as 4-tab embed of live SPC tools — Data Viewer, Outbreaks, Environment Browser, Climatology Maps — plus EF scale, monthly chart, notable-outbreaks table, and external links to Tornado Archive / USA Today)*

### PHASE 4 — New Feature Modules (Weather)
- [x] **4A** — Build Stargazing / Sky Conditions choropleth map ✅
- [ ] **4B** — Build Top 5 Threat Warnings widget (storm reports page)
- [ ] **4C** — Build Thunderstorm Probability Outlook Module
- [x] **4D** — Rebuild Storm Chasing Outlook (AI picks top-2 chase targets + plots them on US map + explains reasoning) ✅

### BONUS — Aurora Forecast rebuild
- [x] **AUR-1** — Rebuild Aurora Forecast page with NOAA OVATION polar image embed ✅ **LOCKED — do not touch**

### PHASE 5 — New Feature Modules (User System)
- [ ] **5A** — Build ProfileManager component (login + admin user management)
- [ ] **5B** — Build ModuleAccessManager (HOC / `useModuleAccess` hook)
- [ ] **5C** — Build TieredAlertSystem (Tier 1/2/3 alert filtering)
- [ ] **5D** — Build SubscriptionManager component
- [ ] **5E** — Build AdminDashboard component (admin-role only)

### PHASE 6 — New Feature Modules (UI / Content)
- [ ] **6A** — Build NotificationSystem (toast alerts)
- [ ] **6B** — Build FAQ component with PWA instructions accordion
- [ ] **6C** — Build NewsTicker component
- [ ] **6D** — Update DashboardLayout (add SSWX logo top-center)
- [ ] **6E** — Build ContactAdmin component (call/email support buttons)
- [ ] **6F** — Build SevereWeatherHistory component (today-in-history)

### PHASE 7 — New Feature Modules (Community / Engagement)
- [ ] **7A** — Build SSWXBlog component (post form + 3-day filter)
- [ ] **7B** — Build LoyaltyDashboard (referral tracking + rewards)
- [ ] **7C** — Build ForecastGame component (daily prediction challenge + leaderboard)
- [ ] **7D** — Build SubscriptionCenter (newsletter/raffle/modules/merch toggles)

### PHASE 8 — Final QA & Packaging
- [ ] **8A** — Full bug and glitch test pass
- [ ] **8B** — Verify all maps and new components are working
- [ ] **8C** — Create final ZIP file for download

---

## CURRENT STATUS TRACKING

| Phase | Step | Status | Notes |
|-------|------|--------|-------|
| 1 | 1A SSWXCon gauge | ✅ Complete | Score text moved inside canvas at arc center. Gauge redesigned: ambient outer glow, dial face gradient, tick marks, triple-layer glowing fill arc, tapered glowing yellow needle, multi-pass cinematic score text, "% OF MAX" sub-label, 0/250 end-of-scale labels. Hi-DPI canvas. |
| 1 | 1B Mosquito gauge | ✅ Complete | Score text drawn inside canvas at correct center position; no more floating absolute-div overlay. |
| 1 | 1C Aurora error | ✅ Complete | Wrapped `kp_frac` with `Number()` before calling `.toFixed()`. |
| 2 | 2A SPC Outlook | ✅ Complete (REDONE) | **Replaced iframe with server-rendered map.** New `GET /api/spc-outlook.png` fetches SPC GeoJSON (`day{1-3}otlk_{cat\|torn\|hail\|wind}.nolyr.geojson`), projects polygons with `d3-geo`, renders on US Albers basemap from `us-atlas` via `@napi-rs/canvas`. Risk colors match official SPC palette (TSTM/MRGL/SLGT/ENH/MDT/HIGH). 10-min cache + stale-on-error. Day 3 auto-coerces to `cat` (only product SPC publishes for day 3). |
| 2 | 2A Mesoscale Discussion | ✅ Complete (REDONE) | **Replaced iframe with single clean PNG.** `MesoscaleDiscussion.tsx` now shows `validmd.gif` (active MDs map) via `/api/proxy-image`, plus an explainer panel and direct links to SPC MDs list. |
| 2 | 2B NWS Hazards | ✅ Complete (REDONE) | **Replaced iframe with clean PNG.** `HazardsMap.tsx` Hazards tab now shows `weather.gov/wwamap/png/US.png` (NWS active hazards map) via `/api/proxy-image`. |
| 2 | 2C Ohio Drought | ✅ Complete (REDONE) | **Replaced iframe with clean PNG.** Drought tab serves USDM PNG (US or OH) via `/api/proxy-image`. US/OH toggle preserved. |
| 2 | 2D Storm Chasing map | ✅ Complete (REPLACED by 4D) | The interim iframe approach was scrapped. See Phase 4D for the full rebuild. |
| 2 | 2E Forecast Discussion AI | ✅ Complete | `POST /api/ai/discuss` verified working end-to-end via `@anthropic-ai/sdk` against Replit AI Integrations (Claude Sonnet 4.6). |
| 3 | 3A Lightning map | ✅ Complete | **Replaced blob globe with real lightning data.** New `GET /api/glm-lightning.jpg` proxies/caches the latest GOES-19 GLM Flash Extent Density (EXTENT3) JPEG from NESDIS (`cdn.star.nesdis.noaa.gov/GOES19/GLM/CONUS/EXTENT3/1250x750.jpg`, 4-min cache). `LightningHeatGlobe.tsx` rewritten as a 2-tab UI: **Live U.S. Strikes (GOES GLM)** auto-refreshes every 4 min; **Global Real-Time (Blitzortung)** embeds `map.blitzortung.org` iframe. Plus NASA OTD/LIS hotspot list, key facts grid, and source explainers. |
| 3 | 3B Rotational Tracks | ✅ Complete | **Real MRMS rotation tracks rendered server-side.** New `GET /api/mrms.png?product=…` fetches Iowa Mesonet MRMS PNGs (`mesonet.agron.iastate.edu/data/gis/images/4326/mrms/{a2m,lcref,p24h,p48h}.png`, EPSG:4326 bbox -130/20/-60/55) and composites onto a US states basemap via `@napi-rs/canvas`. **Critical fix:** Iowa PNGs use solid black as no-data → switched to `globalCompositeOperation="lighter"` (additive) so black drops out cleanly. `RotationalMap.tsx` rewritten with 4 product tabs (0–2 km Azimuthal Shear, Low-Level Reflectivity, 24h QPE, 48h QPE), auto-refresh every 5 min, color-scale legend, and explainer panels. 5-min cache + stale-on-error. |
| 3 | 3C Tornado Climatology | ✅ Complete | **Rebuilt as 4-tab embed of live SPC tools.** `TornadoClimatology.tsx` tabs: **SPC Data Viewer** (interactive 1950–present tornado/hail/wind reports), **SPC Outbreaks** (Outbreak Composite ranking), **Environment Browser** (CAPE/shear/STP for every tornado in record), **Climatology Maps** (monthly heatmaps). All from `spc.noaa.gov` (CSP allows `frame-ancestors *`). Plus EF scale bars, monthly avg-tornado bar chart (Recharts), notable outbreaks table (1974 Super, 2011 Super, Joplin, Moore, Mayfield), and external links to Tornado Archive + USA Today archive (which block iframing). |
| 4 | 4A Stargazing map | ✅ Complete | Real US choropleth at `/skygazing`. See PHASE 4A notes. |
| 4 | 4B Top 5 Threats | ⬜ Not started | |
| 4 | 4C Thunderstorm Outlook | ⬜ Not started | |
| 4 | 4D Storm Chasing rebuild | ✅ Complete | See PHASE 4D notes. |
| 5 | 5A ProfileManager | ⬜ Not started | |
| 5 | 5B ModuleAccess hook | ⬜ Not started | |
| 5 | 5C TieredAlerts | ⬜ Not started | |
| 5 | 5D SubscriptionManager | ⬜ Not started | |
| 5 | 5E AdminDashboard | ⬜ Not started | |
| 6 | 6A Notifications | ⬜ Not started | |
| 6 | 6B FAQ/PWA | ⬜ Not started | |
| 6 | 6C NewsTicker | ⬜ Not started | |
| 6 | 6D Logo update | ⬜ Not started | |
| 6 | 6E ContactAdmin | ⬜ Not started | |
| 6 | 6F WeatherHistory | ⬜ Not started | |
| 7 | 7A SSWXBlog | ⬜ Not started | |
| 7 | 7B LoyaltyDashboard | ⬜ Not started | |
| 7 | 7C ForecastGame | ⬜ Not started | |
| 7 | 7D SubscriptionCenter | ⬜ Not started | |
| 8 | 8A–B Final audit | ⬜ Not started | |
| 8 | 8C Final ZIP | ⬜ Not started | |
| BONUS | AUR-1 Aurora rebuild | ✅ Complete — **LOCKED** | NOAA OVATION polar image embed at `/aurora`. Card styled with purple/cyan dark frame matching app theme. User explicitly approved — DO NOT TOUCH. |

**Total: 10 of 30 steps complete (33%) + Aurora bonus**

---

## PHASE 2 REDO NOTES (May 24, 2026)

**Why we redid Phase 2:**
The first pass embedded full upstream websites via `<iframe>`. On mobile and even on desktop, those iframes showed entire NOAA web pages — navigation chrome, sidebars, ads, footers — which looked broken and unprofessional inside the StormSync shell. The user requested: *"the iframes are ugly on mobile because they show whole websites — redo them to show only the maps."*

**New strategy:**
- For pages where the upstream provider exposes the map as a standalone image (NWS hazards, USDM drought, SPC mesoscale discussion validmd.gif), serve the **image only** through the existing `/api/proxy-image` endpoint.
- For SPC Outlook, where there is no clean standalone image at the right resolution, **render our own** server-side using SPC's official GeoJSON polygon data on top of a US Albers basemap.
- For Storm Chasing Outlook, scrap the iframe entirely and rebuild the module per the original product vision (see Phase 4D below).

**Files changed in Phase 2 redo:**
- `artifacts/api-server/src/routes/spcOutlook.ts` — **NEW.** Renders SPC outlook polygons (~310 lines).
- `artifacts/api-server/src/routes/index.ts` — Registered new SPC router.
- `artifacts/stormsync/src/pages/SPCOutlook.tsx` — Rewritten to `<img src="/api/spc-outlook.png?day=…&type=…">` with day + hazard selectors.
- `artifacts/stormsync/src/pages/MesoscaleDiscussion.tsx` — Rewritten to single proxied PNG + explainer + links.
- `artifacts/stormsync/src/pages/HazardsMap.tsx` — Both tabs rewritten to proxied PNGs (US hazards + USDM drought).

**Validation:**
- ✅ `pnpm --filter @workspace/api-server run typecheck` — clean
- ✅ `pnpm --filter @workspace/stormsync run typecheck` — clean
- ✅ `/api/spc-outlook.png?day=1&type=cat` → 200 image/png (verified live)
- ✅ `/meso` page rendered with real red MD polygon over Southeast (verified visually)
- ✅ `/spc`, `/hazards`, `/meso` all return clean, mobile-friendly map content
- ✅ Architect code review: **PASS**
- ✅ `/aurora` page untouched

---

## PHASE 4D — STORM CHASING OUTLOOK REBUILD NOTES (May 24, 2026)

**What was built:**
A complete from-scratch rebuild of `/chasing` per the original product spec:
> "AI picks the top 2 daily chase target areas, plots them on a US map, and explains the reasoning/parameters below."

**Files added/changed:**
- `artifacts/api-server/src/routes/chase.ts` — **NEW.** Two endpoints:
  - `GET /api/chase-targets` — Scores 25 candidate central-US cities (TX/OK/KS/NE/IA/MO/AR/IL belt) using Open-Meteo GFS for CAPE, 0–3km SRH, 0–6km bulk shear, 2m dewpoint, lifted index, and surface wind. Runs the shared SWTI model (`lib/weather-calc/computeSWTI`). Picks the **top 2** by SWTI score. Calls **Claude (Sonnet 4.6) via Replit AI Integrations** for a 3–4 paragraph chase briefing. Returns `{ targets[2], allCandidates[25], explanation, generatedAt }`. 30-min in-memory cache + graceful fallback briefing if AI unavailable.
  - `GET /api/chase-map.png?…` — Renders the 2 selected targets as glowing colored circles with T1/T2 badges on the US Albers basemap. PNG, cached alongside targets payload.
- `artifacts/api-server/src/routes/index.ts` — Registered chase router.
- `artifacts/api-server/package.json` — Added `d3-geo` + `@types/d3-geo`.
- `artifacts/stormsync/src/pages/StormChasingOutlook.tsx` — Full rewrite. Default tab "Chase Targets" shows: **map PNG → per-target detail cards (CAPE/SRH/Shear/Dew/LI/Wind + "Defining Parameters" reasons) → Claude-generated AI briefing → expandable ranking of all 25 candidates by SWTI score**. Preserved the Local Outlook and Resources tabs.

**Technical approach:**
- US Albers basemap rendered once from pre-projected `us-atlas/states-albers-10m.json`; SPC and Chase routes share the projection setup so circles and polygons land in correct geographic positions.
- `@napi-rs/canvas` is externalized in `artifacts/api-server/build.mjs` so esbuild does not try to bundle the native `.node` binding.
- AI briefing uses the same Anthropic client pattern as `/api/ai/discuss` — env vars come from Replit AI Integrations (`AI_INTEGRATIONS_ANTHROPIC_*`), no manual API key handling.
- Caching: First `/api/chase-targets` call takes ~15s due to the AI request; subsequent calls within 30 minutes return in ~1ms.

**Validation:**
- ✅ Both typechecks pass
- ✅ Live smoke test: `/api/chase-targets` → 200 JSON with `targets`, `allCandidates(25)`, `explanation`, `generatedAt`
- ✅ Live smoke test: `/api/chase-map.png` → 200 image/png
- ✅ Real run today picked **Norfolk NE (SWTI 41, CAPE 920, SRH 223, Shear 33)** and **Dallas TX (SWTI 40, CAPE 2190)** — Claude returned a 2289-character chase briefing
- ✅ Architect code review: **PASS** (one minor caveat about day/type API guardrails addressed in a follow-up edit to `spcOutlook.ts`)
- ✅ `/aurora` untouched

---

## PHASE 4A — STARGAZING MAP BUILD NOTES (May 24, 2026)

**What was built:**
A real US choropleth stargazing outlook map at `/skygazing`, styled like SPC Outlook with custom cool-color terminology requested by the user.

**Files added/changed:**
- `artifacts/api-server/src/routes/stargazingMap.ts` — NEW backend route (~250 lines). Renders PNG choropleth server-side.
- `artifacts/api-server/src/routes/index.ts` — Registered new router.
- `artifacts/api-server/build.mjs` — Added `@napi-rs/canvas` + `@napi-rs/canvas-*` to esbuild `external` list.
- `artifacts/api-server/package.json` — Installed `@napi-rs/canvas`, `d3-geo`, `topojson-client`, `us-atlas`, `@types/d3-geo`, `@types/topojson-client`.
- `artifacts/stormsync/src/pages/StarSkygazing.tsx` — Removed old 54-point SVG blob; embed `<img src="/api/stargazing-map.png?t=bucket">`.

**Technical approach:**
- Real US state geometry from `us-atlas/states-albers-10m.json` (CONUS + AK + HI insets).
- Single batched Open-Meteo GFS call for 51 state centroids (50 states + DC).
- Score: `100 − cloud×0.85 − max(0, humidity−60)×0.4 − min(40, precip×25)`.
- Color buckets: CRYSTAL / CLEAR / DECENT / HAZY / MURKY / SOCKED IN.
- 30-min PNG cache + in-flight Promise de-dup + 8s upstream timeout + stale-on-error fallback.

**Validation:**
- ✅ Both typechecks pass
- ✅ Endpoint returns HTTP 200, `image/png`, ~178KB, 1100×720
- ✅ Code review: PASS
- ✅ Aurora untouched

---

## PHASE 1 COMPLETION NOTES (May 24, 2026)

**Files changed:**
- `artifacts/stormsync/src/pages/SSWXCon.tsx` — Redesigned `ArcGauge` component (1A)
- `artifacts/stormsync/src/pages/MosquitoIndex.tsx` — Fixed canvas text positioning (1B)
- `artifacts/stormsync/src/pages/AuroraForecast.tsx` — Added `Number()` guard (1C)

**Validation:**
- ✅ TypeScript check passes clean
- ✅ All three pages load without runtime errors
- ✅ No `.toFixed is not a function` errors

---

## ARCHITECTURE NOTES — IMPORTANT FOR FUTURE PHASES

**Map rendering pattern (use for any future map module):**
1. Add backend route under `artifacts/api-server/src/routes/<name>.ts`.
2. Use the shared Albers US basemap pattern from `stargazingMap.ts` or `spcOutlook.ts` as a template:
   - `us-atlas/states-albers-10m.json` is pre-projected — set d3 projection scale `1300` translate `[W/2, H/2]` on a `975×610` viewport, or scale proportionally.
   - `@napi-rs/canvas` for rendering; must be in esbuild `external` list (already done).
   - `d3-geo` for any custom lat/lon → pixel projection (SPC and Chase routes do this).
3. Cache the PNG in-memory (10–30 min depending on data freshness), include in-flight de-dup, and serve stale-on-error.
4. Frontend uses plain `<img src="…?t=cacheBucket">` — no React Query, no JSON parsing.

**AI integration pattern:**
- Use Replit AI Integrations env vars (`AI_INTEGRATIONS_ANTHROPIC_*`).
- Reference implementation: `artifacts/api-server/src/routes/ai.ts` (discuss) and `routes/chase.ts` (briefing).
- Always include a fallback text path so the feature degrades gracefully if AI is unavailable.

**Do not touch list:**
- `artifacts/stormsync/src/pages/AuroraForecast.tsx` — locked by user.
- The `replit.md` file at project root — leave structure alone; only populate user preferences when explicitly requested.

---

*The remaining sections of the original guide (Session Prompts by Step, Tips for Working with Free AI Models, etc.) are unchanged from the original document and still apply for Phases 3, 5–8.*

*Document maintained for Jay Myers / SSWX — StormSync v4.1 build project*
*Total tasks: 30 steps across 8 phases — **10 of 30 complete (33%)** + Aurora rebuild bonus*
