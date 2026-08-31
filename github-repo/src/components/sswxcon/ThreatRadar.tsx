import { motion } from "framer-motion";
import { ROYAL, EASE } from "../../lib/royal";

/**
 * The shape of the national situation.
 *
 * A radar rather than seven bars, because what matters here is the *shape* — a
 * tornado outbreak and a tropical landfall can score the same total and look
 * nothing alike, and the polygon shows that at a glance where a column chart
 * makes you read it off.
 *
 * Each axis is scaled to its own cap rather than to the largest, so an axis at
 * the edge means "this component is maxed out", not "this one happens to be the
 * biggest today". Without that, the fire axis — capped at 15 against tornado's
 * 120 — would never leave the middle and the shape would say nothing.
 */
export interface RadarAxis { label: string; value: number; cap: number }

const R = 82;
const CX = 125, CY = 104;

const pt = (i: number, n: number, r: number) => {
  const a = ((i / n) * 360 - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
};

export function ThreatRadar({ axes, color, calm }: { axes: RadarAxis[]; color: string; calm: boolean }) {
  const n = axes.length;
  if (n < 3) return null;

  const poly = axes
    .map((a, i) => {
      const frac = a.cap > 0 ? Math.max(0, Math.min(1, a.value / a.cap)) : 0;
      const p = pt(i, n, Math.max(4, R * frac));
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <svg width="250" height="212" viewBox="0 0 250 212" fill="none" className="mx-auto"
         role="img" aria-label="Score components as a radar">
      {/* Web. */}
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k}
          points={axes.map((_, i) => { const p = pt(i, n, R * k); return `${p.x},${p.y}`; }).join(" ")}
          stroke={ROYAL.hairline} strokeWidth={1} fill="none" />
      ))}
      {axes.map((_, i) => {
        const p = pt(i, n, R);
        return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={ROYAL.hairline} strokeWidth={1} />;
      })}

      {/* The reading. */}
      <motion.polygon
        points={poly}
        fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.8} strokeLinejoin="round"
        initial={false}
        animate={{ opacity: 1, scale: 1 }}
        style={{ transformBox: "view-box", transformOrigin: `${CX}px ${CY}px` }}
        transition={calm ? { duration: 0 } : { duration: 0.7, ease: EASE }}
      />
      {axes.map((a, i) => {
        const frac = a.cap > 0 ? Math.max(0, Math.min(1, a.value / a.cap)) : 0;
        const p = pt(i, n, Math.max(4, R * frac));
        return <circle key={a.label} cx={p.x} cy={p.y} r={2.6} fill={color} />;
      })}

      {/* Labels, pushed just outside the web. */}
      {axes.map((a, i) => {
        const p = pt(i, n, R + 17);
        const anchor = p.x > CX + 6 ? "start" : p.x < CX - 6 ? "end" : "middle";
        return (
          <text key={a.label} x={p.x} y={p.y} fill={ROYAL.dim} fontSize="8"
                textAnchor={anchor} dominantBaseline="middle" letterSpacing="0.6">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
