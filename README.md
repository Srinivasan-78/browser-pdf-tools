# PDF Editor

A client-side, multi-tool PDF app — landing page of tools (Merge, Split, Remove/Extract/Reorder/Rotate Pages, Edit Text, Add Page Numbers, Add Text) — that runs entirely in the browser. No backend. Deployable as a static site on GitHub Pages.

## Files

- `index.html` — markup only
- `style.css` — styles
- `app.js` — all app logic
- `backend/` — optional FastAPI + PyMuPDF service that powers real text editing (see below)

## Features

- Upload one or more PDFs
- Merge multiple PDFs (drag to reorder before merging)
- Split a PDF into per-page files (downloaded as a .zip)
- Remove or extract specific pages (click thumbnails to select)
- Reorder pages via drag-and-drop
- Rotate individual pages or all pages
- Add page numbers
- Add new text at a clicked position
- **Edit existing text** (requires the backend, see below): click any text run on a page and type a replacement. The original run is redacted (real content removal, not a paint-over) and the replacement is drawn reusing the PDF's actual embedded font when it can be extracted, falling back to a metric-matched standard font (serif/sans/mono, bold, italic — detected from the span's font flags) only when it can't.

## The Edit Text backend

True in-place PDF text editing — reusing the original font, properly removing the old glyphs — isn't achievable purely client-side: browsers have no API to read a PDF's embedded font program and re-encode replacement text against it. `backend/` is a small FastAPI service using PyMuPDF (the same engine behind MuPDF) that does this properly:

- `POST /api/inspect` — given a PDF + page number, returns each text span's exact position, font name, size, color, and style flags.
- `POST /api/apply-edits` — given the PDF + a list of edits, redacts each original span (`add_redact_annot` + `apply_redactions`, which removes the underlying content) and redraws the replacement, extracting and re-embedding the original font by xref when available.

### Running it

```
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

or with Docker: `docker build -t pdf-backend backend && docker run -p 8000:8000 pdf-backend`.

It needs to run on a normal persistent host you control — your own machine, a VPS, Fly.io, Render, etc. **Not** a GitHub Actions self-hosted runner: a runner only executes on CI triggers (push, `workflow_dispatch`), it isn't a listening web server, and there's no safe way to expose the repo-write token needed to trigger it to public client-side JS.

Then set `BACKEND_URL` at the top of `app.js` to wherever it's hosted, e.g.:
```js
const BACKEND_URL = "https://your-backend.example.com";
```
and lock down `allow_origins` in `backend/main.py` to your actual GitHub Pages origin instead of `"*"` before deploying for real.

Every other tool (merge, split, rotate, page numbers, etc.) stays fully client-side and works without the backend.

## Tech

- [pdf-lib](https://pdf-lib.js.org/) — PDF editing/creation
- [pdf.js](https://mozilla.github.io/pdf.js/) — page rendering/thumbnails
- No build step, no dependencies to install — plain HTML/CSS/JS, libraries loaded from CDN

## Local use

Just open `index.html` in a browser — no server required.

## Privacy

All processing happens locally in the browser. Files are never uploaded anywhere.
