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
 * At fifteen styles the list is long enough that both columns scroll on their
 * own. That is deliberate: the alternative is a grid of tiles too small to tell
 * the styles apart, and telling them apart is the entire job of this card.
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

      {style === "strata" && (
        <>
          {/* Slabs receding in depth, with the depth gutter down the side. */}
          <div className="absolute" style={{ left: 5, top: 8, bottom: 8, width: 1, background: "rgba(204,204,255,.14)" }} />
          {[10, 26, 42, 58].map((t, i) => (
            <div key={t} className={box} style={{
              left: 9 + i * 1.5, top: t, width: 36 - i * 2.5, height: 12, borderRadius: 3,
              background: "linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.03))",
              borderTop: `1px solid rgba(217,183,117,${0.5 - i * 0.1})`,
              borderLeft: `2px solid rgba(217,183,117,${0.5 - i * 0.1})`,
            }} />
          ))}
        </>
      )}

      {style === "mercury" && (
        <>
          {/* The reservoir, and the stream beading below it — one neck still
              attached, one already pinched. */}
          <div className="absolute" style={{
            left: 6, top: 8, right: 6, height: 5, borderRadius: 999,
            background: "linear-gradient(180deg,#fffaf0,#c9aa6e 40%,#54472a 62%,#c6ab72)",
          }} />
          <div className="absolute" style={{
            left: 24, top: 12, width: 4, height: 7,
            background: "linear-gradient(180deg,#7d6839,#c9ad71 40%,#6f5c33)",
            clipPath: "polygon(0 0, 100% 0, 62% 50%, 100% 100%, 0 100%, 38% 50%)",
          }} />
          {[19, 35, 51, 67].map((t, i) => (
            <div key={t} className="absolute" style={{
              left: 8, top: t, right: 8, height: 10, borderRadius: 999,
              background: "linear-gradient(180deg,#fffaf0 0%,#d0b177 30%,#544728 64%,#cdb179 88%,#8b7444 100%)",
              opacity: i === 3 ? 0.55 : 1,
            }} />
          ))}
        </>
      )}

      {style === "vault" && (
        <>
          {/* The door on its wall, with the boxes behind it. */}
          {[0, 1, 2].map((c) => (
            <div key={c} className={box} style={{
              left: 5 + c * 15, top: 62, width: 12, height: 15,
              background: "linear-gradient(160deg,#e9d3a2,#a88c52 40%,#5f4d2a)",
            }} />
          ))}
          <div className="absolute rounded-full" style={{
            left: 6, top: 8, width: 40, height: 40,
            background: "repeating-conic-gradient(from 0deg, #31343d 0deg 5deg, #14161c 5deg 10deg)",
            border: `1px solid rgba(217,183,117,.3)`,
          }} />
          <div className="absolute rounded-full" style={{
            left: 10, top: 12, width: 32, height: 32,
            background: "radial-gradient(120% 120% at 32% 22%, #3a3d47, #15171d 70%)",
          }} />
          {[0, 90].map((d) => (
            <div key={d} className="absolute" style={{
              left: 18, top: 26.5, width: 16, height: 3, borderRadius: 2,
              transform: `rotate(${d}deg)`,
              background: "linear-gradient(90deg,#7b6a3d,#f2e2bb 50%,#7b6a3d)",
            }} />
          ))}
          <div className="absolute rounded-full" style={{
            left: 23, top: 25, width: 6, height: 6, background: gold,
          }} />
        </>
      )}

      {style === "singularity" && (
        <>
          {/* Disc behind, shadow, photon ring, disc in front. */}
          <div className="absolute rounded-[50%]" style={{
            left: 2, top: 36, width: 48, height: 13,
            background: "linear-gradient(90deg, #ffffff, #ffd9a0 40%, #8a3d12)",
            clipPath: "inset(0 0 50% 0)", opacity: 0.9,
          }} />
          <div className="absolute rounded-full" style={{
            left: 19, top: 35, width: 15, height: 15, background: "#000",
            boxShadow: `0 0 0 1.2px #fff6e0`,
          }} />
          <div className="absolute rounded-[50%]" style={{
            left: 2, top: 36, width: 48, height: 13,
            background: "linear-gradient(90deg, #ffffff, #ffd9a0 40%, #8a3d12)",
            clipPath: "inset(50% 0 0 0)", opacity: 0.95,
          }} />
          {[[24, 15], [41, 40], [24, 62], [7, 40]].map(([l, t], i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: l, top: t, width: 8, height: 8,
              background: `radial-gradient(circle at 32% 30%, hsl(${i * 70} 80% 74%), hsl(${i * 70} 70% 22%))`,
              boxShadow: "inset -2px -2px 3px rgba(0,0,0,.7)",
            }} />
          ))}
        </>
      )}

      {style === "aurora" && (
        <>
          {[4, 14, 24, 34, 42].map((l, i) => (
            <div key={l} className="absolute" style={{
              left: l, top: 8 + (i % 3) * 5, width: 6, bottom: 26, borderRadius: 3,
              background: "linear-gradient(180deg, rgba(198,118,255,0), rgba(78,232,214,.55) 45%, rgba(92,255,168,.95))",
            }} />
          ))}
          <div className="absolute" style={{
            left: 0, right: 0, bottom: 0, height: 26,
            background: "#05060f",
            clipPath: "polygon(0 40%, 14% 18%, 26% 34%, 40% 10%, 55% 30%, 70% 14%, 85% 32%, 100% 20%, 100% 100%, 0 100%)",
          }} />
          {[[8, 12], [22, 6], [38, 16], [45, 9]].map(([l, t], i) => (
            <div key={i} className="absolute rounded-full" style={{ left: l, top: t, width: 1.5, height: 1.5, background: "#dfeaff" }} />
          ))}
        </>
      )}

      {style === "origami" && (
        <>
          {[8, 22, 36, 50, 64].map((t, i) => (
            <div key={t} className="absolute" style={{
              left: 5, right: 5, top: t, height: 13,
              background: i % 2 === 0
                ? "linear-gradient(163deg, rgba(255,255,255,.13), rgba(0,0,0,.2))"
                : "linear-gradient(17deg, rgba(255,255,255,.08), rgba(0,0,0,.28))",
              borderTop: `1px solid ${ROYAL.goldSoft}`,
              borderRadius: i === 0 ? "5px 5px 0 0" : i === 4 ? "0 0 5px 5px" : 0,
            }} />
          ))}
        </>
      )}

      {style === "geometric" && (
        <>
          {[[10, 12, 3], [32, 16, 5], [12, 38, 6], [34, 44, 4], [22, 64, 8]].map(([l, t, n], i) => (
            <div key={i} className="absolute" style={{
              left: l, top: t, width: 15, height: 15,
              background: `linear-gradient(150deg, ${ROYAL.goldSoft}, rgba(204,204,255,.2))`,
              clipPath: n === 3
                ? "polygon(50% 0%, 100% 100%, 0% 100%)"
                : n === 4 ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"
                : n === 5 ? "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)"
                : n === 6 ? "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)"
                : "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
            }} />
          ))}
        </>
      )}

      {style === "neon" && (
        <>
          <div className="absolute" style={{
            left: 6, right: 6, top: 16, bottom: 16, borderRadius: 6,
            border: "1px solid #ffd489",
            boxShadow: "0 0 5px rgba(255,212,137,.9), inset 0 0 6px rgba(255,212,137,.35)",
          }} />
          {[26, 36, 46].map((t, i) => (
            <div key={t} className={box} style={{
              left: 13, top: t, width: 26 - i * 4, height: 3,
              background: ["#ffd489", "#b9b6ff", "#ff7ab8"][i],
              boxShadow: `0 0 6px ${["#ffd489", "#b9b6ff", "#ff7ab8"][i]}`,
              opacity: i === 1 ? 0.45 : 1,
            }} />
          ))}
          <div className="absolute" style={{
            left: 10, right: 10, top: 62, height: 12, filter: "blur(3px)", opacity: 0.35,
            background: "linear-gradient(180deg, rgba(255,212,137,.7), transparent)",
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

      {style === "kinetic" && (
        <>
          {[10, 26, 42, 58].map((t, i) => {
            const left = i % 2 === 0;
            return (
              <div key={t}>
                <div className={box} style={{
                  left: left ? 2 : 10, top: t, width: 36, height: 12,
                  background: "rgba(255,255,255,.05)", filter: "blur(2px)", opacity: 0.35,
                }} />
                <div className={box} style={{
                  left: left ? 6 : 6, top: t, width: 40, height: 12,
                  background: "linear-gradient(100deg, rgba(255,255,255,.12), rgba(255,255,255,.03))",
                  borderLeft: `2px solid ${ROYAL.goldSoft}`,
                }} />
              </div>
            );
          })}
        </>
      )}

      {style === "elevator" && (
        <>
          {[3, 45].map((l) => (
            <div key={l} className="absolute" style={{
              left: l, top: 4, bottom: 4, width: 4, borderRadius: 2,
              background: "linear-gradient(90deg,#16161f,#08080e)", border: `1px solid ${ROYAL.hairline}`,
            }} />
          ))}
          {[10, 26, 42, 58].map((t, i) => (
            <div key={t} className={box} style={{
              left: 10, top: t, width: 32, height: 12,
              background: "rgba(255,255,255,.05)", border: `1px solid ${ROYAL.hairline}`,
              borderBottom: `2px solid rgba(217,183,117,.3)`,
            }} />
          ))}
          <div className={box} style={{
            left: 10, top: 26, width: 32, height: 12,
            background: "rgba(217,183,117,.16)", border: `1px solid ${ROYAL.goldSoft}`,
          }} />
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
      {/* Fifteen styles is more than fits comfortably; the column scrolls rather
          than the previews shrinking to the point of being indistinguishable. */}
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
        Fifteen styles. Every one shows the same sections and modules and respects the same access
        rules — only the presentation changes. All but Classic Rail collapse to a single control and
        hand the 62px rail back to the content, so modules get the whole page. Changes apply to
        everyone on their next page load.
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
