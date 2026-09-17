import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "../lib/maplibreWorker";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CloudRain, Droplets, Info, Loader2, MapPin } from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import { STORMSYNC_DARK, applyRoyalBasemap } from "../lib/basemap";
import {
  fetchFloodOutlook, ERO_LEVELS, eroColor, eroLevel, eroTime, rankAt,
  type EroDay,
} from "../lib/floodOutlook";
import type { Location } from "../hooks/useLocation";
import { ROYAL, HEADING, prefersReducedMotion } from "../lib/royal";

/**
 * The flooding outlook.
 *
 * WPC's Excessive Rainfall Outlook, which is the flood counterpart to the SPC
 * severe outlook and asks a question a rainfall total cannot: not how much rain
 * will fall, but whether it will be more than the ground where it lands can
 * take. Five days, one more than SPC covers.
 *
 * The reason to build it rather than link to WPC's image is that an image
 * cannot tell you where *you* are in it. Every day is tested against your saved
 * location, so the first thing on the page is your own answer, and the five-day
 * strip shows the whole week at a glance before you have touched anything.
 */
interface Props { location: Location }

export default function FloodOutlook({ location }: Props) {
  const q = useQuery({
    queryKey: ["flood-outlook"],
    queryFn: fetchFloodOutlook,
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  const days = useMemo(() => q.data?.days ?? [], [q.data]);
  const [dayNo, setDayNo] = useState(1);
  const day = days.find((d) => d.day === dayNo);

  // Where the member stands, every day of the outlook.
  const mine = useMemo(
    () => days.map((d) => ({ day: d.day, rank: d.available ? rankAt(d, location.lon, location.lat) : 0 })),
    [days, location.lon, location.lat]);
  const myWorst = mine.reduce((m, x) => Math.max(m, x.rank), 0);
  const myToday = mine.find((x) => x.day === 1)?.rank ?? 0;

  return (
    <ModuleShell
      eyebrow="NOAA · Weather Prediction Center"
      title="Flooding Outlook"
      subtitle="Where rain is forecast to outrun the ground it lands on. Five days of WPC's Excessive Rainfall Outlook, tested against your location."
    >
      {q.isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : q.isError ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
          <p className="text-sm font-semibold">The flooding outlook could not be loaded</p>
          <p className="text-xs text-muted-foreground mt-1">{(q.error as Error)?.message}</p>
        </div>
      ) : (
        <>
          {/* Your answer, first. */}
          <YourRisk place={location.name} today={myToday} worst={myWorst} mine={mine} />

          {/* The week, at a glance. */}
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {days.map((d) => {
              const on = d.day === dayNo;
              const top = d.maxRank ?? 0;
              const me = mine.find((m) => m.day === d.day)?.rank ?? 0;
              return (
                <button
                  key={d.day}
                  onClick={() => setDayNo(d.day)}
                  className="shrink-0 rounded-xl px-3 py-2 text-left min-w-[92px]"
                  style={{
                    background: on ? "rgba(217,183,117,0.12)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${on ? ROYAL.goldSoft : ROYAL.hairline}`,
                  }}
                >
                  <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: on ? ROYAL.gold : ROYAL.dim }}>
                    {d.label}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: top > 0 ? eroColor(top) : "rgba(163,163,204,0.25)" }} />
                    <span className="text-[11.5px] truncate" style={{ color: ROYAL.text }}>
                      {top > 0 ? eroLevel(top)!.label : "None"}
                    </span>
                  </div>
                  {me > 0 && (
                    <div className="text-[9.5px] mt-0.5" style={{ color: eroColor(me) }}>you: {eroLevel(me)!.label}</div>
                  )}
                </button>
              );
            })}
          </div>

          <EroMap day={day} lat={location.lat} lon={location.lon} place={location.name} />

          {/* Legend, with what each category actually means. */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 text-[9.5px] uppercase tracking-[0.2em] flex items-center gap-1.5"
                 style={{ color: ROYAL.dim, borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <Info className="w-3 h-3" /> What the categories mean
            </div>
            {ERO_LEVELS.map((l) => (
              <div key={l.key} className="px-4 py-2.5 flex items-start gap-3"
                   style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
                <span className="w-3 h-3 rounded-sm shrink-0 mt-0.5" style={{ background: l.color }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: ROYAL.text }}>
                    {l.label} <span style={{ color: ROYAL.dim }}>· {l.odds}</span>
                  </div>
                  <div className="text-[11px] leading-relaxed" style={{ color: ROYAL.dim }}>{l.meaning}</div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The Excessive Rainfall Outlook is the probability of rain exceeding flash-flood guidance within
            25 miles of a point — which is not the same as how much rain will fall. Three inches on dry sand
            is nothing; the same three inches on saturated ground or a burn scar is a flash flood.
            Issued by the Weather Prediction Center{day?.issued ? ` · this one at ${eroTime(day.issued)}` : ""}.
            {q.data?.stale && <span className="text-amber-300/90"> Showing the last outlook we were able to fetch.</span>}
          </p>
        </>
      )}
    </ModuleShell>
  );
}

// ── your risk ────────────────────────────────────────────────────────────────

function YourRisk({
  place, today, worst, mine,
}: { place: string; today: number; worst: number; mine: { day: number; rank: number }[] }) {
  const lvl = eroLevel(worst);
  const still = prefersReducedMotion();
  const firstDay = mine.find((m) => m.rank === worst && worst > 0)?.day;

  return (
    <div
      className="rounded-2xl px-4 py-4 relative overflow-hidden"
      style={{
        background: worst > 0
          ? `linear-gradient(135deg, ${eroColor(worst)}22, rgba(10,10,22,0.9) 65%)`
          : "hsl(var(--card))",
        border: `1px solid ${worst > 0 ? `${eroColor(worst)}66` : "hsl(var(--border))"}`,
      }}
    >
      {/* A slow drift of rain, only when there is something to warn about. */}
      {worst > 0 && !still && (
        <span aria-hidden className="sswx-ero-rain absolute inset-0 pointer-events-none"
              style={{ backgroundImage: `repeating-linear-gradient(74deg, ${eroColor(worst)}22 0 1px, transparent 1px 9px)` }} />
      )}
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]" style={{ color: ROYAL.dim }}>
          <MapPin className="w-3 h-3" /> {place}
        </div>
        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
          <span className="text-[26px] font-bold leading-none"
                style={{ color: worst > 0 ? eroColor(worst) : ROYAL.text, fontFamily: HEADING }}>
            {worst > 0 ? lvl!.label : "No risk"}
          </span>
          {worst > 0 && (
            <span className="text-[12px]" style={{ color: ROYAL.dim }}>
              {lvl!.odds}{firstDay ? ` · day ${firstDay}` : ""}
            </span>
          )}
        </div>
        <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: ROYAL.dim }}>
          {worst === 0
            ? "You are outside every excessive-rainfall area for the next five days."
            : today > 0
              ? lvl!.meaning
              : `Nothing today, but you are inside a ${lvl!.label.toLowerCase()} area later this week.`}
        </p>
      </div>
    </div>
  );
}

