"""Newsletter pictures: people who manage the newsletter upload an issue's cover art and figures; an issue shows only
checked newsletter pictures, with alt text; /media shows them to everyone once a published issue does; pictures an
issue stops showing are released for the sweep."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Upload, UploadStatus, User
from app.schemas.newsletter import ALT_RULE
from app.services.newsletter_images import NOT_A_PICTURE
from tests.content.conftest import API, PNG
from tests.core.helpers import image, upload

Clients = Callable[..., TestClient]
MakeUser = Callable[..., User]
ISSUES = f"{API}/newsletter/issues"
NEWSLETTER_PNG = {"purpose": "newsletter_image", "fileName": "cover.png", "contentType": "image/png", "sizeBytes": 64}


def picture(c: TestClient, storage: Any) -> str:
    """A newsletter picture uploaded by the signed-in person: -> its /api/v1/media path."""
    upload_id = upload(c, storage, purpose="newsletter_image", name="cover.png", content_type="image/png", body=PNG)
    return f"/api/v1/media/{upload_id}"


def issue(slug: str = "pictures", *, art: str | None = None, figure: str | None = None) -> dict[str, Any]:
    cover: dict[str, Any] = {"tone": "navy"}
    if art is not None:
        cover |= {"art": art, "artAlt": "A desk with an open notebook"}
    section: dict[str, Any] = {"id": "a", "title": "A story"}
    if figure is not None:
        section["figure"] = {"src": figure, "width": 4, "height": 3, "alt": "The study room"}
    return {"slug": slug, "number": 3, "title": "Pictures", "date": "2026-10-20", "cover": cover, "sections": [section]}


def _upload(db: Session, media: str) -> Upload:
    up = db.get(Upload, uuid.UUID(media.rsplit("/", 1)[-1]), populate_existing=True)
    assert up is not None
    return up


def _status(c: TestClient, media: str) -> int:
    return int(c.get(media, follow_redirects=False).status_code)


def _fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


def test_only_people_who_manage_the_newsletter_upload_its_pictures(
    client_for: Clients, student: User, moderator: User, storage: Any, db: Session, set_feature: Callable[..., None]
) -> None:
    assert client_for(student).post(f"{API}/uploads", json=NEWSLETTER_PNG).status_code == 403
    assert client_for().post(f"{API}/uploads", json=NEWSLETTER_PNG).status_code == 401
    gif = {**NEWSLETTER_PNG, "fileName": "a.gif", "contentType": "image/gif"}
    r = client_for(moderator).post(f"{API}/uploads", json=gif)
    assert (r.status_code, r.json()["error"]["code"]) == (422, "unsupported_type")
    media = picture(client_for(moderator), storage)
    assert _upload(db, media).storage_key.startswith("newsletter/")
    set_feature("newsletter", "off")
    r = client_for(moderator).post(f"{API}/uploads", json=NEWSLETTER_PNG)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")


def test_an_issue_attaches_its_pictures_and_shows_them_once_published(
    client_for: Clients, student: User, moderator: User, make_user: MakeUser, storage: Any, db: Session
) -> None:
    rep = client_for(moderator)
    art, fig = picture(rep, storage), picture(rep, storage)
    r = rep.post(ISSUES, json=issue(art=art, figure=fig))
    assert r.status_code == 201, r.text
    issue_id = uuid.UUID(r.json()["id"])
    assert r.json()["cover"]["artAlt"] == "A desk with an open notebook"
    for media in (art, fig):
        up = _upload(db, media)
        assert (up.status, up.newsletter_issue_id) == (UploadStatus.attached, issue_id)

    other_manager = client_for(make_user(name="Hawra Editor", roles=("student", "newsletter-manager")))
    for viewer, seen in ((client_for(), 404), (client_for(student), 404), (other_manager, 302), (rep, 302)):
        assert _status(viewer, art) == seen  # a draft's pictures: its editors only
    assert rep.post(f"{ISSUES}/{issue_id}/publish").status_code == 200
    for media in (art, fig):
        assert _status(client_for(), media) == 302
        assert _status(client_for(student), media) == 302


def test_a_published_issues_pictures_follow_the_newsletter_switch(
    client_for: Clients, moderator: User, storage: Any, set_feature: Callable[..., None]
) -> None:
    rep = client_for(moderator)
    art = picture(rep, storage)
    issue_id = rep.post(ISSUES, json=issue(art=art)).json()["id"]
    rep.post(f"{ISSUES}/{issue_id}/publish")
    set_feature("newsletter", "off")
    r = client_for().get(art, follow_redirects=False)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")


def test_an_issue_shows_only_checked_newsletter_pictures(client_for: Clients, moderator: User, storage: Any) -> None:
    rep = client_for(moderator)
    forum_picture = image(rep, storage)
    unknown = f"/api/v1/media/{uuid.uuid4()}"
    pending = rep.post(f"{API}/uploads", json=NEWSLETTER_PNG).json()["uploadId"]
    for bad in (forum_picture, unknown, f"/api/v1/media/{pending}"):
        assert _fields(rep.post(ISSUES, json=issue(art=bad))) == {"cover.art": NOT_A_PICTURE}
        assert _fields(rep.post(ISSUES, json=issue(figure=bad))) == {"sections.0.figure.src": NOT_A_PICTURE}
    ok = rep.post(ISSUES, json=issue())
    assert ok.status_code == 201
    r = rep.patch(f"{ISSUES}/{ok.json()['id']}", json={"cover": {"art": forum_picture, "artAlt": "A graph"}})
    assert _fields(r) == {"cover.art": NOT_A_PICTURE}


def test_pictures_need_alt_text(client_for: Clients, moderator: User) -> None:
    rep = client_for(moderator)
    no_alt = issue()
    no_alt["cover"] = {"art": "brand/newsletter-cover.jpg"}
    assert _fields(rep.post(ISSUES, json=no_alt)) == {"cover.artAlt": ALT_RULE}
    no_alt["cover"]["artAlt"] = "   "
    assert _fields(rep.post(ISSUES, json=no_alt)) == {"cover.artAlt": ALT_RULE}
    blank = issue(figure="brand/newsletter-cover.jpg")
    blank["sections"][0]["figure"]["alt"] = "  "
    assert _fields(rep.post(ISSUES, json=blank)) == {"sections.0.figure.alt": ALT_RULE}
    del blank["sections"][0]["figure"]["alt"]
    assert set(_fields(rep.post(ISSUES, json=blank))) == {"sections.0.figure.alt"}
    long = issue(art="brand/newsletter-cover.jpg")
    long["cover"]["artAlt"] = "x" * 301
    assert set(_fields(rep.post(ISSUES, json=long))) == {"cover.artAlt"}


def test_pictures_an_issue_stops_showing_are_released(
    client_for: Clients, moderator: User, storage: Any, db: Session
) -> None:
    rep = client_for(moderator)
    kept, dropped = picture(rep, storage), picture(rep, storage)
    issue_id = rep.post(ISSUES, json=issue(art=kept, figure=dropped)).json()["id"]
    r = rep.patch(f"{ISSUES}/{issue_id}", json={"sections": [{"id": "a", "title": "A story"}]})
    assert r.status_code == 200, r.text
    assert (_upload(db, kept).status, _upload(db, kept).newsletter_issue_id) == (
        UploadStatus.attached,
        uuid.UUID(issue_id),
    )
    assert (_upload(db, dropped).status, _upload(db, dropped).newsletter_issue_id) == (UploadStatus.uploaded, None)
    r = rep.patch(f"{ISSUES}/{issue_id}", json={"title": "Pictures, again"})  # pictures untouched: still attached
    assert _upload(db, kept).status == UploadStatus.attached


def test_a_picture_two_issues_show_moves_to_the_other_when_one_lets_go(
    client_for: Clients, moderator: User, storage: Any, db: Session
) -> None:
    rep = client_for(moderator)
    shared = picture(rep, storage)
    first = rep.post(ISSUES, json=issue("first", art=shared)).json()["id"]
    second = rep.post(ISSUES, json=issue("second", figure=shared)).json()["id"]
    assert _upload(db, shared).newsletter_issue_id == uuid.UUID(second)  # the issue saved last
    assert rep.delete(f"{ISSUES}/{second}").status_code == 204
    up = _upload(db, shared)
    assert (up.status, up.newsletter_issue_id) == (UploadStatus.attached, uuid.UUID(first))
    assert rep.delete(f"{ISSUES}/{first}").status_code == 204
    up = _upload(db, shared)
    assert (up.status, up.newsletter_issue_id) == (UploadStatus.uploaded, None)
