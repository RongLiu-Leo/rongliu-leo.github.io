# Visitor map

Self-hosted replacement for the ClustrMaps widget that used to sit in the page
footer. A Cloudflare Worker records the approximate location of each visitor in
a D1 database, and `assets/js/visitor-map.js` draws those locations as a dotted
world map.

Nothing is loaded from a third party at runtime, and the data lives in a
database you control. A nightly GitHub Action exports it back into this
repository, so the history survives even if the Cloudflare account does not.

## How it works

| Piece | Location |
| --- | --- |
| Worker (`POST /hit`, `GET /points`) | `worker/src/index.js` |
| Database schema | `worker/schema.sql` |
| Map widget | `assets/js/visitor-map.js` |
| World geometry (2.8 KB bitmask) | `assets/js/world-mask.js` |
| Nightly backup | `.github/workflows/backup-visitors.yml` |
| Backup output | `data/visitors.sql` |

Visitor coordinates come from `request.cf`, which Cloudflare attaches to every
request at the edge. There is no GeoIP database to maintain and no external
lookup API.

## Current deployment

Live at `https://visitor-map.rong-leo-827.workers.dev`, which `index.html`
already points at. Redeploy after changing the Worker with `npm run deploy`.

## Setup

Only needed to rebuild this from scratch or move it to another account. You
need a free Cloudflare account; no domain is required, since the Worker is
served from a free `workers.dev` subdomain.

```bash
cd worker
npm install
npx wrangler login
```

**1. Create the database.** Copy the `database_id` it prints into the
`d1_databases` block of `wrangler.jsonc`, replacing `PASTE_DATABASE_ID_HERE`.

```bash
npx wrangler d1 create visitor-map
```

**2. Create the tables.**

```bash
npm run init-db
```

**3. Set the hashing salt.** Paste any long random string when prompted. It is
used to hash visitor identifiers and never leaves Cloudflare.

```bash
npx wrangler secret put HASH_SALT
```

**4. Deploy.** This prints a URL such as
`https://visitor-map.your-subdomain.workers.dev`.

```bash
npm run deploy
```

**5. Point the page at it.** In `index.html`, replace
`PASTE_WORKER_URL_HERE` in the `data-endpoint` attribute with that URL, then
commit and push. The widget stays hidden until the endpoint responds, so a
misconfigured URL leaves no broken box on the page.

## Enabling the nightly backup

Add two repository secrets under **Settings → Secrets and variables →
Actions**:

- `CLOUDFLARE_ACCOUNT_ID` — shown on the Workers & Pages overview page.
- `CLOUDFLARE_API_TOKEN` — create at **My Profile → API Tokens** using the
  *Edit Cloudflare Workers* template, or a custom token with `D1: Edit`.

The workflow then commits `data/visitors.sql` whenever the data changes. You
can also trigger it by hand from the Actions tab, and run it locally with
`npm run backup`.

To restore a backup into a fresh database:

```bash
npx wrangler d1 execute visitor-map --remote --file=../data/visitors.sql
```

Note that GitHub disables scheduled workflows after 60 days without repository
activity; pushing anything re-enables them.

## Privacy

Raw IP addresses are never stored. Each row holds a truncated SHA-256 hash of
the IP, user agent, a secret salt, and the date. Because the date is part of
the hash, the same person produces a different value the next day, so rows
cannot be linked over time. Coordinates are rounded to two decimal places, and
Cloudflare only reports city-level accuracy to begin with.

One row is written per unique visitor per day. Known bots and crawlers are
filtered out by user agent, and requests carrying an `Origin` header not listed
in `ALLOWED_ORIGINS` are rejected.

## Limits and caveats

The free tier allows 100,000 Worker requests and 100,000 database row writes
per day, far beyond what a personal site uses. `workers.dev` is often
unreachable from mainland China, so visits from there may go uncounted — the
hosted alternatives have the same gap. Cloudflare describes `workers.dev` as
intended for personal projects rather than business-critical traffic.

## Regenerating the world map

Only needed if you want a different resolution or latitude range; edit the
constants at the top of the script first.

```bash
curl -L -o /tmp/world.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
node tools/build-world-mask.mjs /tmp/world.geojson
```
