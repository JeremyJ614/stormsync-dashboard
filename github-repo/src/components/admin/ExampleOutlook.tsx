import { useMemo } from "react";
import { US_STATES, MAP_W, MAP_H, project } from "../../lib/usAlbers";
import { ROYAL } from "../../lib/royal";

/**
 * An example outlook, so every level can be seen at once.
 *
 * The previews used to be today's real outlook, which sounds better than it is:
 * a real day carries two or three levels at most, and most days carry one. An
 * admin picking colours for a five-level ramp could see two of them, and the
 * two that matter most — the top of the scale — are the ones that almost never
 * appear. Judging a High risk colour requires a High risk on the map.
 *
 * So this is a made-up day drawn on the real country, and it is labelled as
 * made up. It is not a forecast and must never be mistaken for one.
 *
 * WHY IT IS NOT CIRCLES. A real outlook is a set of nested lumpy contours where
 * the higher risks sit OFF-CENTRE inside the lower ones — the core is pushed
 * toward whichever flank the forecaster is worried about, never concentric.
 * Concentric circles read as a diagram, and the point of a preview is to look
 * like the thing it previews: a colour that works on a target reads differently
 * on a long ragged band. So one deterministic noise field is generated once and
 * every band is a shrunken, drifted copy of it — which is also how real
 * contours of one underlying field behave — then smoothed into curves.
 *
 * The bands are painted at the SAME opacity the real modules paint them, so a
 * colour is judged as members will see it. The pure hex still has to be
 * judgeable, so each label carries a solid chip of it.
 */
export interface OutlookLevel {
  label: string;
  color: string;
  /** What the real module paints this level at. Defaults to the SPC map's 0.6. */
  opacity?: number;
}

