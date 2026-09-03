-- StormSync VIP — the menu is the member's choice.
--
-- There are fifteen of these and they are wildly different objects: a radar
-- scope, a comic page, a neon street, a black hole. Which one is "right" is not
-- a question with an answer, and picking one for everybody means fourteen
-- people get a menu somebody else liked.
--
-- So the admin setting becomes the DEFAULT rather than the decree. A member who
-- has never chosen follows it — including if it changes later — and a member
-- who has chosen keeps theirs. That is what `null` means here, and it is why
-- the column is nullable rather than defaulted: "no preference" and "happens to
-- match the default" are different states, and only the first should follow a
-- change.
alter table public.profiles add column if not exists menu_style text;

comment on column public.profiles.menu_style is
  'The menu this member picked. Null means follow the admin default.';

-- Members set their own, and only their own. `protect_profile_columns` guards
-- the fields that decide what somebody has paid for; this is not one of them,
-- so the existing "update own profile" policy is enough — but the value still
-- has to be one the app knows how to render.
alter table public.profiles drop constraint if exists profiles_menu_style_check;
alter table public.profiles add constraint profiles_menu_style_check
  check (menu_style is null or menu_style in (
    'rail', 'push', 'strata', 'solari', 'sweep', 'singularity', 'aurora',
    'origami', 'geometric', 'neon', 'tessellate', 'kinetic', 'elevator',
    'comic', 'apex'));
