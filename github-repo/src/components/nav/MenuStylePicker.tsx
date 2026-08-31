import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import {
  MENU_STYLES, MENU_META, saveMenuStyle,
  subscribeMenuStyle, getMenuStyleSnapshot, getMenuStyleServerSnapshot,
} from "../../lib/menuStyle";
import { ROYAL, panelStyle } from "../../lib/royal";

/**
 * Choosing how navigation opens.
 *
 * The preview is a real miniature of each style's resting shape rather than a
 * screenshot, so it cannot go stale when a menu is adjusted. Picking one applies
 * it immediately — there is no save button, because the thing you are choosing
 * is the thing you use to leave this page.
 */
function Preview({ style }: { style: string }) {
  const gold = ROYAL.gold;
  const box = "absolute rounded-[3px]";
  return (
    <div className="relative shrink-0 overflow-hidden rounded-lg"
         style={{ width: 58, height: 92, background: "#0a0a14", border: `1px solid ${ROYAL.hairline}` }}>
      {style === "rail" && (
        <>
          <div className="absolute inset-y-0 left-0" style={{ width: 13, background: "rgba(255,255,255,.09)" }} />
          {[10, 24, 38, 52, 66].map((t) => (
            <div key={t} className={box} style={{ left: 4, top: t, width: 5, height: 5, background: gold, opacity: 0.85 }} />
          ))}
        </>
      )}
      {style === "spiral" && (
        <>
          <div className={box} style={{ left: 5, bottom: 5, width: 7, height: 7, background: gold }} />
          <div className={box} style={{ left: 5, bottom: 13, width: 7, height: 7, background: "rgba(255,255,255,.18)" }} />
          <div className={box} style={{ left: 13, bottom: 5, width: 14, height: 14, background: "rgba(255,255,255,.14)" }} />
          <div className={box} style={{ left: 5, bottom: 20, width: 21, height: 21, background: "rgba(255,255,255,.11)" }} />
          <div className={box} style={{ left: 27, bottom: 5, width: 25, height: 36, background: "rgba(255,255,255,.09)" }} />
          <div className={box} style={{ left: 5, bottom: 42, width: 47, height: 40, background: "rgba(255,255,255,.07)", border: `1px solid ${ROYAL.goldSoft}` }} />
        </>
      )}
      {style === "gooey" && (
        <>
          <div className="absolute rounded-full" style={{ right: 6, bottom: 6, width: 13, height: 13, background: gold }} />
          {[[6, 30], [16, 26], [24, 17], [28, 7]].map(([r, b], i) => (
            <div key={i} className="absolute rounded-full" style={{ right: r + 6, bottom: b + 6, width: 8, height: 8, background: gold, opacity: 0.75 }} />
          ))}
        </>
      )}
      {style === "push" && (
        <>
          {[10, 22, 34, 46, 58].map((t) => (
            <div key={t} className={box} style={{ left: 5, top: t, width: 22, height: 4, background: "rgba(255,255,255,.35)" }} />
          ))}
          <div className="absolute" style={{
            right: -6, top: 12, width: 40, height: 68, borderRadius: 6,
            background: "rgba(255,255,255,.16)", border: `1px solid ${ROYAL.hairline}`,
            transform: "perspective(120px) rotateY(-20deg)",
          }} />
        </>
      )}
      {style === "fan" && (
        <>
          {[-26, -13, 0, 13, 26].map((a, i) => (
            <div key={i} className="absolute" style={{
              left: 21, bottom: 8, width: 16, height: 26, borderRadius: 4,
              background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.35)",
              transformOrigin: "bottom center", transform: `rotate(${a}deg) translateY(-22px)`,
            }} />
          ))}
          <div className="absolute rounded-full" style={{ left: 22, bottom: 5, width: 14, height: 14, background: "rgba(255,255,255,.3)" }} />
        </>
      )}
      {style === "singularity" && (
        <>
          <div className="absolute rounded-full" style={{
            left: 23, top: 39, width: 12, height: 12, background: "#05030a",
            boxShadow: "0 0 7px 3px #a855f7, 0 0 12px 5px #3b82f6",
          }} />
          {[[29, 20], [43, 39], [29, 58], [15, 39], [38, 26], [20, 52]].map(([l, t], i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: l, top: t, width: 8, height: 8,
              background: `radial-gradient(circle at 30% 30%, hsl(${i * 55} 80% 70%), hsl(${i * 55} 70% 35%))`,
            }} />
          ))}
        </>
      )}
    </div>
  );
}

export function MenuStylePicker() {
  const style = useSyncExternalStore(subscribeMenuStyle, getMenuStyleSnapshot, getMenuStyleServerSnapshot);

  return (
    <div className="rounded-2xl p-4" style={panelStyle}>
      <h3 className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: ROYAL.text }}>
        Menu style
      </h3>
      <p className="text-xs mb-4" style={{ color: ROYAL.dim }}>
        Six ways to open the same navigation. Changes apply straight away, and every
        style shows every module you can see.
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {MENU_STYLES.map((s) => {
          const meta = MENU_META[s];
          const active = s === style;
          return (
            <button
              key={s}
              onClick={() => saveMenuStyle(s)}
              aria-pressed={active}
              className="flex gap-3 items-start text-left rounded-xl p-3 transition-colors"
              style={{
                background: active ? "rgba(217,183,117,0.10)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${active ? ROYAL.goldSoft : ROYAL.hairline}`,
              }}
            >
              <Preview style={s} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold" style={{ color: ROYAL.text }}>{meta.label}</span>
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
