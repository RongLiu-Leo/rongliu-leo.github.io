/**
 * Visitor map backend.
 *
 * POST /hit?page=…&title=…&ref=…  records one pageview
 * GET  /points                    compact payload for the footer widget
 * GET  /stats                     fuller breakdown for the visitors page
 *
 * Every view is counted, including repeat views by the same person. Nothing
 * identifies the caller: no IP, no hash, no cookie, so the log cannot be
 * grouped back into people or sessions.
 *
 * Location comes from `request.cf`, which Cloudflare fills in at the edge, so
 * there is no GeoIP database and no third-party lookup involved.
 *
 * Reads are served from rollup tables rather than by scanning the raw log,
 * which keeps query cost tied to the number of distinct places and pages
 * instead of to the total history.
 */

const BOT_PATTERN =
  /bot|crawl|spider|slurp|scrap|preview|monitor|uptime|pingdom|lighthouse|headless|curl|wget|python-requests|axios|node-fetch|okhttp|go-http-client|java\/|libwww|httpclient|facebookexternalhit|semrush|ahrefs|petal|yandex|baidu|duckduck|applebot|gptbot|claudebot|ccbot|perplexity/i;

// Cloudflare reports city-level coordinates already; rounding to ~1km further
// blurs them and lets identical locations collapse into one map dot.
const COORD_PRECISION = 2;

const CACHE_SECONDS = 300;
const MAX_REFERRER_LENGTH = 100;
const MAX_PAGE_LENGTH = 100;
const MAX_TITLE_LENGTH = 120;
const DAILY_WINDOW = 90;

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const headers = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return { headers, origin, allowed };
}

function json(body, init, cors) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...cors, ...(init?.headers || {}) },
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function round(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Number(n.toFixed(COORD_PRECISION)) : null;
}

/**
 * The path is supplied by the page, so it is reduced to a bare path with no
 * query string or fragment before it is stored.
 */
function pagePath(raw) {
  if (!raw) return "/";
  let path = String(raw).slice(0, 200).split("?")[0].split("#")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/index\.html?$/i, "");
  return path.slice(0, MAX_PAGE_LENGTH) || "/";
}

function pageTitle(raw) {
  if (!raw) return "";
  return String(raw).replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

/**
 * The referrer is supplied by the page, because the `Referer` header on a
 * request to this Worker names the page itself rather than wherever the
 * visitor came from. Being client-controlled, it is reduced to a bare hostname
 * and discarded unless it parses as a real http(s) URL.
 */
function referrerHost(raw, allowed) {
  if (!raw || raw.length > 500) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "").slice(0, MAX_REFERRER_LENGTH);
  if (!host || !host.includes(".")) return null;
  // Navigation within the site itself is not a referral.
  if (allowed.some((origin) => origin.endsWith(host))) return null;
  return host;
}

async function recordHit(request, env, cors, allowed) {
  const ua = request.headers.get("User-Agent") || "";
  if (!ua || BOT_PATTERN.test(ua)) {
    return json({ ok: true, counted: false }, { status: 202 }, cors);
  }

  const cf = request.cf || {};
  const params = new URL(request.url).searchParams;
  const now = Date.now();
  const day = today();
  const lat = round(cf.latitude);
  const lon = round(cf.longitude);
  const country = cf.country || "";
  const region = cf.region || "";
  const city = cf.city || "";
  const page = pagePath(params.get("page"));
  const title = pageTitle(params.get("title"));
  const referrer = referrerHost(params.get("ref"), allowed);

  await env.DB.prepare(
    `INSERT INTO views (day, page, country, region, city, lat, lon, referrer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(day, page, country || null, region || null, city || null, lat, lon, referrer, now)
    .run();

  const writes = [
    env.DB.prepare(
      `INSERT INTO daily (day, n) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET n = n + 1`
    ).bind(day),
    env.DB.prepare(
      `INSERT INTO hourly (hour, n) VALUES (?, 1)
       ON CONFLICT(hour) DO UPDATE SET n = n + 1`
    ).bind(new Date(now).getUTCHours()),
    env.DB.prepare(
      `INSERT INTO page_daily (day, page, n) VALUES (?, ?, 1)
       ON CONFLICT(day, page) DO UPDATE SET n = n + 1`
    ).bind(day, page),
    // A page keeps its last known title, so a view that arrives without one
    // does not blank the label already on record.
    env.DB.prepare(
      `INSERT INTO pages (page, title, n) VALUES (?, ?, 1)
       ON CONFLICT(page) DO UPDATE SET
         n = n + 1,
         title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE pages.title END`
    ).bind(page, title),
  ];
  if (lat !== null && lon !== null) {
    writes.push(
      env.DB.prepare(
        `INSERT INTO places (lat, lon, country, region, city, n) VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(lat, lon, country, region, city) DO UPDATE SET n = n + 1`
      ).bind(lat, lon, country, region, city)
    );
  }
  if (referrer) {
    writes.push(
      env.DB.prepare(
        `INSERT INTO referrers (host, n) VALUES (?, 1)
         ON CONFLICT(host) DO UPDATE SET n = n + 1`
      ).bind(referrer)
    );
  }
  await env.DB.batch(writes);

  return json(
    {
      ok: true,
      counted: true,
      you: { lat, lon, city: city || null, country: country || null },
    },
    { status: 201 },
    cors
  );
}

async function readPlaces(env, limit) {
  const rows = await env.DB.prepare(
    `SELECT lat, lon, country, region, city, n FROM places ORDER BY n DESC LIMIT ?`
  )
    .bind(limit)
    .all();
  return rows.results.map((row) => ({
    lat: row.lat,
    lon: row.lon,
    country: row.country || null,
    region: row.region || null,
    city: row.city || null,
    n: row.n,
  }));
}

/** Collapses places into a ranked list, since one city can span several dots. */
function rank(places, key, build) {
  const totals = new Map();
  for (const place of places) {
    const id = key(place);
    if (!id) continue;
    const entry = totals.get(id);
    if (entry) entry.n += place.n;
    else totals.set(id, { ...build(place), n: place.n });
  }
  return [...totals.values()].sort((a, b) => b.n - a.n);
}

async function readTotals(env) {
  const row = await env.DB.prepare(`SELECT SUM(n) AS views, MIN(day) AS since FROM daily`).first();
  return { views: row?.views ?? 0, since: row?.since ?? null };
}

function windowStart(days) {
  return new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
}

async function readPoints(env, cors) {
  const [places, totals] = await Promise.all([readPlaces(env, 3000), readTotals(env)]);
  const countries = new Set(places.filter((p) => p.country).map((p) => p.country));
  // The footer widget only plots dots, so the extra columns are dropped here.
  const points = places.map(({ lat, lon, country, city, n }) => ({ lat, lon, country, city, n }));

  return json(
    { points, views: totals.views, countries: countries.size, since: totals.since },
    { headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` } },
    cors
  );
}

