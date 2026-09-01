import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, ChevronDown, Gauge, Loader2, MapPin, Route as RouteIcon, Tornado, Wind,
} from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import { STORMSYNC_DARK, applyRoyalBasemap } from "../lib/basemap";
import { renderMarkdown } from "../lib/markdown";
import {
  listChases, chaseBounds, chaseSeasonTotals, efColor,
  type Chase,
} from "../lib/chases";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/**
 * StormSync Chases.
 *
 * Every chase driven, drawn on one map: the road actually taken and the path
 * the tornado actually took, side by side. That pairing is the whole point —
 * a track on its own is a line on a map, but a track next to the road someone
 * drove to be there is a story.
 *
 * Routes are stored road-snapped, so this page never calls a routing service.
 * It draws what is in the database and nothing else.
 */
export default function Chases() {
  const q = useQuery({ queryKey: ["chases"], queryFn: listChases, staleTime: 5 * 60_000 });
  const all = useMemo(() => q.data ?? [], [q.data]);

  const years = useMemo(() => {
    const s = new Set(all.map((c) => c.chaseDate.slice(0, 4)));
    return [...s].sort().reverse();
  }, [all]);
  const [year, setYear] = useState<string | "all">("all");
  const chases = useMemo(
    () => (year === "all" ? all : all.filter((c) => c.chaseDate.startsWith(year))),
    [all, year],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const totals = useMemo(() => chaseSeasonTotals(chases), [chases]);

  return (
    <ModuleShell
      eyebrow="StormSync"
      title="Chases"
      subtitle="Every chase we have driven — the road taken and the track the storm took, on the same map."
    >
      {q.isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : all.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <RouteIcon className="w-10 h-10 mx-auto mb-3" style={{ color: ROYAL.goldSoft }} />
          <p className="text-sm font-semibold">No chases logged yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            The first one will appear here the moment it is published.
          </p>
        </div>
      ) : (
        <>
          {/* Season line */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat icon={RouteIcon} label="Chases" value={String(totals.chases)} />
            <Stat icon={Gauge} label="Miles driven" value={totals.miles.toLocaleString()} />
            <Stat icon={Tornado} label="Tornadoes" value={String(totals.tornadoes)} />
            <Stat
              icon={Wind}
              label="Strongest"
              value={totals.strongest == null ? "—" : `EF${totals.strongest}`}
              tint={totals.strongest == null ? undefined : efColor(totals.strongest)}
            />
          </div>

          {years.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <YearChip on={year === "all"} onClick={() => { setYear("all"); setSelected(null); }}>All years</YearChip>
              {years.map((y) => (
                <YearChip key={y} on={year === y} onClick={() => { setYear(y); setSelected(null); }}>{y}</YearChip>
              ))}
            </div>
          )}

          <ChaseMap chases={chases} selected={selected} onSelect={setSelected} />

          <EfLegend chases={chases} />

          <div className="space-y-2">
            {chases.map((c) => (
              <ChaseCard
                key={c.id}
                chase={c}
                open={selected === c.id}
                onToggle={() => setSelected((s) => (s === c.id ? null : c.id))}
              />
            ))}
          </div>
        </>
      )}
    </ModuleShell>
  );
}

// ── the map ──────────────────────────────────────────────────────────────────

