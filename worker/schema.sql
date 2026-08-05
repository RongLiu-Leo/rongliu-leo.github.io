-- One row per unique visitor per day. `visitor` is a salted hash whose salt
-- rotates daily, so rows cannot be linked across days back to a person.
CREATE TABLE IF NOT EXISTS visits (
  day        TEXT    NOT NULL,
  visitor    TEXT    NOT NULL,
  country    TEXT,
  region     TEXT,
  city       TEXT,
  lat        REAL,
  lon        REAL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, visitor)
);

CREATE INDEX IF NOT EXISTS idx_visits_place ON visits (lat, lon);
CREATE INDEX IF NOT EXISTS idx_visits_day ON visits (day);
