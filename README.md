# avyuktraghuvanshi.com

Personal site. Static HTML, CSS, and JavaScript. No build step, no framework,
no package manager.

Work, Research, and About build themselves from one markdown file, so adding a
project or a paper means editing `content/site.md` and pushing. Nothing else
needs touching.

## Structure

```
index.html          home, with the interactive silicon die and the RTL to GDSII rail
work.html           shell, filled from content/site.md
research.html       shell, filled from content/site.md
about.html          shell, filled from content/site.md
contact.html        contact
content/
  site.md           ALL the content for work, research, and about
assets/
  site.css          every style, all colours as CSS variables at the top
  site.js           sticky nav and scroll reveal, loaded on every page
  content.js        markdown parser and renderers
  die.js            the 3D die and the flow rail, index.html only
  chirp.js          the strain trace, research.html only
  posit.js          the posit8 decoder, encoder, and accuracy plot
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
- a `*` at the end of a spec value turns it green, for results that passed

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

## Changing the look

Everything visual is a variable in the `:root` block at the top of
`assets/site.css`. The site is near monochrome on black with a single accent,
`--acid` (#76B900). Because it is the only colour on the page, it is reserved
for things that mean something: brand marks, live state, and results that
passed. Measured values are white, everything else is grey.

Changing `--acid` recolours the die, the flow rail, the chirp, the posit lab,
the links, and the primary buttons together. The metal stack in the 3D model is
a brightness ladder of that same hue, defined in `assets/die.js`.

Fonts are Archivo for display, Inter for body, JetBrains Mono for anything that
behaves like data. They load from Google Fonts in each page head.

## One tradeoff to know about

Because the three list pages render their content with JavaScript, that content
is not in the page source. Search engines that run JavaScript index it fine, and
`index.html` is fully static, but if you ever want the work page readable
without JavaScript, the fix is to paste the rendered HTML back into `work.html`
and drop the `content.js` tag.
