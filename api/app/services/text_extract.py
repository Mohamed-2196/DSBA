"""Reads the text of one PDF or Word file, page by page, and makes its cover. It runs in a child process of its own
(`python -m app.services.text_extract pdf|docx [--cover]`, the file on stdin, JSON on stdout), so a file
built to hang the reader or eat memory takes down only that process: the text worker (app/services/paper_text.py)
kills it after a time limit, caps its memory and gives it no secrets in its environment.

Nothing here touches the database, the network or the disk. The text is plain: control characters (and the NUL
bytes PostgreSQL refuses) become spaces, runs of spaces become one, and the whole is capped at MAX_CHARS. Scanned
papers have no text: they come back as empty pages.

The cover is the first page as a small WebP picture, COVER_WIDTH pixels wide, base64 in the JSON: a PDF's first page
rendered by PDFium, or the preview picture Word saves inside a .docx (docProps/thumbnail), when it has one. A file
that gives no cover still gives its text."""

from __future__ import annotations

import base64
import io
import json
import re
import sys
import warnings
import zipfile
from html import unescape
from typing import Any

MAX_PAGES = 400  # pages read from a PDF; the rest stay unread
MAX_CHARS = 300_000  # characters kept from a file (about 150 pages of an exam paper)
MAX_DOCX_XML = 20 * 1024 * 1024  # word/document.xml, unpacked: a bigger one is a zip bomb or not a paper

COVER_WIDTH = 360  # pixels: twice the widest card that shows a cover
COVER_MAX_HEIGHT = 720  # a page far taller than wide is cut to this
COVER_QUALITY = 72
COVER_MAX_BYTES = 256 * 1024
MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024  # a .docx's preview picture, unpacked
MAX_PICTURE_PIXELS = 40_000_000  # more is a decompression bomb, not a preview

_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]+")
_SPACES = re.compile(r"[ \t\r\xa0]+")
_BLANK_LINES = re.compile(r"\n\s*\n+")
# word/document.xml: a paragraph or line break ends a line; w:t holds the text.
_DOCX_BREAK = re.compile(r"</w:p>|<w:br\b[^>]*/>|<w:tab\b[^>]*/>")
_DOCX_TEXT = re.compile(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>")


class ExtractError(Exception):
    """The file can't be read: damaged, encrypted, or not what its name says."""


def clean(text: str) -> str:
    text = _CONTROL.sub(" ", text.replace("\f", " "))
    text = _SPACES.sub(" ", text)
    return _BLANK_LINES.sub("\n", text).strip()


def _capped(pages: list[str]) -> list[str]:
    out: list[str] = []
    room = MAX_CHARS
    for page in pages:
        if room <= 0:
            break
        out.append(page[:room])
        room -= len(out[-1])
    return out


def pdf_pages(data: bytes) -> list[str]:
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ExtractError("the PDF is encrypted")
        pages: list[str] = []
        room = MAX_CHARS
        for page in reader.pages[:MAX_PAGES]:
            if room <= 0:
                break
            text = clean(page.extract_text() or "")
            pages.append(text)
            room -= len(text)
    except PyPdfError as e:
        raise ExtractError(f"pypdf: {type(e).__name__}") from e
    return _capped(pages)


def docx_pages(data: bytes) -> list[str]:
    """A Word file as one page (Word decides its pages when it lays the document out)."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            info = z.getinfo("word/document.xml")
            if info.file_size > MAX_DOCX_XML:
                raise ExtractError("the document is too big to read")
            xml = z.read(info).decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, KeyError) as e:
        raise ExtractError("not a Word file") from e
    lines = (" ".join(_DOCX_TEXT.findall(part)) for part in _DOCX_BREAK.split(xml))
    text = clean("\n".join(unescape(line) for line in lines))
    return _capped([text])


READERS = {"pdf": pdf_pages, "docx": docx_pages}


# ── covers ───────────────────────────────────────────────────────────────────────────────────


def to_webp(picture: Any) -> bytes:
    """A PIL image as the cover: RGB, COVER_WIDTH wide (never enlarged), at most COVER_MAX_HEIGHT tall (cut from the
    top), WebP."""
    from PIL import Image

    img = picture.convert("RGB")
    if img.width > COVER_WIDTH:
        img = img.resize((COVER_WIDTH, max(1, round(img.height * COVER_WIDTH / img.width))), Image.Resampling.LANCZOS)
    if img.height > COVER_MAX_HEIGHT:
        img = img.crop((0, 0, img.width, COVER_MAX_HEIGHT))
    out = io.BytesIO()
    img.save(out, "WEBP", quality=COVER_QUALITY, method=4)
    data = out.getvalue()
    if len(data) > COVER_MAX_BYTES:
        raise ExtractError("the cover came out too big")
    return data


def pdf_cover(data: bytes) -> bytes | None:
    """The first page, rendered COVER_WIDTH pixels wide."""
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(data)
    try:
        if len(doc) == 0:
            return None
        page = doc[0]
        width, height = page.get_size()
        if width <= 0 or height <= 0:
            return None
        scale = min(COVER_WIDTH / width, 4.0)
        picture = page.render(scale=scale, may_draw_forms=False).to_pil()
    finally:
        doc.close()
    return to_webp(picture)


def docx_cover(data: bytes) -> bytes | None:
    """The preview picture Word saved with the file (docProps/thumbnail.jpeg or .png), if any."""
    from PIL import Image

    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = [n for n in z.namelist() if n.lower() in ("docprops/thumbnail.jpeg", "docprops/thumbnail.png")]
        if not names:
            return None
        info = z.getinfo(names[0])
        if info.file_size > MAX_THUMBNAIL_BYTES:
            return None
        raw = z.read(info)
    Image.MAX_IMAGE_PIXELS = MAX_PICTURE_PIXELS
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        picture = Image.open(io.BytesIO(raw), formats=("JPEG", "PNG"))
        picture.load()
    return to_webp(picture)


COVERS = {"pdf": pdf_cover, "docx": docx_cover}


def cover_of(fmt: str, data: bytes) -> tuple[str | None, str | None]:
    """(the cover as base64, None) or (None, why there is none)."""
    try:
        cover = COVERS[fmt](data)
    except Exception as e:  # anything PDFium or Pillow trips on: the text still counts
        return None, f"no cover ({type(e).__name__})"
    if cover is None:
        return None, "no cover in the file"
    return base64.b64encode(cover).decode("ascii"), None


def main(argv: list[str]) -> int:
    flags = set(argv[1:])
    if not argv or argv[0] not in READERS or not flags <= {"--cover"}:
        print(f"usage: python -m app.services.text_extract {'|'.join(READERS)} [--cover] < file", file=sys.stderr)
        return 2
    fmt = argv[0]
    data = sys.stdin.buffer.read()
    out: dict[str, Any] = {}
    if "--cover" in flags:
        out["cover"], out["cover_error"] = cover_of(fmt, data)
    try:
        out["pages"] = READERS[fmt](data)
    except ExtractError as e:
        out["error"] = str(e)
    except Exception as e:  # anything pypdf trips on in a damaged file
        out["error"] = f"unreadable ({type(e).__name__})"
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
