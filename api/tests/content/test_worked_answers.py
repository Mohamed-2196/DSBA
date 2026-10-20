"""Examiners' reports and their worked answers: where each question's commentary starts (report_answers.locate), the
sittings table's "Worked answers in the report" (LibraryItem.workedAnswers), each tagged question's link into its
report (PaperQuestion.answer), the text worker filling both, and `python -m app.cli report-answers`."""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import cli
from app.models import Chapter, LibraryItem, LibraryText, Module, PaperQuestion, TextStatus, User
from app.services import library, paper_text, report_answers
from app.services.report_answers import locate
from tests.content.conftest import API

Clients = Callable[..., TestClient]
MODULE = "economics"

GENERAL = "Examiners' commentaries 2024\nGeneral remarks\nQuestion 3 was the least popular.\nKey steps to improvement"


def pages(*texts: str) -> str:
    return "\f".join(texts)


def labels(body: str) -> list[str]:
    """'A/Q1@3' (zone A, question 1, page 3), 'B2@5' (section B's question 2), 'Q4@6'."""
    return [
        f"{e['zone'] + '/' if e['zone'] else ''}{e['section'] or 'Q'}{e['question']}@{e['page']}"
        for e in locate(body).questions
    ]


# ── reading a report ─────────────────────────────────────────────────────────────────────────


def test_question_headings_after_the_specific_comments_give_their_pages() -> None:
    body = pages(
        GENERAL,
        "Comments on speciﬁc questions\nQuestion 1\nReading for this question\nApproaching the question\nThe MLE is",
        "Question 2.\nApproaching the question\nAs in Question 1, use\nQuestion 9 is not next: a reference",
        "QUESTION 3: \u2018Entering a new market\u2019\nApproaching the question",
    )
    assert labels(body) == ["Q1@2", "Q2@3", "Q3@4"]  # "Question 3 was the least popular" comes before: not a heading
    assert locate(body).worked is True


def test_a_report_for_both_zones_keeps_each_zones_questions_apart() -> None:
    body = pages(
        GENERAL,
        "Comments on speciﬁc questions \u2013 Zone A\nSection A\nQuestion 1\nApproaching the question",
        "Section B\nQuestion 2\nApproaching the question",
        "Comments on speciﬁc questions \u2013 Zone B\nSection A\nQuestion 1",
        "Section B\nQuestion 2",
    )
    assert labels(body) == ["A/Q1@2", "A/Q2@3", "B/Q1@4", "B/Q2@5"]  # numbered right through: no sections


def test_zone_b_after_zone_a_without_its_own_heading_is_still_zone_b() -> None:
    body = pages("Question 1\nQuestion 2", "Question 1\nQuestion 2")
    assert labels(body) == ["A/Q1@1", "A/Q2@1", "B/Q1@2", "B/Q2@2"]
    body = pages("Question 1\nQuestion 2", "Zone B\nQuestion 1\nQuestion 2")
    assert labels(body) == ["A/Q1@1", "A/Q2@1", "B/Q1@2", "B/Q2@2"]


def test_a_paper_that_numbers_each_section_from_one_keeps_its_sections() -> None:
    body = pages(
        "Comments on specific questions\nSection A\nQuestion 1\nQuestion 2",
        "Section B\nQuestion 1\nApproaching the question\nQuestion 2",
    )
    assert labels(body) == ["A1@1", "A2@1", "B1@2", "B2@2"]


def test_numbered_questions_count_only_without_question_headings() -> None:
    body = pages(
        "1. Read the guide.\n2. Practise.",  # before the specific comments: advice, not questions
        "Comments on specific questions\n1. Consider the following game.\nApproaching the question NE are",
        "2. From the supply function,\nApproaching the question P = MC",
    )
    assert labels(body) == ["Q1@2", "Q2@3"]
    assert labels(pages("Some text", "More text")) == []


def test_worked_answers_need_the_examiners_to_approach_the_questions() -> None:
    commentary = pages("Question 1\nMost candidates did well.", "Question 2\nFew answered it.")
    assert locate(commentary).worked is False  # comments on each question, but no worked answers
    assert locate(pages(commentary, "Approaching the question")).worked is True  # one, with headings
    assert locate("Approaching the question\nApproaching this question").worked is True


# ── the API ──────────────────────────────────────────────────────────────────────────────────


