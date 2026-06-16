import { useState } from "react";
import { HelpCircle, ChevronDown, Mail, Phone } from "lucide-react";
import { Link } from "wouter";
import { HIDDEN_MODULES } from "../hooks/useAuth";

interface FAQItem { q: string; a: string }
interface ModuleDoc { id: string; label: string; tier: 1 | 2 | 3 | 4; desc: string; what: string; how: string; tips?: string }

const GENERAL: FAQItem[] = [
  { q: "What is StormSync Media?", a: "StormSync Media is a real-time severe-weather intelligence dashboard built for spotters, chasers, broadcasters, and curious weather enthusiasts. We combine official feeds (NWS, SPC, IEM, GOES, MRMS) with original tools, AI assistance, and a community layer (SSWX News, badges, Forecast Game)." },
  { q: "How are tiers structured?", a: "Tier 1 (Free) — core forecast & education modules. Tier 2 — adds SPC outlook, warnings, severe weather history, SSWXCon, Forecast Game, Loyalty, Lightning Globe and Aurora. Tier 3 — adds Mesoscale Discussions, Thunderstorm Outlook, Ingredients, SWTI, Storm Timing, Hazards, Rotation Tracker, Storm Chasing, City Comparator and Climatology. Tier 4 Elite — unlocks every module plus the Emergency Storm Contact line." },
  { q: "What is the SSWX Loyalty Program?", a: "Active members earn 100 points each calendar month. Refer a friend who signs up and you earn 250 points. Points unlock SSWX merch, callout shoutouts on SSWX News, and Tier upgrades." },
  { q: "How do I become a verified SSWX Member?", a: "Sign up with your real name and the email you'll use for community contact. Admins assign the SSWX Member badge after a quick verification. Department Heads and Executive Board badges are reserved for staff." },
  { q: "What does the periwinkle glow on a SSWX News post mean?", a: "Periwinkle glow + 'NEW' badge means the post was published in the last 12 hours. Older posts return to the standard dark card look." },
  { q: "Where does the weather news on the home page come from?", a: "It auto-pulls from Google News with a severe-weather/tornado/hurricane filter, refreshed every 10 minutes. Click any headline to read the full source article." },
  { q: "Who do I contact for help?", a: "Customer Service: customerservice@stormsync.media. Emergency (Tier 4 only): use the Emergency Storm Contact module, or text 567-204-4402 for live event support." },
  { q: "Is my data shared?", a: "No. Account data is currently stored locally on your device. Server-side multi-device sync is on the roadmap. Push notifications require an explicit opt-in." },
];

