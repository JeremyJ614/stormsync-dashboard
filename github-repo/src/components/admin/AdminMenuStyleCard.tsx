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
 * stale when a menu is adjusted — each is a recognisable reduction of what the
 * real thing does, not a generic thumbnail.
 *
 * The list is long enough that both columns scroll on their own. That is
 * deliberate: the alternative is a grid of tiles too small to tell the styles
 * apart, and telling them apart is the entire job of this card.
 */
function Preview({ style }: { style: MenuStyle }) {
  const gold = ROYAL.gold;
  const box = "absolute rounded-[3px]";
  return (
    <div className="relative shrink-0 overflow-hidden rounded-lg"
         style={{ width: 52, height: 84, background: "#08080f", border: `1px solid ${ROYAL.hairline}` }}>
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

      {style === "tessellate" && (
        <>
          {[[8, 10], [28, 10], [3, 28], [18, 28], [33, 28], [8, 46], [28, 46], [18, 64]].map(([l, t], i) => (
            <div key={i} className="absolute" style={{
              left: l, top: t, width: 17, height: 17,
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              background: i === 3
                ? `linear-gradient(150deg, ${gold}, #a8823f)`
                : "linear-gradient(150deg, rgba(217,183,117,.4), rgba(20,20,31,1) 40%)",
            }} />
          ))}
        </>
      )}

      {style === "comic" && (
        <>
          <div className="absolute inset-0" style={{ background: "#efe7d6" }} />
          {[[4, 6], [19, 6], [34, 6], [4, 30], [19, 30], [34, 30], [4, 54], [19, 54], [34, 54]].map(([l, t], i) => (
            <div key={i} className="absolute" style={{
              left: l, top: t, width: 13, height: 18,
              background: ["#ffd23f", "#4cc9f0", "#ff6b6b", "#8ac926", "#c77dff", "#ffa552", "#5ce1e6", "#ff8fab", "#a0c4ff"][i],
              border: "1.4px solid #0d0b12",
              boxShadow: "1.4px 1.4px 0 rgba(13,11,18,.85)",
              transform: `rotate(${i % 3 === 0 ? -1.4 : i % 3 === 1 ? 0.9 : -0.6}deg)`,
            }} />
          ))}
        </>
      )}

      {style === "apex" && (
        <>
          {[[7, 46], [12, 33], [22, 26], [33, 30], [41, 41]].map(([l, t], i) => (
            <div key={i} className="absolute rounded-[4px]" style={{
              left: l, top: t, width: i === 2 ? 11 : 8, height: i === 2 ? 11 : 8,
              background: i === 2 ? `linear-gradient(150deg, ${gold}, #a8823f)` : "rgba(255,255,255,.09)",
              border: `1px solid ${i === 2 ? gold : ROYAL.hairline}`,
            }} />
          ))}
          <div className="absolute rounded-full" style={{
            left: 18, top: 60, width: 16, height: 16,
            background: `linear-gradient(150deg, ${gold}, #a8823f)`,
            boxShadow: `0 0 0 2px rgba(204,204,255,.12)`,
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
      {/* More styles than fit comfortably; the column scrolls rather than the
          previews shrinking to the point of being indistinguishable. */}
      <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
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
        {MENU_STYLES.length} styles. Every one shows the same sections and modules and respects the
        same access rules — only the presentation changes. Every one collapses to a single control
        and gives the content the whole page. Changes apply to everyone on their next page load.
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