def add_file(
    db: Session,
    kind: str,
    *,
    zone: str | None = None,
    year: int = 2024,
    session: str | None = "may",
    body: str | None = None,
) -> LibraryItem:
    module = db.get(Module, MODULE)
    title = f"EC1002 {kind} {year} {session or ''} {zone or 'all'} {uuid.uuid4().hex[:4]}"
    item = library.create_imported(
        db,
        module,
        kind=kind,  # type: ignore[arg-type]
        title=title,
        storage_key=f"library/drive/{MODULE}/{uuid.uuid4().hex}/f.pdf",
        file_name=f"{title}.pdf",
        size_bytes=10,
        import_key=f"drive/{MODULE}/{uuid.uuid4().hex}",
        content_hash=hashlib.sha256(title.encode()).hexdigest(),
        exam_year=year,
        zone=zone,  # type: ignore[arg-type]
        exam_session=session,  # type: ignore[arg-type]
    )
    db.flush()
    if body is not None:
        row = LibraryText(item_id=item.id, status=TextStatus.done, body=body, pages=body.count("\f") + 1)
        report_answers.fill(row, kind)
        db.add(row)
    db.commit()
    return item


def tag(db: Session, paper: LibraryItem, question: int, section: str | None = None) -> PaperQuestion:
    chapter = db.query(Chapter).filter(Chapter.module_id == MODULE).order_by(Chapter.position).first()
    assert chapter is not None
    row = PaperQuestion(item_id=paper.id, chapter_id=chapter.id, question=question, section=section, page=1)
    db.add(row)
    db.commit()
    return row


BOTH_ZONES = pages(
    GENERAL,
    "Comments on specific questions \u2013 Zone A\nQuestion 1\nApproaching the question",
    "Question 2\nApproaching the question",
    "Comments on specific questions \u2013 Zone B\nQuestion 1",
    "Question 2",
)


def answers(client: TestClient, paper: LibraryItem) -> dict[int, Any]:
    r = client.get(f"{API}/library/items/{paper.id}/questions")
    assert r.status_code == 200, r.text
    return {q["question"]: q["answer"] for q in r.json()}


def test_tagged_questions_open_their_sittings_report_at_their_commentary(
    client_for: Clients, db: Session, modules: dict[str, Module], set_feature: Callable[..., None]
) -> None:
    set_feature("library.questions", "everyone")
    zone_a, zone_b = add_file(db, "past-paper", zone="A"), add_file(db, "past-paper", zone="B")
    report = add_file(db, "examiners-report", body=BOTH_ZONES)
    for paper in (zone_a, zone_b):
        tag(db, paper, 1)
        tag(db, paper, 2)
    tag(db, zone_a, 3)  # not in the report
    guest = client_for()
    assert answers(guest, zone_a) == {
        1: {"id": str(report.id), "slug": report.slug, "page": 2},
        2: {"id": str(report.id), "slug": report.slug, "page": 3},
        3: None,
    }
    assert {q: a["page"] for q, a in answers(guest, zone_b).items()} == {1: 4, 2: 5}
    by_module = guest.get(f"{API}/library/questions", params={"module_id": MODULE}).json()
    assert sorted((q["question"], q["answer"]["page"] if q["answer"] else None) for q in by_module) == [
        (1, 2),
        (1, 4),
        (2, 3),
        (2, 5),
        (3, None),
    ]

    # a zone's own report comes first; another sitting's or another zone's never
    own = add_file(db, "examiners-report", zone="B", body=pages("Question 1", "Question 2"))
    add_file(db, "examiners-report", zone="A", year=2023, body=pages("Question 3"))
    assert answers(guest, zone_b) == {
        1: {"id": str(own.id), "slug": own.slug, "page": 1},
        2: {"id": str(own.id), "slug": own.slug, "page": 2},
    }
    assert answers(guest, zone_a)[3] is None

    # a paper without a zone can't tell which half of a report for both zones is its own
    single = add_file(db, "past-paper", year=2022)
    add_file(db, "examiners-report", year=2022, body=BOTH_ZONES)
    tag(db, single, 1)
    assert answers(guest, single) == {1: None}


