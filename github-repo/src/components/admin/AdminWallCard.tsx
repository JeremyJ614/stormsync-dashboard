import { useCallback, useEffect, useState } from "react";
import { Check, Crown, Eye, EyeOff, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  listWall, addWallName, updateWallName, removeWallName, type WallName,
} from "../../lib/wall";
import {
  getWallStyleSnapshot, previewWallStyle, saveWallStyle, loadWallStyle,
  WALL_DEFAULTS, WALL_FONTS, type WallStyle,
} from "../../lib/wallStyle";
import { NameWall } from "../NameWall";
import { audit } from "../../lib/adminAudit";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * The Wall.
 *
 * Two jobs in one card, because they are the same job: what the board looks
 * like, and whose names are on it.
 *
 * THE DIALS EXIST BECAUSE THE ANSWER IS A JUDGEMENT. "Glowing a little" is not
 * a number anybody can pick from a spec — it depends on the screen, the room
 * and how much the board is meant to draw the eye away from the briefing next
 * to it. So the preview is the real wall with the real names, repainting as
 * the slider moves, and the numbers are stored rather than compiled in.
 *
 * NAMES STILL ARRIVE ON THEIR OWN. The raffle's `engraving` effect calls
 * `private.engrave_name` the moment somebody wins one, and that is how the
 * board fills. This is for the rest: fixing a spelling, adding somebody by
 * hand, taking a name down. The blessed slot is a radio button, not a
 * checkbox, enforced twice — a partial unique index allows one live blessed
 * row, and promoting somebody here demotes the incumbent first, which is what
 * winning it does too.
 */
