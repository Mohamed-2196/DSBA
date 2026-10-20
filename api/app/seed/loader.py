"""Loads the reference content in app/seed/data/*.json: modules, calendar dates, newsletter issues, the Career
Navigator document, the Drive folders the import copies into the library, Daily's themes and guess list, and the
past papers' questions Claude tagged (on the papers this install has: run the seed again after the Drive import).

Idempotent: running it again adds what is missing and never overwrites what moderators changed through the API.
Something a moderator deleted stays deleted: calendar events and newsletter issues are looked up in the audit log
(calendar.delete, newsletter.delete).
Modules are starting content only: they load into an empty catalogue, and after that content managers edit them in
the app (a module they removed stays removed). The one exception is BROKEN_CHAPTERS, which the seed removes from any
catalogue that has them.
Newsletter issues and the career document go through the schemas the API checks writes with, and are stored in
the same shape: a seed file that doesn't fit them fails loudly instead of loading content the app can't show.
Owner: content agent."""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import (
    AuditEntry,
    BoardCard,
    CalendarEvent,
    Chapter,
    ContentDoc,
    DailyGuessWord,
    DailyTheme,
    DriveFolder,
    Lesson,
    Module,
    NewsletterIssue,
    Note,
)
from app.schemas.career import CareerDoc
from app.schemas.newsletter import IssueCreate
from app.services import career, chapter_outlines, newsletter, question_tagging, report_answers

DATA = Path(__file__).parent / "data"


def read(name: str) -> Any:
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def load_modules(db: Session) -> int:
    """Once, into an empty catalogue: after that the modules are the content managers' (/content/modules)."""
    if db.scalar(select(Module.id).limit(1)) is not None:
        return 0
    n = 0
    for m in read("modules"):
        chapters = [
            Chapter(
                id=c["id"],
                position=ci,
                title=c["title"],
                audio_url=c.get("audioUrl"),
                keywords=list(c.get("keywords") or []),
                lessons=[
                    Lesson(
                        id=v["id"],
                        module_id=m["id"],
                        position=vi,
                        kind=v["kind"],
                        video_id=v.get("videoId"),
                        url=v.get("url"),
                        title=v.get("title"),
                        channel=v.get("channel"),
                        unavailable=bool(v.get("unavailable")),
                    )
                    for vi, v in enumerate(c.get("videos") or [])
                ],
            )
            for ci, c in enumerate(m.get("chapters") or [])
        ]
        db.add(
            Module(
                id=m["id"],
                unit_code=m.get("unitCode"),
                name=m["name"],
                short_name=m["shortName"],
                year=m["year"],
                description=m.get("description") or "",
                icon=m.get("icon"),
                art=m.get("art"),
                position=m.get("position", 0),
                chapters=chapters,
            )
        )
        n += 1
    db.flush()
    return n


# Chapters the first catalogue held by mistake, each with its lessons' stand-ins in the chapter it repeats:
# MN1178's second "International Project Management", whose only lesson was a half-downloaded file.
BROKEN_CHAPTERS: dict[str, dict[str, str]] = {"fjdyedyg": {"6z8mmrtu": "me34n26c"}}


def remove_broken_chapters(db: Session) -> int:
    """BROKEN_CHAPTERS, removed wherever they still are. Students' notes and study-board cards on their lessons move
    to the stand-in lesson; a note loses its lesson, and a card goes, when the stand-in is gone too or the card's
    board already holds it. Watched lessons and tags go with the chapter.
    The module's chapters are numbered again and its version goes up, so an editor open on it reloads first."""
    n = 0
    for chapter_id, stand_ins in BROKEN_CHAPTERS.items():
        chapter = db.get(Chapter, chapter_id)
        if chapter is None:
            continue
        for lesson_id, stand_in in stand_ins.items():
            to = stand_in if db.get(Lesson, stand_in) is not None else None
            db.execute(update(Note).where(Note.lesson_id == lesson_id).values(lesson_id=to))
            cards = BoardCard.lesson_id == lesson_id
            if to is not None:  # a board holds a lesson once: where it holds both, the broken one's card goes
                has_it = select(BoardCard.board_id).where(BoardCard.lesson_id == to)
                db.execute(update(BoardCard).where(cards, BoardCard.board_id.not_in(has_it)).values(lesson_id=to))
            db.execute(delete(BoardCard).where(cards))
        module = chapter.module
        module.chapters.remove(chapter)
        db.delete(chapter)
        for position, c in enumerate(module.chapters):
            c.position = position
        module.version += 1
        db.flush()
        n += 1
    return n


def load_chapter_words(db: Session) -> int:
    """The seed's words for search on chapters that have none yet (a catalogue loaded before they were written): a
    chapter a content manager gave words keeps them."""
    n = 0
    for m in read("modules"):
        for c in m.get("chapters") or []:
            words = c.get("keywords") or []
            chapter = db.get(Chapter, c["id"]) if words else None
            if chapter is not None and not chapter.keywords:
                chapter.keywords = list(words)
                n += 1
    db.flush()
    return n


