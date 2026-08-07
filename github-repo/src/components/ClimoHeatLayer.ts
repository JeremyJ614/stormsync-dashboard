/**
 * Canvas density heat layer for the Tornado Climatology maps (P-1.4).
 *
 * Why not markers: Leaflet's circleMarker/rectangle radii are screen-space, so a
 * 0.25° grid renders as a uniform polka-dot matrix that neither tiles the ground
 * nor scales with zoom. This layer instead accumulates soft radial blobs into an
 * offscreen canvas (classic heatmap kernel) and then colorises the accumulated
 * alpha through a palette — so it reads as a continuous field at every zoom, and
 * blob size tracks the true ground size of a grid cell.
 */
import type * as LType from "leaflet";

export type HeatPoint = [lat: number, lon: number, value: number];

export interface HeatOptions {
  /** Grid bin size in degrees — blob radius is derived from this. */
  cellDeg: number;
  /** Stops as [position 0..1, css color], ascending. */
  gradient: [number, number[]][];
  /** Multiplier on the derived radius (1 = exactly one cell wide). */
  spread?: number;
  maxOpacity?: number;
}

function buildPalette(gradient: [number, number[]][]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = gradient[0], b = gradient[gradient.length - 1];
    for (let g = 0; g < gradient.length - 1; g++) {
      if (t >= gradient[g][0] && t <= gradient[g + 1][0]) { a = gradient[g]; b = gradient[g + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    lut[i * 3] = a[1][0] + (b[1][0] - a[1][0]) * f;
    lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * f;
    lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * f;
  }
  return lut;
}

/** Offscreen soft-edged brush reused for every point. */
function makeBrush(r: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const d = r * 2;
  c.width = d; c.height = d;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.45, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, d, d);
  return c;
}

export function createHeatLayer(L: typeof LType, points: HeatPoint[], opts: HeatOptions): LType.Layer {
  const palette = buildPalette(opts.gradient);
  const spread = opts.spread ?? 1.25;
  const maxOpacity = opts.maxOpacity ?? 0.92;
  const maxVal = points.reduce((m, p) => (p[2] > m ? p[2] : m), 1);

  const Heat = L.Layer.extend({
    onAdd(map: LType.Map) {
      this._map = map;
      const canvas: HTMLCanvasElement = L.DomUtil.create("canvas", "leaflet-layer sswx-heat") as HTMLCanvasElement;
      canvas.style.pointerEvents = "none";
      this._canvas = canvas;
      map.getPanes().overlayPane.appendChild(canvas);
      map.on("moveend zoomend resize", this._reset, this);
      // Keep the canvas glued to the map while a zoom animates.
      if (map.options.zoomAnimation && L.Browser.any3d) map.on("zoomanim", this._animateZoom, this);
      this._reset();
    },

    onRemove(map: LType.Map) {
      map.off("moveend zoomend resize", this._reset, this);
      map.off("zoomanim", this._animateZoom, this);
      if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
      this._canvas = null;
    },

    _animateZoom(e: { zoom: number; center: LType.LatLng }) {
      const map = this._map as LType.Map;
      const scale = map.getZoomScale(e.zoom, map.getZoom());
      // `_latLngBoundsToNewLayerBounds` is a Leaflet internal (not in the public
      // typings) but is the standard way canvas overlays follow a zoom animation.
      const internal = map as unknown as {
        _latLngBoundsToNewLayerBounds: (b: LType.LatLngBounds, z: number, c: LType.LatLng) => { min?: LType.Point };
      };
      const offset = internal._latLngBoundsToNewLayerBounds(map.getBounds(), e.zoom, e.center)?.min;
      if (offset) L.DomUtil.setTransform(this._canvas, offset, scale);
    },

    _reset() {
      const map = this._map as LType.Map;
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      if (this._canvas.width !== size.x) this._canvas.width = size.x;
      if (this._canvas.height !== size.y) this._canvas.height = size.y;
      this._draw();
    },

    _draw() {
      const map = this._map as LType.Map;
      const cv: HTMLCanvasElement = this._canvas;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!points.length) return;

      // Ground size of one grid cell, in screen px at the current zoom.
      const c = map.getCenter();
      const a = map.latLngToContainerPoint([c.lat, c.lng]);
      const b = map.latLngToContainerPoint([c.lat, c.lng + opts.cellDeg]);
      const cellPx = Math.abs(b.x - a.x);
      const r = Math.max(3, Math.min(46, cellPx * spread));
      const brush = makeBrush(r);

      // 1) accumulate alpha
      ctx.globalCompositeOperation = "source-over";
      const pad = r;
      for (const [lat, lon, v] of points) {
        const p = map.latLngToContainerPoint([lat + opts.cellDeg / 2, lon + opts.cellDeg / 2]);
        if (p.x < -pad || p.y < -pad || p.x > cv.width + pad || p.y > cv.height + pad) continue;
        // sqrt keeps sparse cells visible without washing out the cores
        ctx.globalAlpha = Math.max(0.06, Math.min(1, Math.sqrt(v / maxVal)));
        ctx.drawImage(brush, p.x - r, p.y - r);
      }
      ctx.globalAlpha = 1;

      // 2) colorise accumulated alpha through the palette
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      const d = img.data;
      for (let i = 3; i < d.length; i += 4) {
        const alpha = d[i];
        if (!alpha) continue;
        const j = alpha * 3;
        d[i - 3] = palette[j];
        d[i - 2] = palette[j + 1];
        d[i - 1] = palette[j + 2];
        d[i] = Math.min(255, alpha * maxOpacity + 28);
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  return new Heat();
}
