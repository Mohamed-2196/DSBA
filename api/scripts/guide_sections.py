"""A subject guide's numbered sections, read from the PDF, for app/seed/data/guide_sections.json.

    uv run python scripts/guide_sections.py MT3095 path/to/guide.pdf [--source "..."] > /tmp/MT3095.json

Run by hand when a module's guide changes; the PDFs stay out of the repository (they are the University of London's).
It reads two things and checks one against the other:

- the body's numbered headings ("8.2 Sets and functions: some terminology"): lines that start with a section number
  and are set in the guide's heading font (the bold font most numbered lines use), with a title that wraps onto the
  next line joined back;
- the contents pages, for the chapters' titles and as a check: a section the contents list and the body doesn't show
  as a heading (or the other way round) is printed to stderr, so a person looks before the file changes.

Guides without section numbers (EC1002's blocks, ST2195's block notes, ST3189's VLE pages) are read from the PDF's
bookmarks instead (--bookmarks): each chapter-level bookmark is a chapter, and its children are its sections, with no
number. A section's "taught" is false for front and back matter (introduction, aims, learning outcomes, reading,
overview, summary, sample or test questions, answers); tests/content/test_guide_coverage.py checks that every
taught section has a video in its Hub chapter."""

from __future__ import annotations

import argparse
import collections
import ctypes
import json
import re
import sys
from typing import Any

import pypdfium2 as pdfium
import pypdfium2.raw as raw

NUMBERED = re.compile(r"^(?P<num>\d{1,2}(?:\.\d{1,2}){1,3})\.?\s+(?P<title>\S.*)$")
CHAPTER = re.compile(r"^(?:Chapter\s+)?(?P<num>\d{1,2})[:.]?\s+(?P<title>[A-Z].*?)[\s.]*(?P<page>\d+)$")
LEADERS = re.compile(r"(?:\s*\.){2,}\s*(?P<page>\d+|[ivxl]+)?\s*$")
# Front and back matter: not taught (the ticket's list, plus the headings the guides use for the same things).
NOT_TAUGHT = re.compile(
    r"(?:introduction|overview|aims?|aims and (?:objectives|learning outcomes)|(?:chapter )?learning outcomes|"
    r"(?:essential|further|recommended) reading|reading|references(?: cited)?|synopsis(?: of (?:this )?chapter)?|"
    r"summary|(?:a )?reminder of (?:your )?learning outcomes|overview of (?:the |this )?chapter|"
    r"key (?:terms|concepts)(?: and concepts)?|test your knowledge.*|sample exam(?:ination)? questions?|"
    r"sample questions|solutions? to .*|answers to .*|sketch answers.*|chapter content|content of (?:the )?chapter|"
    r"activities|comments on (?:the )?activities|self-assessment.*|exercises?|practice questions|"
    r"learning activities|route map.*|syllabus|examination advice|assessment advice|online study resources|"
    r"the vle|making use of the online library|the subject guide|using the guide|how to use this subject guide|"
    r"overview of (?:the )?learning resources|vle materials|useful links and resources|aims of the chapter|"
    r"further reading and resources?|references and further reading|examples?|toy example|motivating example|data)",
    re.IGNORECASE,
)
FRONT_CHAPTER = re.compile(r"^(?:introduction|preface|introduction to the (?:subject|course|guide))$", re.IGNORECASE)
# Worked examples and summaries of a neighbouring section: part of what they illustrate, not a topic of their own.
EXAMPLE = re.compile(
    r"(?:.*\bexamples?(?: (?:one|two|three|\d+))?|introductory examples|summary:.*|.*worked example)", re.IGNORECASE
)
CONTAINER = re.compile(r"^(?:chapter content|content of chapter|content of the chapter)$", re.IGNORECASE)
LIGATURES = ("ffi", "fi", "ff", "fl", "ffl")


def lines_of(path: str) -> list[tuple[int, str, str]]:
    """(page, font of the line's first visible character, text) for every line of the PDF."""
    pdf = pdfium.PdfDocument(path)
    out: list[tuple[int, str, str]] = []
    buf = ctypes.create_string_buffer(128)
    flags = ctypes.c_int()
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        line: list[str] = []
        font = ""
        for c in range(tp.count_chars()):
            ch = chr(raw.FPDFText_GetUnicode(tp, c))
            if ch in "\r\n":
                text = "".join(line).strip()
                if text:
                    out.append((i + 1, font, text))
                line, font = [], ""
                continue
            if not font and not ch.isspace():
                raw.FPDFText_GetFontInfo(tp, c, buf, 128, ctypes.byref(flags))
                font = buf.value.decode(errors="ignore")
            line.append(ch)
        text = "".join(line).strip()
        if text:
            out.append((i + 1, font, text))
    return out


