/**
 * What every module is, written once.
 *
 * Two features need this and they were never going to stay in agreement as two
 * separate lists: the animated intro guide a new member walks through, and the
 * Module Guide section of the FAQ. So both read from here. Adding a module
 * means adding one entry and it appears in both, correctly, immediately.
 *
 * Voice: written for someone who has just signed up and does not yet know what
 * any of this is for. `what` says what the module is in one line. `does` is the
 * substance. `use` is the thing to actually do first. `tip` is the thing a
 * regular would tell them.
 */

export interface ModuleGuideEntry {
  /** Route id, matching ALL_MODULES in useAuth. */
  id: string;
  title: string;
  /** Which grouping it belongs to in the guide and the sidebar. */
  group: GuideGroup;
  what: string;
  does: string;
  use: string;
  tip?: string;
  /** Set when the module is genuinely new, so the guide can flag it. */
  isNew?: boolean;
}

export type GuideGroup =
  | "Start here" | "Forecast" | "Severe weather" | "Conditions"
  | "Sky & space" | "Maps & history" | "Community" | "Your account";

export const GUIDE_GROUPS: { id: GuideGroup; blurb: string }[] = [
  { id: "Start here", blurb: "The pages you will open most." },
  { id: "Forecast", blurb: "What the weather is going to do." },
  { id: "Severe weather", blurb: "When it turns dangerous." },
  { id: "Conditions", blurb: "Air, water, fire, snow and the road." },
  { id: "Sky & space", blurb: "For the nights you look up." },
  { id: "Maps & history", blurb: "Radar, models and what has happened before." },
  { id: "Community", blurb: "The parts with other people in them." },
  { id: "Your account", blurb: "Plan, alerts, help." },
];

