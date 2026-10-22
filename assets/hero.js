/* The living hero on the home page.

   The Hermes engraving is drawn every frame in WebGL2 so it plays like a
   film loop instead of sitting still:

   - a slow camera drift with real depth (the figure floats in front of the
     panel, the cables recede into space), plus a little cursor parallax
   - signals racing out along the cables and rods he holds, each on its own clock
   - lightning crawling through the veins of the panel, with a strike now and
     then that sends one pulse down every cable at once
   - a light moving over the silver, dust in the air, and film grain

   On wide screens the camera pulls back so both fans of cables are in shot,
   and the lower part of the art sinks into the dark under the text.

   Two textures drive it:
     hermes-hd.webp  the engraving, 5600 x 1396, AI upscaled from hermes.webp
     hermes-fx.png   R depth, G figure (above .5) or vein (below .5), B signal id
                     (1 to 199 the cable fans, 200 to 227 the rods in the chest
                     fist, 228 to 255 the rods in the right hands)
   The ids and the emitter points below were measured from the art, so if the
   art changes, the fx map has to be rebuilt with it.

   The still <picture> stays underneath as the poster and the fallback: no
   WebGL2, Save-Data on, or any error, and the page simply keeps the still.
   "Pause motion" (site.js) freezes the loop on the current frame. */
