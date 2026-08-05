/**
 * Visitors page: reads /stats from the visitor-map Worker and renders the
 * summary cards, the world map, the ranked breakdowns, and the traffic charts.
 *
 * Everything here is derived from the four rollup tables the Worker returns;
 * nothing is fetched from a third party.
 */
(function () {
  "use strict";

  var ACCENT = "#990000";
  var AXIS = "#c8ccd2";
  var GRID = "#eceef1";
  var MUTED = "#8a8f96";
  var TREND = "rgba(43, 51, 63, 0.5)";
  var FONT = '11px Roboto, "Helvetica Neue", Arial, sans-serif';

  var DAY_MS = 86400000;
  var CHART_DAYS = 90;
  var ROLLING = 7;
  var TOP_ROWS = 8;
  var WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  var root = document.getElementById("visitors");
  if (!root || !window.WorldMap || !window.WorldMap.available) return;

  var endpoint = (root.getAttribute("data-endpoint") || "").replace(/\/+$/, "");
  var status = root.querySelector(".visitors-status");
  var mapCanvas = root.querySelector(".visitors-map-canvas");
  var mapTooltip = root.querySelector(".visitors-map-tooltip");

  var regionNames = null;
  try {
    regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch (e) {
    regionNames = null;
  }

  var points = [];
  var placed = [];
  var series = [];
  var redraws = [];

  function countryName(code) {
    if (!code) return "Unknown";
    if (!regionNames) return code;
    try {
      return regionNames.of(code) || code;
    } catch (e) {
      return code;
    }
  }

  /** Regional indicator pair; falls back to nothing where flags are unsupported. */
  function flag(code) {
    if (!code || code.length !== 2) return "";
    return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);
  }

  function withFlag(code, text) {
    var emoji = flag(code);
    return emoji ? emoji + " " + text : text;
  }

  function count(n) {
    return n.toLocaleString() + (n === 1 ? " visit" : " visits");
  }

  function dayKey(time) {
    return new Date(time).toISOString().slice(0, 10);
  }

  function formatDay(day, style) {
    return new Date(day + "T00:00:00Z").toLocaleDateString(undefined, {
      year: "numeric",
      month: style === "long" ? "long" : "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function setText(selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function stat(name, value, note) {
    setText(".stat-" + name, value);
    setText(".stat-" + name + "-note", note || "");
  }

  /**
   * The daily rollup only holds days that saw traffic, so gaps are filled in
   * before anything is charted or averaged.
   */
  function denseDaily(rows, since) {
    var counts = {};
    rows.forEach(function (row) {
      counts[row.day] = row.n;
    });

    var end = Date.now();
    var earliest = end - (CHART_DAYS - 1) * DAY_MS;
    var start = since ? Math.max(Date.parse(since + "T00:00:00Z"), earliest) : earliest;

    var out = [];
    for (var time = start; time <= end; time += DAY_MS) {
      var day = dayKey(time);
      out.push({ day: day, n: counts[day] || 0 });
    }
    return out;
  }

  function sumWindow(endOffset, days) {
    var last = Date.now() - endOffset * DAY_MS;
    var from = dayKey(last - (days - 1) * DAY_MS);
    var to = dayKey(last);
    return series.reduce(function (total, row) {
      return row.day >= from && row.day <= to ? total + row.n : total;
    }, 0);
  }

  function trend(current, previous, label) {
    if (!previous) return current ? "no earlier data" : "";
    var change = Math.round(((current - previous) / previous) * 100);
    return (change > 0 ? "+" : "") + change + "% vs previous " + label;
  }

  function rollingAverage(values, window) {
    var out = [];
    var running = 0;
    for (var i = 0; i < values.length; i++) {
      running += values[i];
      if (i >= window) running -= values[i - window];
      out.push(running / Math.min(i + 1, window));
    }
    return out;
  }

  /* ---------------------------------------------------------------- charts */

  function drawBars(canvas, bars, options) {
    var width = canvas.parentNode.clientWidth;
    if (!width || !bars.length) return [];

    var height = options.height || 170;
    var dpr = window.devicePixelRatio || 1;
    var ctx = canvas.getContext("2d");
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var top = 20;
    var bottom = height - 20;
    var plotHeight = bottom - top;
    var step = width / bars.length;
    // The cap keeps a single day of history from drawing one huge slab.
    var barWidth = Math.max(1, Math.min(step - 1, step * 0.72, 44));
    var peak = bars.reduce(function (most, bar) {
      return Math.max(most, bar.value);
    }, 0);
    var scale = peak ? plotHeight / peak : 0;

    ctx.font = FONT;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(width, top + 0.5);
    ctx.stroke();

    if (peak) {
      ctx.fillStyle = MUTED;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(options.peak ? options.peak(peak) : String(peak), 0, top - 4);
    }

    ctx.strokeStyle = AXIS;
    ctx.beginPath();
    ctx.moveTo(0, bottom + 0.5);
    ctx.lineTo(width, bottom + 0.5);
    ctx.stroke();

    var placedBars = [];
    ctx.fillStyle = ACCENT;
    bars.forEach(function (bar, i) {
      var left = i * step;
      var size = bar.value ? Math.max(2, bar.value * scale) : 0;
      if (size) ctx.fillRect(left + (step - barWidth) / 2, bottom - size, barWidth, size);
      placedBars.push({ from: left, to: left + step, x: left + step / 2, y: bottom - size, tip: bar.tip });
    });

    if (options.line && peak) {
      ctx.strokeStyle = TREND;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      options.line.forEach(function (value, i) {
        var x = i * step + step / 2;
        var y = bottom - value * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Ticks are skipped rather than overlapped when the bars get narrow.
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var occupied = -Infinity;
    bars.forEach(function (bar, i) {
      if (!bar.tick) return;
      var textWidth = ctx.measureText(bar.tick).width;
      var x = i * step + step / 2;
      if (x - textWidth / 2 < occupied + 6 || x + textWidth / 2 > width) return;
      ctx.fillText(bar.tick, x, bottom + 6);
      occupied = x + textWidth / 2;
    });

    return placedBars;
  }

  function attachChartTooltip(canvas, tooltip, getBars) {
    if (!tooltip) return;

    canvas.addEventListener("mousemove", function (event) {
      var bars = getBars();
      if (!bars.length) return;
      var box = canvas.getBoundingClientRect();
      var x = event.clientX - box.left;

      var hit = null;
      for (var i = 0; i < bars.length; i++) {
        if (x >= bars[i].from && x < bars[i].to) {
          hit = bars[i];
          break;
        }
      }
      if (!hit) {
        tooltip.hidden = true;
        return;
      }

      tooltip.textContent = hit.tip;
      tooltip.hidden = false;
      tooltip.style.left = Math.min(Math.max(hit.x, 60), box.width - 60) + "px";
      tooltip.style.top = hit.y + "px";
    });

    canvas.addEventListener("mouseleave", function () {
      tooltip.hidden = true;
    });
  }

  function addChart(canvas, bars, options) {
    if (!canvas) return;
    var placedBars = [];
    function render() {
      placedBars = drawBars(canvas, bars, options);
    }
    attachChartTooltip(canvas, canvas.parentNode.querySelector(".visitors-chart-tooltip"), function () {
      return placedBars;
    });
    redraws.push(render);
    render();
  }

  /* ----------------------------------------------------------- bar lists */

  function fillBars(name, items, total, emptyText) {
    var list = root.querySelector("." + name);
    var button = root.querySelector('.visitors-more[data-list="' + name + '"]');
    if (!list) return;

    list.innerHTML = "";
    if (button) button.hidden = true;

    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "visitors-bar-empty";
      empty.textContent = emptyText;
      list.appendChild(empty);
      return;
    }

    var most = items[0].n;
    items.forEach(function (item, index) {
      var li = document.createElement("li");
      if (item.muted) li.className = "is-muted";
      if (item.title) li.title = item.title;
      if (index >= TOP_ROWS) li.hidden = true;

      var label = document.createElement("span");
      label.className = "visitors-bar-label";
      label.textContent = item.label;

      var value = document.createElement("span");
      value.className = "visitors-bar-value";
      value.textContent = item.n.toLocaleString();
      if (total) {
        var share = document.createElement("span");
        share.className = "visitors-bar-share";
        share.textContent = Math.round((item.n / total) * 100) + "%";
        value.appendChild(share);
      }

      var track = document.createElement("span");
      track.className = "visitors-bar-track";
      var fill = document.createElement("span");
      fill.className = "visitors-bar-fill";
      fill.style.width = (most ? (item.n / most) * 100 : 0) + "%";
      track.appendChild(fill);

      li.appendChild(label);
      li.appendChild(value);
      li.appendChild(track);
      list.appendChild(li);
    });

    if (button && items.length > TOP_ROWS) {
      button.hidden = false;
      button.textContent = "Show all " + items.length;
      button.onclick = function () {
        var expanded = button.getAttribute("aria-expanded") === "true";
        Array.prototype.forEach.call(list.children, function (li, index) {
          li.hidden = expanded && index >= TOP_ROWS;
        });
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
        button.textContent = expanded ? "Show all " + items.length : "Show fewer";
      };
    }
  }

  /* ------------------------------------------------------------- rendering */

  function drawMap() {
    var width = mapCanvas.parentNode.clientWidth;
    if (!width) return;
    placed = window.WorldMap.draw(mapCanvas, width, points, null);
  }

  function summary(data) {
    var visits = data.visits || 0;
    var days = series.length || 1;
    var busiest = series.reduce(
      function (best, row) {
        return row.n > best.n ? row : best;
      },
      { day: null, n: 0 }
    );
    var average = visits / days;
    var top = (data.byCountry || [])[0];

    stat("visits", visits.toLocaleString(), data.since ? "since " + formatDay(data.since) : "");
    stat(
      "countries",
      (data.countries || 0).toLocaleString(),
      top ? "led by " + countryName(top.country) : ""
    );
    stat(
      "cities",
      (data.cityCount || (data.cities || []).length).toLocaleString(),
      data.regionCount ? data.regionCount.toLocaleString() + (data.regionCount === 1 ? " region" : " regions") : ""
    );
    stat(
      "average",
      average >= 10 ? Math.round(average).toLocaleString() : average.toFixed(1),
      "over " + days + (days === 1 ? " day" : " days")
    );
    stat("today", sumWindow(0, 1).toLocaleString(), "so far, UTC");
    stat("week", sumWindow(0, 7).toLocaleString(), trend(sumWindow(0, 7), sumWindow(7, 7), "7 days"));
    stat("month", sumWindow(0, 30).toLocaleString(), trend(sumWindow(0, 30), sumWindow(30, 30), "30 days"));
    stat("peak", busiest.n.toLocaleString(), busiest.day && busiest.n ? "on " + formatDay(busiest.day) : "");

    setText(".stat-since", data.since ? formatDay(data.since, "long") : "\u2014");
  }

  function breakdowns(data) {
    var total = data.visits || 0;

    fillBars(
      "visitors-countries",
      (data.byCountry || []).map(function (item) {
        return {
          label: withFlag(item.country, countryName(item.country)),
          n: item.n,
          title: countryName(item.country) + " \u00b7 " + count(item.n),
        };
      }),
      total,
      "No visits recorded yet."
    );

    var regions = data.regions;
    if (regions) {
      fillBars(
        "visitors-regions",
        regions.map(function (item) {
          return {
            label: withFlag(item.country, item.region),
            n: item.n,
            title: item.region + ", " + countryName(item.country) + " \u00b7 " + count(item.n),
          };
        }),
        total,
        "No regions recorded yet."
      );
    } else {
      hide(".visitors-regions-block");
    }

    fillBars(
      "visitors-cities",
      (data.cities || []).map(function (item) {
        var place = [item.city, item.region, countryName(item.country)].filter(Boolean).join(", ");
        return {
          label: withFlag(item.country, item.city),
          n: item.n,
          title: place + " \u00b7 " + count(item.n),
        };
      }),
      total,
      "No cities recorded yet."
    );

    // A visit with no referrer arrived directly, so whatever the referrer
    // rollup does not account for is direct or stripped traffic.
    var referrers = (data.referrers || []).map(function (item) {
      return { label: item.host, n: item.n, title: item.host + " \u00b7 " + count(item.n) };
    });
    var referred = referrers.reduce(function (sum, item) {
      return sum + item.n;
    }, 0);
    var direct = Math.max(0, total - referred);
    if (direct) {
      referrers.push({
        label: "Direct or unknown",
        n: direct,
        muted: true,
        title: "Typed the address, used a bookmark, or came from a source that sends no referrer",
      });
    }
    referrers.sort(function (a, b) {
      return b.n - a.n;
    });

    fillBars("visitors-referrers", referrers, total, "No referrals yet.");
  }

  function timeCharts(data) {
    var values = series.map(function (row) {
      return row.n;
    });

    var caption =
      "Visits per day " +
      (series.length >= CHART_DAYS ? "over the last " + CHART_DAYS + " days" : "since " + formatDay(series[0].day)) +
      ".";
    if (series.length > ROLLING) caption += " The line is a seven-day average.";
    setText(".visitors-daily-caption", caption);

    addChart(
      root.querySelector(".visitors-daily-canvas"),
      series.map(function (row) {
        var date = new Date(row.day + "T00:00:00Z");
        return {
          value: row.n,
          tick: date.getUTCDate() === 1 ? formatMonth(date) : null,
          tip: formatDay(row.day) + " \u00b7 " + count(row.n),
        };
      }),
      {
        height: 180,
        line: series.length > ROLLING ? rollingAverage(values, ROLLING) : null,
        peak: function (value) {
          return "peak " + value + "/day";
        },
      }
    );

    if (data.hours) {
      var hours = new Array(24).fill(0);
      data.hours.forEach(function (row) {
        if (row.hour >= 0 && row.hour < 24) hours[row.hour] = row.n;
      });
      addChart(
        root.querySelector(".visitors-hours-canvas"),
        hours.map(function (value, hour) {
          return {
            value: value,
            tick: hour % 3 === 0 ? pad(hour) : null,
            tip: pad(hour) + ":00\u2013" + pad((hour + 1) % 24) + ":00 UTC \u00b7 " + count(value),
          };
        }),
        { height: 150 }
      );
    } else {
      hide(".visitors-hours-block");
      var weekdayBlock = root.querySelector(".visitors-weekdays-block");
      if (weekdayBlock) weekdayBlock.className = weekdayBlock.className.replace("col-md-6", "col-md-12");
    }

    var weekdays = new Array(7).fill(0);
    series.forEach(function (row) {
      var index = (new Date(row.day + "T00:00:00Z").getUTCDay() + 6) % 7;
      weekdays[index] += row.n;
    });
    addChart(
      root.querySelector(".visitors-weekdays-canvas"),
      weekdays.map(function (value, index) {
        return {
          value: value,
          tick: WEEKDAYS[index].slice(0, 3),
          tip: WEEKDAYS[index] + "s \u00b7 " + count(value),
        };
      }),
      { height: 150 }
    );
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function formatMonth(date) {
    return date.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  }

  function hide(selector) {
    var node = root.querySelector(selector);
    if (node) node.hidden = true;
  }

  function apply(data) {
    points = data.points || [];
    series = denseDaily(data.daily || [], data.since);

    summary(data);
    breakdowns(data);

    status.hidden = true;
    root.querySelector(".visitors-body").hidden = false;

    // Charts size themselves from their container, so they can only be drawn
    // once the body above is no longer hidden.
    drawMap();
    timeCharts(data);
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      drawMap();
      redraws.forEach(function (render) {
        render();
      });
    }, 150);
  });

  window.WorldMap.attachTooltip(
    mapCanvas,
    mapTooltip,
    function () {
      return placed;
    },
    12
  );

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
