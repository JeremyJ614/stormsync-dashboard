-- The admin-editable map palette, seeded empty and PUBLIC.
--
-- `app_config` only lets members read rows flagged `is_public`. Without the
-- flag an override would be visible to admins and invisible to everybody else,
-- so the person choosing the colours would be the only person who ever saw
-- them — the worst possible failure for a setting whose entire job is what the
-- map looks like to members.
--
-- Seeded with no overrides at all: an empty object means "every swatch is the
-- app's default", which is what a fresh install should be.
insert into public.app_config (key, value, is_public)
values ('map_palettes', jsonb_build_object('colors', '{}'::jsonb), true)
on conflict (key) do update set is_public = true;
