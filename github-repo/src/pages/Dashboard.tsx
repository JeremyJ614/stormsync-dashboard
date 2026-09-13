/**
 * The Dashboard — a wall of the modules you actually own.
 *
 * REBUILT, and mostly by deletion. What was here was a second forecast page:
 * a conditions hero, a stat grid, a wind compass, seven-day temperature and
 * precipitation charts, an NWS office card, a widget-arranging drawer. All of
 * it good, none of it a dashboard, and all of it one tap from the Daily Brief,
 * which does the same job better and is the module built for it.
 *
 * A dashboard's question is not "what is the weather" — the app has eight
 * answers to that. It is WHERE SHOULD I LOOK TODAY, across everything the
 * member has. So the page is now exactly that and nothing else: one tile per
 * module, only the modules they have unlocked, each carrying a live figure
 * where the shared data can supply one.
 *
 * Two properties do the work:
 *
 *   • Tiles are unequal. Most sit quiet. The ones with something to say carry
 *     it at display size, and the ones worth acting on light their rail. You
 *     should be able to open this and know where to look without reading.
 *
 *   • Every tile carries a real figure, and a module with nothing to say is not
 *     on the wall. The first cut put every unlocked module up and let two
 *     thirds of them read "Open the module", which is a navigation menu wearing
 *     a dashboard's clothes — and the sidebar is already a better navigation
 *     menu. A tile earns its place by measuring something.
 *
 *   • The readings come from four shared sources, not forty: the forecast, the
 *     alerts, one air-quality request and the model-run list. Forty tiles each
 *     fetching their own module's data would be forty requests to open a page
 *     nobody has asked a question of yet. Nothing is invented where a source
 *     cannot answer; the reasoning is in `lib/dashboardModules.ts`.
 *
 * Locked modules are absent rather than shown greyed. The sidebar is where a
 * member discovers what they could buy — it deliberately shows locked rows —
 * and duplicating that here would turn a working instrument into a shop.
 *
 *   • It is arrangeable again. The first rebuild dropped the old layout drawer
 *     along with the widgets it arranged, and that was a mistake: a dashboard
 *     is the one page whose whole job is to put what THIS person looks at where
 *     they look first, and no default order can know that. Customize turns the
 *     wall into a set of movable plates; the arrangement is per member, per
 *     device, and a module they have never seen appears in its default place
 *     rather than arriving hidden.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, AlertTriangle, MapPin, SlidersHorizontal, Check, RotateCcw } from "lucide-react";
import { useOpenMeteo, useNWSAlerts } from "../hooks/useWeatherQuery";
import { listRuns } from "../lib/modelRuns";
import { useAuth, hasModuleAccess } from "../hooks/useAuth";
import { hourIndexNow } from "../lib/currentHour";
import type { Location } from "../hooks/useLocation";
import { ModuleShell } from "../components/ModuleShell";
import { ModuleTile, HiddenChip } from "../components/dashboard/ModuleTile";
import { MODULE_TILES, TILE_SECTIONS, type TileContext } from "../lib/dashboardModules";
import {
  loadPrefs, savePrefs, clearPrefs, arrange, move, type DashboardPrefs,
} from "../lib/dashboardPrefs";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

interface Props { location: Location }

export default function Dashboard({ location }: Props) {
  const { user } = useAuth();
  const still = prefersReducedMotion();
  const wx = useOpenMeteo(location);
  const alertsQ = useNWSAlerts(location);

  /*
   * Two shared sources beyond the forecast, and no more.
   *
   * Air quality buys the AQI tile and the UV clause on daylight; the run list
   * buys the Model Runs tile. Both are ordinary react-query entries, so the
   * modules they belong to reuse the cached response rather than fetching it
   * again when the member opens one. Neither blocks the wall — a tile whose
   * source has not arrived simply has no reading yet.
   */
  const air = useQuery({
    queryKey: ["dash-air", location.lat.toFixed(3), location.lon.toFixed(3)],
    queryFn: async () => {
      const u = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
      u.searchParams.set("latitude", location.lat.toFixed(4));
      u.searchParams.set("longitude", location.lon.toFixed(4));
      u.searchParams.set("hourly", "us_aqi,uv_index");
      u.searchParams.set("timezone", "auto");
      u.searchParams.set("forecast_days", "2");
      const r = await fetch(u.toString());
      if (!r.ok) throw new Error(`air quality ${r.status}`);
      return r.json();
    },
    staleTime: 30 * 60 * 1000, retry: 1,
  });

  const runs = useQuery({
    queryKey: ["dash-runs"],
    queryFn: async () => {
      const all = await Promise.all(
        (["hrrr", "gfs", "href"] as const).map((m) => listRuns(m, 1).catch(() => [])));
      return all.flat().sort((a, b) => b.cycle.localeCompare(a.cycle));
    },
    staleTime: 15 * 60 * 1000, retry: 1,
  });

  // Only what they own. `hasModuleAccess` is the same gate the router uses, so
  // a tile can never open something the member would be refused.
  const mine = useMemo(
    () => MODULE_TILES.filter((t) => hasModuleAccess(user, t.path)),
    [user],
  );

  // The member's arrangement. Read once on mount rather than on every render —
  // localStorage is synchronous and this page re-renders on every forecast
  // refresh, and a synchronous read inside a render is how a fast page stops
  // being one.
  const [editing, setEditing] = useState(false);
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => loadPrefs(user?.id ?? null));

  const apply = (next: DashboardPrefs) => {
    setPrefs(next);
    savePrefs(user?.id ?? null, next);
  };

  const { shown, hidden } = useMemo(() => arrange(mine, prefs), [mine, prefs]);

  /*
   * Reordering works on the FULL arrangement, not on the visible subset.
   *
   * If it worked on what is on screen, moving a tile past a hidden one would
   * silently jump it two places — and then un-hiding that tile would drop it
   * somewhere the member never put it. So the order is materialised first, with
   * every tile in it, and the move happens there.
   */
  const reorder = (path: string, delta: number) => {
    const full = [...shown, ...hidden].map((t) => t.path);
    const current = prefs.order.length ? prefs.order.filter((p) => full.includes(p)) : full;
    for (const p of full) if (!current.includes(p)) current.push(p);
    apply({ ...prefs, order: move(current, path, delta) });
  };

  const ctx: TileContext = useMemo(() => ({
    wx: wx.data ?? null,
    alerts: (alertsQ.data ?? []) as TileContext["alerts"],
    air: air.data ?? null,
    runs: (runs.data ?? []) as TileContext["runs"],
    // `hourIndexNow` takes the whole response, not the time array — it needs
    // `utc_offset_seconds` to compare against local time rather than UTC, which
    // is the difference between "now" and "now, seven hours ago".
    hour: wx.data?.hourly?.time?.length ? hourIndexNow(wx.data) : -1,
    now: new Date(),
  }), [wx.data, alertsQ.data, air.data, runs.data]);

  // Read once per render pass rather than inside each tile, so the ordering
  // below and the tile itself cannot disagree about what a module says.
  const readings = useMemo(
    () => new Map(mine.map((t) => [t.path, t.read ? (t.read(ctx) ?? null) : null])),
    [mine, ctx],
  );

  const live = useMemo(
    () => [...readings.values()].filter((r) => r && r.tone && r.tone !== "quiet").length,
    [readings],
  );

  /*
   * Sections stay, and ordering happens INSIDE them.
   *
   * Dropping the headers when somebody customises would mean the page they
   * arranged is not the page they were looking at, and the headings are most of
   * what makes twenty tiles scannable. A member cannot move a tile from one
   * section to another, which is the one cost, and it is worth it: "Severe
   * Weather" is a real grouping rather than a default somebody has to undo.
   */
  const sections = useMemo(
    () => TILE_SECTIONS
      .map((label) => ({ label, tiles: shown.filter((t) => t.section === label) }))
      .filter((s) => s.tiles.length > 0),
    [shown],
  );

  let n = 0;   // running index across sections, so the stagger reads as one sweep

  return (
    <ModuleShell
      eyebrow="StormSync · Your modules"
      title="Dashboard"
      subtitle={`Every module you have, reading live where it can. ${location.name}.`}
      wide
      status={
        <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: ROYAL.dim }}>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ border: `1px solid ${ROYAL.hairline}` }}>
            <LayoutGrid className="w-3 h-3" /> {mine.length} modules
          </span>
          {live > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{ border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
              <AlertTriangle className="w-3 h-3" /> {live} worth a look
            </span>
          )}
          <span className="flex items-center gap-1.5 ml-auto">
            <MapPin className="w-3 h-3" />
            {wx.isLoading ? "reading conditions…"
              : wx.isError ? "conditions unavailable — tiles show names only"
              : location.name}
          </span>
        </div>
      }
    >
      {mine.length === 0 ? (
        <div className="rounded-2xl px-6 py-14 text-center"
             style={{ border: `1px solid ${ROYAL.hairline}`, background: ROYAL.panel }}>
          <LayoutGrid className="w-7 h-7 mx-auto mb-3" style={{ color: ROYAL.goldSoft }} />
          <h2 className="text-base font-semibold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            Nothing unlocked yet
          </h2>
          <p className="mt-1.5 text-sm max-w-sm mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>
            Your modules appear here as tiles the moment they are part of your plan. The sidebar shows
            everything the app can do in the meantime.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((s, si) => (
            <section key={s.label} className="space-y-2">
              <motion.div
                initial={still ? { opacity: 0 } : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: still ? 0.2 : 0.4, delay: si * 0.05, ease: EASE }}
                className="flex items-center gap-2.5"
              >
                <span className="text-[10px] uppercase tracking-[0.26em] shrink-0"
                      style={{ color: ROYAL.gold }}>{s.label}</span>
                <span aria-hidden className="flex-1 h-px"
                      style={{ background: `linear-gradient(90deg, ${ROYAL.goldSoft}, transparent)` }} />
                <span className="text-[10px] tabular-nums shrink-0" style={{ color: ROYAL.dim }}>
                  {s.tiles.length}
                </span>
              </motion.div>

              <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {s.tiles.map((t) => (
                  <ModuleTile
                    key={t.path}
                    tile={t}
                    reading={readings.get(t.path) ?? null}
                    still={still}
                    index={n++}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
