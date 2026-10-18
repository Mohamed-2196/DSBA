"""A note's typed text: a ProseMirror document as the web app's editor writes it (web/src/features/notes/text).

`check()` accepts only the nodes and marks the editor has, small scalar attributes, links to the web, and the pictures
a note can show: in the text (`image` nodes: a share of the text's width, turned in quarter turns) and free on its
pages (the document's own `pictures` attribute: a box on a sheet, in sheet units, turned by any angle; the web app's
features/notes/pictures). It answers the document's plain text (for search, excerpts and Mini Noora: a picture's
caption and description, a file's name) and the uploads its pictures and files use. The web app renders the document
through the editor's schema, never as HTML."""

from __future__ import annotations

import json
import math
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.core.errors import invalid
from app.schemas.notes import DOC_MAX_BYTES, PAPER_SHEETS_FROM, SHEET_HEIGHT, SHEET_WIDTH

BLOCKS = frozenset(
    {
        "doc",
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "taskList",
        "taskItem",
        "blockquote",
        "codeBlock",
        "horizontalRule",
        "blockMath",
        "image",
        "attachment",
    }
)
INLINES = frozenset({"text", "hardBreak", "inlineMath"})
MARKS = frozenset({"bold", "italic", "underline", "strike", "code", "link", "highlight"})
# Nodes that refer to a file of the note's (an upload with purpose note_file).
FILE_NODES = frozenset({"image", "attachment"})
MAX_DEPTH = 24
MAX_ATTR = 4000  # characters in one attribute (a long formula)

# Pictures in one note: in the text and free on its pages together.
MAX_PICTURES = 200
CAPTION_MAX = 300
ALT_MAX = 500
RATIO_MIN, RATIO_MAX = 0.05, 20.0  # the original picture's width over its height
MIN_CROP = 0.05  # the smallest part of a picture kept, as a share of its width or height
EDGE = 1e-3  # what the web app's rounding may leave over
# A picture in the text: its share of the text's width, at least this.
INLINE_WIDTH_MIN = 0.12
TURNS = frozenset({0, 90, 180, 270})
# A picture free on a page: its box before it is turned, in the sheet's units, its middle on the sheet.
FREE_REQUIRED = frozenset(
    {"id", "upload", "sheet", "x", "y", "w", "h", "angle", "ratio", "cropX", "cropY", "cropW", "cropH"}
)
FREE_KEYS = FREE_REQUIRED | {"alt", "caption"}
FREE_MIN = 16
# How tall a PDF's page may be, in units (a PDF's page keeps its own shape, and the server doesn't read the PDF).
PDF_PAGE_MAX = 50_000
PICTURE_ID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


@dataclass
class Checked:
    text: str
    uploads: set[uuid.UUID] = field(default_factory=set)


def _bad(message: str = "This note's text can't be saved: reload the page and try again.") -> Exception:
    return invalid("doc", message)


def _too_many() -> Exception:
    return _bad(f"A note holds up to {MAX_PICTURES} pictures. Put the others in another note.")


def _check_attrs(attrs: object) -> dict[str, Any]:
    if attrs is None:
        return {}
    if not isinstance(attrs, dict) or len(attrs) > 16:
        raise _bad()
    for k, v in attrs.items():
        if not isinstance(k, str) or len(k) > 40:
            raise _bad()
        if isinstance(v, str):
            if len(v) > MAX_ATTR:
                raise _bad("A formula or link in this note is too long.")
        elif not (v is None or isinstance(v, (bool, int)) or (isinstance(v, float) and math.isfinite(v))):
            raise _bad()
    return attrs


def _check_mark(mark: object) -> None:
    if not isinstance(mark, dict) or mark.get("type") not in MARKS:
        raise _bad()
    attrs = _check_attrs(mark.get("attrs"))
    if mark["type"] == "link":
        href = attrs.get("href")
        if not isinstance(href, str) or not href.lower().startswith(("https://", "http://", "mailto:")):
            raise _bad("Links in notes start with https://, http:// or mailto:.")


def _upload_id(attrs: dict[str, Any]) -> uuid.UUID:
    try:
        return uuid.UUID(str(attrs.get("upload")))
    except ValueError:
        raise _bad() from None


def _number(value: object, low: float, high: float) -> float:
    """A finite number from `low` to `high` (a bool isn't one), or 422."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise _bad()
    if not low <= value <= high:
        raise _bad()
    return float(value)


def _words(attrs: dict[str, Any], key: str, limit: int) -> str:
    value = attrs.get(key)
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise _bad()
    return value


def _labels(attrs: dict[str, Any]) -> list[str]:
    """What a picture says in words: its caption, then its description."""
    labels = (_words(attrs, "caption", CAPTION_MAX), _words(attrs, "alt", ALT_MAX))
    return [label.strip() for label in labels if label.strip()]


def _check_crop(attrs: dict[str, Any]) -> None:
    """The part of a picture kept, in fractions of it: inside the picture, at least MIN_CROP of it each way."""
    left = _number(attrs.get("cropX", 0), 0, 1)
    top = _number(attrs.get("cropY", 0), 0, 1)
    width = _number(attrs.get("cropW", 1), MIN_CROP - EDGE, 1)
    height = _number(attrs.get("cropH", 1), MIN_CROP - EDGE, 1)
    if left + width > 1 + EDGE or top + height > 1 + EDGE:
        raise _bad()


def _check_inline_picture(attrs: dict[str, Any]) -> None:
    """A picture in the text: its share of the text's width, its place across it, its shape, turn and crop."""
    if attrs.get("width") is not None:
        _number(attrs["width"], INLINE_WIDTH_MIN - EDGE, 1)
    if attrs.get("x") is not None:
        _number(attrs["x"], 0, 1)
    if attrs.get("ratio") is not None:
        _number(attrs["ratio"], RATIO_MIN, RATIO_MAX)
    if attrs.get("rotate") is not None and _number(attrs["rotate"], 0, 270) not in TURNS:
        raise _bad()
    _check_crop(attrs)


