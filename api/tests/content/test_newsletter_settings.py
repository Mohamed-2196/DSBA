"""The newsletter's settings: the line under its name (public) and the pictures its editor offers (for the people
who manage the newsletter). Holders of newsletter.manage save them from the version they loaded, audited. An
uploaded picture is kept while it is offered (the sweep leaves it), and released once it isn't, unless an issue shows
it."""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Box
from app.models import AuditEntry, UploadStatus, User
from tests.content.conftest import API, PNG
from tests.content.test_newsletter_pictures import ISSUES, _upload, issue, picture
from tests.core.helpers import upload

Clients = Callable[..., TestClient]
SETTINGS, EDIT, PICTURES = (
    f"{API}/newsletter/settings",
    f"{API}/newsletter/settings/edit",
    f"{API}/newsletter/pictures",
)
SEED = Path(__file__).resolve().parents[2] / "app" / "seed" / "data" / "newsletter_settings.json"


def seed() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(SEED.read_text(encoding="utf-8"))
    return copy.deepcopy(data)


def offering(media: str, label: str = "Graduation day") -> dict[str, Any]:
    return {"id": "graduation", "src": media, "label": label, "width": 1200, "height": 800, "cover": False}


def fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


def test_the_masthead_is_public_and_the_pictures_are_for_managers(
    client_for: Clients, moderator: User, student: User
) -> None:
    assert client_for().get(SETTINGS).json() == {"masthead": seed()["masthead"]}
    for who in (None, student):
        assert client_for(who).get(PICTURES).status_code == (401 if who is None else 403)
    assert client_for(moderator).get(PICTURES).json() == seed()["pictures"]
    loaded = client_for(moderator).get(EDIT).json()
    assert (loaded["version"], loaded["data"]) == (0, seed())


def test_only_people_who_manage_the_newsletter_edit_them(
    client_for: Clients, student: User, make_user: Callable[..., User], make_role: Callable[..., Any], db: Session
) -> None:
    for who in (None, student):
        assert client_for(who).get(EDIT).status_code == (401 if who is None else 403)
        r = client_for(who).put(SETTINGS, json={"version": 0, "data": seed()})
        assert r.status_code == (401 if who is None else 403)
    make_role("issue-writers", Box.newsletter_manage)
    writer = client_for(make_user(name="Noor Writer", roles=("student", "issue-writers")))
    data = seed() | {"masthead": "Written by DSBA students, for DSBA students."}
    r = writer.put(SETTINGS, json={"version": 0, "data": data})
    assert r.status_code == 200, r.text
    assert client_for().get(SETTINGS).json()["masthead"] == "Written by DSBA students, for DSBA students."
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "newsletter.settings"))
    assert entry is not None
    assert (entry.target_id, entry.data["parts"]) == ("newsletter", ["masthead"])
    stale = client_for(make_user(name="Rami Rep", roles=("student", "rep"))).put(
        SETTINGS, json={"version": 0, "data": seed()}
    )
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "newsletter_settings_changed")


def test_an_uploaded_picture_is_kept_while_it_is_offered(
    client_for: Clients, moderator: User, storage: Any, db: Session
) -> None:
    rep = client_for(moderator)
    media = picture(rep, storage)
    data = seed()
    data["pictures"].append(offering(media))
    r = rep.put(SETTINGS, json={"version": 0, "data": data})
    assert r.status_code == 200, r.text
    assert _upload(db, media).status == UploadStatus.attached  # the sweep leaves it
    assert rep.get(PICTURES).json()[-1]["src"] == media  # the issue editor offers it

    # An issue that used it and lets it go doesn't release it while the settings offer it.
    issue_id = rep.post(ISSUES, json=issue(art=media)).json()["id"]
    assert rep.patch(f"{ISSUES}/{issue_id}", json={"cover": {"tone": "navy"}}).status_code == 200
    up = _upload(db, media)
    assert (up.status, up.newsletter_issue_id) == (UploadStatus.attached, None)

    # No longer offered and no issue shows it: back to the sweep.
    assert rep.put(SETTINGS, json={"version": 1, "data": seed()}).status_code == 200
    assert _upload(db, media).status == UploadStatus.uploaded


def test_a_picture_an_issue_shows_stays_when_it_is_no_longer_offered(
    client_for: Clients, moderator: User, storage: Any, db: Session
) -> None:
    rep = client_for(moderator)
    media = picture(rep, storage)
    data = seed()
    data["pictures"].append(offering(media))
    assert rep.put(SETTINGS, json={"version": 0, "data": data}).status_code == 200
    issue_id = rep.post(ISSUES, json=issue(art=media)).json()["id"]
    assert rep.put(SETTINGS, json={"version": 1, "data": seed()}).status_code == 200
    up = _upload(db, media)
    assert (up.status, str(up.newsletter_issue_id)) == (UploadStatus.attached, issue_id)


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda d, _: d.update(masthead=" "), "data.masthead"),
        (lambda d, _: d["pictures"].append(dict(d["pictures"][0], id="again")), "data"),
        (lambda d, _: d["pictures"].append(offering("https://example.com/photo.jpg")), "data.pictures.3.src"),
        (lambda d, forum: d["pictures"].append(offering(forum)), "data.pictures.3.src"),
        (lambda d, _: d["pictures"][0].update(width=0), "data.pictures.0.width"),
    ],
)
def test_the_settings_are_checked(
    client_for: Clients,
    moderator: User,
    storage: Any,
    change: Callable[[dict[str, Any], str], None],
    field: str,
) -> None:
    rep = client_for(moderator)
    forum_id = upload(rep, storage, purpose="forum_image", name="photo.png", content_type="image/png", body=PNG)
    forum = f"/api/v1/media/{forum_id}"
    data = seed()
    change(data, forum)
    assert field in fields(rep.put(SETTINGS, json={"version": 0, "data": data}))