def _deleted(db: Session, action: str) -> set[str]:
    """Targets a moderator deleted (from the audit log), so the seed doesn't bring them back."""
    return {t for t in db.scalars(select(AuditEntry.target_id).where(AuditEntry.action == action)) if t}


# ── calendar ─────────────────────────────────────────────────────────────────────────────────


def load_calendar(db: Session) -> int:
    skip = set(db.scalars(select(CalendarEvent.id))) | _deleted(db, "calendar.delete")
    modules = set(db.scalars(select(Module.id)))
    n = 0
    for e in read("calendar"):
        if e["id"] in skip:
            continue
        module_id = e.get("moduleId")
        db.add(
            CalendarEvent(
                id=e["id"],
                date=dt.date.fromisoformat(e["date"]),
                end_date=dt.date.fromisoformat(e["endDate"]) if e.get("endDate") else None,
                time=e.get("time"),
                place=e.get("place"),
                title=e["title"],
                type=e["type"],
                year=e.get("year"),
                module_id=module_id if module_id in modules else None,
                unit_code=e.get("unitCode"),
                duration=e.get("duration"),
                rules=e.get("rules"),
                source=e.get("source"),
                checked_on=dt.date.fromisoformat(e["checkedOn"]) if e.get("checkedOn") else None,
                employer_id=e.get("employerId"),
                sample=bool(e.get("sample")),
                resit=bool(e.get("resit")),
            )
        )
        skip.add(e["id"])
        n += 1
    db.flush()
    return n


# ── newsletter ───────────────────────────────────────────────────────────────────────────────


def seed_issue(raw: dict[str, Any]) -> IssueCreate:
    """An issue from the seed file, checked against the API's schema."""
    return IssueCreate.model_validate(raw)


def load_newsletter(db: Session) -> int:
    """Issues come in as drafts: they were written around placeholder editors and wait for a moderator's review."""
    deleted = {
        s
        for s in db.scalars(select(AuditEntry.data["slug"].astext).where(AuditEntry.action == "newsletter.delete"))
        if s
    }
    skip = set(db.scalars(select(NewsletterIssue.slug))) | deleted
    n = 0
    for raw in read("newsletter"):
        if raw["slug"] in skip:
            continue
        db.add(newsletter.new_draft(seed_issue(raw)))
        skip.add(raw["slug"])
        n += 1
    db.flush()
    return n


# ── career ───────────────────────────────────────────────────────────────────────────────────


def load_career(db: Session) -> int:
    """Once, as starting content: after that the document is its editors' (PUT /career), and is never loaded over."""
    if db.get(ContentDoc, career.CAREER_KEY) is not None:
        return 0
    doc = CareerDoc.model_validate(read("career"))
    db.add(ContentDoc(key=career.CAREER_KEY, data=career.stored(doc)))
    db.flush()
    return 1


# ── the Drive folders the import reads ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class SeedFolder:
    kind: str
    title: str
    url: str
    author_name: str | None = None


def _clean_name(name: str) -> str:
    """Drops leading symbols, emoji and pictographs ('𓇼🧽🍍 Patrick: Business Edition' -> 'Patrick: Business
    Edition'). Hieroglyphs count as letters in Unicode, so anything outside the Basic Multilingual Plane goes too."""
    i = 0
    while i < len(name) and (not name[i].isalnum() or ord(name[i]) > 0xFFFF):
        i += 1
    return name[i:].strip()


def module_folders(m: dict[str, Any]) -> Iterator[SeedFolder]:
    """A module's shared Drive folders (and files) and students' notes, as the import's sources, each URL once."""
    r: dict[str, Any] = m.get("resources") or {}
    folders: list[SeedFolder] = []
    if r.get("materials"):
        folders.append(SeedFolder("course-materials", "Course materials", r["materials"]))
    if r.get("exercises"):
        folders.append(SeedFolder("exercises", "Exercises", r["exercises"]))
    if r.get("vle"):
        # One folder can hold both: then it is where the past papers are.
        if r["vle"] == r.get("olderExams"):
            folders.append(SeedFolder("past-paper", "VLE and older exams", r["vle"]))
        else:
            folders.append(SeedFolder("vle-materials", "VLE materials", r["vle"]))
    if r.get("olderExams"):
        folders.append(SeedFolder("past-paper", "Past exams", r["olderExams"]))
    if r.get("cheatSheet"):
        folders.append(SeedFolder("cheat-sheet", "Cheat sheet", r["cheatSheet"]))
    for note in m.get("notes") or []:
        url, raw = note.get("url"), (note.get("name") or "").strip()
        if not url or not raw:
            continue
        author = (note.get("author") or "").strip() or None
        name = _clean_name(raw) or raw
        title = f"{author}'s notes" if author and author == raw else name
        folders.append(SeedFolder("notes", title, url, author))

    seen: set[str] = set()
    for folder in folders:
        if not folder.url.startswith("https://") or folder.url in seen:
            continue
        seen.add(folder.url)
        yield folder


