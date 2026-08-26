/**
 * Calm mode — the rule that outranks every animation in this app.
 *
 * When a warning is active for the member's own location, decoration stops.
 * Not slows: stops. Someone reading a tornado warning for their county does not
 * need a cone drawing itself in behind the text, and a screen that is moving
 * while it tells you to take shelter is a screen that is working against the
 * person using it.
 *
 * Every animated surface asks `useCalm()` and falls back to its finished state.
 * That makes the behaviour one decision in one place rather than thirty
 * components each remembering — and a component that forgets is a component
 * that keeps animating during a warning, which is exactly the failure this
 * exists to prevent.
 *
 * Calm mode does not touch anything functional. Warnings still arrive, maps
 * still pan, tabs still switch. What stops is ornament: draw-ons, entrances,
 * ambient loops, count-ups.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchNWSAlerts, type NWSAlertFeature } from "../utils/weatherApi";
import { prefersReducedMotion } from "./royal";

/**
 * Event types that mean "something is happening here, now".
 *
 * Deliberately warnings and not watches. A watch can run for eight hours over
 * a quarter of the country and is not a reason to freeze someone's interface;
 * a warning is minutes long and local, and is.
 */
const CALM_EVENTS = [
  "tornado warning",
  "severe thunderstorm warning",
  "flash flood warning",
  "extreme wind warning",
  "hurricane warning",
  "dust storm warning",
  "snow squall warning",
  "tsunami warning",
  "ice storm warning",
  "blizzard warning",
];

export function isCalmEvent(event: string | undefined): boolean {
  const e = (event ?? "").toLowerCase();
  return CALM_EVENTS.some((c) => e.includes(c));
}

export interface CalmState {
  /** True when ornament should not run. */
  calm: boolean;
  /** Why, so a surface can explain itself if it wants to. */
  reason: "warning" | "reduced-motion" | null;
  /** The warning responsible, when there is one. */
  event: string | null;
}

/**
 * Alerts for the member's point, polled on the same cadence the Warning Center
 * uses. Shares a query key with anything else asking, so this costs one request
 * regardless of how many animated surfaces are mounted.
 */
export function useCalm(lat?: number, lon?: number): CalmState {
  const enabled = typeof lat === "number" && typeof lon === "number";
  const { data } = useQuery({
    queryKey: ["point-alerts", enabled ? lat!.toFixed(3) : "none", enabled ? lon!.toFixed(3) : "none"],
    queryFn: () => fetchNWSAlerts(lat!, lon!),
    enabled,
    staleTime: 90_000,
    refetchInterval: 90_000,
  });

  if (prefersReducedMotion()) return { calm: true, reason: "reduced-motion", event: null };

  const hit = ((data ?? []) as NWSAlertFeature[]).find(
    (a) => a.properties.messageType !== "Cancel" && isCalmEvent(a.properties.event),
  );
  if (hit) return { calm: true, reason: "warning", event: hit.properties.event ?? null };

  return { calm: false, reason: null, event: null };
}
