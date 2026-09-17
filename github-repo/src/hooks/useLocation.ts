import { useState, useEffect, useCallback } from "react";
import { DEFAULT_LOCATION } from "../config";
import { reverseGeocode } from "../utils/weatherApi";

export interface Location {
  lat: number;
  lon: number;
  name: string;
}

const STORAGE_KEY = "stormsync_location";

function loadStoredLocation(): Location | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Location;
    if (typeof parsed.lat === "number" && typeof parsed.lon === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveLocation(loc: Location): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {
    /* ignore */
  }
}

export function useLocation() {
  const [location, setLocationState] = useState<Location>(
    () => loadStoredLocation() ?? DEFAULT_LOCATION
  );
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const setLocation = useCallback((loc: Location) => {
    setLocationState(loc);
    saveLocation(loc);
  }, []);

  /**
   * Our own deadline for the whole attempt, permission prompt included.
   *
   * THE BUG THIS FIXES. `getCurrentPosition` was called with
   * `{ timeout: 10000 }` and nothing else, on the assumption that the browser
   * would give up after ten seconds. It does not. In Chromium the timeout
   * clock only starts once the permission prompt has been ANSWERED — so a
   * visitor who dismisses the prompt (Escape, or a click outside it) rather
   * than choosing Allow or Block leaves both callbacks pending forever.
   * Neither ever fires, `isGeolocating` stays true, and the GPS button in the
   * header spins and stays `disabled` for the rest of the session.
   *
   * Measured before the fix: still spinning, still disabled, 26 seconds into a
   * 10-second timeout. And because the effect below calls `detectLocation()`
   * on mount for anyone with no stored location, this was the DEFAULT state
   * for a first-time visitor who ignored the prompt.
   *
   * 20 seconds rather than 10: the browser's own timer is still the one we
   * want to win a genuinely slow GPS fix, so ours only has to catch the case
   * where the browser's never starts.
   */
  const ATTEMPT_DEADLINE_MS = 20000;

  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported by this browser.");
      return;
    }
    setIsGeolocating(true);
    setGeoError(null);

    // Whichever of the three outcomes lands first wins; the rest become no-ops.
    // `timer` is declared before `finish` closes over it so there is no
    // temporal-dead-zone hazard if an outcome ever does arrive synchronously.
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (message: string | null) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (message) setGeoError(message);
      setIsGeolocating(false);
    };

    timer = setTimeout(
      () => finish("Could not get your location — the browser never answered. You can search for a city instead."),
      ATTEMPT_DEADLINE_MS,
    );

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Already given up, or already answered. A fix that arrives after the
        // deadline is deliberately dropped rather than applied: the reader has
        // been told it failed and may have searched for a city by now, and
        // moving the whole app to a new location underneath them would be a
        // worse outcome than not having the fix at all.
        if (settled) return;
        const { latitude: lat, longitude: lon } = pos.coords;
        const name = await reverseGeocode(lat, lon);
        if (settled) return; // the deadline can land during reverse geocoding
        setLocation({ lat, lon, name });
        finish(null);
      },
      (err) => finish(err.message || "Could not get your location."),
      { timeout: 10000, maximumAge: 60000 },
    );
  }, [setLocation]);

  useEffect(() => {
    const stored = loadStoredLocation();
    if (!stored) {
      detectLocation();
    }
  }, []);

  return { location, setLocation, detectLocation, isGeolocating, geoError };
}
