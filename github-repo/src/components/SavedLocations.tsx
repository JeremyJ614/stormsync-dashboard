import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import type { Location } from "../hooks/useLocation";
import { listSavedLocations, addSavedLocation, removeSavedLocation, setPrimaryLocation } from "../lib/savedLocations";
import { Bookmark, Star, X, Plus, MapPin } from "lucide-react";

interface Props {
  location: Location;
  onSetLocation: (loc: Location) => void;
}

// Two coordinates are "the same place" if within ~3 miles.
const sameSpot = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;

export function SavedLocations({ location, onSetLocation }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: saved = [], refetch } = useQuery({
    queryKey: ["saved-locations", user?.id],
    queryFn: listSavedLocations,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;

  const currentSaved = saved.find(s => sameSpot(s, location));

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refetch(); } finally { setBusy(false); }
  };
  const saveCurrent = () => run(() => addSavedLocation(user.id, location, saved.length === 0));
  const remove = (id: string) => run(() => removeSavedLocation(id));
  const makePrimary = (id: string) => run(() => setPrimaryLocation(user.id, id));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title="My saved locations"
        className={`p-1.5 rounded-lg transition-colors ${open ? "text-primary bg-muted" : "text-muted-foreground hover:text-primary hover:bg-muted"}`}
      >
        <Bookmark className={`w-4 h-4 ${currentSaved ? "fill-primary text-primary" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-popover border border-border rounded-lg shadow-xl w-64 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider">My Locations</span>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {saved.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No saved locations yet.</div>
            )}
            {saved.map(s => {
              const active = sameSpot(s, location);
              return (
                <div key={s.id} className={`flex items-center gap-1 px-2 py-1.5 border-b border-border/20 last:border-b-0 ${active ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                  <button
                    onClick={() => { onSetLocation({ lat: s.lat, lon: s.lon, name: s.name }); setOpen(false); }}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left"
                  >
                    <MapPin className={`w-3.5 h-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm truncate ${active ? "text-primary font-medium" : ""}`}>{s.name}</span>
                  </button>
                  <button
                    onClick={() => makePrimary(s.id)} disabled={busy || s.isPrimary}
                    title={s.isPrimary ? "Primary location" : "Set as primary"}
                    className="p-1 rounded hover:bg-muted disabled:opacity-100"
                  >
                    <Star className={`w-3.5 h-3.5 ${s.isPrimary ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
                  </button>
                  <button onClick={() => remove(s.id)} disabled={busy} title="Remove"
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {!currentSaved && (
            <button
              onClick={saveCurrent} disabled={busy}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-border/50 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Save current — <span className="truncate">{location.name}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
