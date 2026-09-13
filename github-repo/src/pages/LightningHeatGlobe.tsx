import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Zap, RefreshCw, ExternalLink, Globe, MapPin, BarChart3 } from "lucide-react";
import type { Location } from "../hooks/useLocation";
import { getLightningClimo } from "../lib/lightningClimo";
import { ClimoPanel } from "../components/lightning/ClimoPanel";
import { LiveStrikeMap } from "../components/lightning/LiveStrikeMap";
import { ModuleShell } from "../components/ModuleShell";
import { ROYAL, EASE, prefersReducedMotion } from "../lib/royal";

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

/*
 * Climatology first, live second.
 *
 * The module opened on a live strike map, which is the thing that is usually
 * empty: most of the country, most of the time, has no lightning on it, so the
 * first screen was a blank map. How electric your own patch of the country is
 * — the answer to "should I expect this" — is true every day of the year, and
 * it is the half of this module that only this app has bothered to compute.
 */
const TABS: { id: Tab; label: string; short: string; icon: typeof MapPin }[] = [
  { id: "climo",  label: "Your Climatology", short: "Climatology", icon: BarChart3 },
  { id: "us",     label: "Live U.S.",        short: "Live U.S.",   icon: MapPin },
  { id: "global", label: "Global Real-Time", short: "Global",      icon: Globe },
];

export default function LightningHeatGlobe({ location }: Props) {
  const [tab, setTab] = useState<Tab>("climo");
  const still = prefersReducedMotion();
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

  /*
   * The still, and the bug it fixes.
   *
   * This was `GOES16/ABI/CONUS/GEOCOLOR/1250x750.jpg`, which 301s to
   * `GOES19/ABI/CONUS/GEOCOLOR` — the visible-and-infrared picture. Clouds.
   * The panel header said "GOES-19 GLM Flash Extent Density" and a caption
   * underneath explained which pixels were the flashes, of an image that had
   * none in it.
   *
   * The real product is under `GLM`, not `ABI`, and it is there: verified as a
   * 1 MB JPEG. It is kept as the wide CONUS still beneath the interactive map.
   */
  const glmSrc = `https://cdn.star.nesdis.noaa.gov/GOES19/GLM/CONUS/EXTENT3/1250x750.jpg?t=${bust}`;

  // NCEI is slow and this never changes intra-session, so cache it hard.
  const climo = useQuery({
    queryKey: ["lightning-climo", location.lat.toFixed(2), location.lon.toFixed(2)],
    queryFn: () => getLightningClimo(location.lat, location.lon),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return (
    <ModuleShell
      eyebrow="GOES-19 GLM · NCEI · Blitzortung"
      title="Lightning"
      subtitle="Where it is striking right now, and how electric your own patch of the country really is."
      actions={
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      }
      status={
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 transition-colors"
                style={{
                  background: on ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${on ? "rgba(251,191,36,0.4)" : ROYAL.hairline}`,
                  color: on ? "#fbbf24" : ROYAL.dim,
                }}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            );
          })}
        </div>
      }
    >
      <motion.div
        key={tab}
        initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={still ? { duration: 0.2 } : { duration: 0.4, ease: EASE }}
        className="space-y-5"
      >
      {tab === "us" && (
        <LiveStrikeMap
          center={{ lat: location.lat, lon: location.lon }}
          bust={bust}
          still={still}
        />
      )}

      {tab === "us" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold">Whole country at once — GLM flash extent density</span>
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
          <div className="rounded-2xl overflow-hidden"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
            <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2"
                 style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" style={{ color: "#fbbf24" }} />
                <span className="text-sm font-semibold" style={{ color: ROYAL.text }}>
                  Thunder-day climatology — {location.name}
                </span>
              </div>
              {climo.data && (
                <span className="text-[11px]" style={{ color: ROYAL.dim }}>
                  NCEI station {climo.data.stationId} · {climo.data.sampleYears} yrs of record
                </span>
              )}
            </div>
            <div className="p-4">
              <ClimoPanel
                data={climo.data}
                loading={climo.isLoading}
                placeName={location.name}
                calm={still}
              />
            </div>
          </div>

          {/* Global hotspots belong with the climatology rather than the live maps. */}
          <div className="rounded-2xl p-4"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
            <h3 className="text-[10px] uppercase tracking-[0.24em] mb-3" style={{ color: ROYAL.dim }}>
              The most electric places on Earth
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {TOP_REGIONS.map((r, i) => (
                <div key={r.region} className="flex items-start gap-3 rounded-xl p-3"
                     style={{ background: "rgba(204,204,255,0.04)" }}>
                  <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                       style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: ROYAL.text }}>{r.region}</div>
                    <div className="text-xs tabular-nums" style={{ color: "#fbbf24" }}>{r.rate}</div>
                    {r.note && <div className="text-[10px] mt-0.5" style={{ color: ROYAL.dim }}>{r.note}</div>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] mt-3" style={{ color: ROYAL.dim }}>
              NASA OTD/LIS satellite climatology. Flash density is flashes per square kilometre per year.
            </p>
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
      </motion.div>
    </ModuleShell>
  );
}
