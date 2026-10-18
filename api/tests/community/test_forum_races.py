"""A category or tag removed in Manage → Forum while a thread is written with it, on real separate connections.

The usual fixtures run each test in one rolled-back transaction, which can't show a race: these tests commit a
category and a tag of their own through a separate engine, act on them from there in the middle of a write, and
delete them (and any thread left with them) afterwards."""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, any_, create_engine, delete, func, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.errors import ApiError
from app.models import ForumCategory, ForumTag, ForumThread, PostStatus, User
from app.schemas.forum import ForumSettingsSave
from app.services.forum import settings, taxonomy, threads
from app.services.forum.rules import hold_lists
from tests.community.helpers import API

Client = Callable[..., TestClient]
CATEGORY, TAG = "race-category", "race-tag"


@pytest.fixture
def elsewhere(engine: Engine) -> Iterator[sessionmaker[Session]]:
    """Sessions on connections of their own: what they commit, every other connection sees."""
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False, autoflush=False)
    separate.dispose()


@pytest.fixture
def lists(elsewhere: sessionmaker[Session]) -> Iterator[None]:
    """A category and a tag nobody uses yet, committed; removed afterwards with any thread left with them."""
    with elsewhere() as s:
        s.add(ForumCategory(id=CATEGORY, label="Race", short="Race", year=None, blurb="Removed mid-post", position=99))
        s.add(ForumTag(id=TAG, label="Race", position=99))
        s.commit()
    yield
    with elsewhere() as s:
        s.execute(delete(ForumThread).where(ForumThread.category == CATEGORY))
        s.execute(delete(ForumThread).where(any_(ForumThread.tags) == TAG))
        s.execute(delete(ForumCategory).where(ForumCategory.id == CATEGORY))
        s.execute(delete(ForumTag).where(ForumTag.id == TAG))
        s.commit()


def _remove(sessions: sessionmaker[Session], what: str) -> None:
    """A moderator's save, committed: the category or the tag is gone."""
    with sessions() as s:
        if what == "category":
            s.execute(delete(ForumCategory).where(ForumCategory.id == CATEGORY))
        else:
            s.execute(delete(ForumTag).where(ForumTag.id == TAG))
        s.commit()


@pytest.mark.parametrize(
    ("what", "field", "message"),
    [
        ("category", "category", "Choose a category from the list."),
        ("tag", "tags", "Pick tags from the list."),
    ],
)
def test_a_thread_written_with_a_category_or_tag_removed_meanwhile_is_refused_like_an_unknown_one(
    client_for: Client,
    student: User,
    db: Session,
    lists: None,
    elsewhere: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    what: str,
    field: str,
    message: str,
) -> None:
    """The category and tag are there when the request reads the forum's lists, and gone (a moderator's save
    committed) by the time the thread is written: the student hears what they would have heard a moment later."""

    def removed_after_reading(session: Session) -> taxonomy.Taxonomy:
        lists_read = taxonomy.load(session)
        _remove(elsewhere, what)
        return lists_read

    monkeypatch.setattr(threads, "load_taxonomy", removed_after_reading)
    r = client_for(student).post(
        f"{API}/forum/threads",
        json={"title": "Who wants to revise?", "body": "Library, Thursday.", "category": CATEGORY, "tags": [TAG]},
    )

    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "invalid_input"
    assert r.json()["error"]["fields"] == {field: message}
    db.rollback()  # the request's work, and the hold it took on the category, end here as they would with it
    assert db.scalar(select(ForumThread).where(ForumThread.title == "Who wants to revise?")) is None


def _once_a_statement_waits(sessions: sessionmaker[Session], then: Callable[[], None]) -> threading.Thread:
    """Runs `then` on a thread of its own as soon as a statement in this database waits for a lock (or after ten
    seconds, so a test that never waits still ends)."""

    def run() -> None:
        deadline = time.monotonic() + 10
        with sessions() as s:
            while time.monotonic() < deadline:
                waiting = s.scalar(
                    text(
                        "SELECT count(*) FROM pg_stat_activity "
                        "WHERE datname = current_database() AND wait_event_type = 'Lock'"
                    )
                )
                s.rollback()  # pg_stat_activity is read once per transaction
                if waiting:
                    break
                time.sleep(0.02)
        then()

    worker = threading.Thread(target=run)
    worker.start()
    return worker


@pytest.mark.parametrize("what", ["category", "tag"])
def test_a_save_removing_a_category_or_tag_a_thread_is_being_written_with_waits_and_keeps_it(
    lists: None, elsewhere: sessionmaker[Session], what: str
) -> None:
    """The thread holds its category and tags while it is written, so the save waits for it, then finds them in use
    and is refused like any save that drops one in use (422), instead of failing on the thread."""
    moderator = User(id=uuid.uuid4(), email="race.moderator@example.com", display_name="Race Moderator")
    posting, saving = elsewhere(), elsewhere()
    try:
        hold_lists(posting, CATEGORY, [TAG])  # a student's thread, written but not committed yet
        posting.add(
            ForumThread(
                slug=f"race-{uuid.uuid4().hex[:8]}",
                title="Who wants to revise?",
                body="Library, Thursday.",
                category=CATEGORY,
                tags=[TAG],
                status=PostStatus.visible,
            )
        )
        posting.flush()
        current = settings.settings(saving)
        if what == "category":
            data = current.model_copy(update={"categories": [c for c in current.categories if c.id != CATEGORY]})
        else:
            data = current.model_copy(update={"tags": [t for t in current.tags if t.id != TAG]})
        worker = _once_a_statement_waits(elsewhere, posting.commit)
        with pytest.raises(ApiError) as refused:
            settings.save(saving, moderator, ForumSettingsSave(version=0, data=data), None)
        worker.join()
    finally:
        saving.rollback()
        saving.close()
        posting.close()

    assert (refused.value.status, refused.value.code) == (422, "invalid_input")
    assert refused.value.fields is not None
    field = "data.categories" if what == "category" else "data.tags"
    assert "Retire it instead" in refused.value.fields[field]
    with elsewhere() as s:
        assert s.get(ForumCategory, CATEGORY) is not None
        assert s.get(ForumTag, TAG) is not None
        assert s.scalar(select(func.count()).select_from(ForumThread).where(ForumThread.category == CATEGORY)) == 1