def test_sectioned_papers_find_section_bs_question_one(
    client_for: Clients, db: Session, modules: dict[str, Module], set_feature: Callable[..., None]
) -> None:
    set_feature("library.questions", "everyone")
    paper = add_file(db, "past-paper", year=2025)
    add_file(
        db,
        "examiners-report",
        year=2025,
        body=pages("Comments on specific questions\nSection A\nQuestion 1", "Section B\nQuestion 1", "Question 2"),
    )
    tag(db, paper, 1, "A")
    tag(db, paper, 1, "B")
    tag(db, paper, 2, "B")
    r = client_for().get(f"{API}/library/items/{paper.id}/questions").json()
    assert [(q["section"], q["question"], q["answer"]["page"]) for q in r] == [("A", 1, 1), ("B", 1, 2), ("B", 2, 3)]


def test_the_sittings_table_knows_which_reports_work_the_answers(
    client_for: Clients, db: Session, modules: dict[str, Module], moderator: User
) -> None:
    worked = add_file(db, "examiners-report", body=BOTH_ZONES)
    comments = add_file(db, "examiners-report", year=2023, body=pages("Question 1\nWell done.", "Question 2"))
    unread = add_file(db, "examiners-report", year=2022)
    paper = add_file(db, "past-paper", body=BOTH_ZONES)  # a paper never says it has worked answers
    r = client_for().get(f"{API}/library/papers", params={"module_id": MODULE})
    files = {f["id"]: f for s in r.json()["sittings"] for z in s["zones"] for f in z["papers"] + z["reports"]}
    assert {k: files[str(i.id)]["workedAnswers"] for k, i in [("w", worked), ("c", comments), ("u", unread)]} == {
        "w": True,
        "c": False,
        "u": False,
    }
    assert files[str(paper.id)]["workedAnswers"] is False

    # a file that becomes a report is read for worked answers at once, and stops being one the same way
    rep = client_for(moderator)
    r = rep.patch(f"{API}/library/items/{paper.id}", json={"kind": "examiners-report"})
    assert (r.status_code, r.json()["workedAnswers"]) == (200, True)
    assert rep.patch(f"{API}/library/items/{paper.id}", json={"kind": "past-paper"}).json()["workedAnswers"] is False
    row = db.get(LibraryText, paper.id)
    db.refresh(row)
    assert row is not None
    assert row.question_pages is None


def test_the_text_worker_reads_a_reports_worked_answers(
    db: Session, modules: dict[str, Module], storage: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    report = add_file(db, "examiners-report")
    paper = add_file(db, "past-paper")
    storage.client.put_object(Bucket=storage.bucket, Key=report.storage_key, Body=b"%PDF-1.7 report")
    storage.client.put_object(Bucket=storage.bucket, Key=paper.storage_key, Body=b"%PDF-1.7 paper")
    reading = paper_text.Reading(pages=BOTH_ZONES.split("\f"), cover=None)
    monkeypatch.setattr(paper_text, "read_file", lambda *a, **k: reading)
    for item in (report, paper):
        claimed = paper_text.Claimed(item.id, item.file_name, item.storage_key, item.kind)
        assert paper_text.read_item(db, claimed, storage) == TextStatus.done
    db.commit()
    got = db.get(LibraryText, report.id)
    assert got is not None
    assert got.worked_answers is True
    assert [(e["zone"], e["question"], e["page"]) for e in got.question_pages or []] == [
        ("A", 1, 2),
        ("A", 2, 3),
        ("B", 1, 4),
        ("B", 2, 5),
    ]
    other = db.get(LibraryText, paper.id)
    assert other is not None
    assert (other.worked_answers, other.question_pages) == (False, None)


def test_report_answers_reads_every_report_already_read(
    db: Session, modules: dict[str, Module], capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    worked = add_file(db, "examiners-report", body=BOTH_ZONES)
    plain = add_file(db, "examiners-report", year=2023, body=pages("Question 1", "Question 2"))
    for item in (worked, plain):  # read before the rules: nothing kept yet
        row = db.get(LibraryText, item.id)
        assert row is not None
        row.worked_answers, row.question_pages = False, None
    db.commit()

    @contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: same_session)
    assert cli.main(["report-answers"]) == 0
    assert "Read 2 examiners' reports: 1 with worked answers, 2 with question pages." in capsys.readouterr().out
    db.expire_all()
    row = db.get(LibraryText, worked.id)
    assert row is not None
    assert row.worked_answers
    assert len(row.question_pages or []) == 4
