-- Ask each member once whether they want push on this device.
--
-- Push has always been opt-in, and the only place to opt in was a card in the
-- profile that nobody visits unless they already know it is there. The result is
-- an alerting product where most members are not reachable — which is the one
-- thing it cannot afford to be.
--
-- So every member is asked, once, with a real "no" that is honoured for ever.
-- The answer lives on `notification_prefs` rather than on the device, because
-- "have we asked this person" is a fact about the person: asking again on their
-- laptop after they said no on their phone would be asking twice, and a prompt
-- somebody has already declined is nagging.
--
-- Deliberately NOT stored in localStorage. A prompt whose memory is per-browser
-- reappears in a private window, on a new laptop, and after clearing site data,
-- and "one-time" has to survive all three or it is not one-time.

alter table public.notification_prefs
  add column if not exists push_prompt_answer text
    check (push_prompt_answer in ('yes', 'no')),
  add column if not exists push_prompt_at timestamptz;

comment on column public.notification_prefs.push_prompt_answer is
  'What the member said the one time we asked about push. Null means not asked yet.';

/**
 * Record the answer, creating the prefs row if this member has none yet.
 *
 * A member with no `notification_prefs` row is the common case — the row is
 * written the first time they change a preference — so an UPDATE alone would
 * silently record nothing and the prompt would return on the next page load.
 * This upserts, and touches nothing else on the row.
 */
create or replace function public.record_push_prompt(p_answer text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  if p_answer not in ('yes', 'no') then
    raise exception 'answer must be yes or no' using errcode = '22023';
  end if;

  insert into public.notification_prefs (user_id, push_prompt_answer, push_prompt_at)
  values (uid, p_answer, now())
  on conflict (user_id) do update
    set push_prompt_answer = excluded.push_prompt_answer,
        push_prompt_at     = excluded.push_prompt_at;

  return true;
end;
$$;

revoke execute on function public.record_push_prompt(text) from public, anon;
grant execute on function public.record_push_prompt(text) to authenticated;

/**
 * Whether this member still needs asking.
 *
 * A function rather than a plain select so the client asks one question and gets
 * one answer, and so "asked" can later mean something more than a single column
 * without every caller changing.
 */
create or replace function public.needs_push_prompt()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and not exists (
       select 1 from public.notification_prefs p
        where p.user_id = auth.uid() and p.push_prompt_answer is not null
     );
$$;

revoke execute on function public.needs_push_prompt() from public, anon;
grant execute on function public.needs_push_prompt() to authenticated;