def load_drive_folders(db: Session) -> int:
    """The modules' Drive folders, for the import (DriveFolder): new ones are added, existing ones left as they are."""
    modules = set(db.scalars(select(Module.id)))
    known = set(db.execute(select(DriveFolder.module_id, DriveFolder.url)).tuples())
    n = 0
    for spec in read("modules"):
        if spec["id"] not in modules:
            continue
        for folder in module_folders(spec):
            if (spec["id"], folder.url) in known:
                continue
            db.add(
                DriveFolder(
                    module_id=spec["id"],
                    kind=folder.kind,
                    title=folder.title,
                    url=folder.url,
                    author_name=folder.author_name,
                )
            )
            known.add((spec["id"], folder.url))
            n += 1
    db.flush()
    return n


# ── Daily ────────────────────────────────────────────────────────────────────────────────────

DAILY = DATA / "daily"


def daily_guess_words() -> list[str]:
    """The word game's starting guess list: a dictionary's five-letter words, public like any word list."""
    return [w.upper() for w in (DAILY / "guesses.txt").read_text(encoding="utf-8").split()]


def load_daily(db: Session) -> int:
    """The themes, once, into a Daily that has none (out of the rotation until they have puzzles), and the word game's
    guess list into a Daily whose list is short. The puzzles (answers, groups, questions, vocabulary) stay out of the
    public repository: they come from a content file (`python -m app.cli daily-content import FILE`) or from Manage."""
    added = 0
    if db.scalar(select(DailyTheme.id).limit(1)) is None:
        themes = json.loads((DAILY / "themes.json").read_text(encoding="utf-8"))
        for position, t in enumerate(themes):
            db.add(DailyTheme(id=t["id"], title=t["title"], blurb=t["blurb"], position=position, in_rotation=False))
        added += len(themes)
    added += top_up_guess_list(db)
    db.flush()
    return added


# A guess list shorter than this never got the shipped one (a content file loaded first brings its answers only), and
# the word game refuses everyday guesses. Editors take words off a full list one by one, never this many.
SHORT_GUESS_LIST = 5_000


def guess_list_size(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(DailyGuessWord)) or 0


def top_up_guess_list(db: Session) -> int:
    """The shipped guess list, into a list that is short; a full list keeps the words editors took off it. How many
    words it added."""
    if guess_list_size(db) >= SHORT_GUESS_LIST:
        return 0
    return add_guess_words(db, daily_guess_words())


def add_guess_words(db: Session, words: Sequence[str]) -> int:
    """The words the guess list lacks, added; how many."""
    if not words:
        return 0
    before = guess_list_size(db)
    db.execute(pg_insert(DailyGuessWord).on_conflict_do_nothing(), [{"word": w} for w in words])
    return guess_list_size(db) - before


# ── past questions ───────────────────────────────────────────────────────────────────────────


def load_chapter_outlines(db: Session) -> int:
    """What each module's study guide says its chapters cover (services/chapter_outlines.py), for Claude's tags."""
    return chapter_outlines.load(db, read(chapter_outlines.SEED_FILE))


def load_paper_questions(db: Session) -> int:
    """Claude's tags of past papers' questions (`python -m app.cli export-question-tags` writes the file), on the
    papers this install has: services/question_tagging.py import_tags() says what it leaves out."""
    return question_tagging.import_tags(db, read(question_tagging.SEED_FILE))


def load_report_answers(db: Session) -> int:
    """Whether each examiners' report already read works through its questions, and where each question starts
    (services/report_answers.py). It reads them all again each time, so a new install or a changed reader is never
    left with stale pages; how many reports."""
    return report_answers.backfill(db)[0]


# Order matters: Drive folders and calendar events refer to modules, the tags to chapters and papers.
SECTIONS: dict[str, Callable[[Session], int]] = {
    "modules": load_modules,
    "broken-chapters": remove_broken_chapters,
    "chapter-words": load_chapter_words,
    "chapter-outlines": load_chapter_outlines,
    "calendar": load_calendar,
    "newsletter": load_newsletter,
    "career": load_career,
    "drive-folders": load_drive_folders,
    "daily": load_daily,
    "paper-questions": load_paper_questions,
    "report-answers": load_report_answers,
}


def load_all(db: Session, only: str | None = None) -> dict[str, int]:
    """-> {section: rows inserted}."""
    report: dict[str, int] = {}
    for name, fn in SECTIONS.items():
        if only and name != only:
            continue
        report[name] = fn(db)
    return report
