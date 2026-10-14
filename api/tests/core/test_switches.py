"""Feature switches. A feature that is off doesn't exist for guests or students:
- its routes answer 404 feature_off, its feeds and pictures too;
- people can't upload or report into it, and its reports and numbers leave the moderators' screens;
- /me and /features leave it out.

Admins see every feature. "Some roles" shows it to those roles only, and to nobody suspended. Every route declares
its feature, or is on the reviewed list of routes that have none."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.security import feature_of
from app.main import create_app
from app.models import FeatureSwitch, User, UserStatus
from app.services import access
from tests.core.helpers import API, PDF, PNG, image, new_reply, new_thread, share_pdf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
NOTHING = uuid.UUID(int=1)
ADMIN = ("student", "admin")
PDF_UPLOAD = {"purpose": "library", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)}
PNG_UPLOAD = {"purpose": "forum_image", "fileName": "graph.png", "contentType": "image/png", "sizeBytes": len(PNG)}

SWITCHED: list[tuple[str, str, str]] = [
    ("forum", "GET", "/forum/threads"),
    ("forum", "GET", "/forum/meta"),
    ("forum", "GET", "/forum/stats"),
    ("forum", "GET", f"/forum/threads/{NOTHING}"),
    ("forum", "POST", "/forum/threads"),
    ("forum.follow", "PUT", f"/forum/threads/{NOTHING}/follow"),
    ("forum", "GET", f"/media/{NOTHING}"),
    ("library", "GET", "/library/items"),
    ("library", "GET", "/library/facets"),
    ("library", "GET", f"/library/items/{NOTHING}/download"),
    ("library", "GET", f"/library/items/{NOTHING}/file"),
    ("newsletter", "GET", "/newsletter/issues"),
    ("newsletter", "GET", f"/newsletter/issues/{NOTHING}"),
    ("newsletter", "POST", "/newsletter/issues"),
    ("newsletter.polls", "PUT", f"/newsletter/issues/{NOTHING}/polls/p/vote"),
    ("calendar", "GET", "/calendar/events"),
    ("calendar", "GET", "/calendar/upcoming"),
    ("calendar", "GET", "/calendar/feed.ics"),
    ("calendar", "GET", f"/calendar/events/{NOTHING}.ics"),
    ("calendar", "POST", "/calendar/events"),
    ("career", "GET", "/career"),
    ("career", "PUT", "/career"),
    ("career.seniors", "GET", "/career/seniors"),
    ("career.seniors", "PUT", "/career/seniors/me"),
    ("notes", "GET", "/notes"),
    ("notes", "POST", "/notes"),
    ("notes", "GET", f"/notes/{NOTHING}"),
    ("board", "GET", "/board"),
    ("board", "POST", "/board/cards"),
    ("requests", "GET", "/requests"),
    ("requests", "GET", f"/requests/{NOTHING}"),
    ("requests", "POST", "/requests"),
    ("noora.ai", "GET", "/noora/status"),
    ("noora.ai", "POST", "/noora/ask"),
    ("noora.ai", "GET", "/admin/noora"),
]
# Features that arrive switched off (the migrations' switches): the tests switch them on first.
OFF_AT_FIRST = (
    "notes",
    "board",
    "requests",
    "noora.ai",
    "forum.anonymous",
    "forum.follow",
    "newsletter.polls",
    "career.seniors",
)

# Routes with no feature of their own: the hub itself (spec, "Features without a switch"). A path here covers the
# paths below it.
FEATURE_FREE: dict[str, str] = {
    "/health": "the API's liveness",
    "/auth": "signing in and out",
    "/me": "your account, its sessions and your lesson progress",
    "/notifications": "notifications: one into a switched-off feature still lists, and opens the switched-off page",
    "/admin/users": "the people list, and people's roles",
    "/admin/roles": "roles, on the Access screen",
    "/admin/features": "the switches themselves",
    "/admin/audit": "the audit log",
    "/modules": "modules and lessons; their library counts follow the library's switch",
    "/content/modules": "editing modules and lessons: a manager power, gated by its box",
    "/search": "the hub's search",
    "/features": "which features are on",
}
# Routes whose feature depends on the request: they check it in code, and the tests below prove it.
DECIDED_BY_REQUEST: dict[tuple[str, str], str] = {
    ("POST", "/uploads"): "a forum picture needs the forum; a library file needs the library and its uploads",
    ("POST", "/uploads/{upload_id}/complete"): "as POST /uploads, by the upload's purpose",
    ("POST", "/reports"): "a post needs the forum; a library file needs the library",
    ("GET", "/admin/reports"): "lists the reports of the features on for the viewer",
    ("POST", "/admin/reports/{report_id}/resolve"): "resolves the reports of the features on for the viewer",
    ("GET", "/admin/stats"): "counts the features on for the viewer",
}
# Where each feature's routes live: a route under one of these paths must declare that feature.
AREAS: dict[str, Feature] = {
    "/board": Feature.board,
    "/forum": Feature.forum,
    "/media": Feature.forum,
    "/library": Feature.library,
    "/newsletter": Feature.newsletter,
    "/calendar": Feature.calendar,
    "/career": Feature.career,
    "/notes": Feature.notes,
    "/requests": Feature.requests,
    "/noora": Feature.noora_ai,
    "/admin/noora": Feature.noora_ai,
}


def off(response: Any) -> bool:
    return bool(response.status_code == 404 and response.json()["error"]["code"] == "feature_off")


def under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


def api_routes() -> Iterator[tuple[str, str, Dependant]]:
    """(method, path under /api/v1, the route's dependencies with its routers') for every API route of the app."""
    for route in create_app().routes:
        contexts = getattr(route, "effective_route_contexts", None)
        found: list[Any] = list(contexts()) if contexts else [route] if isinstance(route, APIRoute) else []
        for context in found:
            for method in sorted(context.methods):
                yield method, context.path.removeprefix(API), context.dependant


def declared(dependant: Dependant) -> set[Feature]:
    """The features needs_feature() checks anywhere in a route's dependencies."""
    features: set[Feature] = set()
    stack = [dependant]
    while stack:
        d = stack.pop()
        if d.call is not None and (feature := feature_of(d.call)) is not None:
            features.add(feature)
        stack.extend(d.dependencies)
    return features


