"""Manage → Forum (holders of forum.moderate): the categories and tags, where a thread goes when no year fits it, and
the forum's guidelines and tips, saved together.

- editable(): everything, with the version a save names (the forum document's: 0 until the first save) and how many
  threads use each category and tag.
- save(): the whole, if nobody saved it since `version` (409 forum_changed). A category or tag that threads use can't
  be removed: it is retired instead (422), so threads keep their category ids. A new category or tag is a new id;
  ids never change. Audited with what changed, before and after.
Services leave the commit to the handler."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import invalid
from app.core.time import utcnow
from app.models import ForumCategory, ForumTag, ForumThread, User
from app.schemas.forum import ForumSettings, ForumSettingsEditable, ForumSettingsSave
from app.services import documents
from app.services.content import record
from app.services.forum.taxonomy import FORUM, categories, category_out, doc, tag_out, tags


def threads_by_category(db: Session) -> dict[str, int]:
    """Every thread counts, hidden and deleted ones too: each keeps its category."""
    rows = db.execute(select(ForumThread.category, func.count()).group_by(ForumThread.category)).tuples()
    return dict(rows.all())


def threads_by_tag(db: Session) -> dict[str, int]:
    tagged = select(func.unnest(ForumThread.tags).label("tag")).subquery()
    rows = db.execute(select(tagged.c.tag, func.count()).group_by(tagged.c.tag)).tuples()
    return dict(rows.all())


def settings(db: Session) -> ForumSettings:
    words = doc(db)
    return ForumSettings(
        default_category=words.default_category,
        guidelines=words.guidelines,
        tips=words.tips,
        categories=[category_out(c) for c in categories(db)],
        tags=[tag_out(t) for t in tags(db)],
    )


def editable(db: Session) -> ForumSettingsEditable:
    saved = documents.editable(db, FORUM)
    return ForumSettingsEditable(
        data=settings(db),
        version=saved.version,
        updated_at=saved.updated_at,
        updated_by=saved.updated_by,
        threads_by_category=threads_by_category(db),
        threads_by_tag=threads_by_tag(db),
    )


def _threads(n: int) -> str:
    return f"{n} thread{'' if n == 1 else 's'}"


def _hold_removed(db: Session, new: ForumSettings) -> None:
    """Locks the categories and tags the save removes (FOR UPDATE) before they are counted: a thread being written
    with one of them holds it (forum/rules.py hold_lists), so the save waits for that thread and then counts it; a
    thread written after this waits for the save, and finds them gone."""
    removed = select(ForumCategory.id).where(ForumCategory.id.not_in([c.id for c in new.categories]))
    db.execute(removed.with_for_update())
    db.execute(select(ForumTag.id).where(ForumTag.id.not_in([t.id for t in new.tags])).with_for_update())


def _keep_used(db: Session, new: ForumSettings) -> None:
    """422 when the settings drop a category or a tag that threads still use."""
    kept = {c.id for c in new.categories}
    used = threads_by_category(db)
    for c in categories(db):
        if c.id not in kept and used.get(c.id):
            raise invalid(
                "data.categories",
                f"“{c.label}” has {_threads(used[c.id])}. Retire it instead: it stops being offered, and its threads "
                "keep it.",
            )
    kept = {t.id for t in new.tags}
    used = threads_by_tag(db)
    for t in tags(db):
        if t.id not in kept and used.get(t.id):
            raise invalid(
                "data.tags",
                f"“{t.label}” is on {_threads(used[t.id])}. Retire it instead: it stops being offered, and those "
                "threads keep it.",
            )


def _write_lists(db: Session, new: ForumSettings) -> None:
    """The tables as the settings list them, in their order."""
    for position, c in enumerate(new.categories):
        row = db.get(ForumCategory, c.id) or ForumCategory(id=c.id)
        row.label, row.short, row.year, row.blurb, row.icon = c.label, c.short, c.year, c.blurb, c.icon
        row.position, row.retired = position, c.retired
        db.add(row)
    for position, t in enumerate(new.tags):
        tag = db.get(ForumTag, t.id) or ForumTag(id=t.id)
        tag.label, tag.position, tag.retired = t.label, position, t.retired
        db.add(tag)
    db.flush()
    db.execute(delete(ForumCategory).where(ForumCategory.id.not_in([c.id for c in new.categories])))
    db.execute(delete(ForumTag).where(ForumTag.id.not_in([t.id for t in new.tags])))


def save(db: Session, user: User, body: ForumSettingsSave, ip: str | None) -> ForumSettingsEditable:
    row = documents.locked_row(db, FORUM, body.version)
    before: dict[str, Any] = documents.stored(settings(db))
    after = documents.stored(body.data)
    if before == after:
        return editable(db)
    _hold_removed(db, body.data)
    _keep_used(db, body.data)
    if row is None:
        row = documents.first_row(db, FORUM)  # before the lists, so two first saves never write them both
    _write_lists(db, body.data)
    row.data = documents.stored(body.data.doc())
    row.version += 1
    row.updated_at = utcnow()
    row.updated_by = user.id
    db.flush()
    record(db, user, FORUM.action, "content_doc", FORUM.key, FORUM.title, ip, **documents.audit_change(before, after))
    return editable(db)
