# StormSync VIP — what changed

Everything done in this engagement, 12–13 September 2026. Twenty-one commits on
`claude/sswx-weather-app-redesign-lzbjzz`.

---

## Modules redesigned

**Daily Brief.** Was a row of pills over seven identical cards and four Recharts
panels in library defaults. Now a day is picked from a ribbon that plots the
whole week on one shared temperature scale, so the shape of the week reads
before any number does. The four chart tabs became the other half of a forecast
— SPC, WPC and CPC national outlooks — because they were re-plotting the series
the hero had already stated. Fixed underneath: the charts used to ignore the
selection and always show "the next 48 hours"; choosing Thursday now shows
Thursday.

**Mosquito Index.** The blurry canvas gauge became a clock — the coming 24 hours
drawn at their own clock angles, each spoke as long as that hour scores. The
dawn and dusk humps are the point of the index and were buried in a 48-hour bar
chart. The score also shows its four contributing terms instead of asserting a
number.

**Live Radar & Satellite.** Was a sandwich: tabs above the map, sliders below,
map squeezed into the leftover height. The controls are now one glass console
floating on the map, foldable, docking to the bottom on a phone. Later made less
intrusive still: it opens folded on anything narrower than 640px and is capped at
42% of the viewport height, because it was covering the screen on arrival.

**Model Runs.** Rebuilt with playback, and the plates were re-cut — the renderer
was throwing away a third of every image on margins and a colourbar, so the map
is now 1280×760 of actual map at the CONUS extent.

**Severe Weather History.** The counts anybody opens it for lived only inside the
downloadable poster, three screens down. They now lead at display size with a
composition bar showing what they are made of. The stat band was then rebuilt
again after feedback that it looked "cartoonish and uneven": three boxes in a
two-column grid is two boxes and an orphan on a phone, and the numbers were set
in saturated warning colours that belong on a map and nowhere else.

**Loyalty Dashboard, FAQ, Weather Patterns, Admin Panel, Splash screen.** All
brought onto the shared royal system. The admin panel's twenty-two chips in four
wrapped rows became a standing rail with a travelling marker plus a Cmd/Ctrl-K
command palette, and it now lands on an overview showing everything at once
rather than on a single section. The splash plate — a purple radar sweep in a
palette the app no longer uses — became an engraved guilloché rosette computed
from arithmetic rather than shipped as an image.

**Storm Chasing.** Day rollover moved to 04:25 UTC, then a third run added at
00:30 UTC (below). Terrain scoring rewritten. Historical backfill added.

**Daily Trivia.** Two questions a day with one attempt each and real points on
the line, presented as a form. Now the day's standing leads as a scoreboard,
answering is physical — the row presses, the medallion fills, one champagne pass
runs across the answer that was right — and the wrong pick dims rather than
being shouted at in a red rectangle.

**Daylight Tracker.** Four tiles carrying emoji, a grid of twelve cards setting
sunrise at nine pixels, and the only real drawing buried in a map popup. The
subject is a shape, so the shape leads: a full twenty-four-hour arc with night
shaded at both ends, and the twelve months on one baseline as a ribbon that is
also the month picker.

**Contact.** The vault and three-channel idea were right; the page was still
wearing the pre-royal theme underneath. Royal glass fields, a visible focus
ring, a narrower measure, and a send button that is no longer the least visible
thing on a page whose whole purpose is that one press.

**Help & FAQ.** Nineteen identical cards became one ruled document with champagne
numerals, and the category rail now reports per-category match counts while you
search instead of showing unchanged totals.

---

## New data and capability

**MRMS overlays.** Reflectivity at Lowest Altitude plus seven QPE products
(1/3/6/12/24/48/72-hour) from NOAA's own service, with NOAA's published colour
ramps. MESH, hail probability, hail swaths and rotation tracks were *not* added:
no public tile or WMS service carries them, and NSSL's own server serves a
certificate that will not verify. Absent rather than approximated.

**Model parameters, every one verified against a live index.** HRRR 8 → 23. GFS
12 → 17. HREF added as a third model with 21 neighbourhood-probability products
at exactly the requested thresholds. Nothing was added on the strength of a
documentation page. Three fields are built from more than one record (shear and
storm motion from their u/v pairs; theta-E derived by Bolton 1980, because HRRR
publishes *potential* temperature, which is a different quantity).

**National outlooks in the Daily Brief.** SPC thunderstorm and dry-thunderstorm
outlooks, WPC QPF and HeatRisk, CPC 6-10/8-14 day, monthly and seasonal
temperature and precipitation, rapid-onset drought, foliage. Drawn natively on
the app's own Albers canvas, so they pan, zoom and carry real legends.

**Chase terrain scoring.** Was 100/100 almost everywhere — it was the standard
deviation of five elevations. Rewritten against four measurable things from
public keyless US data: canopy and land cover, ruggedness and skyline angle from
a 7×7 elevation grid, and road length plus how much of it runs on the section
grid. That last one is the surprise: road *density* does not separate the Ozarks
from Kansas at all, but road *alignment* separates them completely.

**Chase historical backfill.** `chase-target` takes `{"action":"backfill"}` and
rebuilds missing days from SPC's outlook archive and Open-Meteo's historical
forecast archive, through the same code path as a live morning. Restartable,
never regenerates a finished day.

**Weather Patterns national summary.** A deterministic KEY CONCERNS engine — no
model involved — that states the day's real concerns with sources and coverage.

**A 00:30 UTC chase run.** Thirty minutes after the 00Z balloons, so tomorrow's
targets exist before bed. Added alongside the 04:25Z and 13:35Z runs rather than
replacing them: at 00:30Z the 00Z global models are still running, so all three
write the same row and the answer sharpens overnight.

