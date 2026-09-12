import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Share2 } from "lucide-react";
import { BASE_API } from "../config";
import {
  levelsFor, KIND_TITLE, classify, hazardFromProduct, levelIndexFor,
  type Kind, type Hazard,
} from "../lib/spcPalette";
import { subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot } from "../lib/mapPalette";
import { MAP_W, MAP_H, project } from "../lib/usAlbers";
import { UsStatesBackdrop, UsStateLabels, UsNationMask, useUsMaskId } from "./UsStatesBackdrop";
import type { SPCProduct, DisplayMode } from "./SPCMap";

// A self-contained, non-interactive SPC outlook map in your exact palette. It
// draws the same risk levels/colors as the live MapLibre map (shared from
// spcPalette.ts) onto a pre-projected Albers-USA state outline -- no external
// tiles, no headless browser -- so it always renders and rasterizes cleanly
// to a shareable PNG straight in the browser.

type Poly = { d: string; idx: number; sig: boolean };
type Status = "loading" | "ok" | "empty" | "lowconf" | "error";

export function SPCStaticMap({ product, mode, title, subtitle }: { product: SPCProduct; mode: DisplayMode; title: string; subtitle: string }) {
  const [polys, setPolys] = useState<Poly[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [topIdx, setTopIdx] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const maskId = useUsMaskId();

  const hazard: Hazard = hazardFromProduct(product);
  const kind: Kind = hazard === "cat" ? "cat"
    : mode === "intensity" ? (hazard === "torn" ? "tornadoIntensity" : hazard === "hail" ? "hailIntensity" : "windIntensity")
    : (hazard === "torn" ? "tornadoLikelihood" : hazard === "hail" ? "hailLikelihood" : "windLikelihood");
  // Subscribing keeps the map honest while somebody is editing the palette in
  // the admin panel: `levelsFor` reads the override synchronously, but without
  // a subscription nothing would tell React to run it again.
  const paletteState = useSyncExternalStore(
    subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot);
  void paletteState;
  const palette = levelsFor(kind);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`${BASE_API}/spc/outlook-geojson?product=${product}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { features?: GeoJSON.Feature[] }) => {
        if (cancelled) return;
        const features = data.features ?? [];
        const out: Poly[] = [];
        let maxIdx = 0, visible = 0, skipped = 0;
        for (const f of features) {
          const idx = levelIndexFor(mode, hazard, f);
          if (idx === null) { skipped++; continue; }
          visible++;
          if (idx > maxIdx) maxIdx = idx;
          const sig = mode === "intensity" && idx === 1;
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
            out.push({ d: path, idx, sig });
          }
        }
        out.sort((a, b) => a.idx - b.idx);
        setPolys(out);
        setTopIdx(maxIdx);
        if (visible === 0) {
          setStatus(/^day[4-8]prob$/.test(product) && skipped > 0 ? "lowconf" : "empty");
        } else {
          setStatus("ok");
        }
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [product, mode, hazard]);

  const legend = palette.map((v, i) => ({ ...v, i }));
  const legW = 260, rowH = 22, legH = legend.length * rowH + 30;
  const legX = MAP_W - legW - 14, legY = MAP_H - legH - 32;
  const top = palette[topIdx] ?? palette[0];

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
  const fname = `sswx-${product}-${mode}.png`;
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
          <UsNationMask id={maskId} />
          <UsStatesBackdrop />
          <g mask={`url(#${maskId})`}>
            {polys.map((p, i) => (
              <path key={i} d={p.d}
                fill={p.sig ? "none" : palette[p.idx]?.color ?? "#888"}
                fillOpacity={p.sig ? 0 : 0.6}
                stroke={p.sig ? "#ffffff" : palette[p.idx]?.color ?? "#888"}
                strokeWidth={p.sig ? 2.5 : 1}
                strokeOpacity={0.95} />
            ))}
          </g>
          <UsStateLabels />

          <rect x={16} y={16} width={280} height={44} rx={8} fill="rgba(0,0,0,0.75)" />
          <text x={30} y={34} fontSize={9} letterSpacing={2} fill="rgba(255,255,255,0.6)" fontFamily="sans-serif">HIGHEST RISK</text>
          <text x={30} y={52} fontSize={15} fontWeight={700} fill={top.color} fontFamily="sans-serif">{status === "ok" ? top.label : "—"}</text>

          {status === "ok" && (
            <g>
              <rect x={legX} y={legY} width={legW} height={legH} rx={8} fill="rgba(0,0,0,0.8)" />
              <text x={legX + 14} y={legY + 20} fontSize={9} letterSpacing={2} fill="rgba(255,255,255,0.55)" fontFamily="sans-serif">{KIND_TITLE[kind].toUpperCase()}</text>
              {legend.map((item, i) => (
                <g key={i} transform={`translate(${legX + 14}, ${legY + 32 + i * rowH})`}>
                  <rect width={12} height={12} rx={2} fill={item.color} />
                  <text x={20} y={10} fontSize={11} fill="#ffffff" fontFamily="sans-serif">{item.label}</text>
                </g>
              ))}
            </g>
          )}

          {status === "empty" && (
            <text x={MAP_W / 2} y={MAP_H / 2} fontSize={16} fill="rgba(255,255,255,0.6)" textAnchor="middle" fontFamily="sans-serif">No active severe weather risk</text>
          )}
          {status === "lowconf" && (
            <text x={MAP_W / 2} y={MAP_H / 2} fontSize={15} fill="rgba(255,255,255,0.55)" textAnchor="middle" fontFamily="sans-serif">Predictability too low for this day</text>
          )}
        </svg>
      </div>
      <div className="flex gap-2">
        <button onClick={download} disabled={status === "loading"}
          className="flex-1 px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 disabled:opacity-50 flex items-center justify-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Download Image
        </button>
        <button onClick={share} disabled={status === "loading"}
          className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:text-foreground disabled:opacity-50 flex items-center justify-center gap-1.5">
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
      </div>
    </div>
  );
}
