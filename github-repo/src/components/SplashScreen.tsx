import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "./BrandMark";

/**
 * The opening plate.
 *
 * WHAT THIS REPLACES
 * A purple radar sweep over a hex grid with corner brackets and a HUD progress
 * pill. Two problems with it, and the second is the serious one. It was in a
 * palette the application no longer uses — the app is champagne and periwinkle
 * on indigo ink, and the splash was magenta on violet, so the first thing a
 * member ever saw was the only screen that did not look like the product. And
 * it was a radar, which reads as *weather software* when what this is is a
 * membership: members choose their own menu style, and half of those styles are
 * not weather at all.
 *
 * WHAT IT IS
 * An engraving. The centrepiece is a guilloché rosette — the interlaced line
 * ornament on a banknote, a share certificate, a watch dial — drawn live and
 * engraved on screen, stroke by stroke, in champagne. It is not an asset: the
 * three rosettes are hypotrochoids computed at module load, so they are a few
 * hundred bytes of arithmetic rather than an image, they are exact at any
 * screen size, and no stock file exists anywhere that looks like them.
 *
 * The order is the whole idea, and it is the order of making a certificate. The
 * rule is scribed first, on an empty plate, before there is anything to write on
 * it. The ornament engraves itself. The mark is struck — one ring, once, on
 * impact, not a pulse looping for three seconds. Then the words are set into
 * place, wiped in rather than faded, because type on an engraving arrives by
 * being cut, not by materialising.
 *
 * Everything is CSS animation on transform, opacity, clip-path and
 * stroke-dashoffset — the four things a compositor can do without touching
 * layout — so it holds sixty frames on a cheap phone. Under reduced motion the
 * whole plate renders in its finished state and simply holds.
 */
const TOTAL_MS = 3000;

/* ── the ornament ────────────────────────────────────────────────────────── */

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * One hypotrochoid: a pen at distance `d` from the centre of a circle of radius
 * `r` rolling inside a circle of radius `R`. It closes after `r / gcd(R, r)`
 * turns and draws `R / gcd(R, r)` lobes, which is what the parameters below are
 * chosen against — a rosette that does not close is a scribble, and one with
 * too few lobes is a flower.
 */
