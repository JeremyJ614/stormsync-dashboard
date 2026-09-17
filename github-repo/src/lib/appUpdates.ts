/**
 * The App Updates feed.
 *
 * Everything that happened around the app lately, in one stream: badges people
 * earned, releases that went out, who took the Forecast Game, who got the
 * trivia right, and who just joined or moved up a tier.
 *
 * All of it is derived from tables that already existed for other reasons, so
 * nothing here needs a separate write path and nothing can drift out of sync
 * with the thing it is reporting.
 *
 * A note on the writing. The copy in this feed is kept plain on purpose and
 * avoids the long dash that AI writing leans on. Short sentences, ordinary
 * words, the way a person types when they are telling you what happened.
 */
import { supabase } from "./supabase";

export type UpdateKind = "badge" | "release" | "winner" | "trivia" | "member" | "upgrade";

export interface UpdateItem {
  id: string;
  kind: UpdateKind;
  at: string;
  /** One line. Written like a person wrote it. */
  text: string;
  /** Optional second line with the detail. */
  detail?: string;
  who?: string;
}

export const KIND_LABEL: Record<UpdateKind, string> = {
  badge: "Badge earned",
  release: "Update",
  winner: "Forecast Game",
  trivia: "Daily Trivia",
  member: "New member",
  upgrade: "Upgrade",
};

export const KIND_COLOR: Record<UpdateKind, string> = {
  badge: "#d9b775",
  release: "#ccccff",
  winner: "#e2373c",
  trivia: "#9ed94f",
  member: "#5fd9a8",
  upgrade: "#c084fc",
};

interface FeedRow {
  id: string; kind: string; at: string;
  who: string | null; text: string; detail: string | null;
}

/**
 * One round trip, assembled by the database.
 *
 * Built client-side first, and that was wrong: `profiles` is readable only by
 * its owner and by admins, so the client could not resolve anybody's name and
 * every line came back "Someone earned a badge". Rather than opening profiles
 * up, `app_updates_feed` does the join server-side and returns first names
 * only, for rows that are already public knowledge inside the app. See the
 * migration for what is and is not disclosed.
 */
export async function fetchAppUpdates(limit = 40): Promise<UpdateItem[]> {
  const { data, error } = await supabase.rpc("app_updates_feed", { p_days: 45, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as FeedRow[]).map((r) => ({
    id: r.id,
    kind: (r.kind as UpdateKind),
    at: r.at,
    who: r.who ?? undefined,
    text: r.text,
    detail: r.detail ?? undefined,
  }));
}

/** Groups into Today / Yesterday / This week / Earlier. */
export function groupByWhen(items: UpdateItem[]): { label: string; items: UpdateItem[] }[] {
  const now = Date.now();
  const day = 24 * 3600_000;
  const buckets: Record<string, UpdateItem[]> = {};
  const order = ["Today", "Yesterday", "This week", "Earlier"];

  for (const it of items) {
    const age = now - new Date(it.at).getTime();
    const key = age < day ? "Today" : age < 2 * day ? "Yesterday" : age < 8 * day ? "This week" : "Earlier";
    (buckets[key] ??= []).push(it);
  }
  return order.filter((k) => buckets[k]?.length).map((k) => ({ label: k, items: buckets[k] }));
}

/** Ask the database to award anything the member has newly qualified for. */
export async function evaluateBadges(): Promise<{ badgeId: string; label: string }[]> {
  const { data, error } = await supabase.rpc("evaluate_badges");
  if (error) return [];
  return ((data ?? []) as { badge_id: string; label: string }[])
    .map((r) => ({ badgeId: r.badge_id, label: r.label }));
}
