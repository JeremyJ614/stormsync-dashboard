/**
 * SSWXCon national storm score.
 *
 * Extracted from the SSWXCon page so the dashboard mini-widget shows the SAME
 * number rather than a second implementation that would silently drift - the
 * scoring is the module, so two copies of it is two products.
 */
export type AlertItem = { event?: string; properties?: { event?: string } };

export function computeComponents(alerts: AlertItem[], cape: number, srh: number, shear: number, li: number) {
  const events = alerts.map((a: AlertItem) => (a.event || a.properties?.event || "").toLowerCase());

  const tornadoWarnings = events.filter(e => e.includes("tornado warning")).length;
  const svrThunderstorm = events.filter(e => e.includes("severe thunderstorm warning")).length;
  const floodFlash = events.filter(e => e.includes("flash flood warning")).length;
  const floodRiver = events.filter(e => e.includes("flood warning") && !e.includes("flash")).length;
  // NWS PRODUCTS, not storms. Every count in this function is a number of
  // active alerts, and this one is no different: a single hurricane puts a
  // Hurricane Warning on every coastal zone in its path, so two storms can
  // easily be twenty products. It is labelled accordingly below — calling it
  // "tropical systems" made it read as a storm count and set it against the
  // Hurricane Tracker, which counts actual cyclones from the NHC and will
  // almost always say a smaller number. Both were right; only the label lied.
  const tropical = events.filter(e => e.includes("tropical") || e.includes("hurricane")).length;
  const winterBlizzard = events.filter(e => e.includes("blizzard")).length;
  const winterStorm = events.filter(e => e.includes("winter storm") || e.includes("ice storm")).length;
  const fireredflag = events.filter(e => e.includes("red flag")).length;

  const r1 = (v: number) => Math.round(v * 10) / 10;
  // National-scale weights. These are counts across the WHOLE U.S., so every
  // bucket is capped — routine background warnings (river flooding, red-flag,
  // winter advisories) can't dominate, and the rare/dangerous convective and
  // tropical warnings drive the score. A genuine outbreak is the only way to
  // reach the top bands.
  const tornadoScore  = r1(Math.min(120, tornadoWarnings * 4));          // dominant signal
  const svrScore      = r1(Math.min(70,  svrThunderstorm * 1));
  const floodScore    = r1(Math.min(40,  floodFlash * 1 + floodRiver * 0.25)); // flash >> river
  const tropicalScore = r1(Math.min(90,  tropical * 6));
  const winterScore   = r1(Math.min(40,  winterBlizzard * 4 + winterStorm * 0.5));
  const fireScore     = r1(Math.min(15,  fireredflag * 0.5));

  const atmoScore = r1(Math.min(12,
    (cape > 0 ? Math.min(3, cape / 1000) : 0) +
    (srh > 0 ? Math.min(3, srh / 150) : 0) +
    (shear > 0 ? Math.min(3, shear / 25) : 0) +
    (li < 0 ? Math.min(3, Math.abs(li) / 3) : 0)
  ));

  const total = r1(tornadoScore + svrScore + floodScore + tropicalScore + winterScore + fireScore + atmoScore);

  return {
    tornadoWarnings, svrThunderstorm, floodFlash, floodRiver, tropical,
    winterBlizzard, winterStorm, fireredflag,
    // `color` lives here rather than in the page so the stacked bar, its
    // legend and anything else that ever draws a component cannot disagree
    // about which hue means tornado.
    components: [
      { label: "TORNADO WARNINGS", short: "Tornado", cap: 120, score: tornadoScore, multiplier: "×4", color: "#ef4444", desc: `${tornadoWarnings} active nationwide` },
      { label: "SEVERE THUNDERSTORM", short: "Severe", cap: 70, score: svrScore, multiplier: "×1", color: "#f97316", desc: `${svrThunderstorm} active nationwide` },
      { label: "FLOOD THREAT", short: "Flood", cap: 40, score: floodScore, multiplier: "flash×1 · river×0.25", color: "#38bdf8", desc: `${floodFlash} flash · ${floodRiver} river` },
      { label: "TROPICAL WARNINGS", short: "Tropical", cap: 90, score: tropicalScore, multiplier: "×6", color: "#a855f7", desc: `${tropical} active nationwide` },
      { label: "WINTER WEATHER", short: "Winter", cap: 40, score: winterScore, multiplier: "blizzard×4 · storm×0.5", color: "#67e8f9", desc: `${winterBlizzard} blizzard · ${winterStorm} storm` },
      { label: "FIRE WEATHER", short: "Fire", cap: 15, score: fireScore, multiplier: "×0.5", color: "#fbbf24", desc: `${fireredflag} red flag warnings` },
      { label: "LOCAL INSTABILITY", short: "Local", cap: 12, score: atmoScore, multiplier: "max 12", color: "#4ade80", desc: "Your area: CAPE / SRH / Shear / LI" },
    ],
    total,
  };
}

export function scoreLabel(score: number): { text: string; color: string; bgColor: string } {
  if (score >= 250) return { text: "HISTORIC", color: "#ff0000", bgColor: "#4a0000" };
  if (score >= 150) return { text: "EXTREME", color: "#ff3333", bgColor: "#3d0000" };
  if (score >= 120) return { text: "MAJOR EVENT", color: "#e03030", bgColor: "#3a0a0a" };
  if (score >= 90)  return { text: "SEVERE OUTBREAK", color: "#cc2222", bgColor: "#350505" };
  if (score >= 70)  return { text: "SIGNIFICANT", color: "#ef4444", bgColor: "#2d0000" };
  if (score >= 50)  return { text: "ELEVATED", color: "#f97316", bgColor: "#2a1000" };
  if (score >= 30)  return { text: "NOTABLE", color: "#fbbf24", bgColor: "#1a1000" };
  return { text: "QUIET / LOW", color: "#4ade80", bgColor: "#001a06" };
}


/**
 * One sentence saying why the score is what it is.
 *
 * Built from the components that actually fired, largest first, with their
 * real counts — never a stock phrase per band. On a quiet day the honest
 * sentence is that nothing is firing, and that is what it says.
 */
export function describeDrivers(
  components: { short: string; score: number; desc: string }[],
  total: number,
): string {
  const live = components.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  if (live.length === 0) {
    return "No warning-level weather is active anywhere in the country right now.";
  }
  const share = (c: { score: number }) => Math.round((c.score / Math.max(total, 0.1)) * 100);
  const first = live[0];
  const parts = [`${first.short.toLowerCase()} carries ${share(first)}% of it (${first.desc})`];
  if (live[1] && live[1].score > 0) {
    parts.push(`${live[1].short.toLowerCase()} adds another ${share(live[1])}%`);
  }
  const rest = live.length - Math.min(2, live.length);
  const tail = rest > 0 ? `, with ${rest} smaller ${rest === 1 ? "bucket" : "buckets"} behind them` : "";
  return `${parts.join(", and ")}${tail}.`;
}
