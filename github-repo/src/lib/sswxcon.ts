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
    components: [
      { label: "TORNADO WARNINGS", short: "Tornado", cap: 120, score: tornadoScore, multiplier: "×4", desc: `${tornadoWarnings} active nationwide` },
      { label: "SEVERE THUNDERSTORM", short: "Severe", cap: 70, score: svrScore, multiplier: "×1", desc: `${svrThunderstorm} active nationwide` },
      { label: "FLOOD THREAT", short: "Flood", cap: 40, score: floodScore, multiplier: "flash×1", desc: `${floodFlash} flash · ${floodRiver} river` },
      { label: "TROPICAL SYSTEMS", short: "Tropical", cap: 90, score: tropicalScore, multiplier: "×6", desc: `${tropical} tropical/hurricane` },
      { label: "WINTER WEATHER", short: "Winter", cap: 40, score: winterScore, multiplier: "blz×4", desc: `${winterBlizzard} blizzard · ${winterStorm} storm` },
      { label: "FIRE WEATHER", short: "Fire", cap: 15, score: fireScore, multiplier: "×0.5", desc: `${fireredflag} red flag warnings` },
      { label: "LOCAL INSTABILITY", short: "Local", cap: 12, score: atmoScore, multiplier: "max 12", desc: "Your area: CAPE / SRH / Shear / LI" },
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

