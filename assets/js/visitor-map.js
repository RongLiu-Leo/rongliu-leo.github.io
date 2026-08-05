/**
 * Dotted world map of visitor locations, drawn on a canvas from data served by
 * the Cloudflare Worker in /worker. Land geometry comes from world-mask.js, so
 * nothing is loaded from a third party at runtime.
 */
(function () {
  "use strict";

  var LAND_COLOR = "#d5d9df";
  var DOT_COLOR = "#990000";
  var YOU_COLOR = "#e6a700";
  var MAX_WIDTH = 460;
  var HIT_RADIUS = 10;
  var TAU = Math.PI * 2;

  var root = document.getElementById("visitor-map");
  if (!root || !window.WORLD_LAND_MASK) return;

  var endpoint = (root.getAttribute("data-endpoint") || "").replace(/\/+$/, "");
  if (!endpoint || endpoint.indexOf("PASTE_") === 0) return;

  var mask = window.WORLD_LAND_MASK;
  var latSpan = mask.latMax - mask.latMin;
  var aspect = 360 / latSpan;

  var canvas = root.querySelector(".visitor-map-canvas");
  var caption = root.querySelector(".visitor-map-caption");
  var tooltip = root.querySelector(".visitor-map-tooltip");
  var ctx = canvas.getContext("2d");

  var landCells = decodeMask(mask);
  var points = [];
  var you = null;
  var placed = [];

  function decodeMask(m) {
    var binary = atob(m.bits);
    var cells = [];
    for (var i = 0; i < m.w * m.h; i++) {
      if ((binary.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1) {
        cells.push([i % m.w, Math.floor(i / m.w)]);
      }
    }
    return cells;
  }

  function project(lat, lon, width, height) {
    return {
      x: ((lon + 180) / 360) * width,
      y: ((mask.latMax - lat) / latSpan) * height,
    };
  }

  function draw() {
    var width = Math.min(root.clientWidth || MAX_WIDTH, MAX_WIDTH);
    if (!width) return;
    var height = Math.round(width / aspect);
    var dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var cell = width / mask.w;
    var landRadius = Math.max(0.55, cell * 0.34);
    ctx.fillStyle = LAND_COLOR;
    for (var i = 0; i < landCells.length; i++) {
      ctx.beginPath();
      ctx.arc((landCells[i][0] + 0.5) * cell, ((landCells[i][1] + 0.5) * height) / mask.h, landRadius, 0, TAU);
      ctx.fill();
    }

    placed = [];
    ctx.fillStyle = DOT_COLOR;
    for (var j = 0; j < points.length; j++) {
      var p = points[j];
      var at = project(p.lat, p.lon, width, height);
      var radius = Math.min(6, 1.7 + Math.log(1 + p.n) * 0.85);
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius, 0, TAU);
      ctx.fill();
      placed.push({ x: at.x, y: at.y, point: p });
    }
    ctx.globalAlpha = 1;

    if (you && typeof you.lat === "number") {
      var mine = project(you.lat, you.lon, width, height);
      ctx.fillStyle = YOU_COLOR;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 3.6, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  function label(point) {
    var place = [point.city, point.country].filter(Boolean).join(", ") || "Unknown location";
    return place + " \u00b7 " + point.n + (point.n === 1 ? " visit" : " visits");
  }

  function onMove(event) {
    if (!placed.length) return;
    var box = canvas.getBoundingClientRect();
    var x = event.clientX - box.left;
    var y = event.clientY - box.top;

    var nearest = null;
    var best = HIT_RADIUS * HIT_RADIUS;
    for (var i = 0; i < placed.length; i++) {
      var dx = placed[i].x - x;
      var dy = placed[i].y - y;
      var distance = dx * dx + dy * dy;
      if (distance < best) {
        best = distance;
        nearest = placed[i];
      }
    }

    if (!nearest) {
      tooltip.hidden = true;
      return;
    }
    tooltip.textContent = label(nearest.point);
    tooltip.hidden = false;
    tooltip.style.left = nearest.x + "px";
    tooltip.style.top = nearest.y + "px";
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

    var recorded = local
      ? Promise.resolve(null)
      : fetch(endpoint + "/hit", { method: "POST", keepalive: true })
          .then(function (response) {
            return response.ok ? response.json() : null;
          })
          .catch(function () {
            return null;
          });

    return recorded
      .then(function (hit) {
        you = hit && hit.you ? hit.you : null;
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
        draw();
      })
      .catch(function () {
        root.hidden = true;
      });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 150);
  });

  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", function () {
    tooltip.hidden = true;
  });

  load();
})();
