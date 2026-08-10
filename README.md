# PDF Editor

A client-side, multi-tool PDF app — landing page of tools (Merge, Split, Remove/Extract/Reorder/Rotate Pages, Edit Text, Add Page Numbers, Add Text) — that runs entirely in the browser. No backend. Deployable as a static site on GitHub Pages.

## Files

- `index.html` — markup only
- `style.css` — styles
- `app.js` — all app logic

## Features

- Upload one or more PDFs
- Merge multiple PDFs (drag to reorder before merging)
- Split a PDF into per-page files (downloaded as a .zip)
- Remove or extract specific pages (click thumbnails to select)
- Reorder pages via drag-and-drop
- Rotate individual pages or all pages
- Add page numbers
- Add new text at a clicked position
- **Edit existing text**: click any text run on a page and type a replacement. On export, the original run is covered and the replacement is drawn using the closest matching standard font — Helvetica/Times/Courier in the detected weight (bold/regular) and style (italic/regular), inferred from the PDF's actual font metadata via pdf.js.

## Known limitation: font matching, not font embedding

PDFs don't expose their embedded font programs in a form a browser can just re-use, so this can't literally embed the document's original font when redrawing edited text — it detects the closest **style** (serif/sans/monospace, bold, italic) and substitutes a standard font. Visually close for most documents; won't be pixel-identical for a document set in a distinctive display or custom font.

## Tech

- [pdf-lib](https://pdf-lib.js.org/) — PDF editing/creation
- [pdf.js](https://mozilla.github.io/pdf.js/) — page rendering/thumbnails
- No build step, no dependencies to install — plain HTML/CSS/JS, libraries loaded from CDN

## Deploy to GitHub Pages

1. Create a new GitHub repo (or use an existing one).
2. Add `index.html`, `style.css`, and `app.js` to the repo root.
3. Push to GitHub.
4. Go to **Settings → Pages**, set source to the branch/root you pushed to.
5. Your app will be live at `https://<username>.github.io/<repo>/`.

## Local use

Just open `index.html` in a browser — no server required.

## Privacy

All processing happens locally in the browser. Files are never uploaded anywhere.
