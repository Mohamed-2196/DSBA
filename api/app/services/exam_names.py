"""What a past paper's file name says about it: the year it was sat, its session and zone (zone A, zone B or RTC), and
whether it is the examiners' report or the worked solutions rather than the paper itself.

The Drive import (python -m app.cli import-drive) files everything in a module's past-papers folder as a past paper,
and the papers in its VLE folder too, and reads the rest from each file's name, so the library's sittings and its
year and zone filters work for imported papers. A wrong guess is worse than none: a paper filed under the wrong
sitting hides from the students who look for it there, while a paper without one still shows under "Other papers".

The names the programme's folders use:
- the archive: 'EC1002 - Introduction to Economics - 2019 Exam - Zone-A.pdf',
  '... - 2019 Examiners Commentaries.pdf', '... - 2023 October Resit Examiners Commentaries.pdf';
- the VLE: 'MN3141 ZA exam paper - May 2024.pdf', 'MT3095_Commentary_October_2025.pdf',
  'EC1002 ZB Exam paper solutions - May 2025.pdf', 'MT1186 Commentary - May 2026 DRAFT.pdf',
  'ST3189 Exam paper â May 2026.pdf' (an en dash read in the wrong encoding).
- the RTC papers: 'MN3141 RTC Exam paper - May 2025.pdf', 'MN3141 RTC Commentary - May 2026 DRAFT.docx'.
RTC stands for Recognised Teaching Centre: for some modules the University of London sets a paper for its Recognised
Teaching Centres beside zone A's and zone B's. That paper is a zone of its own, 'RTC'.
Mocks, preliminary and sample papers belong to no sitting: their names give nothing."""

from __future__ import annotations

import re
import unicodedata
from typing import NamedTuple, Protocol

from app.schemas.library import ExamSession, Zone


class ExamMeta(NamedTuple):
    exam_year: int | None  # the year the exam was sat, e.g. 2021
    zone: Zone | None  # the paper's version: zone A, zone B, or RTC (set for Recognised Teaching Centres)
    examiners_report: bool  # the examiners' report (commentary) on the paper, not the paper
    session: ExamSession | None = None  # the May sitting or the October resits
    solutions: bool = False  # worked solutions to the paper
    sitting: bool = False  # the name says it is a paper, report or solutions of a sitting, and gives its year


# Not a University of London sitting: the school's mocks and tests, the preliminary and sample papers.
_NOT_A_SITTING = re.compile(r"\b(mocks?|prelim\w*|sample|specimen|model answers?|tests?\d*|quiz)\b")
_REPORT = re.compile(r"commentar|examiners?\s+reports?")
_SOLUTIONS = re.compile(r"solutions?\b")
_EXAM_WORDS = re.compile(r"\b(exam\w*|papers?)\b")
# Glued words happen ('CommentaryAutumn2025', 'Nov2023'): what follows a session's name must not be a letter.
_OCTOBER = re.compile(r"(oct(ober)?|nov(ember)?|autumn|winter|resit)(?![a-z])")
_MAY = re.compile(r"(?<![a-z])(may|june?|summer)(?![a-z])|may(?=\d)")
_YEAR = re.compile(r"(?<!\d)(19[89]\d|20\d\d)(?!\d)")
# Two letters that start a word, right before the digits: a module code ('EC2020', 'EC2066'), not a year.
_CODE_BEFORE = re.compile(r"(?:^|[^a-z])[a-z]{2}$")
_ZONE = re.compile(r"\bzone\s*-?\s*([ab])\b|\bz([ab])\b")
_RTC = re.compile(r"\brtc\b")


def _clean(name: str) -> str:
    """Lower case, without the extension, with dashes, underscores and the mis-encoded dash as spaces."""
    text = name.strip()
    text = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", text)  # '.pdf', '.PDF', '.docx'
    text = re.sub(r"(?<=[A-Za-z])pdf$", "", text)  # 'Zone-Apdf': an extension typed into the name
    text = text.lower().replace("\u00e2", " ").replace("_", " ")
    text = re.sub("[\u2010-\u2015-]", " - ", text)
    return re.sub(r"\s+", " ", text).strip()


def _years(text: str) -> set[int]:
    return {int(m.group(1)) for m in _YEAR.finditer(text) if not _CODE_BEFORE.search(text[: m.start()])}


def _zone(text: str) -> Zone | None:
    """The zone the name gives, if exactly one: 'ZA-ZB' covers both, so it says neither. 'RTC' says the RTC paper."""
    if _RTC.search(text):
        return "RTC"
    zones = {(m.group(1) or m.group(2)).upper() for m in _ZONE.finditer(text)}
    if zones == {"A"}:
        return "A"
    if zones == {"B"}:
        return "B"
    return None


