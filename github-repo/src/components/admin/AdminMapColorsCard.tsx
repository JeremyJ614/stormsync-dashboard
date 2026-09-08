import { useCallback, useEffect, useMemo, useState } from "react";
import { useSticky } from "../../lib/stickyState";
import { Loader2, Palette, RotateCcw, Save } from "lucide-react";
import { PROB_STEPS } from "../ProbabilityMap";
import { PALETTES, KIND_TITLE, type Kind } from "../../lib/spcPalette";
import { EF_COLORS, EF_ORDER } from "../../lib/severeHistoryData";
import {
  getPaletteSnapshot, previewMapPalette, saveMapPalette, loadMapPalette,
} from "../../lib/mapPalette";
import { HexField, parseHex } from "./HexField";
import { ExampleOutlook, ExampleTracks, type OutlookLevel } from "./ExampleOutlook";
import { audit } from "../../lib/adminAudit";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * The colour of the maps where colour is the data.
 *
 * On the Thunderstorm Probability scale, the SPC Outlook palettes and the EF
 * ramp on Severe Weather History, the shade IS the reading — "how bad is that patch" has no other answer on the map. That
 * makes a wrong colour a forecaster misreading a forecast, and it makes judging
 * a colour from a swatch impossible: a hex that looks distinct in a row of
 * squares can vanish into a near-black basemap or collide with the level two
 * rungs above it. The only honest way to pick one is to look at it on a real
 * outlook.
 *
 * The preview used to be the live module on today's real feed, which sounds
 * better than it is. A real day carries one or two levels; the top of every
 * ramp — the levels that matter most and are hardest to get right — almost
 * never appears, so most of the scale could not be seen at all. So each ramp
 * now previews on an EXAMPLE outlook that carries every one of its levels at
 * once, drawn on the real country, at the opacity the real module paints, and
 * labelled on the map as an example so it can never be mistaken for a forecast.
 *
 * Edits repaint it as the hex is typed and are held locally until Save, so an
 * experiment is not something every member is looking at.
 */
type Swatch = { key: string; label: string; def: string; opacity?: number };
type Group = { id: string; title: string; note?: string; swatches: Swatch[] };

const PROB_GROUP: Group = {
  id: "prob",
  title: "Thunderstorm Probability",
  note: "Five levels, benign to destructive. Level 1 covers half the country on a quiet day, so it paints faint on purpose.",
  swatches: PROB_STEPS.map((s) => ({
    key: `prob:${s.level}`, label: `${s.level} · ${s.label}`, def: s.color,
    // The real map fades level 1 almost out because it covers half the country
    // on a quiet day; the preview has to do the same or the colour is judged at
    // an opacity nobody ever sees it at.
    opacity: s.opacity,
  })),
};

const SPC_GROUPS: Group[] = (Object.keys(PALETTES) as Kind[]).map((k) => ({
  id: `spc:${k}`,
  title: `SPC — ${KIND_TITLE[k]}`,
  swatches: PALETTES[k].map((d, i) => ({ key: `spc:${k}:${i}`, label: d.label, def: d.color })),
}));

const EF_GROUP: Group = {
  id: "ef",
  title: "Tornado tracks (EF scale)",
  note: "Severe Weather History draws every surveyed track in its rating's colour, so the ramp has to stay readable as thin lines on a dark map — which is a harder test than a filled polygon.",
  swatches: EF_ORDER.map((ef) => ({
    key: `ef:${ef}`,
    label: ef === "EFU" ? "EFU · unrated" : ef,
    def: EF_COLORS[ef],
  })),
};

const ALL_GROUPS = [PROB_GROUP, EF_GROUP, ...SPC_GROUPS];

export function AdminMapColorsCard() {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...getPaletteSnapshot().colors }));
  const [open, setOpen] = useSticky<string>(
    "admin.mapColors.group", "prob",
    (v): v is string => typeof v === "string" && ALL_GROUPS.some((g) => g.id === v),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /**
   * What is live, captured rather than read back.
   *
   * `dirty` used to compare the draft against `getPaletteSnapshot()`. That is
   * the store `previewMapPalette` writes to on every keystroke, so editing a
   * colour moved the baseline to match it: draft and snapshot were equal again
   * the instant they diverged, `dirty` was never true, and "Save for everyone"
   * sat disabled for ever. The maps repainted, so it looked like the app was
   * working and only the button was broken — in fact nothing was ever stored.
   *
   * The baseline is now taken when the card loads and again after each save,
   * and never from the preview store.
   */
  const [savedColors, setSavedColors] = useState<Record<string, string>>(
    () => ({ ...getPaletteSnapshot().colors }));

  useEffect(() => {
    void loadMapPalette().then(() => {
      const live = { ...getPaletteSnapshot().colors };
      setSavedColors(live);
      setDraft(live);
    });
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedColors),
    [draft, savedColors],
  );

  /**
   * Set one override and repaint every map on screen; nothing is stored yet.
   *
   * This used to DELETE the key when handed anything that was not already a
   * complete hex, which is what every intermediate keystroke looks like. The
   * result was that typing a colour cleared it and Save wrote the empty set.
   * Callers now hand this a colour or nothing at all — `HexField` does the
   * parsing and only commits whole values.
   */
  const set = useCallback((key: string, hex: string) => {
    const clean = parseHex(hex);
    if (!clean) return;
    setDraft((d) => {
      const next = { ...d, [key]: clean };
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
    setSavedColors({ ...draft });
    setNote("Saved. Every member sees this now.");
  }

  async function discard() {
    setBusy(true);
    await loadMapPalette(true);
    const live = { ...getPaletteSnapshot().colors };
    setDraft(live);
    setSavedColors(live);
    previewMapPalette(live);
    setBusy(false);
    setNote("Back to what is live.");
  }

  const group = ALL_GROUPS.find((g) => g.id === open) ?? PROB_GROUP;

  /**
   * What the example map paints: the draft colour where one has been typed,
   * the shipped default everywhere else. Read from `draft` rather than from
   * the palette store so the preview follows the box being typed into even
   * before anything is saved.
   */
  const levels: OutlookLevel[] = useMemo(
    () => group.swatches.map((sw) => ({
      label: sw.label,
      color: draft[sw.key] ?? sw.def,
      opacity: sw.opacity,
    })),
    [group, draft],
  );

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: ROYAL.gold }} /> Map colours
        </h3>
        <p className="text-xs text-muted-foreground">
          The preview below repaints as you type. It is an example day carrying every level of the
          chosen ramp at once — a real outlook almost never shows more than two, so the top of a
          scale could never be judged against a live one. Only swatches you actually change are
          stored, so a colour you leave alone keeps following the app's default if that default is
          ever improved.
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
                <HexField value={value} onCommit={(hex) => set(sw.key, hex)}
                          ariaLabel={`${sw.label} hex`} />
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
          {group.id === "ef"
            ? "Example tracks — every rating, at the width the map really draws them"
            : `Example outlook — all ${group.swatches.length} levels at once, at map opacity`}
        </div>
        {group.id === "ef"
          ? <ExampleTracks levels={levels} />
          : <ExampleOutlook levels={levels} caption={group.title} />}
      </div>
    </div>
  );
}
