/**
 * Footer visitor map. Records the visit, draws the dotted world map, and links
 * through to the full breakdown on visitors.html.
 */
(function () {
  "use strict";

  var MAX_WIDTH = 300;

  var root = document.getElementById("visitor-map");
  if (!root || !window.WorldMap || !window.WorldMap.available) return;

  var endpoint = (root.getAttribute("data-endpoint") || "").replace(/\/+$/, "");
  if (!endpoint || endpoint.indexOf("PASTE_") === 0) return;

  var canvas = root.querySelector(".visitor-map-canvas");
  var caption = root.querySelector(".visitor-map-caption");
  var tooltip = root.querySelector(".visitor-map-tooltip");

  var points = [];
  var you = null;
  var placed = [];

  function render() {
    var width = Math.min(root.clientWidth || MAX_WIDTH, MAX_WIDTH);
    if (!width) return;
    placed = window.WorldMap.draw(canvas, width, points, you);
  }

  function summarise(data) {
    if (!data.visits) return "";
    var text = data.visits.toLocaleString() + (data.visits === 1 ? " visit" : " visits");
    if (data.countries) {
      text += " from " + data.countries + (data.countries === 1 ? " country" : " countries");
    }
    if (data.since) {
      text += " since " + new Date(data.since + "T00:00:00Z").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    }
    return text;
  }

  function load() {
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";

    // document.referrer is the only place the real referrer is available; the
    // Referer header on this request would just name our own page.
    var hit = endpoint + "/hit";
    if (document.referrer) hit += "?ref=" + encodeURIComponent(document.referrer.slice(0, 500));

    var recorded = local
      ? Promise.resolve(null)
      : fetch(hit, { method: "POST", keepalive: true })
          .then(function (response) {
            return response.ok ? response.json() : null;
          })
          .catch(function () {
            return null;
          });

    return recorded
      .then(function (result) {
        you = result && result.you ? result.you : null;
        return fetch(endpoint + "/points");
      })
      .then(function (response) {
        if (!response.ok) throw new Error("points request failed");
        return response.json();
      })
      .then(function (data) {
        points = data.points || [];
        caption.textContent = summarise(data);
        root.hidden = false;
        render();
      })
      .catch(function () {
        root.hidden = true;
      });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  window.WorldMap.attachTooltip(canvas, tooltip, function () {
    return placed;
  });

  load();
})();
