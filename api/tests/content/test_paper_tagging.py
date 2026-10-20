"""Claude's tagging of each new past paper (app/services/paper_tagging.py), the chapters' study-guide outlines
(app/services/chapter_outlines.py) and the questions' anchors (app/services/question_anchors.py). A stand-in answers
for Claude: no test reaches the API."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.time import utcnow
from app.models import (
    AuditEntry,
    Chapter,
    ItemStatus,
    LibraryItem,
    LibraryText,
    Module,
    NooraLimits,
    NooraUsage,
    PaperQuestion,
    PaperTagging,
    TaggingStatus,
    TextStatus,
    User,
)
from app.schemas.library import PaperQuestionCreate
from app.seed.loader import read
from app.services import chapter_outlines, library, outbox, paper_tagging, past_questions, question_anchors
from app.services import question_tagging as qt
from app.services.noora import ask
from tests.content.conftest import API
from tests.content.test_question_tagging import (
    MODULE,
    FakeClaude,
    api_error,
    chapter_ids,
    message,
    paper,
    q,
    same_session,
)

PAGES = (
    "UNIVERSITY OF LONDON\nEC1002 Introduction to economics\nAnswer TWO questions.",
    "SECTION A\n1. Define the price elasticity of demand and explain\nwhat determines it.\n"
    "2. Explain why a monopolist\nrestricts output.",
    "SECTION B\n1. Discuss the effects of an increase in the money supply on output and prices in the short run.",
)


def written(db: Session, item: LibraryItem, pages: tuple[str, ...] = PAGES) -> LibraryItem:
    """The paper's text, as the text worker would have read it."""
    text = db.get_one(LibraryText, item.id)
    text.body, text.pages = "\f".join(pages), len(pages)
    db.commit()
    return item


def connect_to(claude: FakeClaude | None) -> paper_tagging.Connect:
    return lambda _settings: claude


def job_of(db: Session, item: LibraryItem) -> PaperTagging:
    db.expire_all()
    return db.get_one(PaperTagging, item.id)


@pytest.fixture
def autotag(set_feature: Callable[..., None]) -> None:
    set_feature("library.autotag", "everyone")


# ── anchors ──────────────────────────────────────────────────────────────────────────────────


def test_an_anchor_is_the_line_that_opens_the_question_and_the_words_after_it() -> None:
    page = PAGES[1]
    assert question_anchors.find(page, 1) == "1. Define the price elasticity of demand and explain what determines it."
    # a short question's anchor stops where the next one starts
    assert question_anchors.find(page, 2) == "2. Explain why a monopolist restricts output."
    assert question_anchors.find(page, 3) is None
    assert question_anchors.find("Question 4\n(a) Show that the estimator is unbiased.", 4) == (
        "Question 4 (a) Show that the estimator is unbiased."
    )
    # on a paper that numbers each section from 1, the question after its section's heading
    both = PAGES[1] + "\n" + PAGES[2]
    assert question_anchors.find(both, 1, "B") == (
        "1. Discuss the effects of an increase in the money supply on output and prices in the short run."
    )
    # about ANCHOR_CHARS, cut at a word
    long = question_anchors.find("1. " + "word " * 60, 1)
    assert long is not None
    assert len(long) <= question_anchors.ANCHOR_CHARS
    assert long.endswith("word")
    # "Page 1 of 4" opens no question
    assert question_anchors.find("Page 1 of 4\nAnswer all questions.", 1) is None


def test_an_anchor_from_claude_is_kept_only_when_the_page_has_its_words() -> None:
    page = PAGES[1]
    assert question_anchors.checked("1. Define the PRICE  elasticity of\ndemand", page) == (
        "1. Define the PRICE elasticity of demand"
    )
    assert question_anchors.checked("1. Define the cross elasticity of supply", page) is None
    assert question_anchors.checked("1.", page) is None  # too short to find one place by
    # anchor_for: the one given, else the one read from the page
    assert question_anchors.anchor_for(page, 2, None, "made up words of a question") == (
        "2. Explain why a monopolist restricts output."
    )
    assert question_anchors.key("Σ x² — the ﬁrst") == "\u03c3x2thefirst"  # sigma, lower case


