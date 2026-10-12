"""The forum's small markdown (paragraphs, lists, quotes, fenced code, **bold**, *italic*, `code`, links and images,
as web/src/features/forum/lib/markdown.js parses it) turned into plain text: excerpts, the first picture of a post and
the forum images it refers to. Also the cleaning every title and body goes through before it is stored.

Nothing here touches the database: search and other areas can use it for forum text too (code quality review CQ-6).
Control characters (NUL above all) are dropped from what people write: the middleware that refuses them in addresses
doesn't see request bodies."""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from typing import Literal

from app.core.links import MEDIA_PATH  # the paths /media serves: one definition (code quality review CQ-6)

EXCERPT_LENGTH = 200

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACES = re.compile(r"\s+")


def clean_title(value: str) -> str:
    """One line: control characters dropped, runs of whitespace collapsed."""
    return _SPACES.sub(" ", _CONTROL_CHARS.sub("", value)).strip()


def clean_body(value: str) -> str:
    """Markdown as typed, with \\n line ends and without control characters (Postgres can't store NUL)."""
    return _CONTROL_CHARS.sub("", value.replace("\r\n", "\n").replace("\r", "\n")).strip()


def has_text(value: str) -> bool:
    """Something would show: a letter, a digit, punctuation or a symbol (an emoji counts)."""
    return any(unicodedata.category(ch)[0] in "LNPS" for ch in value)


_FENCE = re.compile(r"^\s*```")
_UL = re.compile(r"^\s*[-*]\s+")
_OL = re.compile(r"^\s*\d+[.)]\s+")
_QUOTE = re.compile(r"^\s*>\s?")
_HEADING = re.compile(r"(?m)^[ \t]*#{1,6}[ \t]+")
_IMAGE_LINE = re.compile(r"^\s*!\[([^\]\n]*)\]\(([^\s)]+)\)\s*$")
_IMAGE = re.compile(r"!\[([^\]\n]*)\]\(([^\s)]*)\)")
_CODE_SPAN = re.compile(r"`[^`\n]+`")
# Inline tokens, leftmost first: code, image, bold, italic, link. Underscores are not italic (R_f, β_i).
_INLINE = re.compile(
    r"(`[^`\n]+`)"
    r"|(!\[([^\]\n]*)\]\([^\s)]*\))"
    r"|(\*\*[^*\n]+?\*\*)"
    r"|(\*[^*\s][^*\n]*?\*)"
    r"|(\[[^\]\n]+\]\((?:/[^\s)]*|https?://[^\s)]+|mailto:[^\s)]+)\))"
)
_EXCERPT_TAIL = re.compile(r"[\s,.;:!?(–\-،؛؟]+$")  # noqa: RUF001 - the Arabic comma and question mark are meant


@dataclass(frozen=True, slots=True)
class _Block:
    kind: Literal["p", "list", "quote", "code", "image"]
    texts: tuple[str, ...] = ()
    alt: str = ""
    src: str = ""


def _block_start(line: str) -> bool:
    return any(rx.match(line) for rx in (_FENCE, _UL, _OL, _QUOTE, _IMAGE_LINE))


def parse_blocks(src: str) -> list[_Block]:
    """Paragraphs, lists, quotes, fenced code and images on a line of their own (as the web app parses them)."""
    lines = src.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[_Block] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if _FENCE.match(line):
            buf: list[str] = []
            i += 1
            while i < len(lines) and not _FENCE.match(lines[i]):
                buf.append(lines[i])
                i += 1
            i += 1  # the closing fence (or the end)
            blocks.append(_Block("code", ("\n".join(buf),)))
            continue
        if _UL.match(line) or _OL.match(line):
            rx = _OL if _OL.match(line) else _UL
            items: list[str] = []
            while i < len(lines) and rx.match(lines[i]):
                items.append(rx.sub("", lines[i], count=1))
                i += 1
            blocks.append(_Block("list", tuple(items)))
            continue
        if _QUOTE.match(line):
            buf = []
            while i < len(lines) and _QUOTE.match(lines[i]):
                buf.append(_QUOTE.sub("", lines[i], count=1))
                i += 1
            blocks.append(_Block("quote", ("\n".join(buf),)))
            continue
        image = _IMAGE_LINE.match(line)
        if image:
            blocks.append(_Block("image", alt=image.group(1).strip(), src=image.group(2)))
            i += 1
            continue
        buf = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not _block_start(lines[i]):
            buf.append(lines[i])
            i += 1
        blocks.append(_Block("p", ("\n".join(buf),)))
    return blocks


