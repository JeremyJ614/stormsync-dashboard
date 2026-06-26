import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Settings, X, AlertTriangle, Eye, FileText, Newspaper, Info } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { listNotifications, markRead, markAllRead, deleteNotification, getPrefs, savePrefs, type AppNotification, type NotifKind, type NotifSeverity, type NotifPrefs, DEFAULT_PREFS } from "../lib/notifications";

const SEV_COLOR: Record<NotifSeverity, string> = { extreme: "#FA003F", severe: "#f97316", moderate: "#fde047", info: "#22d3ee" };
const KIND_ICON: Record<NotifKind, typeof Bell> = { warning: AlertTriangle, watch: Eye, outlook: FileText, digest: FileText, news: Newspaper, system: Info };

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(40),
    enabled: !!user,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const unread = items.filter(n => !n.readAt).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setShowSettings(false); } };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["notifications"] }), [qc]);

  async function onItem(n: AppNotification) {
    if (!n.readAt) { await markRead(n.id); refresh(); }
    if (n.link) { setOpen(false); navigate(n.link); }
  }
  async function onMarkAll() { await markAllRead(); refresh(); }
  async function onDelete(e: React.MouseEvent, id: string) { e.stopPropagation(); await deleteNotification(id); refresh(); }

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="Alerts & notifications"
        className="relative p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-[340px] max-w-[90vw] bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="text-sm font-bold flex items-center gap-1.5"><Bell className="w-4 h-4 text-primary" /> Alerts{unread > 0 && <span className="text-[11px] text-muted-foreground font-normal">({unread} new)</span>}</div>
            <div className="flex items-center gap-1">
              {unread > 0 && <button onClick={onMarkAll} title="Mark all read" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary"><CheckCheck className="w-3.5 h-3.5" /></button>}
              <button onClick={() => setShowSettings(s => !s)} title="Alert settings" className={`p-1.5 rounded hover:bg-muted ${showSettings ? "text-primary" : "text-muted-foreground hover:text-primary"}`}><Settings className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {showSettings ? (
            <SettingsPanel userId={user.id} tier={user.tier} />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 && (
                <div className="p-8 text-center">
                  <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No alerts yet.</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Warnings, watches and outlook changes for your saved locations will appear here.</p>
                </div>
              )}
              {items.map(n => {
                const Icon = KIND_ICON[n.kind] ?? Info;
                const color = SEV_COLOR[n.severity] ?? SEV_COLOR.info;
                return (
                  <button key={n.id} onClick={() => onItem(n)} className={`w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-muted/40 transition-colors flex gap-2.5 group ${n.readAt ? "opacity-60" : ""}`}>
                    <div className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "1f", color }}><Icon className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {!n.readAt && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
                        <span className="text-xs font-semibold truncate">{n.title}</span>
                      </div>
                      {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <span className="text-[10px] text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
                    </div>
                    <span onClick={(e) => onDelete(e, n.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-400 self-start"><X className="w-3 h-3" /></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${disabled ? "opacity-40 cursor-not-allowed bg-muted" : on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function SettingsPanel({ userId, tier }: { userId: string; tier: number }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  useEffect(() => { getPrefs(userId).then(setPrefs); }, [userId]);

  const set = (k: keyof NotifPrefs, v: boolean) => { const next = { ...prefs, [k]: v }; setPrefs(next); setSaved(false); savePrefs(userId, { [k]: v }).then(() => setSaved(true)); };

  // Tier rules: in-app / push / daily digest = all tiers. Warnings/watches/outlook = Tier 2+.
  // Email & text alert delivery is opted into from My Profile (Tier 3+).
  const typesOk = tier >= 2;
  const tierHint = (ok: boolean, normal: string) => (ok ? normal : "Tier 2+");

  const Row = ({ label, k, locked, hint }: { label: string; k: keyof NotifPrefs; locked?: boolean; hint?: string }) => (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div><div className="text-xs font-medium">{label}</div>{hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}</div>
      <Toggle on={!locked && Boolean(prefs[k])} onClick={() => set(k, !prefs[k])} disabled={locked} />
    </div>
  );

  return (
    <div className="p-3 max-h-[60vh] overflow-y-auto">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Channels</div>
      <Row label="In-app alerts" k="inapp_enabled" hint="Always available" />
      <Row label="Push notifications" k="push_enabled" hint="Browser / phone push" />
      <Row label="Daily digest" k="email_digest" hint="Morning summary" />
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-3 mb-1">Alert types</div>
      <Row label="Warnings" k="warnings" locked={!typesOk} hint={tierHint(typesOk, "Tornado / severe / flash flood")} />
      <Row label="Watches" k="watches" locked={!typesOk} hint={tierHint(typesOk, "Tornado & severe thunderstorm")} />
      <Row label="Outlook escalations" k="outlook" locked={!typesOk} hint={tierHint(typesOk, "When your area goes ENH+")} />
      <div className="mt-3 text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-2">
        {tier >= 3 ? "Email & text alerts are set up in My Profile." : "Email & text alerts unlock at Tier 3 (set up in My Profile)."}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 h-3">{saved ? "Saved ✓" : ""}</div>
    </div>
  );
}