(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  var art = hero && hero.querySelector(".hero-art");
  var canvas = art && art.querySelector("canvas");
  var still = art && art.querySelector("img");
  if (!canvas) return;

  var IMG_W = 2800, IMG_H = 698;            // reference pixel space of the art
  var ASPECT = IMG_W / IMG_H;
  var FACE = [0.489, 0.25];                  // Hermes' face, in uv of the art
  var EMIT = {                               // where each set of lines starts, in uv
    left: [871 / IMG_W, 348 / IMG_H],        // the left fan of cables
    right: [1880 / IMG_W, 306 / IMG_H],      // the right fan
    chest: [1440 / IMG_W, 340 / IMG_H],      // rods in the fist at his chest
    hands: [1945 / IMG_W, 150 / IMG_H]       // rods running through the right hands
  };
  // how tall the art is on screen and where the face sits, for wide screens
  // (text on the left) and tall ones (text below). site.css mirrors these for
  // the still, so change both together.
  var LAYOUT = {
    wide: { artH: 0.8, face: [0.54, 0.195] },
    tall: { artH: 0.64, face: [0.5, 0.24] }
  };

  /* ---------- framing, shared by the still and the live view ----------
     Returns the part of the art on screen as [u, v, width, height] in uv. It
     runs past the bottom of the art, where the art has already faded into the
     page's black under the text. */
  function frame(w, h, zoom, driftX, driftY) {
    var va = w / h;
    var L = va > 1.15 ? LAYOUT.wide : LAYOUT.tall;
    var ey = 1 / (L.artH * zoom);
    var ex = ey * va / ASPECT;
    if (ex > 0.98 / zoom) { ex = 0.98 / zoom; ey = ex * ASPECT / va; }   // very wide screens
    var cx = FACE[0] - (L.face[0] - 0.5) * ex + driftX / IMG_W;
    var cy = FACE[1] - (L.face[1] - 0.5) * ey + driftY / IMG_H;
    cx = Math.min(Math.max(cx, ex / 2 + 0.006), 1 - ex / 2 - 0.006);
    if (ey < 1) cy = Math.min(Math.max(cy, ey / 2 + 0.012), 1 - ey / 2 - 0.012);
    return [cx - ex / 2, cy - ey / 2, ex, ey];
  }

  // line the still up with where the camera starts, so the swap is seamless
  function placeStill() {
    if (!still) return;
    var w = art.clientWidth, h = art.clientHeight;
    if (!w || !h) return;
    var v = frame(w, h, 1, 0, 0);
    var iw = w / v[2], ih = h / v[3];
    var s = still.style;
    s.width = iw.toFixed(1) + "px";
    s.height = ih.toFixed(1) + "px";
    s.left = (-v[0] * iw).toFixed(1) + "px";
    s.top = (-v[1] * ih).toFixed(1) + "px";
  }
  placeStill();
  // iOS can forget that the hero clips the fixed art after a rotation
  // (WebKit bug 221261); flipping its position for one frame repaints the clip
  var wasWide = window.innerWidth > window.innerHeight;
  window.addEventListener("resize", function () {
    placeStill();
    var wide = window.innerWidth > window.innerHeight;
    if (wide === wasWide) return;
    wasWide = wide;
    art.style.position = "absolute";
    requestAnimationFrame(function () { art.style.position = ""; });
  });

  /* ---------- bail out early where the live view is not wanted ---------- */
  var conn = navigator.connection;
  if (conn && conn.saveData) return;

  var gl = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false
    });
  } catch (e) { gl = null; }
  if (!gl) return;

  /* ---------- shaders ---------- */
  var VS = [
    "#version 300 es",
    "out vec2 vUv;",
    "void main(){",
    "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));",
    "  vUv = vec2(p.x, 1.0 - p.y);",
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FS = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "uniform sampler2D uImg;",
    "uniform sampler2D uFx;",
    "uniform vec2 uRes;",
    "uniform vec4 uView;",
    "uniform vec2 uPar;",
    "uniform vec2 uCam;",
    "uniform vec2 uLight;",
    "uniform vec2 uEmL;",
    "uniform vec2 uEmR;",
    "uniform vec2 uEmChest;",
    "uniform vec2 uEmHands;",
    "uniform vec2 uFlashPos;",
    "uniform float uTime;",
    "uniform float uFlash;",
    "uniform float uWave;",
    "uniform float uDim;",
    "uniform float uGrain;",
    "in vec2 vUv;",
    "out vec4 outColor;",
    "const vec2 IMG = vec2(2800.0, 698.0);",
    "const vec2 FXS = vec2(1400.0, 349.0);",
    "float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }",
    "float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }",
    "vec2 h22(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }",
    "float vnoise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);",
    "}",
    "void main(){",
    "  vec2 suv = uView.xy + vUv * uView.zw;",
    // 2.5D: find the texel whose depth-shifted position lands on this pixel
    "  vec2 par = uPar / IMG;",
    "  vec2 uv = suv;",
    "  for (int i = 0; i < 4; i++) { uv = suv - (texture(uFx, uv).r - 0.42) * par; }",
    "  uv.x = clamp(uv.x, 0.0005, 0.9995);",
    "  vec2 px = uv * IMG;",
    // the lower part of the art sinks into the dark under the text
    "  vec2 at = vec2(uv.x, clamp(uv.y, 0.0005, 0.9995));",
    "  float keep = (1.0 - smoothstep(0.58, 1.0, uv.y)) * smoothstep(-0.004, 0.03, uv.y);",
    "  vec3 fx = texture(uFx, at).rgb;",
    "  float depth = fx.r;",
    "  float figure = clamp(fx.g * 2.0 - 1.0, 0.0, 1.0);",
    "  float vein = clamp(1.0 - fx.g * 2.0, 0.0, 1.0);",
    "  float base = pow(texture(uImg, at).r, 1.15) * 0.9 * keep;",
    "  float glow = textureLod(uImg, at, 3.0).r * keep;",
    "  float halo = textureLod(uImg, at, 5.5).r * keep;",
    // signals racing out along the cables and rods, each on its own clock
    "  float id = floor(texelFetch(uFx, ivec2(at * FXS), 0).b * 255.0 + 0.5);",
    "  float sig = 0.0;",
    "  if (id > 0.5) {",
    "    vec2 em = id < 199.5 ? (uv.x < 0.5 ? uEmL : uEmR) : (id < 227.5 ? uEmChest : uEmHands);",
    "    float r = length(px - em * IMG);",
    "    float speed = 430.0 + 420.0 * h11(id * 3.71);",
    "    float period = 1350.0 / speed + 0.6 + 4.6 * h11(id * 5.13);",
    "    float tt = uTime + h11(id * 9.17) * period;",
    "    float k = floor(tt / period);",
    "    float head = 50.0 + (tt - k * period) * speed;",
    "    float dr = head - r;",
    "    float tail = 110.0 + 240.0 * h11(id * 2.31);",
    "    float s = (dr >= 0.0 ? exp(-dr / tail) : exp(dr / 6.0)) * step(h11(id * 1.37 + k * 7.31), 0.62);",
    "    if (uWave >= 0.0) {",
    "      float wd = uWave * 1150.0 - r;",
    "      s += (wd >= 0.0 ? exp(-wd / 240.0) : exp(wd / 9.0)) * exp(-uWave * 0.8) * 1.2;",
    "    }",
    "    sig = s * smoothstep(30.0, 110.0, r);",
    "  }",
    // lightning crawling through the veins, and the strikes
    "  float n = vnoise(px / 36.0 + vec2(uTime * 0.3, -uTime * 0.85));",
    "  float n2 = vnoise(px / 8.0 - vec2(uTime * 0.7, uTime * 3.1));",
    "  float crawl = smoothstep(0.6, 0.93, n) * (0.45 + 0.55 * n2);",
    "  float fd = length(px - uFlashPos * IMG) / 760.0;",
    "  float strike = uFlash * exp(-fd * fd);",
    // the silver: brightness read as relief, lit by a light that wanders
    "  vec2 e = 1.0 / FXS;",
    "  float hx = textureLod(uImg, at + vec2(e.x, 0.0), 2.5).r - textureLod(uImg, at - vec2(e.x, 0.0), 2.5).r;",
    "  float hy = textureLod(uImg, at + vec2(0.0, e.y), 2.5).r - textureLod(uImg, at - vec2(0.0, e.y), 2.5).r;",
    "  vec3 N = normalize(vec3(-hx * 2.4, -hy * 2.4, 1.0));",
    "  vec3 H = normalize(normalize(vec3(uLight, 0.8)) + vec3(0.0, 0.0, 1.0));",
    "  float spec = pow(max(dot(N, H), 0.0), 34.0) * figure * smoothstep(0.1, 0.55, glow);",
    // compose
    "  float c = base * (0.88 + 0.12 * depth);",
    "  c += sig * (smoothstep(0.03, 0.2, base) * 0.95 + glow * 1.9);",
    "  c += vein * (base * crawl * 1.15 + strike * (base * 3.2 + glow * 1.2));",
    "  c += strike * (0.2 * figure * base + 0.3 * halo);",
    "  c += spec * 0.45 + halo * 0.05;",
    "  c = c < 0.82 ? c : 0.82 + 0.18 * (1.0 - exp(-(c - 0.82) * 5.5));",
    // dust in three depths, drifting up, parallaxed with the camera
    "  float aspect = uRes.x / uRes.y;",
    "  vec2 sp0 = vec2(vUv.x * aspect, vUv.y);",
    "  float dust = 0.0;",
    "  for (int l = 0; l < 3; l++) {",
    "    float fl = float(l);",
    "    float sc = 6.0 + fl * 5.0;",
    "    vec2 sp = sp0 * sc + uCam * (0.03 + fl * 0.05) * sc + vec2(0.0, uTime * (0.02 + fl * 0.012) * sc);",
    "    vec2 cell = floor(sp);",
    "    vec2 rnd = h22(cell + fl * 37.0);",
    "    vec2 pos = 0.25 + 0.5 * rnd + 0.12 * vec2(sin(uTime * 0.37 + rnd.x * 6.283), cos(uTime * 0.29 + rnd.y * 6.283));",
    "    float size = (0.022 + 0.04 * h12(cell + 1.7 + fl)) * (1.0 + fl * 0.35);",
    "    float d = length(fract(sp) - pos) / size;",
    "    float tw = 0.45 + 0.55 * sin(uTime * (0.8 + rnd.y * 1.4) + rnd.x * 40.0);",
    "    dust += exp(-d * d) * tw * step(0.64, h12(cell + 4.3 + fl * 2.0)) * (0.1 + 0.09 * fl);",
    "  }",
    "  c += dust * (1.0 + 2.5 * uFlash);",
    // vignette, grain, and the page's black
    "  vec2 q = vUv - vec2(0.5, 0.42);",
    "  q.x *= min(aspect, 2.2) * 0.42;",
    "  c *= mix(0.6, 1.0, 1.0 - smoothstep(0.25, 1.0, length(q)));",
    "  float g = h12(gl_FragCoord.xy + fract(uTime * 13.7) * 917.0) - 0.5;",
    "  c += g * uGrain * (0.35 + 0.65 * c);",
    "  c = clamp(c, 0.0, 1.0) * uDim;",
    "  outColor = vec4(vec3(0.0196 + 0.9804 * c), 1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  var prog, U = {};
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    if (window.console) console.warn("hero: keeping the still image.", err);
    return;
  }
  ["uImg", "uFx", "uRes", "uView", "uPar", "uCam", "uLight", "uEmL", "uEmR", "uEmChest", "uEmHands",
   "uFlashPos", "uTime", "uFlash", "uWave", "uDim", "uGrain"].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });
  gl.bindVertexArray(gl.createVertexArray());

  /* ---------- textures ---------- */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.decoding = "async";
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error("hero: could not load " + src)); };
      im.src = src;
    });
  }

  function upload(unit, source, internal, format, mips) {
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mips) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return t;
  }

  // GPUs with a 4096 texture limit get the art scaled to fit
  function fitToGPU(im) {
    var max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (im.naturalWidth <= max) return im;
    var c = document.createElement("canvas");
    c.width = max;
    c.height = Math.round(im.naturalHeight * max / im.naturalWidth);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------- state ---------- */
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var scale = Math.min(window.devicePixelRatio || 1, 1.5);
  var running = false, ready = false, inView = true, lost = false, raf = 0;
  var clock = 0, last = 0, frames = [];
  var ptr = [0, 0], ptrTarget = [0, 0];
  var nextStrike = 2.4, strikeAt = -10, flashPos = [0.5, 0.3];

  function motionOn() { return !reduced && !document.documentElement.classList.contains("motion-off"); }

  function resize() {
    var w = art.clientWidth, h = art.clientHeight;
    if (!w || !h) return;
    var s = scale;
    if (w * h * s * s > 2.4e6) s = Math.sqrt(2.4e6 / (w * h));   // cap the pixel count on big screens
    var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  }

  // a strike: a hard flash, a softer second one, then a long fade. Two flashes
  // at most, seconds apart, to stay well inside the WCAG flash limits.
  function flashEnvelope(t) {
    if (t < 0 || t > 1.8) return 0;
    var a = (t < 0.03 ? t / 0.03 : 1) * Math.exp(-t / 0.07);
    var b = t > 0.18 ? (t < 0.21 ? (t - 0.18) / 0.03 : 1) * 0.7 * Math.exp(-(t - 0.18) / 0.45) : 0;
    return Math.max(a, b);
  }

  function draw() {
    var w = canvas.width, h = canvas.height;
    var t = clock;
    var scrolled = Math.min(Math.max(window.scrollY / (hero.offsetHeight || 1), 0), 1);

    // the camera: slow drifts on clocks that never line up read as a handheld dolly
    var camX = Math.sin(t * 2 * Math.PI / 43);
    var camY = Math.sin(t * 2 * Math.PI / 31 + 1.3);
    var zoom = 1 + 0.035 * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI / 57)) + scrolled * 0.08;
    var view = frame(w, h, zoom, camX * 24, camY * 6);

    ptr[0] += (ptrTarget[0] - ptr[0]) * 0.05;
    ptr[1] += (ptrTarget[1] - ptr[1]) * 0.05;

    if (t >= nextStrike) {
      strikeAt = t;
      flashPos = [0.36 + Math.random() * 0.28, 0.08 + Math.random() * 0.5];
      nextStrike = t + 7 + Math.random() * 7;
    }
    var since = t - strikeAt;

    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.uniform1i(U.uImg, 0);
    gl.uniform1i(U.uFx, 1);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform4f(U.uView, view[0], view[1], view[2], view[3]);
    gl.uniform2f(U.uPar, -(camX * 14 + ptr[0] * 22), -(camY * 4 + ptr[1] * 7));
    gl.uniform2f(U.uCam, camX * 0.6 + ptr[0], camY * 0.6 + ptr[1]);
    gl.uniform2f(U.uLight, Math.cos(t * 0.13) * 0.9 + ptr[0] * 0.7, Math.sin(t * 0.11) * 0.5 - 0.25 + ptr[1] * 0.5);
    gl.uniform2f(U.uEmL, EMIT.left[0], EMIT.left[1]);
    gl.uniform2f(U.uEmR, EMIT.right[0], EMIT.right[1]);
    gl.uniform2f(U.uEmChest, EMIT.chest[0], EMIT.chest[1]);
    gl.uniform2f(U.uEmHands, EMIT.hands[0], EMIT.hands[1]);
    gl.uniform2f(U.uFlashPos, flashPos[0], flashPos[1]);
    gl.uniform1f(U.uTime, t % 9000);           // keep shader time small enough for float precision
    gl.uniform1f(U.uFlash, flashEnvelope(since));
    gl.uniform1f(U.uWave, since >= 0.06 && since < 4 ? since - 0.06 : -1);
    gl.uniform1f(U.uDim, 1 - scrolled * 0.6);
    gl.uniform1f(U.uGrain, 0.07);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(now) {
    raf = 0;
    if (!running) return;
    // on 120, 144 and 240 Hz screens only every second or third frame is drawn:
    // a slow film loop gains nothing from more, and the battery is spared
    if (last && now - last < 9.5) { raf = requestAnimationFrame(tick); return; }
    var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    clock += dt;
    draw();
    adapt(dt);
    raf = requestAnimationFrame(tick);
  }

  // drop the resolution if this machine can't hold the frame rate, but never
  // below one pixel per CSS pixel on a high density screen (a phone in low
  // power mode caps the frame rate at 30 and should not end up blurry)
  var floor = (window.devicePixelRatio || 1) >= 2 ? 1 : 0.75;
  function adapt(dt) {
    if (!dt) return;
    frames.push(dt);
    if (frames.length < 90) return;
    frames.sort(function (a, b) { return a - b; });
    var median = frames[45];
    frames = [];
    if (median > 0.026 && scale > floor) {
      scale = Math.max(floor, scale * 0.8);
      resize();
    }
  }

  // #hero-debug in the URL stops the clock so single frames can be inspected
  var debug = /hero-debug/.test(location.hash);
  if (debug) {
    window.heroDebug = {
      at: function (t, strike, pos) {
        clock = t;
        if (strike != null) { strikeAt = strike; nextStrike = 1e9; if (pos) flashPos = pos; }
        draw();
      },
      pointer: function (x, y) { ptr[0] = ptrTarget[0] = x; ptr[1] = ptrTarget[1] = y; }
    };
  }

  function update() {
    var want = ready && !lost && inView && !document.hidden && motionOn() && !debug;
    if (want && !running) {
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    } else if (!want && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    if (ready && !running && !lost) draw();    // paused: hold the current frame
  }

  /* ---------- wiring ---------- */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      update();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", update);
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", function () { resize(); if (!running && ready && !lost) draw(); });
  window.addEventListener("scroll", function () { if (!running && ready && inView && !lost) draw(); }, { passive: true });
  if (finePointer) {
    window.addEventListener("pointermove", function (e) {
      ptrTarget[0] = (e.clientX / window.innerWidth) * 2 - 1;
      ptrTarget[1] = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    lost = true;
    art.classList.remove("is-live", "is-shown");
    update();
  });

  Promise.all([loadImage("assets/hermes-hd.webp"), loadImage("assets/hermes-fx.png")]).then(function (ims) {
    upload(0, fitToGPU(ims[0]), gl.R8, gl.RED, true);
    upload(1, ims[1], gl.RGB8, gl.RGB, false);
    resize();
    ready = true;
    clock = 0.5;
    draw();
    if (gl.getError() !== gl.NO_ERROR) throw new Error("hero: WebGL error, keeping the still image");
    art.classList.add("is-live");
    // once the live view has faded in, stop painting the still underneath
    setTimeout(function () { if (!lost) art.classList.add("is-shown"); }, 1800);
    update();
  }).catch(function (err) {
    if (window.console) console.warn(err);
  });
})();
