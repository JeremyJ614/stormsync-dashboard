-- Whether a member has been through the intro guide.
--
-- On `profiles` rather than in localStorage on purpose: somebody who signs up on
-- their phone and then opens the app on a laptop has still seen the intro, and
-- being shown it again would read as the app forgetting them. It is also the
-- only way the "replay it" control in My Profile can be honest about state.
--
-- Deliberately NOT protected by protect_profile_columns: this is the member's
-- own preference about their own onboarding, not an entitlement, so they write
-- it themselves through the ordinary profile update path.
alter table public.profiles
  add column if not exists intro_seen_at timestamptz;

comment on column public.profiles.intro_seen_at is
  'When the member finished (or dismissed) the intro guide. Null means show it.';
