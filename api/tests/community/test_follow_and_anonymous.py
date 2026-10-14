"""Following a thread (IDEA-7) and asking without your name (IDEA-8)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, EmailOutbox, User
from tests.community.helpers import API, new_reply, new_thread, notifications_for

Client = Callable[..., TestClient]
SetFeature = Callable[..., None]


def follow(client: TestClient, thread_id: str, level: str) -> str:
    r = client.put(f"{API}/forum/threads/{thread_id}/follow", json={"level": level})
    assert r.status_code == 200, r.text
    following: str = r.json()["following"]
    return following


def following(client: TestClient, slug: str) -> str:
    level: str = client.get(f"{API}/forum/threads/{slug}").json()["following"]
    return level


# ── following ────────────────────────────────────────────────────────────────────────────────


def test_voting_or_replying_follows_for_answers_and_off_stays_off(
    client_for: Client, student: User, classmate: User, make_user: Callable[..., User], set_feature: SetFeature
) -> None:
    set_feature("forum.follow", "everyone")
    third = make_user(name="Layla F.", year=1)
    t = new_thread(client_for(student))
    assert following(client_for(student), t["slug"]) == "off"  # the author hears about replies already
    assert following(client_for(third), t["slug"]) == "off"
    assert client_for(third).put(f"{API}/forum/threads/{t['id']}/vote").status_code == 200
    assert following(client_for(third), t["slug"]) == "answers"
    new_reply(client_for(classmate), t["id"])
    assert following(client_for(classmate), t["slug"]) == "answers"
    assert follow(client_for(third), t["id"], "off") == "off"
    client_for(third).delete(f"{API}/forum/threads/{t['id']}/vote")
    client_for(third).put(f"{API}/forum/threads/{t['id']}/vote")
    new_reply(client_for(third), t["id"], "Me too")
    assert following(client_for(third), t["slug"]) == "off"  # switched off by hand: it stays off
    assert following(client_for(), t["slug"]) == "off"  # guests


def test_followers_hear_about_answers_and_if_they_chose_replies(
    client_for: Client,
    student: User,
    classmate: User,
    make_user: Callable[..., User],
    set_feature: SetFeature,
    db: Session,
) -> None:
    set_feature("forum.follow", "everyone")
    layla, hamad = make_user(name="Layla F.", year=1), make_user(name="Hamad K.", year=2)
    t = new_thread(client_for(student), title="When are the October results out?")
    follow(client_for(layla), t["id"], "answers")
    follow(client_for(hamad), t["id"], "replies")
    answer = new_reply(client_for(classmate), t["id"], "Usually in early August.")
    assert [n.kind for n in notifications_for(db, layla)] == []
    told = notifications_for(db, hamad)
    assert [(n.kind, n.title) for n in told] == [
        ("followed_reply", "Ebrahim D. replied in “When are the October results out?”")
    ]
    assert told[0].url == f"/forum/{t['slug']}#reply-{answer['id']}"
    assert db.scalars(select(EmailOutbox.kind).where(EmailOutbox.user_id == hamad.id)).all() == ["followed_reply"]
    client_for(student).post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": answer["id"]})
    for person in (layla, hamad):
        last = notifications_for(db, person)[-1]
        assert (last.kind, last.title) == ("followed_answer", "“When are the October results out?” has an answer")
    # the answer's author hears once, as its author
    assert [n.kind for n in notifications_for(db, classmate)] == ["answer_accepted"]


def test_deleting_a_reply_takes_back_what_followers_heard(
    client_for: Client,
    student: User,
    classmate: User,
    make_user: Callable[..., User],
    set_feature: SetFeature,
    db: Session,
) -> None:
    set_feature("forum.follow", "everyone")
    hamad = make_user(name="Hamad K.", year=2)
    t = new_thread(client_for(student))
    follow(client_for(hamad), t["id"], "replies")
    r = new_reply(client_for(classmate), t["id"])
    assert len(notifications_for(db, hamad)) == 1
    assert client_for(classmate).delete(f"{API}/forum/replies/{r['id']}").status_code == 204
    assert notifications_for(db, hamad) == []


def test_following_switched_off_sends_nothing_and_refuses_the_route(
    client_for: Client, student: User, classmate: User, make_user: Callable[..., User], db: Session
) -> None:
    hamad = make_user(name="Hamad K.", year=2)
    t = new_thread(client_for(student))
    r = client_for(hamad).put(f"{API}/forum/threads/{t['id']}/follow", json={"level": "replies"})
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")
    client_for(hamad).put(f"{API}/forum/threads/{t['id']}/vote")
    new_reply(client_for(classmate), t["id"])
    assert notifications_for(db, hamad) == []
    assert following(client_for(hamad), t["slug"]) == "off"


def test_follows_are_in_the_export(client_for: Client, student: User, classmate: User, set_feature: SetFeature) -> None:
    set_feature("forum.follow", "everyone")
    t = new_thread(client_for(student))
    follow(client_for(classmate), t["id"], "replies")
    export = client_for(classmate).get(f"{API}/me/export").json()
    assert [(f["threadSlug"], f["level"]) for f in export["follows"]] == [(t["slug"], "replies")]


# ── without your name ────────────────────────────────────────────────────────────────────────


def test_an_anonymous_thread_names_its_author_only_to_them_and_to_moderators(
    client_for: Client,
    make_user: Callable[..., User],
    classmate: User,
    moderator: User,
    set_feature: SetFeature,
    db: Session,
) -> None:
    set_feature("forum.anonymous", "everyone")
    layla = make_user(name="Layla F.", year=1)
    t = new_thread(client_for(layla), title="Is this question too basic to ask?", anonymous=True)
    assert t["anonymous"] is True
    assert t["author"]["displayName"] == "Layla F."  # the author sees themselves
    for viewer in (client_for(), client_for(classmate)):
        seen = viewer.get(f"{API}/forum/threads/{t['slug']}").json()
        assert (seen["author"], seen["authorYear"], seen["anonymous"]) == (None, 1, True)
        listed = viewer.get(f"{API}/forum/threads").json()["items"]
        assert [(i["author"], i["anonymous"]) for i in listed] == [(None, True)]
        assert viewer.get(f"{API}/forum/threads/hot").json()[0]["author"] is None
    rep_view = client_for(moderator).get(f"{API}/forum/threads/{t['slug']}").json()
    assert rep_view["author"]["displayName"] == "Layla F."
    # the audit log records who posted it
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "forum.thread.anonymous")).one()
    assert entry.actor_id == layla.id


def test_the_anonymous_author_stays_unnamed_in_their_replies_and_notifications(
    client_for: Client, make_user: Callable[..., User], classmate: User, set_feature: SetFeature, db: Session
) -> None:
    set_feature("forum.anonymous", "everyone")
    layla = make_user(name="Layla F.", year=1)
    t = new_thread(client_for(layla), anonymous=True)
    answer = new_reply(client_for(classmate), t["id"], "Use the definition.")
    new_reply(client_for(layla), t["id"], "Thanks, that worked", parentId=answer["id"])
    seen = client_for(classmate).get(f"{API}/forum/threads/{t['slug']}").json()
    mine = seen["replies"][1]
    assert (mine["author"], mine["anonymous"]) == (None, True)
    assert seen["replies"][0]["author"]["displayName"] == "Ebrahim D."
    client_for(layla).post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": answer["id"]})
    for n in notifications_for(db, classmate):
        assert n.actor_id is None
        assert "Layla" not in n.title
    by_kind = {n.kind: n.title for n in notifications_for(db, classmate)}
    assert by_kind["reply_reply"].startswith("The person who asked replied to you")
    listed = client_for(classmate).get(f"{API}/notifications").json()["items"]
    assert all(i["actor"] is None for i in listed)


def test_posting_without_a_name_needs_its_switch(client_for: Client, student: User, set_feature: SetFeature) -> None:
    r = client_for(student).post(f"{API}/forum/threads", json={"title": "A quiet question", "anonymous": True})
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")
    set_feature("forum.anonymous", "everyone")
    set_feature("forum.anonymous", "off")
    # a thread posted while it was on stays unnamed
    set_feature("forum.anonymous", "everyone")
    t = new_thread(client_for(student), anonymous=True)
    set_feature("forum.anonymous", "off")
    assert client_for().get(f"{API}/forum/threads/{t['slug']}").json()["author"] is None


def test_an_anonymous_thread_can_still_be_reported(
    client_for: Client, make_user: Callable[..., User], classmate: User, set_feature: SetFeature
) -> None:
    set_feature("forum.anonymous", "everyone")
    layla = make_user(name="Layla F.", year=1)
    t = new_thread(client_for(layla), anonymous=True)
    r = client_for(classmate).post(
        f"{API}/reports", json={"targetType": "thread", "targetId": t["id"], "reason": "harassment"}
    )
    assert r.status_code == 204, r.text
