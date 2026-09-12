/**
 * Model-run manifests for the Model Runs viewer (Phase 4).
 *
 * Frames are pre-rendered by `scripts/render_maps.py` (GitHub Actions, 4x/day)
 * and stored in the public `model-maps` bucket; this reads the `model_runs`
 * manifest rows the renderer writes.
 *
 * Deliberately source-agnostic: the viewer only ever sees `{key,label,group}`
 * params and `{fhr,valid,url}` frames, so swapping or adding a render backend
 * later needs no frontend change.
 */
import { supabase, isSupabaseConfigured } from "./supabase";

export type ModelId = "hrrr" | "gfs" | "href";

export interface ModelParam {
  key: string;
  label: string;
  group: string;
  unit: string;
  legend: { v: number; c: string }[];
}
export interface ModelFrame { fhr: number; valid: string; url: string }

export interface ModelRun {
  id: string;
  model: ModelId;
  cycle: string;
  region: string;
  maxFhr: number;
  params: ModelParam[];
  frames: Record<string, ModelFrame[]>;
  renderedAt: string;
}

/** Public storage URL for a stored frame path. */
function publicUrl(path: string): string {
  const { data } = supabase.storage.from("model-maps").getPublicUrl(path);
  return data.publicUrl;
}

interface Row {
  id: string; model: string; cycle: string; region: string; max_fhr: number;
  params: ModelParam[] | null;
  frames: Record<string, { fhr: number; valid: string; path: string }[]> | null;
  rendered_at: string;
}

function toRun(r: Row): ModelRun {
  const frames: Record<string, ModelFrame[]> = {};
  for (const [k, list] of Object.entries(r.frames ?? {})) {
    frames[k] = (list ?? [])
      .slice()
      .sort((a, b) => a.fhr - b.fhr)
      .map((f) => ({ fhr: f.fhr, valid: f.valid, url: publicUrl(f.path) }));
  }
  return {
    id: r.id, model: r.model as ModelId, cycle: r.cycle, region: r.region,
    maxFhr: r.max_fhr, params: r.params ?? [], frames, renderedAt: r.rendered_at,
  };
}

/** Most recent runs for a model, newest first (for the archive dropdown). */
export async function listRuns(model: ModelId, limit = 6): Promise<ModelRun[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("model_runs")
    .select("id,model,cycle,region,max_fhr,params,frames,rendered_at")
    .eq("model", model)
    .eq("region", "conus")
    .order("cycle", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toRun(r as Row));
}

/** Group params in a stable, meteorologically sensible order. */
export const GROUP_ORDER = ["Severe Weather", "Surface & Precipitation", "Upper Air"];

export function groupParams(params: ModelParam[]): { group: string; params: ModelParam[] }[] {
  const by = new Map<string, ModelParam[]>();
  for (const p of params) {
    const g = by.get(p.group) ?? [];
    g.push(p);
    by.set(p.group, g);
  }
  return [...by.entries()]
    .sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a[0]), ib = GROUP_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([group, ps]) => ({ group, params: ps }));
}

export function cycleLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}Z ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
}
export function validLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
