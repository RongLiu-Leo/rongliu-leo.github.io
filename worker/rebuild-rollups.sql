-- Recomputes every rollup from the raw views table. Safe to run at any time;
-- use it after restoring a backup, or if the counters ever drift from reality.
DELETE FROM places;
DELETE FROM daily;
DELETE FROM hourly;
DELETE FROM page_daily;
DELETE FROM referrers;

INSERT INTO places (lat, lon, country, region, city, n)
SELECT lat, lon, COALESCE(country, ''), COALESCE(region, ''), COALESCE(city, ''), COUNT(*)
  FROM views
 WHERE lat IS NOT NULL AND lon IS NOT NULL
 GROUP BY lat, lon, COALESCE(country, ''), COALESCE(region, ''), COALESCE(city, '');

INSERT INTO daily (day, n)
SELECT day, COUNT(*) FROM views GROUP BY day;

INSERT INTO hourly (hour, n)
SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch') AS INTEGER), COUNT(*)
  FROM views
 GROUP BY 1;

INSERT INTO page_daily (day, page, n)
SELECT day, page, COUNT(*) FROM views GROUP BY day, page;

-- Titles live only in this rollup, so the counts are rewritten in place rather
-- than deleted and reinserted, and pages that no longer appear are dropped.
UPDATE pages SET n = 0;

INSERT INTO pages (page, n)
SELECT page, COUNT(*) FROM views WHERE true GROUP BY page
    ON CONFLICT(page) DO UPDATE SET n = excluded.n;

DELETE FROM pages WHERE n = 0;

INSERT INTO referrers (host, n)
SELECT referrer, COUNT(*)
  FROM views
 WHERE referrer IS NOT NULL AND referrer <> ''
 GROUP BY referrer;
