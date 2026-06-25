import { useState } from "react";
import type { Location } from "../hooks/useLocation";
import { useQuery } from "@tanstack/react-query";
import { GitCompare, RefreshCw, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";
import { cToF, msToMph } from "../utils/weatherCalc";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

const MODELS = [
  { id: "gfs_seamless", label: "GFS", color: "#06b6d4" },
  { id: "ecmwf_ifs025", label: "ECMWF", color: "#a78bfa" },
  { id: "icon_seamless", label: "ICON", color: "#f97316" },
  { id: "gem_seamless", label: "GEM", color: "#4ade80" },
];

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const f = (v: number) => Math.round(cToF(v));
const mph = (v: number) => Math.round(msToMph(v));

// Comparator parameters, grouped into categories. All original parameters are
// kept; categories + new variables were added for P-10.
const CATEGORIES = ["Surface", "Precipitation", "Wind", "Instability", "Upper Air", "Moisture"] as const;
interface Param { id: string; label: string; unit: string; cat: typeof CATEGORIES[number]; convert: (v: number) => number }
const PARAMS: Param[] = [
  // Surface
  { id: "temperature_2m", cat: "Surface", label: "Temperature (°F)", unit: "°F", convert: f },
  { id: "apparent_temperature", cat: "Surface", label: "Feels Like (°F)", unit: "°F", convert: f },
  { id: "dew_point_2m", cat: "Surface", label: "Dew Point (°F)", unit: "°F", convert: f },
  { id: "wet_bulb_temperature_2m", cat: "Surface", label: "Wet-Bulb Temp (°F)", unit: "°F", convert: f },
  { id: "relative_humidity_2m", cat: "Surface", label: "Relative Humidity (%)", unit: "%", convert: r0 },
  { id: "cloud_cover", cat: "Surface", label: "Cloud Cover (%)", unit: "%", convert: r0 },
  { id: "visibility", cat: "Surface", label: "Visibility (mi)", unit: "mi", convert: (v) => Math.round((v / 1609.34) * 10) / 10 },
  { id: "surface_pressure", cat: "Surface", label: "Surface Pressure (hPa)", unit: "hPa", convert: r0 },
  { id: "pressure_msl", cat: "Surface", label: "Mean Sea-Level Pressure (hPa)", unit: "hPa", convert: r0 },
  // Precipitation
  { id: "precipitation_probability", cat: "Precipitation", label: "Precip Probability (%)", unit: "%", convert: r0 },
  { id: "precipitation", cat: "Precipitation", label: "Precipitation (mm)", unit: "mm", convert: r1 },
  { id: "rain", cat: "Precipitation", label: "Rain (mm)", unit: "mm", convert: r1 },
  { id: "showers", cat: "Precipitation", label: "Showers (mm)", unit: "mm", convert: r1 },
  { id: "snowfall", cat: "Precipitation", label: "Snowfall (cm)", unit: "cm", convert: r1 },
  { id: "snow_depth", cat: "Precipitation", label: "Snow Depth (in)", unit: "in", convert: (v) => Math.round(v * 39.37 * 10) / 10 },
  // Wind
  { id: "wind_speed_10m", cat: "Wind", label: "Wind Speed (mph)", unit: "mph", convert: mph },
  { id: "wind_gusts_10m", cat: "Wind", label: "Wind Gusts (mph)", unit: "mph", convert: mph },
  { id: "wind_speed_80m", cat: "Wind", label: "80m Wind (mph)", unit: "mph", convert: mph },
  { id: "wind_speed_120m", cat: "Wind", label: "120m Wind (mph)", unit: "mph", convert: mph },
  { id: "wind_speed_925hPa", cat: "Wind", label: "925mb Wind (mph)", unit: "mph", convert: mph },
  { id: "wind_speed_850hPa", cat: "Wind", label: "850mb Wind (mph)", unit: "mph", convert: mph },
  { id: "wind_speed_700hPa", cat: "Wind", label: "700mb Wind (mph)", unit: "mph", convert: mph },
  { id: "wind_speed_500hPa", cat: "Wind", label: "500mb Wind (mph)", unit: "mph", convert: mph },
  { id: "wind_speed_300hPa", cat: "Wind", label: "300mb Wind (mph)", unit: "mph", convert: mph },
  // Instability / severe
  { id: "cape", cat: "Instability", label: "CAPE (J/kg)", unit: "J/kg", convert: r0 },
  { id: "lifted_index", cat: "Instability", label: "Lifted Index", unit: "", convert: r1 },
  { id: "convective_inhibition", cat: "Instability", label: "CIN (J/kg)", unit: "J/kg", convert: r0 },
  { id: "boundary_layer_height", cat: "Instability", label: "Boundary Layer Height (m)", unit: "m", convert: r0 },
  { id: "freezing_level_height", cat: "Instability", label: "Freezing Level (ft)", unit: "ft", convert: (v) => Math.round((v * 3.281) / 10) * 10 },
  // Upper air
  { id: "temperature_850hPa", cat: "Upper Air", label: "850mb Temp (°F)", unit: "°F", convert: f },
  { id: "temperature_700hPa", cat: "Upper Air", label: "700mb Temp (°F)", unit: "°F", convert: f },
  { id: "temperature_500hPa", cat: "Upper Air", label: "500mb Temp (°F)", unit: "°F", convert: f },
  { id: "geopotential_height_500hPa", cat: "Upper Air", label: "500mb Height (m)", unit: "m", convert: r0 },
  { id: "geopotential_height_700hPa", cat: "Upper Air", label: "700mb Height (m)", unit: "m", convert: r0 },
  { id: "relative_humidity_850hPa", cat: "Upper Air", label: "850mb RH (%)", unit: "%", convert: r0 },
  { id: "relative_humidity_700hPa", cat: "Upper Air", label: "700mb RH (%)", unit: "%", convert: r0 },
  // Moisture
  { id: "vapour_pressure_deficit", cat: "Moisture", label: "Vapour Pressure Deficit (kPa)", unit: "kPa", convert: r1 },
  { id: "et0_fao_evapotranspiration", cat: "Moisture", label: "Evapotranspiration (mm)", unit: "mm", convert: r1 },
];

function useForecastModel(location: Location, modelId: string, paramId: string) {
  return useQuery({
    queryKey: ["forecast-model", location.lat, location.lon, modelId, paramId],
    queryFn: async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(location.lat));
      url.searchParams.set("longitude", String(location.lon));
      url.searchParams.set("hourly", paramId);
      url.searchParams.set("models", modelId);
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("wind_speed_unit", "ms"); // so msToMph conversions are correct
      url.searchParams.set("forecast_days", "7");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("API error");
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });
}

