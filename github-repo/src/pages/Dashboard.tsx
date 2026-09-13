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
 *   • Every reading comes from data this page already fetched — one Open-Meteo
 *     request and one NWS alerts request for the member's location. Forty tiles
 *     fetching their own module's data would be forty requests to open a page
 *     nobody has asked a question of yet. Where the shared data cannot answer,
 *     the tile says "Open the module" rather than showing an invented number;
 *     the reasoning is in `lib/dashboardModules.ts`.
 *
 * Locked modules are absent rather than shown greyed. The sidebar is where a
 * member discovers what they could buy — it deliberately shows locked rows —
 * and duplicating that here would turn a working instrument into a shop.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { LayoutGrid, AlertTriangle, MapPin } from "lucide-react";
import { useOpenMeteo, useNWSAlerts } from "../hooks/useWeatherQuery";
import { useAuth, hasModuleAccess } from "../hooks/useAuth";
import { hourIndexNow } from "../lib/currentHour";
import type { Location } from "../hooks/useLocation";
import { ModuleShell } from "../components/ModuleShell";
import { ModuleTile } from "../components/dashboard/ModuleTile";
import { MODULE_TILES, TILE_SECTIONS, type TileContext } from "../lib/dashboardModules";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

interface Props { location: Location }

export default function Dashboard({ location }: Props) {
  const { user } = useAuth();
  const still = prefersReducedMotion();
  const wx = useOpenMeteo(location);
  const alertsQ = useNWSAlerts(location);

  // Only what they own. `hasModuleAccess` is the same gate the router uses, so
  // a tile can never open something the member would be refused.
  const mine = useMemo(
    () => MODULE_TILES.filter((t) => hasModuleAccess(user, t.path)),
    [user],
  );

  const ctx: TileContext = useMemo(() => ({
    wx: wx.data ?? null,
    alerts: (alertsQ.data ?? []) as TileContext["alerts"],
    // `hourIndexNow` takes the whole response, not the time array — it needs
    // `utc_offset_seconds` to compare against local time rather than UTC, which
    // is the difference between "now" and "now, seven hours ago".
    hour: wx.data?.hourly?.time?.length ? hourIndexNow(wx.data) : -1,
    now: new Date(),
  }), [wx.data, alertsQ.data]);

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

  const sections = useMemo(
    () => TILE_SECTIONS
      .map((label) => ({ label, tiles: mine.filter((t) => t.section === label) }))
      .filter((s) => s.tiles.length > 0),
    [mine],
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
