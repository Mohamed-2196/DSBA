"""Where a past paper's question starts on its page: its first words as the PDF's text has them (an anchor), which
the paper's viewer finds in the page's text layer and marks.

- find() reads them from the page's text (library_texts, one page): the first line on the page that starts with the
  question's number ("3.", "3)", "Question 3", "B3", or "3" before the words), after the section's heading
  ("SECTION B") when the paper numbers each section from 1, and the words after it, to about ANCHOR_CHARS (or to
  the next question's line).
- checked() keeps an anchor someone else gave (Claude's) only when the page has those words.
- Matching ignores case, spaces and punctuation (key()): the PDF's text and the viewer's text layer space words
  differently, so the viewer compares the same way (web: features/library/viewer/anchor.ts)."""

from __future__ import annotations

import re
import unicodedata

from app.models.library import ANCHOR_MAX

ANCHOR_CHARS = 100  # the anchor's length to aim for, cut at a word
MIN_KEY = 12  # an anchor shorter than this (letters and digits) is too short to find one place by

_SPACES = re.compile(r"\s+")
_NOT_ALNUM = re.compile(r"[\W_]+")


def key(text: str) -> str:
    """The text as anchors are compared: compatibility-normalised, lower case, letters and digits only."""
    return _NOT_ALNUM.sub("", unicodedata.normalize("NFKC", text).casefold())


def _cut(text: str) -> str:
    text = _SPACES.sub(" ", text).strip()
    if len(text) <= ANCHOR_CHARS:
        return text
    cut = text[: ANCHOR_CHARS + 1].rsplit(" ", 1)[0]
    return (cut if len(cut) >= ANCHOR_CHARS // 2 else text[:ANCHOR_CHARS]).strip()[:ANCHOR_MAX]


def _starts(question: int, section: str | None) -> re.Pattern[str]:
    """A line that opens the question: '3.', '3)', '(3)', 'Q3', 'Question 3', 'B3', or '3' before a capital letter or
    a part '(a)'."""
    n = str(question)
    names = [rf"(?:question|q)\s*{n}", rf"\(?{n}\s*[.):]", rf"{n}\s+(?=[A-Z(])"]
    if section:
        names.insert(0, rf"{section}\s*{n}\b\.?")
    return re.compile(rf"^\s*(?:{'|'.join(names)})", re.IGNORECASE)


def _section_heading(section: str) -> re.Pattern[str]:
    return re.compile(rf"^\s*section\s+{section}\b", re.IGNORECASE)


def find(page_text: str, question: int, section: str | None = None) -> str | None:
    """The question's anchor on its page, or None when no line there opens it."""
    lines = page_text.splitlines()
    start = 0
    if section:
        heading = _section_heading(section)
        start = next((i + 1 for i, line in enumerate(lines) if heading.match(line)), 0)
    opens, after = _starts(question, section), _starts(question + 1, section)
    for i in range(start, len(lines)):
        if opens.match(lines[i]):
            words = [lines[i]]
            for line in lines[i + 1 : i + 4]:
                if after.match(line):
                    break  # a short question: its anchor stops where the next one starts
                words.append(line)
            anchor = _cut(" ".join(words))
            return anchor if len(key(anchor)) >= MIN_KEY else None
    return None


def checked(anchor: str | None, page_text: str) -> str | None:
    """`anchor`, cut to size, when the page has its words; else None."""
    if not anchor:
        return None
    anchor = _cut(anchor)
    k = key(anchor)
    return anchor if len(k) >= MIN_KEY and k in key(page_text) else None


def anchor_for(page_text: str, question: int, section: str | None = None, given: str | None = None) -> str | None:
    """The anchor to keep: the one given when the page has it, else the one find() reads."""
    return checked(given, page_text) or find(page_text, question, section)
