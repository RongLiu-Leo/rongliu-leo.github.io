/**
 * Visitor map backend.
 *
 * POST /hit    records the caller's approximate location
 * GET  /points returns aggregated locations and totals for the widget
 *
 * Location comes from `request.cf`, which Cloudflare fills in at the edge, so
 * there is no GeoIP database and no third-party lookup involved. Raw IPs are
 * never written to the database.
 */

const BOT_PATTERN =
  /bot|crawl|spider|slurp|scrap|preview|monitor|uptime|pingdom|lighthouse|headless|curl|wget|python-requests|axios|node-fetch|okhttp|go-http-client|java\/|libwww|httpclient|facebookexternalhit|semrush|ahrefs|petal|yandex|baidu|duckduck|applebot|gptbot|claudebot|ccbot|perplexity/i;

// Cloudflare reports city-level coordinates already; rounding to ~1km further
// blurs them and lets identical locations collapse into one map dot.
const COORD_PRECISION = 2;

const POINTS_MAX_AGE = 300;

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

/**
 * Identifies a visitor for de-duplication only. Mixing the day into the hash
 * means the same person produces a different value tomorrow, so the table
 * cannot be used to follow anyone over time.
 */
async function visitorHash(request, env, day) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = request.headers.get("User-Agent") || "";
  const salt = env.HASH_SALT || "";
  const data = new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function round(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Number(n.toFixed(COORD_PRECISION)) : null;
}

async function recordHit(request, env, cors) {
  const ua = request.headers.get("User-Agent") || "";
  if (!ua || BOT_PATTERN.test(ua)) {
    return json({ ok: true, counted: false }, { status: 202 }, cors);
  }

  const cf = request.cf || {};
  const day = today();
  const visitor = await visitorHash(request, env, day);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO visits (day, visitor, country, region, city, lat, lon, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      day,
      visitor,
      cf.country || null,
      cf.region || null,
      cf.city || null,
      round(cf.latitude),
      round(cf.longitude),
      Date.now()
    )
    .run();

  return json(
    {
      ok: true,
      counted: true,
      you: {
        lat: round(cf.latitude),
        lon: round(cf.longitude),
        city: cf.city || null,
        country: cf.country || null,
      },
    },
    { status: 201 },
    cors
  );
}

async function readPoints(env, cors) {
  const points = await env.DB.prepare(
    `SELECT lat, lon, country, city, COUNT(*) AS n
       FROM visits
      WHERE lat IS NOT NULL AND lon IS NOT NULL
      GROUP BY lat, lon, country, city
      ORDER BY n DESC
      LIMIT 3000`
  ).all();

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS visits,
            COUNT(DISTINCT country) AS countries,
            MIN(day) AS since
       FROM visits`
  ).first();

  return json(
    {
      points: points.results.map((row) => ({
        lat: row.lat,
        lon: row.lon,
        country: row.country,
        city: row.city,
        n: row.n,
      })),
      visits: totals?.visits ?? 0,
      countries: totals?.countries ?? 0,
      since: totals?.since ?? null,
    },
    { headers: { "Cache-Control": `public, max-age=${POINTS_MAX_AGE}` } },
    cors
  );
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
    // here costs the widget nothing and stops scripted writes to the counter.
    if (pathname === "/hit" && request.method === "POST") {
      if (!origin) return json({ error: "origin required" }, { status: 403 }, cors);
      return recordHit(request, env, cors);
    }

    if (pathname === "/points" && request.method === "GET") {
      const cache = caches.default;
      const key = new Request(new URL("/points", request.url), { method: "GET" });
      const cached = await cache.match(key);
      if (cached) {
        const response = new Response(cached.body, cached);
        for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
        return response;
      }

      const response = await readPoints(env, cors);
      ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    }

    return json({ endpoints: ["POST /hit", "GET /points"] }, { status: 404 }, cors);
  },
};
