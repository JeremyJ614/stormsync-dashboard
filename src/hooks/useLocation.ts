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

  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported by this browser.");
      return;
    }
    setIsGeolocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const name = await reverseGeocode(lat, lon);
        const loc: Location = { lat, lon, name };
        setLocation(loc);
        setIsGeolocating(false);
      },
      (err) => {
        setGeoError(err.message || "Could not get your location.");
        setIsGeolocating(false);
      },
      { timeout: 10000, maximumAge: 60000 }
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