export default function ForecastRunComparator({ location }: Props) {
  const [selectedParam, setSelectedParam] = useState("temperature_2m");
  const [selectedModels, setSelectedModels] = useState<string[]>(["gfs_seamless", "ecmwf_ifs025", "icon_seamless"]);
  const [hours, setHours] = useState(72);

  const paramDef = PARAMS.find(p => p.id === selectedParam)!;

  const gfsQuery = useForecastModel(location, "gfs_seamless", selectedParam);
  const ecmwfQuery = useForecastModel(location, "ecmwf_ifs025", selectedParam);
  const iconQuery = useForecastModel(location, "icon_seamless", selectedParam);
  const gemQuery = useForecastModel(location, "gem_seamless", selectedParam);

  const queryMap: Record<string, typeof gfsQuery> = {
    gfs_seamless: gfsQuery,
    ecmwf_ifs025: ecmwfQuery,
    icon_seamless: iconQuery,
    gem_seamless: gemQuery,
  };

  const times = gfsQuery.data?.hourly?.time ?? [];
  const displayHours = Math.min(hours, times.length);

  const chartData = times.slice(0, displayHours).map((t: string, i: number) => {
    const point: Record<string, string | number> = {
      time: format(parseISO(t), i % 24 === 0 ? "EEE" : "ha"),
    };
    for (const model of MODELS) {
      if (!selectedModels.includes(model.id)) continue;
      const q = queryMap[model.id];
      const raw = q.data?.hourly?.[selectedParam]?.[i];
      if (raw !== undefined && raw !== null) {
        point[model.label] = paramDef.convert(raw);
      }
    }
    return point;
  });

  const isLoading = selectedModels.some(m => queryMap[m]?.isLoading);

  const toggleModel = (id: string) => {
    setSelectedModels(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(m => m !== id) : prev
        : [...prev, id]
    );
  };

  const stats = MODELS.filter(m => selectedModels.includes(m.id)).map(model => {
    const q = queryMap[model.id];
    const data = q.data?.hourly?.[selectedParam]?.slice(0, 24) ?? [];
    if (!data.length) return null;
    const converted = data.map((v: number) => paramDef.convert(v));
    const min = Math.min(...converted);
    const max = Math.max(...converted);
    const avg = Math.round(converted.reduce((a: number, b: number) => a + b, 0) / converted.length);
    return { ...model, min, max, avg };
  }).filter(Boolean);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-wide">Forecast Run Comparator</h2>
        </div>
        <button
          onClick={() => { gfsQuery.refetch(); ecmwfQuery.refetch(); iconQuery.refetch(); gemQuery.refetch(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · Multi-model comparison via Open-Meteo</p>

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>Compare GFS, ECMWF IFS, ICON, and GEM model output side-by-side. Larger spreads between models indicate higher forecast uncertainty.</span>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div>
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-medium">Models</div>
          <div className="flex flex-wrap gap-2">
            {MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => toggleModel(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${selectedModels.includes(m.id) ? "opacity-100" : "opacity-40 border-transparent"}`}
                style={selectedModels.includes(m.id) ? { backgroundColor: m.color + "25", color: m.color, borderColor: m.color + "60" } : {}}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-medium">Parameter</div>
          <div className="space-y-2.5">
            {CATEGORIES.map(cat => (
              <div key={cat}>
                <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">{cat}</div>
                <div className="flex flex-wrap gap-1.5">
                  {PARAMS.filter(p => p.cat === cat).map(p => (
                    <button key={p.id} onClick={() => setSelectedParam(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedParam === p.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
                      {p.label.split(" (")[0]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-medium">Time Range</div>
          <div className="flex gap-2">
            {[24, 48, 72, 120, 168].map(h => (
              <button key={h} onClick={() => setHours(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hours === h ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1">{paramDef.label}</h3>
        <p className="text-xs text-muted-foreground mb-4">Next {hours} hours — {location.name}</p>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-4 h-4 border border-primary border-t-transparent rounded-full animate-spin" />
              Loading model data...
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="hsl(232 18% 16%)" strokeDasharray="3 3" opacity={0.5} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={Math.floor(hours / 12)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit={paramDef.unit} width={55} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {MODELS.filter(m => selectedModels.includes(m.id)).map(model => (
                <Line
                  key={model.id}
                  type="monotone"
                  dataKey={model.label}
                  stroke={model.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {stats.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Next 24h Model Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium">Min</th>
                  <th className="pb-2 pr-4 font-medium">Max</th>
                  <th className="pb-2 pr-4 font-medium">Avg</th>
                  <th className="pb-2 font-medium">Spread</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.map(s => s && (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 font-semibold" style={{ color: s.color }}>{s.label}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.min}{paramDef.unit}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.max}{paramDef.unit}</td>
                    <td className="py-2 pr-4 font-medium">{s.avg}{paramDef.unit}</td>
                    <td className="py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${s.max - s.min > 15 ? "bg-red-500/15 text-red-400" : s.max - s.min > 8 ? "bg-yellow-500/15 text-yellow-400" : "bg-green-500/15 text-green-400"}`}>
                        ±{s.max - s.min}{paramDef.unit}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <span className="text-red-400 font-medium">Large spread</span> = higher uncertainty. <span className="text-green-400 font-medium">Small spread</span> = models agree well.
          </p>
        </div>
      )}
    </div>
  );
}
