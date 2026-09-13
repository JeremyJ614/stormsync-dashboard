# StormSync VIP — what changed

Everything done in this engagement, 12–13 September 2026. Thirty-six commits on
`claude/sswx-weather-app-redesign-lzbjzz`.

It is organised by what the work *was*, not by the order it happened in:
modules redesigned, new capability, bugs fixed, deployment, and what is still
outstanding at the end. The final three-phase round of work is called out
separately at the bottom, because that is the part most recently delivered and
the part most likely to be checked first.

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

**Personalized Dashboard.** Was a second forecast page — a conditions hero, a
stat grid, a wind compass, seven-day charts, an NWS office card, a widget-
arranging drawer — all of it one tap from the Daily Brief, which does that job
better. A dashboard's question is not "what is the weather"; the app has eight
answers to that. It is *where should I look today*, across everything the member
owns. It is now one tile per module, only the modules they have unlocked, and
**only the modules that can actually report something**: a tile earns its place
by measuring a number, and a module with nothing to say is absent rather than
reading "Open the module", which is a navigation menu wearing a dashboard's
clothes. Tiles are deliberately unequal — most sit quiet, the ones with a real
figure carry it at display size, the ones worth acting on light their rail — so
the page can be read without reading a word. Readings come from four shared
sources rather than forty separate requests.

**SSWXCon dial.** Was a 270° needle on a banded track, which is what a
speedometer looks like, and a needle sweeping a continuous track reads as a
*rate*. SSWXCon is not a rate; it is a level on a named scale with an activation
gate in it. The track is now sixty discrete segments — countable, the way an
aircraft instrument is read — with the gate drawn on it, and segments below the
gate are cold while segments above it burn. A 48 against a gate of 60 is a ring
three-quarters full and entirely cold, which is the correct feeling for it.

**Lightning.** The Live tab was showing a picture of clouds. The header read
"GOES-19 GLM Flash Extent Density" over a URL that resolved to the GeoColor
visible-and-infrared image, with a caption underneath explaining which pixels
were the flashes — of an image that contained none. The tabs are now
climatology-first, because that is what the module is for; live lightning is a
secondary tab and is now two real layers on the app's own map: GLM flash extent
density, and LightningCast v2, which gives the probability of a flash in the
next sixty minutes and is the part a strike map cannot do. The twelve-bar
monthly chart became a year drawn as a year — a season is cyclical, and a bar
chart cuts the ring at an arbitrary point and puts the two ends of the quiet
season at opposite sides of the frame.

**Tornado Climatology.** Twelve tabs, each a charting-library default under a
sentence. Twelve tabs is not depth; it is a filing cabinet, and a filing cabinet
makes the reader do the analysis. Now four, each answering a question somebody
arrives with — *when*, *where*, *the record*, *anatomy*. The season is a
ridgeline of the national curve and the six regions that make it up, with the
rows ordered by the month each region peaks, so the march of the season north
and west is the reading order rather than six crossing lines and a colour key.
The record tab draws reports-per-year and deaths-per-year on one shared span,
because apart they are two charts and together they are the argument.

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

**Severe Weather History goes back a decade.** Three years became ten, with a
month picker that works across every year at once ("every May on record"), an EF
filter, and a state filter ordered by how many tornadoes each state actually
contributed to the period on screen. Pre-2019 years are marked *partial* where
the damage survey is incomplete, rather than presented as a full count. States
are attached client-side from a generated 22 kB polygon set in its own chunk, so
the filter costs nothing to the pages that never open it.

**Foliage outlook.** An SPC-style outlook map and a scroller over the individual
observations that shows leaf change progressing through the season. A regression
model and a state choropleth were built for this and then deleted: the
observation network is too sparse in too many states to support either without
inventing numbers, and a confident-looking wrong map is worse than no map.

**Weather news you can read in the app.** Six publisher feeds plus an aggregator,
filtered to weather by keyword, grouped so stories that can actually be read in
full lead and bare headlines follow, and capped at three per source so one
prolific publisher cannot take the whole panel.

**Forty GFS parameters.** Up from seventeen, verified against a live index, and
the renders forced from the branch so they are in the database rather than
waiting on the nightly schedule.

**Model plate resolution.** The renderer's target raised from 1280×760 to
1800×1100 of actual map — pixel count is what governs a matplotlib figure's
detail, not DPI, and the measurement table is in the script's own comment.
Radar and MRMS overlays now request tiles to zoom 14 instead of 12; past the
deepest level a service publishes, the browser magnifies a 256px PNG rather than
fetching a sharper one, so the cap is the honest limit.

