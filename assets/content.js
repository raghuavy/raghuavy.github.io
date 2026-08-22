/* ==========================================================================
   Content loader.

   Every page that carries <div id="md-content" data-page="..."> gets its
   sections built from content/site.md at load. See the comment block at the
   top of that file for the format.

   Browsers refuse fetch() on file:// URLs, so opening the pages by double
   clicking them shows a notice instead of the content. Run a local server or
   deploy to GitHub Pages.
   ========================================================================== */
(function () {
  "use strict";

  var SRC = "content/site.md";

  /* ---------- small helpers ---------- */

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Only two bits of inline markdown are supported: links and code.
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function list(v) { return v === undefined ? [] : (Array.isArray(v) ? v : [v]); }
  function one(v) { return Array.isArray(v) ? v[0] : (v || ""); }
  function yes(v) { return /^(y|yes|true|1|on)$/i.test(one(v)); }

  // "Process = SKY130 | DRC = clean*"  ->  [{label, value, ok}]
  // A trailing asterisk on the value marks it as a good result (rendered green).
  function pairs(v) {
    var out = [];
    list(v).forEach(function (chunk) {
      chunk.split("|").forEach(function (bit) {
        bit = bit.trim();
        if (!bit) return;
        var i = bit.indexOf("=");
        var label = i >= 0 ? bit.slice(0, i).trim() : "";
        var value = i >= 0 ? bit.slice(i + 1).trim() : bit;
        var ok = /\*$/.test(value);
        if (ok) value = value.replace(/\*$/, "").trim();
        out.push({ label: label, value: value, ok: ok });
      });
    });
    return out;
  }

  /* ---------- parser ---------- */

  var KEY = /^([a-z][a-z0-9_-]{0,14}):[ \t]*(.*)$/;

  function parse(text) {
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var sections = [], sec = null, entry = null, para = [], inComment = false;

    function flushPara() {
      if (!para.length) return;
      var p = para.join(" ");
      if (entry) entry.body.push(p);
      else if (sec) sec.body.push(p);
      para = [];
    }

    function setField(target, k, v) {
      if (target.f[k] === undefined) target.f[k] = v;
      else if (Array.isArray(target.f[k])) target.f[k].push(v);
      else target.f[k] = [target.f[k], v];
    }

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();

      if (inComment) { if (t.indexOf("-->") >= 0) inComment = false; continue; }
      if (t.slice(0, 4) === "<!--") { if (t.indexOf("-->") < 0) inComment = true; continue; }
      if (!t) { flushPara(); continue; }

      if (/^##\s/.test(t)) {
        flushPara();
        entry = { title: t.replace(/^##\s+/, ""), f: {}, bullets: [], body: [] };
        if (sec) sec.entries.push(entry);
        continue;
      }
      if (/^#\s/.test(t)) {
        flushPara();
        sec = { name: t.replace(/^#\s+/, ""), f: {}, body: [], entries: [] };
        sections.push(sec);
        entry = null;
        continue;
      }
      if (/^[-*]\s/.test(t)) {
        flushPara();
        if (entry) entry.bullets.push(t.replace(/^[-*]\s+/, ""));
        continue;
      }

      var m = KEY.exec(t);
      var target = entry || sec;
      if (m && target) { flushPara(); setField(target, m[1], m[2].trim()); continue; }

      para.push(t);
    }
    flushPara();
    return sections;
  }

  /* ---------- layouts ---------- */

  function specStrip(v) {
    var p = pairs(v);
    if (!p.length) return "";
    return '<div class="specs">' + p.map(function (s) {
      return "<div><b>" + esc(s.label) + "</b><i" + (s.ok ? ' class="ok"' : "") + ">"
        + esc(s.value) + "</i></div>";
    }).join("") + "</div>";
  }

  function linkLabel(url, custom) {
    if (custom) return custom;
    return /github\.com/i.test(url) ? "View on GitHub" : "Open link";
  }

  function cardsLayout(sec) {
    return '<div class="cards">' + sec.entries.map(function (e) {
      var link = one(e.f.link);
      var cls = "card rise" + (yes(e.f.wide) ? " is-wide" : "");

      var body = '<div class="card-top">'
        + '<span class="card-tag">' + esc(one(e.f.tag)) + "</span>"
        + '<span class="card-date">' + esc(one(e.f.date)) + "</span></div>"
        + "<h3>" + inline(e.title) + "</h3>";

      if (one(e.f.meta)) body += '<p class="card-meta">' + inline(one(e.f.meta)) + "</p>";

      var points = e.bullets.length ? e.bullets : e.body;
      if (points.length) {
        body += "<ul>" + points.map(function (b) { return "<li>" + inline(b) + "</li>"; }).join("") + "</ul>";
      }

      // A card with a link is one big anchor. That only works while nothing inside
      // it is also a link, since anchors cannot nest. If the content has its own
      // link, fall back to a plain card with an explicit link row instead.
      var nested = body.indexOf("<a ") >= 0;

      if (link && !nested) {
        return '<a class="' + cls + '" href="' + esc(link) + '" target="_blank" rel="noopener">'
          + body + specStrip(e.f.specs) + "</a>";
      }
      if (link) {
        body += '<p class="card-more"><a href="' + esc(link) + '" target="_blank" rel="noopener">'
          + esc(linkLabel(link, one(e.f.linktext))) + "</a></p>";
      }
      return '<article class="' + cls + '">' + body + specStrip(e.f.specs) + "</article>";
    }).join("") + "</div>";
  }

  function logLayout(sec) {
    return '<div class="log">' + sec.entries.map(function (e) {
      var html = '<article class="entry rise"><div class="entry-when">'
        + "<span>" + esc(one(e.f.when)) + "</span>" + esc(one(e.f.where)) + "</div><div>"
        + "<h3>" + inline(e.title) + "</h3>";
      if (one(e.f.who)) html += '<p class="entry-who">' + inline(one(e.f.who)) + "</p>";
      e.body.forEach(function (p) { html += '<p class="entry-body">' + inline(p) + "</p>"; });

      var mets = pairs(e.f.metrics);
      if (mets.length) {
        html += '<div class="metrics">' + mets.map(function (m) {
          return "<div><strong>" + esc(m.value) + "</strong><span>" + esc(m.label) + "</span></div>";
        }).join("") + "</div>";
      }
      return html + "</div></article>";
    }).join("") + "</div>";
  }

  function listLayout(sec) {
    return '<ul class="pubs rise">' + sec.entries.map(function (e) {
      return "<li>"
        + '<span class="venue">' + esc(one(e.f.venue)) + "</span>"
        + '<span class="title">' + inline(e.title) + "</span>"
        + '<span class="role">' + esc(one(e.f.role)) + "</span></li>";
    }).join("") + "</ul>";
  }

  function panelsLayout(sec) {
    return '<div class="lead-grid">' + sec.entries.map(function (e) {
      var html = '<div class="panel rise">';
      if (one(e.f.tag)) html += '<p class="card-tag peach" style="margin-bottom:12px">' + esc(one(e.f.tag)) + "</p>";
      html += "<h3>" + inline(e.title) + "</h3>";
      if (one(e.f.meta)) html += '<p class="card-meta">' + inline(one(e.f.meta)) + "</p>";
      e.body.forEach(function (p) { html += '<p class="panel-body">' + inline(p) + "</p>"; });

      if (e.bullets.length) {
        html += '<ul class="orgs">' + e.bullets.map(function (b) {
          return "<li><i></i>" + inline(b) + "</li>";
        }).join("") + "</ul>";
      }
      var items = pairs(e.f.item);
      if (items.length) {
        html += '<div class="teach">' + items.map(function (it) {
          return "<div><h4>" + inline(it.label) + "</h4><p>" + inline(it.value) + "</p></div>";
        }).join("") + "</div>";
      }
      return html + "</div>";
    }).join("") + "</div>";
  }

  function rowsLayout(sec) {
    var rows = sec.entries.map(function (e) {
      return '<div class="srow"><dt>' + inline(e.title) + "</dt><dd>"
        + inline(one(e.f.items)) + "</dd></div>";
    });
    var half = Math.ceil(rows.length / 2);
    return '<div class="skills rise"><dl>' + rows.slice(0, half).join("")
      + "</dl><dl>" + rows.slice(half).join("") + "</dl></div>";
  }

  var LAYOUTS = {
    cards: cardsLayout, log: logLayout, list: listLayout,
    panels: panelsLayout, rows: rowsLayout
  };

  /* ---------- section shell ---------- */

  function sectionHtml(sec) {
    var layout = (one(sec.f.layout) || "cards").toLowerCase();
    var build = LAYOUTS[layout] || cardsLayout;

    var cls = "section" + (yes(sec.f.alt) ? " alt" : "") + (yes(sec.f.tight) ? " tight" : "");
    var accent = one(sec.f.accent);
    var head = "";

    if (one(sec.f.eyebrow) || one(sec.f.heading) || sec.body.length) {
      head = '<div class="section-head rise">';
      if (one(sec.f.eyebrow)) {
        head += '<p class="mono eyebrow' + (accent ? " is-" + esc(accent) : "") + '">'
          + esc(one(sec.f.eyebrow)) + "</p>";
      }
      if (one(sec.f.heading)) head += "<h2>" + inline(one(sec.f.heading)) + "</h2>";
      sec.body.forEach(function (p) { head += '<p class="lede">' + inline(p) + "</p>"; });
      head += "</div>";
    }

    return '<section class="' + cls + '"><div class="wrap">' + head + build(sec) + "</div></section>";
  }

  function noticeHtml(reason) {
    return '<section class="section"><div class="wrap"><div class="notice rise in">'
      + '<p class="notice-title">This page builds itself from <code>content/site.md</code>.</p>'
      + "<p>That file could not be loaded" + (reason ? " (" + esc(reason) + ")" : "")
      + ". Browsers block file reads when a page is opened straight from disk, so serve the "
      + "folder over http instead:</p>"
      + "<pre><code>cd &lt;this folder&gt;\npython3 -m http.server 8000</code></pre>"
      + '<p>Then open <code>http://localhost:8000</code>. On GitHub Pages it just works.</p>'
      + "</div></div></section>";
  }

  /* ---------- boot ---------- */

  var host = document.getElementById("md-content");
  if (!host) return;
  var page = (host.getAttribute("data-page") || "").toLowerCase();

  fetch(SRC, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function (text) {
      var mine = parse(text).filter(function (sec) {
        return (one(sec.f.page) || "").toLowerCase() === page;
      });
      if (!mine.length) {
        host.innerHTML = noticeHtml("no sections marked page: " + page);
      } else {
        host.innerHTML = mine.map(sectionHtml).join("");
      }
      if (window.__reveal) window.__reveal(host);
    })
    .catch(function (err) {
      host.innerHTML = noticeHtml(err && err.message);
      if (window.__reveal) window.__reveal(host);
    });
})();