def _check_free_picture(picture: object, sheets: int) -> dict[str, Any]:
    """A picture free on a page: on one of the note's sheets (a PDF's page, or one of its `sheets` of paper), a sane
    size with its middle on the sheet, turned from 0 up to 360 degrees."""
    if not isinstance(picture, dict) or not FREE_REQUIRED <= picture.keys() <= FREE_KEYS:
        raise _bad()
    if not isinstance(picture["id"], str) or not PICTURE_ID.match(picture["id"]):
        raise _bad()
    sheet = picture["sheet"]
    if isinstance(sheet, bool) or not isinstance(sheet, int):
        raise _bad()
    if not 0 <= sheet < PAPER_SHEETS_FROM + sheets:
        raise _bad("A picture in this note is on a page the note doesn't have. Reload the page and try again.")
    page_height = SHEET_HEIGHT if sheet >= PAPER_SHEETS_FROM else PDF_PAGE_MAX
    w = _number(picture["w"], FREE_MIN, SHEET_WIDTH)
    h = _number(picture["h"], FREE_MIN, page_height)
    x = _number(picture["x"], -SHEET_WIDTH, SHEET_WIDTH)
    y = _number(picture["y"], -page_height, page_height)
    if not (0 <= x + w / 2 <= SHEET_WIDTH and 0 <= y + h / 2 <= page_height):
        raise _bad("A picture in this note is off its page. Reload the page and try again.")
    if _number(picture["angle"], 0, 360) >= 360:
        raise _bad()
    _number(picture["ratio"], RATIO_MIN, RATIO_MAX)
    _check_crop(picture)
    return picture


def _free_pictures(attrs: object, sheets: int) -> list[dict[str, Any]]:
    """The document's own attributes: its free pictures, and nothing else."""
    if attrs is None:
        return []
    if not isinstance(attrs, dict) or not set(attrs) <= {"pictures"}:
        raise _bad()
    pictures = attrs.get("pictures")
    if pictures is None:
        return []
    if not isinstance(pictures, list):
        raise _bad()
    if len(pictures) > MAX_PICTURES:
        raise _too_many()
    checked = [_check_free_picture(p, sheets) for p in pictures]
    if len({p["id"] for p in checked}) != len(checked):
        raise _bad()
    return checked


def check(doc: dict[str, Any], *, sheets: int) -> Checked:
    """The document's plain text and its uploads, or 422 invalid_input (field `doc`) when it holds anything else, is
    longer than DOC_MAX_BYTES as JSON, or has a free picture off the note's sheets (its PDF's pages, then `sheets` of
    paper)."""
    if len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()) > DOC_MAX_BYTES:
        raise invalid("doc", "This note is too long. Split it into two notes.")
    if doc.get("type") != "doc":
        raise _bad()
    out = Checked(text="")
    lines: list[str] = []
    line: list[str] = []
    in_text = 0

    def end_line() -> None:
        if line:
            lines.append("".join(line).strip())
            line.clear()

    def walk(node: object, depth: int) -> None:
        nonlocal in_text
        if depth > MAX_DEPTH or not isinstance(node, dict):
            raise _bad()
        kind = node.get("type")
        if kind not in BLOCKS and kind not in INLINES:
            raise _bad()
        # the document's own attributes are its free pictures (checked apart)
        attrs = _check_attrs(node.get("attrs")) if depth else {}
        marks = node.get("marks")
        if marks is not None:
            if not isinstance(marks, list) or len(marks) > 8:
                raise _bad()
            for m in marks:
                _check_mark(m)
        if kind == "text":
            value = node.get("text")
            if not isinstance(value, str) or not value:
                raise _bad()
            line.append(value)
            return
        if kind == "hardBreak":
            end_line()
            return
        if kind == "inlineMath":
            line.append(f"${attrs.get('latex') or ''}$")
            return
        if kind in FILE_NODES:
            out.uploads.add(_upload_id(attrs))
            end_line()
            if kind == "image":
                _check_inline_picture(attrs)
                in_text += 1
                lines.extend(_labels(attrs))
            else:
                name = attrs.get("name")
                if isinstance(name, str) and name.strip():
                    lines.append(name.strip())
            return
        if kind == "blockMath":
            end_line()
            lines.append(f"$${attrs.get('latex') or ''}$$")
            return
        content = node.get("content")
        if content is not None:
            if not isinstance(content, list):
                raise _bad()
            if kind == "taskItem":
                line.append("[x] " if attrs.get("checked") else "[ ] ")
            for child in content:
                walk(child, depth + 1)
        if kind in ("paragraph", "heading", "codeBlock"):
            end_line()

    free = _free_pictures(doc.get("attrs"), sheets)
    walk(doc, 0)
    end_line()
    if in_text + len(free) > MAX_PICTURES:
        raise _too_many()
    # The free pictures' words come after the text, in the order they are read: page by page, top to bottom.
    for picture in sorted(free, key=lambda p: (p["sheet"], p["y"], p["x"])):
        out.uploads.add(_upload_id(picture))
        lines.extend(_labels(picture))
    out.text = "\n".join(t for t in lines if t)
    return out
