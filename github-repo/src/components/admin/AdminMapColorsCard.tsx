import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Loader2, Palette, RotateCcw, Save } from "lucide-react";
import { PROB_STEPS } from "../ProbabilityMap";
import { PALETTES, KIND_TITLE, type Kind } from "../../lib/spcPalette";
import {
  getPaletteSnapshot, previewMapPalette, saveMapPalette, loadMapPalette,
} from "../../lib/mapPalette";
import { audit } from "../../lib/adminAudit";
import { ROYAL, HEADING } from "../../lib/royal";

const ProbabilityMap = lazy(() =>
  import("../ProbabilityMap").then((m) => ({ default: m.ProbabilityMap })));
const SPCStaticMap = lazy(() =>
  import("../SPCStaticMap").then((m) => ({ default: m.SPCStaticMap })));

/**
 * The colour of the two maps where colour is the data.
 *
 * On the Thunderstorm Probability scale and the SPC Outlook palettes, the shade
 * IS the reading — "how bad is that patch" has no other answer on the map. That
 * makes a wrong colour a forecaster misreading a forecast, and it makes judging
 * a colour from a swatch impossible: a hex that looks distinct in a row of
 * squares can vanish into a near-black basemap or collide with the level two
 * rungs above it. The only honest way to pick one is to look at it on a real
 * outlook.
 *
 * So the preview is the actual module, fed by the actual feed, repainting as
 * the hex is typed. Edits are held locally until Save, so an experiment is not
 * something every member is looking at.
 */
type Group = { id: string; title: string; note?: string; swatches: { key: string; label: string; def: string }[] };

const PROB_GROUP: Group = {
  id: "prob",
  title: "Thunderstorm Probability",
  note: "Five levels, benign to destructive. Level 1 covers half the country on a quiet day, so it paints faint on purpose.",
  swatches: PROB_STEPS.map((s) => ({ key: `prob:${s.level}`, label: `${s.level} · ${s.label}`, def: s.color })),
};

const SPC_GROUPS: Group[] = (Object.keys(PALETTES) as Kind[]).map((k) => ({
  id: `spc:${k}`,
  title: `SPC — ${KIND_TITLE[k]}`,
  swatches: PALETTES[k].map((d, i) => ({ key: `spc:${k}:${i}`, label: d.label, def: d.color })),
}));

const ALL_GROUPS = [PROB_GROUP, ...SPC_GROUPS];

export function AdminMapColorsCard() {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...getPaletteSnapshot().colors }));
  const [open, setOpen] = useState<string>("prob");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(getPaletteSnapshot().colors),
    [draft],
  );

  /** Typing repaints every map on screen at once; nothing is stored yet. */
  const set = useCallback((key: string, hex: string) => {
    setDraft((d) => {
      const next = { ...d };
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) next[key] = hex.toUpperCase();
      else delete next[key];
      previewMapPalette(next);
      return next;
    });
  }, []);

  const reset = useCallback((key: string) => {
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      previewMapPalette(next);
      return next;
    });
  }, []);

  async function save() {
    setBusy(true); setNote(null);
    const r = await saveMapPalette(draft);
    setBusy(false);
    if (!r.ok) { setNote(r.error ?? "Could not save."); return; }
    await audit("settings.change", { type: "settings", id: "map_palettes", label: "Map colours" },
      { overrides: Object.keys(draft).length });
    setNote("Saved. Every member sees this now.");
  }

  async function discard() {
    setBusy(true);
    await loadMapPalette(true);
    const live = { ...getPaletteSnapshot().colors };
    setDraft(live);
    previewMapPalette(live);
    setBusy(false);
    setNote("Back to what is live.");
  }

  const group = ALL_GROUPS.find((g) => g.id === open) ?? PROB_GROUP;

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: ROYAL.gold }} /> Map colours
        </h3>
        <p className="text-xs text-muted-foreground">
          The preview below is the real module on today's real outlook, repainting as you type. Only
          swatches you actually change are stored, so a colour you leave alone keeps following the
          app's default if that default is ever improved.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {ALL_GROUPS.map((g) => (
            <button key={g.id} onClick={() => setOpen(g.id)}
              className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold"
              style={{
                background: open === g.id ? "rgba(217,183,117,0.16)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${open === g.id ? ROYAL.goldSoft : ROYAL.hairline}`,
                color: open === g.id ? ROYAL.gold : ROYAL.dim,
              }}>
              {g.title}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-2.5">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: ROYAL.dim, fontFamily: HEADING }}>
          {group.title}
        </h4>
        {group.note && <p className="text-[11px]" style={{ color: ROYAL.dim }}>{group.note}</p>}

        <div className="space-y-1.5">
          {group.swatches.map((sw) => {
            const value = draft[sw.key] ?? sw.def;
            const changed = draft[sw.key] != null && draft[sw.key] !== sw.def;
            return (
              <div key={sw.key} className="flex items-center gap-2">
                <input type="color" value={value} onChange={(e) => set(sw.key, e.target.value)}
                       className="w-9 h-9 rounded-lg bg-transparent border border-border cursor-pointer shrink-0"
                       aria-label={`${sw.label} colour`} />
                <span className="flex-1 min-w-0 text-[12px] truncate" style={{ color: ROYAL.text }}>
                  {sw.label}
                </span>
                <input value={value} onChange={(e) => set(sw.key, e.target.value)}
                       spellCheck={false}
                       className="w-[92px] bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-[11px] font-mono uppercase outline-none focus:border-primary/40" />
                <button onClick={() => reset(sw.key)} disabled={!changed}
                        className="w-7 h-7 grid place-items-center rounded-lg border border-border disabled:opacity-25"
                        title="Back to the default" aria-label={`Reset ${sw.label}`}>
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={save} disabled={busy || !dirty}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
                  style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save for everyone
          </button>
          <button onClick={discard} disabled={busy}
                  className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-xs font-medium disabled:opacity-50">
            Discard changes
          </button>
          {note && <span className="text-[11px]" style={{ color: ROYAL.dim }}>{note}</span>}
          {dirty && !note && (
            <span className="text-[11px]" style={{ color: ROYAL.gold }}>
              Previewing — not saved yet.
            </span>
          )}
        </div>
      </div>

      {/* ── the preview ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[11px]" style={{ color: ROYAL.dim }}>
          Live preview — today's real outlook
        </div>
        <Suspense fallback={<div className="h-[360px] grid place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
          {group.id === "prob"
            ? <ProbabilityMap day={1} />
            : <SPCStaticMap
                product={spcProductFor(group.id)}
                mode={group.id.includes("Intensity") ? "intensity" : "likelihood"}
                title={group.title}
                subtitle="Preview" />}
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The SPC product whose map exercises a given palette.
 *
 * Each palette only ever paints one product, so previewing the wrong one would
 * show colours that cannot change no matter what is typed.
 */
function spcProductFor(groupId: string): "day1otlk_cat" | "day1otlk_torn" | "day1otlk_hail" | "day1otlk_wind" {
  if (groupId.includes("tornado")) return "day1otlk_torn";
  if (groupId.includes("hail")) return "day1otlk_hail";
  if (groupId.includes("wind")) return "day1otlk_wind";
  return "day1otlk_cat";
}
