/**
 * The Storm Chasing module.
 *
 * Score at the top, map with two pins under it, five subtabs under that. All of
 * it comes from one `chase_outlook` row the `chase-target` edge function wrote
 * this morning: the browser reads a row and draws it, which is why this opens
 * instantly instead of running a national scan on every view.
 *
 * The page it replaces ranked 59 hard-coded cities in the browser and wrote its
 * "why" from a sentence template. If the best target in America was forty miles
 * from all fifty-nine, it could not see it. Candidates now come from inside the
 * SPC risk polygons, which move every day, so any point in the country can win.
 *
 * On motion: this module is the one that gets the budget, but the rules still
 * hold. Everything checks `prefersReducedMotion()`, and `useCalm` stops all of
 * it when a warning is active for the reader's own location. A page that dances
 * while someone is under a tornado warning has its priorities wrong.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, Crosshair, ExternalLink, Loader2, CloudOff, Radio, CalendarClock,
} from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import { UsStatesBackdrop } from "../components/UsStatesBackdrop";
import { MAP_W, MAP_H, project } from "../lib/usAlbers";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";
import { useCalm } from "../lib/calm";
import type { Location } from "../hooks/useLocation";
import { TTL } from "../lib/queryClient";
import {
  fetchChaseOutlook, fetchChaseYearContext, bandFor, isStale, dateLabel, SPC_COLOR,
  type ChaseOutlook,
} from "../lib/chase";
import { TornadoPin, PinDrop, TargetLink } from "../components/chase/TornadoPin";
import { ChaseScore } from "../components/chase/ChaseScore";
import { ChaseTabs, type TabDef } from "../components/chase/ChaseTabs";
import {
  OverviewPanel, ParametersPanel, StormModePanel, BustPanel, YearlyPanel,
} from "../components/chase/ChasePanels";

type TabId = "overview" | "parameters" | "mode" | "bust" | "yearly";

const TABS: readonly TabDef<TabId>[] = [
  { id: "overview", label: "Overview", hint: "Why these two areas" },
  { id: "parameters", label: "Parameters", hint: "What the air is doing, and what it does to the storm" },
  { id: "mode", label: "Storm Mode", hint: "What kind of storms, and how fast" },
  { id: "bust", label: "Bust Probability", hint: "How this fails" },
  { id: "yearly", label: "Yearly", hint: "Against the rest of the year" },
] as const;

const RESOURCES = [
  { label: "SPC Day 1 Outlook", url: "https://www.spc.noaa.gov/products/outlook/day1otlk.html", desc: "The official categorical and probabilistic risk areas." },
  { label: "SPC Mesoanalysis", url: "https://www.spc.noaa.gov/exper/mesoanalysis/", desc: "Hourly objective analysis of every parameter on the Parameters tab." },
  { label: "NWS Watches & Warnings", url: "https://www.weather.gov/", desc: "What is actually in effect right now." },
  { label: "RadarScope", url: "https://www.radarscope.app/", desc: "The radar app most chasers run in the field." },
  { label: "Pivotal Weather", url: "https://www.pivotalweather.com/", desc: "Model soundings and forecast maps." },
  { label: "SPC Sounding Analogues", url: "https://www.spc.noaa.gov/exper/soundings/", desc: "Compare today's sounding against past events." },
];

export default function StormChasingOutlook({ location }: { location: Location }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [showResources, setShowResources] = useState(false);
  // The calm rule keys off where the READER is, not where the targets are. A
  // chaser under a warning at home should get a still page even when the day's
  // best target is six hundred miles away.
  const { calm, reason } = useCalm(location?.lat, location?.lon);
  const still = prefersReducedMotion() || calm;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["chase-outlook"],
    queryFn: fetchChaseOutlook,
    staleTime: TTL.normal,
  });

  // The year's ledger, asked for rather than read off the row.
  //
  // The row carries a copy stamped at the moment the engine ran, and the
  // Yearly tab was reading that — so with seventy days in the table the page
  // still said "16 days recorded, since Aug 26", underneath a line promising it
  // was read straight off the rows and not from memory. Any write by the
  // historical backfill made the stored copy wrong and nothing refreshed it.
  const { data: liveYear } = useQuery({
    queryKey: ["chase-year-context"],
    queryFn: fetchChaseYearContext,
    staleTime: TTL.normal,
  });

  const band = bandFor(data?.day_score ?? 0);

  return (
    <ModuleShell
      eyebrow="SPC polygons · Open-Meteo · SSWX forecast desk"
      title="Storm Chasing"
      subtitle="The day's two best targets in the country, found inside the SPC risk area and explained."
      status={data ? <Freshness o={data} /> : undefined}
      actions={
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      {calm && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12px] flex items-center gap-2"
             style={{ background: "rgba(255,77,85,0.08)", border: "1px solid rgba(255,77,85,0.3)", color: ROYAL.text }}>
          <Radio className="w-4 h-4 shrink-0" style={{ color: "#ff6b70" }} />
          Animation is paused while {reason ?? "a warning is active for your location"}.
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl p-12 text-center"
             style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" style={{ color: ROYAL.gold }} />
          <p className="text-sm" style={{ color: ROYAL.dim }}>Reading today's outlook…</p>
        </div>
      )}

      {isError && <Empty title="Could not load the outlook" body="The chase outlook could not be read. Try Refresh." />}

      {!isLoading && !isError && !data && (
        <Empty
          title="No outlook has been written yet"
          body="The chase engine runs each morning. Once it has run for the first time, the day's targets appear here."
        />
      )}

      {data && data.targets.length === 0 && (
        <Empty
          title={data.headline || "Nothing worth driving for today"}
          body={data.overview || "No candidate points scored today, which usually means SPC has no risk area out."}
        />
      )}

      {data && data.targets.length > 0 && (
        <>
          <ChaseScore
            score={Number(data.day_score)}
            label={data.day_label}
            headline={data.headline}
            still={still}
          />

          <TargetMap o={data} still={still} onPick={() => setTab("overview")} />

          <ChaseTabs tabs={TABS} active={tab} onChange={setTab} color={band.color} still={still} />

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={still ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: still ? 0.15 : 0.3, ease: EASE }}
            >
              {tab === "overview" && <OverviewPanel o={data} color={band.color} still={still} />}
              {tab === "parameters" && <ParametersPanel targets={data.targets} color={band.color} still={still} />}
              {tab === "mode" && <StormModePanel targets={data.targets} color={band.color} still={still} />}
              {tab === "bust" && <BustPanel targets={data.targets} color={band.color} still={still} />}
              {tab === "yearly" && <YearlyPanel o={data} liveYear={liveYear ?? null} color={band.color} still={still} />}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      {/* Resources stay available but out of the way — they are not the module. */}
      <div className="rounded-2xl overflow-hidden"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <button
          onClick={() => setShowResources((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold"
          style={{ color: ROYAL.text, fontFamily: HEADING }}
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4" style={{ color: ROYAL.gold }} /> Chaser resources
          </span>
          <span className="text-xs" style={{ color: ROYAL.dim }}>{showResources ? "Hide" : "Show"}</span>
        </button>
        <AnimatePresence>
          {showResources && (
            <motion.div
              initial={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={still ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 pt-0">
                {RESOURCES.map((r) => (
                  <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
                     className="rounded-xl p-3 flex items-start gap-2 transition-colors"
                     style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}` }}>
                    <ExternalLink className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ROYAL.gold }} />
                    <div>
                      <div className="text-sm font-semibold" style={{ color: ROYAL.text }}>{r.label}</div>
                      <div className="text-[11px]" style={{ color: ROYAL.dim }}>{r.desc}</div>
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-[11px] leading-relaxed px-1" style={{ color: ROYAL.dim }}>
        This is decision support, not a substitute for official SPC outlooks, watches and warnings. Targets are
        computed from model data and can be wrong; the bust probability on every target exists because sometimes
        they are. Chase safe, chase with a partner, and never let a forecast talk you into a road you would not
        otherwise drive.
      </p>
    </ModuleShell>
  );
}

/** Where the row came from and when, stated plainly rather than implied. */
function Freshness({ o }: { o: ChaseOutlook }) {
  const stale = isStale(o);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]"
          style={{ color: stale ? "#e8bb4d" : ROYAL.dim }}>
      <CalendarClock className="w-3 h-3" />
      {stale ? `Last run ${dateLabel(o.outlook_date)}` : dateLabel(o.outlook_date)}
      {o.status !== "ok" && <span style={{ color: "#ff8a3d" }}> · reasoning unavailable</span>}
    </span>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl p-10 text-center"
         style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <CloudOff className="w-8 h-8 mx-auto mb-2.5" style={{ color: ROYAL.dim }} />
      <p className="text-base font-bold" style={{ color: ROYAL.text, fontFamily: HEADING }}>{title}</p>
      <p className="text-sm mt-1.5 max-w-md mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>{body}</p>
    </div>
  );
}

/**
 * The map.
 *
 * The SPC categorical shading is not drawn here — the polygons are not in the
 * row and re-fetching them client side would put a second source of truth on
 * the page. What is drawn is the country, the two targets, and the distance
 * between them, which is what the two pins are actually for.
 */
function TargetMap({
  o, still, onPick,
}: { o: ChaseOutlook; still: boolean; onPick: () => void }) {
  const band = bandFor(Number(o.day_score));

  const pts = useMemo(
    () => o.targets.map((t) => ({ t, p: project(t.lon, t.lat) })),
    [o.targets],
  );

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
           style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
        <h3 className="text-sm font-bold flex items-center gap-1.5"
            style={{ fontFamily: HEADING, color: ROYAL.text }}>
          <Crosshair className="w-4 h-4" style={{ color: band.color }} /> Today's targets
        </h3>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: ROYAL.dim }}>
          {o.source?.spc_max_category && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: SPC_COLOR[o.source.spc_max_category] ?? ROYAL.dim }} />
              SPC {o.source.spc_category_name}
            </span>
          )}
          {o.source?.candidates_scored != null && (
            <span>{o.source.candidates_scored} points scored</span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`}
           style={{ width: "100%", height: "auto", display: "block", background: "#080814" }}
           role="img" aria-label={`Map of the United States showing ${o.targets.length} chase targets`}>
        <UsStatesBackdrop />

        {pts.length === 2 && (
          <TargetLink
            x1={pts[0].p.x} y1={pts[0].p.y} x2={pts[1].p.x} y2={pts[1].p.y}
            color={ROYAL.iris} still={still}
          />
        )}

        {/* Secondary first, so the primary always draws on top of it. */}
        {pts.slice().reverse().map(({ t, p }) => (
          <PinDrop key={t.rank} delay={still ? 0 : t.rank === 1 ? 0.55 : 0.35} still={still}>
            <TornadoPin
              x={p.x} y={p.y}
              color={t.rank === 1 ? band.color : ROYAL.iris}
              primary={t.rank === 1}
              label={t.place}
              still={still}
              size={t.rank === 1 ? 1.15 : 1}
              onClick={onPick}
            />
          </PinDrop>
        ))}
      </svg>

      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px]"
           style={{ borderTop: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: band.color }} />
          Best target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: ROYAL.iris, opacity: 0.6 }} />
          Alternative
        </span>
        <span>Held at least 200 km apart so they are two chases, not one.</span>
      </div>
    </div>
  );
}
