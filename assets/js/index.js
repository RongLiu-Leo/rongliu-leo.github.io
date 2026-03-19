function applyDarkModePreference() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add("dark");
  }
}

function initLazyVideoLoader() {
  var videos = document.querySelectorAll('video.lazy-video');
  if (!videos || videos.length === 0) return;

  // If IntersectionObserver is not available, fall back to loading all videos.
  if (!('IntersectionObserver' in window)) {
    videos.forEach(function (video) {
      var source = video.querySelector('source[data-src]');
      if (source && source.dataset && source.dataset.src && !source.src) {
        source.src = source.dataset.src;
      }
      video.load();
      video.play().catch(function () {});
    });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = entry.target;
      if (!(video instanceof HTMLVideoElement)) return;

      var isLoaded = video.dataset && video.dataset.loaded === "1";
      if (entry.isIntersecting) {
        if (!isLoaded) {
          var source = video.querySelector('source[data-src]');
          if (source && source.dataset && source.dataset.src) {
            source.src = source.dataset.src;
          }
          video.load();
          if (video.dataset) video.dataset.loaded = "1";
        }
        // Videos are muted; autoplay should generally be allowed.
        video.play().catch(function () {});
      } else {
        // Save CPU when scrolled away.
        if (isLoaded) video.pause();
      }
    });
  }, { rootMargin: "200px 0px", threshold: 0.01 });

  videos.forEach(function (video) {
    observer.observe(video);
  });
}

function init() {
  applyDarkModePreference();
  initLazyVideoLoader();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
