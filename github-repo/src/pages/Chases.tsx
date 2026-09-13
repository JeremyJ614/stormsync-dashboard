import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as maplibregl from "maplibre-gl";
import "../lib/maplibreWorker";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, ChevronDown, Gauge, Loader2, MapPin, Route as RouteIcon,
  Sparkles, Tornado, Wind,
} from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import { STORMSYNC_DARK, applyRoyalBasemap } from "../lib/basemap";
import { renderMarkdown } from "../lib/markdown";
import {
  listChases, chaseBounds, chaseSeasonTotals, efColor,
  type Chase, type LngLat,
} from "../lib/chases";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";
import { useChaseSeen } from "../lib/chaseSeen";

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

  // ── what you are looking at ───────────────────────────────────────────────
  //
  // Three narrowings, each one optional and each one reversible: a year, then a
  // month inside it, then a single chase. Landing on the page with nothing
  // chosen shows the whole log, which is the honest default — the archive is
  // the thing being sold, and hiding it behind a date picker would be daft.
  const [year, setYear] = useState<string | "all">("all");
  const [month, setMonth] = useState<string | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const years = useMemo(() => {
    const s = new Set(all.map((c) => c.chaseDate.slice(0, 4)));
    return [...s].sort().reverse();
  }, [all]);

  const inYear = useMemo(
    () => (year === "all" ? all : all.filter((c) => c.chaseDate.startsWith(year))),
    [all, year],
  );

  // Only the months actually chased. A row of twelve buttons where eight of them
  // do nothing tells you less than a row of four that all do something.
  const months = useMemo(() => {
    const s = new Set(inYear.map((c) => c.chaseDate.slice(5, 7)));
    return [...s].sort();
  }, [inYear]);

  const chases = useMemo(
    () => (month === "all" ? inYear : inYear.filter((c) => c.chaseDate.slice(5, 7) === month)),
    [inYear, month],
  );

  // A month that survives a year change would silently empty the page.
  useEffect(() => {
    if (month !== "all" && !months.includes(month)) setMonth("all");
  }, [months, month]);

  // Picking a chase means picking a chase — the map holds it alone, not it plus
  // everything else greyed out.
  const visible = useMemo(
    () => (selected == null ? chases : chases.filter((c) => c.id === selected)),
    [chases, selected],
  );
  const totals = useMemo(() => chaseSeasonTotals(visible), [visible]);

  // The list carries its own dividers so the archive reads as seasons rather
  // than as one undifferentiated column: years while you are looking at all of
  // them, months once you are inside one. `visible` arrives newest-first, so
  // consecutive runs are the groups.
  const groups = useMemo(() => {
    if (selected != null) return [{ key: "one", label: null as string | null, items: visible }];
    const keyOf = (c: Chase) =>
      year === "all" ? c.chaseDate.slice(0, 4) : month === "all" ? c.chaseDate.slice(5, 7) : "one";
    const labelOf = (k: string) =>
      year === "all" ? k : month === "all" ? `${MONTHS[Number(k) - 1]} ${year}` : scopeLabel(year, month);
    const out: { key: string; label: string | null; items: Chase[] }[] = [];
    for (const c of visible) {
      const k = keyOf(c);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(c);
      else out.push({ key: k, label: labelOf(k), items: [c] });
    }
    return out;
  }, [visible, year, month, selected]);

  // "New" is measured against everything published, not the year in view — a
  // chase filtered off screen has not been seen just because it is not here.
  const allIds = useMemo(() => all.map((c) => c.id), [all]);
  const seen = useChaseSeen(allIds);

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

          {seen.newCount > 0 && (
            <NewChasesBanner count={seen.newCount} onDismiss={seen.markAllSeen} />
          )}

          {years.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <FilterChip on={year === "all"} onClick={() => { setYear("all"); setSelected(null); }}>All years</FilterChip>
              {years.map((y) => (
                <FilterChip key={y} on={year === y} onClick={() => { setYear(y); setSelected(null); }}>{y}</FilterChip>
              ))}
            </div>
          )}

          {months.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <FilterChip small on={month === "all"} onClick={() => { setMonth("all"); setSelected(null); }}>
                {year === "all" ? "Every month" : "Whole season"}
              </FilterChip>
              {months.map((m) => (
                <FilterChip key={m} small on={month === m} onClick={() => { setMonth(m); setSelected(null); }}>
                  {MONTHS[Number(m) - 1]}
                </FilterChip>
              ))}
            </div>
          )}

          {selected != null && (
            <button onClick={() => setSelected(null)}
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left"
                    style={{ background: "rgba(217,183,117,0.07)", border: `1px solid ${ROYAL.goldSoft}` }}>
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />
              <span className="text-[12px] font-semibold" style={{ color: ROYAL.gold }}>
                Back to {chases.length} chase{chases.length === 1 ? "" : "s"}
              </span>
              <span className="text-[11px] ml-auto truncate" style={{ color: ROYAL.dim }}>
                {scopeLabel(year, month)}
              </span>
            </button>
          )}

          <ChaseMap chases={visible} selected={selected} onSelect={setSelected} />

          <EfLegend chases={visible} />

          <div className="space-y-2">
            {groups.map((g) => (
              <section key={g.key} className="space-y-2">
                {g.label && <SectionHead label={g.label} count={g.items.length} />}
                {g.items.map((c) => (
                  <ChaseCard
                    key={c.id}
                    chase={c}
                    isNew={seen.isNew(c.id)}
                    open={selected === c.id}
                    onToggle={() => {
                      // Marking on expand rather than on render is the whole
                      // point: the marker survives a scroll past and clears on
                      // a look.
                      //
                      // Both calls are made here rather than one inside the
                      // other's updater: a state updater must be pure, and
                      // calling a second component's setter from inside one is
                      // the kind of thing that works until React decides to
                      // re-run it.
                      const willOpen = selected !== c.id;
                      setSelected(willOpen ? c.id : null);
                      if (willOpen) seen.markSeen(c.id);
                    }}
                  />
                ))}
              </section>
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
        {selected ? "One chase — tap Back above for the rest" : "Tap a line to open that chase"}
      </div>
    </div>
  );
}

// ── list ─────────────────────────────────────────────────────────────────────

/**
 * The banner above the list. Says how many, and lets somebody clear the lot
 * without opening each one — a marker you cannot dismiss is an irritation.
 */
function NewChasesBanner({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  const still = prefersReducedMotion();
  return (
    <motion.div
      className="relative overflow-hidden rounded-xl px-3.5 py-2.5 flex items-center gap-2.5"
      style={{
        border: `1px solid ${ROYAL.goldSoft}`,
        background: "linear-gradient(100deg, rgba(217,183,117,0.12), rgba(217,183,117,0.03))",
      }}
      initial={still ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={still ? { duration: 0 } : { duration: 0.3, ease: EASE }}
    >
      {!still && (
        <motion.span
          className="pointer-events-none absolute inset-y-0 w-24"
          style={{ background: "linear-gradient(90deg, transparent, rgba(217,183,117,0.22), transparent)" }}
          initial={{ x: -120 }}
          animate={{ x: 720 }}
          transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2.4, ease: EASE }}
          aria-hidden
        />
      )}
      <Sparkles className="relative w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
      <span className="relative flex-1 text-[12.5px]" style={{ color: ROYAL.text }}>
        <strong>{count} new chase{count === 1 ? "" : "s"}</strong> since you last looked.
      </span>
      <button
        onClick={onDismiss}
        className="relative shrink-0 text-[11px] px-2 py-1 rounded-lg border"
        style={{ borderColor: ROYAL.goldSoft, color: ROYAL.gold }}
      >
        Mark all seen
      </button>
    </motion.div>
  );
}

function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5 pt-2 pb-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: ROYAL.gold, fontFamily: HEADING }}>{label}</span>
      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${ROYAL.goldSoft}, transparent)` }} />
      <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>{count}</span>
    </div>
  );
}

/**
 * The shape of the drive, at thumbnail size.
 *
 * The list was six rounded rectangles that differed only in their text. Every
 * chase already carries a line nobody was looking at, and drawn small it gives
 * each row a face you can recognise before you have read it — a hook west of
 * Amarillo does not look like a run up I-35. It costs nothing: the geometry is
 * already in memory for the map above.
 */
function RouteGlyph({ chase }: { chase: Chase }) {
  const g = useMemo(() => {
    const all: LngLat[] = [...chase.route, ...chase.tornadoPaths.flatMap((t) => t.coords)];
    if (all.length < 2) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of all) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const W = 54, H = 44, PAD = 6;
    // One scale for both axes, or a two-hour drive due north reads as a
    // cross-country sweep.
    const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
    const k = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const ox = (W - spanX * k) / 2, oy = (H - spanY * k) / 2;
    // Latitude grows north, SVG y grows down.
    const to = ([x, y]: LngLat): [number, number] => [ox + (x - minX) * k, H - (oy + (y - minY) * k)];
    const path = (pts: LngLat[]) =>
      pts.map((p, i) => `${i ? "L" : "M"}${to(p).map((n) => n.toFixed(1)).join(" ")}`).join("");
    return {
      W, H,
      road: chase.route.length > 1 ? path(chase.route) : null,
      start: chase.route.length > 1 ? to(chase.route[0]) : null,
      end: chase.route.length > 1 ? to(chase.route[chase.route.length - 1]) : null,
      tracks: chase.tornadoPaths.filter((t) => t.coords.length > 1)
        .map((t) => ({ d: path(t.coords), colour: efColor(t.ef) })),
    };
  }, [chase]);

  if (!g) return null;
  return (
    <svg width={g.W} height={g.H} viewBox={`0 0 ${g.W} ${g.H}`} aria-hidden
         className="shrink-0 rounded-lg"
         style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${ROYAL.hairline}` }}>
      {g.road && (
        <>
          <path d={g.road} fill="none" stroke={ROYAL.gold} strokeOpacity={0.35} strokeWidth={3}
                strokeLinecap="round" strokeLinejoin="round" />
          <path d={g.road} fill="none" stroke={ROYAL.gold} strokeWidth={1}
                strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {g.tracks.map((t, i) => (
        <path key={i} d={t.d} fill="none" stroke={t.colour} strokeWidth={1.8} strokeLinecap="round" />
      ))}
      {g.start && <circle cx={g.start[0]} cy={g.start[1]} r={1.8} fill="#5fd9a8" />}
      {g.end && <circle cx={g.end[0]} cy={g.end[1]} r={1.8} fill="#f87171" />}
    </svg>
  );
}

