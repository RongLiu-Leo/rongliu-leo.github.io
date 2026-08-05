PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE daily (
  day TEXT    NOT NULL PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "daily" ("day","n") VALUES('2026-08-05',39);
CREATE TABLE referrers (
  host TEXT    NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "referrers" ("host","n") VALUES('scholar.google.com',1);
CREATE TABLE hourly (
  hour INTEGER NOT NULL PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "hourly" ("hour","n") VALUES(3,2);
INSERT INTO "hourly" ("hour","n") VALUES(4,1);
INSERT INTO "hourly" ("hour","n") VALUES(7,27);
INSERT INTO "hourly" ("hour","n") VALUES(8,9);
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
INSERT INTO "places" ("lat","lon","country","region","city","n") VALUES(34.05,-118.24,'US','California','Los Angeles',38);
CREATE TABLE views (
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
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785899443449);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785901792908);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','SG',NULL,'Singapore',1.29,103.85,NULL,1785903331676);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785914312648);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785914317029);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785914319795);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914322727);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785914373736);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914379292);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914381667);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914382353);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914382853);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914383453);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785914384942);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914385999);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914386706);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914387240);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785914418043);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785914420864);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,'scholar.google.com',1785914831423);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785915714067);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785915724325);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785915949766);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785916301056);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785916303040);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785916310543);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785916423421);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785916427510);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785916625852);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785916771532);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785916817490);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785916922549);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785916935369);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785917095265);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785917100919);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/','US','California','Los Angeles',34.05,-118.24,NULL,1785917272150);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785917320355);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors','US','California','Los Angeles',34.05,-118.24,NULL,1785917335177);
INSERT INTO "views" ("day","page","country","region","city","lat","lon","referrer","created_at") VALUES('2026-08-05','/visitors.html','US','California','Los Angeles',34.05,-118.24,NULL,1785917389698);
CREATE TABLE pages (
  page  TEXT    NOT NULL PRIMARY KEY,
  title TEXT    NOT NULL DEFAULT '',
  n     INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "pages" ("page","title","n") VALUES('/','Rong Liu | PhD Student | University of Southern California',20);
INSERT INTO "pages" ("page","title","n") VALUES('/visitors.html','Visitors | Rong Liu',18);
INSERT INTO "pages" ("page","title","n") VALUES('/visitors','Visitors | Rong Liu',1);
CREATE TABLE page_daily (
  day  TEXT    NOT NULL,
  page TEXT    NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
);
INSERT INTO "page_daily" ("day","page","n") VALUES('2026-08-05','/',20);
INSERT INTO "page_daily" ("day","page","n") VALUES('2026-08-05','/visitors.html',18);
INSERT INTO "page_daily" ("day","page","n") VALUES('2026-08-05','/visitors',1);
CREATE TABLE page_places (
  page    TEXT    NOT NULL,
  lat     REAL    NOT NULL,
  lon     REAL    NOT NULL,
  country TEXT    NOT NULL DEFAULT '',
  region  TEXT    NOT NULL DEFAULT '',
  city    TEXT    NOT NULL DEFAULT '',
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page, lat, lon, country, region, city)
);
INSERT INTO "page_places" ("page","lat","lon","country","region","city","n") VALUES('/',1.29,103.85,'SG','','Singapore',1);
INSERT INTO "page_places" ("page","lat","lon","country","region","city","n") VALUES('/',34.05,-118.24,'US','California','Los Angeles',19);
INSERT INTO "page_places" ("page","lat","lon","country","region","city","n") VALUES('/visitors.html',34.05,-118.24,'US','California','Los Angeles',18);
INSERT INTO "page_places" ("page","lat","lon","country","region","city","n") VALUES('/visitors',34.05,-118.24,'US','California','Los Angeles',1);
CREATE TABLE page_hourly (
  page TEXT    NOT NULL,
  hour INTEGER NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page, hour)
);
INSERT INTO "page_hourly" ("page","hour","n") VALUES('/',3,2);
INSERT INTO "page_hourly" ("page","hour","n") VALUES('/',4,1);
INSERT INTO "page_hourly" ("page","hour","n") VALUES('/',7,13);
INSERT INTO "page_hourly" ("page","hour","n") VALUES('/visitors.html',7,14);
INSERT INTO "page_hourly" ("page","hour","n") VALUES('/',8,4);
INSERT INTO "page_hourly" ("page","hour","n") VALUES('/visitors.html',8,4);
INSERT INTO "page_hourly" ("page","hour","n") VALUES('/visitors',8,1);
CREATE TABLE page_referrers (
  page TEXT    NOT NULL,
  host TEXT    NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page, host)
);
INSERT INTO "page_referrers" ("page","host","n") VALUES('/','scholar.google.com',1);
CREATE INDEX views_page ON views(page);
