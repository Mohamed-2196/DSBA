"""In the forum, forum.post is for writing and forum.moderate for the reps' powers, held through any role. Deleting
your own words needs no box."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.core.access import Box
from app.models import User
from tests.core.helpers import API, new_thread

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
POSTING = "Your account can't post in the forum. Contact a student rep."


def test_writing_needs_forum_post(
    client_for: ClientFor, make_user: MakeUser, give_roles: Callable[..., None], student: User
) -> None:
    t = new_thread(client_for(student), "Is the MGF unique?")
    reader = make_user(name="Only Reads", roles=("newsletter-manager",))
    c = client_for(reader)
    created = c.post(f"{API}/forum/threads", json={"title": "Can I post now?", "body": "Hello"})
    assert (created.status_code, created.json()["error"]["message"]) == (403, POSTING)
    assert c.get(f"{API}/forum/threads/{t['slug']}").status_code == 200  # reading needs no box


def test_without_forum_post_you_can_still_delete_your_own_words(
    client_for: ClientFor, give_roles: Callable[..., None], student: User
) -> None:
    t = new_thread(client_for(student), "Mine to take down")
    give_roles(student, "newsletter-manager")
    c = client_for(student)
    edited = c.patch(f"{API}/forum/threads/{t['id']}", json={"title": "Edited title"})
    assert (edited.status_code, edited.json()["error"]["message"]) == (403, POSTING)
    assert c.delete(f"{API}/forum/threads/{t['id']}").status_code == 204


def test_moderating_comes_from_the_box_through_any_role(
    client_for: ClientFor,
    make_user: MakeUser,
    make_role: Callable[..., Any],
    give_roles: Callable[..., None],
    student: User,
) -> None:
    t = new_thread(client_for(student), "Pin me")
    url = f"{API}/forum/threads/{t['id']}/moderate"
    make_role("forum-helpers", Box.forum_moderate)
    make_role("library-team", Box.library_manage)
    helper, librarian = make_user(name="Forum Helper"), make_user(name="Library Helper")
    give_roles(helper, "student", "forum-helpers")
    give_roles(librarian, "student", "library-team")
    assert client_for(helper).post(url, json={"pinned": True}).status_code == 200
    assert client_for(librarian).post(url, json={"pinned": True}).status_code == 403
    assert client_for(helper).post(url, json={"status": "hidden"}).status_code == 200
    assert client_for(helper).get(f"{API}/forum/threads/{t['slug']}").status_code == 200
    assert client_for(librarian).get(f"{API}/forum/threads/{t['slug']}").status_code == 404
