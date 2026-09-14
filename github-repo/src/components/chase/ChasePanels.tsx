/**
 * The five subtab bodies: Overview, Parameters, Storm Mode, Bust and Yearly.
 *
 * They share one rule. Anything the AI wrote is shown as prose and attributed;
 * anything computed is shown as a number with its units and its plain-language
 * read next to it. A reader should never have to guess which half they are
 * looking at, because only one of the two halves is reproducible.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import {
  Brain, MapPin, Clock, Sun, Mountain, Wind, CloudHail, Tornado,
  TriangleAlert, Trophy, Gauge, ChevronRight, Sparkles,
} from "lucide-react";
import {
  PARAM_GROUPS, fillFor, betterOf, bustBand, compass, hourLabel,
  YEARLY_MEANING, bandFor, SPC_COLOR,
  type ChaseTarget, type ChaseOutlook, type ChaseYearContext, type ParamRow,
} from "../../lib/chase";
import { ROYAL, HEADING, EASE, SPRING } from "../../lib/royal";

const rise = (i: number, still: boolean) => ({
  initial: still ? { opacity: 0 } : { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: still ? 0.2 : 0.45, delay: still ? 0 : i * 0.07, ease: EASE },
});

function TargetChip({ t, color }: { t: ChaseTarget; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
          style={{ background: `${color}1e`, border: `1px solid ${color}55`, color }}>
      <span className="w-4 h-4 rounded grid place-items-center text-[9px] font-black"
            style={{ background: color, color: "#0d0d18" }}>{t.rank}</span>
      {t.place}
    </span>
  );
}

function AiNote({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: `${color}0d`, border: `1px solid ${color}2e` }}>
      <div className="text-[10px] uppercase tracking-[0.24em] font-bold flex items-center gap-1.5 mb-1.5"
           style={{ color }}>
        <Brain className="w-3 h-3" /> SSWX forecast desk
      </div>
      <div className="text-sm leading-relaxed" style={{ color: ROYAL.text }}>{children}</div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
export const OverviewPanel = memo(function OverviewPanel({
  o, color, still,
}: { o: ChaseOutlook; color: string; still: boolean }) {
  const src = o.source ?? {};
  return (
    <div className="space-y-3">
      <motion.div {...rise(0, still)}>
        <AiNote color={color}>{o.overview || "No reasoning was written for today."}</AiNote>
      </motion.div>

      <motion.div {...rise(1, still)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {o.targets.map((t) => {
          const b = bandFor(t.score / 10);
          return (
            <div key={t.rank} className="rounded-2xl p-4"
                 style={{ background: ROYAL.panel, border: `1px solid ${t.rank === 1 ? color + "4d" : ROYAL.hairline}` }}>
              <div className="flex items-start gap-2.5 mb-2">
                <span className="w-7 h-7 rounded-lg grid place-items-center text-sm font-black shrink-0"
                      style={{ background: t.rank === 1 ? color : ROYAL.hairline, color: t.rank === 1 ? "#0d0d18" : ROYAL.dim }}>
                  {t.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-base leading-tight flex items-center gap-1.5"
                       style={{ fontFamily: HEADING, color: ROYAL.text }}>
                    <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
                    {t.place}
                  </div>
                  <div className="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5"
                       style={{ color: ROYAL.dim }}>
                    {t.spc_category && (
                      <span style={{ color: SPC_COLOR[t.spc_category] ?? ROYAL.dim }}>
                        SPC {t.spc_category_name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> peak {hourLabel(t.peak_hour)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Sun className="w-3 h-3" /> {t.hours_to_sunset > 0 ? `${t.hours_to_sunset}h light` : "after dark"}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-black tabular-nums leading-none" style={{ color: b.color }}>
                    {Math.round(t.score)}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>score</div>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: ROYAL.text }}>{t.why}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Stat label="CAPE" value={t.params.cape.toLocaleString()} unit="J/kg" />
                <Stat label="Shear" value={String(t.params.shear_06_kt)} unit="kt" />
                <Stat label="SRH" value={String(t.params.srh_03)} unit="m²/s²" />
                <Stat label="Terrain" value={String(t.terrain_score)} unit="/100" />
              </div>
            </div>
          );
        })}
      </motion.div>

      {o.tips.length > 0 && (
        <motion.div {...rise(2, still)} className="rounded-2xl p-4"
                    style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2.5 flex items-center gap-1.5"
              style={{ color: ROYAL.gold }}>
            <Sparkles className="w-3.5 h-3.5" /> If you are going
          </h3>
          <ul className="space-y-1.5">
            {o.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed" style={{ color: ROYAL.text }}>
                <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ROYAL.gold }} />
                {tip}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {o.safety && (
        <motion.div {...rise(3, still)} className="rounded-2xl p-4 flex gap-3"
                    style={{ background: "rgba(255,77,85,0.07)", border: "1px solid rgba(255,77,85,0.3)" }}>
          <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ff6b70" }} />
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] font-bold mb-1" style={{ color: "#ff6b70" }}>
              Safety
            </div>
            <p className="text-sm leading-relaxed" style={{ color: ROYAL.text }}>{o.safety}</p>
          </div>
        </motion.div>
      )}

      <motion.div {...rise(4, still)}
                  className="rounded-xl px-3.5 py-3 text-[11px] leading-relaxed"
                  style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        <strong style={{ color: ROYAL.text }}>How these were found.</strong>{" "}
        {src.candidate_source === "national-fallback"
          ? `SPC has no risk area out today, so a coarse ${src.grid_step_deg}° grid was run over the whole country instead of the usual polygon fill.`
          : `Candidate points were generated inside today's SPC risk polygons on a ${src.grid_step_deg}° grid.`}{" "}
        {src.candidates_generated?.toLocaleString()} points were generated, {src.candidates_scanned} were scanned
        against model data, and {src.candidates_scored} returned a usable sounding. The two picks are held at least
        200 km apart so they are two chases rather than one.
        {o.model ? ` The reasoning was written by ${o.model} from those computed candidates; it chose among them and never located them itself.` : " No AI key is configured, so the reasoning below is deterministic."}
      </motion.div>
    </div>
  );
});

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <span className="px-2 py-1 rounded-lg text-[11px]"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${ROYAL.hairline}` }}>
      <span style={{ color: ROYAL.dim }}>{label} </span>
      <span className="font-bold tabular-nums" style={{ color: ROYAL.text }}>{value}</span>
      <span style={{ color: ROYAL.dim }}> {unit}</span>
    </span>
  );
}

// ─── Parameters ──────────────────────────────────────────────────────────────
/**
 * Parameters — what the air is doing, and what it does to the storm.
 *
 * WAS "ATMOSPHERE", AND WAS A TABLE.
 * Twenty-seven rows in a three-column grid, each with two numbers, two
 * progress bars and a two-word label, packed at 10 and 13 pixels. It reported
 * everything and explained nothing: "Loaded" means nothing to anyone who does
 * not already know what loaded does, and a page that only tells experts what
 * they already know has no reason to exist.
 *
 * So each row now ends in a sentence about the STORM rather than the number —
 * for a good value and a bad one, because the reason a day busts is usually one
 * row on this page reading badly with nothing saying why that matters.
 *
 * And the two targets share one track instead of owning a bar each. Two bars
 * side by side make you compare lengths across a gap; two markers on one scale
 * put the difference in front of you as a distance, which is the entire point
 * of a comparison. It is also half the ink.
 */
