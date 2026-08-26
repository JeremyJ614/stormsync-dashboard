/**
 * Default FAQ content (flexible rebuild). Ships as the baseline; once an admin
 * populates `faq_categories` / `faq_entries`, the app uses the DB rows instead.
 * Each entry is a title + a free-form list of titled sections, so admins can add
 * their own sections ("What it does", "Pro tip", anything) and their own category
 * pages. Refreshed 2026-06 to match the current modules and alert system.
 */
export interface DefaultSection { heading: string; body: string }
export interface DefaultEntry { title: string; moduleId?: string; tier?: 1 | 2 | 3 | 4; sections: DefaultSection[] }
export interface DefaultCategory { name: string; entries: DefaultEntry[] }

const S = (heading: string, body: string): DefaultSection => ({ heading, body });

const GENERAL: DefaultEntry[] = [
  { title: "What is StormSync Media?", sections: [S("", "StormSync Media is a real-time severe-weather intelligence dashboard for spotters, chasers, broadcasters, and weather enthusiasts. It blends official feeds (NWS, SPC, NHC, IEM, Open-Meteo, GOES, MRMS) with original tools, AI briefings, an alert system, and a community layer (SSWX News, badges, the Forecast Game).")] },
  { title: "How are the tiers structured?", sections: [
    S("Tier 1 — Free", "Core forecast, dashboard, education and reference modules, plus in-app alerts, web push, and the daily digest."),
    S("Tier 2", "Adds SPC Outlook, Warning Center, Severe Weather History, SSWXCon, Forecast Game, Loyalty, Lightning Density and Aurora — and unlocks Warning / Watch / Outlook-escalation alerts."),
    S("Tier 3", "Adds Mesoscale Discussions, Severe Weather Probability, Storm Ingredients, SWTI, Severe Timing, Hazards, Radar & MRMS, Storm Chasing, City Comparator and Climatology — and lets you opt into email & text alerts."),
    S("Tier 4 Elite", "Unlocks every module plus the Emergency Storm Contact direct line."),
  ] },
  { title: "How do alerts work?", sections: [
    S("Channels", "In-app inbox (the bell), web/phone push, and a morning daily digest are available to everyone. Tier 3 can opt into email & text alerts from My Profile."),
    S("What triggers them", "Active NWS warnings & watches and SPC Day-1 outlook escalations (when your saved area reaches Enhanced risk or higher)."),
    S("Set it up", "Tap the bell → gear to choose channels and types. Tier 3 adds a dedicated alert email/phone in My Profile. Texts are sent personally by the StormSync team."),
  ] },
  { title: "Can I install StormSync as an app?", sections: [S("", "Yes — it's a PWA. Use the 'Install app' button on the Home screen or the 'Install StormSync' card in My Profile. On iPhone, use Safari's Share → Add to Home Screen; on Android, Chrome's ⋮ menu → Install app. Installing gives a full-screen, app-like experience and the most reliable alerts.")] },
  { title: "How do I set my location?", sections: [S("", "Use the search box in the header, the GPS button to auto-detect, or save multiple locations with the pin menu. Alerts and most modules use your saved locations.")] },
  { title: "What is the SSWX Loyalty Program?", sections: [S("", "Active members earn 100 points each calendar month, plus 250 points per referral. Points unlock prizes — locked prizes show the points required to reveal them. Referrals and renewals are credited by an admin; Forecast Game points post when the monthly board settles.")] },
  { title: "Who do I contact for help?", sections: [S("", "Use the Contact page. General questions go to the team inbox; billing, access and account matters go through Customer Service, which is routed to SSWX Internal Affairs. The Emergency Storm Contact line — Advanced tier, PIN protected — is for an active, life-threatening storm where you need a person within minutes.")] },
];

const m = (title: string, moduleId: string, tier: 1 | 2 | 3 | 4, overview: string, what: string, how: string, tip?: string): DefaultEntry => ({
  title, moduleId, tier,
  sections: [S("Overview", overview), S("What it does", what), S("How to use", how), ...(tip ? [S("Pro tip", tip)] : [])],
});