export const MODULE_GUIDE: ModuleGuideEntry[] = [
  // ── Start here ─────────────────────────────────────────────────────────────
  {
    id: "/", title: "Home", group: "Start here",
    what: "Where the app opens.",
    does: "Today's headline, the weather news feed, anything the team has broadcast, and an App Updates tab showing badges people earned, releases that went out, game and trivia results, and who just joined.",
    use: "Read the headline, then flick to App Updates to see what has been happening.",
    tip: "The bell in the header is your alert inbox, and it works from any page.",
  },
  {
    id: "/dashboard", title: "Dashboard", group: "Start here",
    what: "One tile per module, so you can see where to look.",
    does: "A wall of your modules, each reading live from the shared forecast: temperature with the next twenty-four hours drawn under it, CAPE, wind on a compass, AQI and UV on their own named bands, the moon as a moon. Tiles are deliberately unequal — most sit quiet, and the ones worth acting on light their rail.",
    use: "Open it and look for the lit rails. Press Customize to move tiles within a section or take one off the wall entirely.",
    tip: "It is not a second forecast page — a module with nothing to report is not on the wall at all. Your arrangement saves per device, so your phone can be lean and your desktop dense.",
  },
  {
    id: "/forecast", title: "Daily Brief & Forecast", group: "Start here",
    what: "Your morning brief, then the hour-by-hour.",
    does: "Opens on the Daily Brief: the same summary the push and email digest carry, with the sections and delivery time you choose. A ribbon across the top plots the whole week on one temperature scale, so the shape of the week reads before any number does, and behind it sit the national outlooks — SPC thunderstorm and dry-thunderstorm, WPC rainfall and HeatRisk, CPC 6-10 and 8-14 day, drought and autumn foliage — drawn on the app's own map rather than as pictures.",
    use: "Read the ribbon, pick the day that looks different, then press Customise to choose what is in the brief and what time it arrives.",
    tip: "The brief is the fastest way to know whether today needs your attention.",
  },

  // ── Forecast ───────────────────────────────────────────────────────────────
  {
    id: "/discussion", title: "Forecast Discussion", group: "Forecast",
    what: "The forecast in plain language.",
    does: "A location-specific written breakdown from the nightly AI brief, alongside the raw Area Forecast Discussion the Weather Service office actually issued.",
    use: "Read the plain-language tab first, then open the technical one if you want the reasoning.",
  },
  {
    id: "/comparator", title: "Model Runs", group: "Forecast",
    what: "What the models are showing, side by side, with playback.",
    does: "Three models rather than two — HRRR at 3 km, GFS out to two days, and HREF, a twenty-one-member ensemble whose maps are probabilities rather than one answer. Eighty-four parameters between them, every one checked against the live file it comes from. Frames play as a loop you can scrub, and there is still a Nowcast tab that reads the next fifteen minutes to six hours from live data rather than a map image.",
    use: "Start on Nowcast for right now; use HRRR for today, GFS for the next two days, and HREF when you want to know how confident to be.",
    tip: "When the models disagree, that disagreement is the forecast — and HREF is the one that measures the disagreement for you.",
  },
  {
    id: "/wpi", title: "Weather Pattern AI", group: "Forecast",
    what: "The pattern behind the weather.",
    does: "Reads the large-scale setup and explains what regime you are in and what it usually means.",
    use: "Worth a look at the start of a week rather than the start of a day.",
  },
  {
    id: "/summary", title: "Daylight Tracker", group: "Forecast",
    what: "How much light you have left.",
    does: "The day drawn as a full twenty-four-hour arc with night shaded at both ends and the twilights marked, plus all twelve months on one baseline as a ribbon you can scrub to see the season turn.",
    use: "Check it before an evening plan that depends on light. Drag the month ribbon to see how much earlier it will be dark in six weeks.",
  },

  // ── Severe weather ─────────────────────────────────────────────────────────
  {
    id: "/warnings", title: "Warnings & Reports", group: "Severe weather",
    what: "What is in effect, and what has actually happened.",
    does: "Every active Weather Service watch and warning, plus a Reports tab of the Local Storm Reports people on the ground have filed: hail sizes, wind speeds, tornado sightings, with times and places.",
    use: "During an event, flip to Reports to see what has verified rather than what was forecast.",
    tip: "Nothing on this page animates while a warning is active for your location. That is deliberate.",
  },
  {
    id: "/spc", title: "SPC Outlook", group: "Severe weather",
    what: "The national severe weather risk, straight from SPC.",
    does: "Categorical and probabilistic outlooks for Day 1 to 3 on an interactive map, plus shareable static maps. Hail, wind and tornado now carry SPC's conditional intensity tiers, which SPC introduced in February 2026, with significant areas hatched the way SPC hatches them.",
    use: "Pick a day and a hazard. Use Download or Share to post it.",
    tip: "A quiet day with small polygons is a real answer, not a broken map.",
  },
  {
    id: "/meso", title: "Mesoscale Discussions", group: "Severe weather",
    what: "SPC's short-fuse warnings that something is developing.",
    does: "Every active discussion with its polygon, the probability a watch follows, the forecaster's full text and a plain-language read on what it means for you.",
    use: "Cards appear on their own when discussions are issued.",
    tip: "One of these usually comes one to six hours before a watch.",
  },
  {
    id: "/chasing", title: "Storm Chasing", group: "Severe weather",
    what: "The day's two best chase targets in the country.",
    does: "Candidates are generated inside the SPC risk polygons, scored against model data for instability, shear, helicity, cloud base and cap, then narrowed to two targets at least 200 km apart and explained. Five tabs: why these two, every parameter side by side, expected storm mode, how likely it is to bust, and how today ranks against the rest of the year.",
    use: "Read the score at the top, then Overview. Bust Probability is the tab that will save you a drive.",
    tip: "The bust number exists because sometimes the answer is stay home. Believe it.",
    isNew: true,
  },
  {
    id: "/ingredients", title: "Storm Ingredients", group: "Severe weather",
    what: "The parameters behind convection.",
    does: "CAPE, shear, storm-relative helicity, significant tornado parameter, dewpoint, model agreement and an hour-by-hour threat timeline, plus a graphic you can export.",
    use: "Scrub the hour selector to find when things come together.",
    tip: "High instability with strong shear and low-level turning is the supercell recipe.",
  },
  {
    id: "/swti", title: "Threat Index", group: "Severe weather",
    what: "One number for severe potential.",
    does: "Combines instability, shear, helicity and moisture into a 0 to 100 score for your location, with the contributing parameters shown underneath.",
    use: "Read the gauge, then the bars that explain it.",
    tip: "Above about 70 means significant potential if something sets it off.",
  },
  {
    id: "/timing", title: "Severe Timing", group: "Severe weather",
    what: "When the threat peaks where you are.",
    does: "An hour-by-hour severe window built from the model parameters.",
    use: "Find your highest-risk hours and plan around them.",
  },
  {
    id: "/thunder", title: "Thunderstorm Probability", group: "Severe weather",
    what: "The straight answer to \"will I see severe weather\".",
    does: "A Day 1 to 8 probability map with a plain six-step key, showing the chance of any severe weather within about twenty-five miles.",
    use: "Switch days with the tabs.",
  },
  {
    id: "/sswxcon", title: "SSWXCon Score", group: "Severe weather",
    what: "A national threat level on a named scale, with a line in it.",
    does: "One reading for the country, drawn as sixty countable segments rather than a needle — because this is a level, not a speed. The activation gate is marked on the ring, segments below it are cold and segments past it burn, so crossing the line is something you can see from across a room.",
    use: "Read the number, then the distance to activation printed under it. Below the gate it is weather; above it, it is an event.",
  },
  {
    id: "/hurricane", title: "Hurricane Tracker", group: "Severe weather",
    what: "Live tropical systems.",
    does: "Active storms in the Atlantic and East Pacific with category, winds, pressure and movement, plus a preview mode that demonstrates a Category 5 so you can learn the display before you need it.",
    use: "Active Storms for real systems; Preview to tour it.",
    tip: "Always defer to the official NHC cone and advisories.",
  },

  // ── Conditions ─────────────────────────────────────────────────────────────
  {
    id: "/winter", title: "Winter Center", group: "Conditions",
    what: "Winter storms, from impact to hour by hour.",
    does: "Five tabs: the Winter Storm Severity Index and snow on the ground on a map, five-day snowfall for fifty-one cities, every winter alert in the country, an hour-by-hour timeline for your location with precipitation type, and the national snow and ice probability maps.",
    use: "Storm Map first for the shape of it, Timeline for what happens at your door.",
    tip: "Precipitation type is worked out from the temperature aloft, not just at the surface, so a 34°F hour can still read as snow.",
    isNew: true,
  },
  {
    id: "/cameras", title: "Traffic Cameras", group: "Conditions",
    what: "Roughly 6,500 public cameras.",
    does: "Highway and wildfire-watch cameras from Caltrans, ALERTCalifornia, Michigan DOT and DriveBC, as a grid or on a map, with live video where the network publishes a stream.",
    use: "Set a radius, then search by road number or town.",
    tip: "Coverage follows the networks that publish without an API key, so it is strongest in California, Michigan and British Columbia.",
    isNew: true,
  },
  {
    id: "/rivers", title: "River & Flood Gauges", group: "Conditions",
    what: "How high the water is.",
    does: "Live river gauge readings against flood stage, with the trend and what each stage actually means for the area.",
    use: "Find the gauges upstream of you, not just the nearest one.",
    tip: "A gauge rising fast matters more than a gauge that is already high and steady.",
  },
  {
    id: "/fire", title: "Fire Weather", group: "Conditions",
    what: "Whether conditions favour fire.",
    does: "Fire weather outlooks, active incidents, and the ingredients behind them: wind, humidity, fuel dryness.",
    use: "Check the outlook first, then the incidents near you.",
  },
  {
    id: "/aqi", title: "AQI Forecast", group: "Conditions",
    what: "Air quality, and pollen.",
    does: "Real-time air quality with the pollutant breakdown, plus a Pollen tab covering how readily pollen is moving today, the worst window, and the five-day picture.",
    use: "Tap a pollutant to see what it is and what it does to you.",
  },
  {
    id: "/hazards", title: "Hazards & Drought", group: "Conditions",
    what: "The slow-moving problems.",
    does: "Drought monitor status and the longer-range hazard outlooks.",
    use: "Worth checking monthly rather than daily.",
  },
  {
    id: "/mosquito", title: "Mosquito Index", group: "Conditions",
    what: "How bad it will be outside.",
    does: "A mosquito activity read from temperature, humidity and recent rain.",
    use: "Check it before an evening outdoors.",
  },

  // ── Sky & space ────────────────────────────────────────────────────────────
  {
    id: "/aurora", title: "Aurora & Star Gazing", group: "Sky & space",
    what: "Tonight's sky, both kinds.",
    does: "Kp index, aurora view lines and the OVATION oval, plus a sky-clarity score, forty-eight hours of observing windows and deep-sky targets.",
    use: "Use the Stargazing, Aurora or Both tabs depending on why you are out.",
  },
  {
    id: "/moon", title: "Moon & Astronomy", group: "Sky & space",
    what: "The moon, drawn properly.",
    does: "The current phase rendered as it actually looks, with rise and set times and the astronomy around it.",
    use: "Check the phase before planning a dark-sky night.",
  },
  {
    id: "/lightning-globe", title: "Lightning Density", group: "Sky & space",
    what: "Where lightning happens, and where it is happening now.",
    does: "Climatology leads, because that is what the module is for: the world's strike density, the US by state, and the thunder year drawn as a year — twelve months at their own clock angles, so the season reads as the lobe it is rather than as a bar chart cut at an arbitrary January. A Live tab sits behind it with two real layers on the app's own map: GOES-East flash extent density for where it is striking, and LightningCast for the chance of a flash in the next sixty minutes.",
    use: "Climatology to learn your own season; Live when something is up.",
    tip: "The next-hour layer is the one worth having. By the time a flash appears over you, a strike map has told you something you already knew.",
  },

  // ── Maps & history ─────────────────────────────────────────────────────────
  {
    id: "/rotation", title: "Radar & MRMS", group: "Maps & history",
    what: "Radar, and the products built on top of it.",
    does: "National reflectivity, GOES satellite, and eight MRMS products on one dark, labelled map: reflectivity at the lowest altitude plus seven rainfall totals from one hour to three days, in NOAA's own colour ramps. The console folds away on a phone so the map keeps the screen.",
    use: "Pick a product group, then a layer. Tiles are requested down to zoom 14, which is as deep as the service publishes.",
    tip: "Reflectivity tells you where the storm is; the rotation products tell you which one to worry about.",
  },
  {
    id: "/climatology", title: "Tornado Climatology", group: "Maps & history",
    what: "Seventy-four years of US tornadoes, in four questions.",
    does: "When, where, the record, and anatomy. The season is a ridgeline of the national curve and the six regions under it, ordered by the month each region peaks — so the march of the season north and west is simply the reading order. Where is one map with three layers: all tornadoes, EF2 and up, and every violent track. The record draws reports per year and deaths per year on one span, which is the whole argument: counts climb because detection improved, deaths fall because warning did.",
    use: "Start on When to find your own season, then Where to find your own ground.",
    tip: "The database ends in 2023, which is where SPC's cleaned archive ends. That is stated in the header rather than hidden in an axis.",
  },
  {
    id: "/history", title: "Severe Weather History", group: "Maps & history",
    what: "What has already happened, back a decade.",
    does: "Ten years of tornado tracks you can filter three ways at once: by EF rating, by state, and by month across every year on record — \"every May since 2016\" is one pick. Counts lead at display size with a bar showing what they are made of.",
    use: "Pick a month, then a state, and watch how different two neighbouring states can be in the same month.",
    tip: "Years before 2019 are marked partial where the damage survey is incomplete, rather than presented as a full count.",
  },
  {
    id: "/glossary", title: "Weather Glossary", group: "Maps & history",
    what: "Every term, in plain words.",
    does: "A searchable glossary across the basics, clouds, lightning, flooding, patterns, observations and aviation.",
    use: "Search it whenever a module uses a word you do not know.",
    tip: "Nothing in this app is meant to be jargon you have to already know.",
  },

  // ── Community ──────────────────────────────────────────────────────────────
  {
    id: "/duel", title: "AI Knowledge Battle", group: "Community",
    what: "You against the model, on weather questions.",
    does: "A head-to-head round of questions where both of you answer and the score is kept.",
    use: "Play a round when you have five minutes. It is a faster way to find your gaps than reading the glossary.",
  },
  {
    id: "/game", title: "Forecast Game", group: "Community",
    what: "Guess where severe weather lands.",
    does: "A daily prediction scored against the storm reports that actually came in, with a monthly leaderboard.",
    use: "Lock your pick in before the deadline.",
    tip: "The scouting panel and today's outlook are both right there. Use them.",
  },
  {
    id: "/trivia", title: "Daily Trivia", group: "Community",
    what: "One question a day.",
    does: "A weather question worth points, with the answer explained afterwards.",
    use: "Takes about fifteen seconds.",
  },
  {
    id: "/loyalty", title: "Loyalty Dashboard", group: "Community",
    what: "Points, badges and prizes.",
    does: "Your monthly points, referrals, badges earned and progress toward the next prize.",
    use: "Watch the progress bar; locked prizes always show what they cost.",
    tip: "Badges are earned automatically. You will be told when one lands.",
  },
  {
    id: "/raffles", title: "Raffles", group: "Community", isNew: true,
    what: "Every draw and every prize in it, in the open.",
    does: "Lists the four draws — monthly, yearly, random and blessed — with all one hundred prizes and the odds attached to each. Tap a prize to see exactly what it does to your account. It also shows the tickets you are holding and who has won recently.",
    use: "Read the draw you have tickets in before the period ends, so you know what you are playing for.",
    tip: "Nothing here is hidden behind a plan. Everybody sees every prize, whether or not they hold a ticket for it.",
  },

  // ── Your account ───────────────────────────────────────────────────────────
  {
    id: "/subscription", title: "Subscription", group: "Your account",
    what: "Your plan, and everything you could add.",
    does: "What you are on now, what the other tiers include, every module with what it would cost you today, and a Modify Plan tab where you change tier, add modules or cancel.",
    use: "All Modules is the honest browse: every module in the app with its price at your tier.",
  },
  {
    id: "/contact", title: "Contact", group: "Your account",
    what: "How to reach us.",
    does: "General questions, customer service, and the Emergency Storm Contact vault: a PIN-protected direct line for an active, life-threatening storm where you need a person within minutes.",
    use: "Use the ordinary form for anything that is not an emergency.",
    tip: "The vault PIN comes with alert level 4. If you have it, the page shows it to you.",
  },
  {
    id: "/faq", title: "FAQ & Module Guide", group: "Your account",
    what: "This, written down.",
    does: "Answers to the common questions, a guide to every module, and information about the rest of what StormSync does.",
    use: "You can replay the intro guide any time from My Profile.",
  },
];

/** The guide, grouped and in order. */
export function guideByGroup(): { group: GuideGroup; blurb: string; entries: ModuleGuideEntry[] }[] {
  return GUIDE_GROUPS.map((g) => ({
    group: g.id,
    blurb: g.blurb,
    entries: MODULE_GUIDE.filter((m) => m.group === g.id),
  })).filter((g) => g.entries.length > 0);
}

export function guideFor(moduleId: string): ModuleGuideEntry | undefined {
  return MODULE_GUIDE.find((m) => m.id === moduleId);
}
