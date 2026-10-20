"""Practising a chapter: a student's done, stuck or skipped on tagged past questions (/library/question-marks),
private, kept by the question, in the export and gone with the account or the paper."""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Chapter, LibraryItem, Module, PaperQuestion, QuestionMark, User
from app.services import library, question_marks
from tests.content.conftest import API

Clients = Callable[..., TestClient]
URL = f"{API}/library/question-marks"


def add_paper(db: Session, module_id: str = "economics", **extra: Any) -> LibraryItem:
    module = db.get(Module, module_id)
    title = f"Paper {uuid.uuid4().hex[:6]}"
    item = library.create_imported(
        db,
        module,
        kind=extra.pop("kind", "past-paper"),
        title=title,
        storage_key=f"library/drive/{module_id}/{uuid.uuid4().hex}/f.pdf",
        file_name=f"{title}.pdf",
        size_bytes=10,
        import_key=f"drive/{module_id}/{uuid.uuid4().hex}",
        content_hash=hashlib.sha256(title.encode()).hexdigest(),
        exam_year=2024,
    )
    db.commit()
    return item


def tag(db: Session, paper: LibraryItem, question: int, section: str | None = None, chapter: int = 0) -> None:
    chapters = list(db.scalars(select(Chapter).where(Chapter.module_id == paper.module_id).order_by(Chapter.position)))
    db.add(PaperQuestion(item_id=paper.id, chapter_id=chapters[chapter].id, question=question, section=section))
    db.commit()


@pytest.fixture
def practice(set_feature: Callable[..., None], modules: dict[str, Module]) -> None:
    set_feature("library.questions", "everyone")
    set_feature("library.practice", "everyone")


def test_practice_is_off_until_switched_on_and_needs_an_account(
    client_for: Clients, student: User, set_feature: Callable[..., None], modules: dict[str, Module]
) -> None:
    me = client_for(student)
    set_feature("library.questions", "everyone")
    assert (me.get(URL).status_code, me.get(URL).json()["error"]["code"]) == (404, "feature_off")
    set_feature("library.practice", "everyone")
    assert me.get(URL).json() == []
    assert client_for().get(URL).status_code == 401
    r = client_for().put(URL, json={"itemId": str(uuid.uuid4()), "question": 1, "mark": "done"})
    assert r.status_code == 401


def test_students_mark_questions_done_stuck_or_skipped_and_only_see_their_own(
    client_for: Clients, student: User, other: User, db: Session, practice: None
) -> None:
    paper, stats = add_paper(db), add_paper(db, "statistics")
    tag(db, paper, 1)
    tag(db, paper, 1, chapter=1)  # the same question in two chapters: one mark
    tag(db, paper, 2, "B")
    tag(db, stats, 4)
    me, them = client_for(student), client_for(other)

    r = me.put(URL, json={"itemId": str(paper.id), "question": 1, "mark": "stuck"})
    assert r.status_code == 200, r.text
    assert (r.json()["mark"], r.json()["section"], r.json()["question"]) == ("stuck", None, 1)
    assert me.put(URL, json={"itemId": str(paper.id), "question": 1, "mark": "done"}).json()["mark"] == "done"
    skipped = {"itemId": str(paper.id), "section": "B", "question": 2, "mark": "skipped"}
    assert me.put(URL, json=skipped).status_code == 200
    assert me.put(URL, json={"itemId": str(stats.id), "question": 4, "mark": "done"}).status_code == 200
    assert db.scalar(select(QuestionMark.id).where(QuestionMark.question == 1)) is not None
    assert len(db.scalars(select(QuestionMark).where(QuestionMark.user_id == student.id)).all()) == 3

    mine = me.get(URL, params={"module_id": "economics"}).json()
    got = sorted((m["section"] or "", m["question"], m["mark"]) for m in mine)
    assert got == [("", 1, "done"), ("B", 2, "skipped")]
    assert len(me.get(URL).json()) == 3
    assert them.get(URL).json() == []  # private
    assert me.get(URL, params={"module_id": "nope"}).status_code == 422

    # not a tagged question of a published past paper: 404
    for body in (
        {"itemId": str(paper.id), "question": 3, "mark": "done"},  # untagged
        {"itemId": str(paper.id), "section": "A", "question": 2, "mark": "done"},  # B2, not A2
        {"itemId": str(uuid.uuid4()), "question": 1, "mark": "done"},
    ):
        r = me.put(URL, json=body)
        assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found"), body
    notes = add_paper(db, kind="notes")
    assert me.put(URL, json={"itemId": str(notes.id), "question": 1, "mark": "done"}).status_code == 404
    bad = me.put(URL, json={"itemId": str(paper.id), "question": 1, "mark": "great"})
    assert (bad.status_code, bad.json()["error"]["code"]) == (422, "invalid_input")
    assert me.put(URL, json={"itemId": str(paper.id), "question": 41, "mark": "done"}).status_code == 422

    # taking a mark back
    r = me.delete(URL, params={"item_id": str(paper.id), "section": "B", "question": 2})
    assert r.status_code == 204
    assert me.delete(URL, params={"item_id": str(paper.id), "section": "B", "question": 2}).status_code == 204
    assert [m["question"] for m in me.get(URL, params={"module_id": "economics"}).json()] == [1]

    # marks stay when a question's tags change, and go with the paper
    db.execute(delete(PaperQuestion).where(PaperQuestion.item_id == paper.id))
    db.commit()
    assert [m["question"] for m in me.get(URL, params={"module_id": "economics"}).json()] == [1]
    db.delete(db.get(LibraryItem, paper.id))
    db.commit()
    assert me.get(URL, params={"module_id": "economics"}).json() == []


def test_marks_are_limited_per_hour(
    client_for: Clients, student: User, db: Session, practice: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(question_marks, "MARKS_PER_HOUR", 2)
    paper = add_paper(db)
    for q in (1, 2, 3):
        tag(db, paper, q)
    me = client_for(student)
    for q in (1, 2):
        assert me.put(URL, json={"itemId": str(paper.id), "question": q, "mark": "done"}).status_code == 200
    r = me.put(URL, json={"itemId": str(paper.id), "question": 3, "mark": "done"})
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")


def test_marks_are_in_the_export_and_go_with_the_account(
    client_for: Clients, make_user: Callable[..., User], db: Session, practice: None
) -> None:
    user = make_user(email="practice@example.com", name="Layla Practice")
    paper = add_paper(db)
    tag(db, paper, 5)
    me = client_for(user)
    assert me.put(URL, json={"itemId": str(paper.id), "question": 5, "mark": "stuck"}).status_code == 200
    exported = me.get(f"{API}/me/export").json()["questionMarks"]
    assert [(m["itemId"], m["question"], m["mark"]) for m in exported] == [(str(paper.id), 5, "stuck")]
    db.delete(db.get(User, user.id))
    db.commit()
    assert db.scalars(select(QuestionMark)).all() == []