# ── outlines ─────────────────────────────────────────────────────────────────────────────────


def test_the_shipped_outlines_name_the_modules_chapters() -> None:
    known = {c["id"]: m["id"] for m in read("modules") for c in m["chapters"]}
    seen: set[str] = set()
    for module in read(chapter_outlines.SEED_FILE):
        assert module["source"]
        for c in module["chapters"]:
            assert known[c["id"]] == module["module"]
            assert c["outcomes"]
            assert c["topics"]
            assert c["terms"]
            outline = chapter_outlines.render(c, module["source"])
            assert outline is not None
            assert len(outline) <= chapter_outlines.MAX_CHARS
            seen.add(c["id"])
        for u in module["unmatched"]:
            assert known[u["id"]] == module["module"]
            assert u["why"]
            seen.add(u["id"])
    assert len(seen) == sum(len(m["chapters"]) + len(m["unmatched"]) for m in read(chapter_outlines.SEED_FILE))


def test_the_seed_writes_the_outlines_on_chapters_and_the_prompt_shows_them(
    db: Session, modules: dict[str, Module]
) -> None:
    entries = read(chapter_outlines.SEED_FILE)
    assert chapter_outlines.load(db, entries) == sum(len(m["chapters"]) for m in entries)
    assert chapter_outlines.load(db, entries) == 0  # the same file again changes nothing
    db.commit()
    elasticity = db.scalars(select(Chapter).where(Chapter.module_id == MODULE, Chapter.title == "Elasticity")).one()
    assert elasticity.outline is not None
    assert elasticity.outline.startswith("Study guide: ")
    assert "Key terms: " in elasticity.outline
    # another module's chapter id in an entry is passed by
    other = {"module": "mathematics", "source": "x", "chapters": [{"id": elasticity.id, "outcomes": ["a"]}]}
    assert chapter_outlines.load(db, [other]) == 0

    item = paper(db, "EC1002 ZA May 2024")
    content = next(iter(qt.build_request(qt.load_paper(db, item.id))["messages"]))["content"]
    assert isinstance(content, str)
    assert f'<chapter id="{elasticity.id}">\n<title>Elasticity</title>\n<outline>\n{elasticity.outline}\n' in content
    assert "study guide" in qt.SYSTEM


# ── anchors through the tags ─────────────────────────────────────────────────────────────────


def test_claudes_reply_keeps_an_anchor_on_the_page_or_reads_one_from_it(
    db: Session, modules: dict[str, Module]
) -> None:
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    p = qt.load_paper(db, item.id)
    first = chapter_ids(db)[0]
    reply = json.dumps(
        {
            "questions": [
                {**q(1, 2, [first], section="A"), "anchor": "1. Define the price elasticity of demand"},
                {**q(2, 2, [first], section="A"), "anchor": "words that aren't there at all"},
                {**q(1, 3, [first], section="B"), "anchor": ""},
                {**q(3, 1, [first], section="A"), "anchor": "3. nothing"},
            ]
        }
    )
    tags = {(t.section, t.question): t.anchor for t in qt.parse_reply(reply, p)}
    assert tags == {
        ("A", 1): "1. Define the price elasticity of demand",
        ("A", 2): "2. Explain why a monopolist restricts output.",
        ("B", 1): "1. Discuss the effects of an increase in the money supply on output and prices in the short run.",
        ("A", 3): None,
    }


