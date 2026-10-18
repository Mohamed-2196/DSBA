"""The notebook: notebooks (one per module by default), notes with typed text, ink per sheet, files and PDFs to write
over. Private to their writer, saved with versions, searchable, limited, readable but not writable while suspended,
switched off by default, exported and deleted with the account."""

from __future__ import annotations

import json
import tracemalloc
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import cli
from app.core.time import utcnow
from app.models import LibraryItem, Module, Note, Notebook, NoteInk, Upload, UploadStatus, User, UserStatus
from app.schemas.notes import INK_BODY_MAX, MAX_POINTS, MAX_STROKES, PAPER_SHEETS_FROM, SHEET_MAX_BYTES
from app.services import note_doc
from app.services import notes as svc
from tests.core.helpers import PDF, PNG, share_pdf, upload
from tests.lessons import lesson_id

API = "/api/v1"
JSON_BODY = {"Content-Type": "application/json"}
ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def doc(*paragraphs: str) -> dict[str, Any]:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in paragraphs],
    }


def new_note(c: TestClient, *lines: str, **fields: Any) -> dict[str, Any]:
    body = {"title": "Moments", "doc": doc(*(lines or ("E[X] is the mean",))), **fields}
    r = c.post(f"{API}/notes", json=body)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def save(c: TestClient, note: dict[str, Any], **changes: Any) -> Any:
    keys = ("title", "doc", "paper", "sheets", "lessonId", "notebookId", "version")
    return c.put(f"{API}/notes/{note['id']}", json={k: note[k] for k in keys} | changes)


def stroke(sid: str = "s1", n: int = 3) -> dict[str, Any]:
    points = [v for i in range(n) for v in (10.0 + i, 20.0 + i, 0.5)]
    return {"id": sid, "tool": "pen", "color": "#1f2933", "width": 2.5, "points": points}


def ink(c: TestClient, note: dict[str, Any], sheet: int, strokes: list[dict[str, Any]], version: int) -> Any:
    return c.put(f"{API}/notes/{note['id']}/ink/{sheet}", json={"strokes": strokes, "version": version})


# ── notebooks ────────────────────────────────────────────────────────────────────────────────


def test_notes_go_to_their_modules_notebook_or_my_notebook(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user())
    loose = new_note(c)
    first = new_note(c, moduleId=module.id)
    second = new_note(c, moduleId=module.id, lessonId=lesson_id(module, 0, 1))
    assert first["notebookId"] == second["notebookId"] != loose["notebookId"]
    assert (first["moduleId"], second["lessonId"]) == (module.id, lesson_id(module, 0, 1))
    books = c.get(f"{API}/notebooks").json()
    by_id = {b["id"]: b for b in books["items"]}
    assert by_id[first["notebookId"]]["title"] == "TS1000 Test module"
    assert by_id[first["notebookId"]]["noteCount"] == 2
    assert by_id[loose["notebookId"]]["title"] == "My notebook"
    assert books["items"][0]["id"] == first["notebookId"]  # changed last first
    storage = books["storage"]
    assert 0 < storage["writingBytes"] < storage["writingLimitBytes"] == svc.WRITING_LIMIT
    assert (storage["filesBytes"], storage["filesLimitBytes"]) == (0, svc.FILES_LIMIT)
    # asking for the module's notebook answers the one there is
    again = c.post(f"{API}/notebooks", json={"moduleId": module.id})
    assert (again.status_code, again.json()["id"]) == (201, first["notebookId"])


def test_own_notebooks_rename_move_and_delete(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    c = client_for(make_user())
    assert c.post(f"{API}/notebooks", json={"title": "  "}).status_code == 422
    r = c.post(f"{API}/notebooks", json={"title": "  Revision  plan "})
    assert r.status_code == 201, r.text
    book = r.json()
    assert (book["title"], book["moduleId"], book["noteCount"]) == ("Revision plan", None, 0)
    note = new_note(c, notebookId=book["id"])
    assert note["notebookId"] == book["id"]
    renamed = c.patch(f"{API}/notebooks/{book['id']}", json={"title": "Finals"})
    assert renamed.json()["title"] == "Finals"

    on_lesson = new_note(c, moduleId=module.id, lessonId=lesson_id(module, 0, 0))
    moved = save(c, on_lesson, notebookId=book["id"])  # another notebook: the lesson is let go of
    assert moved.status_code == 200, moved.text
    assert (moved.json()["notebookId"], moved.json()["lessonId"], moved.json()["moduleId"]) == (book["id"], None, None)
    r = save(c, moved.json(), lessonId=lesson_id(module, 0, 0))
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["lessonId"])

    assert c.delete(f"{API}/notebooks/{book['id']}").status_code == 204
    assert c.get(f"{API}/notes/{note['id']}").status_code == 404
    assert c.get(f"{API}/notes/{moved.json()['id']}").status_code == 404
    db.expire_all()
    assert db.get(Notebook, book["id"]) is None