async function readStats(env, cors) {
  const from = windowStart(DAILY_WINDOW);
  const [places, totals, dailyRows, hourRows, pageRows, pageDailyRows, referrerRows] = await Promise.all([
    readPlaces(env, 5000),
    readTotals(env),
    env.DB.prepare(`SELECT day, n FROM daily ORDER BY day DESC LIMIT ?`).bind(DAILY_WINDOW).all(),
    env.DB.prepare(`SELECT hour, n FROM hourly ORDER BY hour`).all(),
    env.DB.prepare(`SELECT page, title, n FROM pages ORDER BY n DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT day, page, n FROM page_daily WHERE day >= ? ORDER BY day`).bind(from).all(),
    env.DB.prepare(`SELECT host, n FROM referrers ORDER BY n DESC LIMIT 50`).all(),
  ]);

  const byCountry = rank(places, (p) => p.country, (p) => ({ country: p.country }));
  const regions = rank(
    places,
    (p) => (p.region ? `${p.region}|${p.country || ""}` : null),
    (p) => ({ region: p.region, country: p.country })
  );
  const cities = rank(
    places,
    (p) => (p.city ? `${p.city}|${p.country || ""}` : null),
    (p) => ({ city: p.city, country: p.country, region: p.region })
  );

  return json(
    {
      points: places,
      views: totals.views,
      since: totals.since,
      countries: byCountry.length,
      cityCount: cities.length,
      regionCount: regions.length,
      daily: dailyRows.results.slice().reverse(),
      hours: hourRows.results,
      byCountry,
      regions: regions.slice(0, 100),
      cities: cities.slice(0, 100),
      pages: pageRows.results,
      pageDaily: pageDailyRows.results,
      referrers: referrerRows.results,
    },
    { headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` } },
    cors
  );
}

async function cached(request, ctx, cors, build) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) {
    const response = new Response(hit.body, hit);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  }
  const response = await build();
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const { headers: cors, origin, allowed } = corsHeaders(request, env);
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // The endpoints exist only for the site itself; requiring a known Origin
    // keeps casual scripted traffic out of the counter.
    if (origin && !allowed.includes(origin)) {
      return json({ error: "origin not allowed" }, { status: 403 }, cors);
    }

    // Browsers always send Origin on cross-origin requests, so demanding one
    // here costs the beacon nothing and stops scripted writes to the counter.
    if (pathname === "/hit" && request.method === "POST") {
      if (!origin) return json({ error: "origin required" }, { status: 403 }, cors);
      return recordHit(request, env, cors, allowed);
    }

    if (pathname === "/points" && request.method === "GET") {
      return cached(request, ctx, cors, () => readPoints(env, cors));
    }

    if (pathname === "/stats" && request.method === "GET") {
      return cached(request, ctx, cors, () => readStats(env, cors));
    }

    return json({ endpoints: ["POST /hit", "GET /points", "GET /stats"] }, { status: 404 }, cors);
  },
};
