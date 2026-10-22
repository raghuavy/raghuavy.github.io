# avyuktraghuvanshi.com

Personal site. Static HTML, CSS, and JavaScript. No build step, no framework,
no package manager.

Work, Research, and About build themselves from one markdown file, so adding a
project or a paper means editing `content/site.md` and pushing. Nothing else
needs touching.

## Structure

```
index.html          home: the live Hermes hero, then the interactive silicon die and the RTL to GDSII rail
work.html           shell, filled from content/site.md
research.html       shell, filled from content/site.md
about.html          shell, filled from content/site.md
contact.html        contact
content/
  site.md           ALL the content for work, research, and about
assets/
  site.css          every style, all colours as CSS variables at the top
  site.js           sticky nav, scroll reveal, and the motion toggle, loaded on every page
  content.js        markdown parser and renderers
  die.js            the 3D die and the flow rail, index.html only
  chirp.js          the strain trace, research.html only
  posit.js          the posit8 decoder, encoder, and accuracy plot
  hero.js           the live hero, the engraving drawn in WebGL2, index.html only (see "Hero art")
  fonts/            Cormorant Garamond, Inter, JetBrains Mono, self-hosted (SIL OFL 1.1)
  hermes.webp       the Hermes engraving, the still under the live hero and its fallback
  hermes.jpg        the same, for browsers without WebP
  hermes-hd.webp    the engraving upscaled to 5600 px wide, the texture hero.js draws
  hermes-fx.png     depth, figure, lightning, and cable ids for the hero's effects
tools/
  hero_fx.py        rebuilds hermes-hd.webp and hermes-fx.png (not loaded by the site)
.github/workflows/
  hero-textures.yml runs hero_fx.py in the cloud and commits the result, by hand only
```

## The posit lab

`assets/posit.js` is a real posit8 (es = 2) implementation, not a mock up:
a decoder, a round to nearest even encoder that saturates instead of
overflowing, and the tapered accuracy plot. It exposes `window.posit8` with
`decode`, `encode`, and the full 256 entry table if you want to use it from the
console.

It is checked against the reference values for maxpos, minpos, 1.0 and the
codes around it, monotonicity across all 127 positive codes, two's complement
symmetry, and a full round trip over every code. Encoding is verified to return
the true nearest value on random inputs across sixteen decades.

If you change the SystemVerilog codec, this is the thing to keep in step with
it.

## Running it locally

`content/site.md` is loaded with `fetch()`, and browsers block that on
`file://`. Double clicking the HTML shows a notice instead of the content. Serve
the folder instead:

```
cd <this folder>
python3 -m http.server 8000
```

Then open `http://localhost:8000`. On GitHub Pages it works with no extra setup.

## Adding content

Open `content/site.md`. The format guide is in a comment at the top of that
file. Short version:

- `#` starts a section (one block on one page)
- `##` starts an entry inside it
- `key: value` sets a field, lowercase key, no spaces in the key
- `-` starts a bullet, anything else is prose

To add a project, copy any `##` block in the Chips section, change the words,
and save. Order on the page follows order in the file. To add a whole new block
to a page, copy a `#` block and set `page:` to `work`, `research`, or `about`.

Two conventions worth remembering:

- `specs:` and `metrics:` take `label = value` pairs separated by `|`
- a `*` at the end of a spec value turns it white with a check mark, for
  results that passed

## What still lives in HTML

Deliberately, so the home page works even without a server:

- the hero, the hub cards, and the featured project on `index.html`
- the page titles and intro paragraphs at the top of each page
- everything on `contact.html`

If you replace the featured project on the home page, update the matching entry
in `content/site.md` too.

## Deploying to GitHub Pages

1. Push these files to the root of a repo.
2. Settings, then Pages, then set the source to the `main` branch and `/ (root)`.
3. Wait for the build, then open the URL Pages gives you.

## Resume links

The two buttons on `contact.html` point at:

