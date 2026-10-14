"""Loads the reference content in app/seed/data/*.json: modules, calendar dates, newsletter issues, the Career
Navigator document and the library's links.

Idempotent: running it again adds what is missing and never overwrites what moderators changed through the API.
Something a moderator deleted stays deleted: calendar events and newsletter issues are looked up in the audit log
(calendar.delete, newsletter.delete), and removed library items keep their row with status `removed`.
Modules are starting content only: they load into an empty catalogue, and after that content managers edit them in
the app (a module they removed stays removed).
Newsletter issues and the career document go through the schemas the API checks writes with, and are stored in
the same shape: a seed file that doesn't fit them fails loudly instead of loading content the app can't show.
Owner: content agent."""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.text import slugify, unique_slug
from app.models import (
    AuditEntry,
    CalendarEvent,
    Chapter,
    ContentDoc,
    ItemSource,
    ItemStatus,
    Lesson,
    LibraryItem,
    Module,
    NewsletterIssue,
)
from app.schemas.career import CareerDoc
from app.schemas.newsletter import IssueCreate
from app.services import career, newsletter
from app.services.library import REFERENCE_PUBLISHED_AT

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
                position=m.get("position", 0),
                resources=m.get("resources") or {},
                chapters=chapters,
            )
        )
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


# ── library: the links of each module ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SeedLink:
    kind: str
    title: str
    url: str
    description: str
    author_name: str | None = None


def _clean_name(name: str) -> str:
    """Drops leading symbols, emoji and pictographs ('𓇼🧽🍍 Patrick: Business Edition' -> 'Patrick: Business
    Edition'). Hieroglyphs count as letters in Unicode, so anything outside the Basic Multilingual Plane goes too."""
    i = 0
    while i < len(name) and (not name[i].isalnum() or ord(name[i]) > 0xFFFF):
        i += 1
    return name[i:].strip()


def module_links(m: dict[str, Any]) -> Iterator[SeedLink]:
    """A module's shared folders and students' notes as library links, each URL once per module."""
    r: dict[str, Any] = m.get("resources") or {}
    code = m.get("unitCode") or m["name"]
    links: list[SeedLink] = []
    if r.get("materials"):
        links.append(
            SeedLink(
                "course-materials",
                "Course materials",
                r["materials"],
                f"The books and study guide for {code}, in the shared folder.",
            )
        )
    if r.get("exercises"):
        note = (r.get("exercisesNote") or "").strip()
        links.append(SeedLink("exercises", "Exercises", r["exercises"], note or "Practice questions for this module."))
    vle, older = r.get("vle"), r.get("olderExams")
    if vle and vle == older:  # one folder holds both: it is where the past papers are
        links.append(
            SeedLink(
                "past-paper", "VLE and older exams", vle, "Past papers from the VLE and older sittings, in one folder."
            )
        )
    else:
        if vle:
            links.append(SeedLink("vle-materials", "VLE materials", vle, "Papers and material from the VLE."))
        if older:
            links.append(SeedLink("past-paper", "Past exams", older, "Older papers from earlier sittings."))
    if r.get("cheatSheet"):
        links.append(SeedLink("cheat-sheet", "Cheat sheet", r["cheatSheet"], "A quick-reference sheet for revision."))
    for note in m.get("notes") or []:
        url, raw = note.get("url"), (note.get("name") or "").strip()
        if not url or not raw:
            continue
        author = (note.get("author") or "").strip() or None
        name = _clean_name(raw) or raw
        title = f"{author}'s notes" if author and author == raw else name
        description = f"Shared by {author}." if author else "Shared by a student."
        links.append(SeedLink("notes", title, url, description, author))

    seen: set[str] = set()
    for link in links:
        if not link.url.startswith("https://") or link.url in seen:
            continue
        seen.add(link.url)
        yield link


def _slug_base(module: Module, title: str) -> str:
    plain = title.replace("'", "").replace("\u2019", "")
    return slugify(f"{module.unit_code or module.id} {plain}")


def load_library(db: Session) -> int:
    modules = {m.id: m for m in db.scalars(select(Module))}
    known: list[tuple[str | None, str | None, str]] = [
        (mid, url, slug)
        for mid, url, slug in db.execute(
            select(LibraryItem.module_id, LibraryItem.url, LibraryItem.slug).where(
                LibraryItem.source == ItemSource.link
            )
        )
    ]
    n = 0
    for spec in read("modules"):
        module = modules.get(spec["id"])
        if module is None:
            continue
        for link in module_links(spec):
            base = _slug_base(module, link.title)
            # Already there (in any state), even if a moderator moved it to another module since.
            if any(
                u == link.url and (mid == module.id or s == base or s.startswith(f"{base}-")) for mid, u, s in known
            ):
                continue
            item = LibraryItem(
                slug=unique_slug(db, LibraryItem.slug, base, fallback="link"),
                source=ItemSource.link,
                kind=link.kind,
                title=link.title,
                description=link.description,
                module_id=module.id,
                year=module.year,
                url=link.url,
                author_name=link.author_name,
                status=ItemStatus.published,
                published_at=REFERENCE_PUBLISHED_AT,  # before anything students share
            )
            db.add(item)
            db.flush()
            known.append((module.id, link.url, item.slug))
            n += 1
    return n


# Order matters: library links and calendar events refer to modules.
SECTIONS: dict[str, Callable[[Session], int]] = {
    "modules": load_modules,
    "calendar": load_calendar,
    "newsletter": load_newsletter,
    "career": load_career,
    "library": load_library,
}


def load_all(db: Session, only: str | None = None) -> dict[str, int]:
    """-> {section: rows inserted}."""
    report: dict[str, int] = {}
    for name, fn in SECTIONS.items():
        if only and name != only:
            continue
        try:
            report[name] = fn(db)
        except NotImplementedError:
            report[name] = -1  # not built yet
    return report
