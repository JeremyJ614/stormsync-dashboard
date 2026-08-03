# Design Reference Screenshots

These are Jeremy's expectation references for specific modules in `BUILD_PLAN.md`.
Build to match the **style and behavior** shown here (not pixel-for-pixel copies).

## U-07 — SPC Outlook (automated, custom colors + legend)
- `U07-spc-outlook-maxvelocity.png` — MaxVelocityWX "Will I See Severe Weather? — Today".
  A smoothed/categorical national map with a **custom KEY**: Almost Certain (red) →
  Very Likely → Likely → Maybe → Not Likely → Highly Unlikely (greens).
- **Goal:** automated SPC Outlook for **Days 1–6**, with **Tornado / Wind / Hail
  subtabs**, rendered with **our own chosen colors and legend**.

## U-11 — Thunderstorm Probability (same SPC-style engine as U-07)
- `U11-thunderstorm-prob-style-severe-outlook.png` — Ryan Hall "Severe Weather Outlook"
  with a custom **Threat Level 1–5** legend (Low → Extreme) and "Highest Risk: Level X of 5".
- `U11-thunderstorm-prob-style-tornado-likelihood.png` — Ryan Hall "Tornado Likelihood"
  with a **Level 1–5** legend (Possible → Near Certain).
- **Goal:** an SPC-style smoothed map whose **legend represents thunderstorm probability**,
  using our own colors. Same reusable engine as U-07.

## U-15 — Star / Stargazing Night Sky Outlook (+ Aurora)
- `U15-night-sky-stargazing.png` — Ryan Hall "Night Sky — Tonight": Stargazing / Aurora /
  **Both** toggle; Tonight / Tomorrow / (3rd night) tabs; conditions legend
  (Perfect / Excellent / Clear / Decent / Poor); moon phase + % ("First Quarter"); Kp.
- `U15-night-sky-aurora.png` — same map zoomed, **aurora view lines** (approximate,
  from NOAA SWPC Kp) overlaid.
- **Goal:** daily auto-generated night-sky outlook blending **cloud cover, moonlight,
  transparency, precipitation, wind**, plus **aurora guidance from NOAA SWPC Kp**.
  Include the "Experimental / not an official product" disclaimer.

## U-19 — Severe Weather History (AI summaries)
- `U19-history-yesterday.png`, `U19-history-this-week-so-far.png`,
  `U19-history-last-week.png`, `U19-history-this-month-so-far.png`,
  `U19-history-last-month.png` — Ryan Hall "Weather History".
- **Layout per range:** time-range tabs (**Yesterday · This Week So Far · Last Week ·
  This Month So Far · Last Month**; Jeremy also wants **Last Year**), a narrative summary
  paragraph, then four panels: **Major Events · Alerts · Active Records ·
  Patterns & Highlights**.
- **Goal:** AI (Storm Engine) generates these recaps from real severe-weather data.
