/**
 * Editor for the admin panel's own tab layout.
 *
 * Lives beside the sidebar editor because it is the same job pointed at a
 * different menu: name some groups, decide what goes in each, decide the order.
 * The list of tabs that exist comes from the panel itself, so a tab added in
 * code shows up here to be filed rather than needing to be typed in by hand.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUp, ArrowDown, Plus, Trash2, Save, Check, Loader2, RotateCcw, LayoutGrid,
} from "lucide-react";
import {
  getAdminLayout, saveAdminLayout, resolveLayout, DEFAULT_LAYOUT, type AdminLayout,
} from "../lib/adminGroups";
import { audit } from "../lib/adminAudit";
import { ROYAL } from "../lib/royal";

export function AdminGroupsEditor({ known }: { known: { id: string; label: string }[] }) {
  const [layout, setLayout] = useState<AdminLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newGroup, setNewGroup] = useState("");

  useEffect(() => { getAdminLayout().then(setLayout).finally(() => setLoading(false)); }, []);

  const labelOf = useCallback(
    (id: string) => known.find((t) => t.id === id)?.label ?? id,
    [known],
  );

  if (loading || !layout) {
    return <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading layout…
    </div>;
  }

  const placed = new Set(layout.groups.flatMap((g) => g.tabs));
  const unfiled = known.filter((t) => !placed.has(t.id));

  const edit = (fn: (l: AdminLayout) => AdminLayout) => { setLayout(fn(layout)); setSaved(false); };

  const moveGroup = (i: number, dir: -1 | 1) => edit((l) => {
    const g = [...l.groups];
    const j = i + dir;
    if (j < 0 || j >= g.length) return l;
    [g[i], g[j]] = [g[j], g[i]];
    return { groups: g };
  });

  const moveTab = (gi: number, ti: number, dir: -1 | 1) => edit((l) => {
    const g = l.groups.map((x) => ({ ...x, tabs: [...x.tabs] }));
    const tabs = g[gi].tabs;
    const j = ti + dir;
    if (j < 0 || j >= tabs.length) return l;
    [tabs[ti], tabs[j]] = [tabs[j], tabs[ti]];
    return { groups: g };
  });

  const assign = (tabId: string, groupId: string) => edit((l) => ({
    groups: l.groups.map((g) => ({
      ...g,
      tabs: g.id === groupId
        ? [...g.tabs.filter((t) => t !== tabId), tabId]
        : g.tabs.filter((t) => t !== tabId),
    })),
  }));

  const removeTab = (tabId: string) => edit((l) => ({
    groups: l.groups.map((g) => ({ ...g, tabs: g.tabs.filter((t) => t !== tabId) })),
  }));

  const rename = (gi: number, label: string) => edit((l) => {
    const g = [...l.groups];
    g[gi] = { ...g[gi], label };
    return { groups: g };
  });

  const addGroup = () => {
    const label = newGroup.trim();
    if (!label) return;
    edit((l) => ({
      groups: [...l.groups, { id: `g${Date.now().toString(36)}`, label, tabs: [] }],
    }));
    setNewGroup("");
  };

  const dropGroup = (gi: number) => edit((l) => ({ groups: l.groups.filter((_, i) => i !== gi) }));

  async function save() {
    setSaving(true);
    const r = await saveAdminLayout(layout!);
    setSaving(false);
    if (r.ok) {
      setSaved(true);
      void audit("nav.groups", { type: "admin_layout" }, { groups: layout!.groups.length });
      setTimeout(() => setSaved(false), 2200);
    } else {
      alert(r.error ?? "Save failed");
    }
  }

  const preview = resolveLayout(layout, known);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Group and order the admin panel's own tabs. Anything you leave unfiled still appears, under
        “Everything else” — a tab can never be lost by forgetting to place it.
      </p>

      <div className="space-y-3">
        {layout.groups.map((g, gi) => (
          <section key={g.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <header className="px-3 py-2.5 border-b border-border flex items-center gap-2">
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />
              <input
                value={g.label}
                onChange={(e) => rename(gi, e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none focus:bg-muted/25 rounded px-1.5 py-0.5"
              />
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{g.tabs.length}</span>
              <button onClick={() => moveGroup(gi, -1)} disabled={gi === 0} aria-label="Move group up"
                className="p-1 rounded hover:bg-white/10 disabled:opacity-25"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => moveGroup(gi, 1)} disabled={gi === layout.groups.length - 1} aria-label="Move group down"
                className="p-1 rounded hover:bg-white/10 disabled:opacity-25"><ArrowDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => dropGroup(gi)} aria-label="Delete group"
                className="p-1 rounded hover:bg-red-500/15 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </header>

            {g.tabs.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Empty — assign tabs from the list below.</p>
            ) : (
              <div className="divide-y divide-border">
                {g.tabs.map((t, ti) => (
                  <div key={t} className="px-3 py-2 flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">{labelOf(t)}</span>
                    <code className="text-[10px] text-muted-foreground/60 hidden sm:inline">{t}</code>
                    <button onClick={() => moveTab(gi, ti, -1)} disabled={ti === 0} aria-label="Move tab up"
                      className="p-1 rounded hover:bg-white/10 disabled:opacity-25"><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => moveTab(gi, ti, 1)} disabled={ti === g.tabs.length - 1} aria-label="Move tab down"
                      className="p-1 rounded hover:bg-white/10 disabled:opacity-25"><ArrowDown className="w-3 h-3" /></button>
                    <button onClick={() => removeTab(t)} aria-label="Unfile tab"
                      className="p-1 rounded hover:bg-white/10 text-muted-foreground">✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* add a group */}
      <div className="flex gap-2">
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
          placeholder="New group name…"
          className="flex-1 bg-muted/25 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <button onClick={addGroup} disabled={!newGroup.trim()}
          className="px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* unfiled */}
      {unfiled.length > 0 && (
        <section className="bg-card border rounded-xl p-3" style={{ borderColor: `${ROYAL.iris}30` }}>
          <h4 className="text-[11px] uppercase tracking-wider mb-2" style={{ color: ROYAL.iris }}>
            Unfiled ({unfiled.length})
          </h4>
          <div className="space-y-1.5">
            {unfiled.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">{t.label}</span>
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) assign(t.id, e.target.value); }}
                  className="bg-muted/30 border border-border rounded-md px-2 py-1 text-[11px] outline-none"
                >
                  <option value="">Move to…</option>
                  {layout.groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* preview + save */}
      <div className="bg-card border border-border rounded-xl p-3">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Preview</h4>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {preview.map((g) => (
            <span key={g.id} className="text-[11px]">
              <span style={{ color: ROYAL.gold }}>{g.label}</span>
              <span className="text-muted-foreground"> · {g.tabs.map((t) => t.label).join(", ")}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved" : "Save layout"}
        </button>
        <button onClick={() => { setLayout(DEFAULT_LAYOUT); setSaved(false); }}
          className="px-3 py-2 rounded-lg bg-muted/30 text-muted-foreground hover:text-foreground text-sm flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Reset to default
        </button>
      </div>
    </div>
  );
}

export default AdminGroupsEditor;
