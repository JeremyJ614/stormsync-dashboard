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

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Forecast = lazy(() => import("./pages/Forecast"));
const ForecastDiscussion = lazy(() => import("./pages/ForecastDiscussion"));
const ForecastRunComparator = lazy(() => import("./pages/ForecastRunComparator"));
const SPCOutlook = lazy(() => import("./pages/SPCOutlook"));
const MesoscaleDiscussion = lazy(() => import("./pages/MesoscaleDiscussion"));
const StormIngredients = lazy(() => import("./pages/StormIngredients"));
const SWTIPage = lazy(() => import("./pages/SWTIPage"));
const SevereWeatherTiming = lazy(() => import("./pages/SevereWeatherTiming"));
const WarningCenter = lazy(() => import("./pages/WarningCenter"));
const AQIForecast = lazy(() => import("./pages/AQIForecast"));
const HazardsMap = lazy(() => import("./pages/HazardsMap"));
const RecentWeatherSummary = lazy(() => import("./pages/RecentWeatherSummary"));
const SSWXCon = lazy(() => import("./pages/SSWXCon"));
const MoonAstronomy = lazy(() => import("./pages/MoonAstronomy"));
const StarSkygazing = lazy(() => import("./pages/StarSkygazing"));
const AuroraForecast = lazy(() => import("./pages/AuroraForecast"));
const RotationalMap = lazy(() => import("./pages/RotationalMap"));
const TornadoClimatology = lazy(() => import("./pages/TornadoClimatology"));
const WeatherPatternIndex = lazy(() => import("./pages/WeatherPatternIndex"));
const AIForecastDuel = lazy(() => import("./pages/AIForecastDuel"));
const WeatherGlossary = lazy(() => import("./pages/WeatherGlossary"));
const WeatherLearn = lazy(() => import("./pages/WeatherLearn"));
const StormChasingOutlook = lazy(() => import("./pages/StormChasingOutlook"));
const MosquitoIndex = lazy(() => import("./pages/MosquitoIndex"));
const LightningHeatGlobe = lazy(() => import("./pages/LightningHeatGlobe"));