def test_the_seed_brings_anchors_and_updates_them_on_tags_already_there(
    db: Session, modules: dict[str, Module]
) -> None:
    item = paper(db, "EC1002 ZA May 2024")
    first = chapter_ids(db)[0]
    entry = {
        "module": MODULE,
        "title": item.title,
        "importKey": item.import_key,
        "contentHash": item.content_hash,
        "model": qt.MODEL,
        "questions": [{"question": 1, "page": 2, "anchor": "1. Define the price", "chapters": [first]}],
    }
    assert qt.import_tags(db, [entry]) == 1
    row = db.scalars(select(PaperQuestion).where(PaperQuestion.item_id == item.id)).one()
    assert (row.page, row.anchor) == (2, "1. Define the price")
    entry["questions"] = [{"question": 1, "page": 3, "anchor": "1. Define it again", "chapters": [first]}]
    assert qt.import_tags(db, [entry]) == 0
    db.refresh(row)
    assert (row.page, row.anchor) == (3, "1. Define it again")
    db.commit()
    exported = qt.export_tags(db)
    assert exported[0]["questions"] == [{"question": 1, "page": 3, "anchor": "1. Define it again", "chapters": [first]}]


def test_a_students_tag_finds_its_anchor_on_the_page_they_gave(
    db: Session,
    modules: dict[str, Module],
    student: User,
    client_for: Callable[..., TestClient],
    set_feature: Callable[..., None],
) -> None:
    set_feature("library.questions", "everyone")
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    first = chapter_ids(db)[0]
    client = client_for(student)
    r = client.post(
        f"{API}/library/items/{item.id}/questions",
        json={"chapterId": first, "section": "A", "question": 2, "page": 2},
    )
    assert r.status_code == 201, r.text
    assert r.json()["anchor"] == "2. Explain why a monopolist restricts output."
    r = client.post(f"{API}/library/items/{item.id}/questions", json={"chapterId": first, "question": 7})
    assert r.status_code == 201, r.text
    assert r.json()["anchor"] is None  # no page, no anchor
    listed = client.get(f"{API}/library/items/{item.id}/questions").json()
    assert {x["question"]: x["anchor"] for x in listed} == {2: "2. Explain why a monopolist restricts output.", 7: None}


# ── the job ──────────────────────────────────────────────────────────────────────────────────


def test_publishing_a_past_paper_queues_its_tagging(
    db: Session,
    modules: dict[str, Module],
    student: User,
    moderator: User,
    client_for: Callable[..., TestClient],
    share_file: Callable[..., dict[str, Any]],
) -> None:
    rep = client_for(moderator)
    published = share_file(rep, title="EC1002 ZA May 2025", kind="past-paper", module_id=MODULE)
    job = db.get(PaperTagging, published["id"])
    assert job is not None
    assert (job.status, job.queued_by) == (TaggingStatus.queued, moderator.id)
    notes = share_file(rep, title="My EC1002 notes", kind="notes", module_id=MODULE)
    assert db.get(PaperTagging, notes["id"]) is None  # only past papers

    pending = share_file(client_for(student), title="EC1002 ZB May 2025", kind="past-paper", module_id=MODULE)
    assert db.get(PaperTagging, pending["id"]) is None  # not until it is published
    r = rep.post(f"{API}/library/items/{pending['id']}/review", json={"decision": "publish"})
    assert r.status_code == 200, r.text
    assert db.get_one(PaperTagging, pending["id"]).status == TaggingStatus.queued

    # a file that becomes a past paper is queued too
    r = rep.patch(f"{API}/library/items/{notes['id']}", json={"kind": "past-paper"})
    assert r.status_code == 200, r.text
    assert db.get_one(PaperTagging, notes["id"]).status == TaggingStatus.queued


