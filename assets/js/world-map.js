/**
 * Dotted world map renderer shared by the footer widget and the visitors page.
 * Land geometry comes from world-mask.js, so nothing is fetched from a third
 * party at runtime.
 */
window.WorldMap = (function () {
  "use strict";

  var LAND_COLOR = "#d5d9df";
  var DOT_COLOR = "#990000";
  var YOU_COLOR = "#e6a700";
  var TAU = Math.PI * 2;

  // Dot sizes are tuned at this canvas width and scale with whatever the
  // caller asks for, so the same renderer suits the footer and the full page.
  var REFERENCE_WIDTH = 460;

  var mask = window.WORLD_LAND_MASK;
  var latSpan = mask ? mask.latMax - mask.latMin : 1;
  var landCells = null;

  function cells() {
    if (landCells) return landCells;
    var binary = atob(mask.bits);
    landCells = [];
    for (var i = 0; i < mask.w * mask.h; i++) {
      if ((binary.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1) {
        landCells.push([i % mask.w, Math.floor(i / mask.w)]);
      }
    }
    return landCells;
  }

  function project(lat, lon, width, height) {
    return {
      x: ((lon + 180) / 360) * width,
      y: ((mask.latMax - lat) / latSpan) * height,
    };
  }

  /**
   * Draws the map at the given CSS width and returns the screen position of
   * every plotted point, for hit testing.
   */
  function draw(canvas, width, points, you) {
    var height = Math.round(width / (360 / latSpan));
    var dpr = window.devicePixelRatio || 1;
    var ctx = canvas.getContext("2d");

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var land = cells();
    var cell = width / mask.w;
    var landRadius = Math.max(0.55, cell * 0.34);
    ctx.fillStyle = LAND_COLOR;
    for (var i = 0; i < land.length; i++) {
      ctx.beginPath();
      ctx.arc((land[i][0] + 0.5) * cell, ((land[i][1] + 0.5) * height) / mask.h, landRadius, 0, TAU);
      ctx.fill();
    }

    var scale = width / REFERENCE_WIDTH;
    var placed = [];
    ctx.fillStyle = DOT_COLOR;
    ctx.globalAlpha = 0.75;
    for (var j = 0; j < points.length; j++) {
      var point = points[j];
      var at = project(point.lat, point.lon, width, height);
      var radius = Math.min(6, 1.7 + Math.log(1 + point.n) * 0.85) * scale;
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius, 0, TAU);
      ctx.fill();
      placed.push({ x: at.x, y: at.y, point: point });
    }
    ctx.globalAlpha = 1;

    if (you && typeof you.lat === "number") {
      var mine = project(you.lat, you.lon, width, height);
      ctx.fillStyle = YOU_COLOR;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 3.6 * scale, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    return placed;
  }

  function label(point) {
    var place = [point.city, point.country].filter(Boolean).join(", ") || "Unknown location";
    return place + " \u00b7 " + point.n + (point.n === 1 ? " visit" : " visits");
  }

  /** Attaches a tooltip that follows the nearest plotted point under the cursor. */
  function attachTooltip(canvas, tooltip, getPlaced, radius) {
    var limit = (radius || 10) * (radius || 10);

    canvas.addEventListener("mousemove", function (event) {
      var placed = getPlaced();
      if (!placed || !placed.length) return;
      var box = canvas.getBoundingClientRect();
      var x = event.clientX - box.left;
      var y = event.clientY - box.top;

      var nearest = null;
      var best = limit;
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
    });

    canvas.addEventListener("mouseleave", function () {
      tooltip.hidden = true;
    });
  }

  return { draw: draw, project: project, label: label, attachTooltip: attachTooltip, available: !!mask };
})();
