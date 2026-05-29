import type { Location } from "../hooks/useLocation";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import { computeSRHFromProfile, compute06kmShear, computeSWTI, cToF, msToMph } from "../utils/weatherCalc";
import { Radio, Zap, ExternalLink } from "lucide-react";

interface Props { location: Location }

export default function StormTracker({ location }: Props) {
  const { data: weather } = useOpenMeteo(location);
  const hourly = weather?.hourly;

  const cape = hourly?.cape?.[0] ?? 0;
  const li = hourly?.lifted_index?.[0] ?? 0;
  const dewC = hourly?.dew_point_2m?.[0] ?? 10;
  const srh = hourly?.wind_speed_10m
    ? computeSRHFromProfile(
        hourly.wind_speed_10m[0], hourly.wind_direction_10m?.[0] ?? 0,
        hourly.wind_speed_925hPa?.[0] ?? 0, hourly.wind_direction_925hPa?.[0] ?? 0,
        hourly.wind_speed_850hPa?.[0] ?? 0, hourly.wind_direction_850hPa?.[0] ?? 0,
        hourly.wind_speed_700hPa?.[0] ?? 0, hourly.wind_direction_700hPa?.[0] ?? 0,
        hourly.wind_speed_500hPa?.[0] ?? 0, hourly.wind_direction_500hPa?.[0] ?? 0,
      ) : 0;
  const shear = hourly?.wind_speed_10m && hourly?.wind_speed_500hPa
    ? compute06kmShear(hourly.wind_speed_10m[0], hourly.wind_direction_10m?.[0] ?? 0, hourly.wind_speed_500hPa[0], hourly.wind_direction_500hPa?.[0] ?? 0)
    : 0;
  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });

  const EXTERNAL_TOOLS = [
    { name: "RadarScope", url: "https://www.radarscope.app/", desc: "Professional radar analysis", icon: "📡" },
    { name: "NWS Radar Hub", url: "https://radar.weather.gov", desc: "National Weather Service radar viewer", icon: "🌐" },
    { name: "SPC Storm Reports", url: "https://www.spc.noaa.gov/climo/reports/today.html", desc: "Today's severe storm reports", icon: "⚡" },
    { name: "IEM Radar Viewer", url: "https://mesonet.agron.iastate.edu/GIS/radmap.phtml", desc: "Iowa Environmental Mesonet radar", icon: "🗺️" },
    { name: "COD Radar Mosaic", url: "https://weather.cod.edu/satrad/", desc: "College of DuPage mosaic radar", icon: "🛰️" },
    { name: "Pivotal Weather", url: "https://www.pivotalweather.com/model.php", desc: "Model data and analysis", icon: "📊" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Storm Tracker</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="bg-card border rounded-xl p-4" style={{ borderColor: swti.color + "60", background: swti.color + "08" }}>
        <div className="flex items-center gap-3 mb-3">
          <Zap className="w-5 h-5" style={{ color: swti.color }} />
          <h3 className="font-semibold">Current Storm Threat</h3>
          <span className="px-2 py-0.5 rounded text-xs font-bold capitalize" style={{ color: swti.color, border: `1px solid ${swti.color}50`, background: swti.color + "15" }}>
            {swti.label}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">SWTI Score</div>
            <div className="text-xl font-bold" style={{ color: swti.color }}>{swti.score}/100</div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">CAPE</div>
            <div className="text-xl font-bold">{Math.round(cape)} <span className="text-xs font-normal text-muted-foreground">J/kg</span></div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">0-3km SRH</div>
            <div className="text-xl font-bold">{Math.round(srh)} <span className="text-xs font-normal text-muted-foreground">m²/s²</span></div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">0-6km Shear</div>
            <div className="text-xl font-bold">{Math.round(shear)} <span className="text-xs font-normal text-muted-foreground">kts</span></div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold">Live NWS Radar</h3>
        </div>
        <div className="relative" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={`https://radar.weather.gov/station/KTLX/standard`}
            className="absolute inset-0 w-full h-full border-0"
            title="NWS Radar"
            loading="lazy"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {EXTERNAL_TOOLS.map((tool) => (
          <a
            key={tool.name}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors flex items-start gap-3"
          >
            <span className="text-xl">{tool.icon}</span>
            <div className="min-w-0">
              <div className="font-medium text-sm flex items-center gap-1">
                {tool.name}
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="text-xs text-muted-foreground">{tool.desc}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