def test_a_job_is_skipped_while_the_switch_is_off_or_without_a_key_and_the_paper_stays_published(
    db: Session, modules: dict[str, Module], set_feature: Callable[..., None]
) -> None:
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    claude = FakeClaude(lambda _p: message([]))
    paper_tagging.queue(db, item)
    db.commit()
    assert paper_tagging.run_one(db, connect_to(claude))
    job = job_of(db, item)
    assert (job.status, job.reason) == (TaggingStatus.skipped, "The switch “Tag new past papers with Claude” is off.")
    assert claude.sent == []
    assert db.get_one(LibraryItem, item.id).status == ItemStatus.published

    set_feature("library.autotag", "roles", ["rep"])  # on for any role counts as on
    paper_tagging.queue(db, item)
    db.commit()
    assert paper_tagging.run_one(db, connect_to(None))
    job = job_of(db, item)
    assert job.status == TaggingStatus.skipped
    assert job.reason is not None
    assert "API key" in job.reason
    assert not paper_tagging.run_one(db, connect_to(claude))  # nothing else is due


@pytest.mark.usefixtures("autotag")
def test_a_job_tags_the_paper_replacing_claudes_earlier_tags_but_never_a_students_or_a_removed_one(
    db: Session, modules: dict[str, Module], student: User, moderator: User
) -> None:
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    ch = chapter_ids(db)
    # before: Claude's A1 (to be kept) and A2 (stale), a student's A2, a moderator removed Claude's B1 in chapter 3
    qt.save_tags(db, item.id, [qt.Tag(section="A", question=1, page=2, chapter_ids=(ch[0],), confidence=1.0)])
    qt.save_tags(db, item.id, [qt.Tag(section="A", question=2, page=2, chapter_ids=(ch[5],), confidence=1.0)])
    kept = db.scalars(select(PaperQuestion).where(PaperQuestion.item_id == item.id, PaperQuestion.question == 1)).one()
    kept.flag_count = 2
    past_questions.tag(db, student, item.id, PaperQuestionCreate(chapter_id=ch[1], section="A", question=2, page=2))
    db.add(
        AuditEntry(
            actor_id=moderator.id,
            action="library.question_remove",
            target_type="library_item",
            target_id=str(item.id),
            data={"chapter": ch[2], "section": "B", "question": 1},
        )
    )
    paper_tagging.queue(db, item)
    db.commit()

    claude = FakeClaude(
        lambda _p: message(
            [
                {**q(1, 2, [ch[0]], section="A"), "anchor": "1. Define the price elasticity"},
                {**q(2, 2, [ch[3]], section="A"), "anchor": ""},
                {**q(1, 3, [ch[2], ch[4]], section="B"), "anchor": ""},
            ]
        )
    )
    assert paper_tagging.run_one(db, connect_to(claude))
    job = job_of(db, item)
    assert (job.status, job.reason, job.questions, job.model, job.attempts) == (
        TaggingStatus.done,
        None,
        3,
        qt.MODEL,
        1,
    )
    rows = db.scalars(select(PaperQuestion).where(PaperQuestion.item_id == item.id)).all()
    got = {(r.section, r.question, r.chapter_id, r.tagged_by_model is not None, r.anchor) for r in rows}
    assert got == {
        ("A", 1, ch[0], True, "1. Define the price elasticity"),  # kept, with its flags
        ("A", 2, ch[1], False, "2. Explain why a monopolist restricts output."),  # the student's
        (
            "B",
            1,
            ch[4],
            True,
            "1. Discuss the effects of an increase in the money supply on output and prices in the short run.",
        ),
    }
    assert db.get_one(PaperQuestion, kept.id).flag_count == 2
    # the request asked for the paper with its chapters
    sent = next(iter(claude.sent[0]["messages"]))["content"]
    assert isinstance(sent, str)
    assert 'title="EC1002 ZA May 2024"' in sent

    # what it cost counts toward the month's budget, not Noora's numbers
    usage = db.scalars(select(NooraUsage).where(NooraUsage.user_id.is_(None))).one()
    assert (usage.questions, usage.input_tokens, usage.output_tokens) == (0, 1_000, 200)
    assert usage.cost_microusd == job.cost_microusd > 0
    assert ask.month_cost_microusd(db, usage.day) == usage.cost_microusd
    assert ask.usage(db).month.cost_cents == 0


