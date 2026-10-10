"""GET /forum/threads (filters, ordering, search, visibility), /forum/threads/hot and /related."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import PostStatus, User
from tests.community.helpers import API, ids, new_reply, new_thread, set_thread

Client = Callable[..., TestClient]


def listing(client: TestClient, **params: Any) -> dict[str, Any]:
    r = client.get(f"{API}/forum/threads", params=params)
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data


@pytest.fixture
def ranked(client_for: Client, student: User, db: Session) -> dict[str, str]:
    """Four threads whose hot, new and top orders all differ."""
    c = client_for(student)
    a = new_thread(c, title="Thread A is brand new")["id"]
    b = new_thread(c, title="Thread B is a day old")["id"]
    cc = new_thread(c, title="Thread C is two days old")["id"]
    d = new_thread(c, title="Thread D is busy")["id"]
    now = utcnow()
    # hot = (votes + 1.5 * replies) / (hours + 2)^1.5
    set_thread(db, a, vote_count=1, reply_count=0, created_at=now)  # 1 / 2^1.5 = 0.35
    set_thread(db, b, vote_count=10, reply_count=2, created_at=now - timedelta(hours=10))  # 13 / 12^1.5 = 0.31
    set_thread(db, cc, vote_count=30, reply_count=0, created_at=now - timedelta(hours=48))  # 30 / 50^1.5 = 0.08
    set_thread(db, d, vote_count=3, reply_count=4, created_at=now - timedelta(hours=3))  # 9 / 5^1.5 = 0.80
    return {"a": a, "b": b, "c": cc, "d": d}


def test_sort_orders(client_for: Client, ranked: dict[str, str]) -> None:
    guest = client_for()
    a, b, c, d = ranked["a"], ranked["b"], ranked["c"], ranked["d"]
    assert ids(listing(guest)["items"]) == [d, a, b, c]  # hot is the default
    assert ids(listing(guest, sort="new")["items"]) == [a, d, b, c]
    assert ids(listing(guest, sort="top")["items"]) == [c, b, d, a]
    assert client_for().get(f"{API}/forum/threads", params={"sort": "best"}).status_code == 422


def test_pinned_threads_come_first_except_in_search(client_for: Client, ranked: dict[str, str], db: Session) -> None:
    guest = client_for()
    set_thread(db, ranked["c"], pinned=True)
    assert ids(listing(guest)["items"]) == [ranked["c"], ranked["d"], ranked["a"], ranked["b"]]
    assert ids(listing(guest, sort="new")["items"])[0] == ranked["c"]
    searched = listing(guest, q="thread")
    assert ids(searched["items"]) == [ranked["d"], ranked["a"], ranked["b"], ranked["c"]]


def test_pagination(client_for: Client, ranked: dict[str, str]) -> None:
    page = listing(client_for(), sort="new", limit=2, offset=1)
    assert page["total"] == 4
    assert (page["limit"], page["offset"]) == (2, 1)
    assert ids(page["items"]) == [ranked["d"], ranked["b"]]
    assert client_for().get(f"{API}/forum/threads", params={"limit": 101}).status_code == 422


def test_summary_fields(client_for: Client, student: User, classmate: User, modules: dict[str, Any]) -> None:
    image_id = "0b0f6c8e-8a4b-4d35-9d0e-1f2a3b4c5d6e"
    body = (
        "**Bold** and *italic*, a [link](https://example.com) and `code`.\n\n"
        f"![my notes](/api/v1/media/{image_id})\n\n"
        "```\nsecret code block\n```\n\n- one\n- two\n\n> quoted"
    )
    t = new_thread(client_for(student), title="Summary fields", body=body, moduleId="advanced-stats-distribution")
    new_reply(client_for(classmate), t["id"])
    [row] = listing(client_for(classmate))["items"]
    assert row["excerpt"] == "Bold and italic, a link and code. … one two quoted"
    assert row["image"] == {"src": f"/api/v1/media/{image_id}", "alt": "my notes"}
    assert row["replyCount"] == 1
    assert row["moduleId"] == "advanced-stats-distribution"
    assert row["year"] == 2
    assert (row["voted"], row["isMine"], row["answered"]) == (False, False, False)
    assert "body" not in row
    mine = listing(client_for(student))["items"][0]
    assert (mine["voted"], mine["isMine"]) == (True, True)


def test_filters(client_for: Client, student: User, classmate: User, modules: dict[str, Any]) -> None:
    s, c = client_for(student), client_for(classmate)
    stats = new_thread(s, title="MGF question", moduleId="advanced-stats-distribution", tags=["exam-prep"])["id"]
    python = new_thread(c, title="Python question", moduleId="programming-data-science", tags=["python"])["id"]
    general = new_thread(c, title="Lost and found", category="general", tags=["lost-and-found"])["id"]
    new_reply(s, python)
    guest = client_for()
    assert ids(listing(guest, category="year-2", sort="new")["items"]) == [python, stats]
    assert ids(listing(guest, category="general")["items"]) == [general]
    assert ids(listing(guest, module_id="programming-data-science")["items"]) == [python]
    assert ids(listing(guest, tag="exam-prep")["items"]) == [stats]
    assert listing(guest, tag="unknown")["items"] == []
    assert set(ids(listing(guest, unanswered="true")["items"])) == {stats, general}
    assert ids(listing(s, mine="true")["items"]) == [stats]
    r = guest.get(f"{API}/forum/threads", params={"mine": "true"})
    assert r.status_code == 401
    assert guest.get(f"{API}/forum/threads", params={"category": "year-9"}).status_code == 422


def test_year_filter(client_for: Client, student: User, modules: dict[str, Any]) -> None:
    c = client_for(student)
    year2 = new_thread(c, title="Year two category", category="year-2")["id"]
    module2 = new_thread(
        c, title="General about a year 2 module", category="general", moduleId="programming-data-science"
    )["id"]
    general = new_thread(c, title="General for everyone", category="general")["id"]
    group = new_thread(c, title="Study group for everyone", category="study-groups")["id"]
    year1 = new_thread(c, title="Year one category", category="year-1")["id"]
    group1 = new_thread(c, title="Maths study group", category="study-groups", moduleId="mathematics")["id"]
    year3 = new_thread(c, title="Machine learning question", moduleId="machine-learning")["id"]
    guest = client_for()

    def years(y: int) -> set[str]:
        return set(ids(listing(guest, year=y)["items"]))

    assert years(2) == {year2, module2, general, group}
    assert years(1) == {general, group, year1, group1}
    assert years(3) == {general, group, year3}
    assert guest.get(f"{API}/forum/threads", params={"year": 4}).status_code == 422
    hot2 = guest.get(f"{API}/forum/threads/hot", params={"year": 2, "n": 20}).json()
    assert set(ids(hot2)) == years(2)


@pytest.fixture
def searchable(client_for: Client, student: User, classmate: User, moderator: User, modules: dict[str, Any]) -> dict:
    s, c = client_for(student), client_for(classmate)
    mgf = new_thread(
        s,
        title="Moment generating function of a gamma",
        body="Stuck on the integral before the exam.",
        moduleId="advanced-stats-distribution",
    )["id"]
    loops = new_thread(c, title="Python loops are slow", body="Any tips?", moduleId="programming-data-science",
                       tags=["python"])["id"]  # fmt: skip
    lost = new_thread(c, title="Lost my calculator", body="Casio, before the exam.", category="general")["id"]
    new_reply(s, lost, "Check the property office next to the library.")
    timetable = new_thread(c, title="Revision timetable", body="When is it?", category="general")["id"]
    hidden = new_reply(s, timetable, "bananas")
    r = client_for(moderator).post(f"{API}/forum/replies/{hidden['id']}/moderate", json={"status": "hidden"})
    assert r.status_code == 200
    arabic = new_thread(c, title="سؤال عن الإحصاء", body="مرحبا بالجميع", category="general")["id"]
    return {"mgf": mgf, "loops": loops, "lost": lost, "timetable": timetable, "arabic": arabic}


def test_search(client_for: Client, searchable: dict[str, str]) -> None:
    guest = client_for()

    def found(q: str) -> set[str]:
        return set(ids(listing(guest, q=q)["items"]))

    mgf, loops, lost, arabic = searchable["mgf"], searchable["loops"], searchable["lost"], searchable["arabic"]
    assert found("gamma") == {mgf}  # title
    assert found("integral") == {mgf}  # body
    assert found("property office") == {lost}  # only in a reply
    assert found("calculator office") == {lost}  # every word, anywhere in the thread or its replies
    assert found("ST2133") == {mgf}  # the module's unit code
    assert found("st2133") == {mgf}
    assert found("st21") == {mgf, loops}  # as you type: ST2133 and ST2195
    assert found("distribution theory") == {mgf}  # the module's name
    assert found("python") == {loops}
    assert found("how do the python loops") == {loops}  # stop words are ignored
    assert found("gen") == {mgf, lost, searchable["timetable"], arabic}  # prefix: generating, General (category)
    assert found("exam") == {mgf, lost}
    assert found("bananas") == set()  # a hidden reply doesn't match
    assert found('"moment generating"') == {mgf}  # web-search syntax: a phrase
    assert found('"generating moment"') == set()
    assert found("الإحصاء") == {arabic}
    assert found("مرحب") == {arabic}
    assert found("   ") == set(ids(listing(guest)["items"]))  # nothing to search for: everything
    assert found("?!") == set(ids(listing(guest)["items"]))
    assert listing(guest, q="exam", category="general")["total"] == 1
    assert guest.get(f"{API}/forum/threads", params={"q": "x" * 201}).status_code == 422


def test_hidden_and_deleted_threads_in_lists(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    s = client_for(student)
    visible = new_thread(s, title="Visible thread")["id"]
    hidden = new_thread(s, title="Hidden thread")["id"]
    deleted_alone = new_thread(s, title="Deleted with no replies")["id"]
    deleted_answered = new_thread(s, title="Deleted with a reply", body="Secret body")["id"]
    new_reply(client_for(classmate), deleted_answered)
    set_thread(db, hidden, status=PostStatus.hidden)
    assert s.delete(f"{API}/forum/threads/{deleted_alone}").status_code == 204
    assert s.delete(f"{API}/forum/threads/{deleted_answered}").status_code == 204

    for viewer in (client_for(), s, client_for(classmate)):
        page = listing(viewer, sort="new")
        assert ids(page["items"]) == [deleted_answered, visible]
        assert page["total"] == 2
        gone = page["items"][0]
        assert (gone["status"], gone["title"], gone["excerpt"]) == ("deleted", "Deleted with a reply", "")
    mod_view = listing(client_for(moderator), sort="new")
    assert ids(mod_view["items"]) == [deleted_answered, hidden, visible]
    assert listing(client_for(), q="secret")["items"] == []  # the deleted text is gone from search too


def test_hot_threads(client_for: Client, ranked: dict[str, str], db: Session, moderator: User) -> None:
    guest = client_for()
    r = guest.get(f"{API}/forum/threads/hot")
    assert r.status_code == 200
    assert ids(r.json()) == [ranked["d"], ranked["a"], ranked["b"], ranked["c"]]
    set_thread(db, ranked["d"], pinned=True)  # pinned threads (guidelines) never show here
    set_thread(db, ranked["a"], status=PostStatus.hidden)
    assert ids(guest.get(f"{API}/forum/threads/hot", params={"n": 1}).json()) == [ranked["b"]]
    assert ranked["a"] not in ids(client_for(moderator).get(f"{API}/forum/threads/hot").json())
    assert guest.get(f"{API}/forum/threads/hot", params={"n": 21}).status_code == 422


def test_related_threads(
    client_for: Client, student: User, classmate: User, modules: dict[str, Any], db: Session
) -> None:
    s, c = client_for(student), client_for(classmate)
    base = new_thread(
        s, title="MGF of a gamma", moduleId="advanced-stats-distribution", tags=["exam-prep", "past-papers"]
    )
    same_module = new_thread(c, title="Another MGF question", moduleId="advanced-stats-distribution")["id"]
    same_tag = new_thread(c, title="Python exam prep", moduleId="programming-data-science", tags=["exam-prep"])["id"]
    new_thread(c, title="Past papers anywhere?", category="general", tags=["past-papers"])  # 2 points: too weak
    new_thread(c, title="Maths question", moduleId="mathematics")
    pinned = new_thread(c, title="Pinned MGF notes", moduleId="advanced-stats-distribution")["id"]
    hidden = new_thread(c, title="Hidden MGF thread", moduleId="advanced-stats-distribution")["id"]
    set_thread(db, pinned, pinned=True)
    set_thread(db, hidden, status=PostStatus.hidden)
    r = client_for().get(f"{API}/forum/threads/{base['id']}/related")
    assert r.status_code == 200
    assert ids(r.json()) == [same_module, same_tag]
    assert ids(client_for().get(f"{API}/forum/threads/{base['id']}/related", params={"n": 1}).json()) == [same_module]
    assert client_for().get(f"{API}/forum/threads/{hidden}/related").status_code == 404
    assert client_for().get(f"{API}/forum/threads/00000000-0000-0000-0000-000000000000/related").status_code == 404


def test_control_characters_in_parameters(client_for: Client, student: User) -> None:
    t = new_thread(client_for(student), title="Plain thread", tags=["r"])
    guest = client_for()
    # one rule for the whole API (app.core.errors.ControlCharactersMiddleware): a bad address, before any route
    for params in ({"q": '"\x00abc'}, {"q": "plain\x00"}, {"tag": "r\x00"}, {"module_id": "a\x00"}):
        r = guest.get(f"{API}/forum/threads", params=params)
        assert r.status_code == 400, params
        assert r.json()["error"]["code"] == "bad_request"
    assert ids(listing(guest, q="plain")["items"]) == [t["id"]]
    assert guest.get(f"{API}/forum/threads/plain%00thread").status_code == 400
    r = client_for(student).post(f"{API}/forum/threads", json={"title": "Valid title", "moduleId": "x\x00"})
    assert r.status_code == 422
    assert "moduleId" in r.json()["error"]["fields"]
