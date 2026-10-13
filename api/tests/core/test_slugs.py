"""insert_with_unique_slug(): retries only a clash on the slug's own unique constraint; any other integrity error is
raised as it is."""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Callable
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import text
from app.core.errors import ApiError
from app.core.text import insert_with_unique_slug
from app.models.content import CalendarEvent
from app.models.library import ItemSource, LibraryItem


def _item(**fields: object) -> LibraryItem:
    values: dict[str, object] = {"source": ItemSource.link, "kind": "notes", "title": "Week 3 notes"}
    values.update(fields)
    return LibraryItem(url="https://example.com/notes", **values)


@pytest.fixture
def stale_slug(monkeypatch: pytest.MonkeyPatch) -> Callable[[str], None]:
    """Makes unique_slug() answer `slug` whatever the table holds: what a parallel request saw before this one saved."""

    def _set(slug: str) -> None:
        monkeypatch.setattr(text, "unique_slug", lambda *_args, **_kwargs: slug)

    return _set


def test_a_free_slug_is_used_as_it_is(db: Session) -> None:
    title = f"Free {uuid.uuid4().hex[:6]}"
    item = _item(title=title)
    insert_with_unique_slug(db, item, LibraryItem.slug, title, fallback="link")
    assert item.slug == text.slugify(title)


def test_a_slug_race_retries_with_a_suffix(db: Session, stale_slug: Callable[[str], None]) -> None:
    taken = f"race-{uuid.uuid4().hex[:6]}"
    db.add(_item(slug=taken))
    db.flush()
    stale_slug(taken)

    item = _item()
    insert_with_unique_slug(db, item, LibraryItem.slug, "anything", fallback="link")

    assert item.slug.startswith(f"{taken}-")
    assert db.scalar(select(LibraryItem.slug).where(LibraryItem.id == item.id)) == item.slug


def test_a_slug_race_lost_every_time_answers_409_retry(
    db: Session, stale_slug: Callable[[str], None], monkeypatch: pytest.MonkeyPatch
) -> None:
    taken = f"race-{uuid.uuid4().hex[:6]}"
    db.add_all([_item(slug=taken), _item(slug=f"{taken}-beef")])
    db.flush()
    stale_slug(taken)
    monkeypatch.setattr(secrets, "token_hex", lambda _n: "beef")

    with pytest.raises(ApiError) as caught:
        insert_with_unique_slug(db, _item(), LibraryItem.slug, "anything", fallback="link")
    assert caught.value.status == 409
    assert caught.value.code == "retry"


def test_a_check_violation_is_raised_not_answered_with_retry(db: Session) -> None:
    with pytest.raises(IntegrityError) as caught:
        insert_with_unique_slug(db, _item(kind="not-a-kind"), LibraryItem.slug, "Bad kind", fallback="link")
    assert "ck_library_items_kind" in str(caught.value)


def test_a_clash_on_another_unique_column_is_raised(db: Session) -> None:
    key = f"drive/test/{uuid.uuid4().hex}"
    db.add(_item(slug=f"first-{uuid.uuid4().hex[:6]}", import_key=key))
    db.flush()
    with pytest.raises(IntegrityError) as caught:
        insert_with_unique_slug(db, _item(import_key=key), LibraryItem.slug, "Second", fallback="link")
    assert "uq_library_items_import_key" in str(caught.value)


def test_a_primary_key_used_as_the_slug_retries_too(db: Session, stale_slug: Callable[[str], None]) -> None:
    taken = f"2026-05-01-exam-{uuid.uuid4().hex[:6]}"

    def event(event_id: str | None = None) -> CalendarEvent:
        return CalendarEvent(id=event_id, title="Exam", type="exam", date=date(2026, 5, 1))

    db.add(event(taken))
    db.flush()
    stale_slug(taken)

    second = event()
    insert_with_unique_slug(db, second, CalendarEvent.id, "anything", fallback="event")
    assert second.id.startswith(f"{taken}-")
