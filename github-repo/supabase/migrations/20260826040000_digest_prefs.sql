-- Digest preferences: what goes in it, and when it arrives.
--
-- The daily digest already existed but was fixed on both counts: everybody got
-- the same sections at the same hour. These two columns make it the member's
-- own. `digest_hour` is their local hour, so the sender resolves it against
-- their own timezone rather than assuming Central.
alter table public.notification_prefs
  add column if not exists digest_hour integer not null default 6,
  add column if not exists digest_sections text[] not null default
    array['conditions','today','alerts','severe']::text[];

-- 0–23, so a bad write cannot make the digest un-sendable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notification_prefs_digest_hour_range'
  ) then
    alter table public.notification_prefs
      add constraint notification_prefs_digest_hour_range
      check (digest_hour between 0 and 23);
  end if;
end $$;

comment on column public.notification_prefs.digest_hour is
  'Local hour (0-23) the member wants the daily digest.';
comment on column public.notification_prefs.digest_sections is
  'Ordered section keys the member wants in their digest.';
