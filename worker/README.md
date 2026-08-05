# Visitor map

Self-hosted replacement for the ClustrMaps widget that used to sit in the page
footer. A Cloudflare Worker counts pageviews across the site and records where
they came from in a D1 database; `assets/js/visitor-map.js` draws those places
as a dotted world map, and `visitors.html` shows the full breakdown.

Nothing is loaded from a third party at runtime, and the data lives in a
database you control.

## Current deployment

Live at `https://visitor-map.rong-leo-827.workers.dev`, which `assets/js/beacon.js`
points at. Redeploy after changing the Worker with `npm run deploy` — pushing to
GitHub only updates the pages.

## Layout

| Piece | Location |
| --- | --- |
| Worker (`POST /hit`, `GET /points`, `GET /stats[?page=]`) | `worker/src/index.js` |
| Database schema | `worker/schema.sql` |
| Rollup rebuild | `worker/rebuild-rollups.sql` |
| Tests for the input handling (`npm test`) | `worker/test/` |
| Pageview beacon, loaded by every page but `visitors.html` | `assets/js/beacon.js` |
| Shared map renderer | `assets/js/world-map.js` |
| Footer widget | `assets/js/visitor-map.js` |
| Visitors page | `visitors.html`, `assets/js/visitors.js` |
| World geometry (2.8 KB bitmask) | `assets/js/world-mask.js` |

Coordinates come from `request.cf`, which Cloudflare attaches to every request
at the edge. There is no GeoIP database and no external lookup API.

## What counts as a view

Every page load is one view. There is no deduplication, so a reload counts
again, and one person reading three project pages counts three times. That is
the whole definition — the numbers measure traffic, not people, and cannot be
read as unique visitors.

`visitors.html` is the one page that carries no beacon. It reports on the
numbers rather than adding to them, and its traffic is mostly me checking them,
which would crowd out the pages worth measuring.

## Counting other pages

Project pages live in their own repositories but are served from the same
origin, so they need no Worker or CORS change — only this line, which keeps the
endpoint and the logic in one place:

```html
<script src="https://rongliu-leo.github.io/assets/js/beacon.js" defer></script>
```

The beacon sends the path and the page title, so a new page labels itself in
the Pages section without anything being registered in advance.

A page is keyed by its path with no extension and no trailing slash, because
GitHub Pages serves one file under several spellings — `/visitors.html`,
`/visitors`, and `/visitors/` are the same page, as are `/AtomGS/` and
`/AtomGS/index.html`. The Worker folds them on write, and again when a report
is requested, so a link naming an older spelling still resolves. Views recorded
before this folding existed were merged by rewriting `page` in the raw log and
rebuilding the rollups.

## Tables

`views` is the raw log and the source of truth: one row per pageview. Every
other table is a rollup maintained on write, and all of them can be recomputed
from the log.

| Rollup | Key | Feeds |
| --- | --- | --- |
| `places` | lat, lon, country, region, city | map dots, country/region/city lists |
| `daily` | day | daily chart, totals, weekday pattern |
| `hourly` | hour, 0-23 UTC | time-of-day chart |
| `referrers` | host | referrer list |
| `pages` | page | the page picker, per-page panels |
| `page_places` | page + place | everything above, for one page |
| `page_daily` | day, page | per-page charts |
| `page_hourly` | page, hour | " |
| `page_referrers` | page, host | " |

`GET /stats` reads the site-wide rollups and `GET /stats?page=/AtomGS/` reads
the page-scoped ones, returning the same shape either way, which is what lets
the visitors page show one report for any scope. Only pages already present in
`pages` are addressable, so arbitrary input cannot mint cache entries.

Reads are served entirely from the rollups. This matters more than it looks:
grouping over the raw log would scan every row ever recorded on each request,
and since D1 bills reads by rows *scanned*, that cost grows with traffic and
history at once. Measured at 206 bytes per row, storage is a non-issue for
years, but a site doing a few hundred views a day would exhaust the free tier's
5 million daily row reads within months. Reading from the rollups keeps the cost
proportional to the number of distinct places and pages instead.

Counting every view rather than one per visitor per day makes the raw log grow
with traffic instead of with audience, so it is worth knowing the shape of it:
a thousand views a day is roughly 75 MB a year against a 5 GB limit. Each view
costs about nine writes against a free allowance of 100,000 a day.

