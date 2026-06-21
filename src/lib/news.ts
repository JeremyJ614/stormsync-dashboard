/**
 * SSWX News (Phase 7 / U-25) — backed by `public.news_posts` (RLS: public read,
 * admin write). Replaces the browser-local newsStore so posts persist for every
 * member on every device. Bodies support lightweight Markdown (see `markdown.ts`).
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  videoUrl?: string;
  embedHtml?: string;
  author: string;
  createdAt: string;
}

interface Row {
  id: string; title: string; body: string;
  image_url: string | null; video_url: string | null; embed_html: string | null;
  author: string; created_at: string;
}
const toPost = (r: Row): NewsPost => ({
  id: r.id, title: r.title, body: r.body,
  imageUrl: r.image_url ?? undefined, videoUrl: r.video_url ?? undefined, embedHtml: r.embed_html ?? undefined,
  author: r.author, createdAt: r.created_at,
});

export async function listNews(): Promise<NewsPost[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("news_posts").select("*").order("created_at", { ascending: false });
  if (error) { logger.error("listNews failed", { scope: "news", error }); throw error; }
  return (data ?? []).map((r) => toPost(r as Row));
}

export async function createNews(p: { title: string; body: string; imageUrl?: string; videoUrl?: string; embedHtml?: string; author: string }): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("news_posts").insert({
    title: p.title, body: p.body,
    image_url: p.imageUrl || null, video_url: p.videoUrl || null, embed_html: p.embedHtml || null,
    author: p.author,
  });
  if (error) { logger.error("createNews failed", { scope: "news", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function deleteNews(id: string): Promise<void> {
  const { error } = await supabase.from("news_posts").delete().eq("id", id);
  if (error) logger.error("deleteNews failed", { scope: "news", error });
}