const MODULES: ModuleDoc[] = [
  { id: "/", label: "Home", tier: 1, desc: "Landing page with welcome, Weather News auto-pulled from Google News, SSWX News (community posts), and quick navigation tiles.", what: "Top-of-funnel hub showing live news, member updates and shortcut tiles to core modules.", how: "Switch between 'Weather News' (auto-pulled headlines) and 'SSWX News' (in-house posts). Click a card to read." },
  { id: "/dashboard", label: "Dashboard", tier: 1, desc: "Your live current-conditions overview for any saved location with hourly + 7-day forecast, sky, wind and pressure.", what: "Tier-1 single-screen weather summary using Open-Meteo data.", how: "Search or set a default location in the location bar. The dashboard auto-refreshes every few minutes." },
  { id: "/forecast", label: "Detailed Forecast", tier: 1, desc: "Hourly forecast grid with temperature, precipitation probability, wind, humidity and weather code.", what: "Expanded numeric forecast for the next 168 hours.", how: "Scroll horizontally to see future hours; tap a row for more detail." },
  { id: "/aqi", label: "Air Quality", tier: 1, desc: "Real-time AQI and pollutant breakdown (PM2.5, PM10, O3, NO2) for your location.", what: "Pulls from Open-Meteo air-quality API and color-codes by EPA category.", how: "Hovers tell you what each pollutant means and current health guidance." },
  { id: "/moon", label: "Moon & Sun", tier: 1, desc: "Moon phase, illumination %, moonrise/set, sunrise/set and twilight times.", what: "Astronomical timing important for night chasing, photography, and sky watching.", how: "Adjust the date picker to plan ahead." },
  { id: "/skygazing", label: "Sky Gazing", tier: 1, desc: "Cloud cover, transparency, and stargazing forecast.", what: "Visibility outlook tailored to amateur astronomers.", how: "Green windows = best viewing; orange/red = clouds/moisture interfering." },
  { id: "/glossary", label: "Weather Glossary", tier: 1, desc: "Definitions of meteorological terms (CAPE, helicity, supercell, etc.).", what: "Quick-reference dictionary for weather jargon used elsewhere in the app.", how: "Search box filters in real time; tap any entry for full definition + example." },
  { id: "/learn", label: "Learn Center", tier: 1, desc: "Bite-sized lessons covering thunderstorm modes, tornado formation, radar reading and chase safety.", what: "Educational content for new weather enthusiasts.", how: "Lessons are short modules with images and check-your-understanding questions." },
  { id: "/spc", label: "SPC Outlook", tier: 2, desc: "Storm Prediction Center categorical and probabilistic outlooks for Days 1–3.", what: "Live national severe-weather risk map with TSTM/MRGL/SLGT/ENH/MDT/HIGH categories. Day 1 also shows separate tornado/hail/wind probability layers.", how: "Pick day and hazard tab. Quiet days will show small or no polygons — that's normal." },
  { id: "/warnings", label: "Warning Center", tier: 2, desc: "Live NWS warnings, watches and advisories for your area or nationwide.", what: "Tornado warnings, severe T-storm warnings, flash flood, etc. with polygon previews and expiration timers.", how: "Filter by event type or expand a warning for full text and impacted counties.", tips: "Tornado warnings render with red glow; use the auto-refresh toggle for active events." },
  { id: "/sswxcon", label: "SSWXCon", tier: 2, desc: "StormSync's proprietary 1–5 convective threat level (like DEFCON for storms).", what: "Single-number national severity reading from current data + AI synthesis.", how: "5 = all clear; 1 = widespread significant severe imminent. Updated continuously." },
  { id: "/history", label: "Severe Weather History", tier: 2, desc: "AI-generated summaries of severe weather over the last week, last month, this month and this year.", what: "Quick narrative recaps + estimated stats (tornadoes, hail/wind reports, deaths) + notable event list.", how: "Tap a period tab. First view triggers a fresh AI summary (cached for 6 hours)." },
  { id: "/loyalty", label: "Loyalty Program", tier: 2, desc: "Track your SSWX points, monthly activity bonus, and referral count.", what: "Earn 100 pts/month active + 250 pts per referral.", how: "Share your referral link. Admin credits referrals manually as new signups land." },
  { id: "/game", label: "Forecast Game", tier: 2, desc: "Daily severe-weather prediction game on a real US states map.", what: "Drop a pin where you think the worst severe weather will occur today. AI scores against next-day storm reports.", how: "Click any state to drop a pin or search a city. Lock in before midnight UTC.", tips: "Bullseye (≤25 mi) = 1000 pts + 500 tornado bonus. Monthly winner gets a 5000-pt bonus." },
  { id: "/lightning-globe", label: "Lightning Globe", tier: 2, desc: "Live global lightning strike visualization.", what: "Aggregated strike data plotted on a rotating globe.", how: "Use the speed slider to control time-decay of strikes." },
  { id: "/aurora", label: "Aurora Forecast", tier: 2, desc: "Live geomagnetic Kp index + aurora visibility forecast.", what: "Real-time space-weather feed for aurora hunters.", how: "Higher Kp = aurora pushes further south. Map shows tonight's viewing line." },
  { id: "/thunder", label: "Thunderstorm Outlook", tier: 3, desc: "SPC convective thunderstorm probability map.", what: "Where general thunderstorms are most likely in the next 24h.", how: "Auto-refreshes every 30 minutes. Pair with the SPC categorical for severe potential." },
  { id: "/meso", label: "Mesoscale Discussions", tier: 3, desc: "Live SPC Mesoscale Discussion (MD) products.", what: "Real-time short-fuse forecaster reasoning during active severe events.", how: "Click an MD card to read the full forecaster narrative + concern area polygon." },
  { id: "/ingredients", label: "Severe Ingredients", tier: 3, desc: "CAPE, shear, helicity, LCL and lifted index for your point.", what: "The four-ingredient severe-storms recipe explained with current values.", how: "Each card explains what the value means and whether it favors severe storms." },
  { id: "/swti", label: "SWTI", tier: 3, desc: "StormSync Weather Threat Index — proprietary scalar combining shear, instability and moisture.", what: "Single-number severe-potential score for any location.", how: "0–100 scale. Above 70 = significant severe potential when triggers align." },
  { id: "/timing", label: "Storm Timing", tier: 3, desc: "Hour-by-hour storm initiation, peak and dissipation timing.", what: "When storms are most likely to fire, peak in intensity, and clear out.", how: "Read like a Gantt chart — each bar is a storm-mode window." },
  { id: "/hazards", label: "Hazards Breakdown", tier: 3, desc: "Per-hazard probability and confidence: tornado, large hail, damaging wind, flash flood.", what: "Hazard-specific outlook for the next 24–48 hours at your location.", how: "Confidence bars indicate forecaster certainty; cross-check with SPC outlook." },
  { id: "/summary", label: "Daily Summary", tier: 3, desc: "AI-written plain-English forecast briefing.", what: "2-paragraph narrative covering today and tomorrow for your location.", how: "Refresh button regenerates from latest model data." },
  { id: "/rotation", label: "Rotation Tracker", tier: 3, desc: "Live mesocyclone / TVS / hail tracks from MRMS/IEM.", what: "Where storms are currently rotating or producing large hail.", how: "Color-coded by intensity. Click a track to see its history." },
  { id: "/climatology", label: "Climatology", tier: 3, desc: "Historical baselines for severe events by month and location.", what: "How today's setup compares to the climatological norm.", how: "Switch between tornado, hail, wind and significant-severe layers." },
  { id: "/mosquito", label: "Mosquito Forecast", tier: 3, desc: "Mosquito activity forecast based on temperature, humidity and recent rainfall.", what: "Outdoor-comfort companion forecast.", how: "Higher index = bring repellent." },
  { id: "/chasing", label: "Storm Chasing", tier: 3, desc: "Chase planner with target picks, road overlays and AI chase recommendation.", what: "Helps select a chase target based on instability, shear, moisture and storm motion vectors.", how: "Enter starting location; the AI suggests target zones with reasoning." },
  { id: "/comparator", label: "City Comparator", tier: 3, desc: "Side-by-side comparison of forecasts for up to 4 cities.", what: "Quickly compare temperature, precipitation and severe risk across locations.", how: "Add cities, drag to reorder, expand any column for full forecast." },
  { id: "/wpi", label: "Weather Performance Index", tier: 3, desc: "Forecast model verification scoring.", what: "How well GFS/NAM/HRRR are performing for your area lately.", how: "Use to weight which model to trust on a given day." },
  { id: "/discussion", label: "Forecast Discussion", tier: 4, desc: "Raw NWS Area Forecast Discussion text with AI-powered plain-English summary.", what: "Forecaster narrative explaining the reasoning behind today's forecast.", how: "Auto-loads your local WFO. 'Explain with AI' button summarizes it in plain English." },
  { id: "/duel", label: "AI Duel", tier: 4, desc: "Two AI personas debate the forecast: Atlas (conservative) vs Vortex (aggressive).", what: "Get a balanced view by seeing how two model temperaments interpret the same data.", how: "Ask a forecast question; both models answer with confidence scores and reasoning." },
  { id: "/contact", label: "Emergency Storm Contact", tier: 4, desc: "Direct line to StormSync staff during life-threatening events.", what: "Tier 4 elite-only emergency consult line (4-digit PIN required).", how: "PIN is provided when you join Tier 4. Misuse may result in revocation." },
];

