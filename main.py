# @authormark v1 -- do not remove (authorship watermark)
# Copyright (c) 2026 Srinivasan Vijayaraghavan <srinivasan.shyam2000@gmail.com>
# Author: https://github.com/Srinivasan-78
# SPDX-License-Identifier: MIT
# Fingerprint: AMK1.LqyY5R83zz-ViC4aT8e-L8
"""
PDF Tools backend — real text editing via PyMuPDF (MuPDF core).

Two endpoints:
  POST /api/inspect       -> extract real text spans (position, font, size, color) for a page
  POST /api/apply-edits   -> redact original spans and redraw replacements, reusing the
                              PDF's actual embedded font where possible; falls back to a
                              metric-matched standard font (bold/italic/serif/mono detected
                              from the span's font flags) only when the original font can't
                              be extracted (e.g. a non-embedded base font).

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000

This must run on a real persistent host (your own machine, a VPS, Fly.io, Render, etc.).
It is NOT a GitHub Actions job — a self-hosted Actions runner only executes on CI
triggers, it can't serve HTTP requests, and putting a repo-write token in client-side
JS to trigger one would leak that token to anyone visiting the page.
"""

import io
import json

import pymupdf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="PDF Tools backend")

# Restrict allow_origins to your actual GitHub Pages origin in production,
# e.g. ["https://<username>.github.io"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


FALLBACK_FONTS = {
    # (bold, italic, serif, mono)
    (False, False, False, False): "Helvetica",
    (True, False, False, False): "Helvetica-Bold",
    (False, True, False, False): "Helvetica-Oblique",
    (True, True, False, False): "Helvetica-BoldOblique",
    (False, False, True, False): "Times-Roman",
    (True, False, True, False): "Times-Bold",
    (False, True, True, False): "Times-Italic",
    (True, True, True, False): "Times-BoldItalic",
    (False, False, False, True): "Courier",
    (True, False, False, True): "Courier-Bold",
    (False, True, False, True): "Courier-Oblique",
    (True, True, False, True): "Courier-BoldOblique",
    (False, False, True, True): "Courier",
    (True, False, True, True): "Courier-Bold",
    (False, True, True, True): "Courier-Oblique",
    (True, True, True, True): "Courier-BoldOblique",
}


def pick_fallback_font(flags: int) -> str:
    """Metric-matched PDF standard font, used only when the original font
    can't be extracted/embedded. Bits per PyMuPDF span['flags']:
    0 superscript, 1 italic, 2 serifed, 3 monospaced, 4 bold."""
    bold = bool(flags & (1 << 4))
    italic = bool(flags & (1 << 1))
    serif = bool(flags & (1 << 2))
    mono = bool(flags & (1 << 3))
    return FALLBACK_FONTS.get((bold, italic, serif, mono), "Helvetica")


def open_pdf(data: bytes):
    """Open an upload, or answer 400 saying why.

    Without this a corrupt or non-PDF upload surfaces as a bare 500, which
    reads as "the server is broken" rather than "that file is not a PDF".
    """
    if not data:
        raise HTTPException(status_code=400, detail="no file content received")
    try:
        return pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"could not open this file as a PDF: {exc}") from exc


def parse_edits(edits: str):
    """Validate the edits form field before any of it is trusted.

    Every key read later -- page, bbox -- is checked here, so a malformed
    request fails with a description of what is wrong instead of a KeyError
    or an IndexError halfway through mutating the document.
    """
    try:
        edit_list = json.loads(edits)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"edits is not valid JSON: {exc}") from exc

    if not isinstance(edit_list, list):
        raise HTTPException(status_code=400, detail="edits must be a JSON array")

    for i, e in enumerate(edit_list):
        if not isinstance(e, dict):
            raise HTTPException(status_code=400, detail=f"edits[{i}] is not an object")
        if not isinstance(e.get("page"), int) or isinstance(e.get("page"), bool):
            raise HTTPException(status_code=400, detail=f"edits[{i}].page must be an integer")
        bbox = e.get("bbox")
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            raise HTTPException(status_code=400, detail=f"edits[{i}].bbox must be four numbers")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in bbox):
            raise HTTPException(status_code=400, detail=f"edits[{i}].bbox must be four numbers")
        if not isinstance(e.get("newText"), str):
            raise HTTPException(status_code=400, detail=f"edits[{i}].newText must be a string")

    return edit_list


