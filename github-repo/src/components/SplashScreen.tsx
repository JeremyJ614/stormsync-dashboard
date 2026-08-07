import { useEffect, useState } from "react";

/**
 * StormSync intro (P-1.5). A geometric, single-take reveal: a radar sweep over a
 * hex/grid field, concentric range rings, a self-drawing polygon lattice, then the
 * brand mark and wordmarks. Shown once per browser session (see App.tsx).
 *
 * Motion is purely CSS so it stays smooth on low-end phones, and the whole thing
 * collapses to a static frame under `prefers-reduced-motion`.
 */
const MARK = "/sswx-mark.png";
const TOTAL_MS = 3000;

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduce ? 900 : TOTAL_MS;
    const t1 = setTimeout(() => setLeaving(true), hold);
    const t2 = setTimeout(onDone, hold + 480);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div className={`sswx-splash${leaving ? " is-leaving" : ""}`} role="presentation">
      <style>{CSS}</style>

      {/* ── Geometric field ── */}
      <div className="sswx-field" aria-hidden="true">
        <div className="sswx-grid" />
        <div className="sswx-vignette" />

        {/* Range rings + sweep */}
        <div className="sswx-radar">
          <span className="sswx-ring r1" />
          <span className="sswx-ring r2" />
          <span className="sswx-ring r3" />
          <span className="sswx-sweep" />
        </div>

        {/* Self-drawing lattice */}
        <svg className="sswx-lattice" viewBox="0 0 400 400" fill="none" aria-hidden="true">
          <polygon className="lat lat-a" points="200,40 340,120 340,280 200,360 60,280 60,120" />
          <polygon className="lat lat-b" points="200,95 292,148 292,252 200,305 108,252 108,148" />
          <circle className="lat lat-c" cx="200" cy="200" r="152" />
          <path className="lat lat-d" d="M200 40 L200 360 M60 120 L340 280 M340 120 L60 280" />
        </svg>

        {/* Corner brackets */}
        <span className="sswx-br tl" /><span className="sswx-br tr" />
        <span className="sswx-br bl" /><span className="sswx-br br" />
      </div>

      {/* ── Brand ── */}
      <div className="sswx-center">
        <div className="sswx-markwrap">
          <img src={MARK} alt="" className="sswx-mark" width={112} height={149} />
          <span className="sswx-pulse" />
        </div>

        <h1 className="sswx-title">
          <span className="w w1">VIP</span>{" "}
          <span className="w w2">Forecasts</span>{" "}
          <span className="w w3">&amp;</span>{" "}
          <span className="w w4">Weather</span>{" "}
          <span className="w w5">Data</span>
        </h1>

        <div className="sswx-rule" />
        <p className="sswx-by">Created By: <strong>StormSync Media</strong></p>
      </div>

      <p className="sswx-dev">Developed By: <strong>Jay Myers</strong></p>
      <div className="sswx-progress"><span /></div>
    </div>
  );
}