def test_how_many_notebooks(client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch) -> None:
    c = client_for(make_user())
    monkeypatch.setattr(svc, "MAX_NOTEBOOKS", 2)
    assert c.post(f"{API}/notebooks", json={"title": "One"}).status_code == 201
    assert c.post(f"{API}/notebooks", json={"title": "Two"}).status_code == 201
    r = c.post(f"{API}/notebooks", json={"title": "Three"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_notebooks")


# ── notes ────────────────────────────────────────────────────────────────────────────────────


def test_write_read_save_and_delete(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    note = new_note(c, "First line", "Second line", title="  Week  1 ")
    assert (note["title"], note["version"], note["text"], note["paper"], note["sheets"]) == (
        "Week 1",
        1,
        "First line\nSecond line",
        "lined",
        1,
    )
    assert (note["ink"], note["pdf"], note["onPdf"]) == ([], None, False)
    assert c.get(f"{API}/notes/{note['id']}").json() == note
    r = save(c, note, doc=doc("Updated"), paper="grid", sheets=3)
    assert r.status_code == 200, r.text
    assert (r.json()["text"], r.json()["version"], r.json()["paper"], r.json()["sheets"]) == ("Updated", 2, "grid", 3)
    assert save(c, r.json()).json()["version"] == 2  # nothing changed: nothing saved
    assert c.delete(f"{API}/notes/{note['id']}").status_code == 204
    assert c.get(f"{API}/notes/{note['id']}").status_code == 404


def test_rich_text_becomes_plain_text_for_search(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    rich = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Variance"}]},
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Spread ", "marks": [{"type": "bold"}]},
                    {"type": "inlineMath", "attrs": {"latex": "\\sigma^2"}},
                    {"type": "text", "text": " see", "marks": [{"type": "link", "attrs": {"href": "https://x.org"}}]},
                ],
            },
            {
                "type": "taskList",
                "content": [
                    {
                        "type": "taskItem",
                        "attrs": {"checked": True},
                        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Revise"}]}],
                    }
                ],
            },
            {"type": "blockMath", "attrs": {"latex": "E[X^2]-E[X]^2"}},
        ],
    }
    note = new_note(c, doc=rich)
    assert note["text"] == "Variance\nSpread $\\sigma^2$ see\n[x] Revise\n$$E[X^2]-E[X]^2$$"
    found = c.get(f"{API}/notes", params={"q": "sigma"}).json()["items"]
    assert [n["id"] for n in found] == [note["id"]]


@pytest.mark.parametrize(
    "bad",
    [
        {"type": "doc", "content": [{"type": "script", "text": "x"}]},
        {"type": "paragraph"},
        {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": ""}]}]},
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "x", "marks": [{"type": "link", "attrs": {"href": "javascript:1"}}]}
                    ],
                }
            ],
        },
        {"type": "doc", "content": [{"type": "paragraph", "attrs": {"style": {"color": "red"}}}]},
        {"type": "doc", "content": [{"type": "image", "attrs": {"upload": "not-a-uuid"}}]},
    ],
)
def test_text_the_editor_does_not_write_is_refused(
    client_for: ClientFor, make_user: MakeUser, bad: dict[str, Any]
) -> None:
    r = client_for(make_user()).post(f"{API}/notes", json={"doc": bad})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["doc"])


def test_a_save_from_an_older_version_is_refused(client_for: ClientFor, make_user: MakeUser) -> None:
    user = make_user()
    tab_one, tab_two = client_for(user), client_for(user)
    note = new_note(tab_one)
    assert save(tab_one, note, doc=doc("From the first tab")).status_code == 200
    r = save(tab_two, note, doc=doc("From the second tab"))
    assert (r.status_code, r.json()["error"]["code"]) == (409, "note_changed")
    theirs = tab_two.get(f"{API}/notes/{note['id']}").json()
    kept = save(tab_two, theirs, doc=doc("From the second tab"))  # "keep mine": saved over the newer version
    assert (kept.json()["text"], kept.json()["version"]) == ("From the second tab", 3)


