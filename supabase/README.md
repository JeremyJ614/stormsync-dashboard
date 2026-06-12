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

3. **`phase1b_signup_tier_lockdown`** — D-01 fix: `handle_new_user` no longer reads
   `tier` from client metadata (always Tier 1; admin email exception). The `tier`
   signup question row was deleted (tiers are admin-assigned).
4. **`phase1b_admin_set_user_tier_rpc`** — `public.admin_set_user_tier(uid, new_tier)`:
   admin-guarded; sets the tier AND refreshes `enabled_modules` to the tier's defaults.
   Used by the admin panel tier dropdown and the `admin-users` create flow.
5. **`phase1b_admin_delete_badge_rpc`** — `public.admin_delete_badge(badge_id)`:
   admin-guarded; deletes the `badge_defs` row and strips the id from every profile's
   `badges` array atomically (no dangling ids).

### Helper functions
- `private.is_admin()` — used by RLS policies; returns true for the row owner-admin or service role.
- `public.check_emergency_pin(text)` — members verify the emergency line PIN without ever reading it.
- `public.admin_set_user_tier(uuid, int)` / `public.admin_delete_badge(text)` — admin-only RPCs (above).

### Accepted advisor notices (intentional)
- `weather_cache` has RLS on with no policy → service-role-only by design.
- `contact_submissions` allows anonymous INSERT → public contact form by design.
- `check_emergency_pin`, `admin_set_user_tier`, `admin_delete_badge` callable by
  authenticated → all internally guarded (`is_admin()` for the admin RPCs); verified
  non-admin calls fail with "admin only".
- Leaked-password protection disabled → conflicts with the PIN-derived password scheme.

## Edge Functions

### `weather` (`supabase/functions/weather/index.ts`)
Public proxy for NOAA/NWS/SPC data — replaces the retired Render backend.
`verify_jwt = false` (public data only; writes only to the service-role cache).
Routes: `/nws/points`, `/nws/alerts`, `/nws/forecast`, `/spc/storm-reports`,
`/spc/outlook-geojson`. Best-effort caching via `weather_cache`.

### `admin-users` (`supabase/functions/admin-users/index.ts`)
Admin-only, **privileged** auth operations that need the service role (Phase 1B).
`verify_jwt = true`, and the body additionally re-checks the caller is an admin
(`profiles.is_admin`). POST `{ action, ... }`:
- `create` — `auth.admin.createUser` (email pre-confirmed); profile lands Tier 1 via the
  trigger, then the requested tier is applied with `admin_set_user_tier` + admin-only fields.
- `delete` — `auth.admin.deleteUser` (profile cascades; the seed admin is protected).
- `set-pin` — `auth.admin.updateUserById` password reset.

Non-privileged profile edits (tier/modules/badges/referrals) are done from the client
directly under RLS and do **not** go through this function. Members sign in with a
4-digit PIN expanded to the Supabase password by `pinToPassword` (`pin_<PIN>_sswx`),
which must stay identical between `src/hooks/useAuth.ts` and this function.

## Seed admin
`JayMyers@StormSync.Media` is seeded directly in `auth.users` (PIN `1337`). Auth users
inserted via raw SQL must set GoTrue's token columns (`confirmation_token`,
`recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) to `''`,
not `NULL`, or sign-in fails with `Database error querying schema` (see Fix Log F-05).

## Secrets to set (when reached)
- **Phase 2 (Storm Engine):** `ANTHROPIC_API_KEY` — set via Supabase Edge Function
  secrets. Never commit it.

## Frontend env (Vercel + local `.env`)
- `VITE_SUPABASE_URL=https://djonpetxdjuwcbgftqmt.supabase.co`
- `VITE_SUPABASE_ANON_KEY=sb_publishable_...` (publishable; see `.env.example`)
