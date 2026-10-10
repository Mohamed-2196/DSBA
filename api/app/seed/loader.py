"""Loads the reference content exported from the prototype (app/seed/data/*.json, exported once from the prototype at commit 350b0d8).

Idempotent: running it again adds what is missing and never overwrites what moderators changed through the API.
Something a moderator deleted stays deleted: calendar events and newsletter issues are looked up in the audit log
(calendar.delete, newsletter.delete), and removed library items keep their row with status `removed`.
Modules are the exception: they have no editing API, so the seed file is their source of truth (upsert).
Owner: content agent (modules section by the lead)."""

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
from app.core.time import utcnow
from app.models import (
    AuditEntry,
    CalendarEvent,
    ContentDoc,
    IssueStatus,
    ItemSource,
    ItemStatus,
    LibraryItem,
    Module,
    NewsletterIssue,
)

DATA = Path(__file__).parent / "data"


def read(name: str) -> Any:
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def load_modules(db: Session) -> int:
    n = 0
    for m in read("modules"):
        row = db.get(Module, m["id"]) or Module(id=m["id"])
        row.unit_code = m.get("unitCode")
        row.name = m["name"]
        row.short_name = m["shortName"]
        row.year = m["year"]
        row.description = m.get("description") or ""
        row.icon = m.get("icon")
        row.position = m.get("position", 0)
        row.resources = m.get("resources") or {}
        row.chapters = m.get("chapters") or []
        db.add(row)
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
                sample=bool(e.get("sample")),
            )
        )
        skip.add(e["id"])
        n += 1
    db.flush()
    return n


# ── newsletter ───────────────────────────────────────────────────────────────────────────────


def _section(s: dict[str, Any]) -> dict[str, Any]:
    """A section as written, minus the prototype's made-up reaction counts (real ones are newsletter_reactions)."""
    return {k: v for k, v in s.items() if k != "reactions"}


def load_newsletter(db: Session) -> int:
    """Issues come in as drafts: they were written around placeholder editors and wait for a moderator's review."""
    deleted = {
        s
        for s in db.scalars(select(AuditEntry.data["slug"].astext).where(AuditEntry.action == "newsletter.delete"))
        if s
    }
    skip = set(db.scalars(select(NewsletterIssue.slug))) | deleted
    n = 0
    for i in read("newsletter"):
        if i["slug"] in skip:
            continue
        db.add(
            NewsletterIssue(
                slug=i["slug"],
                number=i["number"],
                title=i["title"],
                date=dt.date.fromisoformat(i["date"]),
                cover=i.get("cover") or {},
                dek=i.get("dek") or "",
                summary=i.get("summary") or "",
                editors=list(i.get("editors") or []),
                sections=[_section(s) for s in i.get("sections") or []],
                status=IssueStatus.draft,
            )
        )
        skip.add(i["slug"])
        n += 1
    db.flush()
    return n


# ── career ───────────────────────────────────────────────────────────────────────────────────


def load_career(db: Session) -> int:
    if db.get(ContentDoc, "career") is not None:
        return 0
    db.add(ContentDoc(key="career", data=read("career")))
    db.flush()
    return 1


# ── library: the v1 links of each module ─────────────────────────────────────────────────────


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
    """A module's v1 resources and students' notes as library links, each URL once per module."""
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
    now = utcnow()
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
                published_at=now,
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
    """-> {section: rows inserted or updated}."""
    report: dict[str, int] = {}
    for name, fn in SECTIONS.items():
        if only and name != only:
            continue
        try:
            report[name] = fn(db)
        except NotImplementedError:
            report[name] = -1  # not built yet
    return report