export const ParametersPanel = memo(function ParametersPanel({
  targets, color, still,
}: { targets: ChaseTarget[]; color: string; still: boolean }) {
  const [a, b] = targets;
  if (!a) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-[11px]" style={{ color: ROYAL.dim }}>Comparing</span>
        <TargetChip t={a} color={color} />
        {b && <><span className="text-[11px]" style={{ color: ROYAL.dim }}>against</span><TargetChip t={b} color={ROYAL.iris} /></>}
      </div>

      {PARAM_GROUPS.map((g, gi) => (
        <motion.section key={g.title} {...rise(gi, still)}
          className="relative rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${ROYAL.hairline}`,
            background: "linear-gradient(180deg, rgba(18,18,34,0.72), rgba(10,10,22,0.72))",
          }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
          <div className="px-4 py-3.5" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
            <h3 className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>{g.title}</h3>
            <p className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>{g.blurb}</p>
          </div>
          <div>
            {g.rows.map((row, ri) => (
              <ParamLine key={row.key as string} row={row} a={a} b={b} color={color}
                         last={ri === g.rows.length - 1} still={still} index={ri} />
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  );
});

const fmtVal = (v: number) =>
  Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100);

function ParamLine({
  row, a, b, color, last, still, index,
}: {
  row: ParamRow; a: ChaseTarget; b?: ChaseTarget; color: string;
  last: boolean; still: boolean; index: number;
}) {
  const va = a.params[row.key];
  const vb = b ? b.params[row.key] : undefined;
  const win = vb !== undefined ? betterOf(row, va, vb) : -1;
  const effect = row.effect(va);

  return (
    <div className="px-4 py-3.5" style={last ? undefined : { borderBottom: `1px solid ${ROYAL.hairline}` }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[13px] font-semibold" style={{ color: ROYAL.text }}>{row.label}</span>
        {row.unit && <span className="text-[10px]" style={{ color: ROYAL.dim }}>{row.unit}</span>}
        <span className="ml-auto flex items-baseline gap-3 text-[13px] tabular-nums">
          <Reading v={va} row={row} tone={color} winner={win === 0} />
          {vb !== undefined && <Reading v={vb} row={row} tone={ROYAL.iris} winner={win === 1} />}
        </span>
      </div>

      {/* One scale, two markers. */}
      <Track aFill={fillFor(row, va)} bFill={vb === undefined ? null : fillFor(row, vb)}
             aTone={color} bTone={ROYAL.iris} still={still} delay={index * 0.04} />

      {effect && (
        <p className="text-[11.5px] leading-relaxed mt-2 max-w-[68ch]" style={{ color: ROYAL.dim }}>
          {effect}
        </p>
      )}
    </div>
  );
}

function Reading({
  v, row, tone, winner,
}: { v: number; row: ParamRow; tone: string; winner: boolean }) {
  const read = row.read(v);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-bold" style={{ color: winner ? tone : ROYAL.text }}>{fmtVal(v)}</span>
      {read && (
        <span className="text-[10px] uppercase tracking-[0.14em]"
              style={{ color: winner ? tone : ROYAL.dim }}>{read}</span>
      )}
    </span>
  );
}

/**
 * The shared scale.
 *
 * The track is the full range of the parameter; each marker sits where its
 * target falls on it, and the span between them is shaded so the gap reads as a
 * quantity rather than as two positions you have to subtract by eye.
 */
function Track({
  aFill, bFill, aTone, bTone, still, delay,
}: {
  aFill: number; bFill: number | null; aTone: string; bTone: string;
  still: boolean; delay: number;
}) {
  const lo = bFill === null ? 0 : Math.min(aFill, bFill);
  const hi = bFill === null ? aFill : Math.max(aFill, bFill);
  const pc = (f: number) => `${Math.max(0, Math.min(1, f)) * 100}%`;

  return (
    <div className="relative h-5 mt-2">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full"
           style={{ background: "rgba(255,255,255,0.07)" }} />
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full"
        style={{ left: pc(lo), background: `linear-gradient(90deg, ${aTone}55, ${bTone}55)` }}
        initial={still ? { width: pc(hi - lo) } : { width: 0 }}
        animate={{ width: pc(hi - lo) }}
        transition={{ duration: still ? 0 : 0.65, delay: still ? 0 : delay, ease: EASE }}
      />
      <Marker fill={aFill} tone={aTone} still={still} delay={delay + 0.08} />
      {bFill !== null && <Marker fill={bFill} tone={bTone} still={still} delay={delay + 0.14} />}
    </div>
  );
}

function Marker({ fill, tone, still, delay }: { fill: number; tone: string; still: boolean; delay: number }) {
  return (
    <motion.span
      className="absolute top-1/2 w-2.5 h-2.5 rounded-full"
      style={{
        left: `${Math.max(0, Math.min(1, fill)) * 100}%`,
        marginLeft: -5, marginTop: -5,
        background: tone,
        boxShadow: `0 0 10px -2px ${tone}`,
      }}
      initial={still ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={still ? { duration: 0 } : { ...SPRING.pop, delay }}
    />
  );
}

// ─── Storm Mode ──────────────────────────────────────────────────────────────
const FLAVOUR_BLURB: Record<string, string> = {
  HP: "High precipitation. The mesocyclone gets wrapped in rain, so structure is hard to see and the tornado is often hidden. Stay well east or south and never punch the core.",
  Classic: "Classic supercell. The rain-free base and the wall cloud sit out in the open, which is the structure everybody drives for.",
  LP: "Low precipitation. Little rain, a sculpted updraft and often big hail out of a nearly clear sky. Spectacular to look at, less likely to be tornadic.",
  "n/a": "Not a supercell environment. Expect storms without a persistent rotating updraft.",
};

export const StormModePanel = memo(function StormModePanel({
  targets, color, still,
}: { targets: ChaseTarget[]; color: string; still: boolean }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {targets.map((t, i) => {
        const m = t.storm_mode;
        const tone = i === 0 ? color : ROYAL.iris;
        return (
          <motion.section key={t.rank} {...rise(i, still)}
            className="rounded-2xl overflow-hidden"
            style={{ background: ROYAL.panel, border: `1px solid ${tone}33` }}>
            <div className="px-4 py-3 flex items-center justify-between gap-2"
                 style={{ background: `${tone}0f`, borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: tone }}>
                  Target {t.rank}
                </div>
                <div className="font-bold truncate" style={{ fontFamily: HEADING, color: ROYAL.text }}>{t.place}</div>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-xs font-black shrink-0"
                    style={{ background: tone, color: "#0d0d18" }}>{m.flavour}</span>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <div className="text-lg font-bold leading-tight" style={{ fontFamily: HEADING, color: tone }}>
                  {m.mode}
                </div>
                <p className="text-[12px] mt-1 leading-relaxed" style={{ color: ROYAL.dim }}>
                  {FLAVOUR_BLURB[m.flavour] ?? ""}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <ModeStat icon={Wind} label="Motion"
                          value={`${m.motion_mph}`} sub={`mph toward ${compass(m.motion_toward_deg)}`} tone={tone} />
                <ModeStat icon={CloudHail} label="Hail"
                          value={`${m.hail_in}"`} sub={m.hail_word} tone={tone} />
                <ModeStat icon={Clock} label="Peak"
                          value={hourLabel(t.peak_hour)} sub={t.hours_to_sunset > 0 ? `${t.hours_to_sunset}h light` : "after dark"} tone={tone} />
              </div>

              <AiNote color={tone}>{m.note}</AiNote>

              {(m.tornado_note || m.hail_note || m.wind_note) && (
                <div className="space-y-1.5">
                  {m.tornado_note && <Threat icon={Tornado} label="Tornado" text={m.tornado_note} tone="#ff6b70" />}
                  {m.hail_note && <Threat icon={CloudHail} label="Hail" text={m.hail_note} tone="#89cff0" />}
                  {m.wind_note && <Threat icon={Wind} label="Wind" text={m.wind_note} tone="#e8bb4d" />}
                </div>
              )}

              {m.extra_notes.length > 0 && (
                <ul className="space-y-1 pt-0.5">
                  {m.extra_notes.map((n, k) => (
                    <li key={k} className="flex gap-2 text-[12px] leading-relaxed" style={{ color: ROYAL.dim }}>
                      <span style={{ color: tone }}>·</span>{n}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                <Stat label="Freezing level" value={t.params.freezing_level_ft.toLocaleString()} unit="ft" />
                <Stat label="Wet bulb zero" value={t.params.wbz_ft.toLocaleString()} unit="ft" />
                <Stat label="700mb RH" value={String(t.params.rh_700)} unit="%" />
                <Stat label="SHIP" value={t.params.ship.toFixed(2)} unit="" />
              </div>
            </div>
          </motion.section>
        );
      })}
    </div>
  );
});

function ModeStat({
  icon: Icon, label, value, sub, tone,
}: { icon: typeof Wind; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-xl px-2.5 py-2.5 text-center"
         style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
      <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: tone }} />
      <div className="text-[9px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>{label}</div>
      <div className="text-base font-black leading-tight tabular-nums" style={{ color: ROYAL.text }}>{value}</div>
      <div className="text-[10px] leading-tight" style={{ color: ROYAL.dim }}>{sub}</div>
    </div>
  );
}

function Threat({
  icon: Icon, label, text, tone,
}: { icon: typeof Wind; label: string; text: string; tone: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg px-2.5 py-2"
         style={{ background: `${tone}0e`, border: `1px solid ${tone}26` }}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tone }} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: tone }}>{label}</div>
        <p className="text-[12px] leading-relaxed" style={{ color: ROYAL.text }}>{text}</p>
      </div>
    </div>
  );
}

// ─── Bust probability ────────────────────────────────────────────────────────
export const BustPanel = memo(function BustPanel({
  targets, color, still,
}: { targets: ChaseTarget[]; color: string; still: boolean }) {
  return (
    <div className="space-y-3">
      <motion.p {...rise(0, still)} className="text-[12px] leading-relaxed px-1" style={{ color: ROYAL.dim }}>
        Bust risk is the chance you drive all that way and nothing worth seeing happens. It is computed from the
        three ways a chase day actually dies: the cap never breaks, nothing lifts the air, or the storms are junk
        when they finally go. A high number is not a reason to hide it.
      </motion.p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {targets.map((t, i) => {
          const band = bustBand(t.bust.probability);
          const tone = i === 0 ? color : ROYAL.iris;
          return (
            <motion.section key={t.rank} {...rise(i + 1, still)}
              className="rounded-2xl overflow-hidden"
              style={{ background: ROYAL.panel, border: `1px solid ${band.color}33` }}>
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
                <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: tone }}>Target {t.rank}</div>
                <div className="font-bold truncate" style={{ fontFamily: HEADING, color: ROYAL.text }}>{t.place}</div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-end gap-3">
                  <div>
                    <div className="text-5xl font-black tabular-nums leading-none"
                         style={{ color: band.color, fontFamily: HEADING }}>
                      {t.bust.probability}<span className="text-2xl">%</span>
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.2em] mt-1" style={{ color: ROYAL.dim }}>
                      chance of a bust
                    </div>
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="text-sm font-bold text-right" style={{ color: band.color }}>
                      {t.bust.word || band.label}
                    </div>
                  </div>
                </div>

                {/* The meter, with the honest thresholds marked. */}
                <div>
                  <div className="h-2.5 rounded-full overflow-hidden relative"
                       style={{ background: "rgba(255,255,255,0.07)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${band.color}88, ${band.color})`, transformOrigin: "left center" }}
                      initial={still ? { scaleX: t.bust.probability / 100 } : { scaleX: 0 }}
                      animate={{ scaleX: t.bust.probability / 100 }}
                      transition={{ duration: still ? 0 : 0.9, ease: EASE }}
                    />
                    {[18, 32, 50, 70].map((m) => (
                      <span key={m} className="absolute top-0 bottom-0 w-px"
                            style={{ left: `${m}%`, background: "rgba(0,0,0,0.45)" }} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: ROYAL.dim }}>
                    <span>very low</span><span>low</span><span>real</span><span>coin flip</span><span>likely</span>
                  </div>
                </div>

                <AiNote color={band.color}>{t.bust.summary}</AiNote>

                <div className="grid grid-cols-2 gap-2">
                  <Driver label="Cap strength" value={`${t.params.cin} J/kg`}
                          bad={t.params.cin > 150} note={t.params.cin > 250 ? "Hard cap" : t.params.cin > 150 ? "Strong" : t.params.cin > 60 ? "In place" : "Weak"} />
                  <Driver label="Large-scale ascent" value={`${t.params.omega_700} m/s`}
                          bad={t.params.omega_700 > -0.02} note={t.params.omega_700 > 0 ? "Sinking air" : t.params.omega_700 < -0.15 ? "Strong" : "Weak"} />
                  <Driver label="Precip chance" value={`${t.params.precip_probability}%`}
                          bad={t.params.precip_probability < 30} note={t.params.precip_probability < 20 ? "Very low" : t.params.precip_probability > 60 ? "Good" : "Scattered"} />
                  <Driver label="Daylight after peak" value={t.hours_to_sunset > 0 ? `${t.hours_to_sunset} h` : "none"}
                          bad={t.hours_to_sunset < 1.5} note={t.hours_to_sunset < 1 ? "Night chase" : t.hours_to_sunset > 3 ? "Comfortable" : "Tight"} />
                </div>
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
});

function Driver({ label, value, bad, note }: { label: string; value: string; bad: boolean; note: string }) {
  const tone = bad ? "#ff8a3d" : "#5fd9a8";
  return (
    <div className="rounded-xl px-3 py-2.5"
         style={{ background: `${tone}0d`, border: `1px solid ${tone}26` }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>{label}</div>
      <div className="text-sm font-bold tabular-nums" style={{ color: ROYAL.text }}>{value}</div>
      <div className="text-[10px]" style={{ color: tone }}>{note}</div>
    </div>
  );
}

// ─── Yearly ──────────────────────────────────────────────────────────────────
export const YearlyPanel = memo(function YearlyPanel({
  o, liveYear, color, still,
}: { o: ChaseOutlook; liveYear: ChaseYearContext | null; color: string; still: boolean }) {
  const y = o.yearly;
  const rank = y?.rank ?? 1;
  const meaning = YEARLY_MEANING[rank];
  // Live first, the row's stamped copy second. The stored one is a snapshot
  // from the moment the engine ran and goes stale the instant the historical
  // backfill writes a day — which is how this panel came to claim sixteen
  // recorded days while the table held seventy.
  const ctx = liveYear ?? y?.context;
  const thin = !ctx || !ctx.days_scored;

  return (
    <div className="space-y-3">
      <motion.section {...rise(0, still)} className="rounded-2xl p-5"
        style={{ background: `radial-gradient(120% 130% at 50% 0%, ${color}18, ${ROYAL.panel} 65%)`, border: `1px solid ${color}3a` }}>
        <div className="text-[10px] uppercase tracking-[0.3em] text-center mb-3" style={{ color: ROYAL.dim }}>
          Against the rest of the year
        </div>

        {/* Five bolts. The filled ones are the rank. */}
        <div className="flex justify-center gap-2 sm:gap-3 mb-4">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = n <= rank;
            return (
              <motion.div
                key={n}
                initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: -25 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: still ? 0 : 0.1 + n * 0.09, type: "spring", stiffness: 380, damping: 17 }}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl grid place-items-center"
                style={{
                  background: on ? `${color}22` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${on ? color + "77" : ROYAL.hairline}`,
                  boxShadow: on ? `0 0 22px -8px ${color}` : undefined,
                }}
              >
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6"
                        style={{ color: on ? color : ROYAL.dim, opacity: on ? 1 : 0.35 }} />
              </motion.div>
            );
          })}
        </div>

        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-black leading-tight"
               style={{ color, fontFamily: HEADING }}>
            {rank} of 5
          </div>
          {y?.label && (
            <div className="text-sm font-semibold mt-0.5" style={{ color: ROYAL.text }}>{y.label}</div>
          )}
          <div className="text-base font-bold mt-2" style={{ color: ROYAL.text, fontFamily: HEADING }}>
            {meaning.title}
          </div>
          <p className="text-[13px] mt-1 max-w-md mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>
            {meaning.body}
          </p>
        </div>
      </motion.section>

      {y?.summary && (
        <motion.div {...rise(1, still)}>
          <AiNote color={color}>{y.summary}</AiNote>
        </motion.div>
      )}

      <motion.section {...rise(2, still)} className="rounded-2xl overflow-hidden"
        style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            <Gauge className="w-4 h-4" style={{ color: ROYAL.gold }} /> The year's ledger
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>
            {thin
              ? "Every day the engine runs is recorded here. The comparison gets sharper as the season fills in."
              : "Read straight off the rows the engine has written this year, not from memory."}
          </p>
        </div>
        {thin ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: ROYAL.dim }}>
            No days recorded yet this year. Today is the first.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: ROYAL.hairline }}>
            <Led label="Days recorded" value={String(ctx!.days_scored)}
                 sub={ctx!.first_date ? `since ${shortDate(ctx!.first_date)}` : undefined} />
            <Led label="Best so far" value={ctx!.best_score != null ? Number(ctx!.best_score).toFixed(1) : "—"}
                 sub={ctx!.best_date ?? undefined} />
            <Led label="Typical day" value={ctx!.median_score != null ? Number(ctx!.median_score).toFixed(1) : "—"} />
            <Led label="Today beats" value={ctx!.percentile != null ? `${Math.round(Number(ctx!.percentile))}%` : "—"}
                 sub="of this year" />
          </div>
        )}
      </motion.section>

      <motion.section {...rise(3, still)} className="rounded-2xl p-4"
        style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${ROYAL.hairline}` }}>
        <h3 className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2.5" style={{ color: ROYAL.gold }}>
          What the five levels mean
        </h3>
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="flex gap-2.5 text-[12px] leading-relaxed">
              <span className="w-5 h-5 rounded grid place-items-center text-[10px] font-black shrink-0"
                    style={{
                      background: n === rank ? color : "rgba(255,255,255,0.05)",
                      color: n === rank ? "#0d0d18" : ROYAL.dim,
                    }}>{n}</span>
              <span style={{ color: n === rank ? ROYAL.text : ROYAL.dim }}>
                <strong style={{ color: n === rank ? color : ROYAL.text }}>{YEARLY_MEANING[n].title}.</strong>{" "}
                {YEARLY_MEANING[n].body}
              </span>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
});

/** "2026-03-07" → "Mar 7", for the one place that needs a span rather than a day. */
function shortDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch { return iso; }
}

function Led({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-3 py-3 text-center" style={{ background: ROYAL.ink2 }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>{label}</div>
      <div className="text-xl font-black tabular-nums leading-tight" style={{ color: ROYAL.text }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: ROYAL.dim }}>{sub}</div>}
    </div>
  );
}

/**
 * Terrain, with its working shown on hover.
 *
 * The score used to be 100 for almost every target, so there was nothing to
 * explain. Now that it separates the High Plains from the Ozarks by sixty
 * points, a chaser looking at 41/100 deserves to know whether that is trees,
 * hills or roads — and the four components say exactly which.
 */
export const TerrainNote = memo(function TerrainNote({ t }: { t: ChaseTarget }) {
  const d = t.terrain_detail;
  const title = d
    ? [
        `Terrain ${t.terrain_score}/100`,
        d.trees != null ? `open ground ${d.trees}/100${d.detail.canopy_pct != null ? ` (${d.detail.canopy_pct}% canopy)` : ""}` : null,
        d.rugged != null ? `flatness ${d.rugged}/100${d.detail.relief_m != null ? ` (${d.detail.relief_m} m relief)` : ""}` : null,
        d.sight != null ? `sightlines ${d.sight}/100` : null,
        d.roads != null ? `roads ${d.roads}/100${d.detail.road_grid_frac != null ? ` (${Math.round(d.detail.road_grid_frac * 100)}% on the grid)` : ""}` : null,
      ].filter(Boolean).join(" · ")
    : undefined;
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: ROYAL.dim }} title={title}>
      <Mountain className="w-3 h-3" /> terrain {t.terrain_score}/100
    </span>
  );
});
