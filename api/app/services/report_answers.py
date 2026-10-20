"""Examiners' reports and their worked answers: where each question's commentary starts in a report, and whether the
report works through the questions ("Approaching the question").

Read from a report's stored text (`library_texts.body`, its pages split by form feeds): the text worker does it when
it reads a report (paper_text.read_item), a moderator's edit does it when a file becomes a report, and
`python -m app.cli report-answers` does every report already read. What it finds is kept on the text's row:

- `worked_answers`: the report walks through the questions, so the sittings table says "Worked answers in the
  report" instead of "No solutions yet".
- `question_pages`: one entry per question heading ("Question 3", "Section B" then "Question 1"), with its zone (a
  report for both zones has "Comments on specific questions - Zone A", then Zone B's), its section on a paper that
  numbers each section from 1, and the page it starts on.

A tagged question (past_questions.to_out) then links to its sitting's report at that page."""

from __future__ import annotations

import re
import unicodedata
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, TypedDict

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ItemSource, ItemStatus, LibraryItem, LibraryText, PaperQuestion, TextStatus
from app.schemas.library import EXAMINERS_REPORT, WorkedAnswer

PAGE_BREAK = "\f"
MIN_APPROACHES = 2  # "Approaching the question" this often: the report works through the questions
QUESTION_MAX = 40
MAX_GAP = 4  # a heading that skips more questions than this is a cross-reference, not the next question

_SPECIFIC = re.compile(r"comments\s+on\s+(?:the\s+)?specific\s+questions")
_ZONE = re.compile(r"(?:^|[-\u2013\u2014:,]\s*|questions\s+)zone\s+([ab])\s*\.?$")
_SECTION = re.compile(r"^section\s+([a-d])\s*(?:$|[.:(\u2013\u2014-])")
_QUESTION = re.compile(r"^question\s+(\d{1,2})\s*(?:$|[.:)(\u2013\u2014-])")
_NUMBERED = re.compile(r"^(\d{1,2})\.\s+\S")  # "1. Consider the following game": only when no "Question 1" is
_APPROACH = re.compile(r"approaching\s+(?:the|this)\s+question")


class Entry(TypedDict):
    zone: str | None  # 'A' or 'B' in a report for both zones
    section: str | None  # on a paper that numbers each section from 1
    question: int
    page: int


@dataclass(frozen=True)
class Found:
    worked: bool
    questions: list[Entry]


def _clean(line: str) -> str:
    """A line as the patterns read it: ligatures (ﬁ) spelt out, lower case, single spaces."""
    return " ".join(unicodedata.normalize("NFKC", line).lower().split())


@dataclass
class _Block:
    zone: str | None
    entries: list[Entry] = field(default_factory=list)
    per_section: bool = False


@dataclass
class _Reader:
    """Walks a report's lines, keeping each question heading that follows on from the last one."""

    numbered: bool  # read "1." headings, for reports that have no "Question 1"
    blocks: list[_Block] = field(default_factory=list)
    section: str | None = None
    section_of_last: str | None = None

    def __post_init__(self) -> None:
        self.blocks.append(_Block(zone=None))

    @property
    def block(self) -> _Block:
        return self.blocks[-1]

    def zone(self, letter: str) -> None:
        if self.block.zone == letter:
            return  # the zone's name repeated at the top of its pages
        if self.block.entries or self.block.zone is not None:
            if letter == "B" and self.block.zone is None and len(self.blocks) == 1:
                self.block.zone = "A"  # Zone A's commentary came first, under no heading of its own
            self.blocks.append(_Block(zone=letter))
        else:
            self.block.zone = letter
        self.section = self.section_of_last = None

    def question(self, number: int, page: int) -> None:
        if not 1 <= number <= QUESTION_MAX:
            return
        last = self.block.entries[-1]["question"] if self.block.entries else 0
        if last < number <= last + MAX_GAP:
            self._add(number, page)
        elif number == 1 and last:
            if (
                self.section is not None
                and self.section != self.section_of_last
                and self.section > (self.section_of_last or "")
            ):
                self.block.per_section = True  # Section B numbers from 1 again
                self._add(number, page)
            elif not self.numbered and self.block.zone is None and len(self.blocks) == 1:
                # Zone B's commentary after Zone A's, with no heading to say so
                self.block.zone = "A"
                self.blocks.append(_Block(zone="B"))
                self.section = None
                self._add(number, page)

    def _add(self, number: int, page: int) -> None:
        self.block.entries.append({"zone": self.block.zone, "section": self.section, "question": number, "page": page})
        self.section_of_last = self.section

    def entries(self) -> list[Entry]:
        return [
            {**e, "zone": b.zone, "section": e["section"] if b.per_section else None}
            for b in self.blocks
            for e in b.entries
        ]