def test_every_route_declares_its_feature_or_is_listed_as_having_none() -> None:
    routes = list(api_routes())
    assert len(routes) > 80  # the walk found the routers
    undeclared, misplaced = [], []
    for method, path, dependant in routes:
        features = declared(dependant)
        listed = any(under(path, p) for p in FEATURE_FREE) or (method, path) in DECIDED_BY_REQUEST
        if bool(features) == listed:
            undeclared.append(f"{method} {path}: declares {sorted(features)}, listed: {listed}")
        area = next((f for prefix, f in AREAS.items() if under(path, prefix)), None)
        if area is not None and area not in features:
            misplaced.append(f"{method} {path}: declares {sorted(features)}, its area is {area}")
    assert undeclared == [], "declare the route's feature with needs_feature(), or list it here as having none"
    assert misplaced == []
    paths = {(m, p) for m, p, _ in routes}
    assert set(DECIDED_BY_REQUEST) <= paths, "a route listed here no longer exists"
    assert all(any(under(p, prefix) for _, p in paths) for prefix in FEATURE_FREE), "a listed path no longer exists"


@pytest.mark.parametrize(("feature", "method", "path"), SWITCHED, ids=[f"{f}: {m} {p}" for f, m, p in SWITCHED])
def test_a_switched_off_feature_is_gone_except_for_admins(
    feature: str,
    method: str,
    path: str,
    client_for: ClientFor,
    make_user: MakeUser,
    set_feature: Callable[..., None],
) -> None:
    body: dict[str, Any] | None = {} if method in ("POST", "PUT") else None
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=ADMIN)
    if feature in OFF_AT_FIRST:
        set_feature(feature, "everyone")
    assert not off(client_for(student).request(method, f"{API}{path}", json=body))
    set_feature(feature, "off")
    assert off(client_for().request(method, f"{API}{path}", json=body))
    assert off(client_for(student).request(method, f"{API}{path}", json=body))
    assert not off(client_for(boss).request(method, f"{API}{path}", json=body))  # admins see every feature


