import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { BASE_API } from "../config";
import { US_STATES, MAP_W, MAP_H, project } from "../lib/usAlbers";

// "Will I see severe weather?" — a true total-severe probability map, distinct from
// the SPC categorical outlook. Day 1-3 read the categorical product (whose bins ARE
// defined by total-severe probability thresholds) and Day 4-8 read SPC's probabilistic
// any-severe product; both collapse to one friendly 6-step likelihood scale. Rendered
// self-contained on the albers-USA outline with a soft gradient so it reads as a
// heatmap, and exports to a shareable PNG.

export const PROB_STEPS = [
  { key: 0, label: "Highly Unlikely", note: "General storms · <2%", color: "#1e40af" },
  { key: 1, label: "Not Likely", note: "~5% within 25 mi", color: "#0891b2" },
  { key: 2, label: "Maybe", note: "~15% within 25 mi", color: "#16a34a" },
  { key: 3, label: "Likely", note: "~30% within 25 mi", color: "#f59e0b" },
  { key: 4, label: "Very Likely", note: "~45% within 25 mi", color: "#ef4444" },
  { key: 5, label: "Almost Certain", note: "60%+ within 25 mi", color: "#d946ef" },
];
const CAT_STEP: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };

function pctStep(pct: number): number {
  if (pct >= 60) return 5; if (pct >= 45) return 4; if (pct >= 30) return 3;
  if (pct >= 15) return 2; if (pct >= 5) return 1; return 0;
}
function labelToPct(label: string): number | null {
  const f = parseFloat(label);
  if (Number.isNaN(f)) return null;
  return f <= 1 ? Math.round(f * 100) : Math.round(f);
}

type Poly = { d: string; step: number };
type Status = "loading" | "ok" | "empty" | "error";

