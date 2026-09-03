-- StormSync VIP — the wall was invisible to everybody.
--
-- `member_benefits` and `wall_names` were created with row-level security
-- enabled and sensible policies on both, and NO TABLE GRANTS. That combination
-- does not mean "locked down"; it means the policies never run. PostgREST asks
-- as `anon` or `authenticated`, Postgres checks the table privilege first,
-- finds none, and answers
--
--   42501: permission denied for table wall_names
--
-- before RLS is ever consulted. Every other table in `public` had grants —
-- these two were the only pair without, which is what a fresh `create table` in
-- a migration gets you when the grant line is forgotten: ownership stays with
-- `postgres` and nobody else can see the table at all.
--
-- The visible symptom was the home page wall rendering nothing, with names
-- sitting in the table. `member_benefits` looked fine only by luck: everything
-- that reads it today (`my_benefits`, the claim functions) is SECURITY DEFINER
-- and therefore runs as the owner, so the missing grant would not have bitten
-- until the first direct read.
--
-- Granted to match each table's policies, and no wider:
--
--   wall_names       the wall is a monument, meant to be read by anyone who
--                    loads the page, so SELECT goes to anon as well. Writes go
--                    to `authenticated` because the admin panel edits the wall
--                    through PostgREST; the "wall admin" policy is what makes
--                    them admin-only, and it can now actually do that job.
--
--   member_benefits  SELECT to `authenticated` only, which is what the
--                    "benefits own" policy expects (your own rows, or every
--                    row if you are an admin). No DML: nothing writes to this
--                    table except SECURITY DEFINER functions, and a benefit a
--                    member could edit from the browser would not be a benefit.
grant select on public.wall_names to anon;
grant select, insert, update, delete on public.wall_names to authenticated;
grant select, insert, update, delete on public.wall_names to service_role;

grant select on public.member_benefits to authenticated;
grant select, insert, update, delete on public.member_benefits to service_role;

-- Verified as a plain select rather than a DO block with a raise: a raise
-- inside a migration rolls back the very grants it is checking (learned the
-- hard way in 20260903160000_sequence_grants.sql).
select c.relname as table_name,
       has_table_privilege('anon',          'public.' || c.relname, 'SELECT') as anon_select,
       has_table_privilege('authenticated', 'public.' || c.relname, 'SELECT') as authed_select,
       has_table_privilege('service_role',  'public.' || c.relname, 'SELECT') as service_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('wall_names', 'member_benefits')
order by 1;
