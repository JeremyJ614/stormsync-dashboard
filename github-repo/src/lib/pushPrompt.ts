import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

/**
 * Whether this member has ever been asked about push notifications.
 *
 * Server-side, not localStorage. A prompt whose memory lives in the browser
 * comes back in a private window, on a new laptop and after clearing site data,
 * and "we asked you once" has to survive all three or it is not once.
 */
export async function needsPushPrompt(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc("needs_push_prompt");
  if (error) {
    // Never nag on an error: an unanswerable question is worse than a missed one.
    logger.error("needs_push_prompt failed", { scope: "push", error });
    return false;
  }
  return data === true;
}

/** Record the answer. 'no' is final — nothing asks again. */
export async function recordPushPrompt(answer: "yes" | "no"): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc("record_push_prompt", { p_answer: answer });
  if (error) { logger.error("record_push_prompt failed", { scope: "push", error }); return false; }
  return data === true;
}