If the counters ever drift from the raw log, rebuild them:

```bash
npx wrangler d1 execute visitor-map --remote -y --file=./rebuild-rollups.sql
```

## Changing a rollup

`CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so a new column in
`schema.sql` never reaches a database that already has that table. Drop the
rollup and rebuild it instead; the raw log is the source of truth, so nothing
is lost:

```bash
npm run init-db                     # creates any brand-new rollup tables
npm run deploy                      # ship the Worker that writes them
npx wrangler d1 execute visitor-map --remote -y --command="DROP TABLE places"
npm run init-db                     # recreate places with the new shape
npx wrangler d1 execute visitor-map --remote -y --file=./rebuild-rollups.sql
```

Rollup writes fail while the schema and the deployed Worker disagree, which is
why the rebuild goes last: `views` is written before and independently of the
rollups, so recomputing from it at the end repairs anything missed in between.

## Tests

`npm test` runs Node's own test runner over `worker/test/`, with no
dependencies to install. It covers the input handling — path folding, title
and referrer reduction, bot matching — which is where a quiet mistake is most
expensive: a change there does not fail loudly, it just starts recording the
wrong thing. `npm run deploy` runs the tests first and stops if any fail.

## Privacy

Nothing identifying is recorded. There is no IP address, no hash of one, no
cookie, and no client storage of any kind, so the log cannot be grouped back
into people or sessions even by whoever holds the database. Coordinates are
rounded to two decimal places, and Cloudflare only reports city-level accuracy
to begin with.

Paths are stored without query strings or fragments, and page titles are capped
in length. Both are supplied by the page rather than inferred.

Referrers are reduced to a bare hostname, so no paths or query strings are
kept. The value comes from `document.referrer` in the page rather than the
`Referer` header, because the header on a request to this Worker names the
page itself. Being client-supplied, it is discarded unless it parses as a real
http(s) URL, and self-referrals are ignored.

Known bots are filtered by user agent, and `/hit` rejects requests whose
`Origin` is missing or absent from `ALLOWED_ORIGINS`. That stops other
websites from writing to the counter, though an `Origin` header is forgeable
outside a browser, so treat the aggregate numbers as public.

`/hit` is rate limited to 60 calls a minute per caller, which is the one place
an address is touched at all. It is read from `CF-Connecting-IP`, handed to the
limiter as a counting key, and discarded with the request — never written, and
never combined with anything that is. The check runs before the bot filter, so
automated callers are bounded too: they record nothing, but they still cost
invocations.

Treat that limit as a seatbelt rather than armour. Counters are kept per
Cloudflare location and are approximate, so a burst faster than they propagate
can slip through, and a caller spread across addresses is not bounded at all.
It fails open by design, since a limiter that is unavailable should not cost a
real visitor their view. What makes this proportionate is that every rollup can
be rebuilt from the raw log: if the numbers are ever polluted, delete the
offending rows by `created_at` and re-run `rebuild-rollups.sql`.

## Backups

There is no scheduled backup. Take one whenever you like — you are already
authenticated through `wrangler login`, so no API token is needed:

```bash
npm run backup     # writes ../data/visitors.sql
```

Commit the result and the history lives in git. To restore into a fresh
database, load the dump and rebuild the rollups:

```bash
npx wrangler d1 execute visitor-map --remote -y --file=../data/visitors.sql
npx wrangler d1 execute visitor-map --remote -y --file=./rebuild-rollups.sql
```

## Setting up from scratch

Only needed to move this to another account. A free Cloudflare account is
enough; no domain is required, since the Worker is served from a free
`workers.dev` subdomain.

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create visitor-map    # put the printed id in wrangler.jsonc
npm run init-db
npm run deploy                        # prints the workers.dev URL
```

Then point everything at that URL — `ENDPOINT` in `assets/js/beacon.js`, which
project pages load directly, and the `data-endpoint` attributes in `index.html`
and `visitors.html` — and set `ALLOWED_ORIGINS` in `wrangler.jsonc` to your
site's origin.

Do not run `npm audit fix --force` here: it downgrades wrangler to an older,
more vulnerable release, and the advisories it reports afterwards point back at
the newer version in a loop.

## Regenerating the world map

Only needed to change the resolution or latitude range; edit the constants at
the top of the script first.

```bash
curl -L -o /tmp/world.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
node tools/build-world-mask.mjs /tmp/world.geojson
```
