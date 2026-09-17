import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Wifi } from "lucide-react";
import { useOnline } from "../hooks/useOnline";
import { ROYAL } from "../lib/royal";

/**
 * A strip that says the network is gone.
 *
 * The app is used in the field, where signal is the first thing to go. Without
 * this, a dropped connection looks identical to calm weather: the numbers on
 * screen are simply the last ones that arrived, with nothing to say so.
 *
 * On the way back it refetches what is on screen and says so briefly, then
 * gets out of the way.
 */
export function OfflineBar() {
  const online = useOnline();
  const qc = useQueryClient();
  const [recovered, setRecovered] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) { wasOffline.current = true; setRecovered(false); return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setRecovered(true);
    void qc.refetchQueries({ type: "active" }).catch(() => {});
    const t = setTimeout(() => setRecovered(false), 3200);
    return () => clearTimeout(t);
  }, [online, qc]);

  if (online && !recovered) return null;

  const offline = !online;
  return (
    <div
      role="status"
      className="sticky z-[19] flex items-center justify-center gap-2 px-4 py-1.5 text-[11.5px] font-medium"
      style={{
        top: "calc(env(safe-area-inset-top, 0px))",
        background: offline ? "rgba(180,69,31,0.92)" : "rgba(16,40,30,0.94)",
        color: offline ? "#fff" : "#8ee6b8",
        borderBottom: `1px solid ${ROYAL.hairline}`,
      }}
    >
      {offline
        ? <><CloudOff className="w-3.5 h-3.5" /> Offline — showing the last data received</>
        : <><Wifi className="w-3.5 h-3.5" /> Back online — refreshing</>}
    </div>
  );
}

export default OfflineBar;