def test_some_roles_only_and_never_while_suspended(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], db: Session
) -> None:
    student, rep = make_user(name="Sara Student"), make_user(name="Maryam Rep", roles=("student", "rep"))
    set_feature("forum", "roles", ["rep"])
    assert client_for(rep).get(f"{API}/forum/threads").status_code == 200
    assert off(client_for(student).get(f"{API}/forum/threads"))
    rep.status = UserStatus.suspended
    db.commit()
    assert off(client_for(rep).get(f"{API}/forum/threads"))  # suspended: like a guest


def test_a_suspended_admin_sees_only_what_everyone_sees(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], db: Session
) -> None:
    boss = make_user(name="Head Admin", roles=ADMIN)
    set_feature("forum", "off")
    assert client_for(boss).get(f"{API}/forum/threads").status_code == 200
    boss.status = UserStatus.suspended
    db.commit()
    assert off(client_for(boss).get(f"{API}/forum/threads"))
    assert "forum" not in client_for(boss).get(f"{API}/me").json()["features"]


def test_switching_off_uploads_leaves_the_library_readable(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], storage: Any
) -> None:
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=ADMIN)
    published = share_pdf(client_for(boss), storage, title="Published notes")
    set_feature("library.uploads", "off")
    assert off(client_for(student).post(f"{API}/uploads", json=PDF_UPLOAD))
    assert off(client_for(student).post(f"{API}/library/items", json={}))
    assert client_for(student).get(f"{API}/library/items/{published['slug']}").status_code == 200
    assert client_for(student).post(f"{API}/uploads", json=PNG_UPLOAD).status_code == 201  # forum pictures still go
    assert client_for(boss).post(f"{API}/uploads", json=PDF_UPLOAD).status_code == 201


def test_an_upload_started_before_the_switch_cant_be_completed(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], storage: Any
) -> None:
    student = client_for(make_user(name="Sara Student"))
    started = {}
    for body, content in ((PDF_UPLOAD, PDF), (PNG_UPLOAD, PNG)):
        r = student.post(f"{API}/uploads", json=body)
        assert r.status_code == 201, r.text
        key = r.json()["fields"]["key"]
        storage.client.put_object(Bucket=storage.bucket, Key=key, Body=content, ContentType=body["contentType"])
        started[body["purpose"]] = r.json()["uploadId"]
    set_feature("library.uploads", "off")
    set_feature("forum", "off")
    assert off(student.post(f"{API}/uploads/{started['library']}/complete"))
    assert off(student.post(f"{API}/uploads/{started['forum_image']}/complete"))
    set_feature("forum", "everyone")
    assert student.post(f"{API}/uploads/{started['forum_image']}/complete").status_code == 200


def test_forum_pictures_and_reports_follow_their_feature(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], storage: Any
) -> None:
    student = make_user(name="Sara Student")
    path = image(client_for(student), storage)  # its uploader can see it before it's posted
    t = new_thread(client_for(make_user(name="Omar Classmate")), "Report me later")
    assert client_for(student).get(path, follow_redirects=False).status_code == 302
    set_feature("forum", "off")
    assert off(client_for(student).get(path, follow_redirects=False))
    assert off(client_for(student).post(f"{API}/uploads", json=PNG_UPLOAD))
    report = {"targetType": "thread", "targetId": t["id"], "reason": "spam"}
    assert off(client_for(student).post(f"{API}/reports", json=report))


def test_library_reports_follow_the_library(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], storage: Any
) -> None:
    item = share_pdf(client_for(make_user(name="Head Admin", roles=ADMIN)), storage)
    set_feature("library", "off")
    report = {"targetType": "library_item", "targetId": item["id"], "reason": "spam"}
    assert off(client_for(make_user(name="Sara Student")).post(f"{API}/reports", json=report))


