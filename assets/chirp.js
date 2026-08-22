/* ==========================================================================
   Research page signature: a strain trace full of detector noise, with the
   recovered chirp drawing itself across the top of it. Plain 2D canvas.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("chirp-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = getComputedStyle(document.documentElement);
  var TEAL = css.getPropertyValue("--teal").trim() || "#94e2d5";
  var DIM = css.getPropertyValue("--s1").trim() || "#45475a";
  var SAPPHIRE = css.getPropertyValue("--sapphire").trim() || "#74c7ec";

  var W = 0, H = 0, dpr = 1;
  var clean = [], noisy = [];
  var MERGE = 0.74;          // where the two bodies merge, as a fraction of width
  var N = 0;

  function build() {
    N = Math.max(240, Math.floor(W));
    clean = new Array(N);
    noisy = new Array(N);

    var phase = 0;
    for (var i = 0; i < N; i++) {
      var x = i / (N - 1);
      var amp, step;

      if (x < MERGE) {
        var tau = (MERGE - x) / MERGE;               // 1 at the start, 0 at merger
        tau = Math.max(tau, 0.006);
        amp = Math.min(1, 0.17 * Math.pow(tau, -0.28));
        step = Math.min(0.36, 0.12 * Math.pow(tau, -0.375));
      } else {
        var d = (x - MERGE) / (1 - MERGE);           // ringdown
        amp = Math.exp(-d * 7.5);
        step = 0.36;
      }
      phase += step;
      clean[i] = Math.sin(phase) * amp;
    }

    // detector noise: a few smoothed random walks stacked together
    var walk = 0;
    for (var j = 0; j < N; j++) {
      walk = walk * 0.72 + (Math.random() - 0.5) * 0.9;
      var fast = (Math.random() - 0.5) * 0.42;
      noisy[j] = clean[j] * 0.45 + walk * 0.34 + fast;
    }
  }

  function resize() {
    var box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = box.width; H = box.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function line(data, from, to, color, width, glow, scale) {
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.shadowBlur = glow;
    ctx.shadowColor = glow ? color : "transparent";
    for (var i = from; i <= to && i < N; i++) {
      var x = (i / (N - 1)) * W;
      var y = H / 2 - data[i] * (H * scale);
      if (i === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function draw(p) {
    ctx.clearRect(0, 0, W, H);

    // baseline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(69,71,90,.5)";
    ctx.lineWidth = 1;
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
    ctx.stroke();

    // raw strain, always present
    line(noisy, 0, N - 1, DIM, 1, 0, 0.3);

    // recovered waveform, drawing left to right
    var head = Math.floor(p * (N - 1));
    line(clean, 0, head, TEAL, 2, 10, 0.34);

    if (head > 0 && head < N - 1) {
      var hx = (head / (N - 1)) * W;
      var hy = H / 2 - clean[head] * (H * 0.34);
      ctx.beginPath();
      ctx.fillStyle = SAPPHIRE;
      ctx.shadowBlur = 12; ctx.shadowColor = SAPPHIRE;
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  var start = null;
  var CYCLE = 4200, HOLD = 1600;

  function tick(ts) {
    if (start === null) start = ts;
    var elapsed = (ts - start) % (CYCLE + HOLD);
    var p = elapsed < CYCLE ? elapsed / CYCLE : 1;
    draw(p * p * (3 - 2 * p));   // ease
    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", function () { resize(); if (reduced) draw(1); });
  resize();

  if (reduced) draw(1);
  else requestAnimationFrame(tick);
})();
