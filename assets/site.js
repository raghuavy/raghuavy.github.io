/* Shared behaviour for every page: sticky nav state, scroll reveal, and the
   motion preference (the light on the home page art and the slowly turning rays). */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var nav = document.querySelector(".nav");
  if (nav) {
    var stick = function () { nav.classList.toggle("is-stuck", window.scrollY > 24); };
    window.addEventListener("scroll", stick, { passive: true });
    stick();
  }

  var io = null;
  if ("IntersectionObserver" in window && !reduced) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () { el.classList.add("in"); }, Math.min(i * 70, 280));
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  }

  // Content injected later (see content.js) calls this to join the reveal.
  window.__reveal = function (root) {
    var scope = root || document;
    var risers = scope.querySelectorAll(".rise:not(.in)");
    if (!io) {
      risers.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    risers.forEach(function (el) { io.observe(el); });
  };

  window.__reveal(document);

  /* Motion: on unless the OS asks for reduced motion (then off, and site.css hides
     the toggle). The toggle on the home page is remembered for every page. Off stops
     the light on the hero art and the slowly turning rays (.motion-off in site.css). */
  var KEY = "avi-motion";
  function readPref() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function writePref(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var motionOn = !reduced && readPref() !== "off";
  var mbtn = document.getElementById("motionBtn");
  var mlabel = document.getElementById("motionLabel");
  function applyMotion(on, persist) {
    motionOn = on;
    document.documentElement.classList.toggle("motion-off", !on);
    if (mbtn) mbtn.setAttribute("aria-pressed", String(!on));
    if (mlabel) mlabel.textContent = on ? "Pause motion" : "Play motion";
    if (persist) writePref(on ? "on" : "off");
  }
  if (mbtn) mbtn.addEventListener("click", function () { applyMotion(!motionOn, true); });
  applyMotion(motionOn, false);
})();