// ── the map ──────────────────────────────────────────────────────────────────

function EroMap({ day, lat, lon, place }: { day: EroDay | undefined; lat: number; lon: number; place: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const beneath = useRef<string | undefined>(undefined);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({
      container: box.current, style: STORMSYNC_DARK,
      center: [-97, 38.5], zoom: 3.3, attributionControl: false, dragRotate: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => { beneath.current = applyRoyalBasemap(m); setReady(true); });
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      // Painted weakest first so a Moderate area is never buried under the
      // Marginal one that always surrounds it.
      features: [...(day?.features ?? [])]
        .sort((a, b) => a.properties.rank - b.properties.rank)
        .map((f, i) => ({
          type: "Feature", id: i, geometry: f.geometry,
          properties: { ...f.properties, colour: eroColor(f.properties.rank) },
        })) as GeoJSON.Feature[],
    };
    const src = m.getSource("ero") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(fc); else m.addSource("ero", { type: "geojson", data: fc });

    if (!m.getLayer("ero-fill")) {
      m.addLayer({
        id: "ero-fill", type: "fill", source: "ero",
        paint: {
          "fill-color": ["get", "colour"],
          "fill-opacity": ["interpolate", ["linear"], ["get", "rank"], 1, 0.2, 4, 0.42],
        },
      }, beneath.current);
      m.addLayer({
        id: "ero-line", type: "line", source: "ero",
        layout: { "line-join": "round" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": ["interpolate", ["linear"], ["get", "rank"], 1, 1.1, 4, 2.4],
          "line-opacity": 0.95,
        },
      }, beneath.current);
      m.addLayer({
        id: "ero-glow", type: "line", source: "ero",
        filter: [">=", ["get", "rank"], 3],
        paint: { "line-color": ["get", "colour"], "line-blur": 7, "line-width": 12, "line-opacity": 0.4 },
      }, beneath.current);
    }
  }, [ready, day]);

  // Your location, always on the map.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    marker.current?.remove();
    const el = document.createElement("div");
    el.style.cssText =
      `width:13px;height:13px;border-radius:50%;background:${ROYAL.gold};` +
      `border:2px solid rgba(6,6,14,.9);box-shadow:0 0 0 3px ${ROYAL.goldFaint}`;
    marker.current = new maplibregl.Marker({ element: el })
      .setLngLat([lon, lat])
      .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false }).setText(place))
      .addTo(m);
  }, [ready, lat, lon, place]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border" style={{ background: "#0b0e17" }}>
      <div ref={box} className="w-full" style={{ height: "clamp(300px, 56vh, 580px)" }} />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: ROYAL.dim }} />
        </div>
      )}
      {day && day.available && day.features.length === 0 && (
        <div className="absolute inset-x-0 bottom-0 px-3 py-2 text-[11.5px] flex items-center gap-1.5"
             style={{ background: "rgba(8,8,18,0.86)", color: ROYAL.dim }}>
          <Droplets className="w-3.5 h-3.5" /> No excessive-rainfall area anywhere in the country on {day.label.toLowerCase()}.
        </div>
      )}
      {day && !day.available && (
        <div className="absolute inset-x-0 bottom-0 px-3 py-2 text-[11.5px] flex items-center gap-1.5"
             style={{ background: "rgba(8,8,18,0.86)", color: "#e2a06a" }}>
          <CloudRain className="w-3.5 h-3.5" /> {day.reason ?? "This day has not been issued yet."}
        </div>
      )}
    </div>
  );
}
