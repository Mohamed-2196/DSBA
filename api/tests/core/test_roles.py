"""Moderator and Admin need an active account with a profile (security review, finding 4)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import is_admin, is_moderator
from app.models import Role, User, UserStatus
from tests.core.helpers import API, new_thread, share_pdf

Clients = Callable[..., TestClient]


def _suspend(db: Session, user: User) -> None:
    user.status = UserStatus.suspended
    db.commit()


def test_roles_need_an_active_account(make_user: Callable[..., User]) -> None:
    rep, boss = make_user(role=Role.moderator), make_user(role=Role.admin)
    assert [is_moderator(rep), is_moderator(boss), is_admin(boss)] == [True, True, True]
    assert [is_admin(rep), is_moderator(None), is_moderator(make_user())] == [False, False, False]
    rep.status = boss.status = UserStatus.suspended
    assert [is_moderator(rep), is_moderator(boss), is_admin(boss)] == [False, False, False]


def test_a_suspended_moderator_gets_403_when_moderating(
    client_for: Clients, student: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), "Pin me")
    url = f"{API}/forum/threads/{t['id']}/moderate"
    assert client_for(moderator).post(url, json={"pinned": True}).status_code == 200
    _suspend(db, moderator)
    rep = client_for(moderator)
    r = rep.post(url, json={"status": "hidden"})
    assert r.status_code == 403
    assert r.json()["error"] == {"code": "forbidden", "message": "Your account is suspended. Contact a student rep."}
    assert rep.get(f"{API}/forum/threads/{t['slug']}").json()["status"] == "visible"
    for path in ("/admin/stats", "/admin/reports"):
        assert rep.get(f"{API}{path}").status_code == 403
    link = {"url": "https://example.com/notes", "title": "Notes", "kind": "notes"}
    assert rep.post(f"{API}/library/links", json=link).status_code == 403


def test_a_suspended_moderator_sees_and_removes_only_what_a_student_may(
    client_for: Clients, storage: Any, student: User, admin: User, moderator: User, db: Session
) -> None:
    published = share_pdf(client_for(admin), storage, title="Published by an admin")
    pending = share_pdf(client_for(student), storage, title="Waiting for review")
    rep = client_for(moderator)
    assert rep.get(f"{API}/library/items/{pending['id']}").status_code == 200
    _suspend(db, moderator)
    assert rep.get(f"{API}/library/items/{pending['id']}").status_code == 404
    assert rep.delete(f"{API}/library/items/{published['id']}").status_code == 403
    assert client_for().get(f"{API}/library/items/{published['id']}").json()["status"] == "published"


def test_a_suspended_admin_cannot_change_roles(client_for: Clients, admin: User, student: User, db: Session) -> None:
    _suspend(db, admin)
    c = client_for(admin)
    assert c.patch(f"{API}/admin/users/{student.id}", json={"role": "moderator"}).status_code == 403
    assert c.get(f"{API}/admin/users").status_code == 403
    db.refresh(student)
    assert student.role == Role.student


def test_staff_finish_their_profile_before_acting(
    client_for: Clients, make_user: Callable[..., User], student: User
) -> None:
    t = new_thread(client_for(student), "Lock me")
    nameless_rep = make_user(name=None, role=Role.moderator)
    r = client_for(nameless_rep).post(f"{API}/forum/threads/{t['id']}/moderate", json={"locked": True})
    assert r.status_code == 403
    assert r.json()["error"]["message"] == "Finish your profile first."


def test_a_suspended_moderator_reads_no_drafts(client_for: Clients, moderator: User, db: Session) -> None:
    from app.seed.loader import load_newsletter

    load_newsletter(db)
    db.commit()
    rep = client_for(moderator)
    drafts = rep.get(f"{API}/newsletter/issues", params={"include_drafts": True}).json()
    assert [i["status"] for i in drafts] == ["draft", "draft"]
    _suspend(db, moderator)
    assert rep.get(f"{API}/newsletter/issues", params={"include_drafts": True}).json() == []
    assert rep.get(f"{API}/newsletter/issues/{drafts[0]['slug']}").status_code == 404
