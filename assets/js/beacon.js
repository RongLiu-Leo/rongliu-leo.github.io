/**
 * Pageview beacon, shared by every page on rongliu-leo.github.io.
 *
 * Project pages include only this file, so the endpoint and the logic stay in
 * one place and never need editing across repositories:
 *
 *   <script src="https://rongliu-leo.github.io/assets/js/beacon.js" defer></script>
 *
 * Records one view per page load. Nothing identifying is sent — the request
 * carries the path, the page title, and wherever the visitor came from.
 */
window.VisitorBeacon = (function () {
  "use strict";

  var ENDPOINT = "https://visitor-map.rong-leo-827.workers.dev";

  function record() {
    var local =
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
    if (local) return Promise.resolve(null);

    var url =
      ENDPOINT + "/hit?page=" + encodeURIComponent(location.pathname.slice(0, 200));
    if (document.title) url += "&title=" + encodeURIComponent(document.title.slice(0, 120));
    // document.referrer is the only place the real referrer is available; the
    // Referer header on this request would just name our own page.
    if (document.referrer) url += "&ref=" + encodeURIComponent(document.referrer.slice(0, 500));

    return fetch(url, { method: "POST", keepalive: true })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  // Kept as a promise so the footer map can mark where the current visitor is
  // without recording a second view.
  return { endpoint: ENDPOINT, recorded: record() };
})();
