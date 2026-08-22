# avyuktraghuvanshi.com

Personal site. Static HTML, CSS, and JavaScript. No build step, no framework,
no package manager.

## Structure

```
index.html        home, with the interactive silicon die and the RTL to GDSII rail
work.html         chips and boards
research.html     LIGO, DUNE and NOvA, neuromorphic, publications
about.html        education, leadership, teaching, toolbox
contact.html      how to reach me
assets/
  site.css        every style on the site, all colours as CSS variables at the top
  site.js         sticky nav state and scroll reveal, loaded on every page
  die.js          the 3D die and the flow rail, loaded on index.html only
  chirp.js        the strain trace, loaded on research.html only
```

three.js loads from cdnjs on the home page only. If it fails to load, the canvas
is replaced with a short message and the rest of the page keeps working.

## Running it

Open `index.html` in a browser. Keep the `assets` folder next to the HTML files
or nothing will be styled.

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
`assets/site.css`. The palette is Catppuccin Mocha. Accent colours carry meaning
rather than decoration: mauve for silicon, teal for physics, peach for people.
Changing `--mauve` recolours the die, the flow rail, the links, and the primary
buttons together.

Fonts are Syne for display, Manrope for body, JetBrains Mono for anything that
behaves like data. They come from Google Fonts in each page head.
