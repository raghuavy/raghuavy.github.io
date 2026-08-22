/* Shared behaviour for every page: sticky nav state and scroll reveal. */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var nav = document.querySelector(".nav");
  if (nav) {
    var stick = function () { nav.classList.toggle("is-stuck", window.scrollY > 24); };
    window.addEventListener("scroll", stick, { passive: true });
    stick();
  }

  var risers = document.querySelectorAll(".rise");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () { el.classList.add("in"); }, Math.min(i * 70, 280));
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    risers.forEach(function (el) { io.observe(el); });
  } else {
    risers.forEach(function (el) { el.classList.add("in"); });
  }
})();
