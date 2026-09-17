/**
 * The season, scrubbed.
 *
 * This is the closest honest thing to the foliage maps people mean when they
 * ask for one — smokymountains.com, explorefall.com, the Almanac's — and the
 * important word is "honest", because those are proprietary models and nothing
 * public reproduces them. What they get right, and what is worth taking, is the
 * INTERACTION: a date under your thumb, and the turn moving across the country
 * as you drag it.
 *
 * So the drag is here and the model is not. Every dot is one observation: one
 * species, at one site, on the day its first coloured leaves were recorded.
 * Dragging the date shows them accumulating. Nothing is interpolated between
 * them, nothing is shaded by state, and nothing is projected past today.
 *
 * The reasoning — including the regression and the state choropleth that were
 * both built against the live record and thrown away, with the numbers that
 * condemned them — is in `lib/foliage.ts` above `foliageTimeline`. The short
 * version: the public signal is "first coloured leaves" reported by volunteers,
 * so it fires weeks before peak and is set by which species a site happens to
 * monitor. Aggregate it and you are mapping the observers.
 *
 * Two details that matter to how it reads:
 *
 *   • A dot brightens for the fortnight after it turns and then settles. So the
 *     leading edge of the season glows and the ground already covered stays
 *     visible behind it — the wave is legible without anything being invented
 *     to make it so.
 *
 *   • Playback steps the scrubber rather than tweening. Frames are three days
 *     apart because that is the resolution the record supports, and smoothing
 *     between them would draw days nobody observed.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw } from "lucide-react";
import { AlbersPanZoom } from "../map/AlbersPanZoom";
import { UsStatesBackdrop } from "../UsStatesBackdrop";
import { MAP_W, MAP_H, project } from "../../lib/usAlbers";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { leafColour, foliageTimeline, type FoliageReport } from "../../lib/foliage";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pretty = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const MS_DAY = 86_400_000;
const days = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_DAY);

/** Three days a frame, so a full season plays in about ten seconds. */
const FRAME_MS = 240;
/** How long a new report stays lit. */
const FRESH_DAYS = 14;

interface Placed { id: string; x: number; y: number; date: string; label: string }

