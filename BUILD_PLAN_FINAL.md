# StormSync / SSWX VIP — Post-Build **FINAL VERSION** Punch List

> Companion to `BUILD_PLAN.md` (Phases 0–10, beta launch). That plan is **done and
> merged**. This document is the **final polish + feature pass** before launch.
> Same rules apply — **Section 0 of `BUILD_PLAN.md` is still law**: do not change
> anything you weren't told to; if you find another problem, log it, don't fix it;
> one task at a time; never break a working feature; verify before claiming done.
>
> **Owner:** Jeremy (@JeremyJ614) · **Repo:** `jeremyj614/stormsync-dashboard`
> **Branch:** `claude/vip-forecasts-alerts-beta-9jnfnr`
> **Backend:** Supabase `stormsync-vip` (`djonpetxdjuwcbgftqmt`)
> **Workflow:** save → build → push → PR → squash-merge **live between every task**.
> **Created:** 2026-06-25

---

## How to read this

- Tasks are coded **P-01 … P-19** (Post-build). Check the box when done & verified.
- **🟢 BUILD NOW** = implement this pass. **📋 LIST ONLY** = Jeremy asked us to *not*
  build it yet, only produce the menu of options for him to choose from. **🤔 DECIDE
  LATER** = parked decision, revisit at its phase.
- Reference screenshots live in the chat (MAX VELOCITY app, used **only** as layout/feature
  inspiration — we keep the SSWX theme, colors, and glassmorphism, never copy their brand).

---

## THE 19

### P-01 — Hurricane Tracker: "Preview" subtab (demo Cat-5 = Hurricane Milton) 🟢 BUILD NOW
**Want:** A new **Preview** sub-tab on the Hurricane Tracker that loads a *fake but realistic*
storm so people can see everything the tracker will show them when a real one is active.
Make the demo storm **Hurricane Milton at its peak Category 5**.
- Baked demo dataset (no live feed): Milton 2024 peak — **Cat 5, ~180 mph sustained,
  ~897 mb**, Gulf of Mexico, with a forecast cone, track line, wind-radii rings, and the
  full stat readout the real tracker renders.
- Clearly badge it **"PREVIEW — sample storm, not live"** so nobody mistakes it for real.
- Reuses the existing tracker UI 1:1 (this is the selling point: "here's what you get").
**Done when:** Preview tab renders Milton at Cat-5 with cone/track/wind-radii/stats and a
visible demo banner; the live "Active Storms" tab is untouched.

### P-02 — Dashboard: glowing Customize button + more basic widgets ✅ DONE (2026-06-25)
**Shipped:** Customize button now pulses with a primary glow (`pulse-glow`, respects
reduced-motion). Four new **basic** widgets added to the picker — **Today's high & low**,
**7-day forecast**, **Sunrise & sunset**, **Wind compass** (animated SVG) — all from data we
already fetch. No existing widget touched; new widgets auto-append to saved layouts.
**Want:** (a) Make the **Customize** button **glow** (animated pulse/glow) so it's easy to find.
(b) Add **more widgets** to the dashboard library — **basic-forecast only**, nothing advanced
or tier-gated. **Do NOT change any existing widget.**
- Candidate basic widgets (all from data we already pull): Feels-Like, Dew Point, Humidity,
  Wind & Gusts, Pressure & trend, Visibility, UV Index, Sunrise/Sunset, Cloud Cover,
  Precip Chance, 7-Day strip, Today Hi/Lo. (Final set chosen during build; all "basic.")
**Done when:** Customize button visibly glows; new basic widgets are addable from the widget
picker; every previously-existing widget is byte-for-byte unchanged.

### P-03 — Forecast Discussion: longer, personalized plain-language 🟢 BUILD NOW
**Want:** The plain-language tab should be **longer** and **directly break down the forecast
for the person reading it** (their saved/active location), not a generic national note.
- Storm-engine prompt produces a longer, structured plain-language discussion; the consumer
  personalizes it to the viewer's current location (today → next few days, what to expect,
  timing, confidence).
**Done when:** Plain-language tab shows a multi-paragraph, location-specific breakdown that
references the user's place and their actual forecast.

