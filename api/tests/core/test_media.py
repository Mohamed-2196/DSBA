"""Forum images follow their post (security review, finding 8 and SEC-10): /media serves an image to everyone only
while it is attached to a visible post; its uploader and moderators always see it."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Upload, UploadStatus, User
from tests.core.helpers import API, as_uuid, image, new_reply, new_thread

Clients = Callable[..., TestClient]


def _status(c: TestClient, media: str) -> int:
    return c.get(media, follow_redirects=False).status_code


def _upload(db: Session, media: str) -> Upload:
    up = db.get(Upload, as_uuid(media), populate_existing=True)
    assert up is not None
    return up


def test_a_hidden_thread_takes_its_images_with_it(
    client_for: Clients, storage: Any, student: User, classmate: User, moderator: User, db: Session
) -> None:
    author = client_for(student)
    media = image(author, storage)
    assert _status(client_for(), media) == 404  # not posted yet: nobody else has a reason to load it
    assert _status(author, media) == 302  # the uploader's own preview
    t = new_thread(author, f"My plot:\n\n![density]({media})")
    up = _upload(db, media)
    assert (up.status, up.thread_id, up.reply_id) == (UploadStatus.attached, as_uuid(t["id"]), None)
    assert _status(client_for(), media) == 302

    rep = client_for(moderator)
    assert rep.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "hidden"}).status_code == 200
    for viewer in (client_for(), client_for(classmate)):
        assert _status(viewer, media) == 404
    assert _status(rep, media) == 302  # moderators still see what they hid
    assert _status(author, media) == 302  # and the uploader their own picture

    assert rep.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "visible"}).status_code == 200
    assert _status(client_for(), media) == 302


def test_a_deleted_thread_takes_its_images_with_it(
    client_for: Clients, storage: Any, student: User, moderator: User
) -> None:
    author = client_for(student)
    media = image(author, storage)
    t = new_thread(author, f"![a]({media})")
    assert author.delete(f"{API}/forum/threads/{t['id']}").status_code == 204
    assert _status(client_for(), media) == 404
    assert _status(client_for(moderator), media) == 302


def test_reply_images_follow_the_reply_and_its_thread(
    client_for: Clients, storage: Any, student: User, classmate: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), "Show your working")
    replier = client_for(classmate)
    media = image(replier, storage)
    reply = new_reply(replier, t["id"], f"Here it is:\n\n![working]({media})")
    up = _upload(db, media)
    assert (up.status, up.thread_id, up.reply_id) == (UploadStatus.attached, None, as_uuid(reply["id"]))
    assert _status(client_for(), media) == 302

    rep = client_for(moderator)
    assert rep.post(f"{API}/forum/replies/{reply['id']}/moderate", json={"status": "hidden"}).status_code == 200
    assert _status(client_for(), media) == 404
    assert _status(rep, media) == 302
    assert rep.post(f"{API}/forum/replies/{reply['id']}/moderate", json={"status": "visible"}).status_code == 200
    assert _status(client_for(), media) == 302

    assert rep.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "hidden"}).status_code == 200
    assert _status(client_for(), media) == 404  # the reply is out of sight with its thread

    assert rep.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "visible"}).status_code == 200
    assert replier.delete(f"{API}/forum/replies/{reply['id']}").status_code == 204
    assert _status(client_for(), media) == 404


def test_an_image_in_two_posts_stays_with_the_one_that_still_shows_it(
    client_for: Clients, storage: Any, student: User, db: Session
) -> None:
    author = client_for(student)
    media = image(author, storage)
    first = new_thread(author, f"![a]({media})", title="The first post with the plot")
    second = new_thread(author, f"Again: ![a]({media})", title="The second post with the plot")
    assert _upload(db, media).thread_id == as_uuid(first["id"])
    assert author.delete(f"{API}/forum/threads/{first['id']}").status_code == 204
    up = _upload(db, media)
    assert (up.status, up.thread_id) == (UploadStatus.attached, as_uuid(second["id"]))
    assert _status(client_for(), media) == 302


def test_an_image_edited_out_of_its_post_is_not_served(
    client_for: Clients, storage: Any, student: User, db: Session
) -> None:
    author = client_for(student)
    media = image(author, storage)
    t = new_thread(author, f"Before: ![a]({media})")
    assert author.patch(f"{API}/forum/threads/{t['id']}", json={"body": "After: no picture"}).status_code == 200
    assert _upload(db, media).status == UploadStatus.uploaded  # the sweep deletes it tomorrow
    assert _status(client_for(), media) == 404  # gone for everyone else right away


def test_an_image_whose_post_is_gone_is_not_served(
    client_for: Clients, storage: Any, student: User, db: Session
) -> None:
    author = client_for(student)
    media = image(author, storage)
    new_thread(author, f"![a]({media})")
    up = _upload(db, media)
    up.thread_id = None  # what ON DELETE SET NULL leaves when the post's row is deleted
    db.commit()
    assert _status(client_for(), media) == 404


def test_an_image_follows_only_its_uploaders_posts(
    client_for: Clients, storage: Any, student: User, classmate: User, db: Session
) -> None:
    author, other = client_for(student), client_for(classmate)
    media = image(author, storage)
    mine = new_thread(author, f"![a]({media})", title="My post with my plot")
    new_thread(other, f"Borrowed: ![a]({media})", title="Someone else's post with it")
    assert author.delete(f"{API}/forum/threads/{mine['id']}").status_code == 204
    up = _upload(db, media)
    assert (up.status, up.thread_id) == (UploadStatus.uploaded, as_uuid(mine["id"]))  # the sweep will take it
    assert _status(client_for(), media) == 404
