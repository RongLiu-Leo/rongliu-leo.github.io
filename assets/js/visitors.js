/**
 * Visitors page: reads /stats from the visitor-map Worker and renders the
 * summary cards, the world map, the ranked breakdowns, and the traffic charts.
 *
 * The same rendering runs for the whole site or for a single page — the Worker
 * returns one shape either way — so switching scope only swaps the payload.
 * Everything shown is derived from the rollup tables it returns; nothing is
 * fetched from a third party.
 */
(function () {
  "use strict";

  var ACCENT = "#990000";
  var AXIS = "#c8ccd2";
  var GRID = "#eceef1";
  var MUTED = "#8a8f96";
  var TREND = "rgba(43, 51, 63, 0.5)";
  var FONT = '13px Roboto, "Helvetica Neue", Arial, sans-serif';

  var DAY_MS = 86400000;
  var CHART_DAYS = 90;
  var ROLLING = 7;
  var TOP_ROWS = 8;
  var FEED_ROWS = 10;
  var PAGE_CARDS = 6;
  var WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  var root = document.getElementById("visitors");
  if (!root || !window.WorldMap || !window.WorldMap.available) return;

  var endpoint = (root.getAttribute("data-endpoint") || "").replace(/\/+$/, "");
  var status = root.querySelector(".visitors-status");
  var mapCanvas = root.querySelector(".visitors-map-canvas");
  var mapTooltip = root.querySelector(".visitors-map-tooltip");
  var select = root.querySelector(".visitors-scope");

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
  var pending = [];

  // "" is the whole site; anything else is a page path. Payloads are kept so
  // that flipping back to a scope already looked at costs nothing.
  var scope = "";
  var loaded = {};

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
    return n.toLocaleString() + (n === 1 ? " view" : " views");
  }

  /** Averages below ten keep a decimal, since rounding them loses the scale. */
  function formatAverage(value) {
    return value >= 10 ? Math.round(value).toLocaleString() : value.toFixed(1);
  }

  function dayKey(time) {
    return new Date(time).toISOString().slice(0, 10);
  }

  function formatDay(day) {
    return new Date(day + "T00:00:00Z").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
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

    var top = options.top != null ? options.top : 20;
    var bottom = height - (options.bottom != null ? options.bottom : 20);
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
    if (!tooltip) return null;

    function move(event) {
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
    }

    function leave() {
      tooltip.hidden = true;
    }

    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseleave", leave);
    return function () {
      tooltip.hidden = true;
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseleave", leave);
    };
  }

  function addChart(canvas, bars, options) {
    if (!canvas) return;
    // The fixed canvases are redrawn every time the scope changes, so the
    // listeners from the previous payload have to come off first.
    if (canvas.detachTooltip) canvas.detachTooltip();

    var placedBars = [];
    function render() {
      placedBars = drawBars(canvas, bars, options);
    }
    canvas.detachTooltip = attachChartTooltip(
      canvas,
      canvas.parentNode.querySelector(".visitors-chart-tooltip"),
      function () {
        return placedBars;
      }
    );
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

    attachMore(button, list, TOP_ROWS, items.length);
  }

  function attachMore(button, list, limit, total) {
    if (!button || total <= limit) return;
    button.hidden = false;
    button.textContent = "Show all " + total;
    button.setAttribute("aria-expanded", "false");
    button.onclick = function () {
      var expanded = button.getAttribute("aria-expanded") === "true";
      Array.prototype.forEach.call(list.children, function (li, index) {
        li.hidden = expanded && index >= limit;
      });
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      button.textContent = expanded ? "Show all " + total : "Show fewer";
    };
  }

  /* ---------------------------------------------------------------- feed */

  function relativeTime(at) {
    var seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (seconds < 45) return "just now";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
    var days = Math.round(hours / 24);
    if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
    return formatDay(dayKey(at));
  }

  function exactTime(at) {
    var date = new Date(at);
    return formatDay(dayKey(at)) + ", " + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + " UTC";
  }

  function cell(className, text, title) {
    var span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    if (title) span.title = title;
    return span;
  }

  /**
   * The raw log, newest first — the one part of the page that is not an
   * aggregate. Which page a view landed on is only worth a column when the
   * report covers the whole site.
   */
  function feed(data) {
    var list = root.querySelector(".visitors-feed");
    var button = root.querySelector(".visitors-feed-more");
    var rows = data.recent || [];
    if (!list) return;

    var labels = {};
    (data.pages || []).forEach(function (item) {
      labels[item.page] = pageLabel(item);
    });

    list.className = "visitors-feed" + (data.scope ? " is-scoped" : "");
    list.innerHTML = "";
    if (button) button.hidden = true;

    if (!rows.length) {
      var empty = document.createElement("li");
      empty.className = "visitors-bar-empty";
      empty.textContent = "Nothing recorded yet.";
      list.appendChild(empty);
      setText(".visitors-feed-caption", "");
      return;
    }

    rows.forEach(function (row, index) {
      var li = document.createElement("li");
      if (index >= FEED_ROWS) li.hidden = true;

      li.appendChild(cell("visitors-feed-when", relativeTime(row.created_at), exactTime(row.created_at)));
      if (!data.scope) {
        li.appendChild(cell("visitors-feed-page", labels[row.page] || row.page, row.page));
      }

      var place = [row.city, row.region, countryName(row.country)].filter(Boolean).join(", ");
      var where = row.city || (row.country ? countryName(row.country) : "");
      li.appendChild(cell("visitors-feed-where", where ? withFlag(row.country, where) : "Somewhere", place));

      li.appendChild(
        cell(
          "visitors-feed-source",
          row.referrer || "direct",
          row.referrer
            ? "Followed a link from " + row.referrer
            : "Typed the address, used a bookmark, or came from a source that sends no referrer"
        )
      );
      list.appendChild(li);
    });

    attachMore(button, list, FEED_ROWS, rows.length);
    setText(
      ".visitors-feed-caption",
      "The last " +
        rows.length +
        (data.scope ? " views of this page" : " views across the site") +
        ", newest first. Hover a time for the exact moment in UTC."
    );
  }

  /* --------------------------------------------------------------- pages */

  /**
   * Titles read like "Deformable Beta Splatting | Rong Liu", and only the
   * first part identifies the page.
   */
  function pageLabel(item) {
    if (item.page === "/") return "Home";
    return (item.title || "").split("|")[0].trim() || item.page;
  }

  function pagesSection(data) {
    var host = root.querySelector(".visitors-pages");
    var pages = data.pages || [];
    // Only the site-wide view compares pages; a scoped view is already about
    // one of them.
    toggle(".visitors-pages-section", !data.scope && pages.length > 0);
    if (!host || data.scope || !pages.length) return;

    host.innerHTML = "";

    // page_daily arrives as flat rows; the charts need one dense series per
    // page, aligned to the same days as the site-wide chart.
    var byPage = {};
    (data.pageDaily || []).forEach(function (row) {
      (byPage[row.page] = byPage[row.page] || {})[row.day] = row.n;
    });

    var total = data.views || 0;
    pages.slice(0, PAGE_CARDS).forEach(function (item) {
      var days = byPage[item.page] || {};
      host.appendChild(pageCard(item, total, days));
    });

    fillBars(
      "visitors-page-list",
      pages.slice(PAGE_CARDS).map(function (item) {
        return { label: pageLabel(item), n: item.n, title: item.page + " \u00b7 " + count(item.n) };
      }),
      total,
      ""
    );
    var rest = root.querySelector(".visitors-pages-rest");
    if (rest) rest.hidden = pages.length <= PAGE_CARDS;

    setText(
      ".visitors-pages-caption",
      "Views per page across the whole site, each chart covering the same " +
        series.length +
        (series.length === 1 ? " day" : " days") +
        " as the one above. Pick a page to see the rest of this report for it alone."
    );
  }

  function pageCard(item, total, days) {
    var card = document.createElement("div");
    card.className = "visitors-page-card";

    var title = document.createElement("button");
    title.type = "button";
    title.className = "visitors-page-title";
    title.textContent = pageLabel(item);
    title.title = "Show this report for " + item.page;
    title.onclick = function () {
      choose(item.page);
    };

    var path = document.createElement("span");
    path.className = "visitors-page-path";
    path.textContent = item.page;

    var value = document.createElement("span");
    value.className = "visitors-page-count";
    value.textContent = item.n.toLocaleString();
    if (total) {
      var share = document.createElement("span");
      share.className = "visitors-page-share";
      share.textContent = Math.round((item.n / total) * 100) + "% of all views";
      value.appendChild(share);
    }

    var chart = document.createElement("div");
    chart.className = "visitors-chart";
    var canvas = document.createElement("canvas");
    canvas.className = "visitors-page-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Daily views of " + pageLabel(item));
    var tip = document.createElement("div");
    tip.className = "visitors-chart-tooltip";
    tip.hidden = true;
    chart.appendChild(canvas);
    chart.appendChild(tip);

    card.appendChild(title);
    card.appendChild(path);
    card.appendChild(value);
    card.appendChild(chart);

    // Charts measure their container, so they are drawn once the card is in
    // the document rather than here.
    pending.push(function () {
      addChart(
        canvas,
        series.map(function (row) {
          var n = days[row.day] || 0;
          return { value: n, tip: formatDay(row.day) + " \u00b7 " + count(n) };
        }),
        {
          height: 72,
          top: 18,
          bottom: 6,
          peak: function (value) {
            return "peak " + value;
          },
        }
      );
    });

    return card;
  }

  /* ------------------------------------------------------------- rendering */

  function drawMap() {
    var width = mapCanvas.parentNode.clientWidth;
    if (!width) return;
    placed = window.WorldMap.draw(mapCanvas, width, points, null);
  }

  function summary(data) {
    var views = data.views || 0;
    var busiest = series.reduce(
      function (best, row) {
        return row.n > best.n ? row : best;
      },
      { day: null, n: 0 }
    );
    var pages = data.pages || [];
    var topCountry = (data.byCountry || [])[0];

    var perDay = series.length
      ? series.reduce(function (sum, row) {
          return sum + row.n;
        }, 0) / series.length
      : 0;

    stat(
      "views",
      views.toLocaleString(),
      perDay ? formatAverage(perDay) + " a day on average" : ""
    );

    // The second card is the one thing that differs by scope: site-wide it
    // counts the pages, and on a page it sizes that page against the site.
    if (data.scope) {
      var share = data.siteViews ? Math.round((views / data.siteViews) * 100) : 0;
      setText(".stat-pages-label", "of all views");
      stat("pages", share + "%", (data.siteViews || 0).toLocaleString() + " site-wide");
    } else {
      setText(".stat-pages-label", "pages");
      stat("pages", pages.length.toLocaleString(), pages.length ? "led by " + pageLabel(pages[0]) : "");
    }

    stat(
      "countries",
      (data.countries || 0).toLocaleString(),
      topCountry ? "led by " + countryName(topCountry.country) : ""
    );
    stat(
      "cities",
      (data.cityCount || (data.cities || []).length).toLocaleString(),
      data.regionCount ? data.regionCount.toLocaleString() + (data.regionCount === 1 ? " region" : " regions") : ""
    );
    stat("today", sumWindow(0, 1).toLocaleString(), "so far, UTC");
    stat("week", sumWindow(0, 7).toLocaleString(), trend(sumWindow(0, 7), sumWindow(7, 7), "7 days"));
    stat("month", sumWindow(0, 30).toLocaleString(), trend(sumWindow(0, 30), sumWindow(30, 30), "30 days"));
    stat("peak", busiest.n.toLocaleString(), busiest.day && busiest.n ? "on " + formatDay(busiest.day) : "");
  }

  function breakdowns(data) {
    var total = data.views || 0;

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
      "No views recorded yet."
    );

    var regions = data.regions;
    toggle(".visitors-regions-block", !!regions);
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

    // A view with no referrer arrived directly, so whatever the referrer
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
      series.length === 1
        ? "Views so far, on the only day on record."
        : "Views per day over the last " + series.length + " days.";
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

    // The weekday chart widens to fill the row when there is no hourly rollup
    // to sit beside it.
    var weekdayBlock = root.querySelector(".visitors-weekdays-block");
    toggle(".visitors-hours-block", !!data.hours);
    if (weekdayBlock) {
      weekdayBlock.className =
        "col-xs-12 visitors-weekdays-block " + (data.hours ? "col-md-6" : "col-md-12");
    }

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

  function toggle(selector, visible) {
    var node = root.querySelector(selector);
    if (node) node.hidden = !visible;
  }

  function render(data) {
    points = data.points || [];
    series = denseDaily(data.daily || [], data.since);
    redraws = [];
    pending = [];

    fillScopes(data);
    summary(data);
    pagesSection(data);
    breakdowns(data);
    feed(data);

    status.hidden = true;
    root.querySelector(".visitors-body").hidden = false;

    // Charts size themselves from their container, so they can only be drawn
    // once the body above is no longer hidden.
    drawMap();
    timeCharts(data);
    pending.forEach(function (start) {
      start();
    });
    pending = [];
  }

  /* ---------------------------------------------------------------- scope */

  function fillScopes(data) {
    if (!select) return;
    select.innerHTML = "";

    var all = document.createElement("option");
    all.value = "";
    all.textContent = "The whole site";
    select.appendChild(all);

    (data.pages || []).forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.page;
      option.textContent = pageLabel(item) + " \u2014 " + count(item.n);
      select.appendChild(option);
    });

    select.value = scope;
  }

  function load(next) {
    var key = next || "";
    if (loaded[key]) {
      scope = key;
      render(loaded[key]);
      return Promise.resolve(true);
    }

    if (select) select.disabled = true;
    return fetch(endpoint + "/stats" + (key ? "?page=" + encodeURIComponent(key) : ""))
      .then(function (response) {
        if (!response.ok) throw new Error("stats request failed");
        return response.json();
      })
      .then(function (data) {
        loaded[key] = data;
        scope = key;
        if (select) select.disabled = false;
        render(data);
        return true;
      })
      .catch(function () {
        if (select) select.disabled = false;
        // A page that is no longer tracked, or a link to one that never was,
        // falls back to the whole site rather than to an error.
        if (key) {
          if (select) select.value = scope;
          return load("");
        }
        status.textContent = "Visitor statistics are unavailable right now.";
        status.hidden = false;
        return false;
      });
  }

  function choose(value) {
    if (select) select.value = value;
    load(value).then(function (ok) {
      if (!ok || !window.history || !window.history.replaceState) return;
      window.history.replaceState(null, "", scope ? "#" + scope : location.pathname + location.search);
    });
  }

  if (select) {
    select.addEventListener("change", function () {
      choose(select.value);
    });
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

  // A page path in the fragment opens that page's report directly, so a scope
  // can be linked to.
  var requested = "";
  try {
    requested = decodeURIComponent(location.hash.replace(/^#/, ""));
  } catch (e) {
    requested = "";
  }
  load(requested.charAt(0) === "/" ? requested : "");
})();