const CSS = `
.sswx-splash{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 90% at 50% 42%,#1a0f33 0%,#0d0720 45%,#05010f 100%);
  overflow:hidden;opacity:1;transition:opacity .45s ease,transform .45s ease;}
.sswx-splash.is-leaving{opacity:0;transform:scale(1.045);}

.sswx-field{position:absolute;inset:0;pointer-events:none;}
.sswx-grid{position:absolute;inset:-20%;
  background-image:linear-gradient(rgba(168,85,247,.15) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(168,85,247,.15) 1px,transparent 1px);
  background-size:46px 46px;
  -webkit-mask-image:radial-gradient(circle at 50% 45%,#000 0%,#000 38%,transparent 72%);
          mask-image:radial-gradient(circle at 50% 45%,#000 0%,#000 38%,transparent 72%);
  animation:sswx-drift 3s linear both;opacity:0;}
@keyframes sswx-drift{0%{opacity:0;transform:translate3d(0,14px,0) scale(1.06)}
  22%{opacity:1}80%{opacity:.85}100%{opacity:.5;transform:translate3d(0,0,0) scale(1)}}
.sswx-vignette{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,transparent 30%,rgba(5,1,15,.8) 78%);}

.sswx-radar{position:absolute;left:50%;top:45%;width:min(76vw,540px);aspect-ratio:1;transform:translate(-50%,-50%);}
.sswx-ring{position:absolute;inset:0;margin:auto;border-radius:50%;border:1px solid rgba(196,132,252,.35);
  opacity:0;animation:sswx-ping 2.6s cubic-bezier(.2,.7,.3,1) both;}
.sswx-ring.r1{width:26%;height:26%;animation-delay:.10s}
.sswx-ring.r2{width:26%;height:26%;animation-delay:.45s}
.sswx-ring.r3{width:26%;height:26%;animation-delay:.80s}
@keyframes sswx-ping{0%{opacity:0;transform:scale(.35)}18%{opacity:.85}100%{opacity:0;transform:scale(3.9)}}
.sswx-sweep{position:absolute;inset:0;border-radius:50%;opacity:0;
  background:conic-gradient(from 0deg,transparent 0deg,rgba(168,85,247,.00) 250deg,rgba(217,70,239,.30) 330deg,rgba(244,114,182,.55) 358deg,transparent 360deg);
  -webkit-mask-image:radial-gradient(circle,transparent 12%,#000 13%,#000 68%,transparent 70%);
          mask-image:radial-gradient(circle,transparent 12%,#000 13%,#000 68%,transparent 70%);
  animation:sswx-spin 1.55s linear 2,sswx-fadein .4s ease both;}
@keyframes sswx-spin{to{transform:rotate(360deg)}}
@keyframes sswx-fadein{to{opacity:1}}

.sswx-lattice{position:absolute;left:50%;top:45%;width:min(62vw,420px);aspect-ratio:1;transform:translate(-50%,-50%);}
.sswx-lattice .lat{stroke:rgba(196,132,252,.55);stroke-width:1.1;fill:none;
  stroke-dasharray:1400;stroke-dashoffset:1400;animation:sswx-draw 1.5s cubic-bezier(.6,0,.2,1) both;}
.sswx-lattice .lat-a{animation-delay:.10s}
.sswx-lattice .lat-b{animation-delay:.28s;stroke:rgba(244,114,182,.45)}
.sswx-lattice .lat-c{animation-delay:.46s;stroke:rgba(168,85,247,.30)}
.sswx-lattice .lat-d{animation-delay:.60s;stroke:rgba(196,132,252,.18)}
@keyframes sswx-draw{to{stroke-dashoffset:0}}

.sswx-br{position:absolute;width:26px;height:26px;border:2px solid rgba(196,132,252,.5);opacity:0;
  animation:sswx-fadein .5s ease .9s both;}
.sswx-br.tl{top:22px;left:22px;border-right:0;border-bottom:0}
.sswx-br.tr{top:22px;right:22px;border-left:0;border-bottom:0}
.sswx-br.bl{bottom:22px;left:22px;border-right:0;border-top:0}
.sswx-br.br{bottom:22px;right:22px;border-left:0;border-top:0}

.sswx-center{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 24px;}
.sswx-markwrap{position:relative;display:grid;place-items:center;margin-bottom:18px;}
.sswx-mark{width:clamp(74px,15vw,112px);height:auto;object-fit:contain;
  filter:drop-shadow(0 0 26px rgba(168,85,247,.75));
  animation:sswx-mark-in 1.05s cubic-bezier(.16,1,.3,1) .35s both;}
@keyframes sswx-mark-in{0%{opacity:0;transform:translateY(16px) scale(.72)}
  60%{opacity:1}100%{opacity:1;transform:translateY(0) scale(1)}}
.sswx-pulse{position:absolute;width:150%;aspect-ratio:1;border-radius:50%;
  background:radial-gradient(circle,rgba(168,85,247,.35) 0%,transparent 62%);
  animation:sswx-breathe 2.1s ease-in-out .8s infinite;}
@keyframes sswx-breathe{0%,100%{opacity:.45;transform:scale(.92)}50%{opacity:.85;transform:scale(1.06)}}

.sswx-title{margin:0;font-family:'Raleway',system-ui,sans-serif;font-weight:800;letter-spacing:.06em;
  font-size:clamp(20px,5.2vw,38px);line-height:1.18;color:#F1F4FF;text-transform:uppercase;}
.sswx-title .w{display:inline-block;opacity:0;filter:blur(9px);
  animation:sswx-word .62s cubic-bezier(.2,.8,.2,1) both;}
.sswx-title .w1{animation-delay:.80s}.sswx-title .w2{animation-delay:.90s}
.sswx-title .w3{animation-delay:1.00s;color:#c084fc}.sswx-title .w4{animation-delay:1.10s}
.sswx-title .w5{animation-delay:1.20s;
  background:linear-gradient(90deg,#c084fc,#f472b6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
@keyframes sswx-word{to{opacity:1;filter:blur(0);transform:none}}

.sswx-rule{width:0;height:1px;margin:16px auto 12px;
  background:linear-gradient(90deg,transparent,#c084fc,#f472b6,transparent);
  animation:sswx-rule .85s cubic-bezier(.2,.8,.2,1) 1.32s both;}
@keyframes sswx-rule{to{width:min(64vw,320px)}}

.sswx-by{margin:0;font-size:clamp(11px,2.6vw,13px);letter-spacing:.16em;text-transform:uppercase;
  color:#A3A3CC;opacity:0;animation:sswx-fadeup .6s ease 1.55s both;}
.sswx-by strong{color:#F1F4FF;font-weight:700;}
@keyframes sswx-fadeup{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

.sswx-dev{position:absolute;right:22px;bottom:22px;z-index:2;margin:0;
  font-size:clamp(9px,2.2vw,11px);letter-spacing:.13em;text-transform:uppercase;color:#6f6f96;
  opacity:0;animation:sswx-fadeup .6s ease 1.85s both;}
.sswx-dev strong{color:#A3A3CC;font-weight:600;}

.sswx-progress{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:2;
  width:min(46vw,190px);height:2px;border-radius:2px;background:rgba(196,132,252,.14);overflow:hidden;}
.sswx-progress>span{display:block;height:100%;width:0;border-radius:2px;
  background:linear-gradient(90deg,#a855f7,#f472b6);animation:sswx-bar ${TOTAL_MS}ms cubic-bezier(.35,.1,.2,1) both;}
@keyframes sswx-bar{to{width:100%}}

@media (prefers-reduced-motion:reduce){
  .sswx-splash *{animation:none!important;transition:none!important;}
  .sswx-grid,.sswx-mark,.sswx-by,.sswx-dev,.sswx-br,.sswx-sweep{opacity:1!important;}
  .sswx-title .w{opacity:1!important;filter:none!important;}
  .sswx-lattice .lat{stroke-dashoffset:0!important;}
  .sswx-rule{width:min(64vw,320px)!important;}
  .sswx-progress>span{width:100%!important;}
}
`;

export default SplashScreen;
