import { useMemo, useRef, useState } from "react";
import { Download, Share2, Loader2 } from "lucide-react";
import { US_STATES, MAP_W, MAP_H, project } from "../lib/usAlbers";

/**
 * Downloadable static history map (P-3.2) — the piece the page was missing.
 *
 * Mirrors the ryanhallyall.com/history posters ("LAST 3 DAYS OF WARNINGS",
 * "TORNADO PATHS - PAST 90 DAYS"): title block, date range + count, the CONUS
 * with the geometry drawn on it, a stats box and a colour-coded legend with
 * per-category counts — rendered as SVG so it exports crisp at 2x.
 */

export interface StatBox { label: string; value: string; color?: string }
export interface LegendRow { label: string; color: string; count: number }

interface Props {
  title: string;
  subtitle: string;          // e.g. "Jul 30, 2026 - Aug 1, 2026 | 195 warnings"
  updatedLabel: string;      // e.g. "Updated: 2026-08-02 09:00 UTC"
  /** Polygons in lon/lat rings (warnings) */
  polygons?: { rings: number[][][]; color: string }[];
  /** Line segments in lon/lat (tornado paths) */
  lines?: { coords: number[][]; color: string }[];
  stats?: StatBox[];
  legend: LegendRow[];
  legendTitle: string;
  fileBase: string;
  loading?: boolean;
}

// CONUS-only for the poster: the Alaska/Hawaii insets sit exactly where the
// impact box and footer belong, and the reference posters are CONUS anyway.
const CONUS = US_STATES.filter(s => s.name !== "Alaska" && s.name !== "Hawaii");

const BG = "#0b0b0d";
const LAND = "#3a3a3d";
const BORDER = "#ffffff";

export function StaticHistoryMap({
  title, subtitle, updatedLabel, polygons = [], lines = [],
  stats = [], legend, legendTitle, fileBase, loading,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);

  const W = MAP_W, H = MAP_H;
  const HEADER = 92, FOOTER = 8;
  const TOTAL_H = H + HEADER + FOOTER;

  const polyPaths = useMemo(() => polygons.map(p => ({
    color: p.color,
    d: p.rings.map(ring =>
      ring.map((c, i) => {
        const pt = project(c[0], c[1]);
        return `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join("") + "Z").join(" "),
  })), [polygons]);

  const linePaths = useMemo(() => lines.map(l => ({
    color: l.color,
    d: l.coords.map((c, i) => {
      const pt = project(c[0], c[1]);
      return `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }).join(""),
  })), [lines]);

  async function toPng(): Promise<Blob | null> {
    const svg = svgRef.current;
    if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = W * scale; canvas.height = TOTAL_H * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
    } finally { URL.revokeObjectURL(url); }
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await toPng();
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fileBase}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } finally { setBusy(false); }
  }

  async function share() {
    setBusy(true);
    try {
      const blob = await toPng();
      if (!blob) return;
      const file = new File([blob], `${fileBase}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title });
      else await download();
    } catch { /* user cancelled */ } finally { setBusy(false); }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${W} ${TOTAL_H}`}
          width="100%"
          style={{ display: "block", background: BG, minWidth: 320 }}
        >
          <rect x={0} y={0} width={W} height={TOTAL_H} fill={BG} />

          {/* ── header ── */}
          <text x={22} y={46} fill="#ffffff" fontSize={title.length > 24 ? 31 : 38} fontWeight={800}
            fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" letterSpacing="0.5">{title}</text>
          <text x={24} y={72} fill="#c9c9cf" fontSize={17}
            fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">{subtitle}</text>
          <text x={W - 22} y={30} fill="#9a9aa2" fontSize={13} textAnchor="end"
            fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">{updatedLabel}</text>

          {/* ── map ── */}
          <g transform={`translate(0, ${HEADER})`}>
            {CONUS.map((s, i) => (
              <path key={i} d={s.d} fill={LAND} stroke={BORDER} strokeWidth={1.1} strokeLinejoin="round" />
            ))}
            {polyPaths.map((p, i) => (
              <path key={`p${i}`} d={p.d} fill={p.color} fillOpacity={0.28} stroke={p.color} strokeWidth={1.6} />
            ))}
            {linePaths.map((l, i) => (
              <path key={`l${i}`} d={l.d} fill="none" stroke={l.color} strokeWidth={3.2} strokeLinecap="round" />
            ))}

            {/* stats box */}
            {stats.length > 0 && (
              <g transform={`translate(24, ${H - 34 - stats.length * 30})`}>
                <rect x={-12} y={-26} width={228} height={stats.length * 30 + 34} rx={10}
                  fill="#000000" fillOpacity={0.72} stroke="#ffffff" strokeOpacity={0.14} />
                <text x={0} y={-6} fill="#d8d8de" fontSize={15} fontWeight={700} letterSpacing="1.6"
                  fontFamily="system-ui, sans-serif">IMPACT</text>
                {stats.map((s, i) => (
                  <text key={s.label} x={0} y={20 + i * 30} fontSize={21} fontWeight={800}
                    fill={s.color ?? "#ffffff"} fontFamily="system-ui, sans-serif">
                    {s.label}: {s.value}
                  </text>
                ))}
              </g>
            )}

            {/* legend */}
            <g transform={`translate(${W - 250}, ${H - 30 - legend.length * 26})`}>
              <rect x={-14} y={-30} width={250} height={legend.length * 26 + 42} rx={10}
                fill="#000000" fillOpacity={0.72} stroke="#ffffff" strokeOpacity={0.14} />
              <text x={104} y={-10} fill="#ffffff" fontSize={15} textAnchor="middle" fontWeight={600}
                fontFamily="system-ui, sans-serif">{legendTitle}</text>
              {legend.map((l, i) => (
                <g key={l.label} transform={`translate(0, ${i * 26})`}>
                  <rect x={0} y={2} width={26} height={13} rx={2} fill={l.color} />
                  <text x={38} y={14} fill="#ffffff" fontSize={15} fontFamily="system-ui, sans-serif">
                    {l.label} ({l.count})
                  </text>
                </g>
              ))}
            </g>

            <text x={24} y={H - 12} fill="#ffffff" fontSize={16} fontWeight={700} letterSpacing="1.2"
              fontFamily="system-ui, sans-serif" opacity={0.85}>VIP.SSWX.SPACE</text>
          </g>
        </svg>
      </div>

      <div className="p-3 border-t border-border flex items-center gap-2 flex-wrap">
        <button onClick={download} disabled={busy || loading}
          className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download
        </button>
        <button onClick={share} disabled={busy || loading}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        {loading && <span className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> building…</span>}
        <span className="text-[10px] text-muted-foreground ml-auto">Exports at 2× resolution</span>
      </div>
    </div>
  );
}
