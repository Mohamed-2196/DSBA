"""Editing modules and lessons (R-9): content managers add, edit, reorder, hide and remove them; what refers to a
lesson keeps pointing at it by id; two editors never overwrite each other; the seed never overwrites what they did."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, BoardCard, Lesson, LessonResume, LessonView, Module, Note, User
from app.seed.loader import load_modules
from app.services.module_editor import Video, parse_video, video_link
from tests.content.conftest import API
from tests.lessons import chapters, lesson_id

Clients = Callable[..., TestClient]


def yt(ident: str) -> dict[str, Any]:
    return {"kind": "youtube", "video_id": ident, "title": f"Video {ident}"}


@pytest.fixture
def manager(make_user: Callable[..., User]) -> User:
    return make_user(name="Hana Content", roles=("student", "content-manager"), year=None)


@pytest.fixture
def module(db: Session) -> Module:
    """Two chapters: One with lessons a and b, Two with c."""
    mid = f"edit-mod-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=mid,
        unit_code="TS1001",
        name="Test module",
        short_name="Test",
        year=1,
        description="",
        position=100,
        resources={},
        chapters=chapters(
            mid,
            [
                {"title": "One", "videos": [yt("aaaaaaaaaaa"), yt("bbbbbbbbbbb")]},
                {"title": "Two", "videos": [yt("ccccccccccc")]},
            ],
        ),
    )
    m.chapters[0].audio_url = "https://example.com/one.mp3"
    db.add(m)
    db.commit()
    return m


def load(c: TestClient, module_id: str) -> dict[str, Any]:
    r = c.get(f"{API}/content/modules/{module_id}")
    assert r.status_code == 200, r.text
    out: dict[str, Any] = r.json()
    return out


def save(c: TestClient, module_id: str, body: dict[str, Any], status: int = 200) -> dict[str, Any]:
    r = c.put(f"{API}/content/modules/{module_id}", json=body)
    assert r.status_code == status, r.text
    out: dict[str, Any] = r.json()
    return out


def public_ids(c: TestClient, module_id: str) -> list[list[str]]:
    """The YouTube ids students see, by chapter."""
    detail = c.get(f"{API}/modules/{module_id}").json()
    return [[v["videoId"] for v in ch["videos"]] for ch in detail["chapters"]]


# ── video links ──────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", Video("youtube", video_id="dQw4w9WgXcQ")),
        ("https://youtu.be/dQw4w9WgXcQ?t=10", Video("youtube", video_id="dQw4w9WgXcQ")),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ", Video("youtube", video_id="dQw4w9WgXcQ")),
        ("https://m.youtube.com/shorts/dQw4w9WgXcQ", Video("youtube", video_id="dQw4w9WgXcQ")),
        (
            "https://www.youtube.com/playlist?list=PL_o_l6j2TdmhF9DN-n3IIq5fTFmMTT14y",
            Video("youtube-playlist", video_id="PL_o_l6j2TdmhF9DN-n3IIq5fTFmMTT14y"),
        ),
        (
            "https://vc.bibf.com/playback/presentation/2.3/abc",
            Video("bbb", url="https://vc.bibf.com/playback/presentation/2.3/abc"),
        ),
        ("http://www.youtube.com/watch?v=dQw4w9WgXcQ", None),
        ("https://evil.example.com/watch?v=dQw4w9WgXcQ", None),
        ("https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ", None),
        ("https://user:pw@vc.bibf.com/x", None),
        ("javascript:alert(1)", None),
        ("https://www.youtube.com/watch?v=<script>", None),
        ("https://vc.bibf.com.example.com/x", None),
    ],
)
def test_only_videos_the_app_embeds(url: str, expected: Video | None) -> None:
    assert parse_video(url) == expected


def test_a_stored_video_reads_back_as_the_same_link() -> None:
    for kind, ident in (("youtube", "dQw4w9WgXcQ"), ("youtube-playlist", "PL_o_l6j2TdmhF9DN-n3IIq5fTFmMTT14y")):
        parsed = parse_video(video_link(Lesson(kind=kind, video_id=ident)))
        assert parsed == Video(kind, video_id=ident)


# ── access and reading ───────────────────────────────────────────────────────────────────────


def test_only_content_editors_edit(client_for: Clients, module: Module, make_user: Callable[..., User]) -> None:
    rep = client_for(make_user(name="Maryam Rep", roles=("student", "rep")))
    r = rep.get(f"{API}/content/modules")
    assert r.status_code == 403
    assert r.json()["error"]["message"] == "Only people who edit modules and lessons can do this."
    admin = client_for(make_user(name="Ali Admin", roles=("student", "admin")))
    assert admin.get(f"{API}/content/modules").status_code == 200


def test_the_editor_sees_everything_with_ids(client_for: Clients, manager: User, module: Module) -> None:
    c = client_for(manager)
    listed = next(m for m in c.get(f"{API}/content/modules").json() if m["id"] == module.id)
    assert (listed["version"], listed["hidden"], listed["chapterCount"], listed["lessonCount"]) == (1, False, 2, 3)
    m = load(c, module.id)
    assert [ch["id"] for ch in m["chapters"]] == [ch.id for ch in module.chapters]
    first = m["chapters"][0]["lessons"][1]
    assert first == {
        "id": lesson_id(module, 0, 1),
        "kind": "youtube",
        "url": "https://www.youtube.com/watch?v=bbbbbbbbbbb",
        "title": "Video bbbbbbbbbbb",
        "channel": None,
        "hidden": False,
    }


# ── create, edit, version ────────────────────────────────────────────────────────────────────


def test_create_edit_and_audit(client_for: Clients, manager: User, db: Session) -> None:
    c = client_for(manager)
    body = {"id": "data-ethics", "unitCode": "is3001", "name": "Data ethics", "shortName": "Ethics", "year": 3}
    r = c.post(f"{API}/content/modules", json=body)
    assert r.status_code == 201, r.text
    made = r.json()
    assert (made["unitCode"], made["version"], made["chapters"]) == ("IS3001", 1, [])
    assert c.post(f"{API}/content/modules", json=body).json()["error"]["code"] == "slug_taken"
    taken = c.post(f"{API}/content/modules", json={**body, "id": "data-ethics-2"})
    assert taken.status_code == 422
    assert "unitCode" in taken.json()["error"]["fields"]
    bad = c.post(f"{API}/content/modules", json={**body, "id": "Data Ethics!"})
    assert bad.status_code == 422

    saved = save(
        c,
        "data-ethics",
        {
            **{k: v for k, v in body.items() if k != "id"},
            "version": 1,
            "description": "**Fairness**, privacy and $p$-values.",
            "resources": {"materials": "https://drive.google.com/drive/folders/x"},
            "chapters": [{"title": "Fairness", "lessons": [{"url": "https://youtu.be/dQw4w9WgXcQ", "title": "Intro"}]}],
        },
    )
    assert saved["version"] == 2
    assert saved["resources"]["materials"] == "https://drive.google.com/drive/folders/x"
    public = c.get(f"{API}/modules/data-ethics").json()
    chapter, lesson = saved["chapters"][0], saved["chapters"][0]["lessons"][0]
    assert len(chapter["id"]) == len(lesson["id"]) == 8
    assert public["chapters"] == [
        {
            "id": chapter["id"],
            "title": "Fairness",
            "audioUrl": None,
            "videos": [
                {
                    "id": lesson["id"],
                    "kind": "youtube",
                    "videoId": "dQw4w9WgXcQ",
                    "url": None,
                    "title": "Intro",
                    "channel": None,
                    "unavailable": False,
                }
            ],
        }
    ]
    actions = [e.action for e in db.scalars(select(AuditEntry).where(AuditEntry.target_id == "data-ethics"))]
    assert sorted(actions) == ["module.create", "module.update"]
    update = db.scalar(select(AuditEntry).where(AuditEntry.action == "module.update"))
    assert update is not None
    assert update.data["before"]["description"] == ""
    assert update.data["after"]["description"].startswith("**Fairness**")
    assert "name" not in update.data["after"]  # only what changed


def test_a_stale_version_is_refused(client_for: Clients, manager: User, module: Module) -> None:
    one, two = client_for(manager), client_for(manager)
    a, b = load(one, module.id), load(two, module.id)
    save(one, module.id, {**a, "name": "First editor"})
    r = two.put(f"{API}/content/modules/{module.id}", json={**b, "name": "Second editor"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "module_changed"
    assert load(two, module.id)["name"] == "First editor"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("url", "https://evil.example.com/video"),
        ("url", "http://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ],
)
def test_unsafe_videos_are_refused(client_for: Clients, manager: User, module: Module, field: str, value: str) -> None:
    c = client_for(manager)
    m = load(c, module.id)
    m["chapters"][1]["lessons"][0][field] = value
    r = c.put(f"{API}/content/modules/{module.id}", json=m)
    assert r.status_code == 422
    assert "chapters.1.lessons.0.url" in r.json()["error"]["fields"]


def test_resources_must_be_https(client_for: Clients, manager: User, module: Module) -> None:
    c = client_for(manager)
    m = load(c, module.id)
    r = c.put(f"{API}/content/modules/{module.id}", json={**m, "resources": {"vle": "javascript:alert(1)"}})
    assert r.status_code == 422


# ── moving lessons: what refers to them stays with them ─────────────────────────────────────


def test_moves_keep_progress_notes_and_cards(
    client_for: Clients, manager: User, student: User, module: Module, db: Session, set_feature: Callable[..., None]
) -> None:
    set_feature("notes", "everyone")
    set_feature("board", "everyone")
    s = client_for(student)
    mid = module.id
    a, b, c_ = lesson_id(module, 0, 0), lesson_id(module, 0, 1), lesson_id(module, 1, 0)
    for lesson in (a, c_):
        assert s.put(f"{API}/me/progress/lessons/{lesson}", json={"watched": True}).status_code == 200
    assert s.put(f"{API}/me/progress/resume", json={"lessonId": b}).status_code == 200
    note = s.post(f"{API}/notes", json={"title": "On b", "moduleId": mid, "lessonId": b})
    assert note.status_code == 201, note.text
    for lesson in (a, b):
        assert s.post(f"{API}/board-cards", json={"link": {"type": "lesson", "id": lesson}}).status_code == 201

    c = client_for(manager)
    m = load(c, mid)
    one, two = m["chapters"]
    la, lb = one["lessons"]
    # swap a and b, move c into chapter One first, and put chapter Two (now empty) first
    one["lessons"] = [two["lessons"][0], lb, la]
    two["lessons"] = []
    saved = save(c, mid, {**m, "chapters": [two, one]})

    assert [[v["id"] for v in ch["lessons"]] for ch in saved["chapters"]] == [[], [c_, b, a]]
    assert public_ids(s, mid) == [[], ["ccccccccccc", "bbbbbbbbbbb", "aaaaaaaaaaa"]]
    watched = set(db.scalars(select(LessonView.lesson_id).where(LessonView.user_id == student.id)))
    assert watched == {a, c_}
    resume = db.get(LessonResume, (student.id, mid))
    assert resume is not None
    assert resume.lesson_id == b
    stored = db.scalar(select(Note).where(Note.user_id == student.id))
    assert stored is not None
    assert stored.lesson_id == b
    cards = {x.title: x.lesson_id for x in db.scalars(select(BoardCard).where(BoardCard.user_id == student.id))}
    assert cards == {"Test: Video aaaaaaaaaaa": a, "Test: Video bbbbbbbbbbb": b}
    first = s.get(f"{API}/boards").json()["boards"][0]["id"]
    board = s.get(f"{API}/boards/{first}").json()["cards"]
    assert {x["link"]["url"] for x in board} == {f"/modules/{mid}/lessons/{a}", f"/modules/{mid}/lessons/{b}"}
    db.expire_all()
    now = db.get(Module, mid)
    assert now is not None
    assert now.chapters[1].audio_url == "https://example.com/one.mp3"


def test_hiding_takes_lessons_out_of_view_and_back(
    client_for: Clients, manager: User, student: User, module: Module, db: Session, set_feature: Callable[..., None]
) -> None:
    set_feature("notes", "everyone")
    s = client_for(student)
    mid = module.id
    a, c_ = lesson_id(module, 0, 0), lesson_id(module, 1, 0)
    assert s.put(f"{API}/me/progress/lessons/{c_}", json={"watched": True}).status_code == 200
    note = s.post(f"{API}/notes", json={"title": "On a", "moduleId": mid, "lessonId": a})
    assert note.status_code == 201

    c = client_for(manager)
    m = load(c, mid)
    m["chapters"][0]["hidden"] = True  # chapter One: a and b
    m = save(c, mid, m)
    assert public_ids(s, mid) == [["ccccccccccc"]]
    detail = s.get(f"{API}/modules/{mid}").json()
    assert (detail["chapterCount"], detail["lessonCount"]) == (1, 1)
    assert "hidden" not in detail["chapters"][0]
    assert s.put(f"{API}/me/progress/lessons/{a}", json={"watched": True}).status_code == 404
    # the note keeps its hidden lesson, and still saves
    body = {"title": "On a, again", "notebookId": note.json()["notebookId"], "lessonId": a, "version": 1}
    assert s.put(f"{API}/notes/{note.json()['id']}", json=body).status_code == 200

    m["chapters"][0]["hidden"] = False
    m["chapters"][1]["lessons"][0]["hidden"] = True  # c
    save(c, mid, m)
    assert public_ids(s, mid) == [["aaaaaaaaaaa", "bbbbbbbbbbb"], []]
    assert set(db.scalars(select(LessonView.lesson_id))) == {c_}  # kept while hidden


# ── removing ─────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("what", ["note", "card"])
def test_removing_a_lesson_with_notes_or_cards_is_refused(
    client_for: Clients,
    manager: User,
    student: User,
    module: Module,
    db: Session,
    set_feature: Callable[..., None],
    what: str,
) -> None:
    set_feature("notes", "everyone")
    set_feature("board", "everyone")
    s = client_for(student)
    mid = module.id
    a, b = lesson_id(module, 0, 0), lesson_id(module, 0, 1)
    if what == "note":
        r = s.post(f"{API}/notes", json={"title": "On b", "moduleId": mid, "lessonId": b})
    else:
        r = s.post(f"{API}/board-cards", json={"link": {"type": "lesson", "id": b}})
    assert r.status_code == 201
    assert s.put(f"{API}/me/progress/lessons/{a}", json={"watched": True}).status_code == 200
    assert s.put(f"{API}/me/progress/resume", json={"lessonId": a}).status_code == 200
    c = client_for(manager)
    m = load(c, mid)
    keep_a = {**m, "chapters": [{**m["chapters"][0], "lessons": [m["chapters"][0]["lessons"][0]]}, m["chapters"][1]]}
    r = c.put(f"{API}/content/modules/{mid}", json=keep_a)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "content_in_use"
    assert "Hide the lesson" in r.json()["error"]["message"]

    # a has only progress: it may go, and its progress with it
    keep_b = {**m, "chapters": [{**m["chapters"][0], "lessons": [m["chapters"][0]["lessons"][1]]}, m["chapters"][1]]}
    save(c, mid, keep_b)
    db.expire_all()
    assert db.get(Lesson, a) is None
    assert set(db.scalars(select(LessonView.lesson_id).where(LessonView.user_id == student.id))) == set()
    assert db.get(LessonResume, (student.id, mid)) is None


def test_removing_a_chapter_with_lessons_is_refused(client_for: Clients, manager: User, module: Module) -> None:
    c = client_for(manager)
    m = load(c, module.id)
    r = c.put(f"{API}/content/modules/{module.id}", json={**m, "chapters": [m["chapters"][0]]})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "content_in_use"
    assert "“Two” still has lessons" in r.json()["error"]["message"]
    # moving its lessons out first lets it go
    one, two = m["chapters"]
    one["lessons"].append(two["lessons"][0])
    saved = save(c, module.id, {**m, "chapters": [one]})
    assert [len(ch["lessons"]) for ch in saved["chapters"]] == [3]


@pytest.mark.parametrize("change", ["unknown lesson", "lesson twice", "unknown chapter"])
def test_ids_from_elsewhere_are_refused(client_for: Clients, manager: User, module: Module, change: str) -> None:
    c = client_for(manager)
    m = load(c, module.id)
    if change == "unknown lesson":
        m["chapters"][1]["lessons"][0]["id"] = "zzzzzzzz"
    elif change == "lesson twice":
        m["chapters"][1]["lessons"].append(m["chapters"][0]["lessons"][0])
    else:
        m["chapters"][1]["id"] = "zzzzzzzz"
    r = c.put(f"{API}/content/modules/{module.id}", json=m)
    assert r.json()["error"]["code"] == "module_changed"


def test_hide_or_remove_a_module(
    client_for: Clients, manager: User, module: Module, db: Session, make_user: Callable[..., User]
) -> None:
    c = client_for(manager)
    r = c.delete(f"{API}/content/modules/{module.id}", params={"version": 1})
    assert r.status_code == 409
    assert r.json()["error"] == {
        "code": "content_in_use",
        "message": "“Test module” has 3 lessons. Hide it instead, so students don't see it.",
    }
    m = load(c, module.id)
    save(c, module.id, {**m, "hidden": True})
    guest = client_for()
    assert module.id not in [x["id"] for x in guest.get(f"{API}/modules").json()]
    assert guest.get(f"{API}/modules/{module.id}").status_code == 404
    hits = guest.get(f"{API}/search", params={"q": "Test module", "types": "module"}).json()
    assert module.id not in [h["id"] for h in hits.get("modules", [])]

    empty = c.post(
        f"{API}/content/modules", json={"id": "empty-one", "name": "Empty one", "shortName": "Empty", "year": 2}
    )
    assert empty.status_code == 201
    assert (
        c.delete(f"{API}/content/modules/empty-one", params={"version": 9}).json()["error"]["code"] == "module_changed"
    )
    assert c.delete(f"{API}/content/modules/empty-one", params={"version": 1}).status_code == 204
    assert db.get(Module, "empty-one") is None
    assert db.scalar(select(AuditEntry).where(AuditEntry.action == "module.delete")) is not None


def test_reorder_a_year(client_for: Clients, manager: User, modules: dict[str, Module]) -> None:
    c = client_for(manager)
    year_one = [m["id"] for m in c.get(f"{API}/content/modules").json() if m["year"] == 1]
    flipped = list(reversed(year_one))
    out = c.post(f"{API}/content/modules/reorder", json={"year": 1, "ids": flipped})
    assert out.status_code == 200, out.text
    assert [m["id"] for m in client_for().get(f"{API}/modules", params={"year": 1}).json()] == flipped
    every = [m["id"] for m in client_for().get(f"{API}/modules").json()]
    assert every[: len(flipped)] == flipped  # year one still comes first
    wrong = c.post(f"{API}/content/modules/reorder", json={"year": 1, "ids": flipped[1:]})
    assert wrong.json()["error"]["code"] == "module_changed"


# ── the seed ─────────────────────────────────────────────────────────────────────────────────


def test_the_seed_never_overwrites_modules(
    client_for: Clients, manager: User, modules: dict[str, Module], db: Session
) -> None:
    c = client_for(manager)
    first = next(iter(modules))
    m = load(c, first)
    save(c, first, {**m, "name": "Renamed by a manager"})
    created = c.post(
        f"{API}/content/modules", json={"id": "brand-new", "name": "Brand new", "shortName": "New", "year": 1}
    )
    assert created.status_code == 201
    assert load_modules(db) == 0
    db.commit()
    assert load(c, first)["name"] == "Renamed by a manager"
