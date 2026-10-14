"""Past papers by sitting (GET /library/papers, IDEA-1), past questions by topic (/library/questions, IDEA-3), and the
exam details read again from the names of files imported earlier (python -m app.cli exam-meta)."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.models import AuditEntry, Chapter, LibraryItem, Module, PaperQuestion, User
from app.services import library
from app.services.drive_import import backfill_exam_meta
from tests.content.conftest import API

Clients = Callable[..., TestClient]
Share = Callable[..., dict[str, Any]]
MODULE = "economics"


def chapters(db: Session, module_id: str = MODULE) -> list[Chapter]:
    return list(db.scalars(select(Chapter).where(Chapter.module_id == module_id).order_by(Chapter.position)))


def titles(items: list[dict[str, Any]]) -> list[str]:
    return [i["title"] for i in items]


# ── sittings ─────────────────────────────────────────────────────────────────────────────────


def test_a_modules_papers_come_by_sitting_with_their_reports_newest_first(
    client_for: Clients, moderator: User, student: User, modules: dict[str, Module], share_file: Share
) -> None:
    rep = client_for(moderator)

    def share(title: str, kind: str = "past-paper", **exam: Any) -> dict[str, Any]:
        return share_file(rep, title=title, kind=kind, module_id=MODULE, **exam)

    share("EC1002 ZA May 2024", exam_year=2024, exam_session="may", zone="A")
    share("EC1002 ZB May 2024", exam_year=2024, exam_session="may", zone="B")
    share("EC1002 commentary May 2024", "examiners-report", exam_year=2024, exam_session="may")
    share("EC1002 ZA solutions May 2024", "exam-solutions", exam_year=2024, exam_session="may", zone="A")
    share("EC1002 October 2024", exam_year=2024, exam_session="october")
    share("EC1002 2019 Zone A", exam_year=2019, zone="A")
    share("EC1002 sample paper")
    share("EC1002 notes", "notes")  # not a paper
    pending = share_file(client_for(student), title="EC1002 ZA May 2023", kind="past-paper", module_id=MODULE)
    assert pending["status"] == "pending"  # not public: not listed

    r = client_for().get(f"{API}/library/papers", params={"module_id": MODULE})
    assert r.status_code == 200, r.text
    body = r.json()
    shape = [
        (
            s["examYear"],
            s["session"],
            [(z["zone"], titles(z["papers"]), titles(z["reports"]), titles(z["solutions"])) for z in s["zones"]],
        )
        for s in body["sittings"]
    ]
    assert shape == [
        (2024, "october", [(None, ["EC1002 October 2024"], [], [])]),
        (
            2024,
            "may",
            [
                ("A", ["EC1002 ZA May 2024"], [], ["EC1002 ZA solutions May 2024"]),
                ("B", ["EC1002 ZB May 2024"], [], []),
                (None, [], ["EC1002 commentary May 2024"], []),
            ],
        ),
        (2019, None, [("A", ["EC1002 2019 Zone A"], [], [])]),
    ]
    assert titles(body["other"]) == ["EC1002 sample paper"]
    assert body["sittings"][0]["zones"][0]["papers"][0]["examSession"] == "october"

    r = client_for().get(f"{API}/library/items", params={"module_id": MODULE, "exam_year": 2024, "zone": "A"})
    assert sorted(titles(r.json()["items"])) == ["EC1002 ZA May 2024", "EC1002 ZA solutions May 2024"]
    r = client_for().get(f"{API}/library/papers", params={"module_id": "nope"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_input")


# ── past questions by topic ──────────────────────────────────────────────────────────────────


@pytest.fixture
def paper(client_for: Clients, moderator: User, modules: dict[str, Module], share_file: Share) -> dict[str, Any]:
    return share_file(
        client_for(moderator), title="EC1002 ZA May 2024", kind="past-paper", module_id=MODULE, exam_year=2024, zone="A"
    )


def test_tagging_is_off_until_an_admin_switches_it_on(
    client_for: Clients, student: User, paper: dict[str, Any], set_feature: Callable[..., None]
) -> None:
    me = client_for(student)
    r = me.get(f"{API}/library/items/{paper['id']}/questions")
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")
    assert client_for().get(f"{API}/library/papers", params={"module_id": MODULE}).status_code == 200  # IDEA-1 stays
    set_feature("library.questions", "everyone")
    assert me.get(f"{API}/library/items/{paper['id']}/questions").json() == []


def test_students_tag_questions_chapters_list_them_and_reps_remove_wrong_ones(
    client_for: Clients,
    student: User,
    other: User,
    moderator: User,
    paper: dict[str, Any],
    share_file: Share,
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    set_feature("library.questions", "everyone")
    me, them, rep, guest = client_for(student), client_for(other), client_for(moderator), client_for()
    first, second = chapters(db)[:2]
    url = f"{API}/library/items/{paper['id']}/questions"

    assert guest.post(url, json={"question": 3, "chapterId": first.id}).status_code == 401
    r = me.post(url, json={"question": 3, "chapterId": second.id, "page": 4})
    assert r.status_code == 201, r.text
    tag = r.json()
    assert (tag["question"], tag["chapterId"], tag["chapterTitle"], tag["page"]) == (3, second.id, second.title, 4)
    assert tag["paper"]["slug"] == paper["slug"]
    assert (tag["isMine"], tag["canRemove"], tag["flagged"], tag["flagCount"]) == (True, True, False, None)
    assert "taggedBy" not in tag  # who tagged it is for moderation only

    again = me.post(url, json={"question": 3, "chapterId": second.id})
    assert (again.status_code, again.json()["error"]["code"]) == (409, "already_tagged")
    assert them.post(url, json={"question": 1, "chapterId": first.id}).status_code == 201
    elsewhere = chapters(db, "statistics")[0]
    r = me.post(url, json={"question": 2, "chapterId": elsewhere.id})
    assert (r.status_code, r.json()["error"]["fields"]) == (422, {"chapterId": "Pick one of this module's chapters."})
    assert me.post(url, json={"question": 41, "chapterId": first.id}).status_code == 422
    notes = share_file(rep, title="EC1002 notes", kind="notes", module_id=MODULE)
    r = me.post(f"{API}/library/items/{notes['id']}/questions", json={"question": 1, "chapterId": first.id})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "not_a_paper")

    # the paper's page: by question number; the chapter's list: chapter by chapter
    assert [t["question"] for t in guest.get(url).json()] == [1, 3]
    by_module = guest.get(f"{API}/library/questions", params={"module_id": MODULE}).json()
    assert [(t["chapterId"], t["question"]) for t in by_module] == [(first.id, 1), (second.id, 3)]

    # a wrong tag: flagged by a student, seen and removed by a rep
    r = them.put(f"{API}/library/questions/{tag['id']}/flag")
    assert (r.status_code, r.json()["flagged"], r.json()["flagCount"]) == (200, True, None)
    assert them.put(f"{API}/library/questions/{tag['id']}/flag").status_code == 200  # twice: still one
    flagged = rep.get(f"{API}/library/questions", params={"module_id": MODULE, "flagged": True}).json()
    assert [(t["id"], t["flagCount"], t["canRemove"]) for t in flagged] == [(tag["id"], 1, True)]
    assert rep.get(f"{API}/library/questions", params={"flagged": True}).json() == flagged  # every module's
    assert me.get(f"{API}/library/questions", params={"module_id": MODULE, "flagged": True}).status_code == 403
    assert me.get(f"{API}/library/questions").status_code == 422  # a module, or the flagged ones
    assert them.post(f"{API}/library/questions/{tag['id']}/keep").status_code == 403
    kept = rep.post(f"{API}/library/questions/{tag['id']}/keep")
    assert (kept.status_code, kept.json()["flagCount"]) == (200, 0)
    assert rep.get(f"{API}/library/questions", params={"flagged": True}).json() == []
    assert them.put(f"{API}/library/questions/{tag['id']}/flag").json()["flagged"] is True  # flagged again
    assert them.delete(f"{API}/library/questions/{tag['id']}").status_code == 403
    assert rep.delete(f"{API}/library/questions/{tag['id']}").status_code == 204
    assert rep.delete(f"{API}/library/questions/{tag['id']}").status_code == 404
    assert db.scalars(select(AuditEntry.action).where(AuditEntry.action == "library.question_keep")).one()
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "library.question_remove")).one()
    assert entry.data["title"] == "Q3 of EC1002 ZA May 2024"

    # your own tag: removed without the audit log
    own = next(t for t in guest.get(url).json() if t["question"] == 1)
    assert them.delete(f"{API}/library/questions/{own['id']}").status_code == 204
    assert db.scalars(select(AuditEntry).where(AuditEntry.action == "library.question_remove")).all() == [entry]
    assert guest.get(url).json() == []


def test_flags_count_once_each_and_leave_with_the_account(
    client_for: Clients,
    student: User,
    other: User,
    paper: dict[str, Any],
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    set_feature("library.questions", "everyone")
    me, them = client_for(student), client_for(other)
    first = chapters(db)[0]
    tag = me.post(f"{API}/library/items/{paper['id']}/questions", json={"question": 2, "chapterId": first.id}).json()
    them.put(f"{API}/library/questions/{tag['id']}/flag")
    row = db.get(PaperQuestion, uuid.UUID(tag["id"]))
    assert row is not None
    db.refresh(row)
    assert row.flag_count == 1
    assert them.delete(f"{API}/library/questions/{tag['id']}/flag").json()["flagged"] is False
    db.refresh(row)
    assert row.flag_count == 0

    them.put(f"{API}/library/questions/{tag['id']}/flag")
    export = them.get(f"{API}/me/export").json()
    assert export["questionFlags"] == [tag["id"]]
    mine = me.get(f"{API}/me/export").json()["questionTags"]
    assert [(t["id"], t["question"], t["chapterId"]) for t in mine] == [(tag["id"], 2, first.id)]


# ── the exam details of files imported earlier ───────────────────────────────────────────────


def imported(db: Session, file_name: str, kind: str, **exam: Any) -> LibraryItem:
    item = library.create_imported(
        db,
        db.get(Module, MODULE),
        kind=kind,  # type: ignore[arg-type]
        title=file_name.rsplit(".", 1)[0],
        description="From the Drive folder.",
        storage_key=f"library/drive/{MODULE}/{uuid.uuid4().hex}/f.pdf",
        file_name=file_name,
        size_bytes=10,
        import_key=f"drive/{MODULE}/{uuid.uuid4().hex}",
        **exam,
    )
    db.commit()
    return item


def test_exam_meta_fills_what_imported_files_lack_and_keeps_what_a_rep_set(
    db: Session, modules: dict[str, Module], capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    solutions = imported(db, "EC1002 ZB Exam paper solutions - May 2025.pdf", "past-paper")
    report = imported(db, "EC1002_Commentary_October_2022.pdf", "vle-materials")
    vle_other = imported(db, "Exam_Study_Guide.pdf", "vle-materials")
    old = imported(db, "EC1002 - Introduction to Economics - 2019 Exam - Zone-A.pdf", "past-paper", exam_year=2019)
    edited = imported(db, "EC1002 ZA exam paper - May 2023.pdf", "past-paper", exam_year=2021, zone="B")
    notes = imported(db, "EC1002 notes May 2024.pdf", "notes")

    result = backfill_exam_meta(db, dry_run=True)
    assert result.checked == 5
    assert len(result.changed) == 4
    db.refresh(solutions)
    assert solutions.kind == "past-paper"  # a dry run changes nothing

    @contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: same_session)
    assert cli.main(["exam-meta"]) == 0
    assert "Changed 4 of 5 imported papers, reports and VLE files." in capsys.readouterr().out
    items = (solutions, report, vle_other, old, edited, notes)
    for item in items:
        db.refresh(item)
    got = {i.title: (i.kind, i.exam_year, i.exam_session, i.zone) for i in items}
    assert got == {
        solutions.title: ("exam-solutions", 2025, "may", "B"),
        report.title: ("examiners-report", 2022, "october", None),
        vle_other.title: ("vle-materials", None, None, None),
        old.title: ("past-paper", 2019, "may", "A"),
        edited.title: ("past-paper", 2021, "may", "B"),  # the rep's year and zone stay; the session was empty
        notes.title: ("notes", None, None, None),  # not from a papers or VLE folder
    }
    assert backfill_exam_meta(db).changed == []  # safe to run again
