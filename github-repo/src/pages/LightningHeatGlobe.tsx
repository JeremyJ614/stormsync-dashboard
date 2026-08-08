import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, RefreshCw, Info, ExternalLink, Globe, MapPin, BarChart3, Loader2, CalendarDays } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from "recharts";
import type { Location } from "../hooks/useLocation";
import { getLightningClimo, monthName } from "../lib/lightningClimo";

interface Props { location: Location }

type Tab = "us" | "global" | "climo";

const LIGHTNING_FACTS = [
  { label: "Global flash rate", value: "~45 / sec", sub: "~1.4 billion strikes / year" },
  { label: "U.S. flash density", value: "~25M / yr", sub: "Florida & Gulf Coast peak" },
  { label: "Bolt temperature", value: "~50,000°F", sub: "5× hotter than the Sun's surface" },
  { label: "Bolt voltage", value: "~300M V", sub: "current up to 30,000 A" },
];

const TOP_REGIONS = [
  { region: "Lake Maracaibo, Venezuela", rate: "~232 nights / yr", note: "Catatumbo lightning" },
  { region: "Kabare, DR Congo", rate: "~205 flashes / km² / yr", note: "world record density" },
  { region: "Kampene, DR Congo", rate: "~176 flashes / km² / yr", note: "" },
  { region: "Caceres, Colombia", rate: "~172 flashes / km² / yr", note: "" },
  { region: "Singapore / Maritime SE Asia", rate: "~127 flashes / km² / yr", note: "highest in Asia" },
  { region: "Lake Okeechobee, Florida", rate: "~83 flashes / km² / yr", note: "highest in N. America" },
];

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-card px-3 py-3 text-center">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
      <div className="text-xl font-black text-yellow-400 tabular-nums mt-0.5">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export default function LightningHeatGlobe({ location }: Props) {
  const [tab, setTab] = useState<Tab>("us");
  const [bust, setBust] = useState(() => Date.now());
  const [imgError, setImgError] = useState(false);

  const refresh = () => {
    setBust(Date.now());
    setImgError(false);
  };

  // Auto-refresh GOES GLM image every 4 minutes (NESDIS updates ~every minute)
  useEffect(() => {
    if (tab !== "us") return;
    const id = setInterval(() => setBust(Date.now()), 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [tab]);

  const glmSrc = `https://cdn.star.nesdis.noaa.gov/GOES16/ABI/CONUS/GEOCOLOR/1250x750.jpg?t=${bust}`;

  // NCEI is slow and this never changes intra-session, so cache it hard.
  const climo = useQuery({
    queryKey: ["lightning-climo", location.lat.toFixed(2), location.lon.toFixed(2)],
    queryFn: () => getLightningClimo(location.lat, location.lon),
    enabled: tab === "climo",
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h2 className="text-xl font-bold tracking-wide uppercase">Lightning Density</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live U.S. GOES-19 GLM flash extent · Global real-time strike network
          </p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-400" />
        <span>
          The U.S. tab shows real-time GOES-19 <strong>Geostationary Lightning Mapper (GLM)</strong> flash extent
          density — actual strikes detected from space, updated every minute. The Global tab uses the Blitzortung
          community ground-network for real-time worldwide lightning detection.
        </span>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("us")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${tab === "us" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}>
          <MapPin className="w-4 h-4" /> Live U.S. Strikes (GOES GLM)
        </button>
        <button onClick={() => setTab("global")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${tab === "global" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}>
          <Globe className="w-4 h-4" /> Global Real-Time (Blitzortung)
        </button>
        <button onClick={() => setTab("climo")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${tab === "climo" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}>
          <BarChart3 className="w-4 h-4" /> Lightning Climatology
        </button>
      </div>

      {tab === "us" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold">GOES-19 GLM Flash Extent Density — CONUS</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs text-yellow-400 font-medium">LIVE</span>
              </div>
              <a href="https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=conus&band=EXTENT3&length=12"
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> NESDIS Loop
              </a>
            </div>
          </div>
          <div className="bg-black flex items-center justify-center" style={{ minHeight: 380 }}>
            {imgError ? (
              <div className="p-8 text-center space-y-2">
                <div className="text-3xl">⚡</div>
                <p className="text-sm text-muted-foreground">Could not load GOES GLM imagery right now.</p>
                <a href="https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=conus&band=EXTENT3"
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline">Open on NESDIS →</a>
              </div>
            ) : (
              <img
                key={glmSrc}
                src={glmSrc}
                alt="GOES-19 GLM Flash Extent Density — CONUS"
                className="w-full h-auto block"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            )}
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>Source: NOAA NESDIS · GOES-19 GLM · EXTENT3 (Flash Extent Density)</span>
              <span>Updates ~every minute</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Bright yellow / white pixels show areas where lightning flashes have been detected from geostationary orbit
              over the most recent observation window. The basemap is the GOES Channel 13 (longwave IR) cloud-top
              brightness, so you can see where convective storms are producing the strikes.
            </p>
          </div>
        </div>
      )}

      {tab === "global" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold">Blitzortung Live Lightning — Global</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs text-yellow-400 font-medium">REAL-TIME</span>
              </div>
              <a href="https://map.blitzortung.org/" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Full Map
              </a>
            </div>
          </div>
          <iframe
            key={bust}
            src="https://map.blitzortung.org/#3/30.00/-50.00"
            title="Blitzortung Live Lightning Map"
            className="w-full border-0 block"
            style={{ height: 620 }}
            allowFullScreen
            loading="lazy"
          />
          <div className="px-4 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
            <p className="leading-relaxed">
              <strong className="text-foreground">Blitzortung.org</strong> is a community-operated network of ~2,500
              VLF/LF lightning receivers worldwide. Strikes appear within ~1 second of detection. Each animated dot
              fades from white → orange → red as it ages. Click anywhere to recenter, scroll to zoom.
            </p>
          </div>
        </div>
      )}

      {tab === "climo" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold">Thunder-day climatology — {location.name}</span>
              </div>
              {climo.data && (
                <span className="text-[11px] text-muted-foreground">
                  NCEI station {climo.data.stationId} · {climo.data.sampleYears} yrs of record
                </span>
              )}
            </div>

            {climo.isLoading ? (
              <div className="py-16 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground mt-2">Pulling observed thunder days from NCEI…</p>
              </div>
            ) : !climo.data ? (
              <div className="p-6 text-center space-y-2">
                <div className="text-2xl">⛈️</div>
                <p className="text-sm font-semibold">No thunder-day record near this location</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Thunder days are logged by staffed first-order weather stations. Coverage is sparse outside
                  major airports, so some locations have no nearby station with this element.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-px bg-border">
                  <Stat label="Thunder days / yr" value={String(climo.data.annualAvg)} sub="annual average" />
                  <Stat label="Peak month"
                    value={climo.data.peakMonth !== null ? monthName(climo.data.peakMonth) : "—"}
                    sub={climo.data.peakMonth !== null ? `${climo.data.monthly[climo.data.peakMonth].avgDays} days avg` : ""} />
                  <Stat label="Storm season"
                    value={`${climo.data.monthly.filter((m) => m.avgDays >= 2).length} mo`}
                    sub="months averaging 2+ days" />
                </div>

                <div className="p-4 space-y-1">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-yellow-400" /> Average thunder days by month
                  </div>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={climo.data.monthly.map((m) => ({ name: monthName(m.month), days: m.avgDays }))}>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={26} />
                      <Tooltip contentStyle={{ background: "#0a0a18", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [`${v} days`, "Average"]} />
                      <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                        {climo.data.monthly.map((m) => (
                          <Cell key={m.month}
                            fill={m.month === climo.data!.peakMonth ? "#fbbf24" : "rgba(251,191,36,0.35)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {climo.data.yearly.length > 1 && (
                  <div className="p-4 pt-0 space-y-1">
                    <div className="text-xs font-semibold">Thunder days per year</div>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={climo.data.yearly.map((y) => ({ name: String(y.year), days: y.days }))}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={26} />
                        <Tooltip contentStyle={{ background: "#0a0a18", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: number) => [`${v} days`, "Thunder"]} />
                        <Line type="monotone" dataKey="days" stroke="#fbbf24" strokeWidth={2}
                          dot={{ r: 2.5, fill: "#fbbf24" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="px-4 py-3 border-t border-border bg-muted/10 text-[11px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Why thunder days?</strong> There is no free public archive of
                  historical strike density — the per-state flash-density numbers usually quoted come from Vaisala's
                  NLDN, which is a commercial licence. Thunder days (NCEI element <code>DYTS</code>) are the long-standing
                  observed proxy: the count of days on which thunder was actually heard or detected at the station.
                  These are real observations for the station nearest you, not a model or a national average.
                </div>
              </>
            )}
          </div>

          {/* Global hotspots belong with the climatology rather than the live maps. */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">World's Top Lightning Hotspots (NASA OTD/LIS climatology)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {TOP_REGIONS.map((r, i) => (
                <div key={r.region} className="flex items-start gap-3 bg-muted/20 rounded-lg p-3">
                  <div className="w-6 h-6 rounded-full bg-yellow-400/15 text-yellow-400 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.region}</div>
                    <div className="text-xs text-yellow-400/90 tabular-nums">{r.rate}</div>
                    {r.note && <div className="text-[10px] text-muted-foreground mt-0.5">{r.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Facts grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {LIGHTNING_FACTS.map(f => (
          <div key={f.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-yellow-400 tabular-nums">{f.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{f.label}</div>
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">{f.sub}</div>
          </div>
        ))}
      </div>

      {/* About */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">About These Data Sources</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs font-semibold text-yellow-400 mb-1">GOES-19 GLM</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The Geostationary Lightning Mapper aboard GOES-19 is a high-speed optical detector that captures
              total lightning (cloud-to-ground + intra-cloud) over the Western Hemisphere from 35,786 km up. It
              detects ~90% of flashes day or night with ~10 km spatial accuracy.
            </p>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs font-semibold text-yellow-400 mb-1">Blitzortung Network</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A global crowdsourced VLF/LF time-of-arrival network. Receivers detect the radio pulse from each
              strike; triangulation between stations pinpoints location in real time. Detection efficiency is
              best in densely-instrumented regions (Europe, US, Japan, Australia).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { label: "NESDIS GOES-19 GLM", url: "https://www.star.nesdis.noaa.gov/GOES/sector.php?sat=G19&sector=conus" },
            { label: "NWS Lightning Safety", url: "https://www.weather.gov/safety/lightning" },
            { label: "Vaisala Annual Report", url: "https://www.vaisala.com/en/lightning" },
            { label: "Blitzortung Project", url: "https://www.blitzortung.org/" },
          ].map(l => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 text-xs hover:bg-muted/50 transition-colors">
              <ExternalLink className="w-3 h-3 text-primary" /> {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