function rosette(R: number, r: number, d: number, steps: number): string {
  const turns = r / gcd(R, r);
  const k = (R - r) / r;
  let out = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI;
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    // One decimal on a 340-unit viewBox is a twentieth of a pixel, and the
    // difference between a 60 kB path string and a 100 kB one.
    out += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${out}Z`;
}

// R and r share no factor in any of these, so each closes only after `r` turns
// and lays down `R` lobes — 120, 95 and 66 of them, at radii 150, 110 and 70.
// That density is the point: guilloché is an interlace, and a rosette with a
// dozen lobes is a flower.
const OUTER = rosette(120, 23, 53, 2400);
const MIDDLE = rosette(95, 18, 33, 1800);
const INNER = rosette(66, 13, 17, 1400);

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const paths = useMemo(() => ({ OUTER, MIDDLE, INNER }), []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduce ? 900 : TOTAL_MS;
    const t1 = setTimeout(() => setLeaving(true), hold);
    const t2 = setTimeout(onDone, hold + 480);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div className={`sx${leaving ? " is-leaving" : ""}`} role="presentation">
      <style>{CSS}</style>

      <div className="sx-ground" aria-hidden="true" />

      <div className="sx-plate">
        {/* The medallion. Its box is the disc, so the type below clears the
            ornament instead of being laid across it. */}
        <div className="sx-medallion">
          <svg className="sx-rose" viewBox="-170 -170 340 340" aria-hidden="true">
            <g className="sx-spin">
              <circle className="eng e0" cx="0" cy="0" r="160" pathLength={1} />
              <path className="eng e1" d={paths.OUTER} pathLength={1} />
              <path className="eng e2" d={paths.MIDDLE} pathLength={1} />
              <path className="eng e3" d={paths.INNER} pathLength={1} />
              <circle className="eng e4" cx="0" cy="0" r="46" pathLength={1} />
            </g>
          </svg>
          <span className="sx-halo" aria-hidden="true" />
          <span className="sx-strike" aria-hidden="true" />
          {/* Shares BRAND_LAYOUT_ID with the header copy, so it flies rather
              than fades when the plate lifts. Nothing may clip this element. */}
          <span className="sx-markin">
            <BrandMark size={112} drip glow="rgba(217,183,117,0.42)" />
          </span>
        </div>

        <h1 className="sx-title">
          <span className="w w1">VIP</span>{" "}
          <span className="w w2">Forecasts</span>{" "}
          <span className="w w3">&amp;</span>{" "}
          <span className="w w4">Weather</span>{" "}
          <span className="w w5">Data</span>
        </h1>

        <div className="sx-rule" aria-hidden="true" />
        <p className="sx-by">Created By <strong>StormSync Media</strong></p>
      </div>

      <p className="sx-dev">Developed By <strong>Jay Myers</strong></p>
      <div className="sx-bar" aria-hidden="true"><span /></div>
    </div>
  );
}

const GOLD = "#d9b775";
const IRIS = "#ccccff";

const CSS = `
.sx{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:#070713;overflow:hidden;opacity:1;
  transition:opacity .46s cubic-bezier(.22,1,.36,1),transform .46s cubic-bezier(.22,1,.36,1);}
.sx.is-leaving{opacity:0;transform:scale(1.03);}

/* ── ground ── */
.sx-ground{position:absolute;inset:0;
  background:
    radial-gradient(62% 52% at 50% 46%,rgba(217,183,117,.10),transparent 64%),
    radial-gradient(80% 70% at 50% 108%,rgba(120,110,255,.10),transparent 66%),
    radial-gradient(120% 100% at 50% 44%,#0b0b1a 0%,#070713 58%,#040409 100%);
  opacity:0;animation:sx-in .9s cubic-bezier(.22,1,.36,1) both;}
@keyframes sx-in{to{opacity:1}}

/* ── the plate ── */
.sx-plate{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;
  text-align:center;padding:0 24px;}

.sx-medallion{position:relative;display:grid;place-items:center;
  width:min(74vw,340px);height:min(74vw,340px);margin-bottom:6px;}

.sx-halo{position:absolute;inset:-18%;border-radius:50%;
  background:radial-gradient(circle,rgba(217,183,117,.16) 0%,rgba(217,183,117,.05) 42%,transparent 68%);
  opacity:0;animation:sx-in 1.1s ease .35s both;}

/* ── the engraving ── */
.sx-rose{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
/* A one-shot settle, NOT a loop.
   The rosettes are about sixty kilobytes of path — tens of thousands of
   vertices — and an SVG group transform is not composited: every frame
   re-rasterises the whole drawing. Rotating that for ever was costing a phone
   real frames during the one moment the app has nothing else to do, which is
   the worst possible place to spend them. It turns a few degrees as it lands
   and then stops, which is all the life it needed. */
.sx-spin{transform-origin:0 0;animation:sx-settle 2.6s cubic-bezier(.22,1,.36,1) .2s both;}
@keyframes sx-settle{from{transform:rotate(-7deg)}to{transform:rotate(0deg)}}
.sx .eng{fill:none;stroke:${GOLD};stroke-linejoin:round;
  stroke-dasharray:1;stroke-dashoffset:1;
  animation:sx-engrave 1.5s cubic-bezier(.42,0,.2,1) both;}
@keyframes sx-engrave{to{stroke-dashoffset:0}}
.sx .e0{stroke-width:1.1;stroke-opacity:.42;animation-delay:.16s}
.sx .e1{stroke-width:.5;stroke-opacity:.62;animation-delay:.26s}
.sx .e2{stroke-width:.5;stroke-opacity:.42;stroke:${IRIS};animation-delay:.44s}
.sx .e3{stroke-width:.5;stroke-opacity:.55;animation-delay:.60s}
.sx .e4{stroke-width:1.1;stroke-opacity:.40;animation-delay:.78s}

.sx-markin{position:relative;z-index:2;display:block;
  animation:sx-strike-in 1.0s cubic-bezier(.16,1,.3,1) .48s both;}
@keyframes sx-strike-in{
  0%{opacity:0;transform:scale(1.22)}
  55%{opacity:1}
  100%{opacity:1;transform:scale(1)}}

/* One ring, once, on impact. Not a pulse. */
.sx-strike{position:absolute;width:46%;aspect-ratio:1;border-radius:50%;
  border:1px solid ${GOLD};opacity:0;
  animation:sx-strike-ring 1.2s cubic-bezier(.16,1,.3,1) .72s both;}
@keyframes sx-strike-ring{
  0%{opacity:0;transform:scale(.5)}
  16%{opacity:.75}
  100%{opacity:0;transform:scale(2.4)}}

.sx-title{margin:0;font-family:'Raleway',system-ui,sans-serif;font-weight:800;letter-spacing:.07em;
  font-size:clamp(19px,5vw,36px);line-height:1.2;color:#f1f4ff;text-transform:uppercase;}
/* Wiped in, not faded: type on an engraving arrives by being cut. The clip ends
   past the right edge so a gradient-filled word is never shaved. */
.sx-title .w{display:inline-block;clip-path:inset(0 100% 0 0);opacity:.001;
  animation:sx-cut .58s cubic-bezier(.22,1,.36,1) both;}
@keyframes sx-cut{to{clip-path:inset(0 -4% 0 0);opacity:1}}
.sx-title .w1{animation-delay:.86s}
.sx-title .w2{animation-delay:.95s}
.sx-title .w3{animation-delay:1.04s;color:${GOLD}}
.sx-title .w4{animation-delay:1.13s}
.sx-title .w5{animation-delay:1.22s;
  background:linear-gradient(92deg,${GOLD},${IRIS});
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}

/* Scribed first, on an empty plate. */
.sx-rule{width:0;height:1px;margin:22px auto 15px;
  background:linear-gradient(90deg,transparent,${GOLD},${IRIS},transparent);
  animation:sx-scribe .62s cubic-bezier(.22,1,.36,1) .06s both;}
@keyframes sx-scribe{to{width:min(66vw,340px)}}

.sx-by{margin:0;font-size:clamp(10px,2.5vw,12px);letter-spacing:.24em;text-transform:uppercase;
  color:#a3a3cc;opacity:0;animation:sx-up .55s cubic-bezier(.22,1,.36,1) 1.58s both;}
.sx-by strong{color:#f1f4ff;font-weight:700;}
@keyframes sx-up{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}

.sx-dev{position:absolute;left:0;right:0;bottom:30px;z-index:2;margin:0;text-align:center;
  font-size:clamp(9px,2.2vw,10px);letter-spacing:.26em;text-transform:uppercase;color:#6f6f96;
  opacity:0;animation:sx-up .55s cubic-bezier(.22,1,.36,1) 1.86s both;}
.sx-dev strong{color:#a3a3cc;font-weight:600;}

/* Edge to edge along the very bottom, the way a plate is trimmed. */
.sx-bar{position:absolute;left:0;right:0;bottom:0;z-index:2;height:2px;
  background:rgba(217,183,117,.10);}
.sx-bar>span{display:block;height:100%;width:0;
  background:linear-gradient(90deg,${GOLD},${IRIS});
  box-shadow:0 0 12px -2px ${GOLD};
  animation:sx-fill ${TOTAL_MS}ms cubic-bezier(.35,.1,.2,1) both;}
@keyframes sx-fill{to{width:100%}}

@media (prefers-reduced-motion:reduce){
  .sx *{animation:none!important;transition:none!important;}
  .sx-ground,.sx-markin,.sx-halo,.sx-by,.sx-dev{opacity:1!important;transform:none!important;}
  .sx-strike{display:none!important;}
  .sx .eng{stroke-dashoffset:0!important;}
  .sx-title .w{clip-path:none!important;opacity:1!important;}
  .sx-rule{width:min(66vw,340px)!important;}
  .sx-bar>span{width:100%!important;}
}
`;

export default SplashScreen;
