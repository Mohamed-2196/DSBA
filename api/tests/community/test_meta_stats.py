"""GET /forum/meta and /forum/stats, and the plain-text helpers behind excerpts, thumbnails and search."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import get_args

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import ForumReply, PostStatus, User
from app.schemas.forum import Category
from app.services import forum
from tests.community.helpers import API, new_reply, new_thread, reply_row, set_thread

Client = Callable[..., TestClient]


def test_meta(client_for: Client) -> None:
    r = client_for().get(f"{API}/forum/meta")
    assert r.status_code == 200
    meta = r.json()
    assert meta["maxTags"] == 3
    assert [c["id"] for c in meta["categories"]] == ["year-1", "year-2", "year-3", "study-groups", "general"]
    assert meta["categories"][1] == {
        "id": "year-2",
        "label": "Year 2",
        "short": "Year 2",
        "year": 2,
        "blurb": "Distribution theory, inference, programming and more",
    }
    assert meta["categories"][3]["short"] == "Study group"
    assert meta["categories"][3]["year"] is None
    assert len(meta["tags"]) == 12
    assert {"id": "formula-sheet", "label": "Formula sheets"} in meta["tags"]
    assert {"id": "r", "label": "R"} in meta["tags"]


def test_categories_match_the_contract() -> None:
    assert [c.id for c in forum.CATEGORIES] == list(get_args(Category))


def test_stats(
    client_for: Client,
    student: User,
    classmate: User,
    moderator: User,
    make_user: Callable[..., User],
    db: Session,
) -> None:
    s, c, m = client_for(student), client_for(classmate), client_for(moderator)
    busy = new_thread(s, title="Busy year two thread", category="year-2", tags=["r", "python"])
    quiet = new_thread(s, title="Quiet general thread", category="general", tags=["r"])
    gone_but_answered = new_thread(s, title="Deleted but answered", category="general")
    gone = new_thread(s, title="Deleted and alone", category="general")
    hidden = new_thread(s, title="Hidden thread", category="year-2", tags=["python"])
    helpful = new_reply(c, busy["id"], "Helpful answer")
    rep_reply = new_reply(m, busy["id"], "A rep's answer")
    new_reply(m, gone_but_answered["id"], "Answer before the delete")
    hidden_reply = new_reply(c, hidden["id"], "In a hidden thread")
    assert s.delete(f"{API}/forum/threads/{gone_but_answered['id']}").status_code == 204
    assert s.delete(f"{API}/forum/threads/{gone['id']}").status_code == 204
    set_thread(db, hidden["id"], status=PostStatus.hidden)
    old_reply = new_reply(c, quiet["id"], "Old answer")
    reply_row(db, old_reply["id"]).created_at = utcnow() - timedelta(days=8)
    db.commit()
    # votes: two other people and the author themself on the helpful reply; the accepted answer is worth 10
    voter = make_user(name="Voter")
    for client in (s, client_for(voter), c):
        assert client.put(f"{API}/forum/replies/{helpful['id']}/vote").status_code == 200
    assert s.put(f"{API}/forum/replies/{rep_reply['id']}/vote").status_code == 200
    assert c.put(f"{API}/forum/replies/{hidden_reply['id']}/vote").status_code == 404
    assert s.post(f"{API}/forum/threads/{busy['id']}/accept", json={"replyId": helpful["id"]}).status_code == 200
    # a reply by an account that was deleted since
    db.add(
        ForumReply(
            thread_id=uuid.UUID(busy["id"]),
            author_id=None,
            body="From a deleted account",
            vote_count=50,
            created_at=utcnow(),
        )
    )
    db.commit()

    r = client_for().get(f"{API}/forum/stats")
    assert r.status_code == 200
    stats = r.json()
    assert stats["total"] == 3  # busy, quiet, and the deleted one that still has a reply
    assert stats["byCategory"] == {"year-1": 0, "year-2": 1, "year-3": 0, "study-groups": 0, "general": 2}
    assert stats["noReplies"] == 0  # quiet has its (old) reply
    assert stats["noRepliesByCategory"]["general"] == 0
    assert stats["byTag"] == {"r": 2, "python": 1}
    assert stats["tagsByCategory"]["year-2"] == {"r": 1, "python": 1}
    assert stats["tagsByCategory"]["general"] == {"r": 1}
    # today: helpful, the rep's, the one under the deleted thread, the deleted account's (not hidden, not old)
    assert stats["repliesToday"] == 4
    top = stats["topContributors"]
    assert [x["user"]["displayName"] for x in top] == ["Ebrahim D.", "Student Rep"]
    assert top[0] == {
        "user": {"id": str(classmate.id), "displayName": "Ebrahim D.", "year": 2, "role": "student"},
        "replies": 1,
        "votes": 2,
        "accepted": 1,
        "score": 12,
    }
    assert (top[1]["replies"], top[1]["votes"], top[1]["score"]) == (2, 1, 1)


def test_unanswered_counts(client_for: Client, student: User) -> None:
    new_thread(client_for(student), title="Nobody answered yet", category="study-groups")
    stats = client_for().get(f"{API}/forum/stats").json()
    assert stats["noReplies"] == 1
    assert stats["noRepliesByCategory"]["study-groups"] == 1
    assert stats["topContributors"] == []
    assert stats["repliesToday"] == 0


def test_excerpts() -> None:
    assert forum.excerpt("") == ""
    md = "Look at **this** and *that*, see [the notes](/library/notes) or [VLE](https://vle.example).\n\n```r\nx\n```"
    assert forum.excerpt(md) == "Look at this and that, see the notes or VLE. …"
    assert forum.excerpt("Before\n```\nsecret <- 1\n```\nAfter") == "Before … After"  # code never shows
    assert forum.excerpt("- one\n- two\n\n1. three\n\n> four") == "one two three four"
    assert forum.excerpt("Inline ![a cat](/api/v1/media/x) picture") == "Inline picture"
    assert forum.excerpt("# Heading\n\nText") == "Heading Text"
    assert forum.excerpt("R_f and β_i stay") == "R_f and β_i stay"  # underscores are not italics
    long = "word " * 100
    cut = forum.excerpt(long)
    assert cut.endswith("word…")
    assert len(cut) <= 201
    emoji = "😀" * 250
    assert forum.excerpt(emoji) == "😀" * 200 + "…"  # never half an emoji
    arabic = "مرحبا " * 60
    assert forum.excerpt(arabic).endswith("مرحبا…")


def test_first_image_is_an_uploaded_forum_image() -> None:
    image = str(uuid.uuid4())
    assert forum.first_image(f"![cat](/api/v1/media/{image})") == {"src": f"/api/v1/media/{image}", "alt": "cat"}
    assert forum.first_image(f"Text ![inline one](/api/v1/media/{image}) text")["alt"] == "inline one"  # type: ignore[index]
    for src in (
        "https://example.com/cat.png",  # other sites would see every reader's IP
        "http://example.com/cat.png",
        "javascript:alert(1)",
        "/demo/forum/cat.jpg",
        f"//example.com/api/v1/media/{image}",
        f"/api/v1/media/{image}?x=1",
        f"/api/v1/media/{image.upper()}",
        "/api/v1/media/../../etc/passwd",
    ):
        assert forum.first_image(f"![x]({src})") is None, src
    assert forum.first_image(f"```\n![x](/api/v1/media/{image})\n```") is None  # inside code
    assert forum.first_image(f"`![x](/api/v1/media/{image})`") is None
    second = str(uuid.uuid4())
    found = forum.first_image(f"![a](https://x.example/a.png)\n\n![b](/api/v1/media/{second})")
    assert found == {"src": f"/api/v1/media/{second}", "alt": "b"}


def test_media_references() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    text = f"![x](/api/v1/media/{a}) /api/v1/media/{b} again /api/v1/media/{a} and /api/v1/media/{b}/../c"
    assert forum.media_ids(text) == [a, b]


def test_search_terms() -> None:
    assert forum.search_terms("How do I find the MGF?") == ["find", "mgf"]
    assert forum.search_terms("the a an") == ["the", "a", "an"]  # only stop words: keep them
    assert forum.search_terms("R_f, R and r") == ["r", "f"]
    assert forum.search_terms("ST2133 st2133") == ["st2133"]
    assert forum.search_terms("مرحبا بالعالم") == ["مرحبا", "بالعالم"]
    assert len(forum.search_terms(" ".join(f"word{i}" for i in range(20)))) == 8
