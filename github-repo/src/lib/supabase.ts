import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

// Supabase project: stormsync-vip (ref djonpetxdjuwcbgftqmt).
// Values come from env only (see .env.example). The publishable/anon key is safe for
// the browser — access is governed by Row Level Security — but we never hardcode it.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Whether the client is configured. Modules can check this to show a clear status
// instead of failing on a cryptic network error (no dead spinners — see ModuleStatus).
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  logger.warn(
    "Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    { scope: "supabase" },
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
