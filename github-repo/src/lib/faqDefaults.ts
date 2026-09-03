/**
 * The FAQ, as shipped.
 *
 * These are the baseline. Once an admin populates `faq_categories` and
 * `faq_entries` the app reads those instead, so this file is what a brand-new
 * deployment sees and the reference the database was seeded from.
 *
 * The Module Guide section is NOT written here. It is generated from
 * `src/lib/moduleGuide.ts`, which the animated intro guide also reads, because
 * two hand-maintained descriptions of the same module will disagree within a
 * month. Add a module there and it appears in both, correctly, at once.
 */
import { MODULE_GUIDE, GUIDE_GROUPS } from "./moduleGuide";

export interface DefaultSection { heading: string; body: string }
export interface DefaultEntry { title: string; moduleId?: string; tier?: 1 | 2 | 3 | 4; sections: DefaultSection[] }
export interface DefaultCategory { name: string; entries: DefaultEntry[] }

const S = (heading: string, body: string): DefaultSection => ({ heading, body });

// ─── General ─────────────────────────────────────────────────────────────────
const GENERAL: DefaultEntry[] = [
  {
    title: "What is StormSync Media?",
    sections: [S("", "A real-time severe-weather desk for spotters, chasers, broadcasters and anyone who would rather know early. It pulls from the official feeds — the National Weather Service, the Storm Prediction Center, the National Hurricane Center, the Weather Prediction Center, NOHRSC, the Climate Prediction Center, Open-Meteo, GOES and MRMS — and adds tools, AI briefings, a five-level alert system and a community layer on top. Where we compute something ourselves rather than quoting an agency, the module says so.")],
  },
  {
    title: "How are the tiers structured?",
    sections: [
      S("Free", "Every module is visible to everyone, whatever you pay. Free includes your choice of one module plus the always-on pages, in-app alerts and push alerts, and the daily brief."),
      S("Basic", "Adds a bundle of modules plus free picks of your own, and unlocks Contact Alerts: email or text to a real contact of yours."),
      S("VIP", "A larger bundle and more picks, plus Outlook & Vault alerts: a morning heads-up when you are inside an SPC or winter outlook, and the Emergency Contact PIN."),
      S("Advanced", "Every module in the app, and every alert level including the Direct Line."),
      S("Changing your mind", "The Subscription module shows what you are on, what every other tier includes, and what any individual module would cost you today. You can change tier, add modules or cancel there."),
    ],
  },
  {
    title: "How do alerts work?",
    sections: [
      S("Five levels", "1. In-app alerts for severe weather affecting your state. 2. Push notifications to your phone, scoped how you choose. 3. Email or text to a real contact. 4. Everything in 3, plus SPC and winter outlook warnings at the start of the day, plus the Emergency Contact PIN. 5. Everything in 4, plus a direct line: we watch your locations and contact you ourselves when we see something troubling."),
      S("What you get free", "Levels 1 and 2 are free to everyone. Basic includes level 3, VIP includes level 4, Advanced includes all five."),
      S("Buying one on its own", "Any level can be added at any tier for a monthly price, the same way modules work. Prices are shown in My Profile and on the signup page."),
      S("Choosing what counts", "From level 2 up you decide the scope: your whole state, one saved location, several, or everywhere you have saved. That one setting applies to every level you hold."),
      S("Setting it up", "My Profile has the ladder, the scope picker and your contact details. The bell in the header is your in-app inbox and works from any page."),
      S("If your level does not match your plan", "It can be set directly. An admin can place an account on a specific level — above or below what the tier would give it — and that setting wins over everything else until it is cleared. If yours looks wrong, the Contact page is the place to ask."),
    ],
  },
  {
    title: "Why does the app stop animating sometimes?",
    sections: [S("", "Because a warning is active for your location. While one is in effect, animation across the whole app stops: no drifting backgrounds, no sliding panels, no pulsing markers. During severe weather you should be reading, not watching things move. It also honours your device's reduced-motion setting at all times, warning or not.")],
  },
  {
    title: "Can I install StormSync as an app?",
    sections: [S("", "Yes. It is a progressive web app, so there is no store to go through. Use the Install button on the Home screen or the card in My Profile. On iPhone use Safari's Share menu and Add to Home Screen; on Android use Chrome's menu and Install app. Installed, it runs full screen and alerts are more reliable. Updates arrive on their own: the app checks periodically and refreshes quietly when you are not in the middle of something — it will not reload over a form you are filling in or a post you are writing, and if one is interrupted anyway, the draft is kept and offered back to you when you return.")],
  },
  {
    title: "How do I set my location?",
    sections: [S("", "Use the search box in the header, or the arrow next to it to detect where you are. You can save several places from the pin menu. Almost every module and every alert reads from your saved locations, so this is the one setting worth doing first.")],
  },
  {
    title: "Is there a guide to the app?",
    sections: [S("", "Yes, twice over. New members get an animated intro the first time they sign in, ending with an optional walkthrough of every module. You can replay either from My Profile at any time. The Module Guide section of this FAQ is the same content in written form.")],
  },
  {
    title: "What is the SSWX Loyalty Program?",
    sections: [S("", "Active members earn 100 points each calendar month and 250 per referral. Points unlock prizes, and a locked prize always shows what it costs rather than hiding it. Badges are earned automatically as you use the app and you are notified when one lands. Forecast Game points post when the monthly board settles.")],
  },
  {
    title: "Where does the weather news come from?",
    sections: [S("", "A curated feed of severe-weather reporting, refreshed through the day. The App Updates tab on the Home page is separate: that is news about StormSync itself, including badges people earned, releases that went out, game and trivia results, and new members.")],
  },
  {
    title: "Is my data shared?",
    sections: [S("", "No. Your locations, alert preferences and contact details are used to send you what you asked for and nothing else. They are not sold and not passed to third parties. Inside the app other members can see your first name against public things like a badge you earned or a game you won, and nothing more.")],
  },
  {
    title: "Who do I contact for help?",
    sections: [
      S("General questions", "The Contact page. It reaches the team inbox."),
      S("Billing and account", "Also the Contact page, through Customer Service. It is routed to SSWX Internal Affairs."),
      S("An actual emergency", "The Emergency Storm Contact vault on the Contact page is a PIN-protected direct line for an active, life-threatening storm where you need a person within minutes. The PIN comes with alert level 4; if you hold it, the page shows it to you."),
    ],
  },
  {
    title: "What are badges, and how do I earn them?",
    sections: [
      S("They earn themselves", "There are 128 badges that award themselves the moment you qualify — no claiming, no asking. They cover how long you have been here, how often you turn up, streaks of consecutive days, how much of the app you have explored, the games and the trivia, points, alerts delivered, referrals, and saved locations. You get a notification when one lands."),
      S("Where you watch from", "Your first saved location earns a region badge automatically. It is set once, from where you started, and it does not follow you around."),
      S("Bringing people in", "Referrals have their own ladder, and there is a second set for referrals that actually became paying members."),
      S("What they look like", "Each badge is a struck medallion in its own colour with its own icon. How ornate the rim is tells you how hard it was: common, rare, epic, then legendary, which carries a second ring and a light that keeps turning. They are on your profile."),
      S("The handmade ones", "A few badges have no rule behind them at all. Those are given by hand, and they are the rarest things in the case."),
    ],
  },
  {
    title: "How do the raffles work?",
    sections: [
      S("Four draws", "Monthly and yearly run on their period. Random can be run at any time. Blessed is not earned at all — it is given."),
      S("Every prize is published", "The Raffles page lists all four draws and every one of the hundred prizes in them, with the odds attached to each. Tap a prize and it opens to say exactly what it does to your account. Nothing is gated: whether or not you hold a ticket for a draw, you can read everything in it."),
      S("What your plan includes", "Basic: one monthly entry. VIP: one monthly and one yearly. Advanced: two of each. They appear on their own at the start of each period, and if you upgrade mid-month yours arrive within a day."),
      S("More than one way in", "Tickets are also handed out for taking part. Monthly and yearly entries reset with their period; random and blessed tickets build up until they win something, and are spent when they do."),
      S("How the winner is picked", "Weighted by tickets — every ticket is a separate entry, so holding four genuinely is four chances rather than one. Prizes are not equally likely: the better ones are deliberately rarer, and the page shows each prize's real chance rather than implying they are all the same. The draw is recorded with how many entrants there were and how many tickets were in the pool."),
      S("Getting the prize", "Almost everything applies itself in the same moment you win — a discount in your name, points on the leaderboard, a module added to your plan, an alert level unlocked, months of free membership, a name on the wall. Where the prize is a discount and you have no live subscription for it to attach to, it becomes a coupon code held in your name, waiting in My Profile until you do. Three prizes need a person rather than a system: a seat on a chase, a personal graphic, and the SSWX secret prize. Those say so on the card."),
      S("If you already have everything", "Some prizes cannot land on an account that is already maxed out — a module you own, an alert level you hold, a tier you are above. Rather than handing you nothing, the house rule gives you one monthly ticket and one yearly ticket instead, unless that particular prize says it does something else."),
      S("Where to look", "The Raffles page for the draws and the prizes. My Profile for the tickets you are holding, the benefits you have been given, and any prize coupon waiting to be used."),
    ],
  },
  {
    title: "What is the Wall on the Home page?",
    sections: [
      S("What it is", "A gold plaque on the Home page with names cut into it. Several raffle prizes are an engraving, and winning one puts your name up there."),
      S("The blessed name", "One slot at the top holds a single name at a time. It comes from the Blessed draw and nothing else. When somebody else wins it, they take the slot and the previous holder moves down to the roll beneath — they are not removed, because they did win it."),
      S("It is permanent", "Names are not tied to a live subscription. Cancel, come back, or never come back: a wall is a monument, and you do not get chiselled off it."),
      S("Who can see it", "Everybody, signed in or not. It sits on the Home page above the news."),
    ],
  },
  {
    title: "Can I change how the menu looks?",
    sections: [
      S("Fifteen of them", "The navigation menu is your choice, not a fixed part of the app. There are fifteen, and they are genuinely different objects rather than colour variations: a radar scope that sweeps, a departure board that flips, a comic page, a neon street, a black hole, folded paper, a stack of stone."),
      S("Where to pick", "New members choose one during the intro guide. After that it is in My Profile, and it changes the moment you tap it."),
      S("If you never choose", "You get whichever menu the app is set to by default, which an admin sets. Picking your own overrides it from then on, and changing the default afterwards does not overwrite a choice you made."),
    ],
  },
  {
    title: "What does the Advanced plan actually include?",
    sections: [
      S("Every module", "All of them. Not a long list that happens to be most of them — the rule is the tier, so anything added to the app afterwards is yours the moment it appears. You never have to ask for it and nothing has to be re-issued."),
      S("Everything else", "All five alert levels, two monthly raffle entries and two yearly ones."),
    ],
  },
  {
    title: "My phone is not getting notifications",
    sections: [
      S("Check the device is registered", "A push goes to a device, not to an account, and a registration made in a browser you have since cleared or replaced will look fine from our side while reaching nothing. My Profile lists the devices registered to you, when each was added, and when each last confirmed it received something."),
      S("Register the one in your hand", "If the phone you are holding is not in that list, there is a button to add it. You will be asked for notification permission once."),
      S("Prove it", "Send a test. It waits for the device itself to confirm delivery rather than trusting that the push was accepted — accepted and delivered are not the same thing, and a dead registration accepts everything."),
    ],
  },
  {
    title: "What happens when I lose signal?",
    sections: [
      S("You get told", "A strip appears across the top saying you are offline and that what you are looking at is the last data that arrived. Without it, a dropped connection looks exactly like calm weather."),
      S("It comes back on its own", "When the network returns, whatever is on screen refreshes itself and the strip says so briefly before getting out of the way."),
      S("Pull to refresh", "Anywhere in the app, pull down from the top and the page reloads its data — the radar reloads the radar, the dashboard reloads the dashboard."),
      S("Install it", "Installed to your home screen, the app keeps its shell cached and opens instantly even on a bad connection. My Profile has the button."),
    ],
  },
  {
    title: "Who won the leaderboard last month?",
    sections: [
      S("It is recorded now", "A month or a year seals its champion the day after it ends, from the standings as they stood. The Leaderboard shows past champions underneath the current board."),
      S("Points come from two places", "The Forecast Game and the Daily Trivia are totalled together into one standing — there is no separate board to chase."),
    ],
  },
];

