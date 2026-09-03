import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../../hooks/useAuth";
import { useNavSections, type NavSection } from "../../../lib/navModel";
import { useCalm } from "../../../lib/calm";
import { haptic } from "../../../lib/haptics";
import type { Location } from "../../../hooks/useLocation";

/**
 * The state every menu style shares.
 *
 * They all present the same two levels — section, then the modules inside it —
 * so the traversal, the dismissal rules and the calm gate belong here rather
 * than once per style. What each style owns is only how it draws them.
 */
export interface MenuNav {
  sections: NavSection[];
  open: boolean;
  /** Index into `sections`, or null while the top level is showing. */
  section: number | null;
  current: NavSection | null;
  toggle: () => void;
  close: () => void;
  openSection: (i: number) => void;
  back: () => void;
  /** True when a warning is live for this member, or they asked for less motion. */
  calm: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useMenuNav(location: Location): MenuNav {
  const { user } = useAuth();
  const sections = useNavSections(user);
  const [pathname] = useLocation();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { calm } = useCalm(location.lat, location.lon);

  // Haptics live here rather than in each menu style, so every one of them
  // buzzes the same way for the same action.
  const close = useCallback(() => { setOpen(false); setSection(null); }, []);
  const toggle = useCallback(() => {
    haptic("select");
    setOpen((o) => { if (o) setSection(null); return !o; });
  }, []);
  const openSection = useCallback((i: number) => { haptic("tick"); setSection(i); }, []);
  const back = useCallback(() => { haptic("tick"); setSection(null); }, []);

  // Navigating away always closes: a menu that survives the page it opened is a
  // menu covering the thing you just asked for.
  useEffect(() => { close(); }, [pathname, close]);

  // Escape steps back one level, then closes — the same shape as the traversal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setSection((s) => { if (s !== null) return null; setOpen(false); return null; });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // A tap outside closes outright.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  // While a menu is open the page behind it should not scroll under the finger.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return {
    sections, open, section,
    current: section === null ? null : sections[section] ?? null,
    toggle, close, openSection, back, calm, containerRef,
  };
}
