/**
 * Footer visitor map. Draws the dotted world map from the recorded places and
 * links through to the full breakdown on visitors.html. Counting the view is
 * beacon.js's job, so this file only reads.
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
    if (!data.views) return "";
    var text = data.views.toLocaleString() + (data.views === 1 ? " page view" : " page views");
    if (data.countries) {
      text += " from " + data.countries + (data.countries === 1 ? " country" : " countries");
    }
    return text;
  }

  function load() {
    // beacon.js already recorded this view; reusing its result marks where the
    // current visitor is without counting the page twice.
    var recorded =
      (window.VisitorBeacon && window.VisitorBeacon.recorded) || Promise.resolve(null);

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