// ─── Module Guide, generated ─────────────────────────────────────────────────
const MODULES: DefaultEntry[] = GUIDE_GROUPS.flatMap((g) =>
  MODULE_GUIDE.filter((m) => m.group === g.id).map((m): DefaultEntry => ({
    title: m.title,
    moduleId: m.id,
    sections: [
      S("What it is", m.what),
      S("What it does", m.does),
      S("Start with", m.use),
      ...(m.tip ? [S("Worth knowing", m.tip)] : []),
    ],
  })),
);

// ─── Additional information ──────────────────────────────────────────────────
const ADDITIONAL: DefaultEntry[] = [
  {
    title: "Other StormSync Media Services & Products",
    sections: [
      S("", "StormSync Media is more than this dashboard. Here is the rest of it."),

      S("Follow the chase",
        "Jay's Views WX on YouTube is where the chases end up: live streams, structure, and the footage from the days that were worth the drive. https://youtube.com/@jaysviewswx\n\n" +
        "StormSync WX on Facebook is the forecast desk in public: outlooks, warnings as they are issued, and the reasoning behind the calls. https://www.facebook.com/share/1EyxMVP1gw/\n\n" +
        "Jay's personal Facebook is the chaser's side of it, from the road. https://www.facebook.com/share/1BdJnGmwED/"),

      S("Storm Chasing Archive Log",
        "A place for chasers to keep a proper record of their season rather than a camera roll and a memory. Log every chase: the target you picked and why, the route you actually drove, the storms you intercepted, the tornado paths you witnessed, timings, mileage, what you saw and what you missed. Over a season it becomes the thing you cannot get any other way — a searchable history of your own forecasting, including the busts, which are the ones you learn from. Free to use, built for chasers, at Archive.SSWX.Space"),

      S("Web & App Design",
        "We build the kind of thing you are looking at. StormSync Media takes on web and application design work: real products with real data behind them, not templates with a logo dropped in. If you have run a site that never quite did what you needed, or you have an idea that needs building properly, we would like to hear about it. Reach us through the Contact page."),

      S("Graphic Design",
        "Logos, brand identity, stream overlays, social graphics, forecast plates, merchandise. The design work across StormSync is all in-house, and we take it on for other people too. Weather brands especially: we already speak the language, so you will not spend the first three meetings explaining what a hook echo is."),

      S("StormSync Academy",
        "Being built now. A virtual academy for storm chasing and spotting: structured classes rather than scattered videos. Reading a sounding and knowing what it is telling you. Choosing a target and understanding why it was right or wrong afterwards. Storm structure, what to look for and where to stand. Chase safety, escape routes, and the decisions that keep people alive. Spotter training toward reporting that a Weather Service office can actually use. It will run as live sessions with recordings, taught by people who chase, and it opens when it is genuinely ready rather than when it would be convenient to launch. Watch the App Updates tab on the Home page."),
    ],
  },
  {
    title: "Where does the data come from?",
    sections: [
      S("The agencies", "National Weather Service (alerts, forecasts, discussions), Storm Prediction Center (outlooks, mesoscale discussions, storm reports), National Hurricane Center (tropical), Weather Prediction Center (winter storm severity, snow and ice probability, winter outlooks), NOHRSC (snow on the ground), Climate Prediction Center (extended pattern), Iowa Environmental Mesonet (local storm reports), GOES (satellite), MRMS (radar mosaics)."),
      S("Model data", "Open-Meteo, which is free and needs no key, for the point forecasts and the parameters behind the severe-weather modules."),
      S("Cameras", "Caltrans, ALERTCalifornia, the Michigan Department of Transportation and DriveBC, all published publicly by those agencies."),
      S("Our own work", "The Threat Index, the SSWXCon score, the chase scoring and the AI briefings are ours. Anywhere a number is computed rather than quoted, the module says so, and anywhere a product does not exist we say that rather than approximate it."),
    ],
  },
  {
    title: "What does it cost to run, and why is some of it free?",
    sections: [S("", "Almost every feed here is public data paid for by taxes that have already been collected. Passing it on with a decent interface should not cost anybody a fortune, so the free tier is a real product rather than a trial: in-app and push alerts, a module of your choice, the daily brief, and every page visible whether or not you have bought it. What you pay for is breadth, the contact and direct-line alert levels, and the tools we build ourselves.")],
  },
];

export const DEFAULT_FAQ: DefaultCategory[] = [
  { name: "General FAQ", entries: GENERAL },
  { name: "Module Guide", entries: MODULES },
  { name: "Additional Info", entries: ADDITIONAL },
];
