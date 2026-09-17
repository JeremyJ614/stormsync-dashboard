-- StormSync VIP — the run logs could not write.
--
-- `chase_runs` and `storm_engine_runs` both take a `bigserial` id, and neither
-- sequence was usable by `service_role`. The tables themselves granted INSERT
-- perfectly well, so the failure came one layer down and read as
-- "permission denied for sequence chase_runs_id_seq" — which nobody saw,
-- because both edge functions fire the insert and discard the result.
--
-- The effect was not a missing log. It was a missing ALARM. The chase engine
-- writes its outlook to one table and its run history to another; when the run
-- history stopped accepting rows, a day the engine never ran looked exactly
-- like a day it ran fine, and the only symptom was the outlook page quietly
-- showing the previous day's forecast. That is how 2026-09-02 went unnoticed.
--
-- Timing points at the cause: this project was created on 2026-09-02, the last
-- run row is from 2026-09-01, and both affected sequences are the only two in
-- `public`. The restore brought the tables and their grants across and left the
-- sequences behind.
--
-- Granted explicitly rather than relying on the default, and DEFAULT PRIVILEGES
-- set as well so the next table with a serial key does not repeat this.
grant usage, select on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to postgres;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- Verified separately rather than in a DO block here. The obvious assertion —
-- walk `pg_class` for relkind 'S' and test each — throws on this database:
-- Vault installs `decrypted_secrets`, which `pg_class` reports in a way that
-- makes `has_sequence_privilege` refuse it ("is not a sequence"), and a raise
-- inside the migration rolls the grants back with it. `information_schema` is
-- the safe view to ask.
select c.sequence_name,
       has_sequence_privilege('service_role',
         format('%I.%I', c.sequence_schema, c.sequence_name), 'USAGE') as service_role_usage
from information_schema.sequences c
where c.sequence_schema = 'public'
order by 1;