**SPC conditional intensity groups.** SPC added CIG1/CIG2/CIG3 in February 2026
and the hail, wind and tornado intensity layers were classifying them by name
against the old scheme, which is why level two never drew its own colour and
came through as a white outline. The palettes are rewritten for the new tiers,
significant areas are hatched rather than merely outlined, and a quiet day that
reads "Less Than 2% All Areas" is no longer classified as significant severe.

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

**Storm Chasing's backfill was retiring good days.** It looked like it had
stalled at 17 April. It had not: Open-Meteo quota exhaustion was being recorded
as a *failure*, and three failures retire a date permanently, so the backfill was
steadily marking perfectly reconstructable days as dead. Quota is now a distinct
status that does not count as a strike, and a migration clears the ones already
mis-marked.

**Terrain was rating every recent day 100/100.** The rewritten terrain algorithm
was correct; the cache key had no algorithm version in it, so every lookup
returned a score computed by the *old* algorithm and the new code never ran. The
key is versioned now and the stale generation is deleted.

**Two unit errors on the dashboard, found by rendering it.** The forecast is
requested with `precipitation_unit=inch`, so dividing by 25.4 made every
precipitation figure forty times too small; and a km/h wind fixture was reading
57 mph where it should have read 16. Neither showed up in a typecheck or a
build; both showed up in a headless browser with real data injected.

**A foliage map painting over its own control.** The scrubber underneath it was
being covered because the map div had no `overflow` clip.

**A date bracket printed backwards** — "May 1 2026 → May 31 2017" — because a
cross-year month query returns its ranges newest-first and the label took the
first and last rather than the minimum and maximum.

**A partial-survey banner on a period that was not partial**, because the check
used the archive's floor year rather than the years the selected period actually
covers.

**An NHC teletype rendered as thirty one-line paragraphs**, because every line
break in the source was being promoted to a paragraph break.

**Weather news buried what it could actually show.** Sorting by date put
headline-only wire stories above full articles, one prolific science publisher
took most of the slots, and off-topic science was coming through unfiltered.

**Tornado climatology was plotting two different units on one page.**
`regionMonth` holds seventy-four-year totals and `monthlyAvg` holds a per-year
average; the old module drew both, on separate tabs, with nothing to give it
away. Putting the national curve directly above the regional ones would have had
the Plains reading 8,418 tornadoes in a May against a national average of 206.
The regional totals are now divided by the number of years, and the regions sum
to the national curve month for month — which is the check that it is right.

**A 1953 tornado was labelled "EF5".** The Enhanced Fujita scale came into force
in February 2007; everything before it was rated on Fujita's original scale. The
deadliest-tornado list now carries the scale that was actually in force.

**Smaller ones.** CPC precipitation was drawing through the temperature colour
ramp; SPC probabilities were printing as "0.15%" because the bands are labelled
as fractions; CPC's Alaska rings were projecting off-canvas because the
projection picked a lobe per point rather than per ring; the splash screen's
background animation looped forever instead of settling; Daily Trivia lost the
answer on reload, so getting one wrong told you nothing; the Daylight arc was
drawn from UTC minutes while its labels said local time, putting Denver's
sunrise at half past twelve in the afternoon.

---

## Navigation

The menu style is an account-level choice with fifteen options. Four were worked
on in the final round.

**Apex** was printing an 8px truncated label on every node, which is not a
label — the 26px readout above the arc already names whatever is nearest, so the
per-node labels are gone and focus now defaults to the first entry, so something
is always named rather than nothing until you touch it.

**Aurora** was printing its section names over the black ridge silhouette. They
sit clear of the highest peak now.

**Elevator** lagged, and the spring was not the reason. The backdrop carried a
full-screen `backdrop-filter: blur(16px)` *under an opaque gradient* — nothing
was ever visible through it, so the blur could not be seen, but the compositor
still resolved a full-screen blur every frame while two full-height doors
travelled over the top of it. The floor plates also waited 280ms for the doors
even on a floor change, when the doors are already open; the stagger was
uncapped, so the last plate of a long section started half a second after the
first; and the call button animated `box-shadow` on an infinite loop, which is a
repaint per frame running whether the menu was open or not. All four fixed. The
car keeps its spring — it was arriving after everyone had stopped waiting.

