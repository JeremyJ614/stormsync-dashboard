import { useEffect, useRef, useState } from "react";
import type { Location } from "../hooks/useLocation";
import { Navigation2, ExternalLink, RefreshCw, Info } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface Props { location: Location }

const PRODUCTS = [
  {
    id: "n0q", label: "Base Reflectivity", short: "Reflectivity",
    url: "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.png",
    desc: "NEXRAD national base reflectivity composite. Updates ~5 min. Shows precipitation, storm cells, squall lines.",
    external: "https://mesonet.agron.iastate.edu/GIS/ridge.phtml",
  },
  {
    id: "a2m", label: "Rotation Tracks (Az Shear)", short: "Rotation Tracks",
    url: "https://mesonet.agron.iastate.edu/data/gis/images/4326/mrms/a2m_0.png",
    desc: "MRMS low-level azimuthal shear — highlights mesocyclone and tornado rotation tracks. Brightest areas = strongest rotation.",
    external: "https://mrms.nssl.noaa.gov/qvs/product_viewer/",
  },
  {
    id: "lcref", label: "Low-Level Reflectivity", short: "Low-Level Refl.",
    url: "https://mesonet.agron.iastate.edu/data/gis/images/4326/mrms/lcref_0.png",
    desc: "MRMS lowest-angle reflectivity — captures precipitation near the surface including low-topped convection.",
    external: "https://mrms.nssl.noaa.gov/",
  },
  {
    id: "p24h", label: "24-Hour QPE", short: "24hr Precip",
    url: "https://mesonet.agron.iastate.edu/data/gis/images/4326/mrms/p24h_0.png",
    desc: "MRMS quantitative precipitation estimate — total accumulated rainfall over the past 24 hours.",
    external: "https://mrms.nssl.noaa.gov/",
  },
] as const;
type ProductId = (typeof PRODUCTS)[number]["id"];

// IEM CONUS EPSG:4326 bounds: SW[lat,lon] → NE[lat,lon]
const IEM_BOUNDS: [[number, number], [number, number]] = [[23.0, -126.0], [50.0, -65.0]];

export default function RotationalMap({ location: _ }: Props) {
  const [product, setProduct] = useState<ProductId>("n0q");
  const [bust, setBust] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  const current = PRODUCTS.find(p => p.id === product)!;

  const refresh = () => setBust(Date.now());

  useEffect(() => {
    const id = setInterval(() => setBust(Date.now()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    import("leaflet").then((L) => {
      if (!containerRef.current) return;
      if (!mapRef.current) {
        const map = L.map(containerRef.current!, {
          center: [39, -97], zoom: 4,
          zoomControl: true, attributionControl: false, scrollWheelZoom: false,
        });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 10 }).addTo(map);
        mapRef.current = map;
      }
      // Remove old overlay
      if (overlayRef.current) {
        mapRef.current.removeLayer(overlayRef.current);
        overlayRef.current = null;
      }
      // Add new overlay
      const src = `${current.url}?t=${bust}`;
      const overlay = L.imageOverlay(src, IEM_BOUNDS, { opacity: 0.85 });
      overlay.addTo(mapRef.current);
      overlayRef.current = overlay;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, bust]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Navigation2 className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold tracking-wide uppercase">National Radar &amp; MRMS</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Nationwide · Iowa Environmental Mesonet / NSSL</p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRODUCTS.map(p => (
          <button key={p.id} onClick={() => setProduct(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${product === p.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
            {p.short}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
          <h3 className="text-sm font-semibold">{current.label}</h3>
          <a href={current.external} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> Full viewer
          </a>
        </div>
        <div ref={containerRef} style={{ height: 320, background: "#0a0e1a" }} />
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-2">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p>
      </div>
    </div>
  );
}
