/**
 * Pan and zoom for the pre-projected Albers SVG maps.
 *
 * These maps are a fixed 975x610 drawing of the United States. At that size a
 * whole state is about forty pixels across, which is fine for reading a risk
 * area and hopeless for putting a pin on a town — the Forecast Game scores on
 * distance to a storm report, and a two-pixel slip is thirty miles of error.
 *
 * Zooming an SVG is done by moving the viewBox rather than by transforming the
 * contents: the browser re-rasterises vectors at the new scale, so state
 * outlines and risk polygons stay crisp at any magnification instead of turning
 * into a blown-up bitmap. The cost is that stroke widths and type would shrink
 * with everything else, so the scale factor `k` is handed to the children and
 * anything that should keep its on-screen size divides by it.
 *
 * A tap has to remain a tap. Pointer movement is measured, and a press that
 * travels more than a few pixels is a drag and does not place anything — which
 * is the difference between a map you can pan and a map that drops a pin every
 * time you try.
 */
import {
  memo, useCallback, useEffect, useImperativeHandle, useRef, useState,
  type ReactNode, type Ref,
} from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { ROYAL } from "../../lib/royal";

interface View { x: number; y: number; w: number; h: number }

export interface PanZoomHandle {
  /** Current magnification, 1 = the whole country. */
  zoom(): number;
  zoomBy(factor: number): void;
  reset(): void;
  /** Centre on a projected point at the given magnification. */
  centreOn(x: number, y: number, zoom?: number): void;
}

interface Props {
  width: number;
  height: number;
  maxZoom?: number;
  className?: string;
  /** Fires only for a genuine tap, in projected map coordinates. */
  onTap?: (x: number, y: number) => void;
  /** Disables tapping (but never panning — a locked map is still readable). */
  tapDisabled?: boolean;
  children: (k: number) => ReactNode;
  handleRef?: Ref<PanZoomHandle>;
  /** Extra controls rendered beside the zoom buttons. */
  controls?: ReactNode;
  ariaLabel?: string;
}

export const AlbersPanZoom = memo(function AlbersPanZoom({
  width, height, maxZoom = 14, className = "", onTap, tapDisabled,
  children, handleRef, controls, ariaLabel,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: width, h: height });
  const k = width / view.w;

  /** Keep the window inside the map, and never zoomed out past the whole map. */
  const clampView = useCallback((v: View): View => {
    const w = Math.min(width, Math.max(width / maxZoom, v.w));
    const h = w * (height / width);
    return {
      w, h,
      x: Math.min(Math.max(v.x, 0), width - w),
      y: Math.min(Math.max(v.y, 0), height - h),
    };
  }, [width, height, maxZoom]);

  /** Zoom about a fixed point, so the place under the cursor stays under it. */
  const zoomAt = useCallback((factor: number, ax: number, ay: number) => {
    setView((v) => {
      const w = v.w / factor;
      const next = clampView({ ...v, w, h: w * (height / width) });
      // Re-anchor after clamping so the fixed point survives a clamped zoom.
      const fx = (ax - v.x) / v.w;
      const fy = (ay - v.y) / v.h;
      return clampView({ ...next, x: ax - fx * next.w, y: ay - fy * next.h });
    });
  }, [clampView, height, width]);

  useImperativeHandle(handleRef, () => ({
    zoom: () => width / view.w,
    zoomBy: (f: number) => zoomAt(f, view.x + view.w / 2, view.y + view.h / 2),
    reset: () => setView({ x: 0, y: 0, w: width, h: height }),
    centreOn: (x: number, y: number, z = 5) => {
      const w = Math.min(width, Math.max(width / maxZoom, width / z));
      const h = w * (height / width);
      setView(clampView({ x: x - w / 2, y: y - h / 2, w, h }));
    },
  }), [view, width, height, maxZoom, zoomAt, clampView]);

  /** Client pixel → map coordinate. */
  const toMap = useCallback((cx: number, cy: number) => {
    const el = svgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: view.x + ((cx - r.left) / r.width) * view.w,
      y: view.y + ((cy - r.top) / r.height) * view.h,
    };
  }, [view]);

  // Wheel has to be a native non-passive listener; React's synthetic one cannot
  // call preventDefault, and without that the page scrolls instead of zooming.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toMap(e.clientX, e.clientY);
      if (!p) return;
      zoomAt(Math.exp(-e.deltaY * 0.0016), p.x, p.y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toMap, zoomAt]);

  // Pointer bookkeeping: one pointer pans, two pinch.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ startX: number; startY: number; moved: number; view: View } | null>(null);
  const pinch = useRef<{ dist: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) {
      drag.current = { startX: e.clientX, startY: e.clientY, moved: 0, view };
    } else if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      drag.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && pinch.current.dist > 0) {
        const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (mid) zoomAt(d / pinch.current.dist, mid.x, mid.y);
      }
      pinch.current.dist = d;
      return;
    }

    const d = drag.current;
    if (!d) return;
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));
    if (d.moved < 3) return;               // still a tap, as far as anyone knows
    setView(clampView({
      ...d.view,
      x: d.view.x - (dx / r.width) * d.view.w,
      y: d.view.y - (dy / r.height) * d.view.h,
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved >= 4 || tapDisabled || !onTap) return;
    const p = toMap(e.clientX, e.clientY);
    if (p) onTap(p.x, p.y);
  };

  const atHome = view.w >= width - 0.5;

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="w-full h-auto block touch-none select-none"
        style={{ cursor: tapDisabled ? "grab" : "crosshair" }}
        role="application"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children(k)}
      </svg>

      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <ZoomButton label="Zoom in" onClick={() => zoomAt(1.7, view.x + view.w / 2, view.y + view.h / 2)}>
          <Plus className="w-3.5 h-3.5" />
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => zoomAt(1 / 1.7, view.x + view.w / 2, view.y + view.h / 2)}>
          <Minus className="w-3.5 h-3.5" />
        </ZoomButton>
        <ZoomButton label="Whole country" disabled={atHome}
                    onClick={() => setView({ x: 0, y: 0, w: width, h: height })}>
          <Maximize2 className="w-3.5 h-3.5" />
        </ZoomButton>
        {controls}
      </div>

      {!atHome && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums pointer-events-none"
             style={{ background: "rgba(4,6,15,0.8)", color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}` }}>
          {k.toFixed(1)}×
        </div>
      )}
    </div>
  );
});

function ZoomButton({ children, onClick, label, disabled }: {
  children: ReactNode; onClick: () => void; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled}
      className="w-7 h-7 grid place-items-center rounded-lg transition-colors disabled:opacity-35"
      style={{
        background: "rgba(4,6,15,0.82)",
        border: `1px solid ${ROYAL.hairline}`,
        color: ROYAL.text,
        backdropFilter: "blur(6px)",
      }}
    >
      {children}
    </button>
  );
}

export default AlbersPanZoom;