@pytest.mark.usefixtures("autotag")
def test_an_api_error_is_tried_again_then_the_job_fails(db: Session, modules: dict[str, Module]) -> None:
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    paper_tagging.queue(db, item)
    db.commit()
    claude = FakeClaude(lambda _p: api_error())
    for attempt in range(1, paper_tagging.MAX_ATTEMPTS + 1):
        db.execute(update(PaperTagging).values(next_attempt_at=None))
        db.commit()
        assert paper_tagging.run_one(db, connect_to(claude))
        job = job_of(db, item)
        assert job.attempts == attempt
        assert job.reason is not None
        assert job.reason.startswith("The API said: ")
        if attempt < paper_tagging.MAX_ATTEMPTS:
            assert job.status == TaggingStatus.queued
            assert job.next_attempt_at is not None
            assert not paper_tagging.run_one(db, connect_to(claude))  # not due yet
    assert job.status == TaggingStatus.failed
    assert len(claude.sent) == paper_tagging.MAX_ATTEMPTS


@pytest.mark.usefixtures("autotag")
def test_a_refusal_or_a_reply_out_of_shape_fails_at_once(db: Session, modules: dict[str, Module]) -> None:
    refused = written(db, paper(db, "EC1002 ZA May 2024"))
    garbled = written(db, paper(db, "EC1002 ZB May 2024"))
    for item in (refused, garbled):
        paper_tagging.queue(db, item)
    db.commit()
    answers = iter([message([], stop="refusal"), message("not json")])
    claude = FakeClaude(lambda _p: next(answers))
    assert paper_tagging.run_one(db, connect_to(claude))
    assert paper_tagging.run_one(db, connect_to(claude))
    assert (job_of(db, refused).status, job_of(db, refused).reason) == (
        TaggingStatus.failed,
        "Claude declined the paper.",
    )
    assert job_of(db, garbled).status == TaggingStatus.failed
    assert job_of(db, garbled).cost_microusd > 0  # an answered request costs, even one that can't be used


@pytest.mark.usefixtures("autotag")
def test_a_job_waits_for_the_text_and_the_budget_and_skips_a_module_without_chapters(
    db: Session, modules: dict[str, Module]
) -> None:
    claude = FakeClaude(lambda _p: message([]))
    unread = paper(db, "EC1002 ZA May 2024", status=TextStatus.working)
    paper_tagging.queue(db, unread)
    db.commit()
    assert not paper_tagging.run_one(db, connect_to(claude))  # the text worker is still reading it
    db.execute(update(PaperTagging).values(queued_at=utcnow() - paper_tagging.TEXT_WAIT - timedelta(minutes=1)))
    db.commit()
    assert paper_tagging.run_one(db, connect_to(claude))
    assert (job_of(db, unread).status, job_of(db, unread).reason) == (TaggingStatus.failed, "No text.")

    scan = paper(db, "EC1002 ZB May 2024", text="")
    paper_tagging.queue(db, scan)
    db.commit()
    assert paper_tagging.run_one(db, connect_to(claude))
    assert job_of(db, scan).status == TaggingStatus.failed

    broke = written(db, paper(db, "EC1002 ZA Oct 2024"))
    db.execute(update(NooraLimits).values(monthly_budget_cents=0))
    paper_tagging.queue(db, broke)
    db.commit()
    assert paper_tagging.run_one(db, connect_to(claude))
    job = job_of(db, broke)
    assert job.status == TaggingStatus.queued
    assert job.next_attempt_at is not None
    assert job.reason is not None
    assert "budget" in job.reason
    assert claude.sent == []

    bare = written(db, paper(db, "MT1186 2024", module_id="information-systems"))  # IS2184 has no chapters
    paper_tagging.queue(db, bare)
    db.commit()
    assert paper_tagging.run_one(db, connect_to(claude))
    assert (job_of(db, bare).status, job_of(db, bare).reason) == (TaggingStatus.skipped, "Its module has no chapters.")