def test_notes_are_private(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    owner = client_for(make_user(name="Sara Student"))
    mine = new_note(owner)
    picture = upload(owner, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    book = owner.get(f"{API}/notebooks").json()["items"][0]["id"]
    for other in (make_user(name="Omar Classmate"), make_user(name="Head Admin", roles=("student", "admin"))):
        c = client_for(other)
        assert c.get(f"{API}/notes/{mine['id']}").status_code == 404
        assert save(c, mine, doc=doc("Not yours")).status_code == 404
        assert ink(c, mine, 0, [stroke()], 0).status_code == 404
        assert c.delete(f"{API}/notes/{mine['id']}").status_code == 404
        assert c.get(f"{API}/notes").json()["total"] == 0
        assert c.get(f"{API}/notebooks").json()["items"] == []
        assert c.patch(f"{API}/notebooks/{book}", json={"title": "Mine now"}).status_code == 404
        assert c.delete(f"{API}/notebooks/{book}").status_code == 404
        assert c.get(f"{API}/notes/files/{picture}", follow_redirects=False).status_code == 404
        theirs = c.post(f"{API}/notes", json={"notebookId": book})
        assert theirs.status_code == 404


def test_guests_sign_in_first(client: TestClient) -> None:
    assert client.get(f"{API}/notes").status_code == 401
    assert client.get(f"{API}/notebooks").status_code == 401
    assert client.post(f"{API}/notes", json={}).status_code == 401


def test_list_search_and_filter(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    first = new_note(c, "P(A|B) = P(B|A)P(A)/P(B)", title="Bayes")
    second = new_note(c, "The 100% sure part: variance", title="Lecture", moduleId=module.id)
    lesson = new_note(c, "x" * 1000, title="Video notes", moduleId=module.id, lessonId=lesson_id(module, 0, 1))
    page = c.get(f"{API}/notes").json()
    assert [n["id"] for n in page["items"]] == [lesson["id"], second["id"], first["id"]]  # last edited first
    assert len(page["items"][0]["excerpt"]) == 240
    assert "doc" not in page["items"][0]
    assert save(c, first, doc=doc("Bayes again")).status_code == 200
    assert c.get(f"{API}/notes").json()["items"][0]["id"] == first["id"]

    def ids(**query: Any) -> list[str]:
        return [n["id"] for n in c.get(f"{API}/notes", params=query).json()["items"]]

    assert ids(q="bayes") == [first["id"]]  # the title and the text, any case
    assert ids(q="VARIANCE") == [second["id"]]
    assert ids(q="100%") == [second["id"]]  # wildcards are plain characters
    assert ids(q="_") == []
    assert set(ids(module_id=module.id)) == {second["id"], lesson["id"]}
    assert set(ids(notebook_id=second["notebookId"])) == {second["id"], lesson["id"]}
    assert ids(module_id=module.id, lesson_id=lesson_id(module, 0, 1)) == [lesson["id"]]
    assert ids(limit=1, offset=1) == [lesson["id"]]


@pytest.mark.parametrize(
    ("place", "field"),
    [
        ({"moduleId": "no-such-module"}, "moduleId"),
        ({"LESSON": 0}, "lessonId"),
        ({"MODULE": 0, "lessonId": "nosuchlesson"}, "lessonId"),
        ({"MODULE": 0, "lessonId": "Not-An-Id"}, "lessonId"),
    ],
)
def test_the_module_and_lesson_must_exist(
    client_for: ClientFor, make_user: MakeUser, module: Module, place: dict[str, Any], field: str
) -> None:
    values = {"MODULE": ("moduleId", module.id), "LESSON": ("lessonId", lesson_id(module, 0, 0))}
    body: dict[str, Any] = dict(values.get(k, (k, v)) for k, v in place.items())
    r = client_for(make_user()).post(f"{API}/notes", json={"title": "Somewhere", **body})
    assert r.status_code == 422, r.text
    assert field in r.json()["error"]["fields"]


def test_how_many_notes_and_how_fast(
    client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = client_for(make_user())
    monkeypatch.setattr(svc, "MAX_NOTES", 3)
    for _ in range(3):
        note = new_note(c)
    r = c.post(f"{API}/notes", json={})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_notes")

    monkeypatch.setattr(svc, "MAX_NOTES", 100)
    monkeypatch.setattr(svc, "CREATES_PER_HOUR", 4)
    new_note(c)
    r = c.post(f"{API}/notes", json={})
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")

    monkeypatch.setattr(svc, "SAVES_PER_MINUTE", 2)
    note = save(c, note, doc=doc("Save 1")).json()
    assert ink(c, note, 0, [stroke()], 0).status_code == 200  # ink saves count too
    r = save(c, note, doc=doc("One too many"))
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")
    assert r.headers["Retry-After"]


def test_text_and_ink_are_capped_apart_from_files(
    client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """What lives in the database (typed text and ink) has a budget of its own, much smaller than the files':
    one free account can't fill the database."""
    assert svc.WRITING_LIMIT <= 25 * 1024 * 1024 < svc.FILES_LIMIT
    c = client_for(make_user())
    note = new_note(c, "short")
    used = c.get(f"{API}/notebooks").json()["storage"]["writingBytes"]
    monkeypatch.setattr(svc, "WRITING_LIMIT", used + 300)
    r = save(c, note, doc=doc("x" * 400))
    assert (r.status_code, r.json()["error"]["code"]) == (409, "notes_full")
    assert "text and handwriting" in r.json()["error"]["message"]
    assert save(c, note, title="Renamed").status_code == 200  # the text unchanged: no check
    r = ink(c, note, 0, [stroke(n=40)], 0)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "notes_full")
    assert ink(c, note, 0, [stroke(n=2)], 0).status_code == 200
    file = {"purpose": "note_file", "fileName": "big.pdf", "contentType": "application/pdf", "sizeBytes": 5000}
    assert c.post(f"{API}/uploads", json=file).status_code == 201  # files have their own room
    monkeypatch.setattr(svc, "FILES_LIMIT", 4000)
    r = c.post(f"{API}/uploads", json=file)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "notes_full")
    assert "pictures and files" in r.json()["error"]["message"]


def test_one_sheet_holds_at_most_sheet_max_bytes(client_for: ClientFor, make_user: MakeUser) -> None:
    """A sheet's ink is capped by the API itself, and a request far over the cap is refused unread."""
    c = client_for(make_user())
    note = new_note(c)
    sheet = PAPER_SHEETS_FROM

    def body(strokes: int, numbers: int) -> bytes:
        drawn = [
            {"id": f"s{i}", "tool": "pen", "color": "#1f2933", "width": 2.5, "points": [12345.67] * numbers}
            for i in range(strokes)
        ]
        return json.dumps({"strokes": drawn, "version": 0}, separators=(",", ":")).encode()

    over = body(5, 12_000)  # about 600 KB: within one request's ceiling, over one sheet's
    assert SHEET_MAX_BYTES < len(over) <= INK_BODY_MAX
    r = c.put(f"{API}/notes/{note['id']}/ink/{sheet}", content=over, headers=JSON_BODY)
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["strokes"])
    huge = body(18, 18_000)  # about 3 MB
    r = c.put(f"{API}/notes/{note['id']}/ink/{sheet}", content=huge, headers=JSON_BODY)
    assert (r.status_code, r.json()["error"]["code"]) == (413, "too_large")
    assert MAX_STROKES * MAX_POINTS <= 8_000_000  # the schema's own ceiling came down with it
    fits = body(3, 12_000)
    assert c.put(f"{API}/notes/{note['id']}/ink/{sheet}", content=fits, headers=JSON_BODY).status_code == 200


def test_an_ink_save_is_capped_however_it_is_sent(client_for: ClientFor, make_user: MakeUser) -> None:
    """The ceiling holds without a proxy in front: a chunked body is counted as it arrives, a size that isn't a number
    is refused, and a body just under the ceiling goes through."""
    c = client_for(make_user())
    note = new_note(c)
    url = f"{API}/notes/{note['id']}/ink/{PAPER_SHEETS_FROM}"
    sheet = json.dumps({"strokes": [stroke("a")], "version": 0}).encode()
    padded = sheet + b" " * (INK_BODY_MAX - len(sheet))  # JSON with spaces after it: exactly the ceiling
    assert len(padded) == INK_BODY_MAX

    def chunks(body: bytes, size: int = 65_536) -> Iterator[bytes]:
        for i in range(0, len(body), size):
            yield body[i : i + size]

    r = c.put(url, content=chunks(padded + b" "), headers=JSON_BODY)  # chunked, no Content-Length: one byte over
    assert "content-length" not in {k.lower() for k in r.request.headers}
    assert (r.status_code, r.json()["error"]["code"]) == (413, "too_large")
    r = c.put(url, content=padded, headers=JSON_BODY | {"Content-Length": "lots"})
    assert (r.status_code, r.json()["error"]["code"]) == (400, "bad_request")
    r = c.put(url, content=chunks(padded), headers=JSON_BODY)  # chunked, at the ceiling
    assert r.status_code == 200, r.text[:200]
    under = padded[:-1].replace(b'"version": 0', b'"version": 1')  # with its size declared, a byte under
    r = c.put(url, content=under, headers=JSON_BODY)
    assert r.status_code == 200, r.text[:200]


def test_a_note_is_read_without_its_ink_and_each_sheet_on_its_own(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    """Reading a note never loads its handwriting: the note lists its sheets, and each sheet is read alone."""
    c = client_for(make_user())
    note = new_note(c)
    points = [12345.67] * 12_000
    big = [{"id": f"s{i}", "tool": "pen", "color": "#1f2933", "width": 2.5, "points": points} for i in range(3)]
    for k in range(2):
        r = ink(c, note, PAPER_SHEETS_FROM + k, big, 0)
        assert r.status_code == 200, r.text[:200]
    in_postgres = db.scalar(select(func.sum(NoteInk.size_bytes)).where(NoteInk.note_id == note["id"]))
    assert in_postgres is not None
    assert in_postgres > 600_000
    tracemalloc.start()
    try:
        opened = c.get(f"{API}/notes/{note['id']}")
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert opened.status_code == 200
    assert opened.json()["ink"] == [{"sheet": 1000, "version": 1}, {"sheet": 1001, "version": 1}]
    assert len(opened.content) < 5_000
    assert peak < in_postgres / 2  # nothing like the ink's size
    sheet = c.get(f"{API}/notes/{note['id']}/ink/1001").json()
    assert (sheet["sheet"], sheet["version"], len(sheet["strokes"])) == (1001, 1, 3)
    assert c.get(f"{API}/notes/{note['id']}/ink/1005").json() == {"sheet": 1005, "strokes": [], "version": 0}
    other = client_for(make_user())
    assert other.get(f"{API}/notes/{note['id']}/ink/1000").status_code == 404


def test_saves_are_counted_per_student_too(
    client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Filling many notes at once is as slow as filling one."""
    c = client_for(make_user())
    first, second = new_note(c), new_note(c)
    monkeypatch.setattr(svc, "PERSON_SAVES_PER_MINUTE", 3)
    assert ink(c, first, 0, [stroke("a")], 0).status_code == 200
    assert ink(c, second, 0, [stroke("b")], 0).status_code == 200
    assert ink(c, first, 1, [stroke("c")], 0).status_code == 200
    r = ink(c, second, 1, [stroke("d")], 0)
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")
    assert r.headers["Retry-After"]


def test_sizes_are_capped(client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch) -> None:
    c = client_for(make_user())
    assert c.post(f"{API}/notes", json={"title": "t" * 201}).status_code == 422
    monkeypatch.setattr("app.services.note_doc.DOC_MAX_BYTES", 200)
    r = c.post(f"{API}/notes", json={"doc": doc("y" * 300)})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["doc"])
    r = c.post(f"{API}/notes", json={"sheets": 301})
    assert r.status_code == 422


# ── ink ──────────────────────────────────────────────────────────────────────────────────────


def test_ink_saves_per_sheet_with_versions(client_for: ClientFor, make_user: MakeUser) -> None:
    user = make_user()
    tab_one, tab_two = client_for(user), client_for(user)
    note = new_note(tab_one)
    r = ink(tab_one, note, 0, [stroke("a"), stroke("b")], 0)
    assert r.status_code == 200, r.text
    assert (r.json()["version"], [s["id"] for s in r.json()["strokes"]]) == (1, ["a", "b"])
    assert ink(tab_one, note, 2, [stroke("c")], 0).json()["version"] == 1
    r = ink(tab_two, note, 0, [stroke("z")], 0)  # written on in the first tab since
    assert (r.status_code, r.json()["error"]["code"]) == (409, "ink_changed")
    assert ink(tab_two, note, 0, [stroke("a")], 1).json()["version"] == 2
    loaded = tab_one.get(f"{API}/notes/{note['id']}").json()
    assert loaded["ink"] == [{"sheet": 0, "version": 2}, {"sheet": 2, "version": 1}]
    sheets = [tab_one.get(f"{API}/notes/{note['id']}/ink/{s['sheet']}").json() for s in loaded["ink"]]
    assert [[x["id"] for x in s["strokes"]] for s in sheets] == [["a"], ["c"]]
    assert loaded["version"] == note["version"]  # ink doesn't change the text's version
    cleared = ink(tab_one, note, 2, [], 1)  # an empty sheet is removed
    assert cleared.json() == {"sheet": 2, "strokes": [], "version": 0}
    assert [s["sheet"] for s in tab_one.get(f"{API}/notes/{note['id']}").json()["ink"]] == [0]


@pytest.mark.parametrize(
    "bad",
    [
        {"points": [1.0, 2.0]},  # not threes
        {"color": "red"},
        {"tool": "laser"},  # the laser is never saved
        {"width": 0},
        {"id": "has space"},
        {"points": [1e9, 0.0, 0.5]},
    ],
)
def test_strokes_are_checked(client_for: ClientFor, make_user: MakeUser, bad: dict[str, Any]) -> None:
    c = client_for(make_user())
    note = new_note(c)
    assert ink(c, note, 0, [stroke() | bad], 0).status_code == 422


def test_ink_sheets_are_bounded(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    note = new_note(c)
    assert ink(c, note, svc.MAX_SHEET_INDEX + 1, [stroke()], 0).status_code == 422
    assert ink(c, note, -1, [stroke()], 0).status_code in (404, 422)


# ── files ────────────────────────────────────────────────────────────────────────────────────


def picture_doc(upload_id: str, file_id: str | None = None, attrs: dict[str, Any] | None = None) -> dict[str, Any]:
    picture = {"upload": upload_id, "alt": "Whiteboard"} | (attrs or {})
    content: list[dict[str, Any]] = [{"type": "image", "attrs": picture}]
    if file_id:
        content.append({"type": "attachment", "attrs": {"upload": file_id, "name": "data.csv", "size": 12}})
    return {"type": "doc", "content": content}


def statuses(db: Session, *ids: str) -> list[UploadStatus]:
    db.expire_all()
    return [db.get(Upload, i).status for i in ids]  # type: ignore[union-attr]


def listed(db: Session, note: dict[str, Any]) -> set[str]:
    db.expire_all()
    return {str(u) for u in db.get(Note, note["id"]).uploads}  # type: ignore[union-attr]


def test_pictures_and_files_are_kept_while_a_note_shows_them(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    c = client_for(make_user())
    picture = upload(c, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    data = upload(c, storage, purpose="note_file", name="data.csv", content_type="text/csv", body=b"a,b\n1,2\n")
    note = new_note(c, doc=picture_doc(picture, data))
    assert note["text"] == "Whiteboard\ndata.csv"
    assert listed(db, note) == {picture, data}
    assert statuses(db, picture, data) == [UploadStatus.attached] * 2
    assert db.get(Upload, picture).storage_key.startswith("notes/")  # type: ignore[union-attr]

    shown = c.get(f"{API}/notes/files/{picture}", follow_redirects=False)
    assert shown.status_code == 302
    assert "inline" in shown.headers["location"]
    saved = c.get(f"{API}/notes/files/{data}", params={"download": True}, follow_redirects=False)
    assert "attachment" in saved.headers["location"]

    later = save(c, note, doc=picture_doc(picture))  # the file was taken out: released, for the sweep
    assert later.status_code == 200, later.text
    assert listed(db, note) == {picture}
    assert statuses(db, data) == [UploadStatus.released]
    assert c.get(f"{API}/notes/files/{data}", follow_redirects=False).status_code == 302  # still there to undo
    back = save(c, later.json(), doc=picture_doc(picture, data))  # undone before the sweep: in use again
    assert back.status_code == 200
    assert statuses(db, data) == [UploadStatus.attached]

    assert c.delete(f"{API}/notes/{note['id']}").status_code == 204
    assert statuses(db, picture, data) == [UploadStatus.released] * 2


def test_a_picture_in_two_notes_stays_until_neither_shows_it(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A picture copied into a second note keeps its upload: deleting the first note, or the picture in it, leaves it
    for the second. Once no note shows it, it stops counting against the room and the sweep deletes it."""
    c = client_for(make_user())
    picture = upload(c, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    first = new_note(c, doc=picture_doc(picture))
    second = new_note(c, doc=picture_doc(picture), title="Copied")
    room = c.get(f"{API}/notebooks").json()["storage"]["filesBytes"]
    assert room == len(PNG)

    assert save(c, first, doc=doc("No picture any more")).status_code == 200
    assert statuses(db, picture) == [UploadStatus.attached]
    assert c.delete(f"{API}/notes/{first['id']}").status_code == 204
    assert statuses(db, picture) == [UploadStatus.attached]
    assert c.get(f"{API}/notes/files/{picture}", follow_redirects=False).status_code == 302
    exported = c.get(f"{API}/me/export").json()
    files = [n["files"] for b in exported["notebooks"] for n in b["notes"]]
    assert files == [["board.png"]]

    assert c.delete(f"{API}/notes/{second['id']}").status_code == 204
    assert statuses(db, picture) == [UploadStatus.released]
    assert c.get(f"{API}/notebooks").json()["storage"]["filesBytes"] == 0  # the room is free at once
    db.execute(update(Upload).where(Upload.id == picture).values(created_at=utcnow() - timedelta(days=2)))
    db.commit()

    @contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: same_session)
    assert cli.sweep().uploads == 1
    db.expire_all()
    assert db.get(Upload, picture) is None


def test_a_deleted_notebook_releases_the_files_no_other_note_shows(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    c = client_for(make_user())
    shared = upload(c, storage, purpose="note_file", name="shared.png", content_type="image/png", body=PNG)
    own = upload(c, storage, purpose="note_file", name="own.png", content_type="image/png", body=PNG)
    book = c.post(f"{API}/notebooks", json={"title": "Scratch"}).json()
    other = c.post(f"{API}/notebooks", json={"title": "Kept"}).json()
    new_note(c, doc=picture_doc(shared, attrs={"caption": "in the notebook"}), notebookId=book["id"])
    new_note(c, doc=picture_doc(own), notebookId=book["id"])
    new_note(c, doc=picture_doc(shared), notebookId=other["id"])
    assert c.delete(f"{API}/notebooks/{book['id']}").status_code == 204
    assert statuses(db, shared, own) == [UploadStatus.attached, UploadStatus.released]


def test_a_picture_keeps_its_place_crop_and_caption(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    """A picture's size, place, turn and crop are kept as the editor sends them, and its caption and description are
    searched with the note's text."""
    c = client_for(make_user())
    picture = upload(c, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    edited = {"caption": "Bayes, week 4", "width": 0.6, "x": 1, "ratio": 1.6, "rotate": 90}
    crop = {"cropX": 0.1, "cropY": 0.2, "cropW": 0.5, "cropH": 0.6}
    note = new_note(c, doc=picture_doc(picture, attrs=edited | crop))
    assert note["text"] == "Bayes, week 4\nWhiteboard"
    assert note["doc"]["content"][0]["attrs"] == {"upload": picture, "alt": "Whiteboard"} | edited | crop
    found = c.get(f"{API}/notes", params={"q": "week 4"}).json()["items"]
    assert [n["id"] for n in found] == [note["id"]]


def free_picture(upload_id: str, **changes: Any) -> dict[str, Any]:
    """A picture free on the first page of paper, as the editor keeps it in the document's own attributes."""
    picture: dict[str, Any] = {
        "id": "f1",
        "upload": upload_id,
        "sheet": PAPER_SHEETS_FROM,
        "x": 420,
        "y": 64,
        "w": 320,
        "h": 240,
        "angle": 12.5,
        "ratio": 4 / 3,
        "cropX": 0,
        "cropY": 0,
        "cropW": 1,
        "cropH": 1,
        "alt": "Normal curve",
        "caption": "Beside the definition",
    }
    return picture | changes


def test_free_pictures_keep_their_places_on_the_pages(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    """A free picture is kept where the editor put it, its words are searched, its file belongs to the note, and it
    can't be left off its page or on a page the note doesn't have."""
    c = client_for(make_user())
    upload_id = upload(c, storage, purpose="note_file", name="curve.png", content_type="image/png", body=PNG)
    body = doc("The density")
    body["attrs"] = {"pictures": [free_picture(upload_id)]}
    note = new_note(c, doc=body, sheets=2)
    assert note["doc"]["attrs"] == body["attrs"]
    assert note["text"] == "The density\nBeside the definition\nNormal curve"
    assert (listed(db, note), statuses(db, upload_id)) == ({upload_id}, [UploadStatus.attached])
    assert [n["id"] for n in c.get(f"{API}/notes", params={"q": "normal curve"}).json()["items"]] == [note["id"]]

    to_page_two = {"pictures": [free_picture(upload_id, sheet=PAPER_SHEETS_FROM + 1, y=800, angle=0)]}
    moved = save(c, note, doc=body | {"attrs": to_page_two})
    assert moved.status_code == 200, moved.text
    assert c.get(f"{API}/notes/{note['id']}").json()["doc"]["attrs"] == to_page_two

    note = moved.json()
    off = {"pictures": [free_picture(upload_id, x=700)]}  # its middle past the page's right edge
    r = save(c, note, doc=body | {"attrs": off})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["doc"])
    r = save(c, note, sheets=1)  # the page it is on can't go while it is there
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["doc"])

    gone = save(c, note, doc=doc("The density"), sheets=1)  # deleted with its page: its file is released
    assert gone.status_code == 200, gone.text
    assert statuses(db, upload_id) == [UploadStatus.released]


def test_free_pictures_on_a_pdf_of_your_own(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    c = client_for(make_user())
    pdf = upload(c, storage, purpose="note_file", name="slides.pdf", content_type="application/pdf", body=PDF)
    picture = upload(c, storage, purpose="note_file", name="graph.png", content_type="image/png", body=PNG)
    body = {"type": "doc", "attrs": {"pictures": [free_picture(picture, sheet=3, y=2000)]}, "content": []}
    note = new_note(c, doc=body, sheets=0, pdfUploadId=pdf)
    assert note["sheets"] == 0
    assert note["doc"]["attrs"]["pictures"][0]["sheet"] == 3


def test_a_note_holds_a_limited_number_of_pictures(
    client_for: ClientFor, make_user: MakeUser, storage: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(note_doc, "MAX_PICTURES", 2)
    c = client_for(make_user())
    picture = upload(c, storage, purpose="note_file", name="a.png", content_type="image/png", body=PNG)
    body = picture_doc(picture)
    body["attrs"] = {"pictures": [free_picture(picture)]}
    note = new_note(c, doc=body)
    body["attrs"] = {"pictures": [free_picture(picture), free_picture(picture, id="f2")]}
    r = save(c, note, doc=body)
    assert r.status_code == 422
    assert r.json()["error"]["message"] == "A note holds up to 2 pictures. Put the others in another note."


def test_someone_elses_upload_in_a_note_is_left_alone(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    other = client_for(make_user(name="Omar Classmate"))
    theirs = upload(other, storage, purpose="note_file", name="x.png", content_type="image/png", body=PNG)
    c = client_for(make_user())
    note = new_note(c, doc=picture_doc(theirs))
    assert (listed(db, note), statuses(db, theirs)) == (set(), [UploadStatus.uploaded])
    assert c.get(f"{API}/notes/files/{theirs}", follow_redirects=False).status_code == 404
    assert note["text"] == "Whiteboard"


def test_note_uploads_follow_the_notes_switch(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    c = client_for(make_user())
    r = c.post(
        f"{API}/uploads",
        json={"purpose": "note_file", "fileName": "run.exe", "contentType": "application/octet-stream", "sizeBytes": 9},
    )
    assert (r.status_code, r.json()["error"]["code"]) == (422, "unsupported_type")
    set_feature("notes", "off")
    r = c.post(
        f"{API}/uploads",
        json={"purpose": "note_file", "fileName": "a.png", "contentType": "image/png", "sizeBytes": 9},
    )
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")


# ── writing over a PDF ───────────────────────────────────────────────────────────────────────


def test_annotate_a_library_pdf_makes_or_reopens_one_note(
    client_for: ClientFor, make_user: MakeUser, storage: Any, module: Module, db: Session
) -> None:
    rep = client_for(make_user(name="Maryam Rep", roles=("student", "rep")))
    item = share_pdf(rep, storage, title="Paper May 2024")
    stored = db.get(LibraryItem, item["id"])
    assert stored is not None
    stored.module_id = module.id
    db.commit()

    c = client_for(make_user())
    r = c.post(f"{API}/notes/annotate", json={"libraryItemId": item["id"]})
    assert r.status_code == 201, r.text
    note = r.json()
    assert (note["title"], note["onPdf"], note["sheets"], note["moduleId"]) == ("Paper May 2024", True, 0, module.id)
    assert note["pdf"] == {
        "libraryItemId": item["id"],
        "slug": item["slug"],
        "uploadId": None,
        "title": "Paper May 2024",
        "available": True,
    }
    again = c.post(f"{API}/notes/annotate", json={"libraryItemId": item["id"]})
    assert (again.status_code, again.json()["id"]) == (200, note["id"])
    assert ink(c, note, 4, [stroke()], 0).status_code == 200  # page 5 of the PDF
    other = client_for(make_user(name="Omar Classmate")).post(
        f"{API}/notes/annotate", json={"libraryItemId": item["id"]}
    )
    assert other.json()["id"] != note["id"]  # everyone writes on their own copy


def test_only_published_pdfs_can_be_written_over(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    student = client_for(make_user())
    upload_id = upload(student, storage, purpose="library", name="mine.pdf", content_type="application/pdf", body=PDF)
    pending = student.post(f"{API}/library/items", json={"uploadId": upload_id, "title": "Mine", "kind": "notes"})
    assert pending.status_code == 201, pending.text
    r = student.post(f"{API}/notes/annotate", json={"libraryItemId": pending.json()["id"]})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["libraryItemId"])
    r = student.post(f"{API}/notes/annotate", json={"libraryItemId": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 404


def test_a_pdf_of_your_own(client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session) -> None:
    c = client_for(make_user())
    pdf = upload(c, storage, purpose="note_file", name="slides.pdf", content_type="application/pdf", body=PDF)
    png = upload(c, storage, purpose="note_file", name="a.png", content_type="image/png", body=PNG)
    r = c.post(f"{API}/notes", json={"title": "Slides", "sheets": 0, "pdfUploadId": png})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["pdfUploadId"])
    r = c.post(f"{API}/notes", json={"title": "Slides", "sheets": 0, "pdfUploadId": pdf})
    assert r.status_code == 201, r.text
    note = r.json()
    assert note["pdf"] == {
        "libraryItemId": None,
        "slug": None,
        "uploadId": pdf,
        "title": "slides.pdf",
        "available": True,
    }
    assert (note["onPdf"], note["sheets"]) == (True, 0)
    assert save(c, note, doc=doc("No pictures")).status_code == 200  # the PDF stays in use
    assert (listed(db, note), statuses(db, pdf)) == ({pdf}, [UploadStatus.attached])
    again = c.post(f"{API}/notes", json={"title": "Slides again", "sheets": 0, "pdfUploadId": pdf})
    assert again.status_code == 201, again.text  # a second note on the same PDF keeps it when the first goes
    assert c.delete(f"{API}/notes/{note['id']}").status_code == 204
    assert statuses(db, pdf) == [UploadStatus.attached]


# ── accounts and switches ────────────────────────────────────────────────────────────────────


def test_a_suspended_account_reads_but_does_not_write(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    note = new_note(c)
    user.status = UserStatus.suspended
    db.commit()
    assert c.get(f"{API}/notes").json()["total"] == 1
    assert c.get(f"{API}/notebooks").status_code == 200
    assert c.get(f"{API}/notes/{note['id']}").status_code == 200
    assert save(c, note, doc=doc("Changed")).status_code == 403
    assert ink(c, note, 0, [stroke()], 0).status_code == 403
    assert c.post(f"{API}/notes", json={}).status_code == 403
    assert c.post(f"{API}/notebooks", json={"title": "New"}).status_code == 403
    assert c.delete(f"{API}/notes/{note['id']}").status_code == 403


def test_switched_off_by_default_and_off_for_students(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    student, boss = make_user(), make_user(name="Head Admin", roles=("student", "admin"))
    assert "notes" in client_for(student).get(f"{API}/me").json()["features"]
    set_feature("notes", "off")
    for path in ("/notes", "/notebooks"):
        r = client_for(student).get(f"{API}{path}")
        assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")
    assert "notes" not in client_for(student).get(f"{API}/me").json()["features"]
    assert client_for(boss).get(f"{API}/notes").status_code == 200  # admins try it before switching it on


def test_deleting_the_account_deletes_its_notebook(
    client_for: ClientFor, make_user: MakeUser, db: Session, storage: Any
) -> None:
    user = make_user()
    c = client_for(user)
    picture = upload(c, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    note = new_note(c, doc=picture_doc(picture))
    ink(c, note, 0, [stroke()], 0)
    keep = new_note(client_for(make_user(name="Omar Classmate")))
    key = db.get(Upload, picture).storage_key  # type: ignore[union-attr]
    r = c.delete(f"{API}/me")
    assert r.status_code in (200, 204), r.text
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Note).where(Note.user_id == user.id)) == 0
    assert db.scalar(select(func.count()).select_from(Notebook).where(Notebook.user_id == user.id)) == 0
    assert db.get(Upload, picture) is None
    assert storage.head(key) is None
    assert db.get(Note, keep["id"]) is not None


def test_a_deleted_module_leaves_its_notebook(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    c = client_for(make_user())
    note = new_note(c, moduleId=module.id)
    db.delete(module)
    db.commit()
    got = c.get(f"{API}/notes/{note['id']}").json()
    assert (got["moduleId"], got["notebookId"]) == (None, note["notebookId"])