def _inline_plain(text: str, image_alt: bool) -> str:
    text = _HEADING.sub("", text)
    out: list[str] = []
    last = 0
    for m in _INLINE.finditer(text):
        out.append(text[last : m.start()])
        tok = m.group(0)
        if m.group(1):  # `code`
            out.append(tok[1:-1])
        elif m.group(2):  # ![alt](src)
            out.append(m.group(3) if image_alt else "")
        elif m.group(4):  # **bold**
            out.append(tok[2:-2])
        elif m.group(5):  # *italic*
            out.append(tok[1:-1])
        else:  # [text](href)
            out.append(tok[1 : tok.index("](")])
        last = m.end()
    out.append(text[last:])
    return "".join(out)


def to_plain_text(src: str, *, code_as: str | None = None, image_alt: bool = False) -> str:
    """Markdown stripped, whitespace collapsed. `code_as` replaces code blocks; images leave nothing (or their alt)."""
    parts: list[str] = []
    for b in parse_blocks(src):
        if b.kind == "code":
            parts.append(code_as if code_as is not None else b.texts[0])
        elif b.kind == "image":
            parts.append(b.alt if image_alt else "")
        else:
            parts.extend(_inline_plain(t, image_alt) for t in b.texts)
    return _SPACES.sub(" ", " ".join(parts)).strip()


def _graphemes(text: str) -> list[str]:
    """User-perceived characters (close enough): a letter with its marks, an emoji sequence, a flag."""
    out: list[str] = []
    glue = False
    for ch in text:
        cp = ord(ch)
        regional = 0x1F1E6 <= cp <= 0x1F1FF
        joins = bool(out) and (
            glue
            or unicodedata.category(ch) in ("Mn", "Mc", "Me")
            or cp == 0x200D
            or 0xFE00 <= cp <= 0xFE0F
            or 0x1F3FB <= cp <= 0x1F3FF
            or 0xE0020 <= cp <= 0xE007F
            or (regional and len(out[-1]) == 1 and 0x1F1E6 <= ord(out[-1]) <= 0x1F1FF)
        )
        if joins:
            out[-1] += ch
        else:
            out.append(ch)
        glue = cp == 0x200D
    return out


def excerpt(src: str, max_len: int = EXCERPT_LENGTH) -> str:
    """The first ~max_len characters of the plain text, cut at a word (never inside a letter or an emoji)."""
    plain = re.sub(r":\s*…\s*", ": … ", to_plain_text(src, code_as="…")).strip()
    units = _graphemes(plain)
    if len(units) <= max_len:
        return plain
    cut = "".join(units[:max_len])
    space = cut.rfind(" ")
    head = cut[:space] if space > len(cut) * 0.6 else cut
    return _EXCERPT_TAIL.sub("", head) + "…"


def allowed_image_src(src: str) -> bool:
    """Pictures the web app shows: exactly an uploaded forum image, /api/v1/media/<uuid> (no query, no other host).
    Pictures from other sites are never loaded: they would log every reader's IP (security review, finding 11)."""
    return MEDIA_PATH.fullmatch(src) is not None


def first_image(src: str) -> dict[str, str] | None:
    """The first picture in a post that the web app would show: {src, alt}, or None."""
    for b in parse_blocks(src):
        if b.kind == "code":
            continue
        found = (
            [(b.alt, b.src)]
            if b.kind == "image"
            else [(m.group(1), m.group(2)) for t in b.texts for m in _IMAGE.finditer(_CODE_SPAN.sub("", t))]
        )
        for alt, image_src in found:
            if allowed_image_src(image_src):
                return {"src": image_src, "alt": alt.strip()[:300]}
    return None


def media_ids(text: str) -> list[uuid.UUID]:
    """Forum images a body refers to (/api/v1/media/<id>), in order, without repeats."""
    return list(dict.fromkeys(uuid.UUID(x) for x in MEDIA_PATH.findall(text)))