const MODULES: DefaultEntry[] = [
  m("Dashboard", "/dashboard", 1, "Your customizable home base.", "A grid of widgets (current conditions, hi/lo, 7-day, wind, sun, AQI and more) you arrange yourself.", "Tap the glowing Customize button to add, remove and reorder widgets.", "Layouts save per device — set up a lean one for your phone."),
  m("Detailed Forecast", "/forecast", 1, "Hourly forecast grid for the next 7 days.", "Temperature, precip probability, wind, humidity and weather code, hour by hour.", "Scroll horizontally through future hours.", "Pair it with Storm Ingredients on an active day."),
  m("Forecast Discussion", "/discussion", 1, "Plain-language forecast for your area.", "A multi-paragraph, location-specific breakdown derived from the nightly AI brief, plus the raw NWS Area Forecast Discussion.", "Read the plain-language tab first, then dig into the technical AFD.", ""),
  m("SPC Outlook", "/spc", 2, "Storm Prediction Center categorical & probabilistic outlooks.", "A phone-fit interactive national risk map (Levels 0–5 in the SSWX palette) plus a downloadable, shareable static-map area for Day 1–3 categorical and Day 1–2 tornado/wind/hail.", "Pick a Day and hazard. Use the static maps' Download/Share to post the outlook.", "Quiet days show small or no polygons — that's normal."),
  m("Severe Weather Probability", "/thunder", 3, "\"Will I see severe weather?\" — total-severe probability, not the categorical risk.", "A Day 1–8 probability heatmap with a friendly 6-step key (Almost Certain → Highly Unlikely) showing the chance of any severe weather within ~25 miles.", "Switch days with the tabs; Download/Share the map.", "Use it next to the SPC Outlook for the full picture."),
  m("Hurricane Tracker", "/hurricane", 2, "Live tropical tracking for the Atlantic & East Pacific.", "Active NHC storms on a map with category, winds, pressure and movement — plus a Preview tab that demos a Category-5 storm so you can see everything before one is live.", "Use Active Storms for live systems; open Preview to tour the display.", "Always defer to the official NHC cone and advisories."),
  m("Mesoscale Discussions", "/meso", 3, "Live SPC short-fuse severe outlooks.", "Every active Mesoscale Discussion with its polygon on a map, the probability of watch issuance, hazard chips, the full forecaster text, and a plain-language 'what this means for you'.", "Cards appear automatically when MDs are issued; expand for the full discussion.", "An MD usually precedes a watch by 1–6 hours."),
  m("Storm Ingredients", "/ingredients", 3, "The atmospheric parameters behind convection.", "A premium readout — CAPE, shear, SRH, STP, dewpoint, model agreement and an hour-by-hour threat timeline — plus a shareable graphic you can export as an image.", "Scrub the hour selector; use Download/Share for the graphic.", "High CAPE + strong shear + ample low-level helicity = supercell potential."),
  m("Threat Index (SWTI)", "/swti", 3, "StormSync's proprietary 0–100 severe-potential score.", "Combines instability, shear, helicity and moisture into a single animated gauge for your location.", "Read the gauge and the contributing parameter bars.", "Above ~70 means significant severe potential when triggers align."),
  m("Severe Timing", "/timing", 3, "When the threat peaks at your location.", "An hour-by-hour severe-weather timing window built from the model parameters.", "Find your highest-risk window and plan around it.", ""),
  m("Warning Center", "/warnings", 2, "Live NWS watches & warnings.", "Active alerts for your saved locations and any state, with severity and details.", "Filter by state or use your saved locations.", "Enable push from My Profile to get these the moment they're issued."),
  m("Storm Chasing", "/chasing", 3, "A live national chase-target picker.", "Scans the whole country, ranks the day's two best chase targets with their parameters (CAPE, shear, SRH, SWTI, STP, LCL, cap, peak timing), a hype score, and a written why-and-what-to-expect.", "Read the national verdict, then the two target cards; rescan anytime.", "It's decision-support — always defer to SPC outlooks, watches and warnings."),
  m("Radar & MRMS", "/rotation", 3, "Live radar, MRMS mosaics and satellite.", "National reflectivity, MRMS products and GOES satellite overlays on a dark, labeled map.", "Pick a product group and layer.", "Pair reflectivity with rotation products to spot dangerous storms."),
  m("Tornado Climatology", "/climatology", 3, "Historical tornado patterns.", "Tornado density, EF distribution and frequency context on a national map.", "Use the tabs to switch views; the Reference tab has the EF scale.", ""),
  m("Run Comparator", "/comparator", 3, "Side-by-side model parameters.", "Compares severe-weather parameters across models for your area, grouped by category.", "Scan the grouped parameters to gauge model agreement.", ""),
  m("AQI Forecast", "/aqi", 1, "Air quality for your location.", "Real-time AQI and pollutant breakdown (PM2.5, PM10, O3, NO2) with an animated, high-tech gauge.", "Hover a pollutant for what it means and current health guidance.", ""),
  m("Moon & Astronomy", "/moon", 1, "Sky-gazing dashboard.", "A realistic current-phase moon plus rise/set and astronomy data.", "Check tonight's phase and timing before you head out.", ""),
  m("Aurora & Star Gazing", "/aurora", 2, "Combined aurora and stargazing outlook.", "Kp index, aurora view lines and the OVATION oval, plus tonight's sky-clarity score, 48-hour observing windows and deep-sky targets.", "Use the Stargazing / Aurora / Both tabs; the unified legend covers both map layers.", ""),
  m("Lightning Density", "/lightning-globe", 2, "Global lightning activity.", "A lightning-density globe of recent strike activity.", "Spin the globe to active regions.", ""),
  m("SSWXCon Score", "/sswxcon", 2, "A 1–5 national convective threat level (like DEFCON for storms).", "A single national severity reading from current data plus AI synthesis.", "5 = all clear; 1 = widespread significant severe imminent.", ""),
  m("Forecast Game", "/game", 2, "Pick where severe weather hits.", "A daily prediction game scored against SPC storm reports, with a monthly leaderboard and a labeled, scout-friendly map.", "Lock in your target before the deadline.", "Use the scouting panel and today's outlook to pick smarter."),
  m("Loyalty Dashboard", "/loyalty", 2, "Your points and prizes.", "Tracks your monthly activity points, referrals and prize progress.", "Watch the progress bar to your next prize.", "Locked prizes are blurred — the points needed are always shown."),
  m("Weather Glossary", "/glossary", 1, "Plain-language weather terms.", "A searchable glossary across Basics, Clouds, Lightning, Flooding, Patterns, Observations and Aviation.", "Search or browse by category.", ""),
];

export const DEFAULT_FAQ: DefaultCategory[] = [
  { name: "General FAQ", entries: GENERAL },
  { name: "Module Guide", entries: MODULES },
];
