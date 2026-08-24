import { useState, useEffect, useRef, type ReactNode, useMemo, useSyncExternalStore } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { subscribeNav, getNavSnapshot, getNavServerSnapshot } from "../lib/navConfig";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, CalendarDays, MessageSquare, Zap, Layers,
  Brain, Swords, BookOpen, FlaskConical,
  Moon, Wind, BarChart3, Activity, AlertCircle, FileText,
  Map, Star, Tornado, Sparkles, MapPin, Search, Navigation,
  Bug, Globe, Home, HelpCircle, Mail, Shield, Trophy,
  Gamepad2, LogIn, User as UserIcon, Settings, BookMarked,
  CloudRain, Satellite, Target, RotateCcw, ChevronRight,
  History, X, Sun,
} from "lucide-react";
import { geocodeLocation } from "../utils/weatherApi";
import type { Location } from "../hooks/useLocation";
import { useAuth, hasModuleAccess, ALL_MODULES } from "../hooks/useAuth";
import { SavedLocations } from "./SavedLocations";
import { NotificationBell } from "./NotificationBell";
import { MorphToggle } from "./nav/MorphToggle";
import { NavItem } from "./nav/NavItem";
import { ROYAL, SPRING, prefersReducedMotion } from "../lib/royal";
const logoUrl = "/logo.png";
const markUrl = "/sswx-mark.png"; // dripping-skull brand mark (transparent PNG)