function ChaseMap({
  chases, selected, onSelect,
}: {
  chases: Chase[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const beneath = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const still = prefersReducedMotion();

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: STORMSYNC_DARK,
      center: [-98, 38],
      zoom: 3.4,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      beneath.current = applyRoyalBasemap(m);
      setReady(true);
    });
    return () => { m.remove(); map.current = null; };
  }, []);

  // Everything drawable, as two feature collections. Routes and tracks are kept
  // apart so a track always paints over the road that led to it.
  const data = useMemo(() => {
    const routes: GeoJSON.Feature[] = [];
    const tracks: GeoJSON.Feature[] = [];
    const ends: GeoJSON.Feature[] = [];
    for (const c of chases) {
      // Feature ids are explicit: setFeatureState addresses features by id, and
      // a GeoJSON source without them silently does nothing.
      if (c.route.length > 1) {
        routes.push({
          type: "Feature",
          id: routes.length,
          geometry: { type: "LineString", coordinates: c.route },
          properties: { id: c.id, title: c.title, date: c.chaseDate, miles: c.routeMiles ?? 0 },
        });
        const first = c.route[0], last = c.route[c.route.length - 1];
        ends.push({ type: "Feature", id: ends.length, geometry: { type: "Point", coordinates: first }, properties: { id: c.id, kind: "start" } });
        ends.push({ type: "Feature", id: ends.length, geometry: { type: "Point", coordinates: last }, properties: { id: c.id, kind: "end" } });
      }
      for (const t of c.tornadoPaths) {
        if (t.coords.length < 2) continue;
        tracks.push({
          type: "Feature",
          id: tracks.length,
          geometry: { type: "LineString", coordinates: t.coords },
          properties: {
            id: c.id, ef: t.ef ?? -1, colour: efColor(t.ef),
            label: t.label ?? (t.ef == null ? "Tornado" : `EF${t.ef}`),
          },
        });
      }
    }
    return { routes, tracks, ends };
  }, [chases]);

  // Draw / redraw.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const put = (id: string, features: GeoJSON.Feature[]) => {
      const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
      else m.addSource(id, { type: "geojson", data: fc });
    };
    put("chase-routes", data.routes);
    put("chase-tracks", data.tracks);
    put("chase-ends", data.ends);

    if (!m.getLayer("chase-route-glow")) {
      m.addLayer({
        id: "chase-route-glow", type: "line", source: "chase-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ROYAL.gold,
          "line-blur": 6,
          "line-opacity": ["case", ["boolean", ["feature-state", "on"], false], 0.5, 0.12],
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 5, 10, 14],
        },
      }, beneath.current);
      m.addLayer({
        id: "chase-route", type: "line", source: "chase-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "on"], false], "#ffd98a", ROYAL.gold],
          "line-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.28, 0.92],
          "line-width": ["interpolate", ["linear"], ["zoom"],
            3, ["case", ["boolean", ["feature-state", "on"], false], 2.6, 1.4],
            10, ["case", ["boolean", ["feature-state", "on"], false], 6, 3]],
        },
      }, beneath.current);
      m.addLayer({
        id: "chase-track-glow", type: "line", source: "chase-tracks",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "colour"], "line-blur": 8, "line-opacity": 0.45,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 8, 10, 22],
        },
      }, beneath.current);
      m.addLayer({
        id: "chase-track", type: "line", source: "chase-tracks",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "colour"],
          "line-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.35, 1],
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.4, 10, 7],
        },
      }, beneath.current);
      m.addLayer({
        // Where each chase started and finished. Dim until you pick one — a ring
        // with no fill (the first version) read as a bug rather than as a mark.
        id: "chase-end", type: "circle", source: "chase-ends",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"],
            3, ["case", ["boolean", ["feature-state", "on"], false], 4, 2],
            10, ["case", ["boolean", ["feature-state", "on"], false], 7, 3.5]],
          "circle-color": ["case", ["==", ["get", "kind"], "start"], "#5fd9a8", "#f87171"],
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "rgba(6,6,14,0.9)",
          "circle-opacity": ["case",
            ["boolean", ["feature-state", "on"], false], 1,
            ["boolean", ["feature-state", "dim"], false], 0.25,
            0.6],
          "circle-stroke-opacity": ["case",
            ["boolean", ["feature-state", "on"], false], 1,
            ["boolean", ["feature-state", "dim"], false], 0.25,
            0.6],
        },
      }, beneath.current);

      // Tapping a route is how you pick a chase on the map itself.
      const hit = (e: maplibregl.MapMouseEvent) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ["chase-route", "chase-track"] })[0];
        onSelect(f ? String(f.properties?.id ?? "") : null);
      };
      m.on("click", hit);
      m.on("mouseenter", "chase-route", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "chase-route", () => { m.getCanvas().style.cursor = ""; });
    }
  }, [ready, data, onSelect]);

  // Feature state drives every highlight, so selection costs no re-render of
  // the source — only a repaint.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const [srcId, feats] of [["chase-routes", data.routes], ["chase-tracks", data.tracks], ["chase-ends", data.ends]] as const) {
      feats.forEach((f, i) => {
        const on = selected != null && f.properties?.id === selected;
        m.setFeatureState({ source: srcId, id: i }, { on, dim: selected != null && !on });
      });
    }
  }, [selected, ready, data]);

  // Fit to whatever is on screen; zoom to one chase when it is picked.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const subject = selected ? chases.filter((c) => c.id === selected) : chases;
    const b = chaseBounds(subject);
    if (!b) return;
    m.fitBounds(b, {
      padding: { top: 48, bottom: 48, left: 32, right: 32 },
      maxZoom: selected ? 10 : 7,
      duration: still ? 0 : 900,
      essential: true,
    });
  }, [selected, chases, ready, still]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-border" style={{ background: "#0b0e17" }}>
      <div ref={box} className="w-full" style={{ height: "clamp(280px, 52vh, 560px)" }} />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: ROYAL.dim }} />
        </div>
      )}
      <div className="absolute left-2 bottom-2 px-2 py-1 rounded-md text-[10px]"
           style={{ background: "rgba(8,8,18,0.8)", color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
        Tap a line to open that chase
      </div>
    </div>
  );
}

// ── list ─────────────────────────────────────────────────────────────────────