@app.post("/api/inspect")
async def inspect(file: UploadFile = File(...), page: int = Form(...)):
    data = await file.read()
    doc = open_pdf(data)
    if not 0 <= page < doc.page_count:
        doc.close()
        raise HTTPException(
            status_code=400,
            detail=f"page {page} out of range: this document has {doc.page_count} pages",
        )
    pg = doc[page]
    rect = pg.rect
    raw = pg.get_text("dict")

    spans = []
    sid = 0
    for block in raw.get("blocks", []):
        if block.get("type") != 0:  # 0 = text block
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text.strip():
                    continue
                color_int = span.get("color", 0)
                r = (color_int >> 16) & 255
                g = (color_int >> 8) & 255
                b = color_int & 255
                spans.append({
                    "id": sid,
                    "bbox": list(span["bbox"]),
                    "text": text,
                    "font": span.get("font", ""),
                    "size": span.get("size", 12),
                    "flags": span.get("flags", 0),
                    "color": [r, g, b],
                })
                sid += 1

    doc.close()
    return {"width": rect.width, "height": rect.height, "spans": spans}


@app.post("/api/apply-edits")
async def apply_edits(file: UploadFile = File(...), edits: str = Form(...)):
    data = await file.read()
    edit_list = parse_edits(edits)
    doc = open_pdf(data)

    by_page = {}
    for e in edit_list:
        page_num = e["page"]
        if not 0 <= page_num < doc.page_count:
            doc.close()
            raise HTTPException(
                status_code=400,
                detail=f"edit targets page {page_num}, but this document has {doc.page_count} pages",
            )
        by_page.setdefault(page_num, []).append(e)

    for page_num, page_edits in by_page.items():
        pg = doc[page_num]

        # basefont name -> font alias already embedded on this page, so we
        # only extract/embed each distinct font once even if reused by
        # several edited spans
        font_cache = {}
        page_fonts = {f[3]: f[0] for f in pg.get_fonts(full=False)}  # basefont -> xref

        # Step 1: redact the original spans (removes the underlying content,
        # not just a white paint-over)
        for e in page_edits:
            rect = pymupdf.Rect(e["bbox"])
            rect.x0 -= 1
            rect.x1 += 1
            rect.y0 -= 1
            rect.y1 += 2
            pg.add_redact_annot(rect, fill=(1, 1, 1))
        pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)

        # Step 2: redraw replacement text, reusing the original embedded
        # font whenever it can be extracted
        for e in page_edits:
            basefont = e.get("font", "")
            fontname = font_cache.get(basefont)

            if not fontname and basefont in page_fonts:
                try:
                    xref = page_fonts[basefont]
                    extracted = doc.extract_font(xref)
                    fontbuffer = extracted[3]
                    if fontbuffer:
                        alias = f"F_{xref}"
                        pg.insert_font(fontname=alias, fontbuffer=fontbuffer)
                        font_cache[basefont] = alias
                        fontname = alias
                except Exception:
                    fontname = None

            if not fontname:
                fontname = pick_fallback_font(e.get("flags", 0))

            color = tuple(c / 255 for c in e.get("color", [0, 0, 0]))
            x0, y0, x1, y1 = e["bbox"]
            size = e.get("size", 12)
            baseline_y = y1 - size * 0.2  # approximate baseline from the bbox bottom

            try:
                pg.insert_text((x0, baseline_y), e["newText"], fontsize=size, fontname=fontname, color=color)
            except Exception:
                fallback = pick_fallback_font(e.get("flags", 0))
                pg.insert_text((x0, baseline_y), e["newText"], fontsize=size, fontname=fallback, color=color)

    out = io.BytesIO()
    doc.save(out)
    doc.close()
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=edited.pdf"},
    )