def fix_ligatures(text: str, words: set[str]) -> str:
    """A ligature the PDF's text lost (U+FFFE or U+FFFD where 'ffi' was) put back: the one that makes a word the
    guide uses elsewhere."""

    def one(m: re.Match[str]) -> str:
        head, tail = m.group(1), m.group(2)
        for lig in LIGATURES:
            if (head + lig + tail).lower() in words:
                return head + lig + tail
        return head + "fi" + tail

    return re.sub(r"(\w*)[\ufffe\ufffd\x00](\w*)", one, text)


def clean(title: str) -> str:
    title = LEADERS.sub("", title)
    title = re.sub(r"\bR ?([nm])\b", lambda m: "R" + {"n": "\u207f", "m": "\u1d50"}[m.group(1)], title)
    title = re.sub(r"\s+", " ", title).strip(" .")
    return title.replace("\u2019", "'").replace("\u2018", "'")


def contents(lines: list[tuple[int, str, str]]) -> tuple[dict[str, str], dict[str, str], int]:
    """The contents pages' chapters {number: title} and sections {number: title}, and the last contents page."""
    start = next((p for p, _, t in lines if t.strip().lower() == "contents"), None)
    if start is None:
        return {}, {}, 0
    chapters: dict[str, str] = {}
    sections: dict[str, str] = {}
    last = start
    chapter = ""  # the chapter whose contents entries these are
    by_page = collections.defaultdict(list)
    for p, _, t in lines:
        by_page[p].append(t)
    page = start
    while page in by_page:
        texts = by_page[page]
        hits = 0
        pending = ""  # a wrapped entry's first line, waiting for the line with its page number
        for t in texts:
            if pending and not NUMBERED.match(t) and not CHAPTER.match(t):
                t, pending = pending + " " + t, ""
            pending = ""
            m = NUMBERED.match(t)
            if m and (LEADERS.search(t) or re.search(r"\s\d+$", t)):
                title = clean(re.sub(r"\s\d+$", "", m.group("title")))
                if m.group("num").split(".")[0] == chapter:
                    sections[m.group("num")] = title  # under its own "Chapter N": wins over a front chapter's N.x
                else:
                    sections.setdefault(m.group("num"), title)
                hits += 1
                continue
            c = CHAPTER.match(t)
            if c:
                chapters.setdefault(c.group("num"), clean(c.group("title")))
                chapter = c.group("num")
                hits += 1
                continue
            if m or re.match(r"^(?:Chapter\s+)?\d{1,2}[:.]?\s+[A-Z]", t):
                pending = t
        leaders = sum(1 for t in texts if re.search(r"(?:\s*\.){3,}\s*\d*\s*$", t))
        if page > start and leaders < 3:
            break  # the contents end where the dot leaders do
        last = page
        page += 1
    return chapters, sections, last


