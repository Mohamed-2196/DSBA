"""Lists that show people (threads, replies, library files) load those people's roles in one go: the number of
queries doesn't grow with the number of authors."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import Engine, event
from sqlalchemy.orm import Session

from app.models import User
from app.services import access
from tests.core.helpers import API, new_reply, new_thread, share_pdf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@contextmanager
def counting(engine: Engine) -> Iterator[list[str]]:
    seen: list[str] = []

    def count(conn: Any, cursor: Any, statement: str, *args: Any) -> None:
        seen.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", count)


def queries(engine: Engine, db: Session, c: TestClient, path: str) -> int:
    assert c.get(f"{API}{path}").status_code == 200  # the first request of a session also records that it was seen
    access.forget(db)  # nothing loaded before the request: every author's roles are read in it
    with counting(engine) as seen:
        assert c.get(f"{API}{path}").status_code == 200
    return len(seen)


def test_thread_lists_and_replies(client_for: ClientFor, make_user: MakeUser, engine: Engine, db: Session) -> None:
    reader = client_for(make_user(name="Reader"))
    t = new_thread(client_for(make_user(name="Asker")), "Many voices")
    for i in range(2):
        new_thread(client_for(make_user(name=f"Author {i}")), "Body", f"Thread {i}")
        new_reply(client_for(make_user(name=f"Replier {i}")), t["id"], f"Reply {i}")
    few = (queries(engine, db, reader, "/forum/threads"), queries(engine, db, reader, f"/forum/threads/{t['slug']}"))
    for i in range(2, 6):
        new_thread(client_for(make_user(name=f"Author {i}")), "Body", f"Thread {i}")
        new_reply(client_for(make_user(name=f"Replier {i}")), t["id"], f"Reply {i}")
    many = (queries(engine, db, reader, "/forum/threads"), queries(engine, db, reader, f"/forum/threads/{t['slug']}"))
    assert many == few


def test_library_lists(client_for: ClientFor, make_user: MakeUser, engine: Engine, db: Session, storage: Any) -> None:
    reader = client_for(make_user(name="Reader"))
    for i in range(2):
        share_pdf(client_for(make_user(name=f"Sharer {i}", roles=("student", "rep"))), storage, title=f"Notes {i}")
    few = queries(engine, db, reader, "/library/items")
    for i in range(2, 6):
        share_pdf(client_for(make_user(name=f"Sharer {i}", roles=("student", "rep"))), storage, title=f"Notes {i}")
    assert queries(engine, db, reader, "/library/items") == few
