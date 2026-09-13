# Deploying StormSync VIP

Written 13 September 2026. Four things in this project deploy separately, on
different triggers, and the failures that have cost the most time all came from
assuming one of them carried another. This is the order they actually work in.

---

## The four things, and what moves each one

| What | Deployed by | Trigger |
|---|---|---|
| The web app (`github-repo/`) | Vercel | a push to the branch Vercel is watching |
| Edge functions (`supabase/functions/`) | Supabase CLI | the **Deploy edge functions** workflow, or the CLI by hand |
| Database schema (`supabase/migrations/`) | you, in the SQL editor | never automatic |
| Model map frames | GitHub Actions | the **Render model maps** schedule, or a manual run |

Nothing here cascades. Merging a pull request does not deploy an edge function.
Deploying an edge function does not run a migration. Rendering maps does not
touch either.

---

## 1. The web app

`vip.sswx.space` is served by Vercel and rebuilds from a branch push. Confirmed
on 13 September: pushing the service-worker fix to
`claude/sswx-weather-app-redesign-lzbjzz` put `sswx-v7` on the live domain about
half an hour later with nothing else done.

So for the app there is no deploy step. Push, wait, hard-refresh.

**If a change does not appear**, it is almost always the service worker rather
than the deploy. The worker deliberately waits for a quiet moment before
handing over, so a tab you have been using keeps the old build. Close every tab
of the site and open it again, or check `caches` in DevTools → Application.

---

## 2. Edge functions

### The one-time setup, so this can be done from GitHub

1. **Put the workflow on `main`.** GitHub only shows *Run workflow* for
   workflows that exist on the **default branch**, and the REST API refuses to
   dispatch one that does not. `.github/workflows/deploy-edge-functions.yml`
   currently exists only on the feature branch, which is why it cannot be
   started from anywhere yet. Merging it to `main` registers it; after that it
   can be run **against any branch**, and it runs that branch's copy of the file.

2. **Add two repository secrets** — Settings → Secrets and variables → Actions:

   | Secret | Value |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | a personal access token from <https://supabase.com/dashboard/account/tokens> |
   | `SUPABASE_PROJECT_REF` | the project ref out of the dashboard URL |

   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set — the map
   renderer has been using them for weeks.)

### Deploying

Actions → **Deploy edge functions** → Run workflow → choose the branch and the
function (`chase-target`, `storm-engine`, `both`, or `all`). The last step reads
the live versions back from Supabase and prints them, because a deploy that
reports success while leaving the old code running is the exact failure this
workflow exists to stop.

### Never deploy these from the dashboard editor

`chase-target` is two files — `index.ts` and `terrain.ts` — and the dashboard's
function editor shows one. Saving there drops `terrain.ts`, or silently
redeploys whatever single-file source the editor still had. That is what
happened in September: the function was "deployed", and the code in production
had never heard of `action: backfill`, so the backfill cron fired every twenty
minutes and re-ran the current day.

### `supabase/config.toml` is not optional

`supabase functions deploy` reads JWT verification from that file and defaults
to **on** when the file is missing. Fifteen of these twenty-two functions run
with it **off** on purpose — they are woken by pg_cron, or called by Stripe's
webhook, or reached with an engine secret, and each checks authorisation itself
in code. A deploy from a checkout without `config.toml` turns every one of those
callers into a 401 while reporting success.

---

## 3. Database migrations

Nothing applies these for you. Open the SQL editor, paste the file, run it.
Apply them **in filename order**, and apply a migration **before** deploying a
function that depends on it.

---

## 4. Model map frames

`render-model-maps.yml` renders HRRR, GFS and HREF frames into Supabase storage
on a schedule, and can be run by hand for a model that cannot wait.

**Scheduled runs always use `main`'s copy of the workflow and of
`scripts/render_maps.py`.** This is the single most misleading thing in the
repository: the feature branch can carry 23 HRRR parameters, 17 GFS and 21 HREF,
and the nightly render will keep producing 8 and 6 and no HREF at all until
those files reach the default branch. A branch's version only runs when a
*manual* run is pointed at that branch.

Actions → **Render model maps** → Run workflow → pick the branch, pick the model
(`hrrr`, `gfs`, `href`, `both`), set the last forecast hour. A run costs about
seven minutes.

**Budget.** This repository is private, so Actions gives 2,000 free minutes a
month. The schedule already spends roughly 840 of them. Manual runs come out of
the same allowance, so they are for "I need this model now", not for topping up.

---

## Order of operations for a release

1. Merge the app branch, and let Vercel rebuild.
2. Run any new migration in the SQL editor.
3. Deploy the edge functions the migration serves.
4. Force a model render only if a parameter list or renderer changed and you do
   not want to wait for the next scheduled cycle.
5. Check the cron jobs are as you expect:

   ```sql
   select jobname, schedule, active from cron.job order by jobname;
   ```

   To turn one on or off, use the function — a direct `update cron.job` is
   rejected with *permission denied for table job*:

   ```sql
   select cron.alter_job(
     job_id := (select jobid from cron.job where jobname = 'chase-backfill-chunk'),
     active := true);
   ```