### P-04 — Air Quality module: full redesign + high-tech AQI bar ✅ DONE (2026-06-25)
**Shipped:** Replaced the plain half-dial with a **cinematic canvas arc gauge** sharing the
SSWXCon Score look (multi-layer glow, tick ring, dark dial face, glowing score) tuned to the
0–500 AQI scale. Added a **high-tech gradient AQI bar** with crisp category bands and a glowing
live marker. Whole module moved to `glass`/`glass-strong` panels with glowing pollutant tiles.
Data, categories, and charts unchanged.
**Want:** The whole AQI module redesigned to look **cooler / more advanced / "wow."** The
**AQI bar at the top** redesigned to feel like a **mix of the SSWXCon Score gauge + more
glow / high-tech.** Keep all current data & behavior — visual redesign only.
**Done when:** AQI page has the premium treatment (hero, glow, animated gauge) and the top
bar reads like a high-tech score gauge; no data/logic changed.

### P-05 — Severe Weather Threat Index: same wow-factor redesign ✅ DONE (2026-06-25)
**Shipped:** Richer animated score gauge (gradient active arc with glow filter, tick marks,
transitioning needle), glowing color-matched risk cards, parameter cards now have glowing
fill bars showing where each value sits vs. extreme, and the hero panel upgraded to
`glass-strong`. **Index math and data unchanged** — visual only.
**Want:** Give the **SWTI** module the **same caliber of redesign** as P-04 (cooler, more
advanced, glow/high-tech). Visual only — the index math and data stay as-is.
**Done when:** SWTI matches the new premium look; logic untouched.

### P-06 — SPC Outlook: phone-fit interactive map + static-map area 🟢 BUILD NOW
**Want:** (a) The interactive map is **too small on phones** — make it **fit phone screens
nicely**, full-bleed, with city labels + the categorical legend (ref **picture 1**).
(b) **Add a static-map area underneath** (ref **picture 2**): **Day 1–8** tabs,
**Categorical / Tornado / Wind / Hail** tabs, regional quick-jumps, a downloadable **static
SPC outlook image**, and **Download / Share** buttons. Keep SSWX theme & colors throughout.
**Done when:** Map fills the phone viewport cleanly; the static-map panel renders the right
SPC image per Day/hazard/region with working Download + Share.

### P-07 — Mesoscale Discussion: make it worth a tier 🟢 BUILD NOW
**Want:** It's too boring to justify choosing it for a tier — **add substance.**
- Proposed: render the **active SPC Mesoscale Discussion(s)** with the MD polygon on a map,
  concern type (tornado/wind/hail watch likelihood), **probability of watch issuance**, the
  raw text, **and an AI plain-language summary** ("what this means for you"), plus links to
  any resulting watches. Auto-empty state when none are active.
**Done when:** The module shows live MD content + map + AI summary, and reads as a premium,
useful module rather than a stub.

### P-08 — Storm Ingredients: full redesign + shareable graphic 🟢 BUILD NOW
**Want:** Completely redesigned to look cooler/advanced like the others, **plus** the elements
in **pictures 3 & 4**:
- A big **"Storm Ingredients" shareable graphic**: headline **threat-level number**, large
  **CAPE / SHEAR / SRH / STP** stat tiles, an **hour-by-hour threat timeline**, **dual
  parameter charts**, **model-agreement** bars, **peak precip chance**, and **Download
  Image / Share Link** buttons.
**Done when:** The module has the premium look and the shareable graphic with all the listed
panels, exportable as an image; existing ingredient math is unchanged.

### P-09 — Thunderstorm Probability: rebuild as real probability static maps 🟢 BUILD NOW
**Want:** It's **wrong** — currently just a copy of the SPC Outlook. Rebuild it as
**"Will I see severe weather?"** probability **static maps** like **picture 5**: a smooth
gradient heatmap with a KEY (**Almost Certain → Very Likely → Likely → Maybe → Not Likely →
Highly Unlikely**), **Day 1–8** tabs, and **Download / Share**.
- Data source candidates (pick during build): SPC total-severe probability, or a derived
  probability from the Day-1/2 hazard probabilities. Must be genuinely *probability*, not the
  categorical risk reused.
**Done when:** The module shows a true probability map distinct from SPC categorical, with the
6-step key, day tabs, and export.

### P-10 — Model Run Comparator: more parameters + categories 🟢 BUILD NOW
**Want:** Add **more severe-weather parameters** **without deleting any**, and **group them
into categories** for readability.
- Add (candidates, all from Open-Meteo / derived): CIN, LCL, 0–1 km & 0–6 km shear, SRH 0–1/0–3,
  lapse rates, PWAT, lifted index, updraft helicity proxy, etc. Group: **Instability /
  Shear / Moisture / Composite / Surface**.
**Done when:** Comparator has the new params under category headers; every existing param still
present and correct.

