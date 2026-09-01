import { useEffect, useState } from "react";

/**
 * Whether the device thinks it has a network.
 *
 * `navigator.onLine` is famously optimistic — it means "an interface is up",
 * not "the internet answers" — so this is a hint for the UI, never a gate on a
 * request. The app is used in the field with one bar; being told the data on
 * screen may be stale is worth more than being right about the radio.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}
