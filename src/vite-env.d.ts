/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (publishable, safe for the browser). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable/anon key (safe for the browser, protected by RLS). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
