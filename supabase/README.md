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
6. **`phase2_storm_engine_schema`** (Phase 2 / L5) — `daily_brief` (one nightly row per
   `brief_date`: status/model/headline/summary/`content` jsonb/`source_data` jsonb) +
   `storm_engine_runs` (run log). RLS: members (`authenticated`) read `daily_brief`;
   **no INSERT/UPDATE policy** — only the service role (the engine) writes. Run log is
   admin-read.
7. **`phase2_storm_engine_cron_secret`** — seeds `app_config.storm_engine_secret`
   (private) shared between the cron job and the function.
8. **`phase2_storm_engine_cron`** — enables `pg_cron` + `pg_net`; schedules
   `storm-engine-nightly` at `0 11 * * *` (≈6 AM Central) to POST the function with the
   secret header (read from `app_config` at run time).

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

### `storm-engine` (`supabase/functions/storm-engine/index.ts`)
The SSWX Storm Engine (Phase 2 / L5). `verify_jwt = false`; authorized internally by
the `x-engine-secret` header (cron path, matched against `app_config.storm_engine_secret`)
**or** an admin Bearer JWT (manual path). Ingests SPC Day 1-3 outlooks + storm-report
counts, builds a deterministic risk overview, then calls an AI provider (structured-JSON
output) to synthesize the brief, and upserts `daily_brief`. POST body `{ "dryRun": true }`
returns the ingested data without writing (and reports `ai_key_configured` / `ai_provider`).
**Two providers, checked in order:** `GEMINI_API_KEY` (Google Gemini Flash, **free tier**,
`GEMINI_MODEL = gemini-2.5-flash`) first, else `ANTHROPIC_API_KEY` (Claude,
`ANTHROPIC_MODEL = claude-opus-4-8`, adaptive thinking) as a paid fallback.
**No-key mode:** without either key it writes the deterministic SPC overview
(status `skipped`) so the UI is never dead. Provider-agnostic — swap the `*_MODEL` consts.

## Secrets to set (when reached)
- **Phase 2 (Storm Engine):** set **one** AI provider key as a Supabase Edge Function
  secret. This is the **only** remaining blocker for the AI brief — schema, ingest, cron,
  and the Daily Briefing consumer are built and verified; the engine runs in deterministic
  no-key mode until a key is set.
  - **Free (recommended):** `GEMINI_API_KEY` — create one at https://aistudio.google.com/apikey
    (no credit card). `npx supabase secrets set GEMINI_API_KEY=... --project-ref djonpetxdjuwcbgftqmt`.
  - **Paid fallback:** `ANTHROPIC_API_KEY` — `npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref djonpetxdjuwcbgftqmt`.
  - Set via the CLI or the Supabase dashboard (Edge Functions → Secrets). Never commit a key.

### `relay` (`supabase/functions/relay/index.ts`)
Emergency Storm Contact relay (U-23). `verify_jwt = false`; authorized by the 4-digit
emergency PIN, checked server-side against `app_config.emergency_pin`. Stores the
submission in `contact_submissions` and relays it via **Resend** to the admin emails +
carrier email-to-SMS gateways in `app_config.emergency_recipients` (admin-editable in the
admin Settings tab). **Secrets:** `RESEND_API_KEY` (https://resend.com free tier — required
to actually send) and optional `RELAY_FROM` (verified sender, e.g.
`"StormSync Alerts <alerts@yourdomain>"`; defaults to Resend's shared test sender). Without
the key, messages are still stored and the caller is told the live relay isn't configured.

## Frontend env (Vercel + local `.env`)
- `VITE_SUPABASE_URL=https://djonpetxdjuwcbgftqmt.supabase.co`
- `VITE_SUPABASE_ANON_KEY=sb_publishable_...` (publishable; see `.env.example`)
