import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Check, Crosshair, Loader2, MapPin, Pencil, Plus, Route as RouteIcon, Save, Search,
  Tornado, Trash2, Undo2, X, Zap,
} from "lucide-react";
import {
  listChases, createChase, updateChase, deleteChase, deleteChases, snapRoute, haversineMiles,
  findPlaces, describePoint,
  efColor, type Chase, type ChaseInput, type ChaseStat, type LngLat, type Place,
  type TornadoPath,
} from "../../lib/chases";
import { STORMSYNC_DARK, applyRoyalBasemap } from "../../lib/basemap";
import { audit } from "../../lib/adminAudit";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * Adding a chase.
 *
 * Two things are drawn on one map: the road driven and the track the tornado
 * took. Both are click-to-place, because that is the only input a phone can
 * offer for a line, and undo is one tap for the same reason.
 *
 * The route is snapped to roads on save, once, and the result stored — so the
 * member-facing map never calls a routing service and never costs anything to
 * view. If snapping is unavailable the drawn line is kept and marked as
 * unsnapped rather than the save failing, because losing somebody's drawing to
 * a third party's outage would be unforgivable.
 *
 * WAYPOINTS BY NAME. Clicking a map is a poor way to say "we started in Terre
 * Haute": you have to find it first, and the point you land on is approximate.
 * So a chase can be built by typing place names, and a point clicked on the map
 * is reverse-geocoded and joins the same list — one column of named waypoints
 * however they were added, reorderable and removable. The two inputs produce the
 * same thing because they are the same thing.
 *
 * MILEAGE. `routeMiles` is the SNAPPED road distance and nothing else. It used
 * to persist through further editing: snap early, add ten more points, save, and
 * the chase was filed with the mileage of the route as it stood ten points ago —
 * which is how a 635-mile drive came to be recorded as 0.2 miles. Any change to
 * the route clears it now, and what is displayed falls back to the straight-line
 * distance, labelled as such.
 */
type Mode = "route" | "tornado" | null;

const BLANK: ChaseInput = {
  title: "", chaseDate: new Date().toISOString().slice(0, 10), summary: "",
  route: [], tornadoPaths: [], stats: [], published: false,
};

/**
 * A route point that knows where it is.
 *
 * `label` is filled asynchronously — a click puts the point on the map at once
 * and the name arrives a moment later, because waiting on a geocoder before
 * showing the pin you just placed would make the map feel broken.
 */
interface Waypoint { label: string; lon: number; lat: number }

/** A stored route this short is a list of waypoints; longer is snapped road. */
const LOOKS_LIKE_WAYPOINTS = 30;

