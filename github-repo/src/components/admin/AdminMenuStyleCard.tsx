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
      {style === "solari" && (
        <>
          {/* A board of flaps, half of them mid-turn. */}
          {[14, 28, 42, 56, 70].map((t, i) => (
            <div key={t} className="absolute" style={{
              left: 5, top: t, right: 5, height: 11, borderRadius: 2,
              background: "linear-gradient(180deg, rgba(255,255,255,.07) 0 45%, rgba(0,0,0,.5) 45% 55%, rgba(255,255,255,.03) 55%)",
              border: `1px solid rgba(0,0,0,.5)`,
            }} />
          ))}
          {[14, 28, 42, 56, 70].map((t, i) => (
            <div key={`c-${t}`} className={box} style={{
              left: 8, top: t + 4, width: 26 - i * 4, height: 3,
              background: gold, opacity: i === 1 ? 0.4 : 0.85,
            }} />
          ))}
        </>
      )}
      {style === "sweep" && (
        <>
          {[10, 17, 24].map((r) => (
            <div key={r} className="absolute rounded-full" style={{
              left: 26 - r, top: 42 - r, width: r * 2, height: r * 2,
              border: `1px solid ${r === 24 ? ROYAL.goldSoft : "rgba(204,204,255,.12)"}`,
            }} />
          ))}
          <div className="absolute" style={{
            left: 26, top: 42, width: 0, height: 0,
            borderLeft: `24px solid rgba(217,183,117,.22)`, borderBottom: "18px solid transparent",
          }} />
          <div className="absolute" style={{ left: 26, top: 42 - 24, width: 1, height: 24, background: gold }} />
          {[[26, 18], [43, 42], [26, 66], [9, 42]].map(([l, t], i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: l - 3.5, top: t - 3.5, width: 7, height: 7,
              background: "rgba(10,10,22,.9)", border: `1px solid ${gold}`,
            }} />
          ))}
          <div className="absolute rounded-full" style={{
            left: 26 - 6, top: 42 - 6, width: 12, height: 12,
            background: "rgba(217,183,117,.18)", border: `1px solid ${ROYAL.goldSoft}`,
          }} />
        </>
      )}
      {style === "strata" && (
        <>
          {[10, 26, 42, 58].map((t, i) => (
            <div key={t} className={box} style={{
              left: 6 + i * 0.5, top: t, width: 40 - i, height: 12, borderRadius: 3,
              background: "rgba(255,255,255,.09)",
              borderTop: `1px solid rgba(217,183,117,${0.5 - i * 0.1})`,
            }} />
          ))}
          <div className={box} style={{ left: 9, top: 13, width: 6, height: 6, background: gold, opacity: .9 }} />
          <div className={box} style={{ left: 9, top: 29, width: 6, height: 6, background: gold, opacity: .65 }} />
          <div className={box} style={{ left: 9, top: 45, width: 6, height: 6, background: gold, opacity: .45 }} />
          <div className={box} style={{ left: 9, top: 61, width: 6, height: 6, background: gold, opacity: .3 }} />
        </>
      )}
      {style === "deck" && (
        <>
          {/* Four cards on a table, one still arriving. */}
          {[[6, 20], [29, 20], [6, 48], [29, 48]].map(([l, t], i) => (
            <div key={i} className="absolute" style={{
              left: l, top: t, width: 17, height: 22, borderRadius: 4,
              background: "linear-gradient(150deg, rgba(255,255,255,.11), rgba(255,255,255,.02))",
              border: `1px solid ${i === 0 ? ROYAL.goldSoft : "rgba(204,204,255,.14)"}`,
              transform: i === 3 ? "rotate(-16deg) translate(4px, -3px)" : "none",
              boxShadow: i === 3 ? "0 6px 12px -6px #000" : "none",
            }} />
          ))}
          <div className="absolute rounded-full" style={{
            left: 9, top: 24, width: 8, height: 8,
            background: "rgba(217,183,117,.18)", border: `1px solid ${ROYAL.goldSoft}`,
          }} />
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
        presentation changes. All but Classic Rail collapse to a single control and hand the 62px rail
        back to the content, so modules get the whole page. Changes apply to everyone on their next
        page load.
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