export function ExampleOutlook({
  levels, caption,
}: { levels: OutlookLevel[]; caption?: string }) {
  const bands = useMemo(() => buildBands(levels.length), [levels.length]);

  return (
    <div className="relative" style={{ background: "#080810" }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full block"
           role="img" aria-label="Example outlook showing every level of the scale">
        {/* the country */}
        <g>
          {US_STATES.map((s) => (
            <path key={s.name} d={s.d}
                  fill="rgba(204,204,255,0.045)"
                  stroke="rgba(204,204,255,0.16)" strokeWidth={0.7} />
          ))}
        </g>

        {/* the risk bands, lowest first so the rest sit on top — the same
            painter's order the real outlook layers use */}
        <g>
          {levels.map((lv, i) => (
            <path key={`${lv.label}-${i}`} d={bands[i].d}
                  fill={lv.color} fillOpacity={lv.opacity ?? 0.6}
                  stroke={lv.color} strokeWidth={1.2} strokeOpacity={0.95} />
          ))}
        </g>

        {/* state lines again, faintly, over the fills — the SPC draws them on
            top too, and without it the polygons read as stickers */}
        <g pointerEvents="none">
          {US_STATES.map((s) => (
            <path key={s.name} d={s.d} fill="none"
                  stroke="rgba(255,255,255,0.13)" strokeWidth={0.6} />
          ))}
        </g>

        {/* one label per level, in the sliver of its own band that the band
            above does not cover, with a solid chip of the unmixed colour */}
        <g pointerEvents="none">
          {levels.map((lv, i) => {
            const y = labelY(bands, i);
            const x = bands[i].cx;
            return (
              <g key={`lab-${lv.label}-${i}`}>
                <rect x={x - 74} y={y - 9} width={13} height={13} rx={2.5}
                      fill={lv.color} stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
                <text x={x - 56} y={y + 1.5}
                      fontSize={13} fontWeight={800}
                      fill="#ffffff" stroke="rgba(0,0,0,0.85)" strokeWidth={3}
                      paintOrder="stroke" style={{ letterSpacing: "0.03em" }}>
                  {lv.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Said plainly and on the map, because a preview that looks this much
          like a real outlook has to say it is not one. */}
      <div className="absolute bottom-1.5 left-2 text-[9px] uppercase tracking-[0.18em] font-bold"
           style={{ color: ROYAL.dim }}>
        Example only — not a forecast
      </div>
      {caption && (
        <div className="absolute bottom-1.5 right-2 text-[9px]" style={{ color: ROYAL.dim }}>
          {caption}
        </div>
      )}
    </div>
  );
}

/* ── shaping the bands ────────────────────────────────────────────────────── */

interface Band { d: string; cx: number; topY: number; botY: number }

/** The outermost band, and the innermost. Everything else interpolates. */
const OUTER = { lon: -97.6, lat: 37.9, rx: 12.6, ry: 7.4 };
const INNER = { lon: -98.0, lat: 35.0, rx: 2.6, ry: 1.6 };

/**
 * Deterministic value noise.
 *
 * Seeded rather than `Math.random()` so the example is the same shape on every
 * render — a preview whose coastline changed while you were choosing a colour
 * would make it impossible to tell whether the map or the hex had moved.
 */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const STEPS = 30;

/**
 * One ragged shape, sampled once and reused by every band.
 *
 * Reusing it is what guarantees the bands nest. Give each band its own noise
 * and a lump on an inner band can poke through the band that is supposed to
 * contain it — a Level 4 blob sticking out of the Level 3 area, which is not a
 * thing an outlook can do and would read as a rendering bug.
 */
const SHAPE: number[] = Array.from({ length: STEPS }, (_, k) => {
  // Two octaves: a slow lobe that gives the band its overall lean, and a faster
  // wobble for the ragged edge a hand-drawn boundary has.
  const lobe = 0.82 + noise(k * 0.29) * 0.40;
  const wob = 0.94 + noise(k * 1.91) * 0.14;
  return lobe * wob;
});

function buildBands(n: number): Band[] {
  const out: Band[] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const lon = OUTER.lon + (INNER.lon - OUTER.lon) * t;
    const lat = OUTER.lat + (INNER.lat - OUTER.lat) * t;
    const rx = OUTER.rx + (INNER.rx - OUTER.rx) * t;
    const ry = OUTER.ry + (INNER.ry - OUTER.ry) * t;

    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k < STEPS; k++) {
      const a = (k / STEPS) * Math.PI * 2;
      const r = SHAPE[k];
      pts.push(project(lon + Math.cos(a) * rx * r, lat + Math.sin(a) * ry * r));
    }
    const ys = pts.map((p) => p.y);
    out.push({
      d: smoothClosed(pts),
      cx: project(lon, lat).x,
      topY: Math.min(...ys),
      botY: Math.max(...ys),
    });
  }
  return out;
}

/**
 * Where a level's label goes.
 *
 * In the gap between the top of its own band and the top of the band above it
 * — the only part of a nested contour that is still its own colour. Measured
 * off the generated geometry rather than guessed from the centres, because the
 * noise moves each edge and a guessed position lands under the next band.
 */
function labelY(bands: Band[], i: number): number {
  const b = bands[i];
  const inner = bands[i + 1];
  if (!inner) return (b.topY + b.botY) / 2;
  return (b.topY + inner.topY) / 2;
}

/**
 * A closed path through the points, as curves.
 *
 * Catmull-Rom converted to cubic béziers. Straight segments between the
 * sampled vertices would give a 30-sided polygon, and outlook boundaries are
 * drawn by hand — they curve.
 */
function smoothClosed(p: { x: number; y: number }[]): string {
  const n = p.length;
  if (n < 3) return "";
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d + "Z";
}

/* ── the EF version ───────────────────────────────────────────────────────── */

/**
 * Tornado tracks on the same country, for the EF ramp.
 *
 * A track is a two-pixel line, and a hue that reads perfectly as a filled
 * outlook polygon can vanish entirely at that width — so the EF scale gets a
 * preview shaped like what it actually paints, on the same map as the rest so
 * the two are judged against the same ground.
 */
export function ExampleTracks({ levels }: { levels: OutlookLevel[] }) {
  const tracks = useMemo(() => {
    // Real long-track events run southwest to northeast, so every track is
    // drawn on that axis — which means they cannot be spread along it. Nudging
    // each start further up the same diagonal, the obvious thing, lays them end
    // to end into one long stripe with the colours indistinguishable. They are
    // laid out on a grid instead: two columns across the Plains, stepping
    // north, each track still running SW to NE.
    return levels.map((_, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const lon0 = -102.6 + col * 7.0;
      const lat0 = 32.6 + row * 3.4;
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        const wob = (noise(i * 17.3 + k * 2.1) - 0.5) * 0.42;
        pts.push(project(lon0 + t * 4.0 + wob, lat0 + t * 2.0 + wob * 0.6));
      }
      const d = pts.map((q, k) => `${k ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
      // Labels hang off the OUTER flank of their column — the left one reads
      // right-to-left into the empty Rockies, the right one left-to-right into
      // the empty Southeast. Putting both on the same side means the long ones
      // ("EFU · unrated") run straight through the next column's track, which
      // is exactly what a preview must not do to the thing being previewed.
      return {
        d,
        label: col === 0 ? project(lon0 - 0.35, lat0) : project(lon0 + 4.35, lat0 + 2.0),
        anchor: col === 0 ? ("end" as const) : ("start" as const),
      };
    });
  }, [levels]);

  return (
    <div className="relative" style={{ background: "#080810" }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full block"
           role="img" aria-label="Example tornado tracks in every EF colour">
        {US_STATES.map((s) => (
          <path key={s.name} d={s.d} fill="rgba(204,204,255,0.045)"
                stroke="rgba(204,204,255,0.16)" strokeWidth={0.7} />
        ))}
        {levels.map((lv, i) => (
          <g key={`${lv.label}-${i}`}>
            <path d={tracks[i].d} fill="none" stroke={lv.color} strokeWidth={2.4}
                  strokeLinecap="round" strokeLinejoin="round" />
            <text x={tracks[i].label.x} y={tracks[i].label.y + 4}
                  textAnchor={tracks[i].anchor}
                  fontSize={12.5} fontWeight={800} fill={lv.color}
                  stroke="#080810" strokeWidth={3} paintOrder="stroke">
              {lv.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute bottom-1.5 left-2 text-[9px] uppercase tracking-[0.18em] font-bold"
           style={{ color: ROYAL.dim }}>
        Example only — not real tracks
      </div>
    </div>
  );
}
