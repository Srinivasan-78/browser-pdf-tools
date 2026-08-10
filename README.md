# PDF Editor

A single-file, client-side PDF editor that runs entirely in the browser — no backend, no upload to a server. Deployable as a static site on GitHub Pages.

## Features

- Upload one or more PDFs
- Merge/append additional PDFs into the current document
- Reorder pages via drag-and-drop
- Rotate individual pages or all pages
- Delete pages
- Add text to a page at a given position
- Download the edited PDF

## Tech

- [pdf-lib](https://pdf-lib.js.org/) — PDF editing/creation
- [pdf.js](https://mozilla.github.io/pdf.js/) — page rendering/thumbnails
- No build step, no dependencies to install — plain HTML/CSS/JS, libraries loaded from CDN

## Deploy to GitHub Pages

1. Create a new GitHub repo (or use an existing one).
2. Add `index.html` to the repo root.
3. Push to GitHub.
4. Go to **Settings → Pages**, set source to the branch/root you pushed to.
5. Your app will be live at `https://<username>.github.io/<repo>/`.

## Local use

Just open `index.html` in a browser — no server required.

## Privacy

All processing happens locally in the browser. Files are never uploaded anywhere.
