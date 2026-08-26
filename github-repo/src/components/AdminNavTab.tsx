import { useEffect, useMemo, useState } from "react";
import {
  ArrowUp, ArrowDown, Plus, Trash2, Eye, EyeOff, Shield, Loader2, GripVertical, Check, RefreshCw,
} from "lucide-react";
import { ALL_MODULES, HIDDEN_MODULES } from "../hooks/useAuth";
import {
  loadNavConfig, getNavSnapshot, createSection, renameSection, deleteSection, reorderSections,
  updateNavModule, reorderNavModules, syncMissingModules, type NavModule,
} from "../lib/navConfig";
import { AdminGroupsEditor } from "./AdminGroupsEditor";

/**
 * Admin → "Sidebar & Modules" (P-2.1).
 * Reorder modules, move them between sections, rename sections and modules,
 * hide modules, and mark them admin-only. Reordering supports both drag-and-drop
 * (desktop) and arrow buttons (reliable on touch).
 */
export function AdminNavTab({ knownAdminTabs = [] }: { knownAdminTabs?: { id: string; label: string }[] }) {
  const [sub, setSub] = useState<"sidebar" | "adminGroups">("sidebar");
  const [, force] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newSection, setNewSection] = useState("");
  const [drag, setDrag] = useState<{ id: string; sectionId: string | null } | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = async () => { await loadNavConfig(true); force((n) => n + 1); };
  useEffect(() => { loadNavConfig(true).then(() => setLoading(false)); }, []);

  const cfg = getNavSnapshot();
  const registry = useMemo(() => new Map(ALL_MODULES.map((m) => [m.id, m])), []);
  const sections = useMemo(() => [...cfg.sections].sort((a, b) => a.sortOrder - b.sortOrder), [cfg]);
  const bySection = (sid: string | null) =>
    cfg.modules.filter((m) => m.sectionId === sid && registry.has(m.moduleId) && !HIDDEN_MODULES.has(m.moduleId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const unassigned = bySection(null);

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  async function moveModule(list: NavModule[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    setBusy(true);
    await reorderNavModules([
      { id: list[i].id, sortOrder: list[j].sortOrder },
      { id: list[j].id, sortOrder: list[i].sortOrder },
    ]);
    setBusy(false); force((n) => n + 1);
  }

  async function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    setBusy(true);
    await reorderSections([
      { id: sections[i].id, sortOrder: sections[j].sortOrder },
      { id: sections[j].id, sortOrder: sections[i].sortOrder },
    ]);
    setBusy(false); force((n) => n + 1);
  }

  async function dropOn(targetSectionId: string | null, targetIndex: number) {
    if (!drag) return;
    const list = bySection(targetSectionId).filter((m) => m.id !== drag.id);
    list.splice(targetIndex, 0, cfg.modules.find((m) => m.id === drag.id)!);
    setBusy(true);
    await updateNavModule(drag.id, { sectionId: targetSectionId });
    await reorderNavModules(list.map((m, i) => ({ id: m.id, sortOrder: i })));
    setBusy(false); setDrag(null); force((n) => n + 1);
  }

  if (loading) return <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  const Row = ({ m, list, i }: { m: NavModule; list: NavModule[]; i: number }) => {
    const reg = registry.get(m.moduleId);
    return (
      <div
        draggable
        onDragStart={() => setDrag({ id: m.id, sectionId: m.sectionId })}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); dropOn(m.sectionId, i); }}
        className={`px-3 py-2 flex items-center gap-2 ${drag?.id === m.id ? "opacity-40" : ""} ${!m.visible ? "bg-muted/10" : ""}`}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />
        <div className="flex-1 min-w-0">
          <input
            defaultValue={m.label ?? reg?.label ?? m.moduleId}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== (m.label ?? reg?.label)) updateNavModule(m.id, { label: v }).then(refresh);
            }}
            className="w-full bg-transparent text-sm font-medium outline-none focus:bg-muted/30 rounded px-1.5 py-0.5"
          />
          <div className="text-[10px] text-muted-foreground px-1.5">{m.moduleId}</div>
        </div>
        <select
          value={m.sectionId ?? ""}
          onChange={(e) => updateNavModule(m.id, { sectionId: e.target.value || null }).then(refresh)}
          className="bg-muted/30 border border-border rounded px-1.5 py-1 text-[11px] max-w-[110px] outline-none"
        >
          <option value="">Unassigned</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button title={m.visible ? "Visible — click to hide" : "Hidden — click to show"}
          onClick={() => updateNavModule(m.id, { visible: !m.visible }).then(refresh)}
          className={`p-1 ${m.visible ? "text-green-400" : "text-muted-foreground"}`}>
          {m.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button title={m.adminOnly ? "Admin-only" : "Everyone"}
          onClick={() => updateNavModule(m.id, { adminOnly: !m.adminOnly }).then(refresh)}
          className={`p-1 ${m.adminOnly ? "text-yellow-400" : "text-muted-foreground/40"}`}>
          <Shield className="w-4 h-4" />
        </button>
        <button onClick={() => moveModule(list, i, -1)} disabled={i === 0 || busy} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
        <button onClick={() => moveModule(list, i, 1)} disabled={i === list.length - 1 || busy} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Two menus get reordered from this module: the one members see, and the
          one admins see. Same job, so they live behind one pair of subtabs. */}
      <div className="flex gap-1 border-b border-border/60 pb-2">
        {([
          { id: "sidebar", label: "Member sidebar" },
          { id: "adminGroups", label: "Admin panel groups" },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sub === t.id ? "bg-primary/15 border border-primary/35 text-primary" : "border border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === "adminGroups" && <AdminGroupsEditor known={knownAdminTabs} />}

      {sub === "sidebar" && (
      <div className="space-y-5">
      <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 text-xs text-primary/90">
        Controls the member sidebar: section names &amp; order, which section each module sits in,
        module order, display name, visibility and admin-only. Changes apply immediately.
        <span className="text-muted-foreground"> Drag a row, or use the arrows on touch.</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="New section name…"
          className="flex-1 min-w-[160px] bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
        <button
          onClick={async () => { if (!newSection.trim()) return; await createSection(newSection.trim(), sections.length); setNewSection(""); refresh(); say("Section added"); }}
          className="px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> Add section</button>
        <button
          onClick={async () => { setBusy(true); const n = await syncMissingModules(ALL_MODULES.filter(m => !HIDDEN_MODULES.has(m.id)).map(m => ({ id: m.id, label: m.label }))); setBusy(false); refresh(); say(n ? `${n} new module(s) added to Unassigned` : "Already in sync"); }}
          className="px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Sync new modules</button>
      </div>
      {msg && <div className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" />{msg}</div>}

      {sections.map((sec, si) => {
        const list = bySection(sec.id);
        return (
          <div key={sec.id} className="bg-card border border-border rounded-xl overflow-hidden"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropOn(sec.id, list.length); }}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-black/20">
              <input defaultValue={sec.name}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== sec.name) renameSection(sec.id, v).then(refresh); }}
                className="flex-1 bg-transparent text-sm font-bold outline-none focus:bg-muted/30 rounded px-1.5 py-1" />
              <span className="text-[10px] text-muted-foreground">{list.length}</span>
              <button onClick={() => moveSection(si, -1)} disabled={si === 0 || busy} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1 || busy} className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              <button onClick={async () => { if (!confirm(`Delete section "${sec.name}"? Its modules move to Unassigned.`)) return; await deleteSection(sec.id); refresh(); }}
                className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="divide-y divide-border/60">
              {list.length === 0 && <p className="text-xs text-muted-foreground p-3">Empty — drag a module here.</p>}
              {list.map((m, i) => <Row key={m.id} m={m} list={list} i={i} />)}
            </div>
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div className="bg-card border border-yellow-400/30 rounded-xl overflow-hidden"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropOn(null, unassigned.length); }}>
          <div className="px-3 py-2.5 border-b border-border bg-yellow-400/10 text-sm font-bold text-yellow-200">
            Unassigned <span className="text-[10px] font-normal text-muted-foreground">— not shown in the sidebar until placed in a section</span>
          </div>
          <div className="divide-y divide-border/60">
            {unassigned.map((m, i) => <Row key={m.id} m={m} list={unassigned} i={i} />)}
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