function ChaseCard({ chase, open, onToggle, isNew }: { chase: Chase; open: boolean; onToggle: () => void; isNew: boolean }) {
  const strongest = chase.tornadoPaths.reduce<number | null>(
    (m, t) => (t.ef == null ? m : m == null ? t.ef : Math.max(m, t.ef)), null);

  const still = prefersReducedMotion();
  // The marker is loud on purpose and it is temporary by construction: it is
  // only ever drawn while `isNew`, and expanding the card clears that.
  const lit = isNew && !still;

  return (
    <motion.div
      className="relative rounded-2xl overflow-hidden border transition-colors"
      style={{
        borderColor: isNew ? ROYAL.gold : open ? ROYAL.goldSoft : "hsl(var(--border))",
        background: open ? "rgba(217,183,117,0.05)" : isNew ? "rgba(217,183,117,0.045)" : "hsl(var(--card))",
      }}
      initial={false}
      animate={lit
        ? { boxShadow: [
            "0 0 0 0 rgba(217,183,117,0)",
            "0 0 26px -6px rgba(217,183,117,0.55)",
            "0 0 0 0 rgba(217,183,117,0)",
          ] }
        : { boxShadow: "0 0 0 0 rgba(217,183,117,0)" }}
      transition={lit ? { duration: 2.6, repeat: Infinity, ease: EASE } : { duration: 0.3 }}
    >
      {/* A champagne edge that runs the perimeter, and a sheen that crosses the
          face behind the content. Two different motions at two different speeds
          is what stops it reading as a plain flashing box. */}
      {lit && (
        <>
          <motion.span
            className="pointer-events-none absolute inset-y-0 w-32 z-0"
            style={{ background: "linear-gradient(90deg, transparent, rgba(217,183,117,0.20), transparent)" }}
            initial={{ x: -160 }}
            animate={{ x: 900 }}
            transition={{ duration: 2.1, repeat: Infinity, repeatDelay: 1.5, ease: EASE }}
            aria-hidden
          />
          <motion.span
            className="pointer-events-none absolute inset-x-0 top-0 h-px z-10"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.gold}, transparent)` }}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: EASE }}
            aria-hidden
          />
        </>
      )}

      <button onClick={onToggle} className="relative z-10 w-full text-left px-4 py-3 flex items-start gap-3">
        <RouteGlyph chase={chase} />
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
            {isNew && (
              <motion.span
                className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.14em] flex items-center gap-1"
                style={{ background: ROYAL.gold, color: "#0b0b12" }}
                initial={still ? false : { scale: 0.6, opacity: 0 }}
                animate={still
                  ? { scale: 1, opacity: 1 }
                  : { scale: [1, 1.07, 1], opacity: 1 }}
                transition={still
                  ? { duration: 0 }
                  : { scale: { duration: 1.8, repeat: Infinity, ease: EASE }, opacity: { duration: 0.3 } }}
              >
                <Sparkles className="w-2.5 h-2.5" /> New
              </motion.span>
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
        <div className="relative z-10 px-4 pb-4 space-y-3">
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
    </motion.div>
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

const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];

/** What the filters currently add up to, in words. */
function scopeLabel(year: string, month: string): string {
  const m = month === "all" ? null : MONTHS[Number(month) - 1];
  if (year === "all") return m ? `Every ${m}` : "All years";
  return m ? `${m} ${year}` : year;
}

function FilterChip({ on, small, onClick, children }: {
  on: boolean; small?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`shrink-0 rounded-lg font-semibold ${small ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]"}`}
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
