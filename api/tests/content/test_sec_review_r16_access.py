"""Security review, round 16 (access): proof tests. Each passes while the problem it shows is there."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Chapter, Module, User
from tests.content.conftest import API

Clients = Callable[..., TestClient]
Share = Callable[..., dict[str, Any]]
MODULE = "economics"


def test_r16_hidden_chapters_take_tags_and_their_titles_show_to_guests(
    client_for: Clients,
    student: User,
    moderator: User,
    modules: dict[str, Module],
    share_file: Share,
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    set_feature("library.questions", "everyone")
    paper = share_file(client_for(moderator), title="EC1002 ZA May 2024", kind="past-paper", module_id=MODULE)
    chapter = db.scalars(select(Chapter).where(Chapter.module_id == MODULE).order_by(Chapter.position)).first()
    assert chapter is not None
    chapter.hidden = True
    chapter.title = "Unreleased chapter title"
    db.commit()
    guest = client_for()
    assert all(c["id"] != chapter.id for c in guest.get(f"{API}/modules/{MODULE}").json()["chapters"])

    body = {"question": 1, "chapterId": chapter.id}
    r = client_for(student).post(f"{API}/library/items/{paper['id']}/questions", json=body)
    assert r.status_code == 201, r.text  # a hidden chapter takes a tag
    listed = guest.get(f"{API}/library/questions", params={"module_id": MODULE}).json()
    assert [t["chapterTitle"] for t in listed] == ["Unreleased chapter title"]  # and a guest reads its title


def test_r16_a_hidden_modules_questions_list_for_guests(
    client_for: Clients,
    moderator: User,
    modules: dict[str, Module],
    share_file: Share,
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    set_feature("library.questions", "everyone")
    paper = share_file(client_for(moderator), title="EC1002 ZA May 2024", kind="past-paper", module_id=MODULE)
    chapter = db.scalars(select(Chapter).where(Chapter.module_id == MODULE).order_by(Chapter.position)).first()
    assert chapter is not None
    assert (
        client_for(moderator)
        .post(f"{API}/library/items/{paper['id']}/questions", json={"question": 1, "chapterId": chapter.id})
        .status_code
        == 201
    )
    module = db.get(Module, MODULE)
    assert module is not None
    module.hidden = True
    db.commit()
    guest = client_for()
    assert guest.get(f"{API}/modules/{MODULE}").status_code == 404
    listed = guest.get(f"{API}/library/questions", params={"module_id": MODULE})
    assert listed.status_code == 200
    assert len(listed.json()) == 1
