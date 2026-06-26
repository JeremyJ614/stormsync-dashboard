import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { BASE_API } from "../config";
import { LEVELS, featureLevel, productKind, type SPCProduct } from "./SPCLeafletMap";
import { MAP_W, MAP_H, project } from "../lib/usAlbers";
import { UsStatesBackdrop, UsStateLabels } from "./UsStatesBackdrop";

// A self-contained, non-interactive SPC outlook map in the SSWX palette. It draws
// the same risk levels/colors as the live Leaflet map (shared from SPCLeafletMap)
// onto a pre-projected albers-USA state outline — no external tiles — so the whole
// US always renders and the SVG rasterizes cleanly to a shareable PNG.

type Poly = { d: string; level: number | "sig" };
type Status = "loading" | "ok" | "empty" | "error";

function legendTitleFor(product: SPCProduct): string {
  const k = productKind(product);
  if (k === "cat") return "Threat Level";
  if (k === "anysvr") return "Severe Probability";
  return `${k === "torn" ? "Tornado" : k === "wind" ? "Wind" : "Hail"} Likelihood`;
}

export function SPCStaticMap({ product, title, subtitle }: { product: SPCProduct; title: string; subtitle: string }) {
  const [polys, setPolys] = useState<Poly[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [topLevel, setTopLevel] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`${BASE_API}/spc/outlook-geojson?product=${product}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { features?: GeoJSON.Feature[] }) => {
        if (cancelled) return;
        const out: Poly[] = [];
        let maxLvl = 0;
        for (const f of data.features ?? []) {
          const lvl = featureLevel(product, f);
          if (lvl === null) continue;
          if (typeof lvl === "number" && lvl > maxLvl) maxLvl = lvl;
          const g = f.geometry as GeoJSON.Geometry;
          const rings: number[][][][] =
            g?.type === "Polygon" ? [(g as GeoJSON.Polygon).coordinates]
            : g?.type === "MultiPolygon" ? (g as GeoJSON.MultiPolygon).coordinates
            : [];
          for (const poly of rings) {
            let path = "";
            for (const ring of poly) {
              ring.forEach((co, i) => { const p = project(co[0], co[1]); path += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; });
              path += "Z";
            }
            out.push({ d: path, level: lvl });
          }
        }
        out.sort((a, b) => (a.level === "sig" ? 99 : a.level) - (b.level === "sig" ? 99 : b.level));
        setPolys(out); setTopLevel(maxLvl); setStatus(out.length ? "ok" : "empty");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [product]);

  const kind = productKind(product);
  const legend = (kind === "cat" ? LEVELS.map((v, i) => ({ ...v, i })) : LEVELS.map((v, i) => ({ ...v, i })).slice(1));
  const legW = 252, rowH = 22, legH = legend.length * rowH + 30;
  const legX = MAP_W - legW - 14, legY = MAP_H - legH - 32;
  const readoutColor = topLevel === 5 ? "#BBB7CC" : LEVELS[topLevel].color;

  async function rasterize(): Promise<Blob | null> {
    const svg = svgRef.current; if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    try { await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej; img.src = url; }); }
    catch { return null; }
    const scale = 2, canvas = document.createElement("canvas");
    canvas.width = MAP_W * scale; canvas.height = MAP_H * scale;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  }
  const fname = `sswx-${product}.png`;
  async function download() {
    const b = await rasterize(); if (!b) return;
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u);
  }
  async function share() {
    const b = await rasterize(); if (!b) return;
    const file = new File([b], fname, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title, text: `${title} — ${subtitle}` }); return; } catch { /* cancelled */ }
    }
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden border border-border bg-[#0a0e1a]">
        <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} width={MAP_W} height={MAP_H} xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto", display: "block" }}>
          <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#0a0e1a" />
          <UsStatesBackdrop labels={false} />
          <g>
            {polys.map((p, i) => {
              if (p.level === "sig") return <path key={i} d={p.d} fill="none" stroke="#ffffff" strokeWidth={2.4} opacity={0.95} />;
              const lvl = p.level, dark = lvl === 2 || lvl === 0;
              const op = lvl === 5 ? 0.9 : lvl === 0 ? 0.32 : dark ? 0.72 : 0.6;
              return <path key={i} d={p.d} fill={LEVELS[lvl].color} fillOpacity={op} stroke={lvl === 5 ? "#9896A4" : LEVELS[lvl].color} strokeWidth={lvl === 5 ? 2.4 : 1} />;
            })}
          </g>
          <UsStateLabels />
          {/* Title + brand (baked into the PNG) */}
          <text x={20} y={36} fill="#ffffff" fontSize={28} fontWeight={800} fontFamily="system-ui, -apple-system, sans-serif">{title}</text>
          <text x={20} y={60} fill="#8FAEC0" fontSize={16} fontFamily="system-ui, -apple-system, sans-serif">{subtitle}</text>
          <text x={20} y={MAP_H - 16} fill="#5b6680" fontSize={14} fontFamily="system-ui, -apple-system, sans-serif">StormSync WX · NOAA Storm Prediction Center</text>
          {status === "ok" && (
            <>
              <text x={MAP_W - 16} y={30} textAnchor="end" fill="#ffffff" fillOpacity={0.6} fontSize={11} letterSpacing={2} fontFamily="system-ui, sans-serif">HIGHEST RISK</text>
              <text x={MAP_W - 16} y={52} textAnchor="end" fill={readoutColor} fontSize={18} fontWeight={700} fontFamily="system-ui, sans-serif">{LEVELS[topLevel].label}</text>
              <g>
                <rect x={legX} y={legY} width={legW} height={legH} rx={8} fill="#000000" fillOpacity={0.72} />
                <text x={legX + 14} y={legY + 20} fill="#ffffff" fillOpacity={0.6} fontSize={11} letterSpacing={2} fontFamily="system-ui, sans-serif">{legendTitleFor(product).toUpperCase()}</text>
                {legend.map((item, i) => (
                  <g key={item.i}>
                    <rect x={legX + 14} y={legY + 30 + i * rowH} width={13} height={13} rx={3} fill={item.color} stroke={item.i === 5 ? "#9896A4" : "none"} strokeWidth={item.i === 5 ? 1 : 0} />
                    <text x={legX + 36} y={legY + 41 + i * rowH} fill="#ffffff" fontSize={12.5} fontFamily="system-ui, sans-serif">{item.label}</text>
                  </g>
                ))}
              </g>
            </>
          )}
        </svg>
        {status === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-primary"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />Rendering…</div>}
        {status === "empty" && <div className="absolute inset-0 flex items-center justify-center"><div className="text-center text-sm text-muted-foreground bg-black/60 px-4 py-3 rounded-lg"><div className="text-2xl mb-1">🌤</div>No risk area for this outlook</div></div>}
        {status === "error" && <div className="absolute inset-0 flex items-center justify-center"><div className="text-sm text-red-400 bg-black/60 px-4 py-2 rounded">Could not load SPC data</div></div>}
      </div>
      <div className="flex gap-2">
        <button onClick={download} disabled={status !== "ok"} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-semibold disabled:opacity-40"><Download className="w-4 h-4" /> Download</button>
        <button onClick={share} disabled={status !== "ok"} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-medium hover:border-primary/40 transition-colors disabled:opacity-40"><Share2 className="w-4 h-4" /> Share</button>
      </div>
    </div>
  );
}
