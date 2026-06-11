# StormSync VIP — Supabase Backend

**Project:** `stormsync-vip` · **ref:** `djonpetxdjuwcbgftqmt` · region `us-east-2`
**URL:** https://djonpetxdjuwcbgftqmt.supabase.co

> This is the dedicated backend for the VIP Forecasts app. It is SEPARATE from
> `stormsync-app-center` (the live applications site) and other projects. Do not
> point this app at any other project.

## Migrations (applied via Supabase MCP `apply_migration`)

The canonical migration history lives in Supabase (`supabase_migrations.schema_migrations`).
Applied so far (Phase 1A):

1. **`phase1_core_schema`** — all core tables with RLS + indexes:
   `profiles`, `app_config` (versioned config), `badge_defs`, `signup_questions`,
   `news_posts`, `broadcasts` + `broadcast_seen`, `contact_submissions`,
   `game_guesses` + `game_winners`, `saved_locations`, `loyalty_events`,
   `referrals`, `push_subscriptions`, `weather_cache`.
   - Trigger `on_auth_user_created` auto-creates a `profiles` row on signup
     (admin email `JayMyers@StormSync.Media` is auto-promoted to Tier 4 admin).
   - Trigger `protect_profile_columns` stops non-admins escalating tier/admin/modules.
   - Seeds: `tier_modules` map, `emergency_pin` (default `0077`), `loyalty_rules`
     (game wins 35/25/15/10), 10 badge defs, 4 default signup questions.
2. **`phase1_security_hardening`** — moved `is_admin()` / `modules_for_tier()` into a
   non-exposed `private` schema (policies still resolve them by OID; RPC endpoints
   removed), locked trigger-only functions, restricted `check_emergency_pin` to members.

### Helper functions
- `private.is_admin()` — used by RLS policies; returns true for the row owner-admin or service role.
- `public.check_emergency_pin(text)` — members verify the emergency line PIN without ever reading it.

### Accepted advisor notices (intentional)
- `weather_cache` has RLS on with no policy → service-role-only by design.
- `contact_submissions` allows anonymous INSERT → public contact form by design.
- `check_emergency_pin` callable by authenticated → members verify the PIN by design.

## Edge Functions

### `weather` (`supabase/functions/weather/index.ts`)
Public proxy for NOAA/NWS/SPC data — replaces the retired Render backend.
`verify_jwt = false` (public data only; writes only to the service-role cache).
Routes: `/nws/points`, `/nws/alerts`, `/nws/forecast`, `/spc/storm-reports`,
`/spc/outlook-geojson`. Best-effort caching via `weather_cache`.

## Secrets to set (when reached)
- **Phase 2 (Storm Engine):** `ANTHROPIC_API_KEY` — set via Supabase Edge Function
  secrets. Never commit it.

## Frontend env (Vercel + local `.env`)
- `VITE_SUPABASE_URL=https://djonpetxdjuwcbgftqmt.supabase.co`
- `VITE_SUPABASE_ANON_KEY=sb_publishable_...` (publishable; see `.env.example`)
