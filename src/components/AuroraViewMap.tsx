import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Approx southern "view line" latitude (°N, North America) where the aurora may be
// seen low on the northern horizon for a given Kp — the line Ryan Hall draws.
const VIEW: [number, number][] = [
  [0, 66], [1, 63], [2, 60], [3, 56], [4, 53], [5, 50], [6, 47], [7, 43], [8, 40], [9, 37],
];
export function viewLineLat(kp: number): number {
  const k = Math.max(0, Math.min(9, kp));
  for (let i = 0; i < VIEW.length - 1; i++) {
    const [k0, l0] = VIEW[i], [k1, l1] = VIEW[i + 1];
    if (k >= k0 && k <= k1) { const t = (k - k0) / (k1 - k0 || 1); return l0 + (l1 - l0) * t; }
  }
  return VIEW[VIEW.length - 1][1];
}
export function kpColor(kp: number): string {
  if (kp >= 8) return "#d946ef"; if (kp >= 6) return "#ef4444"; if (kp >= 5) return "#f97316";
  if (kp >= 4) return "#fde047"; if (kp >= 3) return "#86efac"; return "#4ade80";
}

interface Props { peakKp: number; currentKp: number; userLat: number; userLon: number; userName: string; height?: number }

export function AuroraViewMap({ peakKp, currentKp, userLat, userLon, userName, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        const map = L.map(containerRef.current!, { center: [50, -96], zoom: 3, zoomControl: true, attributionControl: false, scrollWheelZoom: false });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 8 }).addTo(map);
        mapRef.current = map;
      }
      const map = mapRef.current!;
      if (layerRef.current) map.removeLayer(layerRef.current);
      const g = L.layerGroup().addTo(map);
      layerRef.current = g;

      const W = -130, E = -58;
      const peakLat = viewLineLat(peakKp), curLat = viewLineLat(currentKp);
      const pc = kpColor(peakKp);
      // "Aurora possible" band north of the peak-Kp view line.
      L.polygon([[peakLat, W], [peakLat, E], [75, E], [75, W]], { color: pc, weight: 0, fillColor: pc, fillOpacity: 0.13 }).addTo(g);
      // Peak (3-day) view line.
      L.polyline([[peakLat, W], [peakLat, E]], { color: pc, weight: 3, opacity: 0.95, className: "aurora-peak" }).addTo(g)
        .bindTooltip(`Kp ${peakKp.toFixed(1)} view line ~${Math.round(peakLat)}°N`, { sticky: true });
      // Current view line (dashed) when it differs from the peak.
      if (Math.abs(curLat - peakLat) > 0.3) {
        L.polyline([[curLat, W], [curLat, E]], { color: kpColor(currentKp), weight: 2, opacity: 0.85, dashArray: "6 6" }).addTo(g)
          .bindTooltip(`Now: Kp ${currentKp.toFixed(1)} ~${Math.round(curLat)}°N`, { sticky: true });
      }
      // User location.
      L.circleMarker([userLat, userLon], { radius: 5, color: "#fff", weight: 2, fillColor: userLat >= peakLat ? pc : "#64748b", fillOpacity: 1 }).addTo(g)
        .bindTooltip(userName, { sticky: true });
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peakKp, currentKp, userLat, userLon]);

  const peakLat = viewLineLat(peakKp);
  const visible = userLat >= peakLat;
  return (
    <div className="relative rounded-xl overflow-hidden border border-border">
      <style>{`.aurora-peak { filter: drop-shadow(0 0 4px currentColor); }`}</style>
      <div ref={containerRef} style={{ height, background: "#05010f" }} />
      <div className="absolute top-2 left-2 bg-black/75 rounded-lg px-2.5 py-1.5 pointer-events-none" style={{ zIndex: 1000 }}>
        <div className="text-[9px] uppercase tracking-[0.25em] text-white/60">Peak Kp · 3-day</div>
        <div className="text-xs font-bold" style={{ color: kpColor(peakKp) }}>Kp {peakKp.toFixed(1)} · view line ~{Math.round(peakLat)}°N</div>
      </div>
      <div className="absolute bottom-2 left-2 bg-black/80 rounded-lg px-3 py-1.5 pointer-events-none" style={{ zIndex: 1000 }}>
        <div className="text-[10px] font-medium" style={{ color: visible ? "#4ade80" : "#94a3b8" }}>
          {visible ? `${userName} is north of the view line — aurora possible` : `${userName} is south of the view line`}
        </div>
      </div>
    </div>
  );
}
