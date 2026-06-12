/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (publishable, safe for the browser). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable/anon key (safe for the browser, protected by RLS). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Legacy Render backend base URL. Removed in Phase 1 (Supabase migration). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