def _read(pages: Sequence[str], start: tuple[int, int] | None, numbered: bool) -> list[Entry]:
    reader = _Reader(numbered=numbered)
    for number, page in enumerate(pages, start=1):
        for index, raw in enumerate(page.split("\n")):
            if start is not None and (number, index) < start:
                continue
            line = _clean(raw)
            if not line or len(line) > 120:
                continue
            z = _ZONE.search(line) if len(line) <= 90 else None
            if z:
                reader.zone(z.group(1).upper())
                continue
            s = _SECTION.match(line)
            if s:
                reader.section = s.group(1).upper()
                continue
            q = (_NUMBERED if numbered else _QUESTION).match(line)
            if q:
                reader.question(int(q.group(1)), number)
    return reader.entries()


def locate(body: str) -> Found:
    """Where each question's commentary starts in a report's text, and whether it works through the questions."""
    pages = body.split(PAGE_BREAK)
    start: tuple[int, int] | None = None
    approaches = 0
    for number, page in enumerate(pages, start=1):
        for index, raw in enumerate(page.split("\n")):
            line = _clean(raw)
            if start is None and _SPECIFIC.search(line):
                start = (number, index)
            approaches += len(_APPROACH.findall(line))
    questions = _read(pages, start, numbered=False)
    if not questions and start is not None:
        questions = _read(pages, start, numbered=True)
    worked = approaches >= MIN_APPROACHES or (approaches >= 1 and len(questions) >= 2)
    return Found(worked=worked, questions=questions)


# ── keeping it on the text's row ─────────────────────────────────────────────────────────────


def fill(row: LibraryText, kind: str) -> None:
    """Sets what a file's text says about worked answers: only a report that was read has any."""
    if kind == EXAMINERS_REPORT and row.status == TextStatus.done and row.body:
        found = locate(row.body)
        row.worked_answers = found.worked
        row.question_pages = [dict(e) for e in found.questions] or None
    else:
        row.worked_answers = False
        row.question_pages = None


def refresh(db: Session, item: LibraryItem) -> None:
    """Reads a file's stored text again for worked answers (its kind changed, say). The caller commits."""
    row = db.get(LibraryText, item.id)
    if row is not None:
        fill(row, item.kind)


def backfill(db: Session) -> tuple[int, int, int]:
    """Every examiners' report already read, and anything else that was marked: -> (reports, worked, located), where
    `located` counts the reports with at least one question found. The caller commits."""
    rows = db.execute(
        select(LibraryText, LibraryItem.kind)
        .join(LibraryItem, LibraryItem.id == LibraryText.item_id)
        .where(
            or_(
                LibraryItem.kind == EXAMINERS_REPORT,
                LibraryText.worked_answers,
                LibraryText.question_pages.is_not(None),
            )
        )
    ).all()
    reports = worked = located = 0
    for row, kind in rows:
        fill(row, kind)
        if kind == EXAMINERS_REPORT and row.status == TextStatus.done:
            reports += 1
            worked += row.worked_answers
            located += bool(row.question_pages)
    return reports, worked, located


