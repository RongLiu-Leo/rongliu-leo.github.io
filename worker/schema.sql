-- Raw log: one row per unique visitor per day. `visitor` is a salted hash whose
-- salt rotates daily, so rows cannot be linked across days back to a person.
-- The primary key already indexes `day`, so no extra index is needed.
CREATE TABLE IF NOT EXISTS visits (
  day        TEXT    NOT NULL,
  visitor    TEXT    NOT NULL,
  country    TEXT,
  region     TEXT,
  city       TEXT,
  lat        REAL,
  lon        REAL,
  referrer   TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, visitor)
);

-- Rollups. Serving the widget from these keeps reads proportional to the number
-- of distinct places rather than to the whole history, which otherwise grows
-- until it exhausts the daily row-read allowance. Empty strings rather than
-- NULLs in the keys, so ON CONFLICT matches. Rebuild any time with
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

-- Hour of day, 0-23 UTC, taken from the first visit each person makes in a day.
CREATE TABLE IF NOT EXISTS hourly (
  hour INTEGER NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referrers (
  host TEXT    NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);