export function AdminChasesTab() {
  const [chases, setChases] = useState<Chase[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChaseInput>(BLANK);
  const [mode, setMode] = useState<Mode>(null);
  const [tornadoIdx, setTornadoIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [wipeYear, setWipeYear] = useState<string>("all");

  const years = useMemo(
    () => Array.from(new Set((chases ?? []).map((c) => c.chaseDate.slice(0, 4)))).sort().reverse(),
    [chases]);

  const load = useCallback(() => { void listChases().then(setChases).catch(() => setChases([])); }, []);
  useEffect(() => { load(); }, [load]);

  function reset() {
    setEditingId(null); setForm(BLANK); setMode(null); setTornadoIdx(0); setNote(null);
    setWaypoints([]); setPlaceQuery(""); setPlaceHits(null);
  }

  /** The waypoint list is the route, until it is snapped. */
  const applyWaypoints = useCallback((list: Waypoint[]) => {
    setWaypoints(list);
    setForm((f) => ({
      ...f,
      route: list.map((w) => [w.lon, w.lat] as LngLat),
      routeSnapped: false,
      routeMiles: null,
    }));
  }, []);

  /** Add a point and go and find out what it is called. */
  const addWaypoint = useCallback((p: LngLat, label?: string) => {
    const provisional: Waypoint = { label: label ?? "Locating…", lon: p[0], lat: p[1] };
    setWaypoints((prev) => {
      const next = [...prev, provisional];
      setForm((f) => ({
        ...f,
        route: next.map((w) => [w.lon, w.lat] as LngLat),
        routeSnapped: false,
        routeMiles: null,
      }));
      return next;
    });
    if (label) return;
    void describePoint(p).then((place) => {
      setWaypoints((prev) => prev.map((w) =>
        w.lon === p[0] && w.lat === p[1] && w.label === "Locating…"
          ? { ...w, label: place?.label ?? `${p[1].toFixed(3)}, ${p[0].toFixed(3)}` }
          : w));
    });
  }, []);

  function edit(c: Chase) {
    setEditingId(c.id);
    setForm({
      title: c.title, chaseDate: c.chaseDate, summary: c.summary ?? "",
      route: c.route, routeMiles: c.routeMiles, routeSnapped: c.routeSnapped,
      tornadoPaths: c.tornadoPaths, stats: c.stats, coverUrl: c.coverUrl,
      media: c.media, published: c.published, sortOrder: c.sortOrder,
    });
    setMode(null); setTornadoIdx(0); setNote(null);
    // A short stored route is the waypoints somebody placed; a long one is road
    // geometry a router produced, and pretending each of its 758 vertices is a
    // waypoint would be unusable. The long one stays on the map as it is.
    setWaypoints(c.route.length > 0 && c.route.length <= LOOKS_LIKE_WAYPOINTS
      ? c.route.map(([lon, lat]) => ({ label: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lon, lat }))
      : []);
    setPlaceQuery(""); setPlaceHits(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const addPoint = useCallback((p: LngLat) => {
    setForm((f) => {
      // Route clicks are handled by `addWaypoint` so the point lands in the
      // named list too — this branch only exists for the tornado case below.
      if (mode === "route") return f;
      if (mode === "tornado") {
        const paths = f.tornadoPaths.slice();
        if (!paths[tornadoIdx]) paths[tornadoIdx] = { coords: [], ef: null };
        paths[tornadoIdx] = { ...paths[tornadoIdx], coords: [...paths[tornadoIdx].coords, p] };
        return { ...f, tornadoPaths: paths };
      }
      return f;
    });
  }, [mode, tornadoIdx]);

  /** One handler for the map. Route clicks name themselves; tornado clicks do not. */
  const onMapPoint = useCallback((p: LngLat) => {
    if (mode === "route") { addWaypoint(p); return; }
    addPoint(p);
  }, [mode, addWaypoint, addPoint]);

  async function searchPlaces() {
    if (placeQuery.trim().length < 2) return;
    setSearching(true); setPlaceHits(null);
    setPlaceHits(await findPlaces(placeQuery));
    setSearching(false);
  }

  /** Reordering is how you fix a stop dropped out of sequence. */
  function swap<T>(list: T[], a: number, b: number): T[] {
    if (b < 0 || b >= list.length) return list;
    const next = list.slice();
    [next[a], next[b]] = [next[b], next[a]];
    return next;
  }

  function undoPoint() {
    setForm((f) => {
      if (mode === "route") {
        return { ...f, route: f.route.slice(0, -1), routeSnapped: false, routeMiles: null };
      }
      if (mode === "tornado") {
        const paths = f.tornadoPaths.slice();
        const cur = paths[tornadoIdx];
        if (!cur) return f;
        paths[tornadoIdx] = { ...cur, coords: cur.coords.slice(0, -1) };
        return { ...f, tornadoPaths: paths };
      }
      return f;
    });
  }

  async function snap() {
    if (form.route.length < 2) return;
    setBusy("snap"); setNote(null);
    const r = await snapRoute(form.route);
    setForm((f) => ({ ...f, route: r.coords, routeMiles: r.miles, routeSnapped: r.snapped }));
    setBusy(null);
    setNote(r.snapped
      ? `Snapped to roads — ${r.miles} miles.`
      : `Roads could not be matched, so the drawn line is kept (${r.miles} miles as the crow flies).`);
  }

  async function save(publish?: boolean) {
    if (!form.title.trim()) { setNote("Give it a title."); return; }
    setBusy("save"); setNote(null);
    const payload: ChaseInput = {
      ...form,
      published: publish ?? form.published,
      routeMiles: form.routeMiles ?? (form.route.length > 1 ? haversineMiles(form.route) : null),
      tornadoPaths: form.tornadoPaths.filter((t) => t.coords.length > 1),
    };
    const r = editingId ? await updateChase(editingId, payload) : await createChase(payload);
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not save."); return; }
    await audit("settings.change", { type: "chase", id: editingId ?? "new", label: payload.title },
      { published: payload.published, points: payload.route.length, tornadoes: payload.tornadoPaths.length });
    reset(); load();
  }

  /**
   * Clear the log, or one season of it.
   *
   * Typed confirmation rather than an OK button: this is the one action here
   * that cannot be walked back, and a chase log is years of somebody's life.
   */
  async function wipe() {
    const year = wipeYear === "all" ? null : Number(wipeYear);
    const scope = year == null ? "every chase" : `every ${year} chase`;
    const n = (chases ?? []).filter((c) => year == null || c.chaseDate.startsWith(String(year))).length;
    if (n === 0) { setNote("Nothing to clear there."); return; }
    const typed = prompt(`This deletes ${scope} — ${n} of them — permanently.\n\nType DELETE to confirm.`);
    if (typed?.trim().toUpperCase() !== "DELETE") return;
    setBusy("wipe"); setNote(null);
    const r = await deleteChases(year);
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not clear the log."); return; }
    await audit("settings.change", { type: "chase", id: "bulk", label: scope }, { deleted: r.count ?? 0 });
    setNote(`Cleared ${r.count ?? 0} chase${r.count === 1 ? "" : "s"}.`);
    if (editingId) reset();
    load();
  }

  async function remove(c: Chase) {
    if (!confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    setBusy(c.id);
    await deleteChase(c.id);
    setBusy(null);
    if (editingId === c.id) reset();
    load();
  }

  const field = "w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40";

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <RouteIcon className="w-4 h-4" style={{ color: ROYAL.gold }} />
            {editingId ? "Edit chase" : "Add a chase"}
          </h3>
          {editingId && (
            <button onClick={reset} className="text-xs flex items-center gap-1" style={{ color: ROYAL.dim }}>
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                 placeholder="Title — e.g. Selden, Kansas" className={field} />
          <input type="date" value={form.chaseDate}
                 onChange={(e) => setForm({ ...form, chaseDate: e.target.value })} className={`${field} sm:w-44`} />
        </div>

        <textarea value={form.summary ?? ""} onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  rows={3} placeholder="How the day went. Markdown works here."
                  className={`${field} resize-y text-sm`} />

        {/* ── the drawing surface ─────────────────────────────────────────── */}
        <DrawMap
          route={form.route}
          tornadoPaths={form.tornadoPaths}
          mode={mode}
          activeTornado={tornadoIdx}
          onPoint={onMapPoint}
        />

        <div className="flex flex-wrap items-center gap-2">
          <ModeButton on={mode === "route"} onClick={() => setMode(mode === "route" ? null : "route")}
                      icon={RouteIcon} tint={ROYAL.gold}>
            {mode === "route" ? "Placing route…" : "Draw the route"}
          </ModeButton>
          <ModeButton
            on={mode === "tornado"}
            onClick={() => {
              if (mode === "tornado") { setMode(null); return; }
              setForm((f) => f.tornadoPaths.length === 0
                ? { ...f, tornadoPaths: [{ coords: [], ef: null }] } : f);
              setMode("tornado");
            }}
            icon={Tornado} tint="#f87171">
            {mode === "tornado" ? `Placing track ${tornadoIdx + 1}…` : "Draw a tornado track"}
          </ModeButton>

          {mode && (
            <button onClick={undoPoint} className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs flex items-center gap-1.5">
              <Undo2 className="w-3.5 h-3.5" /> Undo point
            </button>
          )}

          <button onClick={snap} disabled={form.route.length < 2 || busy === "snap"}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  style={{ background: "rgba(217,183,117,0.12)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {busy === "snap" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Snap to roads
          </button>

          <span className="text-[11px]" style={{ color: ROYAL.dim }}>
            {form.route.length} route point{form.route.length === 1 ? "" : "s"}
            {form.route.length > 1 && (form.routeSnapped
              ? ` · ${form.routeMiles} mi by road`
              : ` · ${haversineMiles(form.route)} mi as the crow flies`)}
          </span>
        </div>

        {/* ── waypoints, however they were added ──────────────────────────── */}
        <div className="rounded-lg p-3 space-y-2.5"
             style={{ border: `1px solid ${ROYAL.hairline}`, background: "rgba(255,255,255,0.015)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: ROYAL.dim, fontFamily: HEADING }}>
              Waypoints
            </span>
            {waypoints.length > 0 && (
              <button onClick={() => applyWaypoints([])} className="text-[10.5px]" style={{ color: ROYAL.dim }}>
                Clear
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: ROYAL.dim }} />
              <input value={placeQuery}
                     onChange={(e) => setPlaceQuery(e.target.value)}
                     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchPlaces(); } }}
                     placeholder="Town, address, or landmark"
                     className={`${field} pl-8 text-xs`} />
            </div>
            <button onClick={() => void searchPlaces()}
                    disabled={placeQuery.trim().length < 2 || searching}
                    className="px-3 py-2 rounded-lg text-xs font-semibold shrink-0 grid place-items-center disabled:opacity-40"
                    style={{ background: "rgba(217,183,117,0.12)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Find"}
            </button>
          </div>

          {placeHits !== null && placeHits.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${ROYAL.hairline}` }}>
              {placeHits.map((p, i) => (
                <button key={`${p.lon},${p.lat},${i}`}
                        onClick={() => {
                          addWaypoint([p.lon, p.lat], p.label);
                          setPlaceHits(null); setPlaceQuery("");
                        }}
                        className="w-full text-left px-2.5 py-2 text-[11.5px] flex items-start gap-2 hover:bg-white/5"
                        style={{ borderTop: i === 0 ? undefined : `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
                  <MapPin className="w-3.5 h-3.5 mt-[1px] shrink-0" style={{ color: ROYAL.gold }} />
                  <span className="min-w-0">{p.label}</span>
                </button>
              ))}
            </div>
          )}
          {placeHits !== null && placeHits.length === 0 && !searching && (
            <p className="text-[11px]" style={{ color: ROYAL.dim }}>Nothing matched that. Try a town and state.</p>
          )}

          {waypoints.length === 0 ? (
            <p className="text-[11px] leading-relaxed" style={{ color: ROYAL.dim }}>
              {form.route.length > 0
                ? `This chase already holds ${form.route.length} points of road geometry. Adding a waypoint starts the route over.`
                : "Search for a place, or turn on Draw the route and click the map — either way the stop lands in this list."}
            </p>
          ) : (
            <ol className="space-y-1">
              {waypoints.map((w, i) => (
                <li key={`${w.lon},${w.lat},${i}`}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                    style={{ border: `1px solid ${ROYAL.hairline}` }}>
                  <span className="w-5 h-5 grid place-items-center rounded-full text-[9.5px] font-bold shrink-0"
                        style={{ background: "rgba(217,183,117,0.14)", color: ROYAL.gold }}>{i + 1}</span>
                  <span className="text-[11.5px] flex-1 min-w-0 truncate" style={{ color: ROYAL.text }}>{w.label}</span>
                  <button onClick={() => applyWaypoints(swap(waypoints, i, i - 1))} disabled={i === 0}
                          aria-label={`Move ${w.label} earlier`}
                          className="px-1 leading-none text-[12px] disabled:opacity-25" style={{ color: ROYAL.dim }}>↑</button>
                  <button onClick={() => applyWaypoints(swap(waypoints, i, i + 1))} disabled={i === waypoints.length - 1}
                          aria-label={`Move ${w.label} later`}
                          className="px-1 leading-none text-[12px] disabled:opacity-25" style={{ color: ROYAL.dim }}>↓</button>
                  <button onClick={() => applyWaypoints(waypoints.filter((_, j) => j !== i))}
                          aria-label={`Remove ${w.label}`} className="px-1" style={{ color: ROYAL.dim }}>
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Tornado tracks */}
        {form.tornadoPaths.length > 0 && (
          <div className="space-y-1.5">
            {form.tornadoPaths.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-2"
                   style={{ border: `1px solid ${i === tornadoIdx && mode === "tornado" ? ROYAL.goldSoft : ROYAL.hairline}` }}>
                <button onClick={() => { setTornadoIdx(i); setMode("tornado"); }}
                        className="text-[11px] font-semibold flex items-center gap-1.5"
                        style={{ color: efColor(t.ef) }}>
                  <Tornado className="w-3.5 h-3.5" /> Track {i + 1}
                </button>
                <span className="text-[11px]" style={{ color: ROYAL.dim }}>{t.coords.length} pts</span>
                <select value={t.ef ?? ""} onChange={(e) => {
                  const paths = form.tornadoPaths.slice();
                  paths[i] = { ...t, ef: e.target.value === "" ? null : Number(e.target.value) };
                  setForm({ ...form, tornadoPaths: paths });
                }} className="bg-muted/30 border border-border rounded-md px-2 py-1 text-[11px] outline-none">
                  <option value="">Unrated</option>
                  {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>EF{n}</option>)}
                </select>
                <input value={t.label ?? ""} placeholder="Label (optional)"
                       onChange={(e) => {
                         const paths = form.tornadoPaths.slice();
                         paths[i] = { ...t, label: e.target.value };
                         setForm({ ...form, tornadoPaths: paths });
                       }}
                       className="bg-muted/30 border border-border rounded-md px-2 py-1 text-[11px] outline-none flex-1 min-w-[7rem]" />
                <button onClick={() => {
                  const paths = form.tornadoPaths.filter((_, j) => j !== i);
                  setForm({ ...form, tornadoPaths: paths });
                  setTornadoIdx(0);
                }} style={{ color: ROYAL.dim }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => {
              setForm({ ...form, tornadoPaths: [...form.tornadoPaths, { coords: [], ef: null }] });
              setTornadoIdx(form.tornadoPaths.length);
              setMode("tornado");
            }} className="text-[11px] flex items-center gap-1" style={{ color: ROYAL.gold }}>
              <Plus className="w-3 h-3" /> Another track
            </button>
          </div>
        )}

        {/* Free-form statistics */}
        <StatsEditor stats={form.stats} onChange={(stats) => setForm({ ...form, stats })} />

        <div className="grid sm:grid-cols-2 gap-2">
          <input value={form.coverUrl ?? ""} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
                 placeholder="Cover image URL (optional)" className={`${field} text-xs`} />
          <label className="flex items-center gap-2 text-xs bg-muted/20 border border-border rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={form.published}
                   onChange={(e) => setForm({ ...form, published: e.target.checked })} className="accent-primary" />
            Published — members can see it
          </label>
        </div>

        {note && <p className="text-[11.5px]" style={{ color: ROYAL.dim }}>{note}</p>}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => save(true)} disabled={busy === "save"}
                  className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: "rgba(217,183,117,0.18)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingId ? "Save & publish" : "Publish"}
          </button>
          <button onClick={() => save(false)} disabled={busy === "save"}
                  className="px-4 py-2 rounded-lg bg-muted/30 border border-border text-sm font-medium disabled:opacity-50">
            Save as draft
          </button>
        </div>
      </div>

      {/* ── the log ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Chases ({chases?.length ?? 0})</h3>
        </div>
        {chases === null ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          </div>
        ) : chases.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nothing logged yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {chases.map((c) => (
              <div key={c.id} className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold truncate">{c.title}</span>
                    {!c.published && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-400">Draft</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{c.chaseDate}</span>
                    {c.routeMiles != null && <span>{c.routeMiles} mi</span>}
                    {c.tornadoPaths.length > 0 && <span>{c.tornadoPaths.length} track{c.tornadoPaths.length === 1 ? "" : "s"}</span>}
                    {c.stats.length > 0 && <span>{c.stats.length} stat{c.stats.length === 1 ? "" : "s"}</span>}
                  </div>
                </div>
                <button onClick={() => edit(c)} className="w-8 h-8 grid place-items-center rounded-lg border border-border">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => remove(c)} disabled={busy === c.id}
                        className="w-8 h-8 grid place-items-center rounded-lg border border-border disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── clearing the log ────────────────────────────────────────────── */}
      {(chases?.length ?? 0) > 0 && (
        <div className="bg-card border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-2.5"
             style={{ borderColor: "rgba(248,113,113,0.22)" }}>
          <div className="min-w-0 sm:flex-1">
            <h3 className="text-sm font-semibold" style={{ color: "#f87171" }}>Clear the log</h3>
            <p className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>
              For starting a season fresh. There is no undo.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
          <select value={wipeYear} onChange={(e) => setWipeYear(e.target.value)}
                  className="flex-1 sm:flex-none bg-muted/30 border border-border rounded-lg px-2.5 py-2 text-xs outline-none">
            <option value="all">All chases</option>
            {years.map((y) => <option key={y} value={y}>{y} season</option>)}
          </select>
          <button onClick={wipe} disabled={busy === "wipe"}
                  className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>
            {busy === "wipe" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Clear
          </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── the drawing map ──────────────────────────────────────────────────────────

function DrawMap({
  route, tornadoPaths, mode, activeTornado, onPoint,
}: {
  route: LngLat[];
  tornadoPaths: TornadoPath[];
  mode: Mode;
  activeTornado: number;
  onPoint: (p: LngLat) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const beneath = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  // Held in refs so the click handler, registered once, always sees the current
  // mode and the current callback instead of the ones it closed over.
  //
  // `onPoint` matters as much as `mode` here. It is a useCallback keyed on the
  // parent's mode and active track, so it gets a new identity every time an
  // admin presses "Draw a tornado track" or switches track. When this effect
  // depended on it, that press tore the map down and built a new one — while
  // `ready` was still true from the old one, so the drawing effect below fired
  // straight into a style that had not loaded and MapLibre threw. That is the
  // "page errors out when I make a tornado path" crash; it also meant the map
  // was thrown away and rebuilt on every single mode toggle.
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const onPointRef = useRef(onPoint);
  onPointRef.current = onPoint;

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({
      container: box.current, style: STORMSYNC_DARK,
      center: [-98, 38], zoom: 4, attributionControl: false, dragRotate: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => { beneath.current = applyRoyalBasemap(m); setReady(true); });
    m.on("click", (e) => {
      if (!modeRef.current) return;
      onPointRef.current([Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))]);
    });
    return () => { m.remove(); map.current = null; setReady(false); };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const routeFc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: route.length > 1
        ? [{ type: "Feature", geometry: { type: "LineString", coordinates: route }, properties: {} }]
        : [],
    };
    const ptsFc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: route.map((p, i) => ({
        type: "Feature", geometry: { type: "Point", coordinates: p },
        properties: { n: i + 1 },
      })),
    };
    const trackFc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tornadoPaths.flatMap((t, i) => (t.coords.length > 1 ? [{
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: t.coords },
        properties: { colour: efColor(t.ef), active: i === activeTornado },
      }] : [])),
    };
    const trackPtsFc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tornadoPaths.flatMap((t) => t.coords.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: p },
        properties: { colour: efColor(t.ef) },
      }))),
    };

    const put = (id: string, fc: GeoJSON.FeatureCollection) => {
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc); else m.addSource(id, { type: "geojson", data: fc });
    };

    const addLayersOnce = () => {
    if (!m.getLayer("draw-route-line")) {
      m.addLayer({
        id: "draw-route-line", type: "line", source: "draw-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROYAL.gold, "line-width": 3, "line-opacity": 0.9 },
      }, beneath.current);
      m.addLayer({
        id: "draw-track-line", type: "line", source: "draw-tracks",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "colour"],
          "line-width": ["case", ["boolean", ["get", "active"], false], 5, 3],
          "line-opacity": 0.95,
        },
      }, beneath.current);
      m.addLayer({
        id: "draw-track-dots", type: "circle", source: "draw-track-points",
        paint: { "circle-radius": 3, "circle-color": ["get", "colour"], "circle-stroke-width": 1, "circle-stroke-color": "#06060e" },
      }, beneath.current);
      m.addLayer({
        id: "draw-point-dots", type: "circle", source: "draw-points",
        paint: { "circle-radius": 4, "circle-color": ROYAL.gold, "circle-stroke-width": 1.2, "circle-stroke-color": "#06060e" },
      }, beneath.current);
    }
    };

    const draw = () => {
      put("draw-route", routeFc);
      put("draw-points", ptsFc);
      put("draw-tracks", trackFc);
      put("draw-track-points", trackPtsFc);
      addLayersOnce();
    };

    // A style can report itself busy for a moment after `load` while sprites and
    // glyphs are still settling, and adding a source then throws. Deferring to
    // the next idle is the difference between a redraw that waits and an admin
    // panel that dies mid-drawing, so nothing here is allowed to escape.
    const deferred = () => { try { draw(); } catch { /* map is going away */ } };
    if (m.isStyleLoaded()) {
      try { draw(); } catch { m.once("idle", deferred); }
    } else {
      m.once("idle", deferred);
    }
  }, [ready, route, tornadoPaths, activeTornado]);

  return (
    <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: ROYAL.hairline, background: "#0b0e17" }}>
      <div ref={box} className="w-full" style={{ height: 320, cursor: mode ? "crosshair" : "grab" }} />
      {mode && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md text-[10.5px] font-semibold flex items-center gap-1.5"
             style={{ background: "rgba(8,8,18,0.88)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
          <MapPin className="w-3 h-3" />
          {mode === "route" ? "Click along the road you drove" : "Click along the tornado's path"}
        </div>
      )}
    </div>
  );
}

