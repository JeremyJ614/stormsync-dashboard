import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Check, Loader2, MapPin, Pencil, Plus, Route as RouteIcon, Save, Tornado,
  Trash2, Undo2, X, Zap,
} from "lucide-react";
import {
  listChases, createChase, updateChase, deleteChase, snapRoute, haversineMiles,
  efColor, type Chase, type ChaseInput, type ChaseStat, type LngLat, type TornadoPath,
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
 */
type Mode = "route" | "tornado" | null;

const BLANK: ChaseInput = {
  title: "", chaseDate: new Date().toISOString().slice(0, 10), summary: "",
  route: [], tornadoPaths: [], stats: [], published: false,
};

export function AdminChasesTab() {
  const [chases, setChases] = useState<Chase[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChaseInput>(BLANK);
  const [mode, setMode] = useState<Mode>(null);
  const [tornadoIdx, setTornadoIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => { void listChases().then(setChases).catch(() => setChases([])); }, []);
  useEffect(() => { load(); }, [load]);

  function reset() {
    setEditingId(null); setForm(BLANK); setMode(null); setTornadoIdx(0); setNote(null);
  }

  function edit(c: Chase) {
    setEditingId(c.id);
    setForm({
      title: c.title, chaseDate: c.chaseDate, summary: c.summary ?? "",
      route: c.route, routeMiles: c.routeMiles, routeSnapped: c.routeSnapped,
      tornadoPaths: c.tornadoPaths, stats: c.stats, coverUrl: c.coverUrl,
      media: c.media, published: c.published, sortOrder: c.sortOrder,
    });
    setMode(null); setTornadoIdx(0); setNote(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const addPoint = useCallback((p: LngLat) => {
    setForm((f) => {
      if (mode === "route") return { ...f, route: [...f.route, p], routeSnapped: false };
      if (mode === "tornado") {
        const paths = f.tornadoPaths.slice();
        if (!paths[tornadoIdx]) paths[tornadoIdx] = { coords: [], ef: null };
        paths[tornadoIdx] = { ...paths[tornadoIdx], coords: [...paths[tornadoIdx].coords, p] };
        return { ...f, tornadoPaths: paths };
      }
      return f;
    });
  }, [mode, tornadoIdx]);

  function undoPoint() {
    setForm((f) => {
      if (mode === "route") return { ...f, route: f.route.slice(0, -1), routeSnapped: false };
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
          onPoint={addPoint}
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
            {form.routeMiles != null && ` · ${form.routeMiles} mi`}
            {form.routeSnapped && " · snapped"}
          </span>
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
  // Held in a ref so the click handler, registered once, always sees the
  // current mode instead of the one it closed over.
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;

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
      onPoint([Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))]);
    });
    return () => { m.remove(); map.current = null; };
  }, [onPoint]);

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
    put("draw-route", routeFc);
    put("draw-points", ptsFc);
    put("draw-tracks", trackFc);
    put("draw-track-points", trackPtsFc);

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
