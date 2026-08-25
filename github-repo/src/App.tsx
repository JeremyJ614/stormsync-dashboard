import { Switch, Route, Router as WouterRouter, useLocation as useWouterLocation, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import { useLocation } from "./hooks/useLocation";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { lazy, Suspense, useState } from "react";
import { PageSkeleton } from "./components/WeatherSkeleton";
import SplashScreen from "./components/SplashScreen";
import NotFound from "@/pages/not-found";
import NotificationToast from "./components/NotificationToast";
import { InstallPrompt } from "./components/InstallPrompt";
import { useAuth, hasModuleAccess } from "./hooks/useAuth";
import { ModuleUpsell } from "./components/ModuleUpsell";
import { registerPrefetch } from "./lib/prefetch";


/**
 * `lazy()` that survives a deploy.
 *
 * Route chunks are content-hashed, so a client holding an older index.html can
 * ask for a filename that no longer exists. The import rejects and React
 * renders nothing — the page simply never appears. Reload once (guarded by
 * sessionStorage so a genuine failure cannot loop) to pick up the current
 * index.html and its real chunk names.
 */
/**
 * Every route is a lazy import, so the chunk is fetched on navigation. Two
 * things hang off that:
 *
 *  • a failed import usually means a deploy changed the chunk hashes under a
 *    tab that is still running the old build — one guarded reload fixes it;
 *  • the factory is registered by path so the sidebar can *warm* the chunk on
 *    hover or touch-start, which is 100-300 ms of head start before the tap
 *    even registers. `registerPrefetch` is what makes that possible.
 */
function lazyRoute<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>, path?: string,
) {
  const guarded = () =>
    factory().catch((err) => {
      const KEY = "sswx:chunk-reload";
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
      throw err;
    });
  if (path) registerPrefetch(path, guarded);
  return lazy(guarded);
}

const Home = lazyRoute(() => import("./pages/Home"), "/");
const Dashboard = lazyRoute(() => import("./pages/Dashboard"), "/dashboard");
const Forecast = lazyRoute(() => import("./pages/Forecast"), "/forecast");
const ForecastDiscussion = lazyRoute(() => import("./pages/ForecastDiscussion"), "/discussion");
const ForecastRunComparator = lazyRoute(() => import("./pages/ForecastRunComparator"), "/comparator");
const SPCOutlook = lazyRoute(() => import("./pages/SPCOutlook"), "/spc");
const MesoscaleDiscussion = lazyRoute(() => import("./pages/MesoscaleDiscussion"), "/meso");
const StormIngredients = lazyRoute(() => import("./pages/StormIngredients"), "/ingredients");
const SWTIPage = lazyRoute(() => import("./pages/SWTIPage"), "/swti");
const SevereWeatherTiming = lazyRoute(() => import("./pages/SevereWeatherTiming"), "/timing");
const WarningCenter = lazyRoute(() => import("./pages/WarningCenter"), "/warnings");
const AQIForecast = lazyRoute(() => import("./pages/AQIForecast"), "/aqi");
const HazardsMap = lazyRoute(() => import("./pages/HazardsMap"), "/hazards");
const DaylightTracker = lazyRoute(() => import("./pages/DaylightTracker"), "/summary");
const SSWXCon = lazyRoute(() => import("./pages/SSWXCon"), "/sswxcon");
const MoonAstronomy = lazyRoute(() => import("./pages/MoonAstronomy"), "/moon");
const AuroraForecast = lazyRoute(() => import("./pages/AuroraForecast"), "/aurora");
const RadarMap = lazyRoute(() => import("./pages/RadarMap"), "/rotation");
const TornadoClimatology = lazyRoute(() => import("./pages/TornadoClimatology"), "/climatology");
const WeatherPatternIndex = lazyRoute(() => import("./pages/WeatherPatternIndex"), "/wpi");
const AIForecastDuel = lazyRoute(() => import("./pages/AIForecastDuel"), "/duel");
const WeatherGlossary = lazyRoute(() => import("./pages/WeatherGlossary"), "/glossary");
const StormChasingOutlook = lazyRoute(() => import("./pages/StormChasingOutlook"), "/chasing");
const MosquitoIndex = lazyRoute(() => import("./pages/MosquitoIndex"), "/mosquito");
const LightningHeatGlobe = lazyRoute(() => import("./pages/LightningHeatGlobe"), "/lightning-globe");