export const FoliageProgress = memo(function FoliageProgress({
  report, still, height = 460,
}: { report: FoliageReport; still: boolean; height?: number }) {
  const timeline = useMemo(() => foliageTimeline(report), [report]);
  const [idx, setIdx] = useState(() => Math.max(0, timeline.length - 1));
  const [playing, setPlaying] = useState(false);

  // A refetch that lengthens the season should land on today rather than
  // wherever the old index happened to point.
  useEffect(() => { setIdx(Math.max(0, timeline.length - 1)); }, [timeline]);

  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIdx((i) => {
        if (i >= timeline.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, still ? FRAME_MS * 2 : FRAME_MS);
    timer.current = id;
    return () => window.clearInterval(id);
  }, [playing, timeline.length, still]);

  const date = timeline[Math.min(idx, timeline.length - 1)] ?? report.seasonEnd;
  const atEnd = idx >= timeline.length - 1;

  // Projected once. The scrubber then only filters, which is what keeps a drag
  // across two hundred frames from reprojecting several thousand points.
  const placed = useMemo<Placed[]>(
    () => report.sites.map((s) => {
      const p = project(s.lon, s.lat);
      return {
        id: s.id,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        date: s.date,
        label: `${s.species} — ${s.state || "site"} — first colour ${s.date}`,
      };
    }),
    [report.sites],
  );

  const shown = useMemo(() => placed.filter((p) => p.date <= date), [placed, date]);
  const fresh = useMemo(
    () => shown.filter((p) => days(date, p.date) <= FRESH_DAYS).length,
    [shown, date],
  );

  // The onset histogram doubles as the scrubber's own scale — the bars say
  // where in the season the busy weeks were, and the handle sits among them.
  const peakWeek = useMemo(
    () => report.weeks.reduce((m, w) => Math.max(m, w.sites), 1),
    [report.weeks],
  );

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: ROYAL.ink, border: `1px solid ${ROYAL.hairline}` }}>

      {/*
        `overflow-hidden` is load-bearing, not tidiness. AlbersPanZoom lays its
        SVG out to the 975x610 viewBox and lets it spill; with controls sitting
        underneath, the map ran straight over the scrubber and the caption and
        made both unreadable. Clipping here is what gives the control block a
        floor to stand on.
      */}
      <div className="relative overflow-hidden" style={{ height }}>
        <AlbersPanZoom width={MAP_W} height={MAP_H} maxZoom={10} className="w-full h-full"
                       ariaLabel={`Sites reporting first colour up to ${pretty(date)}`}>
          {(k) => (
            <>
              <UsStatesBackdrop labels={false} />
              <g>
                {shown.map((p) => {
                  const age = days(date, p.date);
                  const isFresh = age <= FRESH_DAYS;
                  const c = leafColour(age);
                  return (
                    <g key={p.id}>
                      {isFresh && (
                        <circle cx={p.x} cy={p.y} r={7 / k} fill={c}
                                fillOpacity={0.22 * (1 - age / FRESH_DAYS) + 0.06} />
                      )}
                      <circle
                        cx={p.x} cy={p.y} r={(isFresh ? 3.5 : 2.6) / k}
                        fill={c} fillOpacity={isFresh ? 0.98 : 0.72}
                        stroke="#05060d" strokeWidth={0.8 / k}
                      >
                        <title>{p.label}</title>
                      </circle>
                    </g>
                  );
                })}
              </g>
            </>
          )}
        </AlbersPanZoom>

        <motion.div
          key={date}
          initial={still ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="absolute top-3 left-3 px-3 py-1.5 rounded-xl pointer-events-none"
          style={{ background: "rgba(6,6,14,0.82)", border: `1px solid ${ROYAL.hairline}` }}
        >
          <div className="text-[15px] font-bold tabular-nums" style={{ fontFamily: HEADING, color: ROYAL.gold }}>
            {pretty(date)}
            <span className="text-[11px] font-normal ml-1.5" style={{ color: ROYAL.dim }}>
              {date.slice(0, 4)}
            </span>
          </div>
          <div className="text-[10.5px] tabular-nums" style={{ color: ROYAL.dim }}>
            {shown.length.toLocaleString()} turned · {fresh.toLocaleString()} in the last fortnight
          </div>
        </motion.div>
      </div>

      {/* ── the scrubber ──────────────────────────────────────────────────── */}
      <div className="px-3 py-3 space-y-2" style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>

        {/* Onsets per week, as the scrubber's backdrop. */}
        <div className="flex items-end gap-[2px] h-8 px-[18px]" aria-hidden>
          {report.weeks.map((w) => {
            const passed = w.start <= date;
            return (
              <div key={w.start} className="flex-1 rounded-t-[2px]"
                   style={{
                     height: `${Math.max(6, (w.sites / peakWeek) * 100)}%`,
                     background: passed ? ROYAL.gold : "rgba(204,204,255,0.13)",
                     opacity: passed ? 0.75 : 1,
                     transition: still ? "none" : "background 200ms linear",
                   }}
                   title={`week of ${w.label}: ${w.sites} first-colour reports`} />
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (atEnd) { setIdx(0); setPlaying(true); } else setPlaying((p) => !p); }}
            aria-label={playing ? "Pause" : atEnd ? "Replay the season" : "Play the season"}
            className="w-9 h-9 shrink-0 rounded-full grid place-items-center transition-transform active:scale-95"
            style={{ background: ROYAL.gold, color: "#120f1e" }}
          >
            {playing ? <Pause className="w-4 h-4" />
              : atEnd ? <RotateCcw className="w-4 h-4" />
              : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <input
            type="range"
            min={0} max={Math.max(0, timeline.length - 1)} step={1}
            value={Math.min(idx, timeline.length - 1)}
            onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
            aria-label="Date in the season"
            aria-valuetext={pretty(date)}
            className="flex-1 sx-scrub"
          />

          <span className="text-[10.5px] tabular-nums shrink-0 w-24 text-right" style={{ color: ROYAL.dim }}>
            {pretty(report.seasonStart)} → {pretty(report.seasonEnd)}
          </span>
        </div>

        <p className="text-[10.5px] leading-relaxed" style={{ color: ROYAL.dim }}>
          <strong style={{ color: ROYAL.text }}>The season replayed, not forecast.</strong>{" "}
          Each dot is a single observation — one species, one site, the day its first coloured
          leaves were recorded — brightening for a fortnight and then settling. Nothing is
          interpolated between them and nothing runs past today: there is no public fall-foliage
          forecast to extend it with, and the observational record is an onset signal that fires
          weeks before peak.
        </p>
      </div>
    </div>
  );
});
