import { useCallback, useEffect, useState } from "react";
import { Check, Crown, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import {
  listWall, addWallName, updateWallName, removeWallName, type WallName,
} from "../../lib/wall";
import { audit } from "../../lib/adminAudit";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * Curating the wall.
 *
 * Names get here on their own — the raffle's `engraving` effect calls
 * `private.engrave_name` the moment somebody wins one — so this is not the way
 * names arrive. It is the way a spelling gets fixed, somebody who should be up
 * there is added by hand, and a mistake comes down.
 *
 * The blessed slot is a radio button, not a checkbox, and enforced twice: a
 * partial unique index in the database allows only one live blessed row, and
 * promoting somebody here demotes the incumbent to the roll first — the same
 * thing winning it does, because the previous holder did win it.
 */
export function AdminWallCard() {
  const [rows, setRows] = useState<WallName[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [why, setWhy] = useState("");
  const [blessed, setBlessed] = useState(false);

  const load = useCallback(() => {
    // `true` includes hidden rows: an admin has to be able to see what they
    // took down in order to put it back.
    void listWall(true).then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name.trim()) { setNote("Give it a name."); return; }
    setBusy("add"); setNote(null);
    const r = await addWallName({
      display: name, slot: blessed ? "blessed" : "engraved", note: why || null,
    });
    setBusy(null);
    if (!r.ok) { setNote(r.error ?? "Could not add that."); return; }
    await audit("settings.change", { type: "settings", id: "wall", label: name.trim() },
      { slot: blessed ? "blessed" : "engraved" });
    setName(""); setWhy(""); setBlessed(false);
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
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Crown className="w-4 h-4" style={{ color: ROYAL.gold }} /> The Wall
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Raffle wins engrave themselves. This is for fixing a spelling, adding somebody by hand, or
          taking a name down. Only one Blessed Name can be live — promoting anybody drops the
          previous holder to the roll rather than deleting them, because they did win it.
        </p>
      </div>

      {/* ── add ────────────────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)}
               placeholder="Name as it should read" className={field} />
        <input value={why} onChange={(e) => setWhy(e.target.value)}
               placeholder="Small line underneath (optional)" className={`${field} text-xs`} />
        <button onClick={add} disabled={busy === "add"}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 justify-center"
                style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
          {busy === "add" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Engrave
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
        <input type="checkbox" checked={blessed} onChange={(e) => setBlessed(e.target.checked)}
               className="accent-primary" />
        Put them in the Blessed slot at the top
      </label>

      {note && <p className="text-[11.5px]" style={{ color: ROYAL.gold }}>{note}</p>}

      {/* ── the wall as it stands ──────────────────────────────────────── */}
      {rows === null ? (
        <div className="py-6 grid place-items-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : live.length === 0 && hidden.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">Nothing on the wall yet.</p>
      ) : (
        <div className="space-y-1.5">
          {[...live, ...hidden].map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                 style={{
                   border: `1px solid ${r.slot === "blessed" ? ROYAL.goldSoft : ROYAL.hairline}`,
                   background: r.slot === "blessed" ? "rgba(217,183,117,0.07)" : "transparent",
                   opacity: r.active ? 1 : 0.45,
                 }}>
              {r.slot === "blessed" && <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />}
              <div className="min-w-0 flex-1">
                <input
                  value={r.display}
                  onChange={(e) => setRows((list) =>
                    (list ?? []).map((x) => (x.id === r.id ? { ...x, display: e.target.value } : x)))}
                  onBlur={(e) => { if (e.target.value.trim() !== "") void patch(r, { display: e.target.value }, "renamed"); }}
                  className="w-full bg-transparent text-[13px] font-semibold outline-none"
                  style={{ fontFamily: HEADING, color: ROYAL.text }}
                />
                <div className="text-[10px]" style={{ color: ROYAL.dim }}>
                  {r.note || (r.slot === "blessed" ? "the blessed name" : "on the roll")}
                  {!r.active && " · hidden"}
                </div>
              </div>

              <button onClick={() => void patch(r, { slot: r.slot === "blessed" ? "engraved" : "blessed" },
                                                r.slot === "blessed" ? "demoted" : "promoted")}
                      disabled={busy === r.id}
                      title={r.slot === "blessed" ? "Move down to the roll" : "Make this the Blessed Name"}
                      className="w-7 h-7 grid place-items-center rounded-lg border border-border disabled:opacity-40">
                {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" />
                               : r.slot === "blessed" ? <Check className="w-3 h-3" style={{ color: ROYAL.gold }} />
                               : <Crown className="w-3 h-3" />}
              </button>
              <button onClick={() => void patch(r, { active: !r.active }, r.active ? "hidden" : "shown")}
                      disabled={busy === r.id}
                      title={r.active ? "Take it off the wall for now" : "Put it back"}
                      className="w-7 h-7 grid place-items-center rounded-lg border border-border disabled:opacity-40">
                {r.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button onClick={() => void remove(r)} disabled={busy === r.id}
                      className="w-7 h-7 grid place-items-center rounded-lg border border-border disabled:opacity-40"
                      style={{ color: "#f87171" }}>
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
