/* ==========================================================================
   Posit lab

   A working posit8 (es = 2) decoder and round to nearest even encoder, plus
   the tapered accuracy plot that makes the format worth caring about. Same
   arithmetic as the SystemVerilog codec, written out in JavaScript so it can
   be poked at directly.

   Format, most significant bit first:
     [ sign 1 ] [ regime, a run of equal bits, ended by one opposite bit ]
     [ exponent, up to es bits ] [ fraction, whatever is left ]

   value = (-1)^sign x 2^(2^es x k + e) x (1 + f)

   For a negative posit the fields are read from the two's complement of the
   whole byte, which is why flipping the sign bit reshuffles the fields.
   ========================================================================== */
(function () {
  "use strict";

  var NBITS = 8, ES = 2, USEED_EXP = 1 << ES;  /* 2^es = 4 */

  /* ---------- decode ---------- */

  function decode(p) {
    p &= 0xff;
    var out = { code: p, kind: "real", value: 0, k: 0, e: 0, fInt: 0, fs: 0, neg: false, fields: [] };
    var i;

    out.fields.push("sign");
    for (i = 0; i < 7; i++) out.fields.push("off");

    if (p === 0) { out.kind = "zero"; return out; }
    if (p === 0x80) { out.kind = "nar"; out.value = NaN; return out; }

    out.neg = (p & 0x80) !== 0;
    var v = out.neg ? ((~p + 1) & 0xff) : p;

    var bits = [];
    for (i = 6; i >= 0; i--) bits.push((v >> i) & 1);

    /* regime: a run of equal bits, terminated by the first opposite bit */
    var r0 = bits[0], m = 0;
    while (m < 7 && bits[m] === r0) m++;
    out.k = r0 === 1 ? m - 1 : -m;
    out.m = m;
    out.r0 = r0;

    for (i = 0; i < m; i++) out.fields[i + 1] = "regime";
    if (m < 7) out.fields[m + 1] = "term";

    var idx = m + 1;              /* skip the terminating bit */

    /* exponent: up to es bits, right padded with zeros when the byte runs out */
    var e = 0, used = 0;
    for (i = 0; i < ES; i++) {
      e = (e << 1) | (idx < 7 ? bits[idx] : 0);
      if (idx < 7) { out.fields[idx + 1] = "exp"; used++; }
      idx++;
    }
    out.e = e;
    out.eBits = used;

    /* fraction: everything left */
    var fInt = 0, fs = 0;
    while (idx < 7) {
      fInt = fInt * 2 + bits[idx];
      out.fields[idx + 1] = "frac";
      fs++; idx++;
    }
    out.fInt = fInt;
    out.fs = fs;

    var f = fs ? fInt / Math.pow(2, fs) : 0;
    out.f = f;
    out.scale = USEED_EXP * out.k + e;
    var mag = Math.pow(2, out.scale) * (1 + f);
    out.value = out.neg ? -mag : mag;
    return out;
  }

  /* Every code, decoded once. This is the same table the cocotb harness
     checks the hardware against, all 256 of them. */
  var TABLE = [];
  for (var c = 0; c < 256; c++) TABLE.push(decode(c));

  /* ---------- encode, round to nearest, ties to even ---------- */

  function encode(x) {
    if (typeof x !== "number" || isNaN(x) || !isFinite(x)) return 0x80;   /* NaR */
    if (x === 0) return 0x00;

    var neg = x < 0, a = Math.abs(x);
    var MAX = TABLE[0x7f].value, MIN = TABLE[0x01].value;
    var code;

    /* Posits saturate. Nothing overflows to infinity, and no nonzero value
       is ever rounded away to zero. */
    if (a >= MAX) code = 0x7f;
    else if (a <= MIN) code = 0x01;
    else {
      /* codes 1..127 are the positive values in increasing order */
      var lo = 1, hi = 127;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (TABLE[mid].value <= a) lo = mid; else hi = mid;
      }
      var dLo = a - TABLE[lo].value, dHi = TABLE[hi].value - a;
      if (dLo < dHi) code = lo;
      else if (dHi < dLo) code = hi;
      else code = (lo & 1) === 0 ? lo : hi;      /* exact tie goes to the even code */
    }

    /* a negative posit is the two's complement of its positive counterpart,
       and 256 minus an even number stays even, so the tie rule still holds */
    return neg ? (256 - code) & 0xff : code;
  }

  /* ---------- formatting ---------- */

  function fmt(v) {
    if (v === 0) return "0";
    var a = Math.abs(v);
    if (a >= 1e6 || a < 1e-4) return v.toExponential(4).replace("e+", "e").replace(/\.?0+e/, "e");
    var s = a >= 1 ? v.toPrecision(9) : v.toPrecision(6);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }

  function bin(p) {
    var s = p.toString(2);
    while (s.length < 8) s = "0" + s;
    return s.slice(0, 4) + " " + s.slice(4);
  }

  function hex(p) { return "0x" + (p < 16 ? "0" : "") + p.toString(16).toUpperCase(); }

  /* ---------- markup ---------- */

  var FIELD_NAMES = { sign: "S", regime: "R", term: "R\u0304", exp: "E", frac: "F", off: "\u00b7" };

  function shell() {
    return ''
      + '<div class="posit"><div class="posit-grid">'
      + '<div class="posit-left">'
      +   '<p class="posit-label">posit8, es = 2 &middot; click any bit to flip it</p>'
      +   '<div class="bit-index" id="p-index"></div>'
      +   '<div class="bits" id="p-bits"></div>'
      +   '<div class="posit-legend">'
      +     '<span><i style="background:var(--text);border-color:var(--text)"></i>sign</span>'
      +     '<span><i style="background:#9d9c99;border-color:#9d9c99"></i>regime</span>'
      +     '<span><i style="border-color:#9d9c99"></i>regime end</span>'
      +     '<span><i style="background:var(--line)"></i>exponent</span>'
      +     '<span><i></i>fraction</span>'
      +   '</div>'
      +   '<div class="posit-controls">'
      +     '<button class="pbtn" id="p-prev" type="button">&minus; step</button>'
      +     '<button class="pbtn" id="p-next" type="button">+ step</button>'
      +     '<button class="pbtn" id="p-one" type="button">reset to 1.0</button>'
      +     '<input class="pin" id="p-in" type="text" inputmode="decimal" placeholder="e.g. 3.14159" aria-label="Real number to encode">'
      +     '<button class="pbtn" id="p-enc" type="button">encode</button>'
      +   '</div>'
      +   '<p class="posit-note" id="p-round">Type a real number and press encode to see it rounded to the nearest posit.</p>'
      +   '<p class="posit-label" style="margin-top:24px">Neighbouring codes &middot; watch the gap change</p>'
      +   '<div class="pnear" id="p-near"></div>'
      + '</div>'
      + '<div class="posit-right">'
      +   '<p class="posit-label">Decoded value</p>'
      +   '<p class="posit-value" id="p-val">1</p>'
      +   '<p class="posit-hex" id="p-hex"></p>'
      +   '<div class="pfields" id="p-fields"></div>'
      +   '<p class="pformula" id="p-formula"></p>'
      + '</div>'
      + '</div>'
      + '<div class="posit-scale">'
      +   '<p class="posit-label">Decimal digits of accuracy across the range &middot; 127 positive values</p>'
      +   '<svg id="p-plot" role="img" aria-label="Accuracy peaks near 1 and tapers toward both extremes"></svg>'
      +   '<p class="posit-note">Accuracy peaks around 1.0 and tapers off toward minpos and maxpos. That taper is the whole point of the format: bits go where real workloads actually put their numbers, instead of being spread evenly like an IEEE float.</p>'
      + '</div></div>';
  }

  /* ---------- accuracy plot ---------- */

  var H = 104, PAD_L = 6, PAD_R = 6, TOP = 8, BASE = 78;

  /* Accuracy is -log10 of the relative gap to the next representable value.
     Forward differences only, so there is no one sided artifact at the ends;
     the very last code has no successor and is left off the curve. */
  function plotGeometry(width) {
    var pts = [];
    for (var i = 1; i <= 126; i++) {
      var v = TABLE[i].value;
      var gap = (TABLE[i + 1].value - v) / v;
      pts.push({ code: i, v: v, acc: -Math.log10(gap) });
    }
    var lo = Math.log2(TABLE[1].value), hi = Math.log2(TABLE[127].value);
    var accs = pts.map(function (p) { return p.acc; });
    var aMin = Math.min.apply(null, accs), aMax = Math.max.apply(null, accs);
    pts.forEach(function (p) {
      p.x = PAD_L + ((Math.log2(p.v) - lo) / (hi - lo)) * (width - PAD_L - PAD_R);
      p.y = BASE - ((p.acc - aMin) / (aMax - aMin || 1)) * (BASE - TOP);
    });
    return { pts: pts, lo: lo, hi: hi, width: width };
  }

  function plotSvg(code, width) {
    var geo = plotGeometry(width);
    var pts = geo.pts;
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
    var area = line + " L" + pts[pts.length - 1].x.toFixed(1) + " " + BASE + " L" + pts[0].x.toFixed(1) + " " + BASE + " Z";

    var s = '<path d="' + area + '" fill="rgba(255,255,255,.07)"/>'
      + '<path d="' + line + '" fill="none" stroke="var(--acid)" stroke-width="1.5"/>'
      + '<line x1="0" y1="' + BASE + '" x2="' + width + '" y2="' + BASE + '" stroke="var(--line-2)" stroke-width="1"/>';

    s += pts.map(function (p) {
      return '<line x1="' + p.x.toFixed(1) + '" y1="' + BASE + '" x2="' + p.x.toFixed(1) + '" y2="' + (BASE + 5)
        + '" stroke="var(--line-2)" stroke-width="1"/>';
    }).join("");

    [[-24, "2\u207b\u00b2\u2074"], [-12, "2\u207b\u00b9\u00b2"], [0, "1"], [12, "2\u00b9\u00b2"], [24, "2\u00b2\u2074"]].forEach(function (t) {
      var x = PAD_L + ((t[0] - geo.lo) / (geo.hi - geo.lo)) * (width - PAD_L - PAD_R);
      var anchor = t[0] === -24 ? "start" : (t[0] === 24 ? "end" : "middle");
      s += '<text x="' + x.toFixed(1) + '" y="' + (BASE + 20) + '" fill="var(--dim)" font-size="9" text-anchor="' + anchor + '">' + t[1] + "</text>";
    });

    var mag = code > 127 ? 256 - code : code;
    var here = null;
    for (var i = 0; i < pts.length; i++) if (pts[i].code === mag) here = pts[i];
    if (here) {
      s += '<line x1="' + here.x.toFixed(1) + '" y1="' + TOP + '" x2="' + here.x.toFixed(1) + '" y2="' + (BASE + 5)
        + '" stroke="var(--acid-hi)" stroke-width="1"/>'
        + '<circle cx="' + here.x.toFixed(1) + '" cy="' + here.y.toFixed(1) + '" r="3.5" fill="var(--acid-hi)"/>';
    }
    return s;
  }

  /* ---------- mount ---------- */

  function mount(host) {
    host.innerHTML = shell();

    var code = 0x40;   /* 1.0 */
    var elBits = host.querySelector("#p-bits");
    var elIndex = host.querySelector("#p-index");
    var elVal = host.querySelector("#p-val");
    var elHex = host.querySelector("#p-hex");
    var elFields = host.querySelector("#p-fields");
    var elFormula = host.querySelector("#p-formula");
    var elPlot = host.querySelector("#p-plot");
    var elRound = host.querySelector("#p-round");
    var elIn = host.querySelector("#p-in");
    var elNear = host.querySelector("#p-near");

    for (var i = 7; i >= 0; i--) {
      var lab = document.createElement("span");
      lab.textContent = i;
      elIndex.appendChild(lab);
    }

    var buttons = [];
    for (var b = 7; b >= 0; b--) {
      (function (pos) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bit";
        btn.innerHTML = '<span class="bv"></span><span class="bf"></span>';
        btn.addEventListener("click", function () {
          set(code ^ (1 << pos));
        });
        elBits.appendChild(btn);
        buttons.push({ pos: pos, el: btn });
      })(b);
    }

    function row(label, value) {
      return "<div><b>" + label + "</b><i>" + value + "</i></div>";
    }

    function set(next, note) {
      code = next & 0xff;
      var d = TABLE[code];

      buttons.forEach(function (b) {
        var field = d.fields[7 - b.pos];
        b.el.className = "bit f-" + (field === "sign" ? "sign" : field);
        b.el.querySelector(".bv").textContent = (code >> b.pos) & 1;
        b.el.querySelector(".bf").textContent = FIELD_NAMES[field];
        b.el.setAttribute("aria-label", "bit " + b.pos + ", " + field + ", currently " + ((code >> b.pos) & 1));
      });

      elHex.textContent = hex(code) + "  \u00b7  " + bin(code);
      elVal.classList.toggle("is-nar", d.kind !== "real");

      if (d.kind === "nar") {
        elVal.textContent = "NaR";
        elFields.innerHTML = row("Meaning", "not a real") + row("Reserved", "1000 0000");
        elFormula.innerHTML = "The one pattern posits reserve instead of the many NaNs and two infinities an IEEE float carries.";
      } else if (d.kind === "zero") {
        elVal.textContent = "0";
        elFields.innerHTML = row("Meaning", "exact zero") + row("Reserved", "0000 0000");
        elFormula.innerHTML = "Zero has exactly one encoding. There is no negative zero.";
      } else {
        elVal.textContent = fmt(d.value);
        elFields.innerHTML =
            row("Sign", d.neg ? "1, negative" : "0, positive")
          + row("Regime k", (d.k >= 0 ? "+" : "") + d.k + "  (run of " + d.m + ")")
          + row("Exponent e", d.e + (d.eBits < ES ? "  (" + d.eBits + " bit" + (d.eBits === 1 ? "" : "s") + " left)" : ""))
          + row("Fraction", d.fs ? d.fInt + " / " + Math.pow(2, d.fs) : "none")
          + row("Scale", "2^" + d.scale);
        elFormula.innerHTML = "value = " + (d.neg ? "&minus;" : "") + "2<em>^(4&times;" + d.k + " + " + d.e
          + ")</em> &times; (1 + " + (d.fs ? d.fInt + "/" + Math.pow(2, d.fs) : "0") + ") = <em>" + fmt(d.value) + "</em>"
          + (d.neg ? "<br>Negative, so the fields above are read from the two's complement." : "");
      }

      /* the codes on either side, so the spacing between values is visible */
      var near = "";
      for (var n = -3; n <= 3; n++) {
        var nc = (code + n) & 0xff;
        var nd = TABLE[nc];
        var txt = nd.kind === "nar" ? "NaR" : fmt(nd.value);
        near += '<div class="pn' + (n === 0 ? " is-here" : "") + '" data-code="' + nc + '">'
          + "<b>" + hex(nc) + "</b><i>" + txt + "</i></div>";
      }
      elNear.innerHTML = near;

      var pw = Math.max(260, Math.round(elPlot.clientWidth || elPlot.parentElement.clientWidth || 800));
      elPlot.setAttribute("viewBox", "0 0 " + pw + " " + H);
      elPlot.innerHTML = plotSvg(code, pw);
      if (note !== undefined) elRound.innerHTML = note;
    }

    elNear.addEventListener("click", function (ev) {
      var cell = ev.target.closest(".pn");
      if (cell) set(parseInt(cell.getAttribute("data-code"), 10));
    });

    host.querySelector("#p-next").addEventListener("click", function () { set((code + 1) & 0xff); });
    host.querySelector("#p-prev").addEventListener("click", function () { set((code - 1) & 0xff); });
    host.querySelector("#p-one").addEventListener("click", function () { set(0x40); });

    function doEncode() {
      var raw = (elIn.value || "").trim();
      if (!raw) return;
      var x = Number(raw);
      if (isNaN(x)) {
        set(0x80, "<code>" + raw.replace(/[<>&]/g, "") + "</code> is not a number, so it encodes to NaR.");
        return;
      }
      var p = encode(x);
      var got = TABLE[p].value;
      var err = x === 0 ? 0 : Math.abs((got - x) / x) * 100;
      set(p, "Nearest posit8 to <code>" + x + "</code> is " + hex(p) + " = <code>" + fmt(got)
        + "</code>, relative error " + (err < 0.001 ? "under 0.001" : err.toFixed(err < 1 ? 3 : 2)) + "%.");
    }

    host.querySelector("#p-enc").addEventListener("click", doEncode);
    elIn.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); doEncode(); } });

    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { set(code); }, 140);
    });

    set(code);
  }

  /* expose for anything else that wants the arithmetic */
  window.posit8 = { decode: decode, encode: encode, table: TABLE };

  function init() {
    var hosts = document.querySelectorAll("[data-widget='posit']");
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.__mountPosit = init;
})();
