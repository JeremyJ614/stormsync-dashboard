import type { Location } from "../hooks/useLocation";
import { useState } from "react";
import { Map, Layers, ZoomIn, ExternalLink } from "lucide-react";

interface Props { location: Location }

const RADAR_PRODUCTS = [
  { id: "N0B", label: "Base Reflectivity", desc: "Standard radar reflectivity (precipitation intensity)" },
  { id: "N0V", label: "Base Velocity", desc: "Wind velocity toward/away from radar" },
  { id: "N0S", label: "Storm-Rel. Velocity", desc: "Storm-relative mean radial velocity" },
  { id: "N0Q", label: "Composite Refl.", desc: "Composite reflectivity (highest in column)" },
  { id: "N0Z", label: "Long Range Refl.", desc: "Long range base reflectivity (248nm)" },
  { id: "EET", label: "Echo Tops", desc: "Height of 18.5 dBZ echo tops" },
  { id: "DVL", label: "VIL", desc: "Vertically integrated liquid water" },
  { id: "NCR", label: "Composite Refl.", desc: "NWS composite reflectivity" },
];

const NWS_STATIONS: Record<string, string[]> = {
  OKC: ["KTLX", "KVNX", "KFDR"],
  DFW: ["KFWS", "KDYX", "KNKX"],
  ATL: ["KFFC", "KGSP", "KMRX"],
  CHI: ["KLOT", "KILX", "KGRR"],
  NYC: ["KOKX", "KDIX", "KENX"],
};

export default function RadarMap({ location }: Props) {
  const [product, setProduct] = useState("N0B");
  const [station, setStation] = useState("KTLX");

  const nwsMapUrl = `https://radar.weather.gov/station/${station}/standard`;
  const iemUrl = `https://mesonet.agron.iastate.edu/iemre/multiday?lat=${location.lat}&lon=${location.lon}`;

  const radarFrameUrl = `https://radar.weather.gov/ridge/lite/${product}/${station}_0.png`;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Map className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Radar Map</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · {location.lat.toFixed(3)}, {location.lon.toFixed(3)}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><Layers className="w-3 h-3" />Product</div>
          <div className="space-y-1">
            {RADAR_PRODUCTS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProduct(p.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  product === p.id
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <div className="font-medium">{p.label}</div>
                <div className="opacity-70">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 space-y-3">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Radar Station</div>
            <div className="flex flex-wrap gap-2">
              {["KTLX", "KVNX", "KFDR", "KFWS", "KLOT", "KOKX", "KFFC", "KDMX"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStation(s)}
                  className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                    station === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">{station} · {RADAR_PRODUCTS.find(p => p.id === product)?.label}</span>
              <a
                href={nwsMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Open NWS Radar
              </a>
            </div>
            <div className="relative" style={{ paddingBottom: "60%" }}>
              <iframe
                src={nwsMapUrl}
                className="absolute inset-0 w-full h-full border-0"
                title="NWS Radar"
                loading="lazy"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a
              href={`https://www.spc.noaa.gov/exper/mesoanalysis/new/viewsector.php?sector=19&parm=pmsl`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors"
            >
              <div className="text-sm font-medium flex items-center gap-2">
                <span>🌀</span> SPC Mesoanalysis
              </div>
              <p className="text-xs text-muted-foreground mt-1">Surface analysis, CAPE, helicity, and more</p>
            </a>
            <a
              href={`https://radar.weather.gov`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors"
            >
              <div className="text-sm font-medium flex items-center gap-2">
                <span>📡</span> NWS Radar Hub
              </div>
              <p className="text-xs text-muted-foreground mt-1">Full NWS interactive radar viewer</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