// ─── Navigation structure ────────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { label: "Home",                path: "/",           icon: Home },
      { label: "Dashboard",           path: "/dashboard",  icon: LayoutDashboard },
      { label: "Local Forecast",      path: "/forecast",   icon: CalendarDays },
      { label: "Forecast Discussion", path: "/discussion", icon: MessageSquare },
      { label: "AQI Forecast",        path: "/aqi",        icon: Wind },
      { label: "Daylight Tracker",      path: "/summary",    icon: Sun },
    ],
  },
  {
    label: "Severe Weather",
    items: [
      { label: "SSWXCon Score",           path: "/sswxcon",     icon: Activity },
      { label: "Warning Center",          path: "/warnings",    icon: AlertCircle },
      { label: "SPC Outlook",             path: "/spc",         icon: Globe },
      { label: "Mesoscale Discussions",   path: "/meso",        icon: Layers },
      { label: "Atmosphere Ingredients",  path: "/ingredients", icon: FlaskConical },
      { label: "Severe Threat Index",     path: "/swti",        icon: Shield },
      { label: "Storm Timing",            path: "/timing",      icon: BarChart3 },
      { label: "Thunderstorm Probability",path: "/thunder",     icon: CloudRain },
      { label: "Hurricane Tracker",       path: "/hurricane",   icon: Tornado },
    ],
  },
  {
    label: "Environmental & Model Data",
    items: [
      { label: "Model Runs",       path: "/comparator",      icon: Satellite },
      { label: "Lightning Monitor",path: "/lightning-globe", icon: Zap },
      { label: "Radar & MRMS",     path: "/rotation",        icon: Target },
      { label: "Hazards & Drought",path: "/hazards",         icon: Map },
      { label: "Tornado Climatology",path:"/climatology",    icon: RotateCcw },
    ],
  },
  {
    label: "Astro Panel",
    items: [
      { label: "Moon & Astronomy",   path: "/moon",      icon: Moon },
      { label: "Aurora & Star Gazing", path: "/aurora", icon: Sparkles },
    ],
  },
  {
    label: "Advanced Tools",
    items: [
      { label: "Storm Chasing Dash",   path: "/chasing",  icon: Tornado },
      { label: "Mosquito Index",       path: "/mosquito", icon: Bug },
      { label: "Weather Patterns",     path: "/wpi",      icon: Brain },
      { label: "AI Knowledge Battle",  path: "/duel",     icon: Swords },
      { label: "Severe Weather History",path:"/history",  icon: BookMarked },
    ],
  },
  {
    label: "Everything Else",
    items: [
      { label: "Forecast Game",     path: "/game",     icon: Gamepad2 },
      { label: "Daily Trivia",      path: "/trivia",   icon: Brain },
      { label: "Loyalty Dashboard", path: "/loyalty",  icon: Trophy },
      { label: "Weather Glossary",  path: "/glossary", icon: BookOpen },
      { label: "FAQ",               path: "/faq",      icon: HelpCircle },
      { label: "Contact Us",        path: "/contact",  icon: Mail },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

// Icon lookup so DB-driven modules keep their icon; unknown ids fall back.
const ICON_BY_PATH: Record<string, LucideIcon> = Object.fromEntries(
  ALL_NAV_ITEMS.map(i => [i.path, i.icon as LucideIcon]),
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface LayoutProps {
  children: ReactNode;
  location: Location;
  onSetLocation: (loc: Location) => void;
  onDetectLocation: () => void;
  isGeolocating: boolean;
}

// ─── Location search (unchanged) ─────────────────────────────────────────────
function LocationSearch({ onSetLocation }: { onSetLocation: (loc: Location) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await geocodeLocation(trimmed);
        setSuggestions(found);
        setOpen(found.length > 0);
      } catch { setSuggestions([]); setOpen(false); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const select = (loc: Location) => {
    onSetLocation(loc); setQuery(""); setSuggestions([]); setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-3 py-1.5">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="City..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && suggestions.length > 0) select(suggestions[0]); }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          className="bg-transparent outline-none text-sm w-32 placeholder:text-muted-foreground"
          autoComplete="off" spellCheck={false}
        />
        {searching && <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-popover border border-border rounded-lg shadow-xl min-w-[260px] max-h-72 overflow-y-auto">
          {suggestions.map((r, i) => (
            <button key={i} onMouseDown={(e) => { e.preventDefault(); select(r); }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 first:rounded-t-lg last:rounded-b-lg flex items-center gap-2 border-b border-border/30 last:border-b-0">
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export function Layout({ children, location, onSetLocation, onDetectLocation, isGeolocating }: LayoutProps) {
  const [pathname] = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => setReducedMotion(prefersReducedMotion()), []);
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close sidebar on route change
  useEffect(() => { setSidebarExpanded(false); }, [pathname]);

  // Sidebar structure comes from the admin-managed DB config (P-2.1); until it
  // loads (or if it fails) we render the hardcoded NAV_SECTIONS so the sidebar
  // is never blank.
  const navCfg = useSyncExternalStore(subscribeNav, getNavSnapshot, getNavServerSnapshot);

  const visibleSections = useMemo(() => {
    if (!navCfg.loaded || navCfg.sections.length === 0) {
      return NAV_SECTIONS.map(sec => ({
        ...sec,
        items: sec.items.filter(item => hasModuleAccess(user, item.path)),
      })).filter(sec => sec.items.length > 0);
    }
    const known = new Set(ALL_MODULES.map(m => m.id));
    return [...navCfg.sections]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(sec => ({
        label: sec.name,
        items: navCfg.modules
          .filter(m => m.sectionId === sec.id && known.has(m.moduleId) && hasModuleAccess(user, m.moduleId))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(m => ({
            label: m.label ?? ALL_MODULES.find(x => x.id === m.moduleId)?.label ?? m.moduleId,
            path: m.moduleId,
            icon: ICON_BY_PATH[m.moduleId] ?? Layers,
          })),
      }))
      .filter(sec => sec.items.length > 0);
  }, [user, navCfg]);

  const currentNav = ALL_NAV_ITEMS.find((n) => n.path === pathname);

  // Collapse sidebar and navigate
  const handleNavClick = () => setSidebarExpanded(false);

  return (
    <div className="min-h-screen bg-background flex royal-ground">

      {/* ── Backdrop (expanded overlay) ── */}
      {sidebarExpanded && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px]"
          onClick={() => setSidebarExpanded(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <motion.aside
        // Width is sprung rather than eased: the panel settles instead of
        // stopping dead, which is what makes the fold read as physical.
        animate={{ width: sidebarExpanded ? 242 : 62 }}
        initial={false}
        transition={reducedMotion ? { duration: 0 } : SPRING.silk}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden",
          "border-r border-[rgba(204,204,255,0.09)]",
        )}
        style={{
          background: `linear-gradient(180deg, ${ROYAL.ink2} 0%, ${ROYAL.ink} 100%)`,
          boxShadow: sidebarExpanded ? `1px 0 40px -18px ${ROYAL.goldSoft}` : "none",
        }}
      >
        {/* Champagne edge that brightens as the menu opens. */}
        <motion.span
          aria-hidden
          animate={{ opacity: sidebarExpanded ? 1 : 0.25 }}
          transition={reducedMotion ? { duration: 0 } : SPRING.silk}
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{ background: `linear-gradient(180deg, transparent, ${ROYAL.goldSoft} 22%, ${ROYAL.goldSoft} 78%, transparent)` }}
        />
        {/* Logo row */}
        <div className="flex items-center gap-3 px-[15px] py-3 border-b border-[rgba(204,204,255,0.09)] min-h-[58px]">
          <img
            src={markUrl}
            alt="StormSync"
            width={32}
            height={32}
            className="w-[32px] h-[32px] flex-shrink-0 object-contain"
            style={{ filter: "drop-shadow(0 0 10px rgba(155,80,220,0.45))" }}
          />
          <div
            className={cn(
              "overflow-hidden whitespace-nowrap transition-all duration-300",
              sidebarExpanded ? "opacity-100 w-[160px]" : "opacity-0 w-0",
            )}
          >
            <div className="text-[13px] font-bold text-[#F1F4FF] leading-tight tracking-[0.06em]" style={{ fontFamily: "'Raleway', sans-serif" }}>
              STORMSYNC
            </div>
            <div className="text-[9px] text-[#A3A3CC] tracking-[0.08em] uppercase mt-[1px]">
              VIP Forecast Group
            </div>
          </div>
        </div>

        {/* ★ Expand / Collapse — hexagon folds to a triangle and back */}
        <motion.button
          onClick={() => setSidebarExpanded(v => !v)}
          title={sidebarExpanded ? "Collapse menu" : "Expand menu"}
          aria-expanded={sidebarExpanded}
          aria-label={sidebarExpanded ? "Collapse menu" : "Expand menu"}
          whileTap={reducedMotion ? undefined : { scale: 0.94 }}
          transition={SPRING.pop}
          className={cn(
            "flex items-center gap-2 mx-2 mt-2 mb-1 px-2 py-2 rounded-[10px]",
            "border overflow-hidden relative",
          )}
          style={{
            borderColor: sidebarExpanded ? ROYAL.goldSoft : "rgba(204,204,255,0.18)",
            background: sidebarExpanded ? ROYAL.goldFaint : "rgba(204,204,255,0.05)",
            transition: "background-color 240ms ease, border-color 240ms ease",
          }}
        >
          <span className="flex-shrink-0 flex items-center justify-center w-[18px] h-[18px]">
            <MorphToggle expanded={sidebarExpanded} />
          </span>
          <motion.span
            animate={{ opacity: sidebarExpanded ? 1 : 0, x: sidebarExpanded ? 0 : -6 }}
            transition={reducedMotion ? { duration: 0 } : SPRING.silk}
            className="text-[10.5px] font-semibold tracking-[0.16em] uppercase whitespace-nowrap"
            style={{ fontFamily: "'DM Sans', sans-serif", color: ROYAL.gold }}
          >
            Collapse
          </motion.span>
        </motion.button>

        {/* Nav items */}
        <LayoutGroup id="sidebar-nav">
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 space-y-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleSections.map((section, si) => (
            <div key={section.label}>

              {/* Section label */}
              <motion.div
                animate={{
                  opacity: sidebarExpanded ? 1 : 0,
                  height: sidebarExpanded ? 26 : 6,
                }}
                initial={false}
                transition={reducedMotion ? { duration: 0 } : { ...SPRING.silk, delay: sidebarExpanded ? si * 0.02 : 0 }}
                className="px-[10px] text-[9px] font-semibold tracking-[0.18em] uppercase overflow-hidden whitespace-nowrap flex items-end pb-[4px]"
                style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(217,183,117,0.45)" }}
              >
                {section.label}
              </motion.div>

              {/* Items */}
              <div className="space-y-[2px]">
                {section.items.map((item, ii) => (
                  <NavItem
                    key={item.path}
                    label={item.label}
                    path={item.path}
                    icon={item.icon as LucideIcon}
                    active={pathname === item.path}
                    expanded={sidebarExpanded}
                    index={si * 3 + ii}
                    onNavigate={handleNavClick}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Admin link */}
          {user?.isAdmin && (
            <div>
              <div
                className={cn(
                  "px-[10px] text-[9px] font-semibold tracking-[0.14em] uppercase text-yellow-400/50",
                  "whitespace-nowrap overflow-hidden transition-all duration-300",
                  sidebarExpanded ? "opacity-100 h-[26px] pt-[10px] pb-[4px]" : "opacity-0 h-[6px] pt-0 pb-0",
                )}
              >
                Admin
              </div>
              <Link
                href="/admin"
                onClick={handleNavClick}
                title={!sidebarExpanded ? "Admin Panel" : undefined}
                className={cn(
                  "flex items-center gap-[11px] px-[10px] py-[9px] rounded-[9px] transition-all duration-150 relative group",
                  pathname === "/admin"
                    ? "bg-yellow-400/10 text-yellow-300"
                    : "text-yellow-400/80 hover:bg-yellow-400/8",
                )}
              >
                {pathname === "/admin" && (
                  <span className="absolute left-0 top-[22%] h-[56%] w-[3px] rounded-r-[3px] bg-yellow-400" style={{ boxShadow: "0 0 8px rgba(250,204,21,0.5)" }} />
                )}
                <Settings className="w-[17px] h-[17px] flex-shrink-0 group-hover:text-yellow-300 transition-colors" />
                <span
                  className={cn(
                    "text-[12.5px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300",
                    sidebarExpanded ? "opacity-100 w-[150px]" : "opacity-0 w-0",
                  )}
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  Admin Panel
                </span>
              </Link>
            </div>
          )}
        </nav>
        </LayoutGroup>

        {/* User row */}
        <div className="border-t border-[rgba(204,204,255,0.09)] p-2">
          <div className="flex items-center gap-[10px] px-[10px] py-[8px] rounded-[9px] cursor-pointer hover:bg-[rgba(204,204,255,0.06)] transition-colors group">
            <div
              className="w-[30px] h-[30px] rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #6868BB, #CCCCFF)",
                color: "#07070F",
                boxShadow: "0 0 10px rgba(204,204,255,0.20)",
                fontFamily: "'Raleway', sans-serif",
              }}
            >
              {user ? user.name.split(" ").map(p => p[0]).slice(0, 2).join("") : "?"}
            </div>
            <div
              className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-300",
                sidebarExpanded ? "opacity-100 w-[150px]" : "opacity-0 w-0",
              )}
            >
              <div className="text-[12px] font-semibold text-[#F1F4FF] truncate" style={{ fontFamily: "'Raleway', sans-serif" }}>
                {user?.name ?? "Not signed in"}
              </div>
              <div className="text-[10px] text-[#CCCCFF] truncate" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {user ? `Tier ${user.tier}${user.isAdmin ? " · Admin" : ""}` : "Guest"}
              </div>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* ── Main content — always offset by collapsed sidebar width ── */}
      <div className="flex-1 min-w-0 ml-[62px] flex flex-col min-h-screen">

        {/* Header */}
        <header className="sticky top-0 z-20 backdrop-blur-xl border-b relative"
                style={{ background: "hsl(var(--background) / 0.82)", borderColor: "hsl(var(--border) / 0.9)" }}>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="flex-1 min-w-0">
              <h1
                className="text-sm font-bold tracking-wide truncate text-foreground"
                style={{ fontFamily: "'Raleway', sans-serif" }}
              >
                {currentNav?.label ?? "StormSync"}
              </h1>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{location.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LocationSearch onSetLocation={onSetLocation} />
              <SavedLocations location={location} onSetLocation={onSetLocation} />
              <NotificationBell />
              <button
                onClick={onDetectLocation}
                disabled={isGeolocating}
                title="Auto-detect my GPS location"
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                {isGeolocating
                  ? <div className="w-4 h-4 border border-primary border-t-transparent rounded-full animate-spin" />
                  : <Navigation className="w-4 h-4" />}
              </button>

              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(o => !o)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border hover:border-primary/40 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary" style={{ fontFamily: "'Raleway', sans-serif" }}>
                      {user.name.split(" ").map(p => p[0]).slice(0, 2).join("")}
                    </div>
                    <span className="text-xs font-medium hidden sm:inline" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {user.name.split(" ")[0]}
                    </span>
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-1 w-52 bg-popover border border-border rounded-lg shadow-xl py-1 z-50">
                      <div className="px-3 py-2 border-b border-border">
                        <div className="text-sm font-medium truncate" style={{ fontFamily: "'Raleway', sans-serif" }}>{user.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                        <div className="text-[10px] text-primary mt-0.5">Tier {user.tier}{user.isAdmin ? " · Admin" : ""}</div>
                      </div>
                      <Link href="/profile" onClick={() => setUserMenuOpen(false)} className="flex px-3 py-2 text-sm hover:bg-muted/50 items-center gap-2">
                        <UserIcon className="w-3.5 h-3.5" /> Profile
                      </Link>
                      <Link href="/loyalty" onClick={() => setUserMenuOpen(false)} className="flex px-3 py-2 text-sm hover:bg-muted/50 items-center gap-2">
                        <Trophy className="w-3.5 h-3.5" /> Loyalty
                      </Link>
                      {user.isAdmin && (
                        <Link href="/admin" onClick={() => setUserMenuOpen(false)} className="flex px-3 py-2 text-sm hover:bg-muted/50 items-center gap-2 text-yellow-400">
                          <Settings className="w-3.5 h-3.5" /> Admin Panel
                        </Link>
                      )}
                      <button
                        onClick={() => { logout(); setUserMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-t border-border text-red-400"
                      >
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors text-xs font-semibold"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  <LogIn className="w-3.5 h-3.5" /> Sign in
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
