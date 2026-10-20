"""A hidden module hides its files, past questions and chapters from students; staff still see them (SEC-55)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Chapter, Module, User
from tests.content.conftest import API

Clients = Callable[..., TestClient]
Share = Callable[..., dict[str, Any]]
MODULE = "economics"


def _first_chapter(db: Session) -> Chapter:
    chapter = db.scalars(select(Chapter).where(Chapter.module_id == MODULE).order_by(Chapter.position)).first()
    assert chapter is not None
    return chapter


def _hide_module(db: Session) -> None:
    module = db.get(Module, MODULE)
    assert module is not None
    module.hidden = True
    db.commit()


@pytest.fixture
def questions_on(set_feature: Callable[..., None]) -> None:
    set_feature("library.questions", "everyone")


def test_hidden_chapters_take_no_tags_and_stay_unlisted(
    client_for: Clients,
    student: User,
    moderator: User,
    modules: dict[str, Module],
    share_file: Share,
    questions_on: None,
    db: Session,
) -> None:
    paper = share_file(client_for(moderator), title="EC1002 ZA May 2024", kind="past-paper", module_id=MODULE)
    chapter = _first_chapter(db)
    body = {"question": 1, "chapterId": chapter.id}
    assert client_for(moderator).post(f"{API}/library/items/{paper['id']}/questions", json=body).status_code == 201
    chapter.hidden = True
    chapter.title = "Unreleased chapter title"
    db.commit()

    r = client_for(student).post(f"{API}/library/items/{paper['id']}/questions", json={**body, "question": 2})
    assert r.status_code == 422
    assert "chapterId" in r.json()["error"]["fields"]
    guest = client_for()
    assert guest.get(f"{API}/library/questions", params={"module_id": MODULE}).json() == []
    assert guest.get(f"{API}/library/items/{paper['id']}/questions").json() == []
    staff = client_for(moderator).get(f"{API}/library/questions", params={"module_id": MODULE}).json()
    assert [t["chapterTitle"] for t in staff] == ["Unreleased chapter title"]


def test_a_hidden_modules_questions_and_files_are_hidden_from_students(
    client_for: Clients,
    student: User,
    moderator: User,
    modules: dict[str, Module],
    share_file: Share,
    questions_on: None,
    db: Session,
) -> None:
    paper = share_file(client_for(moderator), title="EC1002 ZA May 2024", kind="past-paper", module_id=MODULE)
    chapter = _first_chapter(db)
    tagged = client_for(moderator).post(
        f"{API}/library/items/{paper['id']}/questions", json={"question": 1, "chapterId": chapter.id}
    )
    assert tagged.status_code == 201
    _hide_module(db)

    for who in (client_for(), client_for(student)):
        assert who.get(f"{API}/modules/{MODULE}").status_code == 404
        assert who.get(f"{API}/library/questions", params={"module_id": MODULE}).status_code == 422
        assert who.get(f"{API}/library/items/{paper['id']}").status_code == 404
        assert who.get(f"{API}/library/items/{paper['id']}/questions").status_code == 404
        listed = who.get(f"{API}/library/items", params={"module_id": MODULE}).json()
        assert listed["items"] == []
        assert who.get(f"{API}/library/papers", params={"module_id": MODULE}).status_code == 422

    staff = client_for(moderator)
    assert staff.get(f"{API}/library/items/{paper['id']}").status_code == 200
    assert len(staff.get(f"{API}/library/questions", params={"module_id": MODULE}).json()) == 1
    assert [i["id"] for i in staff.get(f"{API}/library/items", params={"module_id": MODULE}).json()["items"]] == [
        paper["id"]
    ]


def test_a_hidden_modules_files_stay_with_their_uploader(
    client_for: Clients, student: User, modules: dict[str, Module], share_file: Share, db: Session
) -> None:
    mine = share_file(client_for(student), title="My notes", kind="notes", module_id=MODULE)
    _hide_module(db)
    assert client_for(student).get(f"{API}/library/items/{mine['id']}").status_code == 200
    yours = client_for(student).get(f"{API}/library/items", params={"mine": "true"}).json()["items"]
    assert [i["id"] for i in yours] == [mine["id"]]
