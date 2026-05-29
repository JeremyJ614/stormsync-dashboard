import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { broadcastStore, type Broadcast } from "../lib/adminStore";
import { Bell, X, AlertTriangle, Info } from "lucide-react";

export default function NotificationToast() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Broadcast[]>([]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => setPending(broadcastStore.getUnseen(user.id));
    refresh();
    const t = setInterval(refresh, 5000);
    const handler = () => refresh();
    window.addEventListener("store-stormsync_broadcasts_v1", handler);
    return () => {
      clearInterval(t);
      window.removeEventListener("store-stormsync_broadcasts_v1", handler);
    };
  }, [user]);

  if (!user || pending.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
      {pending.slice(0, 3).map(b => {
        const Icon = b.level === "alert" ? AlertTriangle : b.level === "warning" ? Bell : Info;
        const ring = b.level === "alert" ? "border-red-500/60 bg-red-500/15"
          : b.level === "warning" ? "border-orange-500/60 bg-orange-500/15"
          : "border-primary/40 bg-primary/10";
        return (
          <div key={b.id} className={`pointer-events-auto rounded-xl border ${ring} backdrop-blur p-3 flex items-start gap-2 shadow-xl`}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest opacity-70 mb-0.5">StormSync Notice</div>
              <div className="text-sm leading-relaxed">{b.message}</div>
              <div className="text-[10px] opacity-60 mt-1">{new Date(b.createdAt).toLocaleString()}</div>
            </div>
            <button
              onClick={() => { broadcastStore.markSeen(user.id, b.id); setPending(p => p.filter(x => x.id !== b.id)); }}
              className="opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