const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Contact = lazy(() => import("./pages/Contact"));
const SevereWeatherHistory = lazy(() => import("./pages/SevereWeatherHistory"));
const Loyalty = lazy(() => import("./pages/Loyalty"));
const ForecastGame = lazy(() => import("./pages/ForecastGame"));
const ThunderstormOutlook = lazy(() => import("./pages/ThunderstormOutlook"));
const HurricaneTracker = lazy(() => import("./pages/HurricaneTracker"));

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
  if (!hasModuleAccess(user, path)) {
    return (
      <div className="p-6 max-w-md mx-auto mt-12 text-center bg-card border border-border rounded-2xl space-y-3">
        <div className="text-3xl">🔒</div>
        <h2 className="text-lg font-bold">Module Not Enabled</h2>
        <p className="text-sm text-muted-foreground">This module isn't part of your current tier. Contact your administrator to enable it.</p>
        {!user && <a href="/login" className="inline-block px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm">Sign in</a>}
      </div>
    );
  }
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

        <Route path="/dashboard" component={() => <PW name="Dashboard"><Gated path="/dashboard"><Dashboard location={location} /></Gated></PW>} />
        <Route path="/forecast" component={() => <PW name="Forecast"><Gated path="/forecast"><Forecast location={location} /></Gated></PW>} />
        <Route path="/discussion" component={() => <PW name="Forecast Discussion"><Gated path="/discussion"><ForecastDiscussion location={location} /></Gated></PW>} />
        <Route path="/comparator" component={() => <PW name="Run Comparator"><Gated path="/comparator"><ForecastRunComparator location={location} /></Gated></PW>} />
        <Route path="/spc" component={() => <PW name="SPC Outlook"><Gated path="/spc"><SPCOutlook location={location} /></Gated></PW>} />
        <Route path="/thunder" component={() => <PW name="Thunderstorm Probability"><Gated path="/thunder"><ThunderstormOutlook /></Gated></PW>} />
        <Route path="/hurricane" component={() => <PW name="Hurricane Tracker"><Gated path="/hurricane"><HurricaneTracker /></Gated></PW>} />
        <Route path="/meso" component={() => <PW name="Mesoscale Discussion"><Gated path="/meso"><MesoscaleDiscussion location={location} /></Gated></PW>} />
        <Route path="/ingredients" component={() => <PW name="Storm Ingredients"><Gated path="/ingredients"><StormIngredients location={location} /></Gated></PW>} />
        <Route path="/swti" component={() => <PW name="Threat Index"><Gated path="/swti"><SWTIPage location={location} /></Gated></PW>} />
        <Route path="/timing" component={() => <PW name="Severe Timing"><Gated path="/timing"><SevereWeatherTiming location={location} /></Gated></PW>} />
        <Route path="/warnings" component={() => <PW name="Warning Center"><Gated path="/warnings"><WarningCenter location={location} /></Gated></PW>} />
        <Route path="/aqi" component={() => <PW name="AQI Forecast"><Gated path="/aqi"><AQIForecast location={location} /></Gated></PW>} />
        <Route path="/hazards" component={() => <PW name="Hazards & Drought"><Gated path="/hazards"><HazardsMap location={location} /></Gated></PW>} />
        <Route path="/summary" component={() => <PW name="Recent Summary"><Gated path="/summary"><RecentWeatherSummary location={location} /></Gated></PW>} />
        <Route path="/sswxcon" component={() => <PW name="SSWXCon"><Gated path="/sswxcon"><SSWXCon location={location} /></Gated></PW>} />
        <Route path="/moon" component={() => <PW name="Moon & Astronomy"><Gated path="/moon"><MoonAstronomy location={location} /></Gated></PW>} />
        <Route path="/skygazing" component={() => <PW name="Star & Skygazing"><Gated path="/skygazing"><StarSkygazing location={location} /></Gated></PW>} />
        <Route path="/aurora" component={() => <PW name="Aurora Forecast"><Gated path="/aurora"><AuroraForecast location={location} /></Gated></PW>} />
        <Route path="/rotation" component={() => <PW name="Rotational Map"><Gated path="/rotation"><RotationalMap location={location} /></Gated></PW>} />
        <Route path="/climatology" component={() => <PW name="Tornado Climatology"><Gated path="/climatology"><TornadoClimatology location={location} /></Gated></PW>} />
        <Route path="/history" component={() => <PW name="Severe Weather History"><Gated path="/history"><SevereWeatherHistory /></Gated></PW>} />
        <Route path="/wpi" component={() => <PW name="Weather Pattern AI"><Gated path="/wpi"><WeatherPatternIndex location={location} /></Gated></PW>} />
        <Route path="/duel" component={() => <PW name="AI Forecast Duel"><Gated path="/duel"><AIForecastDuel location={location} /></Gated></PW>} />
        <Route path="/glossary" component={() => <PW name="Glossary"><Gated path="/glossary"><WeatherGlossary /></Gated></PW>} />
        <Route path="/learn" component={() => <PW name="Weather Learn"><Gated path="/learn"><WeatherLearn location={location} /></Gated></PW>} />
        <Route path="/chasing" component={() => <PW name="Storm Chasing"><Gated path="/chasing"><StormChasingOutlook location={location} /></Gated></PW>} />
        <Route path="/mosquito" component={() => <PW name="Mosquito Index"><Gated path="/mosquito"><MosquitoIndex location={location} /></Gated></PW>} />
        <Route path="/lightning-globe" component={() => <PW name="Lightning Density"><Gated path="/lightning-globe"><LightningHeatGlobe /></Gated></PW>} />
        <Route path="/loyalty" component={() => <PW name="Loyalty"><Gated path="/loyalty"><Loyalty /></Gated></PW>} />
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