**Solari Board and Radar Sweep are replaced** by two new styles:

*Mercury* — a stream of liquid metal runs out of a reservoir and beads, the
necks between the drops thinning until each one pinches off. That break-up is a
real thing: a falling stream does it because surface tension costs less in
spheres than in a cylinder. One spring drives the whole thing; every drop and
every neck reads that one value and writes a transform, so nothing re-renders
while it moves, and a landed drop's neck has zero width — the settled menu draws
nothing at all.

*Vault* — a strongroom. Eight bolts withdraw from the rim, the wheel turns, and
the door swings open in perspective onto a wall of deposit boxes; a section pulls
out as a drawer and its modules are the brass tags inside. The wall has a hole in
it the size of the door, so the strongroom appears through the opening as the
door comes off its seat. The rim is a repeating conic gradient, which is
knurling; the face is a finer one, which is what a lathe leaves. Nothing loops,
and the boxes are reachable while the door is still travelling.

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

## The final round, in three phases

The last block of work was requested as a numbered list and delivered in three
phases, each pushed before the next began.

**Phase 1** — Severe Weather History back a decade with month, EF and state
filters; the foliage outlook map and progress scrubber; and the two Storm
Chasing bugs above (the backfill retiring good days, and terrain frozen at 100).

**Phase 2** — weather news readable in the app; the Personalized Dashboard
rebuilt as a wall of live tiles; and SPC's new conditional intensity groups
drawn properly.

**Phase 3** — the SSWXCon dial rebuilt as a segmented level instrument; forty
GFS parameters live and the render resolution raised; lightning and tornado
climatology redesigned; and the navigation work above.

One amendment arrived mid-phase — *show only the widgets that have data, and
make a few more of them* — and is included: the dashboard now filters to modules
that can report a real figure, and four more modules were given readings so
there is more on the wall to read.

**How the visual work was checked.** Everything with a picture in it was
rendered in headless Chromium at phone width with real upstream data injected
past the sandbox's network limits, and looked at: the menus shut, mid-swing and
mid-break-up as well as at rest; the climatology at all four tabs; the dashboard
with a live forecast. That is how the two dashboard unit errors, the reversed
date bracket, the foliage map overflow and the false partial-survey banner were
found — none of them fail a typecheck or a build.

---

## The round after that — model maps, the dashboard again, and the advertising

**The HRRR viewer was showing two frames.** Not a rendering fault: the renderer
decided a cycle was ready by asking for its FIRST forecast hour. F00 is the
analysis and appears a minute or two after a cycle starts, while the last hour
of an HRRR run does not land for another forty — so at 17:03 it saw 16Z's F00,
rendered the two hours that existed, hit a 404 on the third, stopped, and wrote
a two-frame manifest over a complete one. It now asks for the LAST hour it
intends to render, skips a gap instead of stopping at it, and refuses to publish
at all below 80% coverage, because writing a manifest is publishing. The next
run came back "437 frames over 19/19 forecast hours".

**GFS looked like a mosaic.** It is 0.25°, about 25 km, which over the CONUS
extent is roughly 204x112 cells drawn into an 1800x1100 frame — every cell a
flat nine-pixel block, beside 3 km HRRR and HREF plates. The grid is now
subdivided four times bilinearly before it is drawn. That does not invent
resolution and is not claimed to; it removes a staircase that was an artefact of
how we drew it. Linear rather than cubic on purpose, because cubic overshoots
and can put a value on a reflectivity plate that is outside the range of the
four cells around it.

**HREF's severe wind map was never showing anything**, and it was not broken.
HREF publishes no gust record at all — checked against a live index, in the
prob, mean and pmmn files — so its only 10 m wind is SUSTAINED wind, and a
sustained 58 mph over land is close to unheard of. Decoding that record gives a
CONUS maximum of 8%, on 348 grid points out of 700,790, against a scale whose
first band was 5%. It has its own scale starting at 1% now, a 40 mph companion
that carries real signal on an ordinary day, and a label that says "sustained".

**And the bill that came with all of it.** A full HRRR render measured
twenty-one minutes. Four cycles a day across three models is about 6,000 Actions
minutes a month against a private repository's free 2,000 — the renders would
have stopped around the tenth of every month with nothing in the log to say why.
Forecast hours now render in a process pool. Oversubscribing it was tried and
measured and failed: four workers on the two-core runner lost seven of nineteen
hours to the S3 endpoint closing connections, which the coverage guard caught.
The lasting fix was retries on every NOAA fetch, which the upload path had and
the download path never did.

