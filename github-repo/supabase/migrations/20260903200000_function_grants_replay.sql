-- StormSync VIP — the function grants the migrations already declare, re-asserted.
--
-- 51 of the 65 functions these migrations explicitly REVOKE from `anon` were,
-- in the live database, still callable by `anon`. Among them: `prune_model_runs`
-- (an unauthenticated caller could pass keep_runs = 0 and delete the model run
-- history), `redeem_coupon`, `record_push_ack` — which is what makes the
-- delivery confirmation in My Profile mean anything — `award_badges_for`,
-- `evaluate_badges` and `seal_due_leaderboards`. `check_emergency_pin` was
-- reachable too, turning the emergency vault into a PIN oracle anybody could
-- sit and guess at; the comment above its caller in `useAuth.ts` states plainly
-- that it is "granted to authenticated and not to anon", which is what the
-- migration that created it asked for and not what the database was doing.
--
-- No privilege escalation came of the admin_* ones — every single one gates on
-- `private.is_admin()` internally, which was checked function by function
-- rather than assumed — but the unauthenticated mutations above are real.
--
-- CAUSE. The same event as the missing sequence grants in
-- 20260903160000_sequence_grants.sql: this project was rebuilt on 2026-09-02
-- and the restore replayed function BODIES without the REVOKEs that followed
-- them. `create or replace function` hands EXECUTE to PUBLIC by default, and
-- `anon` inherits from PUBLIC, so every function came back open.
--
-- FIX. Not a new policy — a replay of the one already written down. Every
-- `grant`/`revoke ... on function` statement across all 54 migrations is
-- re-executed here in migration order, so the end state is exactly what
-- applying the migrations to an empty database would have produced. Nothing is
-- opened that was not already open by intent, and nothing is closed that the
-- app is documented to need.
--
-- Each statement runs in its own sub-block: a signature that has since been
-- dropped or changed is recorded and skipped rather than aborting the rest.
-- Catching inside a BEGIN/EXCEPTION rolls back only that sub-block, so the
-- statements around it stand — unlike a bare `raise`, which took the grants
-- down with it in the sequence migration.
create temp table if not exists acl_replay(stmt text, outcome text);

do $replay$
declare
  s text;
  n int := 0;