def headings(lines: list[tuple[int, str, str]], after: int) -> list[tuple[str, str, int]]:
    """The body's numbered headings (number, title, page), in order: numbered lines in the heading font, a wrapped
    title joined to the next line in the same font."""
    numbered = [(i, f) for i, (p, f, t) in enumerate(lines) if p > after and NUMBERED.match(t)]
    fonts = collections.Counter(f for _, f in numbered if re.search(r"bold|black|heavy|semibold|bx", f, re.IGNORECASE))
    if not fonts:
        return []
    heading_fonts = {f for f, n in fonts.items() if n >= max(5, fonts.most_common(1)[0][1] // 10)}
    out: list[tuple[str, str, int]] = []
    for i, f in numbered:
        if f not in heading_fonts:
            continue
        p, _, t = lines[i]
        m = NUMBERED.match(t)
        assert m
        title = m.group("title")
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if nxt and nxt[0] == p and nxt[1] == f and not NUMBERED.match(nxt[2]) and len(nxt[2]) < 80:
            title += " " + nxt[2]
        out.append((m.group("num"), clean(title), p))
    return out


def same(a: str | None, b: str | None) -> bool:
    """Two titles of one heading (the body's and the contents'), up to case, spacing and punctuation."""
    norm = lambda t: re.sub(r"[^a-z0-9]+", "", (t or "").lower())  # noqa: E731
    return bool(a and b) and norm(a) == norm(b)


def parse_numbered(path: str) -> tuple[list[dict[str, Any]], list[str]]:
    lines = lines_of(path)
    words = {w.lower() for _, _, t in lines for w in re.findall(r"[A-Za-z]+", t)}
    toc_chapters, toc_sections, toc_end = contents(lines)
    body = headings(lines, toc_end)
    notes: list[str] = []
    seen: dict[str, dict[str, Any]] = {}
    for num, title, page in body:
        if num in seen and not (same(title, toc_sections.get(num)) and not same(seen[num]["body"], toc_sections[num])):
            continue  # a number set again in the heading font later (a summary box, an answer): the first is it,
            # unless only the later one is the contents' (a front chapter numbered like chapter 1, as in MN1178)
        # The contents' wording when it has the section (the body's heading can lose a superscript: "R" for "Rn").
        best = toc_sections.get(num) or title
        seen[num] = {"number": num, "title": fix_ligatures(best, words), "page": page, "body": title}
    # A subsection before its section's heading belongs to that front chapter, not to the section.
    for num in [n for n in seen if n.count(".") > 1]:
        parent = seen.get(num.rsplit(".", 1)[0])
        if parent and seen[num]["page"] < parent["page"]:
            del seen[num]
    for s in seen.values():
        del s["body"]
    for num, title in toc_sections.items():
        if num not in seen:
            notes.append(f"in the contents, not a body heading: {num} {title}")
    if toc_sections:
        notes += [
            f"a body heading, not in the contents: {n} {s['title']}" for n, s in seen.items() if n not in toc_sections
        ]
    chapters: dict[str, dict[str, Any]] = {}
    for num, s in sorted(seen.items(), key=lambda kv: [int(x) for x in kv[0].split(".")]):
        ch = num.split(".")[0]
        if ch not in chapters:
            chapters[ch] = {"number": ch, "title": fix_ligatures(toc_chapters.get(ch, ""), words), "sections": []}
        s["level"] = num.count(".") + 1
        chapters[ch]["sections"].append(s)
    for c in chapters.values():
        mark_taught(c["sections"])
        if FRONT_CHAPTER.match(c["title"]) or c["number"] == "0":
            for s in c["sections"]:
                s["taught"] = False
    return list(chapters.values()), notes


def mark_taught(sections: list[dict[str, Any]]) -> None:
    """Each section's "taught": the deepest numbered sections that teach something. A section with taught
    subsections gives way to them (its own text before them is their introduction); one with none is a topic itself;
    front and back matter (introduction, learning outcomes, reading, overview, sample questions...) is never taught,
    and neither is a section under one ("1.7 Overview of learning resources" > "1.7.2 Essential reading")."""
    numbers = {s["number"] for s in sections}
    by_number = {s["number"]: s for s in sections}

    def matter(s: dict[str, Any]) -> bool:
        n = s["number"]
        while n.count("."):
            if (
                n in by_number
                and NOT_TAUGHT.fullmatch(by_number[n]["title"])
                and not CONTAINER.fullmatch(by_number[n]["title"])
            ):
                return True
            n = n.rsplit(".", 1)[0]
        return False

    for s in sections:
        s["taught"] = not matter(s) and not (s["level"] > 2 and EXAMPLE.fullmatch(s["title"]))
        s["taught"] = s["taught"] and not (s["level"] == 2 and EXAMPLE.fullmatch(s["title"]) and "." in s["number"])
    for s in sections:  # a section with two or more taught subsections is a heading, they are the topics
        kids = [o for o in sections if o["taught"] and o["number"].rsplit(".", 1)[0] == s["number"]]
        if s["taught"] and len(kids) >= 2:
            s["taught"] = False
        elif s["taught"] and len(kids) == 1:
            kids[0]["taught"] = False  # one subsection alone is part of its section
    del numbers


def _outline(path: str) -> list[tuple[int, str, int]]:
    """The PDF's bookmarks as (depth, title, page)."""
    import pypdf  # pypdfium2's bookmark API doesn't give the tree as plainly

    reader = pypdf.PdfReader(path)
    out: list[tuple[int, str, int]] = []

    def walk(items: list[Any], depth: int) -> None:
        for x in items:
            if isinstance(x, list):
                walk(x, depth + 1)
            else:
                out.append((depth, clean(x.title), reader.get_destination_page_number(x) + 1))

    walk(reader.outline, 0)
    return out


def _section(number: str | None, title: str, page: int) -> dict[str, Any]:
    return {"number": number, "title": title, "page": page, "level": 2, "taught": not NOT_TAUGHT.fullmatch(title)}


def parse_blocks(path: str) -> list[dict[str, Any]]:
    """EC1002: bookmarks "Block N: title" are chapters, the bookmarks under them its (unnumbered) sections."""
    chapters: list[dict[str, Any]] = []
    for depth, title, page in _outline(path):
        m = re.match(r"^Block (\d+): (.+)$", title)
        if m:
            chapters.append({"number": m.group(1), "title": m.group(2), "sections": [], "_depth": depth})
        elif chapters and depth == chapters[-1]["_depth"] + 1:
            chapters[-1]["sections"].append(_section(None, title, page))
        elif chapters and depth <= chapters[-1]["_depth"]:
            chapters[-1]["_depth"] = -9  # past the block
    for c in chapters:
        del c["_depth"]
    return chapters


def parse_notes(path: str) -> list[dict[str, Any]]:
    """ST2195: each block's notes ("Intro to data science Block01a" > "Introduction to Data Science") are its
    sections, numbered as the course numbers them: 1a, 1b, ..."""
    chapters: dict[str, dict[str, Any]] = {}
    rows = _outline(path)
    for i, (depth, title, page) in enumerate(rows):
        m = re.search(r"Block\s*0?(\d+)([a-z])\b", title)
        if not m or depth != 1:
            continue
        kids = []  # the note's own title: its first child that isn't a cover line ("Block 03")
        for d, t, _ in rows[i + 1 :]:
            if d <= depth:
                break
            if d == depth + 1:
                t = re.sub(r"^ST2195 Programming for Data Science(?: Block \d+)?\s*", "", t)
                if t and not re.fullmatch(r"Block \d+(?: \w+)?", t):
                    kids.append(t)
        block = m.group(1)
        chapters.setdefault(block, {"number": block, "title": "", "sections": []})
        chapters[block]["sections"].append(_section(block + m.group(2), kids[0] if kids else title, page))
    return list(chapters.values())


def parse_sized(path: str, page_title: float, heading: float) -> list[dict[str, Any]]:
    """ST3189: the VLE pages, each a chapter (its title set at `page_title` points or more), and their headings
    (`heading` points or more) the sections, unnumbered. Sizes are the height of a line's first capital letter."""
    pdf = pdfium.PdfDocument(path)
    chapters: list[dict[str, Any]] = []
    left, right, bottom, top = (ctypes.c_double() for _ in range(4))
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        line: list[str] = []
        height: float | None = None
        for c in range(tp.count_chars() + 1):
            ch = chr(raw.FPDFText_GetUnicode(tp, c)) if c < tp.count_chars() else "\n"
            if ch in "\r\n":
                text = clean("".join(line))
                if text and height and len(text) < 90:
                    if (
                        height >= page_title
                        and chapters
                        and not chapters[-1]["sections"]
                        and chapters[-1]["_page"] == i + 1
                    ):
                        chapters[-1]["title"] += " " + text  # a page title on two lines
                    elif height >= page_title:
                        chapters.append(
                            {"number": str(len(chapters) + 1), "title": text, "sections": [], "_page": i + 1}
                        )
                    elif height >= heading and chapters:
                        chapters[-1]["sections"].append(_section(None, text, i + 1))
                line, height = [], None
                continue
            if height is None and ch.isupper():
                raw.FPDFText_GetCharBox(tp, c, *(ctypes.byref(x) for x in (left, right, bottom, top)))
                height = top.value - bottom.value
            elif height is None and ch.isalpha():
                height = 0.0
            line.append(ch)
    for c in chapters:
        del c["_page"]
    return chapters


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("unit_code")
    ap.add_argument("pdf")
    ap.add_argument("--source", default="")
    how = ap.add_mutually_exclusive_group()
    how.add_argument("--blocks", action="store_true", help="EC1002: unnumbered sections under 'Block N' bookmarks")
    how.add_argument("--notes", action="store_true", help="ST2195: each block's notes (1a, 1b, ...) from bookmarks")
    how.add_argument("--sized", nargs=2, type=float, metavar=("PAGE", "HEADING"), help="ST3189: by letter height")
    a = ap.parse_args()
    notes: list[str] = []
    if a.blocks:
        chapters = parse_blocks(a.pdf)
    elif a.notes:
        chapters = parse_notes(a.pdf)
    elif a.sized:
        chapters = parse_sized(a.pdf, *a.sized)
    else:
        chapters, notes = parse_numbered(a.pdf)
    for n in notes:
        print(f"{a.unit_code}: {n}", file=sys.stderr)
    json.dump(
        {"unitCode": a.unit_code, "source": a.source, "chapters": chapters}, sys.stdout, ensure_ascii=False, indent=1
    )
    print()


if __name__ == "__main__":
    main()