**The Dashboard is arrangeable again**, which the rebuild had dropped along with
the widgets it arranged. Arrows move a tile within its section and the eye takes
it off the wall; the arrangement saves per member per device, and a module
nobody has seen yet arrives in its default place rather than hidden. Every tile
whose data has a shape now draws it — sparklines, hourly columns, a real wind
compass, banded scales for AQI and UV, and a moon with a true elliptical
terminator rather than a bar measuring how lit it is.

**The FAQ and the Intro Guide describe the app that exists.** Both generate from
one file, so most of this was one edit. Four things were wrong rather than
merely old: the Dashboard card described dragging widgets that no longer exist,
the menu card offered two styles retired this round, SSWXCon's scale was written
backwards, and AI Knowledge Battle had no entry at all. Three new FAQ entries
cover the news feeds, how the model maps work and why GFS looks softer, and how
to arrange the dashboard.

**The advertising side had a live bug.** There were two `vercel.json` files and
Vercel reads only the root one — so the file carrying the good settings was
never read. The catch-all rewrite pointed at `index.html`, meaning all
thirty-nine gated routes were served the home page's title and a canonical
pointing at "/", which is the exact duplicate-content signature the SEO work
exists to remove; `seo-build.mjs` emits a neutral `app.html` for precisely this
and it had never once been used. The security headers and the sitemap caching
were not applied at all, confirmed with `curl -I` against the live site. Both
fixed in the root file, the inner one deleted, and a note in DEPLOYING.md saying
not to add one back. Alongside that: FAQPage structured data now ships in the
HTML crawlers read rather than only in the DOM after React mounts, the Open
Graph image dimensions were declared 1200x630 when the file is 1280x720, and
llms.txt now lists what the app actually does rather than the fifth of it that
was true a year ago.

---

## Still outstanding

- **The chase season is still filling in.** The two-hourly backfill works
  backwards toward 7 March on its own; the limit is Open-Meteo's daily quota,
  not the code. With the quota-is-not-a-strike fix deployed it will stop
  retiring days it could have rebuilt, so the remaining gaps should close
  without further intervention.
- **The day score was recalibrated** after the first reconstruction showed every
  day landing between 6.8 and 9.2 — a Yearly tab cannot rank anything if every
  day is an eight. It separates days now, and the supercell-flavour term was
  fixed at the same time so an LP classification is actually reachable.
- **One SQL statement** is still needed to make the terrain cache work:
  `grant select, insert, update, delete on table public.chase_terrain_cache to service_role;`
- **Two migrations and one deploy are waiting on you** for the Storm Chasing
  fixes to take effect: deploy `chase-target`, then run
  `20260913040000_chase_terrain_cache_algo.sql` (drops the stale terrain cache
  generation) and `20260913050000_chase_quota_not_a_strike.sql` (un-retires the
  days that were marked failed when they had only hit the API quota). Until both
  run, terrain keeps returning its old scores and the retired days stay retired.
- **This branch needs merging to `main`** before the next scheduled render, or
  the forty GFS parameters will be overwritten — a *scheduled* GitHub Actions run
  always uses the default branch's copy of the workflow, whatever branch the last
  manual run was dispatched from. Every fix in the round above is in the same
  position: none of it is running in production until the merge happens.
- **The model-map render budget is a spend decision, and it is yours.** With the
  render parallelised, a day of four HRRR, four GFS and four HREF cycles lands
  near the free 2,000 Actions minutes a month rather than three times over it,
  but it is not comfortably clear of it. Either buy Actions minutes (Linux runs
  about $0.008 a minute, so the gap is a few dollars) or drop a cycle from the
  cron in `.github/workflows/render-model-maps.yml`. HREF is the cheapest to
  halve: its probabilities move slowly, which is why its frames are already
  two-hourly.
- **Nothing is verified with Google or Bing.** There is no Search Console
  property, no Bing Webmaster property and no analytics of any kind — confirmed
  by checking the HTML and the DNS TXT records for both domains. Everything
  needed to be indexed well is in place and nobody has told the search engines
  the site is there.
- **Direct database access was blocked for this whole engagement** at the
  assistant's own tool layer, not by any credential. Every route was refused, so
  nothing here was verified by querying the live database; the SQL above is
  written to be run by you.
