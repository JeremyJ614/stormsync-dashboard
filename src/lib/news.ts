/**
 * SSWX News (Phase 7 / U-25, rich editor P-18) — backed by `public.news_posts`
 * (RLS: public read, admin write). Posts persist for every member on every
 * device. Bodies support lightweight Markdown (see `markdown.ts`). The rich
 * editor adds excerpt, category, tags, cover/media, pinning, drafts, scheduled
 * publishing and per-tier audience targeting.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type NewsStatus = "draft" | "published";

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  excerpt?: string;
  category?: string;
  tags: string[];
  imageUrl?: string;
  videoUrl?: string;
  embedHtml?: string;
  pinned: boolean;
  status: NewsStatus;
  publishAt?: string;
  minTier: number;
  author: string;
  createdAt: string;
  updatedAt?: string;
}

export interface NewsInput {
  title: string;
  body: string;
  excerpt?: string;
  category?: string;
  tags?: string[];
  imageUrl?: string;
  videoUrl?: string;
  embedHtml?: string;
  pinned?: boolean;
  status?: NewsStatus;
  publishAt?: string | null;
  minTier?: number;
}

interface Row {
  id: string; title: string; body: string;
  excerpt: string | null; category: string | null; tags: string[] | null;
  image_url: string | null; video_url: string | null; embed_html: string | null;
  pinned: boolean | null; status: string | null; publish_at: string | null; min_tier: number | null;
  author: string; created_at: string; updated_at: string | null;
}
const toPost = (r: Row): NewsPost => ({
  id: r.id, title: r.title, body: r.body,
  excerpt: r.excerpt ?? undefined, category: r.category ?? undefined, tags: r.tags ?? [],
  imageUrl: r.image_url ?? undefined, videoUrl: r.video_url ?? undefined, embedHtml: r.embed_html ?? undefined,
  pinned: r.pinned ?? false, status: (r.status === "draft" ? "draft" : "published"),
  publishAt: r.publish_at ?? undefined, minTier: r.min_tier ?? 1,
  author: r.author, createdAt: r.created_at, updatedAt: r.updated_at ?? undefined,
});

const toRow = (p: NewsInput) => ({
  title: p.title, body: p.body,
  excerpt: p.excerpt?.trim() || null,
  category: p.category?.trim() || null,
  tags: p.tags ?? [],
  image_url: p.imageUrl || null, video_url: p.videoUrl || null, embed_html: p.embedHtml || null,
  pinned: p.pinned ?? false,
  status: p.status ?? "published",
  publish_at: p.publishAt || null,
  min_tier: p.minTier ?? 1,
});

/** Admin feed — every post, pinned first then newest. */
export async function listAllNews(): Promise<NewsPost[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("news_posts").select("*")
    .order("pinned", { ascending: false }).order("created_at", { ascending: false });
  if (error) { logger.error("listAllNews failed", { scope: "news", error }); throw error; }
  return (data ?? []).map((r) => toPost(r as Row));
}

/**
 * Public feed — only published posts whose schedule has arrived, gated to the
 * viewer's tier. Drafts, future-scheduled posts and higher-tier posts are
 * filtered out client-side (admin-authored content, not a hard security
 * boundary). Pinned posts float to the top.
 */
export async function listNews(viewerTier = 4): Promise<NewsPost[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("news_posts").select("*")
    .order("pinned", { ascending: false }).order("created_at", { ascending: false });
  if (error) { logger.error("listNews failed", { scope: "news", error }); throw error; }
  const now = Date.now();
  return (data ?? []).map((r) => toPost(r as Row)).filter((p) =>
    p.status === "published" &&
    (!p.publishAt || new Date(p.publishAt).getTime() <= now) &&
    p.minTier <= viewerTier
  );
}

export async function createNews(p: NewsInput & { author: string }): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("news_posts").insert({ ...toRow(p), author: p.author });
  if (error) { logger.error("createNews failed", { scope: "news", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function updateNews(id: string, p: NewsInput): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("news_posts").update({ ...toRow(p), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { logger.error("updateNews failed", { scope: "news", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

/** Lightweight toggles used by the admin list (pin / publish-state). */
export async function patchNews(id: string, patch: Partial<{ pinned: boolean; status: NewsStatus }>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.pinned !== undefined) row.pinned = patch.pinned;
  if (patch.status !== undefined) row.status = patch.status;
  const { error } = await supabase.from("news_posts").update(row).eq("id", id);
  if (error) logger.error("patchNews failed", { scope: "news", error });
}

export async function deleteNews(id: string): Promise<void> {
  const { error } = await supabase.from("news_posts").delete().eq("id", id);
  if (error) logger.error("deleteNews failed", { scope: "news", error });
}