---

## Bugs fixed

**The service worker was poisoning its own cache.** This is the one that made
"all the maps still won't load" and "Storm Chasing shows an error page" true at
the same time as "the file is correct on the server". A missing file does not
404 on this host — the single-page rewrite answers it with index.html, 200 OK,
`text/html`. The worker checked only `res.ok`, so it stored that HTML *under the
asset's own URL*, and a cache entry keyed by URL does not care that its body is
the wrong media type. It could not heal either: the revalidation ran outside
`event.waitUntil`, so the browser was free to kill the worker before the good
response was written back. Both fixed, plus a page-side repair that deletes
entries whose media type cannot answer their own URL.

**MapLibre's worker was never shipped.** The v5 → v6 upgrade was correct except
that v6 builds its worker's filename from a variable at runtime, so Rollup never
emitted it. Every map mounted, painted its background and waited forever.

**The SPC static maps were in the wrong projection.** `project()` fitted a
six-parameter affine to nine hand-recorded city pixels — but Albers is conic, it
curves, and no affine can represent it. Measured against the state outlines
actually shipping, Los Angeles was out by 120px. Replaced with the real
projection (d3 `geoAlbersUsa`, insets included), verified against all 51
pre-projected states.

**Weather Patterns statistics stopped updating** because the ledger was written
*after* a language model was asked to narrate it. Three consecutive Gemini 503s
abandoned the whole write. The statistics are now written first and the prose
applied afterwards, with a 70-second budget on every AI pass.

**Severe Weather History: "Cannot access 'L' before initialization".** `const
days` was declared one line *below* the `.find()` callback that reads it. Worth
knowing how it got through: `tsc` passes on this, before and after, because
TypeScript cannot know a `.find` callback runs synchronously. Only running the
page objects.

**HREF had never rendered once.** The cycle probe HEADs forecast hour zero, and
HREF's probability files have no F00 — a probability over a one-hour window
cannot exist at initialisation. Every candidate cycle 404'd and the job exited
with "no available href cycle found".

**A throttled weather API looked like a day with no weather.** Open-Meteo caps
the UTC day, not just the minute, and the engine treated every non-OK response
as "this chunk had no data" — writing a row with `day_score: 0` and no targets
in eight seconds. Sixty of them. Now a 429 is told apart from the daily cap, the
backfill stops rather than burning the remaining dates, and a day where nothing
scored throws instead of being recorded.

**A busy storage pool threw away finished renders.** A GFS run died on
`absv500/F033.png` with `too_many_connections` after thirty-three forecast hours
of work, burning seven Actions minutes to produce nothing. Uploads and the
manifest write now retry with backoff on the statuses that mean "busy".

**Chase targets could be in Canada.** Candidates are clipped to a CONUS bounding
*box*, and a box around the lower 48 necessarily contains southern Ontario.
Reconstructing 7 March put "Southwestern Ontario" on the board as the day's
second-best target on 40 J/kg of CAPE. The geocoder already knew — the Census
service answers for US soil only — so naming moved ahead of the pick.

**The terrain cache had never been read.** Its migration revoked anon and
authenticated and granted `service_role` nothing, so every read returned 42501 —
swallowed by design, because a cache failure is meant to be survivable. It
failed silently from the day it shipped.

**Deploying could have locked the cron out of every function.** `supabase
functions deploy` reads JWT verification from `config.toml` and defaults to *on*
when the file is missing. There was no `config.toml`, and fifteen of the
twenty-two functions run with it off on purpose.

**Smaller ones.** CPC precipitation was drawing through the temperature colour
ramp; SPC probabilities were printing as "0.15%" because the bands are labelled
as fractions; CPC's Alaska rings were projecting off-canvas because the
projection picked a lobe per point rather than per ring; the splash screen's
background animation looped forever instead of settling; Daily Trivia lost the
answer on reload, so getting one wrong told you nothing; the Daylight arc was
drawn from UTC minutes while its labels said local time, putting Denver's
sunrise at half past twelve in the afternoon.

---

## Deployment and operations

- **A workflow to deploy the edge functions from the repository**, because
  `chase-target` is two files and the Supabase dashboard editor shows one —
  which is how a "deployed" function ended up running code that had never heard
  of the backfill.
- **`docs/DEPLOYING.md`** — the four things that ship separately here and the two
  traps that are invisible from the code: a workflow must exist on the *default*
  branch before GitHub will dispatch it at all, and a *scheduled* run always uses
  the default branch's copy of the script.
- **`supabase/config.toml`**, holding each function's JWT setting, read back from
  what is actually running.
- **Both edge functions deployed** — `chase-target` and `storm-engine` are live on
  the new code, verified by downloading the deployed source back.
- **HREF, HRRR and GFS renders forced** from the branch, so the new parameter
  lists are in the database rather than waiting on the nightly schedule.
- **Cron adjusted**: the backfill dropped from every twenty minutes to every two
  hours (seventy-two chunks a day against an API whose free tier is spent by
  about a hundred reconstructed days was mostly a day spent failing), and the
  00:30Z chase run added.

---

## Still outstanding

- **The chase season is partly reconstructed.** 15 June → today is filled with
  real data. The rest back to 7 March fills itself automatically as the
  two-hourly cron works through it — the limit is Open-Meteo's daily quota, not
  the code.
- **The day score has no dynamic range.** Across the days reconstructed so far,
  every score lands between 6.8 and 9.2, median 8.0. The Yearly tab cannot rank
  anything if every day is an eight. Worth recalibrating once March and April
  are in and the real spread is visible.
- **One SQL statement** is still needed to make the terrain cache work:
  `grant select, insert, update, delete on table public.chase_terrain_cache to service_role;`
