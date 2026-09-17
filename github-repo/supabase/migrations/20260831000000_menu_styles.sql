-- Which navigation menu members see, and which admins see.
--
-- This is an admin decision rather than a per-device preference: the menu is
-- part of how the product presents itself, so the owner picks it for everyone.
-- Two independent values so the panel can be previewed on one style while
-- members stay on another.
--
-- is_public is true because every signed-in member has to read it before the
-- app can draw its own navigation. It carries no secret — only which of five
-- presentations is in use.
insert into public.app_config (key, value, is_public)
values ('menu_styles', '{"customer":"spiral","admin":"push"}'::jsonb, true)
on conflict (key) do nothing;
