"""A note's typed text: a ProseMirror document as the web app's editor writes it (web/src/features/notes/text).

`check()` accepts only the nodes and marks the editor has, small scalar attributes, and links to the web; it
answers the document's plain text (for search, excerpts and Mini Noora: a picture's caption and description, a file's
name) and the uploads its pictures and files use. The web app renders the document through the editor's schema,
never as HTML."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.core.errors import invalid
from app.schemas.notes import DOC_MAX_BYTES

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


@dataclass
class Checked:
    text: str
    uploads: set[uuid.UUID] = field(default_factory=set)


def _bad(message: str = "This note's text can't be saved: reload the page and try again.") -> Exception:
    return invalid("doc", message)


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
        elif not (v is None or isinstance(v, (bool, int, float))):
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


def check(doc: dict[str, Any]) -> Checked:
    """The document's plain text and its uploads, or 422 invalid_input (field `doc`) when it holds anything else or is
    longer than DOC_MAX_BYTES as JSON."""
    if len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()) > DOC_MAX_BYTES:
        raise invalid("doc", "This note is too long. Split it into two notes.")
    if doc.get("type") != "doc":
        raise _bad()
    out = Checked(text="")
    lines: list[str] = []
    line: list[str] = []

    def end_line() -> None:
        if line:
            lines.append("".join(line).strip())
            line.clear()

    def walk(node: object, depth: int) -> None:
        if depth > MAX_DEPTH or not isinstance(node, dict):
            raise _bad()
        kind = node.get("type")
        if kind not in BLOCKS and kind not in INLINES:
            raise _bad()
        attrs = _check_attrs(node.get("attrs"))
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
            labels = [attrs.get("name")] if kind == "attachment" else [attrs.get("caption"), attrs.get("alt")]
            end_line()
            lines.extend(label.strip() for label in labels if isinstance(label, str) and label.strip())
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

    walk(doc, 0)
    end_line()
    out.text = "\n".join(t for t in lines if t)
    return out
