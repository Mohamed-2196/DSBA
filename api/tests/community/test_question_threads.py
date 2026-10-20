"""Asking about one past question: threads that link /library/<slug>#q3 (or #b1), listed for that question
(GET /forum/threads?paper=&question=) and counted per question (GET /forum/question-threads)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ForumReply, ForumThread, LibraryItem, Module, PostStatus, User
from app.services import library
from tests.community.helpers import API, new_reply, new_thread

Client = Callable[..., TestClient]
PAPER = "st2133-may-2019"


def ids(rows: list[dict[str, Any]]) -> list[str]:
    return [r["id"] for r in rows]


def paper(db: Session, module: Module, title: str) -> LibraryItem:
    item = library.create_imported(
        db,
        module,
        kind="past-paper",
        title=title,
        storage_key=f"library/x/{uuid.uuid4().hex}/f.pdf",
        file_name="f.pdf",
        size_bytes=10,
        import_key=f"drive/x/{uuid.uuid4().hex}",
    )
    db.commit()
    return item


def test_threads_that_link_one_question_are_listed_and_counted(
    client_for: Client, student: User, classmate: User, db: Session, modules: dict[str, Module]
) -> None:
    s, c, guest = client_for(student), client_for(classmate), client_for()
    q3 = new_thread(s, title="Q3(b) of May 2019", body=f"About [Q3](/library/{PAPER}?page=4#q3):")
    q3_absolute = new_thread(c, title="Q3 again", body=f"https://hub.example.com/library/{PAPER}#Q3 is hard")
    q30 = new_thread(c, title="Not Q3", body=f"[Q30](/library/{PAPER}#q30)")
    in_reply = new_thread(c, title="Section B")
    new_reply(s, in_reply["id"], f"Same as [B1](/library/{PAPER}#b1) and [Q3](/library/{PAPER}#q3)")
    whole = new_thread(c, title="The whole paper", body=f"[paper](/library/{PAPER})")
    hidden = new_thread(c, title="Hidden", body=f"[Q3](/library/{PAPER}#q3)")
    row = db.get(ForumThread, uuid.UUID(hidden["id"]))
    assert row is not None
    row.status = PostStatus.hidden
    hidden_reply = new_thread(c, title="Hidden reply")
    reply = new_reply(s, hidden_reply["id"], f"[Q3](/library/{PAPER}#q3)")
    db.get(ForumReply, uuid.UUID(reply["id"])).status = PostStatus.hidden  # type: ignore[union-attr]
    db.commit()
    new_thread(c, title="Another paper", body="[Q3](/library/st2133-may-2019-zone-b#q3)")

    r = guest.get(f"{API}/forum/threads", params={"paper": PAPER, "question": "q3", "sort": "new"})
    assert r.status_code == 200, r.text
    assert ids(r.json()["items"]) == [in_reply["id"], q3_absolute["id"], q3["id"]]
    b1 = guest.get(f"{API}/forum/threads", params={"paper": PAPER, "question": "b1"}).json()
    assert ids(b1["items"]) == [in_reply["id"]]
    every = guest.get(f"{API}/forum/threads", params={"paper": PAPER, "sort": "new"}).json()
    assert whole["id"] in ids(every["items"])
    assert q30["id"] in ids(every["items"])
    bad = guest.get(f"{API}/forum/threads", params={"question": "q3"})
    assert bad.status_code == 422
    assert bad.json()["error"]["fields"] == {"question": "Choose the paper the question is on."}
    assert guest.get(f"{API}/forum/threads", params={"paper": PAPER, "question": "3"}).status_code == 422

    counts = guest.get(f"{API}/forum/question-threads", params={"paper": PAPER})
    assert counts.status_code == 200, counts.text
    assert [(q["paperSlug"], q["section"], q["question"], q["threads"]) for q in counts.json()] == [
        (PAPER, None, 3, 3),
        (PAPER, None, 30, 1),
        (PAPER, "B", 1, 1),
    ]
    assert guest.get(f"{API}/forum/question-threads").status_code == 422


def test_a_modules_question_counts_cover_its_published_papers_only(
    client_for: Client, student: User, db: Session, modules: dict[str, Module]
) -> None:
    mine = paper(db, modules["advanced-stats-distribution"], "ST2133 May 2019")
    elsewhere = paper(db, modules["mathematics"], "MT1186 May 2019")
    s = client_for(student)
    new_thread(s, title="Two papers", body=f"[a](/library/{mine.slug}#q2) and [b](/library/{elsewhere.slug}#q2)")
    r = client_for().get(f"{API}/forum/question-threads", params={"module_id": "advanced-stats-distribution"})
    assert [(q["paperSlug"], q["question"], q["threads"]) for q in r.json()] == [(mine.slug, 2, 1)]
    unknown = client_for().get(f"{API}/forum/question-threads", params={"module_id": "nope"})
    assert unknown.status_code == 422
