/* ==========================================================================
   Home page signature: a procedurally built silicon die, driven by the
   RTL to GDSII flow rail underneath it. No external model assets.
   ========================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var STAGES = [
    { name: "RTL",       note: "SystemVerilog describes what the block does, cycle by cycle." },
    { name: "Synth",     note: "Yosys or Design Compiler maps that behavior onto standard cells." },
    { name: "Floorplan", note: "Die area, core margins, and the pad ring get fixed." },
    { name: "Place",     note: "Cells drop into rows, packed for wirelength and timing." },
    { name: "CTS",       note: "A clock tree fans out so every flop sees the edge at the same time." },
    { name: "Route",     note: "Metal connects the nets, and each layer routes across the one below it." },
    { name: "Signoff",   note: "Timing, DRC, and LVS all have to come back clean. This one did." },
    { name: "GDSII",     note: "The stack ships to the shuttle as one polygon database." }
  ];

  var flowEl = document.getElementById("flow");
  var noteEl = document.getElementById("flow-note");
  var stackEl = document.getElementById("stack");
  var canvas = document.getElementById("die-canvas");
  var fallback = document.getElementById("fallback");
  if (!flowEl || !canvas) return;

  var stackItems = stackEl ? Array.prototype.slice.call(stackEl.querySelectorAll("li")) : [];
  var stage = 0, userTouched = false, autoTimer = null;

  STAGES.forEach(function (s, i) {
    var b = document.createElement("button");
    b.className = "step";
    b.type = "button";
    b.setAttribute("aria-label", s.name + ", step " + (i + 1) + " of " + STAGES.length);
    b.innerHTML = "<b>" + String(i + 1).padStart(2, "0") + "</b><span>" + s.name + "</span><div class=\"bar\"></div>";
    b.addEventListener("click", function () { userTouched = true; stopAuto(); setStage(i); });
    b.addEventListener("mouseenter", function () {
      if (reduced) return;
      userTouched = true; stopAuto(); setStage(i);
    });
    flowEl.appendChild(b);
  });
  var steps = Array.prototype.slice.call(flowEl.children);

  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

  function setStage(i) {
    stage = i;
    steps.forEach(function (el, k) {
      el.classList.toggle("on", k === i);
      el.classList.toggle("done", k < i);
      el.setAttribute("aria-pressed", k === i ? "true" : "false");
    });
    noteEl.innerHTML = "<em>" + STAGES[i].name + ".</em> " + STAGES[i].note;

    var lit = [0, 0, 2, 2, 2, 7, 7, 7][i];
    stackItems.forEach(function (li, k) { li.classList.toggle("on", k < lit); });

    if (flowEl.scrollWidth > flowEl.clientWidth + 4) {
      var el = steps[i];
      flowEl.scrollTo({
        left: el.offsetLeft - (flowEl.clientWidth - el.offsetWidth) / 2,
        behavior: reduced ? "auto" : "smooth"
      });
    }
    if (window.__die) window.__die.setStage(i);
  }

  setStage(reduced ? 6 : 0);

  /* ---------------------------------------------------------------------- */

  function bail() {
    canvas.style.display = "none";
    if (fallback) fallback.classList.add("on");
  }
  if (typeof THREE === "undefined") { bail(); return; }

  /* Silver, laddered by brightness. Lower metals are dark and dense, the top
     metal is white because that is where the thick power straps live. Keep in
     step with the legend colours in index.html (#stack). */
  var C = {
    acid: 0xc4c3bf, acidHi: 0xe2e1dd, acidMid: 0xa3a29e, acidLow: 0x858582,
    white: 0xffffff, cellA: 0x2e2e2e, cellB: 0x454545, line: 0x3a3a3a
  };
  var small = window.innerWidth < 900;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (err) { bail(); return; }
  if (!renderer) { bail(); return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  var key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(6, 10, 7); scene.add(key);
  var rim = new THREE.DirectionalLight(C.acid, 0.7); rim.position.set(-8, 4, -6); scene.add(rim);

  var root = new THREE.Group();
  scene.add(root);

  function mat(color, emissiveOverride) {
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: emissiveOverride === undefined ? color : emissiveOverride,
      emissiveIntensity: 0.16,
      roughness: 0.42, metalness: 0.28,
      transparent: true, opacity: 1
    });
  }

  var W = 6;
  var groups = {};
  function group(name, baseY) {
    var g = new THREE.Group();
    g.position.y = baseY;
    g.userData = { baseY: baseY, target: 0, current: 0 };
    root.add(g);
    groups[name] = g;
    return g;
  }

  /* substrate */
  var gDie = group("die", 0);
  var sub = new THREE.Mesh(new THREE.BoxGeometry(W, 0.34, W), mat(0x0d0d0d));
  sub.material.emissiveIntensity = 0.04;
  gDie.add(sub);
  gDie.add(new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.985, 0.36, W * 0.985),
    new THREE.MeshBasicMaterial({ color: C.line, wireframe: true, transparent: true, opacity: 0.7 })
  ));

  /* pad ring */
  var gPads = group("pads", 0.2);
  var padGeo = new THREE.BoxGeometry(0.28, 0.1, 0.28);
  var padMat = mat(C.acid); padMat.emissiveIntensity = 0.34;
  var perEdge = small ? 6 : 8;
  for (var e = 0; e < 4; e++) {
    for (var p = 0; p < perEdge; p++) {
      var t = (p + 0.5) / perEdge - 0.5;
      var pad = new THREE.Mesh(padGeo, padMat);
      var off = W / 2 - 0.34;
      if (e === 0) pad.position.set(t * (W - 1.1), 0, -off);
      if (e === 1) pad.position.set(t * (W - 1.1), 0, off);
      if (e === 2) pad.position.set(-off, 0, t * (W - 1.1));
      if (e === 3) pad.position.set(off, 0, t * (W - 1.1));
      gPads.add(pad);
    }
  }

  /* standard cells: a loose position and a placed position */
  var gCells = group("cells", 0.28);
  var cells = [];
  var rows = small ? 5 : 7;
  var cellGeo = new THREE.BoxGeometry(1, 0.18, 0.34);
  var cellA = mat(C.cellA); cellA.emissiveIntensity = 0.06;
  var cellB = mat(C.cellB); cellB.emissiveIntensity = 0.06;
  for (var r = 0; r < rows; r++) {
    var z = (r / (rows - 1) - 0.5) * (W - 1.6);
    var x = -(W - 1.4) / 2;
    while (x < (W - 1.4) / 2 - 0.2) {
      var w = 0.18 + Math.random() * 0.42;
      var cell = new THREE.Mesh(cellGeo, Math.random() > 0.72 ? cellB : cellA);
      cell.scale.x = w;
      cell.userData.placed = new THREE.Vector3(x + w / 2, 0, z);
      cell.userData.loose = new THREE.Vector3(
        (Math.random() - 0.5) * (W + 1.6),
        (Math.random() - 0.2) * 2.4,
        (Math.random() - 0.5) * (W + 1.6)
      );
      cell.userData.spin = new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      cell.position.copy(cell.userData.loose);
      gCells.add(cell);
      cells.push(cell);
      x += w + 0.1;
    }
  }

  /* clock tree */
  var gClock = group("clock", 0.62);
  var clkMat = mat(C.white); clkMat.emissiveIntensity = 0.62;
  function trunk(tx, tz, len, horiz) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(horiz ? len : 0.05, 0.05, horiz ? 0.05 : len),
      clkMat
    );
    m.position.set(tx, 0, tz);
    gClock.add(m);
  }
  trunk(0, 0, W - 1.4, true);
  [-1.15, 1.15].forEach(function (bx) {
    trunk(bx, 0, W - 1.8, false);
    [-1.05, 1.05].forEach(function (bz) { trunk(bx, bz, 1.5, true); });
  });

  /* metal stack: thin and dense at the bottom, thick and sparse at the top */
  var LAYERS = [
    { n: small ? 10 : 15, w: 0.05, y: 0.86, axis: "x", color: C.acidLow, glow: 0.55 },
    { n: small ? 9 : 13, w: 0.07, y: 1.14, axis: "z", color: C.acidMid, glow: 0.46 },
    { n: small ? 7 : 9, w: 0.11, y: 1.42, axis: "x", color: C.acid, glow: 0.4 },
    { n: small ? 5 : 7, w: 0.16, y: 1.70, axis: "z", color: C.acidHi, glow: 0.36 },
    { n: 4, w: 0.30, y: 1.98, axis: "x", color: C.white, glow: 0.22 }
  ];
  var tracks = [];
  LAYERS.forEach(function (L, li) {
    var g = group("m" + li, L.y);
    var mm = mat(L.color);
    mm.emissiveIntensity = L.glow; mm.metalness = 0.55; mm.roughness = 0.3;
    var span = W - 0.7;
    for (var i = 0; i < L.n; i++) {
      var t = (i + 0.5) / L.n - 0.5;
      var bar = new THREE.Mesh(
        L.axis === "x" ? new THREE.BoxGeometry(span, 0.06, L.w) : new THREE.BoxGeometry(L.w, 0.06, span),
        mm
      );
      var pos = t * span;
      if (L.axis === "x") bar.position.set(0, 0, pos); else bar.position.set(pos, 0, 0);
      g.add(bar);
      if (i % 2 === 0) tracks.push({ axis: L.axis, pos: pos, y: L.y, span: span, color: L.color, li: li });
    }
    var viaMat = mat(C.line); viaMat.emissiveIntensity = 0.08;
    for (var v = 0; v < (small ? 4 : 7); v++) {
      var via = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), viaMat);
      via.position.set((Math.random() - 0.5) * span * 0.9, -0.16, (Math.random() - 0.5) * span * 0.9);
      g.add(via);
    }
  });

  /* signals riding the tracks */
  var gPulse = group("pulse", 0);
  var pulses = [];
  if (!reduced) {
    for (var q = 0; q < (small ? 5 : 9); q++) {
      var tr = tracks[Math.floor(Math.random() * tracks.length)];
      var dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 10, 10),
        new THREE.MeshBasicMaterial({ color: tr.color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending })
      );
      dot.userData = { tr: tr, t: Math.random(), speed: 0.14 + Math.random() * 0.26 };
      gPulse.add(dot);
      pulses.push(dot);
    }
  }

  /* RTL: described but not yet physical, so it floats as wireframe */
  var gRtl = group("rtl", 0.95);
  var rtlMat = new THREE.MeshBasicMaterial({ color: C.acid, wireframe: true, transparent: true, opacity: 0.55 });
  var rtlBoxes = [];
  for (var b2 = 0; b2 < (small ? 9 : 14); b2++) {
    var blk = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 + Math.random() * 0.9, 0.4 + Math.random() * 0.5, 0.5 + Math.random() * 0.9),
      rtlMat
    );
    blk.position.set((Math.random() - 0.5) * 7.2, (Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 7.2);
    blk.rotation.set(Math.random(), Math.random(), Math.random());
    blk.userData.spin = 0.1 + Math.random() * 0.25;
    gRtl.add(blk);
    rtlBoxes.push(blk);
  }

  var VIS = {
    rtl:   [1, 0, 0, 0, 0, 0, 0, 0],
    die:   [0, 0, 1, 1, 1, 1, 1, 1],
    pads:  [0, 0, 1, 1, 1, 1, 1, 1],
    cells: [0, 1, 1, 1, 1, 1, 1, 1],
    clock: [0, 0, 0, 0, 1, 1, 1, 1],
    m0:    [0, 0, 0, 0, 0, 1, 1, 1],
    m1:    [0, 0, 0, 0, 0, 1, 1, 1],
    m2:    [0, 0, 0, 0, 0, 1, 1, 1],
    m3:    [0, 0, 0, 0, 0, 1, 1, 1],
    m4:    [0, 0, 0, 0, 0, 1, 1, 1],
    pulse: [0, 0, 0, 0, 0, 1, 1, 1]
  };
  var CAM = [
    { r: 17.0, y: 8.0 }, { r: 16.4, y: 7.6 }, { r: 16.2, y: 9.2 }, { r: 14.6, y: 6.4 },
    { r: 15.2, y: 7.4 }, { r: 15.6, y: 6.4 }, { r: 15.4, y: 5.4 }, { r: 17.6, y: 8.2 }
  ];

  root.scale.setScalar(small ? 0.86 : 0.9);

  root.traverse(function (o) {
    if (o.material && o.material.userData.op0 === undefined) {
      o.material.userData.op0 = o.material.opacity;
    }
  });

  var placeT = 0, explode = 0, camR = 17, camY = 8;
  var az = -0.72, pol = 0.86, azTarget = -0.72, polTarget = 0.86;
  var dragging = false, lastX = 0, lastY = 0, idle = 0;

  window.__die = {
    setStage: function (i) {
      Object.keys(VIS).forEach(function (k) { groups[k].userData.target = VIS[k][i]; });
      placeT = i >= 3 ? 1 : 0;
      explode = i === 7 ? 1 : 0;
    }
  };
  window.__die.setStage(reduced ? 6 : 0);

  if (!small) {
    canvas.addEventListener("pointerdown", function (ev) {
      dragging = true; lastX = ev.clientX; lastY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      azTarget -= (ev.clientX - lastX) * 0.0072;
      polTarget = Math.max(0.16, Math.min(1.36, polTarget - (ev.clientY - lastY) * 0.0056));
      lastX = ev.clientX; lastY = ev.clientY; idle = 0;
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) {
      canvas.addEventListener(n, function () { dragging = false; });
    });
  }

  function resize() {
    var box = canvas.parentElement.getBoundingClientRect();
    if (!box.width) return;
    renderer.setSize(box.width, box.height, false);
    camera.aspect = box.width / box.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  var clock = new THREE.Clock();
  var awake = true;
  document.addEventListener("visibilitychange", function () { awake = !document.hidden; });

  function lerp(a, b, t) { return a + (b - a) * t; }

  function frame() {
    requestAnimationFrame(frame);
    if (!awake) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    Object.keys(groups).forEach(function (k) {
      var g = groups[k], u = g.userData;
      u.current = lerp(u.current, u.target, 1 - Math.pow(0.004, dt));
      g.visible = u.current > 0.01;
      var lift = k.charAt(0) === "m" ? explode * (parseInt(k.slice(1), 10) + 1) * 0.24 : 0;
      g.position.y = u.baseY + lift + (1 - u.current) * 0.7;
      g.traverse(function (o) {
        if (o.material && o.material.transparent) {
          var base = o.material.userData.op0;
          o.material.opacity = u.current * (base === undefined ? 1 : base);
        }
      });
    });

    cells.forEach(function (c) {
      c.position.lerp(placeT > 0.5 ? c.userData.placed : c.userData.loose, 1 - Math.pow(0.006, dt));
      if (placeT > 0.5) {
        c.rotation.x = lerp(c.rotation.x, 0, 0.1);
        c.rotation.y = lerp(c.rotation.y, 0, 0.1);
        c.rotation.z = lerp(c.rotation.z, 0, 0.1);
      } else if (!reduced) {
        c.rotation.x += c.userData.spin.x * dt * 0.25;
        c.rotation.y += c.userData.spin.y * dt * 0.25;
      }
    });

    pulses.forEach(function (d) {
      d.userData.t += d.userData.speed * dt;
      if (d.userData.t > 1) d.userData.t -= 1;
      var tr = d.userData.tr;
      var along = (d.userData.t - 0.5) * tr.span;
      var yy = tr.y + explode * (tr.li + 1) * 0.24;
      if (tr.axis === "x") d.position.set(along, yy, tr.pos);
      else d.position.set(tr.pos, yy, along);
    });

    if (!reduced && groups.rtl.userData.current > 0.02) {
      rtlBoxes.forEach(function (blk) {
        blk.rotation.x += blk.userData.spin * dt * 0.6;
        blk.rotation.y += blk.userData.spin * dt * 0.9;
      });
    }
    if (!reduced) clkMat.emissiveIntensity = 0.45 + Math.sin(t * 3.1) * 0.22;

    var want = CAM[stage] || CAM[0];
    camR = lerp(camR, want.r, 1 - Math.pow(0.02, dt));
    camY = lerp(camY, want.y, 1 - Math.pow(0.02, dt));
    if (!dragging && !reduced) {
      idle += dt;
      if (idle > 1.4) azTarget += dt * 0.085;
    }
    az = lerp(az, azTarget, 1 - Math.pow(0.001, dt));
    pol = lerp(pol, polTarget, 1 - Math.pow(0.001, dt));
    camera.position.set(
      Math.sin(az) * Math.cos(pol - 0.55) * camR,
      camY,
      Math.cos(az) * Math.cos(pol - 0.55) * camR
    );
    camera.lookAt(0, 1.0, 0);
    renderer.render(scene, camera);
  }
  frame();

  if (!reduced) {
    setTimeout(function () {
      if (userTouched) return;
      var i = 0;
      autoTimer = setInterval(function () {
        if (userTouched) { stopAuto(); return; }
        i++;
        if (i >= STAGES.length) { stopAuto(); return; }
        setStage(i);
      }, 2400);
    }, 1100);
  }
})();