### P-11 — National Radar & MRMS: build the **menu**, don't build the page 📋 LIST ONLY
**Want:** The current radar/MRMS is wrong — Jeremy wants **specific MRMS products** (e.g.
**rotation tracks**) rather than a generic composite. **Do not implement now.** Instead, the
build plan must deliver an **ultimate list of every Radar / MRMS / Satellite product we can
realistically add**, so Jeremy can pick which ones we wire up next.
- Deliverable: a categorized menu (Radar, MRMS, Satellite) with each product's name, what it
  shows, and feasibility/source notes. See **Appendix A** (to be filled when we reach this).
**Done when:** Appendix A lists the full menu; nothing on the page is changed yet.

### P-12 — Tornado Climatology: build the **menu**, don't build the page 📋 LIST ONLY
**Want:** Same approach as P-11 — produce an **ultimate list** of every tornado-climatology
data product/visualization we could add, for Jeremy to choose from. **Do not implement now.**
- Deliverable: **Appendix B** menu (e.g. tornado density, EF-rating distribution, monthly/
  diurnal frequency, tracks, watch/warning climo, path-length, etc.) with source notes.
**Done when:** Appendix B lists the full menu; the page is unchanged.

### P-13 — Moon & Astronomy: cooler, sky-gazing redesign + realistic moon 🟢 BUILD NOW
**Want:** Redesigned to look **way cooler**, more **sky-gazing**, more advanced, with a
**more realistic-looking moon** (accurate illuminated-fraction / phase rendering).
**Done when:** The module has a premium star-field/sky aesthetic and a realistic moon that
matches the current phase; existing astronomy data retained.

### P-14 — Storm Chasing Outlook: real AI national target picker 🟢 BUILD NOW
**Want:** It's **100% wrong.** Rebuild as an **AI bot that scans the whole country, picks the
2 best storm-chasing targets for the day**, lists **their parameters**, and at the bottom gives
a **detailed explanation of why those were chosen** + **what to expect from the chase / how
excited to be.**
- Built on the storm engine (`chase_targets`), extended to rank **2 national targets** with
  parameters + rationale + an "excitement" read.
**Done when:** The module shows 2 ranked targets with params and a written rationale +
expectation/excitement section, refreshed by the nightly engine.

### P-15 — Weather Learn quizzes: fix or remove 🤔 DECISION (diagnosed 2026-06-25)
**Diagnosed:** The quizzes POST to `${BASE_API}/ai/quiz` → `…/functions/v1/weather/ai/quiz`,
which is a **dead legacy Render route** that no longer exists — so every "Quiz Me" errors out.
The articles/reading half of the module works fine; only the quiz generator is broken.
**Options put to Jeremy:**
- **Fix — built-in question bank** (recommended): ship a curated local bank of questions per
  topic/difficulty. Instant, free, always works, no AI/network dependency.
- **Fix — AI-generated** (Gemini via our storm-engine): dynamic/varied quizzes, but depends on
  the AI provider + adds latency/cost.
- **Remove:** strip the quiz UI, keep Weather Learn as a clean reading module.
**Done when:** Jeremy picks; we implement that choice.
**RESOLVED 2026-06-25 — Jeremy chose: remove the whole module + expand the Glossary.** Deleted
`WeatherLearn.tsx` and every reference (route, sidebar, `ALL_MODULES`, FAQ module-guide). Added
~60 new Weather Glossary terms — including a new **Basics** category (thunderstorm, updraft,
fronts, heat index…) to absorb the educational value — plus **Clouds, Lightning, Flooding,
Patterns, Observations, Aviation** categories.

### P-16 — Admin: full FAQ + Module-Guide editor 🟢 BUILD NOW
**Want:** An admin area to **add / remove / modify anything on the FAQ**, including the
**Module Guide**.
- DB-backed CRUD (like `news_posts`): FAQ entries + module-guide entries editable in the admin
  panel; the public FAQ/guide reads from the DB with sensible defaults.
**Done when:** Admin can create/edit/reorder/delete FAQ + module-guide items and they update
live on the FAQ page.

### P-17 — Forecast Game: decision-support content + labeled map 🟢 BUILD NOW
**Want:** Keep everything that works, but **add content players can look at to help them pick a
target**, and make the **map show city names / labels.**
- Add a "scouting" panel (relevant params/outlook for the game area) and enable city labels on
  the game map.
**Done when:** Players have helpful pick-a-target info and the map is labeled; existing game
logic/scoring unchanged.