```
Avyukt_Raghuvanshi_Resume_Hardware.pdf
Avyukt_Raghuvanshi_Resume_Software.pdf
```

Drop those PDFs in the same folder as the HTML files, or rename the links.

## Search engines

The site lives at https://raghuavy.github.io/, which only works while this repo
is named `raghuavy.github.io`. Every page has a canonical tag pointing at that
address, and `index.html` carries a JSON-LD block (Person, ProfilePage, and the
two organizations) that tells Google who the site is about. Keep that block in
step with the visible text when your role or links change.

- `sitemap.xml` lists the five pages. Add any new page there and give it a
  canonical tag like the others.
- `google0acc50ce945cb379.html` keeps the site verified in Google Search
  Console. Do not delete it.
- `404.html` forwards old `/about_me/...` links to the same page at the root.

## Changing the look

The theme is Hermes, the messenger: fully monochrome, like an engraving of a
statue in polished silver. Everything visual is a variable in the `:root` block
at the top of `assets/site.css`. With no colour on the page, meaning is carried
by brightness and marks: ordinary text is grey, measured values are near white,
and results that passed are pure white with a check mark. The `--acid`
variables keep their old names because `chirp.js` and `posit.js` read them; they
are now a silver ladder. The metal stack in the 3D model is a brightness ladder
too, defined in `assets/die.js`, and its legend colours sit in `index.html`.

The ornaments are all CSS: thin rays turning slowly behind each page title and
behind the die, a Roman numeral on every section eyebrow, the sign of Mercury
as the mark and favicon, and a cornice rule above the footer.

Fonts are Cormorant Garamond for display, Inter for body, JetBrains Mono for
anything that behaves like data. They are self-hosted in `assets/fonts/`.

## Hero art

The home page opens on a full screen stage, like a film behind glass: the
Hermes engraving is fixed to the screen and the page scrolls up over it.
`assets/hero.js` draws it live in WebGL2, every frame:

- the camera drifts slowly with real depth, the figure in front of the panel
  and the cables falling away behind him, and the cursor tilts it a little
- signals race out along the cables and rods he holds, each on its own clock
- lightning crawls through the panel, and every 7 to 14 seconds a strike sends
  one pulse down every cable at once
- a light moves over the silver, with dust in the air and film grain on top

On wide screens the camera pulls back so both fans of cables are in shot. On
phones it frames the face, and the art fades into the dark where the text
starts.

The live view loads two images after the page, about 800 KB together, and stops
drawing whenever the hero is off screen or the tab is hidden. "Pause motion"
freezes it on the current frame and is remembered on every page. Visitors who
prefer reduced motion get one still frame. Without WebGL2, or with Save-Data on,
the page keeps the still `hermes.webp` with the older CSS motion.

To inspect single frames, add `#hero-debug` to the URL. The clock stops, and
`heroDebug.at(seconds)` in the console draws that moment.

The framing lives in `LAYOUT` at the top of `hero.js`, and the still in
`.hero-art img` in `assets/site.css` mirrors it, so change both together.
Speeds and brightness are in the shader in the same file.

To swap the art, export the new image about 2800 px wide, greyscale, with its
black set to `#050505` so it melts into the page, and save it over both
`assets/hermes.webp` and `assets/hermes.jpg`. Then rebuild the two textures with
`tools/hero_fx.py` (how to run it is at the top of the file), or start "Build
hero textures" from the Actions tab, which runs it in the cloud and commits the
result. The effect map is measured from this engraving in particular, where
the cables converge, the panel edges, and the figure, so new art means redoing
those measurements and the matching constants at the top of `hero.js`. Until
then, delete the `<canvas>` line in `index.html` and the hero falls back to the
still.

## One tradeoff to know about

Because the three list pages render their content with JavaScript, that content
is not in the page source. Search engines that run JavaScript index it fine, and
`index.html` is fully static, but if you ever want the work page readable
without JavaScript, the fix is to paste the rendered HTML back into `work.html`
and drop the `content.js` tag.
