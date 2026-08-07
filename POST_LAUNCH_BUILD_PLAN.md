# StormSync VIP — POST-LAUNCH BUILD PLAN
_Created 2026-08-07 · from Jeremy's 15-item post-launch list · answers captured from the build questionnaire_

**Branch:** `claude/vip-forecasts-alerts-beta-9jnfnr` (reset from `main`)
**App root:** `github-repo/` (monorepo; live Vite+React SPA on Supabase)
**Rule:** one PR per phase item, build verified before every push, no item marked done until it works in the deployed app.

---

## Legend
`P-x.y` = plan item. **[#n]** = maps to Jeremy's original numbered request.
🔴 = blocked on a decision · 🟡 = has an assumption stated · 🟢 = fully specified

---

## PHASE 0 — Foundations  ✅ P-0.1 SHIPPED (P-0.2 lands with Phase 5)
_Unblocks later phases. Small, no visible change._

### P-0.1 — Module registry: `adminOnly` concept 🟢 **[#7, #12]**
Today gating is `enabledModules[]` per user (`useAuth.ts:261 hasModuleAccess`). There is no admin-only tier.
- Add `adminOnly?: boolean` to `ALL_MODULES` entries (`hooks/useAuth.ts`).
- `hasModuleAccess()` → `if (mod.adminOnly) return !!user?.isAdmin;` (checked before `enabledModules`).
- `AdminBillingTab` filters `adminOnly` out of purchasable bundles + add-on price lists.
- Sidebar/routes inherit automatically (both already call `hasModuleAccess`).

### P-0.2 — Multi-key Gemini infrastructure 🟡 **[#9, #14]**
Existing AI = `storm-engine` edge fn, Gemini `2.5-flash` w/ Anthropic fallback, key `GEMINI_API_KEY`.
- **Assumption (state & proceed):** one key per feature so free-tier rate limits don't collide.
  - `GEMINI_API_KEY` — existing nightly brief (unchanged)
  - `GEMINI_KEY_TRIVIA` — daily trivia generation **[#9]**
  - `GEMINI_KEY_PATTERNS` — week-ahead pattern breakdown **[#14]**
- Shared helper `_shared/gemini.ts` (model, retry, JSON-mode, per-feature key selection, graceful skip when key absent).
- **Jeremy action:** create 2 new Gemini keys, add as Supabase Edge Function secrets with the names above.

---

## PHASE 1 — Visual & quick wins  ✅ SHIPPED

### P-1.1 — Sidebar logo 🟢 **[#15]**
Replace the CSS `SS` badge + wordmark block (`Layout.tsx:220-245`) with the dripping skull icon.
- Process supplied PNG (433×577 RGBA) → trim, ensure alpha (strip white matte if present), export `@1x/@2x` + favicon sizes.
- Collapsed rail: icon only. Expanded: icon + "STORMSYNC" wordmark (matches your other app's header).
- Also refresh `favicon`, `manifest.webmanifest` icons, PWA home-screen icon, and email header mark.

### P-1.2 — Aurora & Star Gazing merge 🟢 **[#13]**
Confirmed already functionally merged; only cleanup needed.
- Rename `/aurora` → **"Aurora & Star Gazing"** (nav + page title + module registry label).
- Delete `/skygazing` route, `StarSkygazing.tsx`, `NationalSkymap.tsx` (if orphaned), registry entry, and any stale billing rows.
- **Single unified legend**: one legend block, my own wording, **each row shows BOTH the aurora color and the stargazing color** side-by-side against the shared label.

### P-1.3 — Storm Chasing → admin-only 🟢 **[#7]**
Flag `/chasing` `adminOnly: true` (uses P-0.1). Fully hidden for non-admins (not shown as locked). Removed from purchasable lists; existing bundle/add-on rows referencing it cleaned.

### P-1.4 — Tornado Climatology fixes 🟢 **[#2]**
- **Width/stretching:** Recharts `ResponsiveContainer` never shrinks below first measured width → min-content overflow. Fix: `min-w-0` on chart wrappers, `overflow-x-hidden` page guard, remove fixed `w-24/w-36` reference rows on mobile, fix the `-mx-1` subtab strip.
- **Blur (Density Map + EF2+ Hotspots):** _not_ resolution — data is binned into **1°×1° (~70mi) blocks** drawn as Leaflet rectangles. Fix: regenerate `tornadoClimo.json` density grids at **0.25°** from the SPC source, render with smooth interpolation + tuned opacity/borders so it reads as a heatmap, not tiles. Keep Tracks tab as-is (already crisp).

### P-1.5 — Splash screen redesign 🟢 **[#6]**
Full rebuild of `SplashScreen.tsx`: geometric, state-of-the-art, single "wow" animation (my design; violet/indigo brand + the skull mark).
- Center: **VIP Forecasts & Weather Data**
- Below: **Created By: StormSync Media**
- Corner: **Developed By: Jay Myers**
- Once per session (current behavior kept). Respects `prefers-reduced-motion`.

---

## PHASE 2 — Admin control plane  ✅ SHIPPED

### P-2.1 — Sidebar & Module Manager 🟢 **[#11]**
Today `NAV_SECTIONS` (Layout.tsx) and `ALL_MODULES` (useAuth.ts) are hardcoded arrays. Move to DB.
- New tables `nav_sections` + `nav_modules` (order, section assignment, label override, visibility, adminOnly) — public read, admin write; seeded from today's hardcoded arrays so nothing changes on day one.
- New admin tab **"Sidebar & Modules"**: drag-to-reorder modules, drag between sections, create/rename/delete/reorder sections, rename modules, toggle visibility, mark admin-only.
- Layout + routing read from DB with the hardcoded arrays as fallback (never blank sidebar).
- Confirmed scope: **order + sections + rename + visibility ("all of it")**.
- **Shipped:** `nav_sections` + `nav_modules` tables (public read / admin write RLS), seeded from the old hardcoded arrays; `navConfig.ts` sync store so `hasModuleAccess` stays synchronous; Layout renders from DB with the hardcoded arrays as fallback; admin tab **"Sidebar & Modules"** with drag-and-drop *and* arrow reordering, section CRUD, per-module rename, visibility and admin-only toggles, plus a "Sync new modules" button for future additions.

### P-2.2 — Climatology follow-up fix ✅ SHIPPED (bundled per Jeremy's request)
- **Real root cause of the width bug** (my first pass missed it): `Layout.tsx`'s shell wrapper `div.flex-1 ml-[62px]` and `<main>` are flex items **without `min-w-0`**, so their default `min-width:auto` refused to shrink below content min-content width — one wide descendant stretched the **entire app shell to 1480px on a 390px viewport**. This affected every page, not just Climatology. Verified with a headless-browser probe: `documentElement.scrollWidth` 1542 → **390**.
- **Density/EF2+ maps** replaced with a proper canvas heat layer (`ClimoHeatLayer.ts`): accumulating radial blobs + palette colorisation, blob radius derived from the true ground size of a 0.25° cell so it scales with zoom. The previous `circleMarker` pass rendered a screen-space polka-dot matrix.
- Legends now show **real tornado counts** (derived from each grid's max) instead of the internal ramp values.

---

## PHASE 3 — Module overhauls

### P-3.1 — Hurricane Tracker audit 🟡 **[#1]**
Current: NHC data via `nhc` edge fn. Cone + spaghetti = official NHC PNGs (**keeping**, per 1a). Best-track & wind field drawn live from ATCF/GIS. SST = live NASA GIBS MUR (dated T−3d because that feed lags).
- **Verify "works when a storm is live":** replay a real archived storm through the code path to prove cone/spaghetti/wind-field/forecast-path all render (can't wait for a live storm to find out).
- **Fix wind-radii fallback** — the advisory-XML `parseQuadrant` regex path is broken (`s[1]?.match` on a match array) and almost certainly never yields data.
- **SST freshness:** confirm the daily GIBS date roll actually advances (add a visible "SST valid <date>" stamp so staleness is self-evident).
- **Past storms:** table is engine-populated and likely empty → seed a **curated archive of famous hurricanes** (Katrina, Andrew, Michael, Ian, Maria, Harvey, Dorian, Milton…) with real best-track data.
- **Genevieve** 🟡 — you asked for "the 2026 Pacific hurricane that hit Cat 5 but didn't really affect the US." My training data ends before that storm, so **I will verify the actual name/ID against the NHC/ATCF 2026 EPAC archive during the build and confirm with you before seeding** rather than guessing.
- Accuracy pass over all displayed stats/labels.

### P-3.2 — Severe Weather History → Ryan Hall parity 🟢 **[#3]**
Current page is a verbatim copy of the `artifacts/weather-history` build: one `h-screen` map that fights the app shell, no static map, and a legend advertising 7 warning colors while the code paints only 2.
- **Layout/fit:** rebuild to sit inside the app shell (no `h-screen`, no double scroll), mobile-first.
- **Warning colors (3a):** implement Ryan Hall's exact tiers from IEM warning tags — **Severe** (yellow-green) · **Considerable** (amber) · **Destructive** (orange) · **Tornado** (red) — legend and paint finally matching, with counts per tier.
- **Static downloadable maps (3b):** add the bottom static/exportable maps mirroring his — "**Last 3 Days of Warnings**" (severity tiers + counts) and "**Tornado Paths — Past N Days**" (EF-rating colors + Fatalities/Injuries/Highest EF impact box), with title/date/updated stamp and a StormSync footer, downloadable + shareable.
- **Tornado History (3c):** stay on **NOAA DAT (survey-driven)** per your answer — you want the freshest surveyed tornadoes, appearing as soon as they're surveyed. Add a clear "surveys appear as NWS publishes them" note + last-updated stamp, and short default ranges so it never looks empty.
- Match his structure as closely as possible (3d), skinned in StormSync UI.

### P-3.3 — Radar & MRMS overhaul 🟢 **[#4]**
Full redesign + working layer set (one active overlay at a time per 4c — no stacking).
- **Radar:** Base Reflectivity · Base Velocity · Storm-Relative Velocity · Correlation Coefficient · Echo Tops
- **MRMS:** Composite Reflectivity · Reflectivity −10°C · MESH (hail) · Rotation Tracks · 1-hr QPE
- **Satellite:** True Color · Clean IR · Water Vapor · Air Mass RGB · Day Cloud Phase
- **ProbSevere (4b):** re-implement as **real vector polygons** from its GeoJSON feed (probability-shaded, clickable readout) instead of the current flat raster that renders gray.
- Each layer verified live; **per 4a I have discretion to substitute an equivalent product** where a public source doesn't exist, and I'll list every substitution in the PR.
- New design: product rail, opacity, timestamp/valid-time, loop control, legend per product, graceful "no data / product offline" states (today tile failures are silent).

---

## PHASE 4 — Model Runs (HRRR + GFS) 🔴 **[#5]**

**Structure (5a, confirmed):** HRRR subtab + GFS subtab; each with **Upper Air**, **Surface & Precipitation**, and **Severe Weather** parameter groups; region zooms; animated frames + scrubber + download/share. The existing page already has the viewer scaffolding (player, scrubber, legend, download) — it crashes only because it fetches Max Velocity's private endpoint `data.maxvelocitywx.com/api/hrrr`, which we cannot use.

**Parameters (5b, confirmed — same set for both HRRR and GFS):**
- **Upper Air:** 500mb Height+Wind · 700mb Height+Wind
- **Surface & Precip:** Temperature · Dew Point · Reflectivity w/ precip type
- **Severe:** 0–3km AGL CAPE · 700–500mb Lapse Rate · MLCAPE · MLCIN · MUCAPE · SBCAPE · Surface CIN · LCL · SRH 0–1km · SRH 0–3km · Supercell Composite · STP · Updraft Helicity

### 🔴 OPEN DECISION — where the map images come from
This is the one question that decides whether item #5 is a two-week build or a two-month one. **No free public service publishes that full severe-parameter suite as ready-made images for both HRRR and GFS.**

| Option | What you get | Cost / effort |
|---|---|---|
| **A. Render our own** (recommended for this param list) | **Every** parameter above, exactly, in our own dark StormSync styling, both models | Needs a rendering worker (Python + GRIB→PNG) on a schedule + image storage. Real infra: ongoing compute + ~GBs of storage. Biggest build in the plan. |
| **B. Official NOAA MAG images** | Free, official, reliable — but only a **subset** (reflectivity, CAPE/CIN, helicity, heights/winds, temp/dewpoint). **No STP, SCP, 0–3km CAPE, MLCIN, LCL, lapse rate.** | Small build. Fastest path. NWS styling, not ours. |
| **C. Third-party image sites** (Pivotal, TropicalTidbits, COD) | Has the full suite | ⚠️ Hotlinking their rendered images is against ToS for the main ones — I won't build on that. |

### ⛔ BLOCKED (2026-08-07) — **Option B is not viable; MAG images are not fetchable**

Probed before building, precisely because the current broken page is what happens
when a viewer is built against a source that was never verified (it targets Max
Velocity's private `data.maxvelocitywx.com/api/hrrr`).

| Check | Result |
|---|---|
| `mag.ncep.noaa.gov/` root (browser UA) | **200** — site reachable |
| `mag.ncep.noaa.gov/data/**` — every model/cycle/area/param combo tried | **403, 199 B** on all of them |
| MAG page JS path builder | `data/{model}/{cycle}/{model}_{area}_{fhr}_{param}.gif` — extracted, but no combination resolves |
| Headless browser load of the MAG guidance page | `ERR_CONNECTION_RESET` — could not read a real `<img src>` |
| SPC mesoanalysis `exper/mesoanalysis/new/s19/*.gif` | **404** on every param (incl. the page's own `blank.gif`) |

`/data/` returns a uniform 403 body rather than a 404, which reads as
directory-level hotlink protection. **No working MAG image URL was obtained, so
Phase 4a cannot be built on it.**

### Sources that ARE reachable (verified this session)
| Source | Status | Notes |
|---|---|---|
| **NOMADS GRIB filter** (`nomads.ncep.noaa.gov/cgi-bin/filter_hrrr_2d.pl`) | **200** | Raw HRRR/GFS data — the input for Option A (render our own). Gives every parameter on the list. |
| College of DuPage (`weather.cod.edu`) | **200** | Has HRRR/GFS severe params, but it's a third-party educational site — hotlinking their renders needs their OK. |
| NDFD graphical (`graphical.weather.gov`) | **200** | Official, but only basic fields (MaxT etc.) — none of the severe suite. |

### 🔴 NEEDS JEREMY'S DECISION before Phase 4 resumes
1. **Option A — render our own from NOMADS** (my original recommendation). Only path that delivers the full requested parameter list in StormSync styling. Needs a scheduled GRIB→PNG worker + image storage; real compute/storage cost.
2. **Ask College of DuPage for permission** to use their rendered images, then build the viewer against them (fast, but dependent on a third party saying yes).
3. **Descope** — drop the severe suite and ship a viewer on the basic official fields only.

### (superseded) previous decision — Staged: B now → A later
- **Phase 4a:** ship a working HRRR + GFS viewer on **official NOAA MAG imagery** (reflectivity, CAPE/CIN, helicity, heights/winds, temperature, dewpoint), with the real UI: model subtabs, parameter groups, region zooms, animation, scrubber, legend, download/share.
- **Phase 4b (later):** build our own GRIB→PNG renderer to add the parameters MAG doesn't publish — **0–3km AGL CAPE, MLCIN, LCL, 700–500mb lapse rate, Supercell Composite, STP** — and restyle everything in StormSync dark.
- Viewer is built **source-agnostic** from day one (a product/frame provider interface) so 4b swaps the image source in without a rewrite. Any parameter not yet available is shown as "coming soon" rather than hidden, so the full list stays visible as the target.

---

## PHASE 5 — Games & AI

### P-5.1 — Forecast Game rebuild 🟢 **[#8]**
_(Noted: the "0–3km CAPE overlay" never existed in this app — you were thinking of your other build. Treating this as a full redesign.)_
- **Two pins per day**, matching your reference flow: **⚡ Most Severe Weather Expected** (lightning-bolt pin) and **🌪 Most Likely Tornado Location** (tornado pin), toggle chips + "tap to drop" hint + Lock In.
- **Helper overlays** (tap to toggle): SPC Categorical · Tornado % · Hail % · Wind % · Sig-hatched · **STP** · **0–3km CAPE**.
- **Dark theme** throughout (your reference is light — this will be StormSync dark).
- **Scoring redesign:** independent scoring per pin — severe pin scored vs nearest SPC severe report (distance-banded), tornado pin scored vs nearest tornado report with a tighter radius and a bigger payout (tornado calls are harder); bonuses for nailing both; daily total. Exact bands published in the PR.
- **Leaderboards: Weekly · Monthly · Yearly** tabs showing current leaders in each period.
- **Top-3 treatment:** distinct **gold / silver / bronze** cards with animation (shine/pulse/rank-shift), podium layout, rest as a clean ranked list.
- State-of-the-art visual rebuild of both the game and the leaderboards.

### P-5.2 — Trivia module 🟢 **[#9]**
New module, **shares the Forecast Game points + leaderboard** (same weekly/monthly/yearly boards and monthly crowning).
- **2 questions/day**: one always **weather**, one **completely random** — the random one explicitly prompted to be *unique, fun, and detailed* (not generic trivia).
- Multiple choice (4 options) for now; auto-graded; one attempt/day/question.
- Generated **once daily** by Gemini via the nightly engine (cached → near-zero cost), using `GEMINI_KEY_TRIVIA`.
- **Admin tab — Trivia:** write your own questions, assign to a **specific date**, choose to **override question 1, override question 2, or add as a 3rd**, plus a bank of drafts. Preview + regenerate-today.
- **Per-question point override** — default scale set by me, and **you can change the points on any and every question** (global default + per-question value).

### P-5.3 — Weather Patterns AI 🟡 **[#14]**
- **7-day AI breakdown** (`GEMINI_KEY_PATTERNS`, generated nightly with the brief): week overview, **affected regions** (Plains · Midwest · Southeast · Northeast · West · South), biggest risks, and a **day-by-day** section — rendered as distinct, good-looking cards/sections, not one text blob.
- **Season Stats tracker** (small section at the bottom), your 3 + 7 more I'm adding:
  1. US Tornadoes This Year · 2. Highest Tornado Count by State (+ which state) · 3. Costliest Month
  4. Strongest Tornado This Year (EF + location) · 5. Tornado Fatalities YTD · 6. Largest Hail Report (size + place) · 7. Peak Wind Gust Reported · 8. Most Active Day (date + report count) · 9. Days with EF3+ · 10. YTD vs Average (% of normal)
- ⚠️ **Accuracy note (important):** these stats will be **computed from real SPC/NCEI data**, with Gemini used only to *phrase* them. If the AI were asked to recall the numbers it would confidently invent them — so the pipeline is data-first, AI-narration-second.

---

## PHASE 6 — Reconciliation & content _(must be last)_

### P-6.1 — Billing sync 🟢 **[#12]**
Corrected understanding: **there is no fixed per-tier module list** — every tier can pick nearly any module; tiers control **how many** modules you get and **add-on pricing**.
- Reconcile the module registry after all additions/removals: new modules (**Trivia**, rebuilt **Model Runs**) get add-on prices and are selectable; **removed** (`/skygazing`) and **admin-only** (`/chasing`) IDs purged from `bundledModules` / `module_addon_prices`.
- Verify `choosableCount` per tier is still right, and that the renamed **Aurora & Star Gazing** carries the correct ID/label everywhere.
- Confirm the `stripe-checkout` edge function is actually deployed (it wasn't in the function listing).

### P-6.2 — FAQ + Module Guide full fill-in 🟢 **[#10]**
Structure and admin editor stay exactly as-is; I write **complete, accurate content for every module and every FAQ entry**, reflecting the final post-plan state (new Radar layers, Model Runs, Trivia, merged Aurora, redesigned game, alerts/tiers, PWA).

---

## Open items needing Jeremy
1. 🔴 **Phase 4 source decision** (A / B / staged B→A) — blocks only Model Runs.
2. **Create 2 Gemini keys** → `GEMINI_KEY_TRIVIA`, `GEMINI_KEY_PATTERNS` (Supabase → Edge Function secrets). Needed before P-5.2/P-5.3.
3. **Genevieve confirmation** — I'll verify the 2026 EPAC Cat-5 against NHC records and come back with the exact storm before seeding it.

## Execution order
`P-0.1 → P-0.2 → Phase 1 (1.1–1.5) → P-2.1 → Phase 3 (3.1–3.3) → Phase 4 (on decision) → Phase 5 (5.1–5.3) → Phase 6 (6.1, 6.2)`
