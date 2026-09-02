// StormSync VIP — hurricane wind-radii proxy.
//
// WHY THIS EXISTS: the `nhc` function's /windrad route reads
//   https://www.nhc.noaa.gov/gis/json/{ID}_5day_pgn.json     (404)
//   https://www.nhc.noaa.gov/gis/forecast/archive/...json    (404)
//   https://www.nhc.noaa.gov/nhc_{basin}.xml                 (404 for at, ep AND cp)
// All three are gone, so it returned an empty FeatureCollection for every storm
// in every basin — the wind field simply never drew. Verified against Hurricane
// Lala (cp012026): /windrad returned {"features":[]}.
//
// The radii ARE published, in the Forecast/Advisory (TCM) text product, whose
// URL the NHC API hands us per storm. That product exists for Atlantic, Eastern
// Pacific AND Central Pacific, so parsing it fixes all basins at once.
//
// This is a separate function rather than an edit to `nhc` because `nhc` serves
// four working routes and only exists as a transpiled bundle; rebuilding it to
// change one helper risked breaking the tracker entirely.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const json = (b, s = 200, maxAge = 600)=>new Response(JSON.stringify(b), {
    status: s,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAge}`
    }
  });
/** "20.5N" -> 20.5 ; "167.2W" -> -167.2 */ function coord(raw) {
  const m = raw.match(/^([\d.]+)\s*([NSEW])$/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  return /[SW]/i.test(m[2]) ? -v : v;
}
/** Quadrant radii (nautical miles) -> a closed polygon ring. */ function radiiPolygon(lat, lon, q, kt, color) {
  // 1 nm = 1/60 degree of latitude; longitude shrinks with cos(lat).
  const NM = 1 / 60;
  const cosLat = Math.max(0.15, Math.cos(lat * Math.PI / 180));
  const ring = [];
  // Walk clockwise from due north, taking the radius of whichever quadrant the
  // bearing falls in, so the classic lopsided wind field shape is preserved.
  for(let deg = 0; deg <= 360; deg += 5){
    const b = deg % 360;
    const r = b < 90 ? q.ne : b < 180 ? q.se : b < 270 ? q.sw : q.nw;
    if (r <= 0) {
      ring.push([
        lon,
        lat
      ]);
      continue;
    }
    const rad = b * Math.PI / 180;
    ring.push([
      lon + r * NM * Math.sin(rad) / cosLat,
      lat + r * NM * Math.cos(rad)
    ]);
  }
  return {
    type: "Feature",
    properties: {
      wind_kt: kt,
      __color: color,
      label: `${kt} kt`
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        ring
      ]
    }
  };
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: CORS
  });
  const url = new URL(req.url);
  const want = (url.searchParams.get("storm") ?? "").toLowerCase();
  if (!want) return json({
    error: "pass ?storm=cp012026"
  }, 400, 60);
  try {
    const cs = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
      headers: {
        "User-Agent": UA,
        Accept: "application/json"
      }
    });
    if (!cs.ok) return json({
      radii: {
        type: "FeatureCollection",
        features: []
      },
      stormId: want
    }, 200, 120);
    const data = await cs.json();
    const storm = (data.activeStorms ?? []).find((s)=>String(s.id ?? "").toLowerCase() === want);
    if (!storm) return json({
      radii: {
        type: "FeatureCollection",
        features: []
      },
      stormId: want,
      reason: "storm not active"
    }, 200, 300);
    const advUrl = storm.forecastAdvisory?.url;
    if (!advUrl) return json({
      radii: {
        type: "FeatureCollection",
        features: []
      },
      stormId: want,
      reason: "no forecast advisory"
    }, 200, 300);
    const adv = await fetch(advUrl, {
      headers: {
        "User-Agent": UA
      }
    });
    if (!adv.ok) return json({
      radii: {
        type: "FeatureCollection",
        features: []
      },
      stormId: want
    }, 200, 120);
    const text = (await adv.text()).replace(/<[^>]*>/g, "");
    // Centre, e.g. "CENTER LOCATED NEAR 20.5N 167.2W AT 18/1500Z"
    const c = text.match(/CENTER LOCATED NEAR\s+([\d.]+[NS])\s+([\d.]+[EW])/i);
    const lat = c ? coord(c[1]) : null;
    const lon = c ? coord(c[2]) : null;
    if (lat === null || lon === null) {
      return json({
        radii: {
          type: "FeatureCollection",
          features: []
        },
        stormId: want,
        reason: "no centre fix"
      }, 200, 300);
    }
    // The CURRENT radii use a long dot run ("64 KT....... 15NE ..."); the
    // forecast hours further down use a short one ("64 KT... 20NE ..."). Taking
    // the long form keeps this to the initial, observed wind field.
    const features = [];
    const spec = [
      [
        64,
        "#ef4444"
      ],
      [
        50,
        "#f97316"
      ],
      [
        34,
        "#fbbf24"
      ]
    ];
    for (const [kt, color] of spec){
      const m = text.match(new RegExp(`${kt} KT\\.{5,}\\s*(\\d+)NE\\s+(\\d+)SE\\s+(\\d+)SW\\s+(\\d+)NW`, "i"));
      if (!m) continue;
      const q = {
        ne: +m[1],
        se: +m[2],
        sw: +m[3],
        nw: +m[4]
      };
      if (!(q.ne || q.se || q.sw || q.nw)) continue; // reported but all zero
      features.push(radiiPolygon(lat, lon, q, kt, color));
    }
    return json({
      radii: {
        type: "FeatureCollection",
        features
      },
      stormId: want.toUpperCase(),
      center: {
        lat,
        lon
      },
      source: advUrl
    }, 200, 600);
  } catch (e) {
    return json({
      radii: {
        type: "FeatureCollection",
        features: []
      },
      stormId: want,
      error: String(e)
    }, 200, 60);
  }
});