const Login = lazyRoute(() => import("./pages/Login"), "/login");
const Profile = lazyRoute(() => import("./pages/Profile"), "/profile");
const AdminPanel = lazyRoute(() => import("./pages/AdminPanel"), "/admin");
const Plans = lazyRoute(() => import("./pages/Plans"), "/plans");
const FAQ = lazyRoute(() => import("./pages/FAQ"), "/faq");
const Contact = lazyRoute(() => import("./pages/Contact"), "/contact");
const SevereWeatherHistory = lazyRoute(() => import("./pages/SevereWeatherHistory"), "/history");
const Loyalty = lazyRoute(() => import("./pages/Loyalty"), "/loyalty");
const RiverGauges = lazyRoute(() => import("./pages/RiverGauges"), "/rivers");
const FireWeather = lazyRoute(() => import("./pages/FireWeather"), "/fire");
const Subscription = lazyRoute(() => import("./pages/Subscription"), "/subscription");
const ForecastGame = lazyRoute(() => import("./pages/ForecastGame"), "/game");
const Trivia = lazyRoute(() => import("./pages/Trivia"), "/trivia");
const ThunderstormOutlook = lazyRoute(() => import("./pages/ThunderstormOutlook"), "/thunder");
const HurricaneTracker = lazyRoute(() => import("./pages/HurricaneTracker"), "/hurricane");
const TropicalHistory = lazyRoute(() => import("./pages/TropicalHistory"), "/hurricane/history");
const StormDetail = lazyRoute(() => import("./pages/StormDetail"), "/hurricane/:stormId");