export function AdminWallCard() {
  const [rows, setRows] = useState<WallName[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [blessed, setBlessed] = useState(false);

  const [style, setStyle] = useState<WallStyle>(() => ({ ...getWallStyleSnapshot().style }));
  const [saved, setSaved] = useState<WallStyle>(() => ({ ...getWallStyleSnapshot().style }));
  const [savingStyle, setSavingStyle] = useState(false);

  const load = useCallback(() => {
    // `true` includes hidden rows: an admin has to be able to see what they
    // took down in order to put it back.
    void listWall(true).then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Pick up whatever is stored before offering it for editing, so the sliders
  // start where the wall actually is rather than at the defaults.
  useEffect(() => {
    void loadWallStyle().then(() => {
      const s = { ...getWallStyleSnapshot().style };
      setStyle(s); setSaved(s);
    });
  }, []);

  /** Every edit paints immediately; only Save makes it everyone's. */
  function edit(patch: Partial<WallStyle>) {
    const next = { ...style, ...patch };
    setStyle(next);
    previewWallStyle(next);
  }

  const styleDirty = JSON.stringify(style) !== JSON.stringify(saved);

  async function saveStyle() {
    setSavingStyle(true); setNote(null);
    const r = await saveWallStyle(style);
    setSavingStyle(false);
    if (!r.ok) { setNote(r.error ?? "Could not save the look."); return; }
    await audit("settings.change", { type: "settings", id: "wall_style", label: "The Wall" },
      { ...style });
    setSaved({ ...style });
    setNote("Saved. Everyone sees this now.");
  }

  function discardStyle() { setStyle({ ...saved }); previewWallStyle(saved); }
  function resetStyle() { const d = { ...WALL_DEFAULTS }; setStyle(d); previewWallStyle(d); }

  // ── names ────────────────────────────────────────────────────────────────
  async function add() {
    if (!name.trim()) { setNote("Give it a name."); return; }
    setBusy("add"); setNote(null);
    const r = await addWallName({ display: name, slot: blessed ? "blessed" : "engraved" });
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not add that."); return; }
    await audit("settings.change", { type: "settings", id: "wall", label: name.trim() },
      { slot: blessed ? "blessed" : "engraved" });
    setName(""); setBlessed(false);
    setNote("Up on the wall.");
    load();
  }

  async function patch(row: WallName, p: Parameters<typeof updateWallName>[1], what: string) {
    setBusy(row.id); setNote(null);
    const r = await updateWallName(row.id, p);
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not change that."); return; }
    await audit("settings.change", { type: "settings", id: "wall", label: row.display }, { what });
    load();
  }

  async function remove(row: WallName) {
    if (!confirm(`Take "${row.display}" off the wall? This cannot be undone.`)) return;
    setBusy(row.id);
    const r = await removeWallName(row.id);
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not remove that."); return; }
    await audit("settings.change", { type: "settings", id: "wall", label: row.display }, { removed: true });
    load();
  }

  const field = "bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40";
  const live = (rows ?? []).filter((r) => r.active);
  const hidden = (rows ?? []).filter((r) => !r.active);

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Crown className="w-4 h-4" style={{ color: ROYAL.gold }} /> The Wall
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          The board on the Home page. Raffle wins engrave themselves; everything here is for
          fixing a spelling, adding somebody by hand, or deciding how the thing looks.
        </p>
      </div>

      {/* ── the look ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 border-b border-border text-[11px]" style={{ color: ROYAL.dim }}>
          Live preview — the real wall, with the real names
        </div>
        <div className="p-3" style={{ background: ROYAL.ink }}>
          <div style={{ height: 210 }}><NameWall /></div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
        <Dial label="Glow" hint="How far light spills out of a cut. Low reads as carved; high reads as neon."
              value={style.glow} onChange={(v) => edit({ glow: v })} />
        <Dial label="Depth of cut" hint="The light gradient across each letter — shadowed lip, hot centre, bright rim. This is what makes it carved rather than coloured."
              value={style.bevel} onChange={(v) => edit({ bevel: v })} />
        <Dial label="Brightness" hint="How far the board lifts off the page behind it."
              value={style.brightness} onChange={(v) => edit({ brightness: v })} />
        <Dial label="Letter spacing" hint="Inscriptions are cut wide. Tight spacing reads as a logo."
              value={style.tracking} max={60}
              onChange={(v) => edit({ tracking: v })} />
      </div>

      {/* ── the letterforms ────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
        <div>
          <span className="text-xs font-semibold">Face</span>
          <select value={style.font}
                  onChange={(e) => edit({ font: e.target.value as WallStyle["font"] })}
                  className="w-full mt-1 bg-muted/30 border border-border rounded-lg px-2.5 py-2 text-xs outline-none focus:border-primary/40">
            {WALL_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <p className="text-[10.5px] leading-snug mt-1" style={{ color: ROYAL.dim }}>
            Cinzel is drawn from Roman letters cut into stone, which is why it is the default.
          </p>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold">Stroke weight</span>
            <span className="text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>{style.weight}</span>
          </div>
          <input type="range" min={300} max={900} step={100} value={style.weight}
                 onChange={(e) => edit({ weight: +e.target.value })}
                 className="w-full accent-primary mt-1" aria-label="Stroke weight" />
          <p className="text-[10.5px] leading-snug" style={{ color: ROYAL.dim }}>
            Thin cuts like a chisel. Heavy cuts like a sign.
          </p>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none mt-2">
            <input type="checkbox" checked={style.caps}
                   onChange={(e) => edit({ caps: e.target.checked })} className="accent-primary" />
            Capitals
          </label>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-5 gap-y-2">
        <Swatch label="Blessed name" value={style.blessed} onChange={(v) => edit({ blessed: v })} />
        <Swatch label="Other names" value={style.roll} onChange={(v) => edit({ roll: v })} />
        <Swatch label="Board" value={style.board} onChange={(v) => edit({ board: v })} />
        <Swatch label="Scratched line" value={style.rule} onChange={(v) => edit({ rule: v })} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={saveStyle} disabled={!styleDirty || savingStyle}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
          {savingStyle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save for everyone
        </button>
        <button onClick={discardStyle} disabled={!styleDirty}
                className="px-3 py-2 rounded-lg text-xs border border-border disabled:opacity-40">
          Discard changes
        </button>
        <button onClick={resetStyle}
                className="px-3 py-2 rounded-lg text-xs border border-border flex items-center gap-1.5"
                title="Back to the app's defaults">
          <RotateCcw className="w-3.5 h-3.5" /> Defaults
        </button>
      </div>

      {note && <p className="text-[11.5px]" style={{ color: ROYAL.gold }}>{note}</p>}

      {/* ── the names ──────────────────────────────────────────────────── */}
      <div className="pt-2 border-t" style={{ borderColor: ROYAL.hairline }}>
        <div className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: ROYAL.dim }}>
          Names
        </div>

        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="Name as it should read" className={field} />
          <button onClick={add} disabled={busy === "add"}
                  className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 justify-center"
                  style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {busy === "add" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Engrave
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none mt-2">
          <input type="checkbox" checked={blessed} onChange={(e) => setBlessed(e.target.checked)}
                 className="accent-primary" />
          Put them in the blessed slot at the top
        </label>

        {rows === null ? (
          <div className="py-6 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : live.length === 0 && hidden.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">Nothing on the wall yet.</p>
        ) : (
          <div className="space-y-1.5 mt-3">
            {[...live, ...hidden].map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                   style={{
                     border: `1px solid ${r.slot === "blessed" ? ROYAL.goldSoft : ROYAL.hairline}`,
                     background: r.slot === "blessed" ? "rgba(217,183,117,0.07)" : "transparent",
                     opacity: r.active ? 1 : 0.45,
                   }}>
                {r.slot === "blessed" && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />}
                <input
                  value={r.display}
                  onChange={(e) => setRows((list) =>
                    (list ?? []).map((x) => (x.id === r.id ? { ...x, display: e.target.value } : x)))}
                  onBlur={(e) => { if (e.target.value.trim() !== "") void patch(r, { display: e.target.value }, "renamed"); }}
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
                  style={{ fontFamily: HEADING, color: ROYAL.text }}
                />
                {!r.active && <span className="text-[10px] shrink-0" style={{ color: ROYAL.dim }}>hidden</span>}

                <button onClick={() => void patch(r, { slot: r.slot === "blessed" ? "engraved" : "blessed" },
                                                  r.slot === "blessed" ? "demoted" : "promoted")}
                        disabled={busy === r.id}
                        title={r.slot === "blessed" ? "Move down to the roll" : "Make this the blessed name"}
                        className="w-7 h-7 grid place-items-center rounded-lg border border-border disabled:opacity-40 shrink-0">
                  {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" />
                                 : r.slot === "blessed" ? <Check className="w-3 h-3" style={{ color: ROYAL.gold }} />
                                 : <Crown className="w-3 h-3" />}
                </button>
                <button onClick={() => void patch(r, { active: !r.active }, r.active ? "hidden" : "shown")}
                        disabled={busy === r.id}
                        title={r.active ? "Take it off the wall for now" : "Put it back"}
                        className="w-7 h-7 grid place-items-center rounded-lg border border-border disabled:opacity-40 shrink-0">
                  {r.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
                <button onClick={() => void remove(r)} disabled={busy === r.id}
                        className="w-7 h-7 grid place-items-center rounded-lg border border-border disabled:opacity-40 shrink-0"
                        style={{ color: "#f87171" }}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Dial({
  label, hint, value, onChange, max = 100,
}: { label: string; hint: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>{value}</span>
      </div>
      <input type="range" min={0} max={max} value={value}
             onChange={(e) => onChange(+e.target.value)}
             className="w-full accent-primary mt-1" aria-label={label} />
      <p className="text-[10.5px] leading-snug" style={{ color: ROYAL.dim }}>{hint}</p>
    </div>
  );
}

function Swatch({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
             className="w-9 h-9 rounded-lg bg-transparent border border-border cursor-pointer shrink-0"
             aria-label={`${label} colour`} />
      <span className="text-xs flex-1 min-w-0 truncate">{label}</span>
      <input value={value.toUpperCase()}
             onChange={(e) => { const v = e.target.value.trim();
                                if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v); }}
             className="w-[92px] bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-[11px] font-mono outline-none focus:border-primary/40"
             aria-label={`${label} hex`} />
    </div>
  );
}
