import { useState } from "react";
import { THEMES, getTheme, setTheme, hexToHsl } from "../lib/theme";
import { Palette, Check, RotateCcw } from "lucide-react";

const QUICK_ACCENTS = ["#c7ccff", "#b388ff", "#3b9eff", "#ffab2e", "#4ade80", "#ef4444", "#22d3ee", "#f472b6"];

export function AppearancePanel() {
  const initial = getTheme();
  const [theme, setThemeId] = useState(initial.theme);
  const [accent, setAccent] = useState<string | null>(initial.accent);
  const [hexInput, setHexInput] = useState(initial.accent ?? "");

  function applyTheme(id: string) { setThemeId(id); setTheme(id, accent); }
  function applyAccent(hex: string | null) {
    if (hex && !hexToHsl(hex)) return;
    setAccent(hex); setHexInput(hex ?? ""); setTheme(theme, hex);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /> Appearance</h2>

      {/* Themes */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Theme</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {THEMES.map(t => {
            const active = theme === t.id;
            return (
              <button key={t.id} onClick={() => applyTheme(t.id)}
                className={`relative rounded-xl p-3 border text-left transition-all ${active ? "border-primary/60 ring-1 ring-primary/40" : "border-border hover:border-primary/30"}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-4 h-4 rounded-full border border-white/20" style={{ background: `hsl(${t.bgHue} ${Math.round(20 * t.bgSat)}% 11%)` }} />
                  <span className="w-4 h-4 rounded-full border border-white/20" style={{ background: t.swatch }} />
                </div>
                <div className="text-xs font-semibold">{t.label}</div>
                {active && <Check className="w-3.5 h-3.5 text-primary absolute top-2 right-2" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Accent color</div>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_ACCENTS.map(c => (
            <button key={c} onClick={() => applyAccent(c)} title={c}
              className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${accent?.toLowerCase() === c.toLowerCase() ? "border-white" : "border-transparent"}`}
              style={{ background: c }} />
          ))}
          <label className="w-7 h-7 rounded-full border border-border overflow-hidden relative cursor-pointer" title="Custom color">
            <input type="color" value={accent ?? "#c7ccff"} onChange={e => applyAccent(e.target.value)}
              className="absolute inset-0 w-[200%] h-[200%] -left-1/2 -top-1/2 cursor-pointer" />
          </label>
          <input
            value={hexInput}
            onChange={e => { setHexInput(e.target.value); if (hexToHsl(e.target.value)) applyAccent(e.target.value); }}
            placeholder="#hex"
            className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-primary/40" />
          {accent && (
            <button onClick={() => applyAccent(null)} title="Reset to theme default"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary px-2 py-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Changes apply instantly and are saved on this device. The accent overrides the theme's default highlight color.</p>
      </div>
    </div>
  );
}
