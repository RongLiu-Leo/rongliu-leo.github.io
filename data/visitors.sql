PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE visits (
  day        TEXT    NOT NULL,
  visitor    TEXT    NOT NULL,
  country    TEXT,
  region     TEXT,
  city       TEXT,
  lat        REAL,
  lon        REAL,
  created_at INTEGER NOT NULL, referrer TEXT,
  PRIMARY KEY (day, visitor)
);
INSERT INTO "visits" ("day","visitor","country","region","city","lat","lon","created_at","referrer") VALUES('2026-08-05','50219cf678ff0e2c9a30ed2be0108a41','US','California','Los Angeles',34.05,-118.24,1785899443449,NULL);
INSERT INTO "visits" ("day","visitor","country","region","city","lat","lon","created_at","referrer") VALUES('2026-08-05','c99dc73e3a9f0b98b6b8afa34ecde821','US','California','Los Angeles',34.05,-118.24,1785901792908,NULL);
INSERT INTO "visits" ("day","visitor","country","region","city","lat","lon","created_at","referrer") VALUES('2026-08-05','4ebbbe369025702b3ea031f8410aa148','SG',NULL,'Singapore',1.29,103.85,1785903331676,NULL);
CREATE TABLE daily (
  day TEXT    NOT NULL PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "daily" ("day","n") VALUES('2026-08-05',3);
CREATE TABLE referrers (
  host TEXT    NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE hourly (
  hour INTEGER NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "hourly" ("hour","n") VALUES(3,2);
INSERT INTO "hourly" ("hour","n") VALUES(4,1);
CREATE TABLE places (
  lat     REAL    NOT NULL,
  lon     REAL    NOT NULL,
  country TEXT    NOT NULL DEFAULT '',
  region  TEXT    NOT NULL DEFAULT '',
  city    TEXT    NOT NULL DEFAULT '',
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (lat, lon, country, region, city)
);
INSERT INTO "places" ("lat","lon","country","region","city","n") VALUES(1.29,103.85,'SG','','Singapore',1);
INSERT INTO "places" ("lat","lon","country","region","city","n") VALUES(34.05,-118.24,'US','California','Los Angeles',2);
