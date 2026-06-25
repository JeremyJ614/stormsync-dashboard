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

### P-02 — Dashboard: glowing Customize button + more basic widgets 🟢 BUILD NOW
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

### P-04 — Air Quality module: full redesign + high-tech AQI bar 🟢 BUILD NOW
**Want:** The whole AQI module redesigned to look **cooler / more advanced / "wow."** The
**AQI bar at the top** redesigned to feel like a **mix of the SSWXCon Score gauge + more
glow / high-tech.** Keep all current data & behavior — visual redesign only.
**Done when:** AQI page has the premium treatment (hero, glow, animated gauge) and the top
bar reads like a high-tech score gauge; no data/logic changed.

### P-05 — Severe Weather Threat Index: same wow-factor redesign 🟢 BUILD NOW
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

### P-15 — Weather Learn quizzes: fix or remove 🤔 DECIDE LATER
**Want:** Quizzes aren't working. Decision deferred — **figure out at this phase** whether to
**fix** them or **remove** them. No action now beyond this note.
**Done when:** At its phase, we either repair the quiz flow or cleanly remove it.

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

## Execution order

Default: **top-to-bottom, P-01 → P-19**, one task per PR, merged live, skipping the
📋/🤔 items (P-11, P-12, P-15) except for filling their appendices. Jeremy may reprioritize
at any time.

| # | Task | Status |
|---|------|--------|
| P-01 | Hurricane Preview (Milton Cat-5) | ☐ |
| P-02 | Dashboard glow + basic widgets | ☐ |
| P-03 | Longer personalized discussion | ☐ |
| P-04 | AQI redesign + high-tech bar | ☐ |
| P-05 | SWTI redesign | ☐ |
| P-06 | SPC phone-fit + static maps | ☐ |
| P-07 | Meso Discussion upgrade | ☐ |
| P-08 | Storm Ingredients redesign + graphic | ☐ |
| P-09 | Thunderstorm Probability rebuild | ☐ |
| P-10 | Comparator: more params + categories | ☐ |
| P-11 | Radar/MRMS menu (Appendix A) | 📋 |
| P-12 | Tornado Climo menu (Appendix B) | 📋 |
| P-13 | Moon & Astronomy redesign | ☐ |
| P-14 | Storm Chasing AI target picker | ☐ |
| P-15 | Weather Learn quizzes | 🤔 |
| P-16 | Admin FAQ/Module-Guide editor | ☐ |
| P-17 | Forecast Game scouting + labels | ☐ |
| P-18 | Admin News editor (rich) | ☐ |
| P-19 | Alert & Warning tier matrix (Appendix C) | ☐ |

---

## Appendix A — Radar / MRMS / Satellite product menu *(P-11, to fill)*
_Pending: full categorized list for Jeremy to choose from. Not started._

## Appendix B — Tornado Climatology product menu *(P-12, to fill)*
_Pending: full list for Jeremy to choose from. Not started._

## Appendix C — Alert & Warning tier × channel matrix *(P-19, to design)*
_Pending: delivery-method matrix per tier. Not started._

---

## Fix Log (Post-build)
- **2026-06-25** — Created this Post-Build FINAL VERSION punch list from Jeremy's 19-item
  request. P-11/P-12 are **list-only** (build the menu, not the page); P-15 is **decide-later**.
