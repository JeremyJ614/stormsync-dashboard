import { useState, useEffect, useRef, type ReactNode, useMemo, useSyncExternalStore } from "react";
import { BrandMark } from "./BrandMark";
import { motion, LayoutGroup } from "framer-motion";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { subscribeNav, getNavSnapshot, getNavServerSnapshot } from "../lib/navConfig";
import type { LucideIcon } from "lucide-react";
import {
  MapPin, Search, Navigation, Trophy, LogIn, User as UserIcon, Settings,
} from "lucide-react";
import { geocodeLocation } from "../utils/weatherApi";
import type { Location } from "../hooks/useLocation";
import { useAuth } from "../hooks/useAuth";
import { ALL_NAV_ITEMS, useNavSections } from "../lib/navModel";
import { MenuHost } from "./nav/MenuHost";
import { PushInvite } from "./PushInvite";
import { useMenuNav } from "./nav/menus/useMenuNav";
import { subscribeMenuStyles, getMenuStylesSnapshot, getMenuStylesServerSnapshot, styleFor } from "../lib/menuStyle";
import { SavedLocations } from "./SavedLocations";
import { OfflineBar } from "./OfflineBar";
import { NotificationBell } from "./NotificationBell";
import { MorphToggle } from "./nav/MorphToggle";
import { NavItem } from "./nav/NavItem";
import { ROYAL, SPRING, prefersReducedMotion } from "../lib/royal";
const logoUrl = "/img/logo.webp";

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
  // On a phone the field is collapsed to its icon until tapped. See the render
  // below for why.
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setExpanded(false); }
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
    onSetLocation(loc); setQuery(""); setSuggestions([]); setOpen(false); setExpanded(false);
  };

  return (
    // The field is 174px and cannot shrink. Beside the saved-locations menu, the
    // bell, the GPS button and the avatar that came to 332px inside a 328px
    // content column on a 390px phone: the page title was squeezed to zero width
    // and the whole document scrolled 32px sideways, on every route. So below
    // `sm` it collapses to its own icon and opens over the header when tapped.
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => { setExpanded(true); requestAnimationFrame(() => inputRef.current?.focus()); }}
        aria-label="Search for a city"
        aria-expanded={expanded}
        className={`${expanded ? "hidden" : "flex"} sm:hidden p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors`}
      >
        <Search className="w-4 h-4" />
      </button>
      <div className={`${expanded ? "flex absolute right-0 top-1/2 -translate-y-1/2 z-50 w-[min(64vw,240px)]" : "hidden"} sm:flex sm:static sm:translate-y-0 sm:w-auto items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-3 py-1.5`}>
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="City..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions.length > 0) select(suggestions[0]);
            if (e.key === "Escape") { setOpen(false); setExpanded(false); }
          }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          className="bg-transparent outline-none text-sm w-full min-w-0 sm:w-32 placeholder:text-muted-foreground"
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

  // Which menu is in play. Set by the admin, separately for members and for
  // admins, so a style can be tried on one side without changing the other.
  // There is only ever one way to open navigation on screen at a time, and
  // every style gives the content the full width back — the classic rail,
  // which used to hold a permanent 62px column here, is gone.
  const menuCfg = useSyncExternalStore(subscribeMenuStyles, getMenuStylesSnapshot, getMenuStylesServerSnapshot);
  const menuStyle = styleFor(menuCfg, Boolean(user?.isAdmin), user?.menuStyle);
  const menuNav = useMenuNav(location);
  // Canvas Push tilts the app itself away, which only Layout can do.
  const pushed = menuStyle === "push" && menuNav.open;

  const currentNav = ALL_NAV_ITEMS.find((n) => n.path === pathname);

  return (
    <div className="min-h-screen bg-background flex royal-ground">

      {/* Asked once per member, a few seconds after the app settles, and only
          where push can actually work. */}
      <PushInvite />

      <MenuHost style={menuStyle} nav={menuNav} />


      {/* ── Main content — offset by the rail only when the rail is there ── */}
      <div
        className={cn("flex-1 min-w-0 flex flex-col min-h-screen")}
        style={pushed ? {
          // The menu overlay paints at z-60, so the pushed app has to sit above
          // it or the backdrop simply covers the thing that is supposed to be
          // tilting away — which is the entire effect.
          position: "relative",
          zIndex: 65,
          // Far enough right that the app clears the 340px menu column instead of
          // sitting on top of its labels — the menu has to be readable, not just
          // present.
          transform: "perspective(900px) translateZ(-200px) translateX(62%) rotateY(-16deg)",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "-24px 24px 48px rgba(0,0,0,.8)",
          opacity: 0.7,
          pointerEvents: "none",
          transition: menuNav.calm ? "none" : "transform .5s cubic-bezier(.2,.8,.2,1), opacity .4s, border-radius .4s",
        } : {
          transition: menuNav.calm ? "none" : "transform .5s cubic-bezier(.2,.8,.2,1), opacity .4s, border-radius .4s",
        }}
      >

        {/* Header */}
        {/* `paddingTop` is the notch. With `viewport-fit=cover` set and the iOS
            status bar translucent, the header sits *under* the clock unless it
            pays for it here. */}
        <header className="sticky top-0 z-20 backdrop-blur-xl border-b relative"
                style={{
                  background: "hsl(var(--background) / 0.82)",
                  borderColor: "hsl(var(--border) / 0.9)",
                  paddingTop: "env(safe-area-inset-top, 0px)",
                }}>
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

        <OfflineBar />

        {/* The home indicator eats the last ~34px of the screen on a modern
            iPhone. Without this the final row of every page is under it. */}
        <main
          className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
