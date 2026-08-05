/**
 * Visitors page: full map, country and city breakdowns, referrers, and a
 * daily traffic chart. Reads the /stats endpoint of the visitor-map Worker.
 */
(function () {
  "use strict";

  var BAR_COLOR = "#990000";
  var AXIS_COLOR = "#c8ccd2";

  var root = document.getElementById("visitors");
  if (!root || !window.WorldMap || !window.WorldMap.available) return;

  var endpoint = (root.getAttribute("data-endpoint") || "").replace(/\/+$/, "");
  var mapCanvas = root.querySelector(".visitors-map-canvas");
  var tooltip = root.querySelector(".visitors-map-tooltip");
  var chartCanvas = root.querySelector(".visitors-chart-canvas");
  var status = root.querySelector(".visitors-status");

  var regionNames = null;
  try {
    regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch (e) {
    regionNames = null;
  }

  var points = [];
  var placed = [];
  var daily = [];

  function countryName(code) {
    if (!code) return "Unknown";
    if (regionNames) {
      try {
        return regionNames.of(code) || code;
      } catch (e) {
        return code;
      }
    }
    return code;
  }

  /** Regional indicator pair; falls back to plain letters where flags are unsupported. */
  function flag(code) {
    if (!code || code.length !== 2) return "";
    return String.fromCodePoint(
      0x1f1e6 + code.charCodeAt(0) - 65,
      0x1f1e6 + code.charCodeAt(1) - 65
    );
  }

  function setText(selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function sumSince(days) {
    var cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
    var from = cutoff.toISOString().slice(0, 10);
    return daily.reduce(function (total, row) {
      return row.day >= from ? total + row.n : total;
    }, 0);
  }

  function fillTable(selector, rows, render, emptyText) {
    var body = root.querySelector(selector);
    if (!body) return;
    body.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "visitors-empty";
      cell.textContent = emptyText;
      empty.appendChild(cell);
      body.appendChild(empty);
      return;
    }
    rows.forEach(function (row) {
      body.appendChild(render(row));
    });
  }

  function row(cells) {
    var tr = document.createElement("tr");
    cells.forEach(function (value, index) {
      var td = document.createElement("td");
      td.textContent = value;
      if (index > 0) td.className = "visitors-number";
      tr.appendChild(td);
    });
    return tr;
  }

  function drawMap() {
    var width = mapCanvas.parentNode.clientWidth;
    if (!width) return;
    placed = window.WorldMap.draw(mapCanvas, width, points, null);
  }

  function drawChart() {
    if (!daily.length) return;
    var width = chartCanvas.parentNode.clientWidth;
    if (!width) return;

    var height = 160;
    var dpr = window.devicePixelRatio || 1;
    var ctx = chartCanvas.getContext("2d");
    chartCanvas.width = Math.round(width * dpr);
    chartCanvas.height = Math.round(height * dpr);
    chartCanvas.style.width = width + "px";
    chartCanvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var padding = { top: 10, right: 4, bottom: 22, left: 4 };
    var plotHeight = height - padding.top - padding.bottom;
    var plotWidth = width - padding.left - padding.right;
    var peak = Math.max.apply(
      null,
      daily.map(function (d) {
        return d.n;
      })
    );
    var step = plotWidth / daily.length;
    var barWidth = Math.max(1, step - 1);

    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + plotHeight + 0.5);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight + 0.5);
    ctx.stroke();

    ctx.fillStyle = BAR_COLOR;
    daily.forEach(function (d, i) {
      var barHeight = peak ? (d.n / peak) * plotHeight : 0;
      ctx.fillRect(
        padding.left + i * step,
        padding.top + plotHeight - barHeight,
        barWidth,
        Math.max(barHeight, d.n ? 1 : 0)
      );
    });

    ctx.fillStyle = "#8a8f96";
    ctx.font = "11px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textBaseline = "top";
    var first = daily[0].day;
    var last = daily[daily.length - 1].day;
    ctx.fillText(first, padding.left, padding.top + plotHeight + 6);
    var lastWidth = ctx.measureText(last).width;
    ctx.fillText(last, padding.left + plotWidth - lastWidth, padding.top + plotHeight + 6);

    ctx.textAlign = "left";
    ctx.fillText("peak " + peak + "/day", padding.left, padding.top - 4);
  }

  function apply(data) {
    points = data.points || [];
    daily = data.daily || [];

    setText(".stat-visits", (data.visits || 0).toLocaleString());
    setText(".stat-countries", (data.countries || 0).toLocaleString());
    setText(".stat-today", sumSince(1).toLocaleString());
    setText(".stat-week", sumSince(7).toLocaleString());
    setText(".stat-month", sumSince(30).toLocaleString());
    setText(
      ".stat-since",
      data.since
        ? new Date(data.since + "T00:00:00Z").toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })
        : "\u2014"
    );

    var total = data.visits || 1;
    fillTable(
      ".visitors-countries",
      data.byCountry || [],
      function (item) {
        var share = ((item.n / total) * 100).toFixed(1) + "%";
        return row([(flag(item.country) + " " + countryName(item.country)).trim(), item.n.toLocaleString(), share]);
      },
      "No visits recorded yet."
    );

    fillTable(
      ".visitors-cities",
      data.cities || [],
      function (item) {
        return row([item.city + ", " + countryName(item.country), item.n.toLocaleString(), ""]);
      },
      "No visits recorded yet."
    );

    fillTable(
      ".visitors-referrers",
      data.referrers || [],
      function (item) {
        return row([item.host, item.n.toLocaleString(), ""]);
      },
      "No referrals yet \u2014 most visitors arrive directly or from sources that send no referrer."
    );

    status.hidden = true;
    root.querySelector(".visitors-body").hidden = false;
    drawMap();
    drawChart();
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      drawMap();
      drawChart();
    }, 150);
  });

  window.WorldMap.attachTooltip(mapCanvas, tooltip, function () {
    return placed;
  }, 12);

  fetch(endpoint + "/stats")
    .then(function (response) {
      if (!response.ok) throw new Error("stats request failed");
      return response.json();
    })
    .then(apply)
    .catch(function () {
      status.textContent = "Visitor statistics are unavailable right now.";
    });
})();