export default function FAQ() {
  const [tab, setTab] = useState<"general" | "modules">("general");
  const [open, setOpen] = useState<string | null>(null);

  // U-22: the Module Guide explains what each module/add-on does — it is NOT a
  // tier sales sheet, so no tier filter or T1–T4 badges here.
  const visibleModules = MODULES.filter(m => !HIDDEN_MODULES.has(m.id));

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Help & FAQ</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setTab("general")} className={`py-2.5 rounded-lg text-sm font-semibold ${tab === "general" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>General FAQ</button>
        <button onClick={() => setTab("modules")} className={`py-2.5 rounded-lg text-sm font-semibold ${tab === "modules" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>Module Guide ({MODULES.length})</button>
      </div>

      {tab === "general" && (
        <div className="space-y-2">
          {GENERAL.map((f, i) => {
            const key = `g-${i}`;
            const isOpen = open === key;
            return (
              <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                  <span className="text-sm font-semibold">{f.q}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{f.a}</div>}
              </div>
            );
          })}
        </div>
      )}

      {tab === "modules" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Every module and add-on explained. What you can access depends on your plan — ask an admin to enable any you'd like.</p>
          <div className="space-y-2">
            {visibleModules.map(m => {
              const key = `m-${m.id}`;
              const isOpen = open === key;
              return (
                <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button onClick={() => setOpen(isOpen ? null : key)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-sm font-semibold">{m.label}</span>
                      <span className="text-xs text-muted-foreground hidden md:inline truncate">{m.desc.slice(0, 70)}…</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-2 text-sm border-t border-border pt-3">
                      <p className="text-muted-foreground leading-relaxed">{m.desc}</p>
                      <div><span className="text-[10px] font-bold uppercase tracking-widest text-primary">What it does</span><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.what}</p></div>
                      <div><span className="text-[10px] font-bold uppercase tracking-widest text-primary">How to use</span><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.how}</p></div>
                      {m.tips && <div><span className="text-[10px] font-bold uppercase tracking-widest text-yellow-300">Pro tip</span><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.tips}</p></div>}
                      <Link href={m.id} className="inline-block mt-1 text-xs text-primary hover:underline">Open {m.label} →</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Still need help?</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2"><Mail className="w-3 h-3 text-primary" /> <a href="mailto:customerservice@stormsync.media" className="hover:text-primary">customerservice@stormsync.media</a> — general support</div>
          <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-red-400" /> 567-204-4402 — emergency (Tier 4 only)</div>
        </div>
      </div>
    </div>
  );
}
