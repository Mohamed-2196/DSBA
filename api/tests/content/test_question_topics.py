"""Study-guide topics on past questions: the chapters' topics from the seed (services/chapter_outlines.py), students'
and Claude's tags naming one to three of their chapter's topics, the seed carrying Claude's, and the questions listed
by topic (services/past_questions.py)."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Chapter, ChapterTopic, LibraryItem, Module, PaperQuestion, PaperQuestionTopic, User
from app.seed.loader import read
from app.services import chapter_outlines, past_questions
from app.services import question_tagging as qt
from tests.content.conftest import API
from tests.content.test_question_tagging import message, paper

Clients = Callable[..., TestClient]
Share = Callable[..., dict[str, Any]]
MODULE = "economics"


def chapters(db: Session, module_id: str = MODULE) -> list[Chapter]:
    return list(db.scalars(select(Chapter).where(Chapter.module_id == module_id).order_by(Chapter.position)))


def outline(*entries: tuple[Chapter, list[str]], module: str = MODULE) -> list[dict[str, Any]]:
    """A chapter_outlines file giving these chapters these topic titles, their ids made by topic_id()."""
    out = []
    for chapter, titles in entries:
        taken: set[str] = set()
        topics = []
        for title in titles:
            tid = chapter_outlines.topic_id(title, taken)
            taken.add(tid)
            topics.append({"id": tid, "title": title})
        out.append({"id": chapter.id, "outcomes": ["Something"], "topics": topics, "terms": ["term"]})
    return [{"module": module, "source": "A study guide", "chapters": out}]


def topics_of(db: Session, row_id: Any) -> list[str]:
    return list(
        db.scalars(
            select(PaperQuestionTopic.topic_id)
            .where(PaperQuestionTopic.question_id == row_id)
            .order_by(PaperQuestionTopic.topic_id)
        )
    )


def machine_topics(db: Session, item: LibraryItem) -> dict[tuple[int, str], list[str]]:
    rows = db.scalars(select(PaperQuestion).where(PaperQuestion.item_id == item.id)).all()
    return {(r.question, r.chapter_id): topics_of(db, r.id) for r in rows}


# ── topic ids ────────────────────────────────────────────────────────────────────────────────


def test_a_topic_id_is_its_title_lower_case_hyphenated_cut_to_48_and_numbered_when_taken() -> None:
    assert chapter_outlines.topic_id("Price elasticity of demand") == "price-elasticity-of-demand"
    assert chapter_outlines.topic_id("  The IS\u2013LM model (closed economy)! ") == "the-is-lm-model-closed-economy"
    assert chapter_outlines.topic_id("Opportunity cost, absolute and comparative advantage") == (
        "opportunity-cost-absolute-and-comparative-advant"
    )
    cut = chapter_outlines.topic_id("a" * 47 + " b")  # cut after the hyphen: the hyphen goes
    assert cut == "a" * 47
    assert chapter_outlines.topic_id("Markets", {"markets"}) == "markets-2"
    assert chapter_outlines.topic_id("Markets!", {"markets", "markets-2"}) == "markets-3"


def test_the_shipped_outlines_give_every_topic_the_id_its_title_makes() -> None:
    pattern = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    for module in read(chapter_outlines.SEED_FILE):
        for c in module["chapters"]:
            taken: set[str] = set()
            for t in c["topics"]:
                assert set(t) == {"id", "title"}
                assert t["id"] == chapter_outlines.topic_id(t["title"], taken), t
                assert pattern.match(t["id"])
                taken.add(t["id"])
            assert chapter_outlines.topics_of(c) == [(t["id"], t["title"]) for t in c["topics"]]


# ── the seed ─────────────────────────────────────────────────────────────────────────────────


def test_the_seed_keeps_each_chapters_topics_in_order_and_a_dropped_topic_takes_its_tags_with_it(
    db: Session, modules: dict[str, Module]
) -> None:
    first, second = chapters(db)[:2]
    file = outline((first, ["Scarcity", "Markets", "Markets"]), (second, ["Demand"]))
    assert chapter_outlines.load(db, file) == 2
    assert chapter_outlines.load(db, file) == 0  # the same file changes nothing
    db.commit()
    assert [(t.id, t.title, t.position) for t in first.topics] == [
        ("scarcity", "Scarcity", 0),
        ("markets", "Markets", 1),
        ("markets-2", "Markets", 2),
    ]
    # a malformed id, a repeated id and an empty title are passed by
    odd = {"id": first.id, "topics": [{"id": "Bad Id", "title": "x"}, {"id": "ok", "title": " "}, "scarcity"]}
    assert chapter_outlines.topics_of(odd) == []

    item = paper(db, "EC1002 ZA May 2024")
    qt.save_tags(db, item.id, [qt.Tag(1, 1, (first.id,), 0.9, topics=((first.id, "markets"), (first.id, "scarcity")))])
    db.commit()
    assert machine_topics(db, item) == {(1, first.id): ["markets", "scarcity"]}

    # the file renames one topic, drops another and reorders: the dropped one's tags go
    file = outline((first, ["Markets", "Scarcity and choice"]), (second, ["Demand"]))
    assert chapter_outlines.load(db, file) == 1
    db.commit()
    db.expire_all()
    assert [(t.id, t.position) for t in first.topics] == [("markets", 0), ("scarcity-and-choice", 1)]
    assert machine_topics(db, item) == {(1, first.id): ["markets"]}


def test_a_tags_topics_must_be_its_own_chapters(db: Session, modules: dict[str, Module]) -> None:
    first, second = chapters(db)[:2]
    chapter_outlines.load(db, outline((first, ["Scarcity"]), (second, ["Demand"])))
    item = paper(db, "EC1002 ZA May 2024")
    row = PaperQuestion(item_id=item.id, chapter_id=first.id, question=1, tagged_by_model=qt.MODEL)
    db.add(row)
    db.flush()
    db.add(PaperQuestionTopic(question_id=row.id, chapter_id=second.id, topic_id="demand"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_a_modules_chapters_list_their_topics(db: Session, modules: dict[str, Module], client_for: Clients) -> None:
    first = chapters(db)[0]
    chapter_outlines.load(db, outline((first, ["Scarcity", "Markets"])))
    db.commit()
    body = client_for().get(f"{API}/modules/{MODULE}").json()
    shown = {c["id"]: c["topics"] for c in body["chapters"]}
    assert shown[first.id] == [{"id": "scarcity", "title": "Scarcity"}, {"id": "markets", "title": "Markets"}]
    assert all(t == [] for cid, t in shown.items() if cid != first.id)


# ── Claude ───────────────────────────────────────────────────────────────────────────────────


def test_claude_is_asked_for_the_chapters_topics_and_only_known_ones_of_its_chapters_are_kept(
    db: Session, modules: dict[str, Module]
) -> None:
    first, second, third = chapters(db)[:3]
    chapter_outlines.load(db, outline((first, ["Scarcity", "Markets", "Models", "Data"]), (second, ["Demand"])))
    db.commit()
    item = paper(db, "EC1002 ZA May 2024")
    p = qt.load_paper(db, item.id)
    params: dict[str, Any] = dict(qt.build_request(p))
    question = params["output_config"]["format"]["schema"]["properties"]["questions"]["items"]
    assert question["properties"]["topic_ids"]["items"]["enum"] == [
        f"{first.id}:scarcity",
        f"{first.id}:markets",
        f"{first.id}:models",
        f"{first.id}:data",
        f"{second.id}:demand",
    ]
    assert "topic_ids" in question["required"]
    content = next(iter(params["messages"]))["content"]
    assert f'<topics>\n<topic id="{first.id}:scarcity">Scarcity</topic>\n' in content
    assert "topic_ids" in str(params["system"])
    # without any topics, any string goes in the schema and none is kept
    bare = qt.Paper(item.id, "x", "m", ("page",), (qt.ChapterInfo(third.id, "T"),))
    assert qt.response_schema(bare.chapter_ids, bare.topic_refs)["properties"]["questions"]["items"]["properties"][
        "topic_ids"
    ] == {"type": "array", "items": {"type": "string"}}

    def ask(n: int, chapter_ids: list[str], topic_ids: list[str]) -> dict[str, Any]:
        return {
            "section": None,
            "question": n,
            "start_page": 1,
            "anchor": "",
            "chapter_ids": chapter_ids,
            "topic_ids": topic_ids,
            "confidence": 0.9,
        }

    reply = message(
        [
            # four known topics: three kept; an unknown one and another chapter's dropped
            ask(1, [first.id], [f"{first.id}:data", "nope", f"{first.id}:markets", f"{first.id}:scarcity"]),
            ask(2, [first.id], [f"{second.id}:demand", f"{first.id}:models", f"{first.id}:nope", "x:y:z"]),
            ask(3, [first.id, second.id], [f"{second.id}:demand", f"{second.id}:demand"]),
            ask(4, [third.id], []),
        ]
    )
    tags = qt.tags_from_message(reply, p)
    assert [t.topics for t in tags] == [
        ((first.id, "data"), (first.id, "markets"), (first.id, "scarcity")),
        ((first.id, "models"),),
        ((second.id, "demand"),),
        (),
    ]
    qt.save_tags(db, item.id, tags)
    db.commit()
    assert machine_topics(db, item) == {
        (1, first.id): ["data", "markets", "scarcity"],
        (2, first.id): ["models"],
        (3, first.id): [],
        (3, second.id): ["demand"],
        (4, third.id): [],
    }

    # Claude again: a row it repeats takes the topics it gives now
    again = [qt.Tag(1, 1, (first.id,), 0.9, topics=((first.id, "models"),)), qt.Tag(4, 1, (third.id,), 0.9)]
    qt.replace_tags(db, item.id, again)
    db.commit()
    assert machine_topics(db, item) == {(1, first.id): ["models"], (4, third.id): []}


# ── the seed file ────────────────────────────────────────────────────────────────────────────


def test_claudes_topics_travel_in_the_seed_as_chapter_and_topic(db: Session, modules: dict[str, Module]) -> None:
    first, second = chapters(db)[:2]
    chapter_outlines.load(db, outline((first, ["Scarcity", "Markets"]), (second, ["Demand"])))
    item = paper(db, "EC1002 ZA May 2024")
    qt.save_tags(
        db,
        item.id,
        [
            qt.Tag(1, 1, (first.id, second.id), 0.9, topics=((first.id, "markets"), (second.id, "demand"))),
            qt.Tag(2, 2, (first.id,), 0.9),
        ],
    )
    db.commit()
    [entry] = qt.export_tags(db)
    assert entry["questions"] == [
        {
            "question": 1,
            "page": 1,
            "chapters": sorted([first.id, second.id]),
            "topics": sorted([f"{first.id}:markets", f"{second.id}:demand"]),
        },
        {"question": 2, "page": 2, "chapters": [first.id]},
    ]

    # loaded elsewhere: unknown topics, another chapter's and malformed ones are left out
    for row in db.scalars(select(PaperQuestion)):
        db.delete(row)
    db.commit()
    entry["questions"][0]["topics"] += [f"{first.id}:gone", "nope", f"{chapters(db)[2].id}:x"]
    entry["questions"][1]["topics"] = [f"{first.id}:scarcity"]
    assert qt.import_tags(db, [entry]) == 3
    db.commit()
    assert machine_topics(db, item) == {
        (1, first.id): ["markets"],
        (1, second.id): ["demand"],
        (2, first.id): ["scarcity"],
    }
    # the file changes a topic: the rows stay, their topics follow the file
    entry["questions"][1]["topics"] = [f"{first.id}:markets"]
    assert qt.import_tags(db, [entry]) == 0
    db.commit()
    assert machine_topics(db, item)[(2, first.id)] == ["markets"]


def test_the_shipped_tags_name_topics_as_chapter_and_topic() -> None:
    for e in read(qt.SEED_FILE):
        for x in e["questions"]:
            for ref in x.get("topics", []):
                pair = qt.split_ref(ref)
                assert pair is not None, ref
                assert pair[0] in x["chapters"], ref


# ── students, and the lists ──────────────────────────────────────────────────────────────────


@pytest.fixture
def shared(client_for: Clients, moderator: User, modules: dict[str, Module], share_file: Share) -> dict[str, Any]:
    return share_file(
        client_for(moderator), title="EC1002 ZA May 2024", kind="past-paper", module_id=MODULE, exam_year=2024, zone="A"
    )


def test_students_pick_topics_of_their_chapter_and_the_questions_list_by_topic(
    client_for: Clients,
    student: User,
    shared: dict[str, Any],
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    set_feature("library.questions", "everyone")
    first, second = chapters(db)[:2]
    chapter_outlines.load(db, outline((first, ["Scarcity", "Markets", "Models", "Data"]), (second, ["Demand"])))
    db.commit()
    me, guest = client_for(student), client_for()
    url = f"{API}/library/items/{shared['id']}/questions"

    r = me.post(url, json={"question": 1, "chapterId": first.id, "topicIds": ["markets", "scarcity", "markets"]})
    assert r.status_code == 201, r.text
    # in the study guide's order, once each
    assert r.json()["topics"] == [{"id": "scarcity", "title": "Scarcity"}, {"id": "markets", "title": "Markets"}]
    assert me.post(url, json={"question": 2, "chapterId": first.id}).json()["topics"] == []
    r = me.post(url, json={"question": 3, "chapterId": first.id, "topicIds": ["demand"]})
    assert (r.status_code, r.json()["error"]["fields"]) == (422, {"topicIds": "Pick topics of the chapter you chose."})
    four = ["scarcity", "markets", "models", "data"]
    assert me.post(url, json={"question": 3, "chapterId": first.id, "topicIds": four}).status_code == 422
    assert me.post(url, json={"question": 3, "chapterId": first.id, "topicIds": ["Not An Id"]}).status_code == 422
    assert me.post(url, json={"question": 3, "chapterId": second.id, "topicIds": ["demand"]}).status_code == 201

    # the paper's page and the module's list carry them
    assert [t["topics"] for t in guest.get(url).json()] == [
        [{"id": "scarcity", "title": "Scarcity"}, {"id": "markets", "title": "Markets"}],
        [],
        [{"id": "demand", "title": "Demand"}],
    ]

    def listed(**params: str) -> Any:
        return guest.get(f"{API}/library/questions", params={"module_id": MODULE, **params})

    assert [t["question"] for t in listed(chapter_id=first.id).json()] == [1, 2]
    assert [t["question"] for t in listed(chapter_id=first.id, topic_id="markets").json()] == [1]
    assert listed(chapter_id=first.id, topic_id="data").json() == []
    assert [t["question"] for t in listed(chapter_id=second.id, topic_id="demand").json()] == [3]

    r = listed(topic_id="markets")
    assert (r.status_code, r.json()["error"]["fields"]) == (422, {"chapterId": "Choose the topic's chapter too."})
    r = listed(chapter_id=first.id, topic_id="demand")
    assert (r.status_code, r.json()["error"]["fields"]) == (422, {"topicId": "Pick one of this chapter's topics."})
    elsewhere = chapters(db, "statistics")[0]
    r = listed(chapter_id=elsewhere.id)
    assert (r.status_code, r.json()["error"]["fields"]) == (422, {"chapterId": "Pick one of this module's chapters."})
    assert listed(chapter_id=first.id, topic_id="Bad Id").status_code == 422

    # a hidden chapter is no chapter to students
    first.hidden = True
    db.commit()
    assert listed(chapter_id=first.id).status_code == 422


def test_a_tags_topics_go_with_it(
    client_for: Clients,
    student: User,
    shared: dict[str, Any],
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    set_feature("library.questions", "everyone")
    first = chapters(db)[0]
    chapter_outlines.load(db, outline((first, ["Scarcity"])))
    db.commit()
    me = client_for(student)
    tag = me.post(
        f"{API}/library/items/{shared['id']}/questions",
        json={"question": 1, "chapterId": first.id, "topicIds": ["scarcity"]},
    ).json()
    assert me.delete(f"{API}/library/questions/{tag['id']}").status_code == 204
    assert db.scalars(select(PaperQuestionTopic)).all() == []
    assert db.get(ChapterTopic, (first.id, "scarcity")) is not None
    assert past_questions.topics_of(db, []) == {}