@pytest.mark.usefixtures("autotag")
def test_a_job_left_working_is_queued_again_or_failed_after_its_attempts(
    db: Session, modules: dict[str, Module]
) -> None:
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    paper_tagging.queue(db, item)
    long_ago = utcnow() - paper_tagging.STALE - timedelta(minutes=1)
    db.execute(update(PaperTagging).values(status=TaggingStatus.working, started_at=long_ago, attempts=1))
    db.commit()
    claude = FakeClaude(lambda _p: message([q(1, 2, [chapter_ids(db)[0]])]))
    assert paper_tagging.run_one(db, connect_to(claude))
    assert job_of(db, item).status == TaggingStatus.done

    db.execute(update(PaperTagging).values(status=TaggingStatus.working, started_at=long_ago, attempts=3))
    db.commit()
    assert not paper_tagging.run_one(db, connect_to(claude))
    assert job_of(db, item).status == TaggingStatus.failed


def test_the_mail_worker_runs_the_jobs_and_tagging_trouble_never_stops_it(
    db: Session, modules: dict[str, Module], monkeypatch: pytest.MonkeyPatch
) -> None:
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    paper_tagging.queue(db, item)
    db.commit()
    assert outbox._tag_papers(same_session(db)()) == 1
    assert job_of(db, item).status == TaggingStatus.skipped  # the switch is off

    def broken(*_a: Any, **_k: Any) -> int:
        raise RuntimeError("boom")

    monkeypatch.setattr(paper_tagging, "run_due", broken)
    assert outbox._tag_papers(same_session(db)()) == 0


# ── Manage ───────────────────────────────────────────────────────────────────────────────────


def test_admins_see_each_papers_tagging_and_run_it_again(
    db: Session,
    modules: dict[str, Module],
    admin: User,
    moderator: User,
    student: User,
    client_for: Callable[..., TestClient],
) -> None:
    item = written(db, paper(db, "EC1002 ZA May 2024"))
    notes = paper(db, "Some notes", kind="notes")
    paper_tagging.queue(db, item)
    db.commit()
    assert paper_tagging.run_one(db, connect_to(None))  # skipped: the switch is off

    assert client_for().get(f"{API}/admin/paper-tagging").status_code == 401
    for person in (student, moderator):
        assert client_for(person).get(f"{API}/admin/paper-tagging").status_code == 403
        assert client_for(person).post(f"{API}/admin/paper-tagging/{item.id}/run").status_code == 403

    client = client_for(admin)
    r = client.get(f"{API}/admin/paper-tagging")
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["on"], body["configured"]) == (False, get_settings().anthropic_api_key is not None)
    assert body["counts"] == {"queued": 0, "working": 0, "done": 0, "skipped": 1, "failed": 0}
    (job,) = body["jobs"]
    assert (job["paper"]["id"], job["status"], job["moduleId"]) == (str(item.id), "skipped", MODULE)
    assert client.get(f"{API}/admin/paper-tagging", params={"status": "done"}).json()["jobs"] == []
    assert client.get(f"{API}/admin/paper-tagging", params={"status": "nope"}).status_code == 422

    r = client.post(f"{API}/admin/paper-tagging/{item.id}/run")
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["reason"]) == ("queued", None)
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "library.tagging_run")).one()
    assert (entry.target_id, entry.data["title"]) == (str(item.id), item.title)
    assert job_of(db, item).queued_by == admin.id

    db.execute(update(PaperTagging).values(status=TaggingStatus.working, started_at=utcnow()))
    db.commit()
    r = client.post(f"{API}/admin/paper-tagging/{item.id}/run")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "tagging_running")

    for missing in (notes.id, "00000000-0000-0000-0000-000000000000"):
        assert client.post(f"{API}/admin/paper-tagging/{missing}/run").status_code == 404
    library.remove(db, admin, item, None)
    db.commit()
    assert client.post(f"{API}/admin/paper-tagging/{item.id}/run").status_code == 404
    assert db.scalar(select(func.count()).select_from(PaperTagging)) == 1
