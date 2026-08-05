-- Recomputes every rollup from the raw visits table. Safe to run at any time;
-- use it after restoring a backup, or if the counters ever drift from reality.
DELETE FROM places;
DELETE FROM daily;
DELETE FROM referrers;

INSERT INTO places (lat, lon, country, city, n)
SELECT lat, lon, COALESCE(country, ''), COALESCE(city, ''), COUNT(*)
  FROM visits
 WHERE lat IS NOT NULL AND lon IS NOT NULL
 GROUP BY lat, lon, COALESCE(country, ''), COALESCE(city, '');

INSERT INTO daily (day, n)
SELECT day, COUNT(*) FROM visits GROUP BY day;

INSERT INTO referrers (host, n)
SELECT referrer, COUNT(*)
  FROM visits
 WHERE referrer IS NOT NULL AND referrer <> ''
 GROUP BY referrer;
