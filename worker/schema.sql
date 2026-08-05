-- Raw log: one row per pageview, the source of truth for every rollup below.
-- No identifier of any kind is recorded — no IP, no hash, no cookie — so rows
-- cannot be grouped back into people or sessions even in principle. The log is
-- only ever read in bulk, by rebuild-rollups.sql, so it carries no index.
CREATE TABLE IF NOT EXISTS views (
  day        TEXT    NOT NULL,
  page       TEXT    NOT NULL DEFAULT '/',
  country    TEXT,
  region     TEXT,
  city       TEXT,
  lat        REAL,
  lon        REAL,
  referrer   TEXT,
  created_at INTEGER NOT NULL
);

-- Rollups. Serving reads from these keeps query cost tied to the number of
-- distinct places and pages rather than to the whole history, which otherwise
-- grows until it exhausts the daily row-read allowance. Empty strings rather
-- than NULLs in the keys, so ON CONFLICT matches. Rebuild any time with
-- rebuild-rollups.sql; the raw table is the source of truth.
CREATE TABLE IF NOT EXISTS places (
  lat     REAL    NOT NULL,
  lon     REAL    NOT NULL,
  country TEXT    NOT NULL DEFAULT '',
  region  TEXT    NOT NULL DEFAULT '',
  city    TEXT    NOT NULL DEFAULT '',
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (lat, lon, country, region, city)
);

CREATE TABLE IF NOT EXISTS daily (
  day TEXT    NOT NULL PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);

-- Hour of day, 0-23 UTC, from the moment each view was recorded.
CREATE TABLE IF NOT EXISTS hourly (
  hour INTEGER NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);

-- One row per page of the site. `title` is whatever the page called itself on
-- its most recent view, so new project pages label themselves.
CREATE TABLE IF NOT EXISTS pages (
  page  TEXT    NOT NULL PRIMARY KEY,
  title TEXT    NOT NULL DEFAULT '',
  n     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS page_daily (
  day  TEXT    NOT NULL,
  page TEXT    NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
);

CREATE TABLE IF NOT EXISTS referrers (
  host TEXT    NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);