def test_the_reports_queue_and_the_numbers_follow_the_switches(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], storage: Any
) -> None:
    rep, boss = make_user(name="Maryam Rep", roles=("rep",)), make_user(name="Head Admin", roles=ADMIN)
    reporter = client_for(make_user(name="Sara Student"))
    t = new_thread(client_for(make_user(name="Omar Classmate")), "A thread to report")
    item = share_pdf(client_for(boss), storage)
    for target_type, target_id in (("thread", t["id"]), ("library_item", item["id"])):
        r = reporter.post(f"{API}/reports", json={"targetType": target_type, "targetId": target_id, "reason": "spam"})
        assert r.status_code == 204, r.text
    queue = client_for(rep).get(f"{API}/admin/reports").json()["items"]
    forum_report = next(r["id"] for r in queue if r["targetType"] == "thread")
    set_feature("forum", "off")

    queue = client_for(rep).get(f"{API}/admin/reports").json()
    assert [r["targetType"] for r in queue["items"]] == ["library_item"]
    assert queue["total"] == 1
    resolve = client_for(rep).post(f"{API}/admin/reports/{forum_report}/resolve", json={"status": "dismissed"})
    assert resolve.status_code == 404
    numbers = client_for(rep).get(f"{API}/admin/stats").json()
    assert (numbers["threads"], numbers["replies"], numbers["openReports"]) == (None, None, 1)
    assert numbers["libraryItems"] == 1

    everything = client_for(boss).get(f"{API}/admin/stats").json()  # admins see every feature
    assert (everything["threads"], everything["openReports"]) == (1, 2)
    assert len(client_for(boss).get(f"{API}/admin/reports").json()["items"]) == 2
    set_feature("library", "off")
    numbers = client_for(rep).get(f"{API}/admin/stats").json()
    assert (numbers["libraryItems"], numbers["pendingUploads"], numbers["openReports"]) == (None, None, 0)


def test_a_notification_into_a_switched_off_feature_still_lists(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    student = make_user(name="Sara Student")
    t = new_thread(client_for(student), "Before the switch")
    new_reply(client_for(make_user(name="Replier")), t["id"], "An answer before the switch")
    set_feature("forum", "off")
    links = [n["url"] for n in client_for(student).get(f"{API}/notifications").json()["items"]]
    assert any(link and link.startswith(f"/forum/{t['slug']}") for link in links)
    assert off(client_for(student).get(f"{API}/forum/threads/{t['slug']}"))


def test_me_and_features_list_what_is_on(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], db: Session
) -> None:
    everything = [f.value for f in Feature if f not in OFF_AT_FIRST]
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=ADMIN)
    assert client_for(student).get(f"{API}/me").json()["features"] == everything
    assert client_for().get(f"{API}/features").json() == {"features": everything}
    set_feature("calendar", "off")
    without_calendar = [f for f in everything if f != "calendar"]
    assert client_for(student).get(f"{API}/me").json()["features"] == without_calendar
    assert client_for(student).get(f"{API}/features").json() == {"features": without_calendar}
    assert client_for().get(f"{API}/features").json() == {"features": without_calendar}
    assert client_for(boss).get(f"{API}/me").json()["features"] == [f.value for f in Feature]
    db.add(FeatureSwitch(feature="teleport", mode="everyone"))  # a key the code doesn't know
    db.commit()
    access.forget(db)
    assert client_for().get(f"{API}/features").json() == {"features": without_calendar}


def test_some_roles_switches_list_for_their_roles_only(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    manager = make_user(name="Nadia Manager", roles=("student", "content-manager"))
    set_feature("calendar", "roles", ["content-manager"])
    assert "calendar" in client_for(manager).get(f"{API}/me").json()["features"]
    assert "calendar" not in client_for(make_user(name="Sara Student")).get(f"{API}/me").json()["features"]
    assert "calendar" not in client_for().get(f"{API}/features").json()["features"]
    set_feature("calendar", "everyone", ["content-manager"])  # the roles count only for "Some roles"
    set_feature("calendar", "roles")
    assert "calendar" not in client_for(manager).get(f"{API}/me").json()["features"]
