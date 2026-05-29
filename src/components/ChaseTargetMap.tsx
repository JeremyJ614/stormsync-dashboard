import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface ChaseTarget {
  name: string;
  lat: number;
  lon: number;
  swti: number;
  risk: string;
}

interface Props {
  targets: ChaseTarget[];
  loading: boolean;
}

// Target colors: T1 = magenta, T2 = orange
const TARGET_COLORS = ["#d946ef", "#f97316", "#22d3ee", "#a3e635"];

export function ChaseTargetMap({ targets, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: L.Map | null = null;

    // Leaflet must be imported after DOM is ready
    import("leaflet").then((L) => {
      if (!containerRef.current || mapRef.current) return;

      map = L.map(containerRef.current, {
        center: [39.5, -98],
        zoom: 4,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });

      // Dark CartoDB tiles — free, no key needed
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 10,
      }).addTo(map);

      mapRef.current = map;

      if (targets.length === 0) return;

      targets.forEach((t, i) => {
        const color = TARGET_COLORS[i % TARGET_COLORS.length];

        // ~150 km radius target zone
        L.circle([t.lat, t.lon], {
          color,
          fillColor: color,
          fillOpacity: 0.07,
          radius: 150_000,
          dashArray: "8 5",
          weight: 2.5,
        }).addTo(map!);

        // Center dot
        L.circleMarker([t.lat, t.lon], {
          radius: 9,
          fillColor: color,
          color: "rgba(255,255,255,0.9)",
          weight: 2,
          fillOpacity: 1,
        }).addTo(map!);

        // Label badge
        L.marker([t.lat, t.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="
              background: rgba(7,7,15,0.88);
              border: 1px solid ${color};
              color: ${color};
              padding: 3px 9px 3px 8px;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              white-space: nowrap;
              font-family: 'DM Sans', sans-serif;
              box-shadow: 0 0 10px ${color}44;
              pointer-events: none;
            ">T${i + 1}: ${t.name.split(",")[0].trim()} &nbsp;·&nbsp; SWTI ${t.swti}/100</div>`,
            iconAnchor: [-14, 28],
          }),
        }).addTo(map!);
      });

      // Fit map to show all targets
      if (targets.length > 0) {
        const bounds = L.latLngBounds(targets.map((t) => [t.lat, t.lon] as [number, number]));
        map.fitBounds(bounds.pad(0.5), { maxZoom: 6, animate: false });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.map((t) => t.name).join(",")]);

  return (
    <div className="relative rounded-b-xl overflow-hidden">
      <div
        ref={containerRef}
        style={{ height: "280px", background: "#07070F" }}
      />
      {loading && !targets.length && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex items-center gap-3 text-sm text-primary">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            AI analyzing parameters across central US…
          </div>
        </div>
      )}
      {!loading && targets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-sm text-muted-foreground">
            <div className="text-2xl mb-2">🌤</div>
            No viable chase targets today
          </div>
        </div>
      )}
    </div>
  );
}
