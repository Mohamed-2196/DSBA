"""Reads the text of one PDF or Word file, page by page. It runs in a child process of its own
(`python -m app.services.text_extract pdf|docx`, the file on stdin, JSON on stdout), so a file built to hang the
reader or eat memory takes down only that process: the text worker (app/services/paper_text.py) kills it after
a time limit and caps its memory.

Nothing here touches the database, the network or the disk. The output is plain text: control characters
(and the NUL bytes PostgreSQL refuses) become spaces, runs of spaces become one, and the whole is capped at
MAX_CHARS. Scanned papers have no text: they come back as empty pages."""

from __future__ import annotations

import io
import json
import re
import sys
import zipfile
from html import unescape

MAX_PAGES = 400  # pages read from a PDF; the rest stay unread
MAX_CHARS = 300_000  # characters kept from a file (about 150 pages of an exam paper)
MAX_DOCX_XML = 20 * 1024 * 1024  # word/document.xml, unpacked: a bigger one is a zip bomb or not a paper

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


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in READERS:
        print(f"usage: python -m app.services.text_extract {'|'.join(READERS)} < file", file=sys.stderr)
        return 2
    data = sys.stdin.buffer.read()
    try:
        pages = READERS[argv[0]](data)
    except ExtractError as e:
        json.dump({"error": str(e)}, sys.stdout)
        return 0
    except Exception as e:  # anything pypdf trips on in a damaged file
        json.dump({"error": f"unreadable ({type(e).__name__})"}, sys.stdout)
        return 0
    json.dump({"pages": pages}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
