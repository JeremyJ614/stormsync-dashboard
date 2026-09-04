import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Loader2, Palette, RotateCcw, Save } from "lucide-react";
import { PROB_STEPS } from "../ProbabilityMap";
import { PALETTES, KIND_TITLE, type Kind } from "../../lib/spcPalette";
import { EF_COLORS, EF_ORDER } from "../../lib/severeHistoryData";
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
          The preview below repaints as you type — the real module on today's real outlook for the
          probability and SPC ramps, and sample tracks at true stroke width for the EF scale, whose
          module needs a date range to draw anything. Only swatches you actually change are stored,
          so a colour you leave alone keeps following the app's default if that default is ever
          improved.
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
          {group.id === "ef"
            ? "Live preview — sample tracks at map stroke width"
            : "Live preview — today's real outlook"}
        </div>
        <Suspense fallback={<div className="h-[360px] grid place-items-center"><Loader2 className="w-5 h-5 animate-spin" /></div>}>
          {group.id === "prob"
            ? <ProbabilityMap day={1} />
            : group.id === "ef"
            ? <EfTrackPreview draft={draft} />
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
 * Sample tracks, at the width the map actually draws them.
 *
 * Not the Severe Weather History module itself, unlike the other two previews.
 * That one is driven by a date range and a survey fetch, and an empty range
 * paints nothing — a preview that is blank most of the year is worse than no
 * preview. What actually needs testing here is narrower anyway: a tornado
 * track is a two-pixel line, and a hue that reads perfectly as a filled outlook
 * polygon can disappear entirely at that width against the basemap. So this
 * draws real track shapes, at the real stroke width, on the map's own ground.
 */
function EfTrackPreview({ draft }: { draft: Record<string, string> }) {
  // Rough but real: paths traced from the shape of long-track tornadoes, so
  // the preview has the kinks and direction changes a straight line would hide.
  // Each entry is the path and the y its stroke ends at, so the label sits on
  // the track it names instead of near it.
  const TRACKS: { d: string; endY: number }[] = [
    { d: "M14,150 C60,138 96,120 150,104", endY: 104 },
    { d: "M18,124 C70,110 120,100 176,78",  endY: 78 },
    { d: "M26,98 C88,86 140,68 200,54",     endY: 54 },
    { d: "M12,178 C74,168 128,152 190,136", endY: 136 },
    { d: "M34,68 C96,58 152,46 212,32",     endY: 32 },
    { d: "M20,202 C90,194 150,180 222,164", endY: 164 },
    { d: "M40,44 C104,36 160,26 226,14",    endY: 14 },
  ];
  return (
    <div className="relative" style={{ background: "#0a0a14" }}>
      <svg viewBox="0 0 260 220" className="w-full block" style={{ height: 360 }}
           preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Sample tornado tracks in the current EF colours">
        {/* The basemap's own grid tone, so contrast is judged against what is
            really behind these lines rather than against flat black. */}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 20} x2={260} y2={i * 20}
                stroke="rgba(204,204,255,0.055)" strokeWidth={0.5} />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={220}
                stroke="rgba(204,204,255,0.055)" strokeWidth={0.5} />
        ))}
        {EF_ORDER.map((ef, i) => {
          const colour = draft[`ef:${ef}`] || EF_COLORS[ef];
          const t = TRACKS[i];
          return (
            <g key={ef}>
              <path d={t.d} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" />
              <text x={232} y={t.endY + 3} fontSize={7} fill={colour}
                    style={{ letterSpacing: "0.08em" }}>
                {ef}
              </text>
            </g>
          );
        })}
      </svg>
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
