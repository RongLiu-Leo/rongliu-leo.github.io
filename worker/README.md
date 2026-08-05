# Visitor map

Self-hosted replacement for the ClustrMaps widget that used to sit in the page
footer. A Cloudflare Worker records the approximate location of each visitor in
a D1 database; `assets/js/visitor-map.js` draws those locations as a dotted
world map, and `visitors.html` shows the full breakdown.

Nothing is loaded from a third party at runtime, and the data lives in a
database you control.

## Current deployment

Live at `https://visitor-map.rong-leo-827.workers.dev`, which both `index.html`
and `visitors.html` point at. Redeploy after changing the Worker with
`npm run deploy` — pushing to GitHub only updates the pages.

## Layout

| Piece | Location |
| --- | --- |
| Worker (`POST /hit`, `GET /points`, `GET /stats`) | `worker/src/index.js` |
| Database schema | `worker/schema.sql` |
| Rollup rebuild | `worker/rebuild-rollups.sql` |
| Shared map renderer | `assets/js/world-map.js` |
| Footer widget | `assets/js/visitor-map.js` |
| Visitors page | `visitors.html`, `assets/js/visitors.js` |
| World geometry (2.8 KB bitmask) | `assets/js/world-mask.js` |

Visitor coordinates come from `request.cf`, which Cloudflare attaches to every
request at the edge. There is no GeoIP database and no external lookup API.

## Tables

`visits` is the raw log and the source of truth: one row per unique visitor per
day. `places`, `daily`, `hourly`, and `referrers` are rollups maintained on
write, and every one of them can be recomputed from the raw log.

| Rollup | Key | Feeds |
| --- | --- | --- |
| `places` | lat, lon, country, region, city | map dots, country/region/city lists |
| `daily` | day | daily chart, totals, weekday pattern |
| `hourly` | hour, 0-23 UTC | time-of-day chart |
| `referrers` | host | referrer list |

Reads are served entirely from the rollups. This matters more than it looks:
grouping over the raw log would scan every row ever recorded on each request,
and since D1 bills reads by rows *scanned*, that cost grows with traffic and
history at once. Measured at 206 bytes per row, storage is a non-issue for
centuries, but a site doing a few hundred visits a day would exhaust the free
tier's 5 million daily row reads within months. Reading from the rollups keeps
the cost proportional to the number of distinct cities instead.

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
why the rebuild goes last: `visits` is written before and independently of the
rollups, so recomputing from it at the end repairs anything missed in between.

## Privacy

Raw IP addresses are never stored. Each row holds a truncated SHA-256 hash of
the IP, user agent, a secret salt, and the date. Because the date is part of
the hash, the same person produces a different value the next day, so rows
cannot be linked over time. Coordinates are rounded to two decimal places, and
Cloudflare only reports city-level accuracy to begin with.

Referrers are reduced to a bare hostname, so no paths or query strings are
kept. The value comes from `document.referrer` in the page rather than the
`Referer` header, because the header on a request to this Worker names the
page itself. Being client-supplied, it is discarded unless it parses as a real
http(s) URL, and self-referrals are ignored.

Known bots are filtered by user agent, and `/hit` rejects requests whose
`Origin` is missing or absent from `ALLOWED_ORIGINS`. That stops other
websites from writing to the counter, though an `Origin` header is forgeable
outside a browser, so treat the aggregate numbers as public.

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
npx wrangler secret put HASH_SALT     # any long random string
npm run deploy                        # prints the workers.dev URL
```

Then set `data-endpoint` in `index.html` and `visitors.html` to that URL, and
`ALLOWED_ORIGINS` in `wrangler.jsonc` to your site's origin.

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
