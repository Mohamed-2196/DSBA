"""Practice scores on past papers: the student's own, saved in their account, in their export, gone with it."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ItemStatus, Module, PaperScore, User, UserStatus
from app.services import accounts
from tests.board.conftest import API, paper

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def scores(c: TestClient) -> list[dict[str, Any]]:
    r = c.get(f"{API}/paper-scores")
    assert r.status_code == 200, r.text
    out: list[dict[str, Any]] = r.json()
    return out


def test_a_score_is_saved_replaced_and_forgotten(
    client_for: ClientFor, make_user: MakeUser, db: Session, module: Module
) -> None:
    item = paper(db, module, 2024)
    c = client_for(make_user())
    r = c.put(f"{API}/paper-scores/{item.id}", json={"score": 72.5})
    assert r.status_code == 200, r.text
    assert r.json()["itemId"] == str(item.id)
    assert r.json()["score"] == 72.5
    assert c.put(f"{API}/paper-scores/{item.id}", json={"score": 81}).status_code == 200
    assert [(s["itemId"], s["score"]) for s in scores(c)] == [(str(item.id), 81)]
    assert c.delete(f"{API}/paper-scores/{item.id}").status_code == 204
    assert scores(c) == []
    assert c.delete(f"{API}/paper-scores/{item.id}").status_code == 204  # none left: nothing happens


def test_scores_are_private(client_for: ClientFor, make_user: MakeUser, db: Session, module: Module) -> None:
    item = paper(db, module, 2024)
    sara, ali = client_for(make_user()), client_for(make_user())
    sara.put(f"{API}/paper-scores/{item.id}", json={"score": 64})
    assert scores(ali) == []
    ali.delete(f"{API}/paper-scores/{item.id}")  # only his own, which he hasn't
    assert [s["score"] for s in scores(sara)] == [64]


def test_scores_out_of_100_with_one_decimal_at_most(
    client_for: ClientFor, make_user: MakeUser, db: Session, module: Module
) -> None:
    item = paper(db, module, 2024)
    c = client_for(make_user())
    for bad in (-1, 100.5, 72.25, "lots"):
        r = c.put(f"{API}/paper-scores/{item.id}", json={"score": bad})
        assert r.status_code == 422, bad
        assert "score" in r.json()["error"]["fields"]
    assert c.put(f"{API}/paper-scores/{item.id}", json={"score": 0}).status_code == 200
    assert c.put(f"{API}/paper-scores/{item.id}", json={"score": 100}).status_code == 200


def test_only_published_past_papers_take_a_score(
    client_for: ClientFor,
    make_user: MakeUser,
    db: Session,
    module: Module,
    set_feature: Callable[..., None],
) -> None:
    c = client_for(make_user())
    report = paper(db, module, 2024, kind="examiners-report")
    pending = paper(db, module, 2023)
    pending.status = ItemStatus.pending
    db.commit()
    for item_id in (report.id, pending.id, uuid.uuid4()):
        r = c.put(f"{API}/paper-scores/{item_id}", json={"score": 50})
        assert r.status_code == 404
        assert r.json()["error"]["message"] == "This past paper isn't in the library."
    item = paper(db, module, 2022)
    set_feature("library", "off")
    assert c.put(f"{API}/paper-scores/{item.id}", json={"score": 50}).status_code == 404


def test_guests_get_401_and_suspended_accounts_read_only(
    client_for: ClientFor, make_user: MakeUser, db: Session, module: Module
) -> None:
    item = paper(db, module, 2024)
    assert client_for().get(f"{API}/paper-scores").status_code == 401
    assert client_for().put(f"{API}/paper-scores/{item.id}", json={"score": 50}).status_code == 401
    user = make_user()
    c = client_for(user)
    c.put(f"{API}/paper-scores/{item.id}", json={"score": 50})
    user.status = UserStatus.suspended
    db.commit()
    assert [s["score"] for s in scores(c)] == [50]
    assert c.put(f"{API}/paper-scores/{item.id}", json={"score": 90}).status_code == 403
    assert c.delete(f"{API}/paper-scores/{item.id}").status_code == 403


def test_the_board_switched_off_hides_them(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    set_feature("board", "off")
    assert client_for(make_user()).get(f"{API}/paper-scores").status_code == 404


def test_in_the_export_and_gone_with_the_account(
    client_for: ClientFor, make_user: MakeUser, db: Session, module: Module, storage: Any
) -> None:
    item = paper(db, module, 2024)
    user = make_user()
    c = client_for(user)
    c.put(f"{API}/paper-scores/{item.id}", json={"score": 77})
    exported = c.get(f"{API}/me/export").json()["paperScores"]
    assert [(s["itemId"], s["score"]) for s in exported] == [(str(item.id), 77)]
    uid = user.id
    accounts.delete_account(db, user, storage)
    db.commit()
    assert db.scalars(select(PaperScore).where(PaperScore.user_id == uid)).all() == []


def test_a_score_goes_with_its_paper(client_for: ClientFor, make_user: MakeUser, db: Session, module: Module) -> None:
    item = paper(db, module, 2024)
    c = client_for(make_user())
    c.put(f"{API}/paper-scores/{item.id}", json={"score": 58})
    db.delete(item)
    db.commit()
    assert scores(c) == []
