import { useEffect, useState } from "react";
import { Check, Loader2, Menu as MenuIcon } from "lucide-react";
import {
  MENU_STYLES, MENU_META, loadMenuStyles, saveMenuStyles,
  type MenuStyle, type MenuStyleConfig,
} from "../../lib/menuStyle";
import { ROYAL } from "../../lib/royal";

/**
 * Choosing the navigation menu, for members and for the panel.
 *
 * Two independent choices so a style can be tried on the admin side while
 * members stay on another. The previews are miniatures drawn from the same
 * tokens as the menus themselves rather than screenshots, so they cannot go
 * stale when a menu is adjusted.
 */
function Preview({ style }: { style: MenuStyle }) {
  const gold = ROYAL.gold;
  const box = "absolute rounded-[3px]";
  return (
    <div className="relative shrink-0 overflow-hidden rounded-lg"
         style={{ width: 52, height: 84, background: "#08080f", border: `1px solid ${ROYAL.hairline}` }}>
      {style === "rail" && (
        <>
          <div className="absolute inset-y-0 left-0" style={{ width: 12, background: "rgba(255,255,255,.08)" }} />
          {[9, 21, 33, 45, 57].map((t) => (
            <div key={t} className={box} style={{ left: 4, top: t, width: 4, height: 4, background: gold, opacity: 0.85 }} />
          ))}
        </>
      )}
      {style === "spiral" && (
        <>
          <div className={box} style={{ left: 4, bottom: 4, width: 6, height: 6, background: gold }} />
          <div className={box} style={{ left: 4, bottom: 11, width: 6, height: 6, background: "rgba(255,255,255,.18)" }} />
          <div className={box} style={{ left: 11, bottom: 4, width: 12, height: 12, background: "rgba(255,255,255,.14)" }} />
          <div className={box} style={{ left: 4, bottom: 17, width: 19, height: 19, background: "rgba(255,255,255,.11)" }} />
          <div className={box} style={{ left: 24, bottom: 4, width: 22, height: 32, background: "rgba(255,255,255,.09)" }} />
          <div className={box} style={{ left: 4, bottom: 37, width: 42, height: 38, background: "rgba(255,255,255,.06)", border: `1px solid ${ROYAL.goldSoft}` }} />
        </>
      )}
      {style === "push" && (
        <>
          {[8, 19, 30, 41, 52].map((t) => (
            <div key={t} className={box} style={{ left: 4, top: t, width: 19, height: 3, background: "rgba(255,255,255,.35)" }} />
          ))}
          <div className="absolute" style={{ left: 26, top: 0, bottom: 0, width: 1, background: gold, opacity: 0.8 }} />
          <div className="absolute" style={{
            right: -6, top: 10, width: 36, height: 62, borderRadius: 6,
            background: "rgba(255,255,255,.14)", border: `1px solid ${ROYAL.hairline}`,
            transform: "perspective(110px) rotateY(-20deg)",
          }} />
        </>
      )}
      {style === "gooey" && (
        <>
          <div className="absolute rounded-full" style={{ right: 5, bottom: 5, width: 12, height: 12, background: gold }} />
          {[[5, 26], [14, 23], [21, 15], [25, 6]].map(([r, b], i) => (
            <div key={i} className="absolute rounded-full" style={{ right: r + 6, bottom: b + 6, width: 7, height: 7, background: gold, opacity: 0.8 }} />
          ))}
        </>
      )}
      {style === "singularity" && (
        <>
          <div className="absolute rounded-[50%]" style={{
            left: 6, top: 36, width: 40, height: 12,
            border: `1px solid ${gold}`, borderBottomColor: "rgba(168,85,247,.7)",
          }} />
          <div className="absolute rounded-full" style={{
            left: 20, top: 36, width: 12, height: 12, background: "#03020a",
            boxShadow: `0 0 5px 1px ${gold}, 0 0 10px 3px rgba(168,85,247,.6)`,
          }} />
          {[[24, 16], [40, 36], [24, 56], [8, 36]].map(([l, t], i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: l, top: t, width: 7, height: 7,
              background: `radial-gradient(circle at 30% 30%, hsl(${i * 70} 80% 72%), hsl(${i * 70} 70% 38%))`,
            }} />
          ))}
        </>
      )}
    </div>
  );
}

function Column({
  title, note, value, onPick,
}: { title: string; note: string; value: MenuStyle; onPick: (s: MenuStyle) => void }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold mb-0.5" style={{ color: ROYAL.text }}>{title}</div>
      <p className="text-[11px] mb-2.5" style={{ color: ROYAL.dim }}>{note}</p>
      <div className="space-y-2">
        {MENU_STYLES.map((s) => {
          const meta = MENU_META[s];
          const active = s === value;
          return (
            <button
              key={s}
              onClick={() => onPick(s)}
              aria-pressed={active}
              className="w-full flex gap-3 items-start text-left rounded-xl p-2.5 transition-colors"
              style={{
                background: active ? "rgba(217,183,117,0.10)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? ROYAL.goldSoft : ROYAL.hairline}`,
              }}
            >
              <Preview style={s} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold" style={{ color: ROYAL.text }}>{meta.label}</span>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />}
                </div>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>{meta.blurb}</p>
                <p className="text-[10.5px] mt-1 leading-snug" style={{ color: ROYAL.gold, opacity: 0.85 }}>{meta.hint}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AdminMenuStyleCard() {
  const [cfg, setCfg] = useState<MenuStyleConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { loadMenuStyles().then(setCfg); }, []);

  async function pick(which: keyof MenuStyleConfig, style: MenuStyle) {
    if (!cfg) return;
    const next = { ...cfg, [which]: style };
    setCfg(next); setSaving(true); setErr(null);
    const r = await saveMenuStyles(next);
    setSaving(false);
    if (!r.ok) { setErr(r.error ?? "Could not save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <MenuIcon className="w-4 h-4" style={{ color: ROYAL.gold }} /> Navigation menu
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {saved && !saving && <span className="text-[11px] text-green-400">Saved ✓</span>}
      </h3>
      <p className="text-xs text-muted-foreground">
        Every style shows the same sections and modules and respects the same access rules — only the
        presentation changes. Four of the five replace the sidebar entirely and hand the 62px rail back
        to the content; Classic Rail keeps it. Changes apply to everyone on their next page load.
      </p>

      {err && <div className="text-xs text-destructive">{err}</div>}

      {!cfg ? (
        <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-5">
          <Column title="Members see" note="What every non-admin gets."
                  value={cfg.customer} onPick={(s) => pick("customer", s)} />
          <Column title="Admins see" note="What you get. Try one here before moving members onto it."
                  value={cfg.admin} onPick={(s) => pick("admin", s)} />
        </div>
      )}
    </div>
  );
}