// ── free-form statistics ─────────────────────────────────────────────────────

function StatsEditor({ stats, onChange }: { stats: ChaseStat[]; onChange: (s: ChaseStat[]) => void }) {
  const suggestions = useMemo(
    () => ["Hail", "Peak wind", "Time on target", "Closest approach", "Structure", "Data dropped", "Fuel"],
    [],
  );
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Statistics — whatever is worth saying about this one
      </div>
      {stats.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input value={s.label} list="chase-stat-labels"
                 onChange={(e) => { const n = stats.slice(); n[i] = { ...s, label: e.target.value }; onChange(n); }}
                 placeholder="Label" className="w-2/5 bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none" />
          <input value={s.value}
                 onChange={(e) => { const n = stats.slice(); n[i] = { ...s, value: e.target.value }; onChange(n); }}
                 placeholder="Value" className="flex-1 bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none" />
          <button onClick={() => onChange(stats.filter((_, j) => j !== i))} className="px-1" style={{ color: ROYAL.dim }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <datalist id="chase-stat-labels">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <button onClick={() => onChange([...stats, { label: "", value: "" }])}
              className="text-[11px] flex items-center gap-1" style={{ color: ROYAL.gold }}>
        <Plus className="w-3 h-3" /> Add a statistic
      </button>
    </div>
  );
}

function ModeButton({
  on, onClick, icon: Icon, tint, children,
}: {
  on: boolean; onClick: () => void; icon: typeof RouteIcon; tint: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
      style={{
        background: on ? `${tint}22` : "rgba(255,255,255,0.03)",
        border: `1px solid ${on ? tint : ROYAL.hairline}`,
        color: on ? tint : ROYAL.dim,
      }}>
      {on ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

export default AdminChasesTab;
