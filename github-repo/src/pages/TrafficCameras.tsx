/**
 * Traffic & Hazard Cameras.
 *
 * Roughly 6,500 public cameras from four networks, none of which needs an API
 * key. The point of the module is volume: a member should be able to look at
 * the road, not pick from a shortlist of six.
 *
 * Two views over the same data. The map is for "what is happening over there",
 * the grid is for "show me everything near me at once". Both read from one
 * bounding-box query so switching between them costs nothing.
 *
 * On refresh: camera stills sit behind CDN caching and several networks stamp
 * their own `?t=`. A refresh bumps a nonce that every visible frame appends, so
 * pressing it genuinely fetches new pictures rather than redisplaying the ones
 * already in memory. Auto-refresh is off by default — forty cameras reloading
 * every thirty seconds is a lot of data to spend without being asked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  Camera as CameraIcon, RefreshCw, MapPin, Grid3x3, Map as MapIcon, X,
  Search, Loader2, Video, ExternalLink, Radio, Play, Filter, LocateFixed,
} from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import { BaseMap, type BaseMapHandle } from "../components/map/BaseMap";
import {
  fetchCameras, boxAround, milesBetween, frameUrl, netColor,
  NETWORK_META, RADIUS_CHOICES,
  type Camera, type Radius,
} from "../lib/cameras";
import { TTL } from "../lib/queryClient";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";
import { useCalm } from "../lib/calm";
import type { Location } from "../hooks/useLocation";
import * as maplibregl from "maplibre-gl";

type View = "grid" | "map";

export default function TrafficCameras({ location }: { location: Location }) {
  const [view, setView] = useState<View>("grid");
  const [radius, setRadius] = useState<Radius>(100);
  const [nets, setNets] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [nonce, setNonce] = useState(0);
  const [auto, setAuto] = useState(false);
  const [open, setOpen] = useState<Camera | null>(null);
  const { calm } = useCalm(location?.lat, location?.lon);
  const still = prefersReducedMotion() || calm;

  const bbox = useMemo(
    () => boxAround(location.lat, location.lon, radius),
    [location.lat, location.lon, radius],
  );

  const q = useQuery({
    queryKey: ["cameras", bbox.map((n) => n.toFixed(2)).join(","), nets.join(",")],
    queryFn: () => fetchCameras({ bbox, nets, limit: 600 }),
    staleTime: TTL.config,
  });

  // Auto-refresh only bumps the frame nonce. The camera LIST does not change on
  // a thirty-second cadence and re-querying it would be pure waste.
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setNonce(Date.now()), 45_000);
    return () => clearInterval(t);
  }, [auto]);

  const all = q.data?.cameras ?? [];
  const near = useMemo(() => {
    const withDist = all.map((c) => ({ c, mi: milesBetween(location, c) }));
    withDist.sort((a, b) => a.mi - b.mi);
    return withDist;
  }, [all, location]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return near;
    return near.filter(({ c }) =>
      `${c.name} ${c.road ?? ""} ${c.place ?? ""}`.toLowerCase().includes(needle));
  }, [near, query]);

  const networks = q.data?.networks ?? [];
  const totalKnown = q.data?.total ?? 0;

  return (
    <ModuleShell
      eyebrow="Caltrans · ALERTCalifornia · MDOT · DriveBC"
      title="Traffic & Hazard Cameras"
      subtitle={totalKnown
        ? `${totalKnown.toLocaleString()} public cameras, live, from four networks.`
        : "Public road and hazard cameras, live."}
      status={q.data ? (
        <span className="text-[11px]" style={{ color: ROYAL.dim }}>
          {q.data.matched.toLocaleString()} within {radius} mi
          {q.data.matched > q.data.shown && ` · showing ${q.data.shown}`}
        </span>
      ) : undefined}
      actions={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAuto((v) => !v)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
            style={auto
              ? { background: `${ROYAL.gold}22`, border: `1px solid ${ROYAL.gold}66`, color: ROYAL.gold }
              : { background: "rgba(255,255,255,0.05)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
            <Radio className={`w-3.5 h-3.5 ${auto && !still ? "animate-pulse" : ""}`} />
            {auto ? "Auto 45s" : "Auto off"}
          </button>
          <button
            onClick={() => setNonce(Date.now())}
            className="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
            <RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      {/* Controls */}
      <div className="space-y-2.5">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex rounded-xl p-1 gap-1"
               style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
            {([["grid", Grid3x3, "Grid"], ["map", MapIcon, "Map"]] as const).map(([v, Icon, label]) => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5"
                style={view === v
                  ? { background: ROYAL.gold, color: "#17141f" }
                  : { color: ROYAL.dim }}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <LocateFixed className="w-3.5 h-3.5" style={{ color: ROYAL.dim }} />
            {RADIUS_CHOICES.map((r) => (
              <button key={r} onClick={() => setRadius(r)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                style={radius === r
                  ? { background: `${ROYAL.iris}22`, border: `1px solid ${ROYAL.iris}77`, color: ROYAL.iris }
                  : { background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
                {r} mi
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: ROYAL.dim }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by road, place or name"
              className="w-full rounded-xl pl-9 pr-3 py-2 text-sm"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }} />
          </div>
        </div>

        {networks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <Filter className="w-3.5 h-3.5" style={{ color: ROYAL.dim }} />
            {networks.map((n) => {
              const on = nets.length === 0 || nets.includes(n.id);
              const tone = netColor(n.id);
              return (
                <button key={n.id}
                  onClick={() => setNets((cur) =>
                    cur.includes(n.id) ? cur.filter((x) => x !== n.id)
                      : cur.length === 0 ? networks.filter((m) => m.id !== n.id).map((m) => m.id)
                      : [...cur, n.id])}
                  title={`${n.region} — ${n.count.toLocaleString()} cameras`}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5"
                  style={on
                    ? { background: `${tone}1e`, borderColor: `${tone}66`, color: tone }
                    : { background: "rgba(255,255,255,0.02)", borderColor: ROYAL.hairline, color: ROYAL.dim, opacity: 0.6 }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: on ? tone : ROYAL.dim }} />
                  {n.label}
                  <span className="tabular-nums opacity-70">{n.count.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {q.isLoading && (
        <div className="p-12 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Finding cameras near you…
        </div>
      )}

      {q.isError && (
        <div className="rounded-2xl p-10 text-center"
             style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <CameraIcon className="w-8 h-8 mx-auto mb-2" style={{ color: ROYAL.dim }} />
          <p className="text-sm font-bold" style={{ color: ROYAL.text }}>Could not load the camera list</p>
          <p className="text-xs mt-1" style={{ color: ROYAL.dim }}>Try Refresh in a moment.</p>
        </div>
      )}

      {q.isSuccess && filtered.length === 0 && (
        <div className="rounded-2xl p-10 text-center"
             style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <CameraIcon className="w-8 h-8 mx-auto mb-2.5" style={{ color: ROYAL.dim }} />
          <p className="text-base font-bold" style={{ color: ROYAL.text, fontFamily: HEADING }}>
            {query ? "Nothing matches that search" : `No cameras within ${radius} miles`}
          </p>
          <p className="text-sm mt-1.5 max-w-md mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>
            {query
              ? "Try a road number or a town name."
              : `The networks we can reach without an API key cover California, Michigan and British Columbia — ${totalKnown.toLocaleString()} cameras in all. Widen the radius, or look at one of those areas on the map.`}
          </p>
        </div>
      )}

      {q.isSuccess && filtered.length > 0 && view === "grid" && (
        <CameraGrid items={filtered} nonce={nonce} still={still} onOpen={setOpen} />
      )}

      {q.isSuccess && filtered.length > 0 && view === "map" && (
        <CameraMap
          cameras={filtered.map((f) => f.c)}
          center={location}
          nonce={nonce}
          onOpen={setOpen}
        />
      )}

      <AnimatePresence>
        {open && <Lightbox cam={open} nonce={nonce} still={still} onClose={() => setOpen(null)} />}
      </AnimatePresence>

      <p className="text-[11px] leading-relaxed px-1" style={{ color: ROYAL.dim }}>
        Cameras are published by Caltrans, ALERTCalifornia, the Michigan Department of Transportation and DriveBC,
        and are shown as they publish them. Pictures refresh on their own schedule, typically every one to five
        minutes, so a frame is recent rather than instantaneous. Most other state 511 systems need a free API key
        before they will answer, which is why the coverage is where it is.
      </p>
    </ModuleShell>
  );
}

// ─── grid ────────────────────────────────────────────────────────────────────
function CameraGrid({
  items, nonce, still, onOpen,
}: {
  items: { c: Camera; mi: number }[];
  nonce: number;
  still: boolean;
  onOpen: (c: Camera) => void;
}) {
  // Rendering six hundred <img> tags at once is how you melt a phone. The list
  // grows as the reader scrolls instead.
  const [limit, setLimit] = useState(36);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => { setLimit(36); }, [items]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setLimit((n) => Math.min(n + 36, items.length));
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  const shown = items.slice(0, limit);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {shown.map(({ c, mi }, i) => (
          <CameraCard key={c.id} cam={c} miles={mi} nonce={nonce} still={still}
                      index={i} onOpen={() => onOpen(c)} />
        ))}
      </div>
      {limit < items.length && (
        <div ref={sentinel} className="py-6 text-center text-[12px]" style={{ color: ROYAL.dim }}>
          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1.5" />
          {items.length - limit} more
        </div>
      )}
    </div>
  );
}

function CameraCard({
  cam, miles, nonce, still, index, onOpen,
}: { cam: Camera; miles: number; nonce: number; still: boolean; index: number; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const tone = netColor(cam.net);
  const meta = NETWORK_META[cam.net];

  useEffect(() => { setFailed(false); }, [nonce]);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0.2 : 0.35, delay: still ? 0 : Math.min(index * 0.02, 0.4), ease: EASE }}
      className="text-left rounded-2xl overflow-hidden group"
      style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}
    >
      <div className="relative" style={{ aspectRatio: "4 / 3", background: "#06060f" }}>
        {!cam.img ? (
          // Video-only network (511NY publishes no stills at all). Rendering an
          // HLS player into every tile would pull hundreds of streams at once,
          // so the tile is a placard and the stream starts when it is opened.
          <div className="absolute inset-0 grid place-items-center text-[11px] px-3 text-center"
               style={{ color: ROYAL.dim, background: "radial-gradient(circle at 50% 40%, rgba(217,183,117,0.10), transparent 70%)" }}>
            <span>
              <Video className="w-6 h-6 mx-auto mb-1.5" style={{ color: tone }} />
              <span className="block font-semibold" style={{ color: ROYAL.text }}>Live video</span>
              <span className="block opacity-70">Tap to watch</span>
            </span>
          </div>
        ) : failed ? (
          <div className="absolute inset-0 grid place-items-center text-[11px] px-3 text-center"
               style={{ color: ROYAL.dim }}>
            <span>
              <CameraIcon className="w-5 h-5 mx-auto mb-1 opacity-60" />
              This camera is not returning a picture
            </span>
          </div>
        ) : (
          <img
            src={frameUrl(cam, nonce)}
            alt={cam.name}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        {cam.stream && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[9px] font-black flex items-center gap-1"
                style={{ background: "rgba(6,6,15,0.8)", color: tone }}>
            <Video className="w-3 h-3" /> LIVE
          </span>
        )}
        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
              style={{ background: "rgba(6,6,15,0.8)", color: tone }}>
          {meta?.label ?? cam.net}
        </span>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-[13px] font-semibold leading-tight line-clamp-2" style={{ color: ROYAL.text }}>
          {cam.name}
        </div>
        <div className="text-[11px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: ROYAL.dim }}>
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />{Math.round(miles)} mi
          </span>
          {cam.road && <span>{cam.road}</span>}
          {cam.dir && <span>{cam.dir}</span>}
        </div>
      </div>
    </motion.button>
  );
}

// ─── map ─────────────────────────────────────────────────────────────────────
function CameraMap({
  cameras, center, nonce, onOpen,
}: { cameras: Camera[]; center: Location; nonce: number; onOpen: (c: Camera) => void }) {
  const ref = useRef<BaseMapHandle>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const live = useRef({ cameras, onOpen });
  live.current = { cameras, onOpen };

  const place = useCallback((map: maplibregl.Map) => {
    for (const m of markers.current) m.remove();
    markers.current = [];
    // A marker per camera rather than a symbol layer: these need a click target
    // and a colour per network, and at a few hundred pins the difference in
    // cost is not worth a custom sprite sheet.
    for (const c of live.current.cameras.slice(0, 400)) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", c.name);
      el.style.cssText = [
        "width:14px", "height:14px", "border-radius:4px", "cursor:pointer",
        `background:${netColor(c.net)}`, "border:1.5px solid rgba(6,6,15,0.85)",
        "box-shadow:0 0 0 1px rgba(255,255,255,0.12)",
      ].join(";");
      el.addEventListener("click", (e) => { e.stopPropagation(); live.current.onOpen(c); });
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(map));
    }
  }, []);

  useEffect(() => {
    const map = ref.current?.map();
    if (map) place(map);
    return () => { for (const m of markers.current) m.remove(); markers.current = []; };
  }, [cameras, place, nonce]);

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="h-[460px] md:h-[600px]">
        <BaseMap
          ref={ref}
          center={{ lat: center.lat, lon: center.lon }}
          zoom={7}
          height="100%"
          onReady={(map) => place(map)}
        />
      </div>
      <div className="px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]"
           style={{ borderTop: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        {Object.entries(NETWORK_META).map(([id, m]) => (
          <span key={id} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.color }} />{m.label}
          </span>
        ))}
        <span className="ml-auto">Tap a pin for the picture. Showing up to 400 at a time.</span>
      </div>
    </div>
  );
}

// ─── lightbox ────────────────────────────────────────────────────────────────
function Lightbox({
  cam, nonce, still, onClose,
}: { cam: Camera; nonce: number; still: boolean; onClose: () => void }) {
  // A video-only camera has no still to fall back to, so it opens playing.
  const [showStream, setShowStream] = useState(!cam.img && Boolean(cam.stream));
  const [ownNonce, setOwnNonce] = useState(nonce);
  const tone = netColor(cam.net);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0" onClick={onClose}
           style={{ background: "rgba(4,4,12,0.85)", backdropFilter: "blur(6px)" }} />
      <motion.div
        role="dialog" aria-modal="true" aria-label={cam.name}
        initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden"
        style={{ background: ROYAL.ink2, border: `1px solid ${tone}44` }}
      >
        <div className="px-4 py-3 flex items-start gap-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: tone }}>
              {NETWORK_META[cam.net]?.label ?? cam.net}
              {NETWORK_META[cam.net]?.kind ? ` · ${NETWORK_META[cam.net].kind}` : ""}
            </div>
            <h3 className="text-base font-bold leading-tight" style={{ fontFamily: HEADING, color: ROYAL.text }}>
              {cam.name}
            </h3>
            <div className="text-[11px] mt-0.5 flex gap-2 flex-wrap" style={{ color: ROYAL.dim }}>
              {cam.road && <span>{cam.road}</span>}
              {cam.place && <span>{cam.place}</span>}
              {cam.dir && <span>facing {cam.dir}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 p-1.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.06)", color: ROYAL.dim }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative" style={{ background: "#06060f", aspectRatio: "16 / 10" }}>
          {showStream && cam.stream ? (
            // The HLS playlist plays natively in Safari and on iOS; elsewhere it
            // needs a player library we are not shipping for this. Rather than
            // silently show a black rectangle, the link out is always offered.
            <video
              src={cam.stream} autoPlay muted playsInline controls
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <img
              key={ownNonce}
              src={frameUrl(cam, ownNonce)}
              alt={cam.name}
              className="absolute inset-0 w-full h-full object-contain"
            />
          )}
        </div>

        <div className="px-4 py-3 flex items-center gap-2 flex-wrap"
             style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
          {/* Nothing to re-fetch on a video-only camera. */}
          {cam.img && (
            <button onClick={() => setOwnNonce(Date.now())}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.06)", color: ROYAL.text }}>
              <RefreshCw className="w-3.5 h-3.5" /> New frame
            </button>
          )}
          {cam.stream && cam.img && (
            <button onClick={() => setShowStream((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
              style={{ background: tone, color: "#0d0d18" }}>
              <Play className="w-3.5 h-3.5" /> {!cam.img ? "Live video" : showStream ? "Back to still" : "Live video"}
            </button>
          )}
          {cam.stream && (
            <a href={cam.stream} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.06)", color: ROYAL.dim }}>
              <ExternalLink className="w-3.5 h-3.5" /> Open stream
            </a>
          )}
          <span className="ml-auto text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
            {cam.lat.toFixed(4)}, {cam.lon.toFixed(4)}
          </span>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