export function ProbabilityMap({ day }: { day: number }) {
  const [polys, setPolys] = useState<Poly[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [topStep, setTopStep] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const isProb = day >= 4;
  const product = isProb ? `day${day}prob` : `day${day}otlk_cat`;
  const title = `Day ${day} — Severe Weather Probability`;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`${BASE_API}/spc/outlook-geojson?product=${product}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { features?: GeoJSON.Feature[] }) => {
        if (cancelled) return;
        const out: Poly[] = [];
        let maxStep = 0;
        for (const f of data.features ?? []) {
          const label = String(f.properties?.LABEL ?? "");
          let step: number | null;
          if (isProb) { const pct = labelToPct(label); step = pct == null ? null : pctStep(pct); }
          else step = CAT_STEP[label.toUpperCase()] ?? null;
          if (step == null) continue;
          if (step > maxStep) maxStep = step;
          const g = f.geometry as GeoJSON.Geometry;
          const rings: number[][][][] =
            g?.type === "Polygon" ? [(g as GeoJSON.Polygon).coordinates]
            : g?.type === "MultiPolygon" ? (g as GeoJSON.MultiPolygon).coordinates : [];
          for (const poly of rings) {
            let path = "";
            for (const ring of poly) {
              ring.forEach((co, i) => { const p = project(co[0], co[1]); path += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; });
              path += "Z";
            }
            out.push({ d: path, step });
          }
        }
        out.sort((a, b) => a.step - b.step);
        setPolys(out); setTopStep(maxStep); setStatus(out.length ? "ok" : "empty");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [product, isProb]);

  const legend = [...PROB_STEPS].reverse();
  const legW = 250, rowH = 26, legH = legend.length * rowH + 30;
  const legX = MAP_W - legW - 14, legY = MAP_H - legH - 30;
  const filterId = `probblur-${day}`;

  async function rasterize(): Promise<Blob | null> {
    const svg = svgRef.current; if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    try { await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej; img.src = url; }); } catch { return null; }
    const scale = 2, canvas = document.createElement("canvas");
    canvas.width = MAP_W * scale; canvas.height = MAP_H * scale;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  }
  const fname = `sswx-severe-probability-day${day}.png`;
  async function download() {
    const b = await rasterize(); if (!b) return;
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u);
  }
  async function share() {
    const b = await rasterize(); if (!b) return;
    const file = new File([b], fname, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title, text: `${title} — StormSync WX` }); return; } catch { /* cancelled */ }
    }
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden border border-border bg-[#0a0e1a]">
        <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W} height={MAP_H} xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5" /></filter>
          </defs>
          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#0a0e1a" />
          <g>{US_STATES.map((s, i) => <path key={i} d={s.d} fill="#141a28" stroke="#2b3650" strokeWidth={0.8} />)}</g>
          <g filter={`url(#${filterId})`}>
            {polys.map((p, i) => <path key={i} d={p.d} fill={PROB_STEPS[p.step].color} fillOpacity={0.62} stroke={PROB_STEPS[p.step].color} strokeWidth={1} strokeOpacity={0.5} />)}
          </g>
          {/* re-draw state borders thinly over the soft fill for orientation */}
          <g>{US_STATES.map((s, i) => <path key={i} d={s.d} fill="none" stroke="#2b3650" strokeWidth={0.6} strokeOpacity={0.5} />)}</g>
          <text x={20} y={36} fill="#ffffff" fontSize={28} fontWeight={800} fontFamily="system-ui, sans-serif">{title}</text>
          <text x={20} y={60} fill="#8FAEC0" fontSize={16} fontFamily="system-ui, sans-serif">Will I see severe weather? · United States</text>
          <text x={20} y={MAP_H - 16} fill="#5b6680" fontSize={14} fontFamily="system-ui, sans-serif">StormSync WX · derived from NOAA SPC outlooks</text>
          {status === "ok" && (
            <>
              <text x={MAP_W - 16} y={30} textAnchor="end" fill="#ffffff" fillOpacity={0.6} fontSize={11} letterSpacing={2} fontFamily="system-ui, sans-serif">PEAK LIKELIHOOD</text>
              <text x={MAP_W - 16} y={52} textAnchor="end" fill={PROB_STEPS[topStep].color} fontSize={18} fontWeight={700} fontFamily="system-ui, sans-serif">{PROB_STEPS[topStep].label}</text>
              <g>
                <rect x={legX} y={legY} width={legW} height={legH} rx={8} fill="#000000" fillOpacity={0.74} />
                <text x={legX + 14} y={legY + 20} fill="#ffffff" fillOpacity={0.6} fontSize={11} letterSpacing={2} fontFamily="system-ui, sans-serif">SEVERE CHANCE</text>
                {legend.map((s, i) => (
                  <g key={s.key}>
                    <rect x={legX + 14} y={legY + 28 + i * rowH} width={15} height={15} rx={3} fill={s.color} />
                    <text x={legX + 38} y={legY + 36 + i * rowH} fill="#ffffff" fontSize={13} fontWeight={600} fontFamily="system-ui, sans-serif">{s.label}</text>
                    <text x={legX + 38} y={legY + 49 + i * rowH} fill="#ffffff" fillOpacity={0.5} fontSize={10} fontFamily="system-ui, sans-serif">{s.note}</text>
                  </g>
                ))}
              </g>
            </>
          )}
        </svg>
        {status === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-primary"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />Rendering…</div>}
        {status === "empty" && <div className="absolute inset-0 flex items-center justify-center"><div className="text-center text-sm text-muted-foreground bg-black/60 px-4 py-3 rounded-lg"><div className="text-2xl mb-1">🌤</div>No severe-weather probability for this day</div></div>}
        {status === "error" && <div className="absolute inset-0 flex items-center justify-center"><div className="text-sm text-red-400 bg-black/60 px-4 py-2 rounded">Could not load probability data</div></div>}
      </div>
      <div className="flex gap-2">
        <button onClick={download} disabled={status !== "ok"} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-semibold disabled:opacity-40"><Download className="w-4 h-4" /> Download</button>
        <button onClick={share} disabled={status !== "ok"} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-medium hover:border-primary/40 transition-colors disabled:opacity-40"><Share2 className="w-4 h-4" /> Share</button>
      </div>
    </div>
  );
}