function ChaseCard({ chase, open, onToggle }: { chase: Chase; open: boolean; onToggle: () => void }) {
  const strongest = chase.tornadoPaths.reduce<number | null>(
    (m, t) => (t.ef == null ? m : m == null ? t.ef : Math.max(m, t.ef)), null);

  return (
    <div
      className="rounded-2xl overflow-hidden border transition-colors"
      style={{
        borderColor: open ? ROYAL.goldSoft : "hsl(var(--border))",
        background: open ? "rgba(217,183,117,0.05)" : "hsl(var(--card))",
      }}
    >
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10.5px]" style={{ color: ROYAL.dim }}>
            <Calendar className="w-3 h-3" />
            {new Date(`${chase.chaseDate}T12:00:00Z`).toLocaleDateString(undefined, {
              day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
            })}
            {!chase.published && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                    style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>Draft</span>
            )}
          </div>
          <div className="text-[15px] font-semibold mt-0.5 truncate"
               style={{ color: ROYAL.text, fontFamily: HEADING }}>
            {chase.title}
          </div>

          {/* The numbers, admin-chosen, plus the two the map already knows. */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {chase.routeMiles != null && (
              <Chip icon={RouteIcon}>{Math.round(chase.routeMiles).toLocaleString()} mi</Chip>
            )}
            {chase.tornadoPaths.length > 0 && (
              <Chip icon={Tornado} tint={efColor(strongest)}>
                {chase.tornadoPaths.length} tornado{chase.tornadoPaths.length === 1 ? "" : "es"}
                {strongest != null ? ` · EF${strongest}` : ""}
              </Chip>
            )}
            {chase.stats.map((s) => (
              <Chip key={`${s.label}-${s.value}`}>
                <span style={{ color: ROYAL.dim }}>{s.label}</span> {s.value}
              </Chip>
            ))}
          </div>
        </div>
        <ChevronDown
          className="w-4 h-4 shrink-0 mt-1 transition-transform"
          style={{ color: ROYAL.dim, transform: open ? "rotate(180deg)" : "none", transition: `transform .25s ${`cubic-bezier(${EASE.join(",")})`}` }}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {chase.coverUrl && (
            <img src={chase.coverUrl} alt="" loading="lazy"
                 className="w-full rounded-xl border" style={{ borderColor: ROYAL.hairline }} />
          )}
          {chase.summary && (
            <div className="text-sm space-y-1.5 sswx-editor"
                 dangerouslySetInnerHTML={{ __html: renderMarkdown(chase.summary) }} />
          )}
          {chase.media.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {chase.media.map((m) => (
                <figure key={m.url} className="space-y-1">
                  {m.kind === "video"
                    ? <video src={m.url} controls playsInline className="w-full rounded-lg border" style={{ borderColor: ROYAL.hairline }} />
                    : <img src={m.url} alt={m.caption ?? ""} loading="lazy" className="w-full rounded-lg border" style={{ borderColor: ROYAL.hairline }} />}
                  {m.caption && <figcaption className="text-[10.5px]" style={{ color: ROYAL.dim }}>{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
          {chase.route.length > 1 && (
            <p className="text-[10.5px] flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
              <MapPin className="w-3 h-3" />
              {chase.routeSnapped
                ? "Route follows the roads actually driven."
                : "Route drawn by hand — roads not matched for this one."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── furniture ────────────────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value, tint }: {
  icon: typeof RouteIcon; label: string; value: string; tint?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em]" style={{ color: ROYAL.dim }}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-[19px] font-bold leading-tight mt-0.5"
           style={{ color: tint ?? ROYAL.text, fontFamily: HEADING }}>
        {value}
      </div>
    </div>
  );
}

function Chip({ icon: Icon, tint, children }: { icon?: typeof RouteIcon; tint?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: tint ?? ROYAL.text }}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

function YearChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
      style={{
        background: on ? "rgba(217,183,117,0.14)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${on ? ROYAL.goldSoft : ROYAL.hairline}`,
        color: on ? ROYAL.gold : ROYAL.dim,
      }}>
      {children}
    </button>
  );
}

/** Only the ratings actually present — a legend for grades nobody chased is noise. */
function EfLegend({ chases }: { chases: Chase[] }) {
  const present = useMemo(() => {
    const s = new Set<number>();
    for (const c of chases) for (const t of c.tornadoPaths) if (t.ef != null) s.add(t.ef);
    return [...s].sort();
  }, [chases]);
  if (present.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: ROYAL.dim }}>
      <span className="uppercase tracking-[0.16em] text-[9.5px]">Tornado tracks</span>
      {present.map((ef) => (
        <span key={ef} className="inline-flex items-center gap-1">
          <span className="w-4 h-1 rounded-full" style={{ background: efColor(ef) }} />
          EF{ef}
        </span>
      ))}
    </div>
  );
}