### P-18 — Admin SSWX News editor: maximally rich 🟢 BUILD NOW
**Want:** Make the **SSWX News** creator **as advanced as possible** — *all* the features.
- Candidates: true rich-text/Markdown with live preview, images/media embeds, links, headings/
  lists/quotes/tables, cover image, categories/tags, pinning, draft vs publish, scheduling,
  audience/tier targeting, and per-post push/broadcast. (Final feature set chosen at build.)
**Done when:** The News editor is a full-featured publishing tool with the above.

### P-19 — Alert & Warning System: design the tiered delivery matrix 🟢 BUILD NOW (design + first build)
**Want:** Figure out an **Alert & Warning System** with **multiple delivery methods**, mapped
**per tier**.
- Channels on the table: **Web Push** (built, Phase 8), **Email**, **carrier email-to-SMS**
  (built for emergency contact), **in-app banner/inbox**, and possibly digest emails.
- Deliverable: a **tier × channel matrix** (which alert types via which channels at each tier),
  plus wiring the first cut on top of the existing push/relay infrastructure. See **Appendix C**.
**Done when:** Appendix C defines the matrix and the first set of channels is wired per tier.

---

## Execution order — **easiest → hardest**

One task per PR, merged live. We go down this list in order; Jeremy may reprioritize at any
time. Difficulty is a rough build-effort + risk estimate (🟢 easy · 🟡 moderate · 🔴 hard).