_EXTENSION = re.compile(r"\.[A-Za-z0-9]{1,5}$")
# A document's extension left inside the name, as when a Word file was saved as a PDF ('Notes.docx.pdf').
_DOC_EXTENSION = re.compile(r"\.(pdf|docx?|pptx?|xlsx?|odt|rtf)(?=[\s)\]]|$)", re.IGNORECASE)
_COMPRESSED = re.compile(r"[\s_-]*\b(compress(ed)?|min)\b\s*$", re.IGNORECASE)
_COPY = re.compile(r"\s*(\(\d{1,2}\)|\bcopy\b)\s*$", re.IGNORECASE)
_COPY_OF = re.compile(r"^copy of\s+", re.IGNORECASE)
_GLUED_BRACKET = re.compile(r"(?<=[A-Za-z])\((?=[A-Za-z])")
_UNIT = re.compile(r"\b([A-Za-z]{2}\d{3,4}[A-Za-z]?)\b")


def tidy_title(file_name: str) -> str:
    """A file's title from its name: 'calculus-concepts-and-methods_compress.pdf' -> 'Calculus concepts and methods',
    '1. Function Characteristics - workbook (1).pdf' -> '1. Function Characteristics - workbook'. Drops the extension
    (and a document's extension left inside the name: 'Notes.docx.pdf'), 'Copy of', a trailing '(1)', 'copy' or
    '_compress', reads underscores (and the hyphens of a name with no spaces) as spaces, mends the mis-encoded dash
    ('â'), puts a space before a bracket glued to a word, writes unit codes in capitals ('ec1002' -> 'EC1002') and
    starts with a capital. The name itself when nothing is left. Accents are composed first (a Mac writes 'â' as 'a'
    and a combining circumflex)."""
    text = _EXTENSION.sub("", unicodedata.normalize("NFC", file_name.strip()))
    text = _DOC_EXTENSION.sub("", text)
    text = text.replace(" \u00e2 ", " \u2013 ").replace("_", " ")
    for _ in range(3):  # 'notes (1) copy_compress'
        text = _COMPRESSED.sub("", _COPY.sub("", text)).strip()
    text = _COPY_OF.sub("", text)
    if " " not in text and text.count("-") >= 2:
        text = text.replace("-", " ")
    text = _GLUED_BRACKET.sub(" (", text)
    text = _UNIT.sub(lambda m: m.group(1).upper(), text)
    text = re.sub(r"\s+", " ", text).strip(" -\u2013")
    if not text:
        return file_name.strip()
    return text[0].upper() + text[1:]


def zone_label(zone: str) -> str:
    """'zone A', or 'RTC' for the Recognised Teaching Centre paper."""
    return "RTC" if zone == "RTC" else f"zone {zone}"


class _Sat(Protocol):
    @property
    def exam_year(self) -> int | None: ...
    @property
    def exam_session(self) -> str | None: ...


def sitting_key(item: _Sat) -> tuple[int, str | None] | None:
    """The sitting a paper, report or solutions belong to: (exam year, session), or None without an exam year. Every
    zone of a sitting shares it: the library splits a sitting by zone after grouping by this key."""
    if item.exam_year is None:
        return None
    return (item.exam_year, item.exam_session)


def exam_meta_from_name(name: str) -> ExamMeta:
    """'ST2133_2021_ZA.pdf' -> ExamMeta(2021, 'A', False, 'may', False, True), with None (or False) for what the
    name doesn't say.

    `name` is the file's name as Drive has it, extension included. Two different years say no year. The session is
    October when the name says October, November, autumn, winter or resit, and May otherwise once the name gives a
    year: the main sitting is in May and June, and the resits' files say so."""
    text = _clean(name)
    if _NOT_A_SITTING.search(text):
        return ExamMeta(None, None, False)
    years = _years(text)
    year = years.pop() if len(years) == 1 else None
    zone = _zone(text)
    report = bool(_REPORT.search(text))
    solutions = not report and bool(_SOLUTIONS.search(text))
    october, may = bool(_OCTOBER.search(text)), bool(_MAY.search(text))
    named = report or solutions or zone is not None or october or may or bool(_EXAM_WORDS.search(text))
    sitting = year is not None and named
    session: ExamSession | None = ("october" if october else "may") if sitting else None
    return ExamMeta(
        exam_year=year,
        zone=zone,
        examiners_report=report,
        session=session,
        solutions=solutions,
        sitting=sitting,
    )