function PW({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <ErrorBoundary pageName={name}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function Gated({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (!hasModuleAccess(user, path)) return <ModuleUpsell path={path} signedIn={!!user} />;
  return <>{children}</>;
}

function AppInner() {
  const { location, setLocation, detectLocation, isGeolocating } = useLocation();

  return (
    <Layout location={location} onSetLocation={setLocation} onDetectLocation={detectLocation} isGeolocating={isGeolocating}>
      <Switch>
        <Route path="/" component={() => <PW name="Home"><Home /></PW>} />
        <Route path="/login" component={() => <PW name="Login"><Login /></PW>} />
        <Route path="/profile" component={() => <PW name="Profile"><Profile /></PW>} />
        <Route path="/admin" component={() => <PW name="Admin"><AdminPanel /></PW>} />
        <Route path="/faq" component={() => <PW name="FAQ"><FAQ /></PW>} />
        <Route path="/contact" component={() => <PW name="Contact"><Contact /></PW>} />
        <Route path="/plans" component={() => <PW name="Plans"><Plans /></PW>} />
        <Route path="/subscription" component={() => <PW name="Subscription"><Subscription /></PW>} />

        <Route path="/dashboard" component={() => <PW name="Dashboard"><Gated path="/dashboard"><Dashboard location={location} /></Gated></PW>} />
        <Route path="/forecast" component={() => <PW name="Forecast"><Gated path="/forecast"><Forecast location={location} /></Gated></PW>} />
        <Route path="/discussion" component={() => <PW name="Forecast Discussion"><Gated path="/discussion"><ForecastDiscussion location={location} /></Gated></PW>} />
        <Route path="/comparator" component={() => <PW name="Model Runs"><Gated path="/comparator"><ForecastRunComparator /></Gated></PW>} />
        <Route path="/spc" component={() => <PW name="SPC Outlook"><Gated path="/spc"><SPCOutlook location={location} /></Gated></PW>} />
        <Route path="/thunder" component={() => <PW name="Thunderstorm Probability"><Gated path="/thunder"><ThunderstormOutlook /></Gated></PW>} />
        {/* Tropical history must come before /hurricane to ensure exact-match priority */}
        <Route path="/hurricane/history" component={() => <PW name="Tropical Storm History"><Gated path="/hurricane"><TropicalHistory /></Gated></PW>} />
        <Route path="/hurricane" component={() => <PW name="Hurricane Tracker"><Gated path="/hurricane"><HurricaneTracker /></Gated></PW>} />
        {/* Per-storm tracker. Declared after /hurricane/history so the literal route wins. */}
        <Route path="/hurricane/:stormId" component={() => <PW name="Storm Tracker"><Gated path="/hurricane"><StormDetail /></Gated></PW>} />
        <Route path="/meso" component={() => <PW name="Mesoscale Discussion"><Gated path="/meso"><MesoscaleDiscussion location={location} /></Gated></PW>} />
        <Route path="/ingredients" component={() => <PW name="Storm Ingredients"><Gated path="/ingredients"><StormIngredients location={location} /></Gated></PW>} />
        <Route path="/swti" component={() => <PW name="Threat Index"><Gated path="/swti"><SWTIPage location={location} /></Gated></PW>} />
        <Route path="/timing" component={() => <PW name="Severe Timing"><Gated path="/timing"><SevereWeatherTiming location={location} /></Gated></PW>} />
        <Route path="/warnings" component={() => <PW name="Warning Center"><Gated path="/warnings"><WarningCenter location={location} /></Gated></PW>} />
        <Route path="/aqi" component={() => <PW name="AQI Forecast"><Gated path="/aqi"><AQIForecast location={location} /></Gated></PW>} />
        <Route path="/hazards" component={() => <PW name="Hazards & Drought"><Gated path="/hazards"><HazardsMap location={location} /></Gated></PW>} />
        <Route path="/rivers" component={() => <PW name="River & Flood Gauges"><Gated path="/rivers"><RiverGauges location={location} /></Gated></PW>} />
        <Route path="/fire" component={() => <PW name="Fire Weather"><Gated path="/fire"><FireWeather location={location} /></Gated></PW>} />
        <Route path="/summary" component={() => <PW name="Daylight Tracker"><Gated path="/summary"><DaylightTracker location={location} /></Gated></PW>} />
        <Route path="/sswxcon" component={() => <PW name="SSWXCon"><Gated path="/sswxcon"><SSWXCon location={location} /></Gated></PW>} />
        <Route path="/moon" component={() => <PW name="Moon & Astronomy"><Gated path="/moon"><MoonAstronomy location={location} /></Gated></PW>} />
        <Route path="/aurora" component={() => <PW name="Aurora & Star Gazing"><Gated path="/aurora"><AuroraForecast location={location} /></Gated></PW>} />
        <Route path="/rotation" component={() => <PW name="Radar & MRMS"><Gated path="/rotation"><RadarMap location={location} /></Gated></PW>} />
        <Route path="/climatology" component={() => <PW name="Tornado Climatology"><Gated path="/climatology"><TornadoClimatology location={location} /></Gated></PW>} />
        <Route path="/history" component={() => <PW name="Severe Weather History"><Gated path="/history"><SevereWeatherHistory /></Gated></PW>} />
        <Route path="/wpi" component={() => <PW name="Weather Pattern AI"><Gated path="/wpi"><WeatherPatternIndex location={location} /></Gated></PW>} />
        <Route path="/duel" component={() => <PW name="AI Forecast Duel"><Gated path="/duel"><AIForecastDuel location={location} /></Gated></PW>} />
        <Route path="/glossary" component={() => <PW name="Glossary"><Gated path="/glossary"><WeatherGlossary /></Gated></PW>} />
        <Route path="/chasing" component={() => <PW name="Storm Chasing"><Gated path="/chasing"><StormChasingOutlook location={location} /></Gated></PW>} />
        <Route path="/mosquito" component={() => <PW name="Mosquito Index"><Gated path="/mosquito"><MosquitoIndex location={location} /></Gated></PW>} />
        <Route path="/lightning-globe" component={() => <PW name="Lightning Density"><Gated path="/lightning-globe"><LightningHeatGlobe location={location} /></Gated></PW>} />
        <Route path="/loyalty" component={() => <PW name="Loyalty"><Gated path="/loyalty"><Loyalty /></Gated></PW>} />
        <Route path="/trivia" component={() => <PW name="Daily Trivia"><Gated path="/trivia"><Trivia /></Gated></PW>} />
        <Route path="/game" component={() => <PW name="Forecast Game"><Gated path="/game"><ForecastGame /></Gated></PW>} />

        <Route component={NotFound} />
      </Switch>
      <NotificationToast />
      <InstallPrompt />
    </Layout>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem("stormsync_splash_shown"));
  const handleSplashDone = () => { sessionStorage.setItem("stormsync_splash_shown", "1"); setShowSplash(false); };
  if (showSplash) return <SplashScreen onDone={handleSplashDone} />;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppInner />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