def worked(db: Session, item_ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
    """The reports among these items that work through their questions."""
    ids = list(item_ids)
    if not ids:
        return set()
    return set(db.scalars(select(LibraryText.item_id).where(LibraryText.item_id.in_(ids), LibraryText.worked_answers)))


# ── a tagged question's page in its report ───────────────────────────────────────────────────


@dataclass(frozen=True)
class _Report:
    id: uuid.UUID
    slug: str
    zone: str | None
    entries: list[Entry]


def _entries(raw: Any) -> list[Entry]:
    if not isinstance(raw, list):
        return []
    return [
        {"zone": e.get("zone"), "section": e.get("section"), "question": e["question"], "page": e["page"]}
        for e in raw
        if isinstance(e, dict) and isinstance(e.get("question"), int) and isinstance(e.get("page"), int)
    ]


def _page_in(report: _Report, paper_zone: str | None, section: str | None, question: int) -> int | None:
    entries = report.entries
    if any(e["zone"] for e in entries) and report.zone is None:
        if paper_zone not in ("A", "B"):
            return None  # a report for both zones, and no telling which this paper is
        # the paper's zone's commentary, then any before the report named a zone
        entries = [e for e in entries if e["zone"] == paper_zone] + [e for e in entries if e["zone"] is None]
    exact = [e for e in entries if e["section"] == section and e["question"] == question]
    if exact:
        return exact[0]["page"]
    if section is None:
        same = [e for e in entries if e["question"] == question]
        if len(same) == 1:
            return same[0]["page"]
    return None


def _zone_rank(report_zone: str | None, paper_zone: str | None) -> int | None:
    """The paper's own zone's report first, then the sitting's report for every zone; another zone's never."""
    if report_zone is not None and report_zone == paper_zone:
        return 0
    if report_zone is None:
        return 1
    return None


def answers_for(
    db: Session, tags: Sequence[PaperQuestion], papers: dict[uuid.UUID, LibraryItem]
) -> dict[uuid.UUID, WorkedAnswer]:
    """The report page where each tagged question's commentary starts, by the tag's id; questions without one are left
    out. `papers`: the tags' papers by id."""
    sittings = {
        (p.module_id, p.exam_year, p.exam_session)
        for p in papers.values()
        if p.module_id is not None and p.exam_year is not None
    }
    if not sittings:
        return {}
    modules = {m for m, _, _ in sittings}
    years = {y for _, y, _ in sittings}
    rows = db.execute(
        select(LibraryItem, LibraryText.question_pages)
        .join(LibraryText, LibraryText.item_id == LibraryItem.id)
        .where(
            LibraryItem.kind == EXAMINERS_REPORT,
            LibraryItem.source == ItemSource.file,
            LibraryItem.status == ItemStatus.published,
            LibraryItem.module_id.in_(modules),
            LibraryItem.exam_year.in_(years),
            LibraryText.question_pages.is_not(None),
        )
        .order_by(LibraryItem.published_at, LibraryItem.id)
    ).all()
    by_sitting: dict[tuple[str | None, int | None, str | None], list[_Report]] = {}
    for item, pages in rows:
        key = (item.module_id, item.exam_year, item.exam_session)
        if key in sittings:
            by_sitting.setdefault(key, []).append(_Report(item.id, item.slug, item.zone, _entries(pages)))
    out: dict[uuid.UUID, WorkedAnswer] = {}
    for tag in tags:
        paper = papers.get(tag.item_id)
        if paper is None:
            continue
        reports = by_sitting.get((paper.module_id, paper.exam_year, paper.exam_session), [])
        ranked = sorted(
            ((rank, r) for r in reports if (rank := _zone_rank(r.zone, paper.zone)) is not None),
            key=lambda pair: pair[0],
        )
        for _, report in ranked:
            page = _page_in(report, paper.zone, tag.section, tag.question)
            if page is not None:
                out[tag.id] = WorkedAnswer(id=report.id, slug=report.slug, page=page)
                break
    return out