begin
  foreach s in array array[
    'revoke execute on function public.record_module_view(text) from public, anon',
    'grant execute on function public.record_module_view(text) to authenticated',
    'revoke execute on function public.admin_module_usage(integer) from public, anon',
    'grant execute on function public.admin_module_usage(integer) to authenticated',
    'revoke execute on function public.admin_usage_by_day(integer) from public, anon',
    'grant execute on function public.admin_usage_by_day(integer) to authenticated',
    'revoke execute on function public.admin_system_stats() from public, anon',
    'grant execute on function public.admin_system_stats() to authenticated',
    'revoke execute on function public.admin_cache_ages(integer) from public, anon',
    'grant execute on function public.admin_cache_ages(integer) to authenticated',
    'revoke execute on function public.evaluate_badges() from public, anon',
    'grant execute on function public.evaluate_badges() to authenticated',
    'revoke execute on function public.app_updates_feed(integer, integer) from public, anon',
    'grant execute on function public.app_updates_feed(integer, integer) to authenticated',
    'revoke execute on function public.chase_year_context(integer) from public, anon',
    'grant execute on function public.chase_year_context(integer) to authenticated, service_role',
    'revoke execute on function public.alert_levels_for(uuid) from public, anon',
    'grant execute on function public.alert_levels_for(uuid) to authenticated, service_role',
    'revoke execute on function public.my_alert_levels() from public, anon',
    'grant execute on function public.my_alert_levels() to authenticated',
    'revoke execute on function public.has_alert_level(uuid, integer) from public, anon',
    'grant execute on function public.has_alert_level(uuid, integer) to authenticated, service_role',
    'revoke execute on function public.my_emergency_pin() from public, anon',
    'grant execute on function public.my_emergency_pin() to authenticated',
    'revoke execute on function public.admin_alert_roster() from public, anon',
    'grant execute on function public.admin_alert_roster() to authenticated',
    'revoke execute on function public.admin_set_alert_level(uuid, integer, boolean, text) from public, anon',
    'grant execute on function public.admin_set_alert_level(uuid, integer, boolean, text) to authenticated',
    'revoke execute on function public.admin_alert_roster() from public, anon',
    'grant execute on function public.admin_alert_roster() to authenticated',
    'revoke execute on function public.request_alert_level(integer) from public, anon',
    'grant execute on function public.request_alert_level(integer) to authenticated',
    'revoke execute on function public.withdraw_alert_request(integer) from public, anon',
    'grant execute on function public.withdraw_alert_request(integer) to authenticated',
    'revoke execute on function public.admin_handle_alert_request(uuid, boolean, text) from public, anon',
    'grant execute on function public.admin_handle_alert_request(uuid, boolean, text) to authenticated',
    'revoke execute on function public.admin_alert_requests() from public, anon',
    'grant execute on function public.admin_alert_requests() to authenticated',
    'revoke execute on function public.my_alert_requests() from public, anon',
    'grant execute on function public.my_alert_requests() to authenticated',
    'revoke execute on function public.alert_levels_for(uuid) from authenticated',
    'revoke execute on function public.has_alert_level(uuid, integer) from authenticated',
    'revoke execute on function public.admin_alert_roster() from public, anon',
    'grant execute on function public.admin_alert_roster() to authenticated',
    'revoke execute on function public.admin_alert_requests() from public, anon',
    'grant execute on function public.admin_alert_requests() to authenticated',
    'revoke execute on function public.alert_levels_for(uuid) from public, anon, authenticated',
    'grant execute on function public.alert_levels_for(uuid) to service_role',
    'revoke execute on function public.admin_module_viewers(text, integer) from public, anon',
    'grant execute on function public.admin_module_viewers(text, integer) to authenticated',
    'revoke execute on function public.admin_member_modules(uuid, integer) from public, anon',
    'grant execute on function public.admin_member_modules(uuid, integer) to authenticated',
    'revoke execute on function public.admin_lock_guess(uuid, text, date, double precision, double precision, text, double precision, double precision, text) from public, anon',
    'grant execute on function public.admin_lock_guess(uuid, text, date, double precision, double precision, text, double precision, double precision, text) to authenticated',
    'revoke execute on function public.admin_submit_trivia(uuid, text, uuid, integer) from public, anon',
    'grant execute on function public.admin_submit_trivia(uuid, text, uuid, integer) to authenticated',
    'revoke execute on function public.admin_trivia_answers(uuid, uuid[]) from public, anon',
    'grant execute on function public.admin_trivia_answers(uuid, uuid[]) to authenticated',
    'revoke execute on function public.submit_trivia_answer(uuid, integer) from public, anon',
    'grant execute on function public.submit_trivia_answer(uuid, integer) to authenticated',
    'revoke execute on function public.admin_submit_trivia(uuid, text, uuid, integer) from public, anon',
    'grant execute on function public.admin_submit_trivia(uuid, text, uuid, integer) to authenticated',
    'revoke execute on function public.admin_trivia_questions(date, date) from public, anon',
    'grant execute on function public.admin_trivia_questions(date, date) to authenticated',
    'revoke execute on function public.award_badges_for(uuid, boolean) from public, anon, authenticated',
    'revoke execute on function public.evaluate_badges() from public, anon',
    'grant execute on function public.evaluate_badges() to authenticated',
    'revoke execute on function public.admin_backfill_badges() from public, anon',
    'grant execute on function public.admin_backfill_badges() to authenticated',
    'revoke execute on function public.my_referral_code() from public, anon',
    'grant execute on function public.my_referral_code() to authenticated',
    'revoke execute on function public.redeem_referral_code(text) from public, anon',
    'grant execute on function public.redeem_referral_code(text) to authenticated',
    'revoke execute on function public.mark_referral_converted(uuid) from public, anon, authenticated',
    'grant execute on function public.mark_referral_converted(uuid) to service_role',
    'revoke execute on function public.my_referral_summary() from public, anon',
    'grant execute on function public.my_referral_summary() to authenticated',
    'revoke execute on function public.admin_referral_overview() from public, anon',
    'grant execute on function public.admin_referral_overview() to authenticated',
    'revoke execute on function public.admin_fulfil_referral(uuid, text) from public, anon',
    'grant execute on function public.admin_fulfil_referral(uuid, text) to authenticated',
    'revoke execute on function public.owner_events_pending(integer) from public, anon',
    'grant execute on function public.owner_events_pending(integer) to authenticated, service_role',
    'revoke all on function public.admin_sync_advanced_modules() from public, anon',
    'grant execute on function public.admin_sync_advanced_modules() to authenticated',
    'revoke all on function public.tier_module_defaults(integer) from public, anon',
    'grant execute on function public.tier_module_defaults(integer) to authenticated, service_role',
    'revoke all on function public.my_push_devices() from public, anon',
    'grant execute on function public.my_push_devices() to authenticated',
    'revoke all on function public.forget_push_device(uuid) from public, anon',
    'grant execute on function public.forget_push_device(uuid) to authenticated',
    'revoke all on function public.record_push_ack(text) from public, anon, authenticated',
    'grant execute on function public.record_push_ack(text) to service_role',
    'revoke all on function public.admin_bulk_set_tier(uuid[], integer, boolean) from public, anon',
    'grant execute on function public.admin_bulk_set_tier(uuid[], integer, boolean) to authenticated',
    'revoke all on function public.leaderboard_between(date, date) from public, anon',
    'grant execute on function public.leaderboard_between(date, date) to authenticated',
    'revoke all on function public.seal_due_leaderboards() from public, anon',
    'grant execute on function public.seal_due_leaderboards() to authenticated, service_role',
    'revoke all on function public.admin_set_leaderboard_winner(text, date, uuid, integer, text) from public, anon',
    'grant execute on function public.admin_set_leaderboard_winner(text, date, uuid, integer, text) to authenticated',
    'revoke all on function public.admin_clear_leaderboard_winner(text, date) from public, anon',
    'grant execute on function public.admin_clear_leaderboard_winner(text, date) to authenticated',
    'revoke all on function public.sync_subscription_tickets(date) from public, anon',
    'grant execute on function public.sync_subscription_tickets(date) to authenticated, service_role',
    'revoke all on function public.admin_run_raffle(text, uuid, date, text) from public, anon',
    'grant execute on function public.admin_run_raffle(text, uuid, date, text) to authenticated',
    'revoke all on function public.my_raffle_tickets() from public, anon',
    'grant execute on function public.my_raffle_tickets() to authenticated',
    'revoke all on function public.admin_raffle_overview() from public, anon',
    'grant execute on function public.admin_raffle_overview() to authenticated',
    'revoke all on function public.admin_grant_tickets(uuid[], text, integer, text, date) from public, anon',
    'grant execute on function public.admin_grant_tickets(uuid[], text, integer, text, date) to authenticated',
    'revoke all on function public.stale_model_map_objects(integer) from public, anon, authenticated',
    'revoke all on function public.prune_model_runs(integer) from public, anon, authenticated',
    'revoke all on function public.next_model_map_orphans(integer) from public, anon, authenticated',
    'revoke all on function public.mark_model_map_orphans_swept(text[]) from public, anon, authenticated',
    'revoke all on function public.register_model_map_orphans(text[]) from public, anon, authenticated',
    'revoke all on function private.mint_personal_coupon(text, numeric, integer, integer, text) from public, anon, authenticated',
    'revoke all on function public.apply_reward_effects(uuid, jsonb, text, text) from public, anon, authenticated',
    'grant execute on function public.apply_reward_effects(uuid, jsonb, text, text) to service_role',
    'revoke execute on function public.mark_referral_converted(uuid) from public, anon, authenticated',
    'grant execute on function public.mark_referral_converted(uuid) to service_role',
    'revoke execute on function public.redeem_referral_code(text) from public, anon',
    'grant execute on function public.redeem_referral_code(text) to authenticated',
    'grant execute on function public.pick_raffle_prize(text) to authenticated',
    'grant execute on function public.raffle_prize_odds(text) to authenticated',
    'revoke all on function public.admin_set_prize_weight(uuid, numeric) from public, anon',
    'grant execute on function public.admin_set_prize_weight(uuid, numeric) to authenticated',
    'revoke all on function public.admin_run_raffle(text, uuid, date, text) from public, anon',
    'grant execute on function public.admin_run_raffle(text, uuid, date, text) to authenticated',
    'revoke execute on function public.record_push_prompt(text) from public, anon',
    'grant execute on function public.record_push_prompt(text) to authenticated',
    'revoke execute on function public.needs_push_prompt() from public, anon',
    'grant execute on function public.needs_push_prompt() to authenticated',
    'revoke all on function public.prune_orphan_model_runs(int) from public',
    'revoke all on function public.prune_orphan_model_runs(int) from anon, authenticated',
    'grant execute on function public.prune_orphan_model_runs(int) to service_role',
    'revoke all on function public.prune_weather_cache(int, int) from public',
    'revoke all on function public.prune_weather_cache(int, int) from anon, authenticated',
    'revoke all on function public.prune_operational_logs(int, int, int) from public',
    'revoke all on function public.prune_operational_logs(int, int, int) from anon, authenticated',
    'grant execute on function public.prune_weather_cache(int, int) to service_role',
    'grant execute on function public.prune_operational_logs(int, int, int) to service_role',
    'revoke all on function private.engrave_name(uuid, text, text, uuid) from public',
    'revoke all on function private.engrave_name(uuid, text, text, uuid) from anon, authenticated',
    'revoke all on function private.apply_effect(uuid, jsonb, text, uuid) from public, anon, authenticated',
    'revoke all on function private.apply_effect_chain(uuid, jsonb, text, uuid) from public, anon, authenticated',
    'revoke all on function private.modules_missing(uuid) from public, anon, authenticated',
    'revoke all on function private.has_everything(uuid) from public, anon, authenticated',
    'revoke all on function private.months_a_member(uuid) from public, anon, authenticated',
    'revoke all on function private.grant_tickets(uuid, int, int, int, int, text) from public, anon, authenticated',
    'grant execute on function public.my_benefits() to authenticated',
    'grant execute on function public.points_leaders(int) to authenticated, anon',
    'grant execute on function public.claim_module_credit(uuid, text[]) to authenticated',
    'grant execute on function public.claim_points_steal(uuid) to authenticated',
    'grant execute on function public.claim_points_wipe(uuid) to authenticated',
    'revoke all on function public.admin_simulate_raffle(text, jsonb, int) from public, anon',
    'grant execute on function public.admin_simulate_raffle(text, jsonb, int) to authenticated',
    'grant execute on function public.raffle_catalogue() to authenticated, anon',
    'revoke all on function private.mint_prize_coupon(uuid, numeric, integer, text) from public, anon, authenticated',
    'revoke all on function private.apply_effect(uuid, jsonb, text, uuid) from public, anon, authenticated',
    'revoke execute on function public.alert_levels_for(uuid) from public, anon, authenticated',
    'revoke all on function public.admin_set_alert_override(uuid, integer) from public, anon',
    'grant execute on function public.admin_set_alert_override(uuid, integer) to authenticated',
    'revoke all on function public.admin_alert_overrides() from public, anon',
    'grant execute on function public.admin_alert_overrides() to authenticated'
  ]
  loop
    begin
      execute s;
      n := n + 1;
    exception when others then
      insert into acl_replay values (s, sqlerrm);
    end;
  end loop;
  insert into acl_replay values ('(applied)', n || ' of ' || 167 || ' statements');
end $replay$;

select stmt, outcome from acl_replay;