| Order | Code | Task | Difficulty |
|-------|------|------|------------|
| 1  | P-02 | Dashboard: glowing Customize button + more basic widgets | ✅ done |
| 2  | P-05 | Severe Weather Threat Index — wow redesign | ✅ done |
| 3  | P-04 | AQI redesign + high-tech AQI bar | ✅ done |
| 4  | P-11 | Radar/MRMS/Satellite overlays (Jeremy's picks) | ✅ built |
| 5  | P-12 | Tornado Climatology overlays (Jeremy's picks) | ✅ built |
| 6  | P-15 | Weather Learn removed + Glossary expanded | ✅ done |
| 7  | P-17 | Forecast Game — scouting info + city labels on map | ✅ done |
| 8  | P-13 | Moon & Astronomy redesign + realistic moon | ✅ done |
| 9  | P-03 | Forecast Discussion — longer, personalized plain-language | ✅ done |
| 10 | P-10 | Model Comparator — more params + categories | ✅ done |
| 11 | P-16 | Admin FAQ + Module-Guide editor | ✅ done |
| 12 | P-01 | Hurricane Tracker Preview (Milton Cat-5 demo) | ✅ done |
| 13 | P-06 | SPC Outlook — phone-fit map + static-map area | ✅ done |
| 14 | P-07 | Meso Discussion — real substance + AI summary | ✅ done |
| 15 | P-18 | Admin SSWX News editor — maximally rich | ✅ done |
| 16 | P-08 | Storm Ingredients redesign + shareable graphic | ✅ done |
| 17 | P-09 | Thunderstorm Probability — rebuild as probability maps | ✅ done |
| 18 | P-14 | Storm Chasing — AI national target picker | ✅ done |
| 19 | P-19 | Alert & Warning System — tiered delivery matrix | 🔴 hardest |

> Note: the P-codes (P-01…P-19) are permanent IDs from the request; the **Order** column is
> the build sequence. P-11/P-12 are menu-only and P-15 is a decision — they're cheap, so they
> sit early among the easy wins.

---

## Appendix A — Radar / MRMS / Satellite product menu *(P-11)*

**Menu delivered 2026-06-25 — awaiting Jeremy's picks.** Pick any number from the lists below;
once chosen we wire them into the radar page (most overlay natively on our Leaflet maps as
tile/WMS layers; a few are single-image panels). Feasibility tags: **🟢 native tile/WMS layer**
· **🟡 static image panel (auto-refreshing)** · **🔴 link-out only (no embed)**.

### A1 — MRMS (Multi-Radar Multi-Sensor) — *this is the "rotation tracks" family Jeremy wanted*
Source: NOAA/NSSL via **Iowa Environmental Mesonet (IEM)** tile/WMS + NSSL image services.
- 🟢 **Rotation Tracks — 0–2 km AzShear** (low-level; the tornado-tracking layer) — 30/60/120/240-min accumulations
- 🟢 **Rotation Tracks — 0–5 km AzShear** (mid-level / mesocyclone)
- 🟢 **MESH — Max Estimated Size of Hail** + **MESH Tracks** (hail swath history)
- 🟢 **Seamless Hybrid-Scan Reflectivity** (national radar mosaic, no single-site gaps)
- 🟢 **Composite Reflectivity** (national)
- 🟢 **Reflectivity At Lowest Altitude (RALA)** (what's actually near the ground)
- 🟢 **Echo Top 18 dBZ** (storm height/intensity)
- 🟢 **VIL & VIL Density** (hail/updraft strength)
- 🟢 **Precip Rate** (instantaneous rain rate)
- 🟢 **QPE accumulations** (1/3/6/12/24/48/72-hr radar-estimated rainfall)
- 🟢 **Vertically Integrated Ice** (severe/hail signal)
- 🟡 **ProbSevere / ProbHail / ProbTor** (NSSL probabilistic storm objects)
- 🟡 **FLASH** (flash-flood unit-streamflow / ARI exceedance)

### A2 — Single-site NEXRAD (radar.weather.gov RIDGE) — per-station, high detail
- 🟢 **Base Reflectivity (N0B)** · **Composite Reflectivity**
- 🟢 **Base Velocity (N0U)** + **Storm-Relative Velocity (N0S)** — *rotation couplets*
- 🟢 **Correlation Coefficient (N0C)** — *debris-ball / tornado debris signature*
- 🟢 **Differential Reflectivity (N0X)** · **Specific Differential Phase (N0K)** (dual-pol hail/rain)
- 🟢 **Echo Tops (EET)** · **Digital VIL (DVL)**
- 🟢 **One-Hour & Storm-Total Precip**

### A3 — GOES-East/West Satellite (RAMMB/CIRA SLIDER + IEM)
- 🟢 **GeoColor** (true-color day / IR night — the "pretty" default)
- 🟢 **Clean Longwave IR (Band 13)** — cloud-top temps / storm intensity
- 🟢 **Visible (Band 2)** — daytime high-res
- 🟢 **Mid-level Water Vapor (Band 9)** · **Upper-level WV (Band 8)**
- 🟡 **Air Mass RGB** (fronts / stratospheric intrusion) · **Day Cloud Phase RGB**
- 🟡 **"Sandwich" product** (IR + visible blend — great for convection)
- 🟢 **GLM Lightning** (geostationary lightning mapper, overlay)

### A4 — Lightning (standalone)
- 🟡 **GOES GLM Flash Extent Density** (overlay; we already have a Lightning Density module — could deepen)
- 🔴 Vaisala/Blitzortung real-time strikes (license/embed limits — link-out)

> Recommended starter set if Jeremy wants a quick high-impact pick: **MRMS 0–2 km Rotation
> Tracks + MESH Tracks + Seamless Reflectivity mosaic + GOES GeoColor** — that alone makes the
> page feel like a pro storm-chase tool.

### ✅ BUILT 2026-06-25 — Jeremy's picks (new `RadarMap.tsx`)
Rebuilt the radar page as a dark Leaflet map with grouped subtabs, city labels, nearest-station
auto-select, opacity control, per-product legends, and 4-min auto-refresh. Sources verified via
curl (IEM RIDGE single-site + SSEC RealEarth national/satellite tiles, all serve latest frame).
- **Live Radar (IEM single-site):** Base Reflectivity (#14), Base Velocity + Storm-Rel Velocity
  (#15), VIL (#8).
- **National / MRMS (RealEarth):** National MRMS Reflectivity (#4), Near-Ground Reflectivity
  (#6 → MRMS hybrid-scan), ProbSevere (#12).
- **Satellite (RealEarth GOES-East):** True Color (#20 → GeoColor substitute, day), Clean IR
  (#21), Air Mass RGB (#24), IR Sandwich (#26).
- **Not built — no public tile service exists:** Rotation Tracks #1/#2 (AzShear) and MESH #3.
  Covered instead by **Storm-Relative Velocity + ProbSevere** (the live way to watch rotation),
  with an in-app note explaining the couplet signature.

## Appendix B — Tornado Climatology product menu *(P-12)*

**Menu delivered 2026-06-25 — awaiting Jeremy's picks.** The current page is mostly link-outs to
SPC tools + a couple of static charts. The big upgrade available: load the **SPC tornado
database (SVRGIS / NCEI Storm Events, 1950–present)** once and render everything **natively**
inside SSWX (Leaflet maps + Recharts) in our own theme. Feasibility: **🟢 native (we build it
from the dataset)** · **🟡 static SPC image** · **🔴 link-out only**.

### B1 — Native maps (built from the SPC/NCEI tornado dataset, our theme)
- 🟢 **Tornado density heatmap** (per-county / grid — "where do they actually hit")
- 🟢 **Historical tornado tracks map** (every path; filter by year range + EF rating)
- 🟢 **"Near Me" personalized** — every tornado within X miles of the user's saved location, with EF, date, deaths, path length *(uses our existing location system — strong tier seller)*
- 🟢 **Significant-tornado (EF2+) hot-spot map**
- 🟢 **State / county ranking** (most tornadoes, most violent, deadliest)

### B2 — Native charts (Recharts, our theme)
- 🟢 **Monthly frequency** *(already have — keep)*
- 🟢 **Diurnal distribution** (tornadoes by hour of day)
- 🟢 **Annual trend** (year-by-year counts; this year vs. average)
- 🟢 **EF-rating distribution** *(already have a version — keep/upgrade)*
- 🟢 **Path-length & width distributions**
- 🟢 **Killer-tornado / casualties timeline**
- 🟢 **Season-timing by region** (when "tornado season" peaks where the user lives)
- 🟢 **Live YTD counter vs. climatological average** (SPC annual running total)

### B3 — Static SPC climatology images (drop-in panels)
- 🟡 **SPC monthly probability maps** (tornado/hail/wind by calendar month)
- 🟡 **SPC annual average maps** (days with a tornado within 25 mi)
- 🟡 **Significant-tornado climatology**

### B4 — Keep as curated link-outs (don't embed well)
- 🔴 SPC Data Viewer · SPC Outbreaks · Environment Browser · Tornado Archive · USA Today archive
  *(all already linked — keep)*

> Recommended starter set: **"Near Me" personalized tornado history + density heatmap + diurnal
> chart + live YTD-vs-average counter.** Personalized local history is the standout feature.

### ✅ BUILT 2026-06-25 — Jeremy's picks (rebuilt `TornadoClimatology.tsx`)
Precomputed the full SPC tornado database (1950–2023, 70,022 tornadoes) into a compact
`public/data/tornadoClimo.json` (~324 KB, lazy-fetched) and rebuilt the page with 11 native
subtabs in SSWX theme, plus kept all existing reference content (EF scale, notable outbreaks,
SPC tool launcher, external archives):
- **A** Density heatmap (1° grid, Leaflet) · **D** EF2+ hotspots · **B** Tornado tracks map
  (8,995 EF2+ paths, filter by EF + era)
- **E** State rankings table · **F** Monthly average · **H** Annual trend (vs avg line)
- **J** Path length & width distributions · **K** Fatalities by year + deadliest tornadoes
- **L** Season timing by region (6-region line chart) · **M** Cumulative climatological average
  vs today's date · **N** SPC static climatology maps (4 verified NOAA images)
- Not picked (skipped): C (Near-Me personalized), G (diurnal), I (EF distribution chart), O.

## Appendix C — Alert & Warning tier × channel matrix *(P-19, to design)*
_Pending: delivery-method matrix per tier. Not started._

---

## Fix Log (Post-build)
- **2026-06-25** — **Leaflet CSS missing → broken maps.** The new `RadarMap` and the
  `TornadoClimatology` ClimoMap never imported `leaflet/dist/leaflet.css`, so when reached
  directly the map had no clipping/positioning — tiles rendered glitchy/misaligned and the
  internal panes ballooned to ~6912px, stretching the page. Fixed by importing leaflet.css in
  both, plus `map.invalidateSize()` after mount (lazy-route sizing) and `map.remove()` on
  unmount. Verified headless: leaflet panes no longer oversize the page (6912px → clipped).
- **2026-06-25** — **P-11 wiring fix:** the new `RadarMap` was orphaned; the live module at
  `/rotation` still rendered the old `RotationalMap`. Routed `/rotation` → `RadarMap`, deleted
  `RotationalMap.tsx`, relabeled to "Radar & MRMS" (sidebar/modules/FAQ).
- **2026-06-25** — **P-12 layout fix:** Tornado Climatology was way too tall (reference blocks
  always rendered under the active tab). Moved EF scale / notable outbreaks / external tools into
  a dedicated **Reference** subtab and trimmed map height 420→360, so the page is one tab tall.
- **2026-06-25** — Created this Post-Build FINAL VERSION punch list from Jeremy's 19-item
  request. P-11/P-12 are **list-only** (build the menu, not the page); P-15 is **decide-later**.
