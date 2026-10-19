"""The Drive import (app/services/drive_import.py, python -m app.cli import-drive) against the fake Drive and moto: the
plan, what becomes a library file and how, what is skipped and why, reruns, refused folders, the audit entry, the
command's questions, and the key, which must never reach a log or the output."""

from __future__ import annotations

import json
import logging
import re
import threading
import unicodedata
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import httpx
import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.config import Settings, get_settings
from app.core.time import utcnow
from app.models import AuditEntry, DriveFolder, ItemSource, ItemStatus, LibraryItem, Module, User
from app.services import drive as drive_module
from app.services import exam_names
from app.services.drive import Drive, connect
from app.services.drive_import import import_from_drive
from app.services.exam_names import ExamMeta
from app.services.library import REFERENCE_PUBLISHED_AT, sweep_files
from app.services.storage import Storage
from tests.content.conftest import API
from tests.content.fake_drive import (
    API_KEY,
    FOLDER,
    FORM,
    PDF,
    PDF_TYPE,
    PNG,
    SERVICE_EMAIL,
    SHEET,
    SLIDES,
    XLSX,
    XLSX_TYPE,
    FakeDrive,
    automated_queries,
    google_error,
    listing,
    media,
)

DOCX = b"PK\x03\x04" + b"\x00" * 60
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

Lines = list[str]


@pytest.fixture
def fake() -> FakeDrive:
    return FakeDrive()


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    """The API key set; whatever a test changes here is put back afterwards."""
    s = get_settings()
    monkeypatch.setattr(s, "google_api_key", SecretStr(API_KEY))
    monkeypatch.setattr(s, "google_service_account_file", None)
    monkeypatch.setattr(s, "max_upload_mb", s.max_upload_mb)
    return s


@pytest.fixture
def drive(fake: FakeDrive, settings: Settings) -> Iterator[Drive]:
    with connect(settings, transport=fake.transport, sleep=lambda _: None) as client:
        yield client


@pytest.fixture
def out() -> Lines:
    return []


@pytest.fixture
def run(db: Session, drive: Drive, storage: Storage, modules: dict[str, Module], out: Lines) -> Callable[..., int]:
    """run(**options) -> the import's exit status, its output in `out` (--yes unless `confirm` is given)."""

    def _run(**options: Any) -> int:
        return import_from_drive(db, drive, storage, echo=out.append, **options)

    return _run


def link(
    db: Session,
    module_id: str,
    folder_id: str,
    *,
    kind: str = "course-materials",
    title: str = "Course materials",
    author: str | None = None,
    resource_key: str | None = None,
    url: str | None = None,
) -> DriveFolder:
    """A Drive folder row, as the seed makes them."""
    query = f"?resourcekey={resource_key}" if resource_key else "?usp=sharing"
    folder = DriveFolder(
        id=uuid.uuid4(),
        module_id=module_id,
        kind=kind,
        title=title,
        url=url or f"https://drive.google.com/drive/folders/{folder_id}{query}",
        author_name=author,
    )
    db.add(folder)
    db.commit()
    return folder


def imported(db: Session) -> dict[str, LibraryItem]:
    """The imported files, by file name."""
    db.expire_all()
    items = db.scalars(select(LibraryItem).where(LibraryItem.import_key.is_not(None)))
    return {item.file_name or "": item for item in items}


@pytest.fixture(autouse=True)
def no_imported_files(storage: Storage) -> None:
    """The bucket (moto) lives as long as the test session: start each test without imported files."""
    for key in keys(storage):
        storage.delete(key)


def keys(storage: Storage, prefix: str = "library/drive/") -> list[str]:
    found = storage.client.list_objects_v2(Bucket=storage.bucket, Prefix=prefix).get("Contents", [])
    return sorted(o["Key"] for o in found)


def runs(db: Session) -> list[AuditEntry]:
    return list(db.scalars(select(AuditEntry).where(AuditEntry.action == "library.import").order_by(AuditEntry.id)))


def text(out: Lines) -> str:
    return "\n".join(out)


# ── the plan ─────────────────────────────────────────────────────────────────────────────────


def test_a_dry_run_prints_the_plan_and_changes_nothing(
    db: Session, storage: Storage, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    fake.folder("mat1", "ST1215 materials")
    fake.file("pdf1", "Subject guide.pdf", "mat1")
    fake.folder("wk1", "Week 1", parent="mat1")
    fake.file("doc1", "Lecture 1.docx", "wk1", content=DOCX, mime=DOCX_TYPE)
    fake.google("gdoc1", "Summary", "wk1")
    fake.file("mp41", "recording.mp4", "wk1", content=b"\x00\x00\x00\x18ftypmp42", mime="video/mp4")
    link(db, "statistics", "mat1")
    link(db, "statistics", "", title="Feras's notes", url="https://not-google.example.com/notes")

    assert run(dry_run=True) == 0
    plan = text(out)
    assert "Year 1 \u00b7 ST1215 Introduction to Mathematical Statistics (statistics)" in plan
    assert (
        "  Course materials, \u201cST1215 materials\u201d in Drive: https://drive.google.com/drive/folders/mat1" in plan
    )
    assert f"    + Subject guide.pdf ({len(PDF)} bytes)" in out
    assert f"    + Week 1 \u203a Lecture 1.docx ({len(DOCX)} bytes)" in out
    assert "    + Week 1 \u203a Summary.pdf (Google Docs, as PDF)" in out
    assert "    - Week 1 \u203a recording.mp4: the library doesn't take .mp4 files" in out
    assert "Links that aren't Drive folders stay links: 1" in plan
    assert "  statistics \u00b7 Feras's notes: https://not-google.example.com/notes" in out
    assert "To import: 3 files (" in plan
    assert out[-1] == "Dry run: nothing was imported."
    assert imported(db) == {}
    assert keys(storage) == []
    assert runs(db) == []
    assert not [r for r in fake.requests if r.url.params.get("alt") == "media" or r.url.path.endswith("/export")]


def test_with_no_drive_folder_to_read_it_says_how_to_get_some(run: Callable[..., int], out: Lines) -> None:
    assert run(dry_run=True) == 0
    assert out == ["No published library link leads to a Drive folder: load the links first (python -m app.cli seed)."]


# ── the import ───────────────────────────────────────────────────────────────────────────────


def test_files_become_published_library_files_of_the_links_kind_module_and_author(
    db: Session,
    storage: Storage,
    fake: FakeDrive,
    run: Callable[..., int],
    out: Lines,
    client_for: Callable[..., TestClient],
) -> None:
    fake.folder("mat1", "Materials")
    fake.file("pdf1", "Subject guide.pdf", "mat1")
    fake.folder("wk1", "Week 1", parent="mat1")
    fake.google("gdoc1", "Summary", "wk1", exports={PDF_TYPE: PDF + b" summary"})
    fake.google("gsheet1", "Marks", "wk1", mime=SHEET)
    fake.google("gslides1", "Slides 1", "wk1", mime=SLIDES, exports={PDF_TYPE: PDF + b" slides"})
    fake.folder("notes1", "Mahdi notes")
    fake.file("png1", "board.png", "notes1", content=PNG, mime="image/png")
    link(db, "statistics", "mat1")
    link(db, "economics", "notes1", kind="notes", title="Mahdi's notes", author="Mahdi")

    assert run() == 0
    items = imported(db)
    assert sorted(items) == ["Marks.xlsx", "Slides 1.pdf", "Subject guide.pdf", "Summary.pdf", "board.png"]
    guide = items["Subject guide.pdf"]
    assert (guide.source, guide.status, guide.kind) == (ItemSource.file, ItemStatus.published, "course-materials")
    assert (guide.module_id, guide.year, guide.title) == ("statistics", 1, "Subject guide")
    assert (guide.content_type, guide.size_bytes) == ("application/pdf", len(PDF))
    assert (guide.storage_key, guide.import_key) == (
        "library/drive/statistics/pdf1/Subject-guide.pdf",
        "drive/statistics/pdf1",
    )
    assert guide.description is None  # where it was in Drive is no description (ST-56)
    assert (guide.uploaded_by, guide.author_name, guide.published_at) == (None, None, REFERENCE_PUBLISHED_AT)
    assert guide.slug.startswith("st1215-subject-guide")
    assert (items["Marks.xlsx"].content_type, items["Marks.xlsx"].size_bytes) == (XLSX_TYPE, len(XLSX))
    board = items["board.png"]
    assert (board.kind, board.author_name, board.module_id, board.year) == ("notes", "Mahdi", "economics", 1)
    assert "Imported 5 files into the library. Skipped: 0. Failed: 0." in out

    stored = storage.client.get_object(Bucket=storage.bucket, Key=guide.storage_key or "")
    assert (stored["ContentType"], stored["Body"].read()) == ("application/pdf", PDF)
    assert keys(storage) == sorted(i.storage_key or "" for i in items.values())

    # files like any other: listed, downloaded and previewed by everyone
    guest = client_for()
    page = guest.get(f"{API}/library/items", params={"module_id": "statistics", "source": "file"}).json()
    assert {i["title"] for i in page["items"]} == {"Subject guide", "Summary", "Marks", "Slides 1"}
    assert all(i["uploadedBy"] is None and i["url"] is None for i in page["items"])
    download = guest.get(f"{API}/library/items/{guide.id}/download", follow_redirects=False)
    assert download.status_code == 302
    assert "Subject-guide.pdf" in download.headers["location"]
    assert guest.get(f"{API}/library/items/{guide.id}/file").status_code == 200

    # one audit entry for the run, as the other server commands record theirs
    [entry] = runs(db)
    assert (entry.actor_id, entry.target_type, entry.target_id) == (None, None, None)
    assert entry.data == {
        "via": "cli",
        "from": "google-drive",
        "title": "5 files from Google Drive",
        "imported": 5,
        "skipped": 0,
        "failed": 0,
        "refusedFolders": [],
        "refusedFiles": [],
        "module": None,
        "limit": None,
        "stopped": None,
    }


def test_papers_take_their_exam_year_session_zone_and_kind_from_the_name(
    db: Session, fake: FakeDrive, run: Callable[..., int], out: Lines, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The wiring only: exam_meta_from_name has its own tests (test_exam_names.py), so it is replaced here. A past
    papers folder's files are all papers; a VLE folder's only when their names say they are a sitting's."""
    said = {
        "ST2133_2021_ZA.pdf": ExamMeta(2021, "A", False),
        "ST2133_2020_ER.pdf": ExamMeta(2020, None, True),
        "Odd.pdf": ExamMeta(21, "C", False, "june"),  # type: ignore[arg-type]  # not a year, zone or session: ignored
        "ST2133 Exam paper - May 2024.pdf": ExamMeta(2024, None, False, "may", False, True),
        "ST2133 solutions - October 2024.pdf": ExamMeta(2024, "B", False, "october", True, True),
        "ST2133 2024.pdf": ExamMeta(2024, None, False),  # a year, but not a sitting's file
    }
    asked: list[str] = []

    def meta(name: str) -> ExamMeta:
        asked.append(name)
        return said.get(name, ExamMeta(None, None, False))

    monkeypatch.setattr(exam_names, "exam_meta_from_name", meta)
    fake.folder("old1", "Older exams")
    for i, name in enumerate(["ST2133_2021_ZA.pdf", "ST2133_2020_ER.pdf", "Odd.pdf"]):
        fake.file(f"p{i}", name, "old1")
    fake.google("mock1", "Mock exam", "old1")
    fake.folder("notes1", "Notes")
    fake.file("n1", "ST2133_2019_ZB.pdf", "notes1")
    fake.folder("vle1", "VLE")
    vle = ["ST2133 Exam paper - May 2024.pdf", "ST2133 solutions - October 2024.pdf", "ST2133 2024.pdf"]
    for i, name in enumerate(vle):
        fake.file(f"v{i}", name, "vle1")
    link(db, "advanced-stats-distribution", "old1", kind="past-paper", title="Past exams")
    link(db, "advanced-stats-distribution", "vle1", kind="vle-materials", title="VLE materials")
    link(db, "advanced-stats-distribution", "notes1", kind="notes", title="Sara's notes", author="Sara")

    assert run() == 0
    assert "ST2133_2019_ZB.pdf" not in asked  # a notes folder: its files are notes
    items = imported(db)
    found = {name: (i.kind, i.exam_year, i.exam_session, i.zone) for name, i in items.items()}
    assert found == {
        "ST2133_2021_ZA.pdf": ("past-paper", 2021, None, "A"),
        "ST2133_2020_ER.pdf": ("examiners-report", 2020, None, None),
        "Odd.pdf": ("past-paper", None, None, None),
        "Mock exam.pdf": ("past-paper", None, None, None),
        "ST2133_2019_ZB.pdf": ("notes", None, None, None),
        "ST2133 Exam paper - May 2024.pdf": ("past-paper", 2024, "may", None),
        "ST2133 solutions - October 2024.pdf": ("exam-solutions", 2024, "october", "B"),
        "ST2133 2024.pdf": ("vle-materials", None, None, None),
    }
    assert items["ST2133_2019_ZB.pdf"].author_name == "Sara"
    assert f"    + ST2133_2021_ZA.pdf ({len(PDF)} bytes; Past paper 2021, zone A)" in out
    assert f"    + ST2133_2020_ER.pdf ({len(PDF)} bytes; Examiners\u2019 report 2020)" in out
    assert f"    + ST2133 solutions - October 2024.pdf ({len(PDF)} bytes; Solutions October 2024, zone B)" in out


def test_a_rerun_skips_what_is_there_even_after_a_rep_moved_or_removed_it(
    db: Session,
    storage: Storage,
    fake: FakeDrive,
    run: Callable[..., int],
    out: Lines,
    client_for: Callable[..., TestClient],
    make_user: Callable[..., User],
) -> None:
    fake.folder("mat1", "Materials")
    for name in ("a.pdf", "b.pdf", "c.pdf"):
        fake.file(name[0], name, "mat1")
    link(db, "statistics", "mat1")
    assert run() == 0
    first = imported(db)
    rep = client_for(make_user(name="Maryam Rep", roles=("student", "rep")))
    assert rep.delete(f"{API}/library/items/{first['a.pdf'].id}").status_code == 204
    moved = rep.patch(f"{API}/library/items/{first['b.pdf'].id}", json={"moduleId": "economics", "title": "Moved"})
    assert moved.status_code == 200
    sweep_files(db, storage, utcnow() + timedelta(days=8))  # a week after the removal: the file is deleted
    db.commit()
    assert imported(db)["a.pdf"].storage_key is None

    out.clear()
    assert run(dry_run=True) == 0
    assert "    = 3 already in the library" in out
    assert "To import: 0 files (0 bytes as Drive measures them)." in text(out)
    out.clear()
    assert run() == 0
    assert out[-1] == "Nothing to import."
    again = imported(db)
    assert sorted(again) == ["a.pdf", "b.pdf", "c.pdf"]
    assert again["a.pdf"].status == ItemStatus.removed
    assert (again["b.pdf"].module_id, again["b.pdf"].title) == ("economics", "Moved")
    assert keys(storage) == ["library/drive/statistics/b/b.pdf", "library/drive/statistics/c/c.pdf"]
    assert len(runs(db)) == 1  # a run with nothing to do changes nothing and isn't recorded


def test_folders_drive_refuses_are_listed_at_the_end_and_the_run_goes_on(
    db: Session, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    fake.folder("bibf1", "Only for BIBF accounts", access="none")
    fake.folder("mat1", "Materials")
    fake.file("pdf1", "guide.pdf", "mat1")
    fake.folder("private2", "Not shared", access="none")
    fake.shortcut("sc1", "Extra", "mat1", target="private2")
    fake.folder("deny1", "Exercises")
    fake.queue(listing("deny1"), google_error(403, "insufficientFilePermissions", "No access to its files."))
    link(db, "economics", "bibf1", kind="notes", title="Mahdi's notes", author="Mahdi")
    link(db, "statistics", "mat1")
    link(db, "statistics", "deny1", kind="exercises", title="Exercises")

    assert run() == 0
    assert sorted(imported(db)) == ["guide.pdf"]
    done = out.index("Imported 1 file into the library. Skipped: 0. Failed: 0.")
    end = out[done:]
    assert end[-4].startswith(
        "Folders Drive refused: 3. Share each with \u201canyone with the link\u201d, then run the"
    )
    assert end[-3:] == [
        "  economics \u00b7 Mahdi's notes: https://drive.google.com/drive/folders/bibf1?usp=sharing (404 notFound)",
        "  statistics \u00b7 Course materials \u203a Extra: https://drive.google.com/drive/folders/private2 "
        "(404 notFound)",
        "  statistics \u00b7 Exercises: https://drive.google.com/drive/folders/deny1?usp=sharing "
        "(403 insufficientFilePermissions)",
    ]
    [entry] = runs(db)
    assert entry.data["refusedFolders"] == [
        {
            "module": "economics",
            "link": "https://drive.google.com/drive/folders/bibf1?usp=sharing",
            "folder": "https://drive.google.com/drive/folders/bibf1?usp=sharing",
        },
        {
            "module": "statistics",
            "link": "https://drive.google.com/drive/folders/mat1?usp=sharing",
            "folder": "https://drive.google.com/drive/folders/private2",
        },
        {
            "module": "statistics",
            "link": "https://drive.google.com/drive/folders/deny1?usp=sharing",
            "folder": "https://drive.google.com/drive/folders/deny1?usp=sharing",
        },
    ]


def test_what_the_library_does_not_take_is_skipped_and_says_why(
    db: Session,
    storage: Storage,
    fake: FakeDrive,
    run: Callable[..., int],
    out: Lines,
    settings: Settings,
) -> None:
    settings.max_upload_mb = 1
    fake.folder("mat1", "Materials")
    fake.file("zip1", "code.zip", "mat1", content=b"PK\x03\x04", mime="application/zip")
    fake.file("big1", "huge.pdf", "mat1", size=5 * 1024 * 1024)  # Drive says 5 MB: never downloaded
    fake.file("liar1", "liar.pdf", "mat1", content=PDF + b"0" * (2 * 1024 * 1024), size=1000)  # says 1 KB, is 2 MB
    fake.file("html1", "notreally.pdf", "mat1", content=b"<html><script>alert(1)</script></html>")
    fake.file("empty1", "empty.pdf", "mat1", content=b"")
    fake.file("locked1", "locked.pdf", "mat1", can_download=False)
    fake.google("form1", "Quiz", "mat1", mime=FORM)
    fake.google("book1", "Book", "mat1", refuse_export="exportSizeLimitExceeded")
    fake.file("scan1", "Scan 2021-03-04", "mat1", mime="application/pdf")  # no extension: its bytes say PDF
    fake.file("photo1", "Photo", "mat1", content=b"not a picture", mime="image/png")  # no extension, not a PNG
    fake.file("intro1", "Week 1. Introduction", "mat1", content=b"plain text", mime="text/plain")
    link(db, "statistics", "mat1")

    assert run() == 0
    assert sorted(imported(db)) == ["Scan 2021-03-04.pdf"]
    assert keys(storage) == ["library/drive/statistics/scan1/Scan-2021-03-04.pdf"]
    for line in [  # the plan's
        "    - code.zip: the library doesn't take .zip files",
        "    - huge.pdf: it is over the 1 MB limit (5.0 MB)",
        "    - locked.pdf: its owner turned off downloads (https://drive.google.com/file/d/locked1/view)",
        "    - Quiz: the library doesn't take Google Forms files",
        "    - Week 1. Introduction: the library can't tell what kind of file",
        # the run's
        "  statistics: Book.pdf: Google exports at most 10 MB of a file, and this one is bigger "
        "(403 exportSizeLimitExceeded) (https://drive.google.com/file/d/book1/view)",
        "  statistics: empty.pdf: it is empty",
        "  statistics: liar.pdf: it is over the 1 MB limit",
        "  statistics: notreally.pdf: what Drive sent isn't a real .pdf file: its first bytes don't match",
        "  statistics: Photo.png: what Drive sent isn't a real .png file: its first bytes don't match",
    ]:
        assert line in out, line
    assert fake.streams["liar1"].served < 33  # the download stopped at the limit: 33 parts were on offer
    assert "Imported 1 file into the library. Skipped: 5. Failed: 0." in out
    assert runs(db)[0].data["skipped"] == 10


def test_names_from_drive_make_safe_keys_and_stay_as_drive_shows_them(
    db: Session, storage: Storage, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    names = {
        "n1": "../../etc/passwd.pdf",
        "n2": "a\\b\\..\\c.pdf",
        "n3": "Week 1/2 notes.pdf",
        "n4": "\u202eevil\x00\x1b[31mname.pdf",
        "n5": "x" * 400 + ".pdf",
        "n6": "\u0645\u0644\u062e\u0635 \u0627\u0644\u0641\u0635\u0644.pdf",
        "n7": "..",
    }
    fake.folder("mat1", "Materials")
    for node_id, name in names.items():
        fake.file(node_id, name, "mat1")
    fake.file("bad/../id", "sneaky.pdf", "mat1")  # an id that could escape its key: left out
    link(db, "statistics", "mat1")

    assert run() == 0
    items = {i.storage_key.split("/")[3]: i for i in imported(db).values() if i.storage_key}
    assert sorted(items) == sorted(names)
    for item in items.values():
        assert item.storage_key is not None
        assert re.fullmatch(r"library/drive/statistics/n[0-9]/[A-Za-z0-9_-]+\.pdf", item.storage_key)
        assert len(item.storage_key.rsplit("/", 1)[1]) <= 100
        assert item.file_name is not None
        assert not [ch for ch in item.file_name if unicodedata.category(ch)[0] == "C"]
        assert len(item.file_name) <= 255
        assert item.file_name.endswith(".pdf")
        assert len(item.title) <= 200
    assert (items["n1"].file_name, items["n1"].title) == ("../../etc/passwd.pdf", "../../etc/passwd")
    assert items["n1"].storage_key == "library/drive/statistics/n1/etc-passwd.pdf"
    assert items["n2"].file_name == "a\\b\\..\\c.pdf"
    assert items["n3"].file_name == "Week 1/2 notes.pdf"
    assert items["n4"].file_name == "evil[31mname.pdf"
    assert items["n5"].file_name == "x" * 250 + "\u2026.pdf"
    assert items["n6"].storage_key == "library/drive/statistics/n6/file.pdf"
    assert items["n6"].title == names["n6"].removesuffix(".pdf")
    assert "    - Course materials: 1 entry Drive described oddly" in out
    assert "sneaky.pdf" not in text(out)


def test_shortcuts_are_followed_each_folder_is_read_once_and_resource_keys_go_along(
    db: Session, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    fake.folder("mat1", "Materials", resource_key="0-matkey")
    fake.folder("sub1", "Week 1", parent="mat1", resource_key="0-subkey")
    fake.file("f1", "a.pdf", "sub1", resource_key="0-fkey")
    fake.folder("other1", "Elsewhere")
    fake.file("f2", "b.pdf", "other1", resource_key="0-f2key")
    fake.shortcut("sc1", "b shortcut", "mat1", target="f2")
    fake.shortcut("sc2", "Back to the top", "sub1", target="mat1")
    fake.file("f3", "c.pdf", "other1", access="none")
    fake.shortcut("sc3", "c shortcut", "mat1", target="f3")
    link(db, "statistics", "mat1", resource_key="0-matkey")

    assert run() == 0
    items = imported(db)
    assert sorted(items) == ["a.pdf", "b.pdf"]
    assert items["b.pdf"].import_key == "drive/statistics/f2"
    assert "    - c shortcut: a shortcut to a file Drive won't show (404 notFound)" in out
    assert len([r for r in fake.requests if listing("mat1")(r)]) == 2  # two pages, once: not again via sc2
    sent = {
        r.url.path: r.headers.get("x-goog-drive-resource-keys")
        for r in fake.requests
        if r.url.path != "/drive/v3/files"
    }
    assert sent["/drive/v3/files/mat1"] == "mat1/0-matkey"
    assert sent["/drive/v3/files/f1"] == "f1/0-fkey"
    assert sent["/drive/v3/files/f2"] == "f2/0-f2key"


def test_limit_takes_the_first_files_and_module_one_modules_links(
    db: Session, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    fake.folder("mat1", "Materials")
    for i in range(5):
        fake.file(f"s{i}", f"Week {i + 1}.pdf", "mat1")
    fake.folder("eco1", "Economics")
    fake.file("e1", "Supply.pdf", "eco1")
    link(db, "statistics", "mat1")
    link(db, "economics", "eco1")

    assert run(module_id="statistics", limit=2) == 0
    assert sorted(imported(db)) == ["Week 1.pdf", "Week 2.pdf"]
    assert "This run imports the first 2 (--limit); run the import again for the rest." in out
    assert "3 files wait for the next run (--limit)." in out
    assert not [r for r in fake.requests if "eco1" in str(r.url)]
    assert runs(db)[0].data["module"] == "statistics"
    assert runs(db)[0].data["limit"] == 2
    assert run(module_id="statistics") == 0
    assert len(imported(db)) == 5


def test_quota_errors_are_waited_out_and_a_file_that_keeps_failing_comes_in_next_time(
    db: Session, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    fake.folder("mat1", "Materials")
    fake.file("a1", "a.pdf", "mat1")
    fake.file("b1", "b.pdf", "mat1")
    fake.queue(listing("mat1"), google_error(403, "userRateLimitExceeded", "User Rate Limit Exceeded"))
    fake.queue(media("a1"), *[httpx.Response(503) for _ in range(6)])
    link(db, "statistics", "mat1")

    assert run() == 1
    assert sorted(imported(db)) == ["b.pdf"]
    assert "Failed (run the import again to try them again):" in out
    assert "  statistics: a.pdf: Drive answered 503." in out
    assert runs(db)[0].data["failed"] == 1
    assert run() == 0
    assert sorted(imported(db)) == ["a.pdf", "b.pdf"]


def test_downloads_are_paced_and_slow_down_after_google_blocks_the_run(
    db: Session, storage: Storage, fake: FakeDrive, settings: Settings, modules: dict[str, Module], out: Lines
) -> None:
    fake.folder("mat1", "Materials")
    for name in "abcd":
        fake.file(f"{name}1", f"{name}.pdf", "mat1")
    link(db, "statistics", "mat1")
    fake.queue(media("b1"), automated_queries())
    sleeps: list[float] = []
    with connect(settings, transport=fake.transport, sleep=sleeps.append) as paced:
        paced.jitter = False
        assert import_from_drive(db, paced, storage, pace=1.5, echo=out.append) == 0
    assert sorted(imported(db)) == ["a.pdf", "b.pdf", "c.pdf", "d.pdf"]
    # 1.5 s between files; the block on b.pdf is waited out (60 s), then 3 s between files
    assert sleeps == [1.5, 60.0, 3.0, 3.0]
    assert "Google blocked the requests for a while: 3 s between downloads from now on." in out


def test_a_block_that_does_not_lift_stops_the_run_and_the_next_run_carries_on(
    db: Session, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    fake.folder("mat1", "Materials")
    for name in "abc":
        fake.file(f"{name}1", f"{name}.pdf", "mat1")
    link(db, "statistics", "mat1")
    fake.queue(media("b1"), *[automated_queries() for _ in range(6)])

    assert run() == 1
    assert sorted(imported(db)) == ["a.pdf"]
    stopped = "The import stopped early: Google is refusing requests from this network for now"
    assert any(line.startswith(stopped) for line in out)
    assert not any("c.pdf" in line for line in out if line.startswith("[")), "nothing after the block is tried"
    assert runs(db)[0].data["stopped"].startswith("Google is refusing requests")
    out.clear()
    assert run() == 0
    assert sorted(imported(db)) == ["a.pdf", "b.pdf", "c.pdf"]


def test_a_file_drive_wont_hand_over_is_skipped_with_its_link_and_tried_again_next_run(
    db: Session, fake: FakeDrive, run: Callable[..., int], out: Lines
) -> None:
    fake.folder("mat1", "Materials")
    fake.file("a1", "a.pdf", "mat1")
    fake.file("b1", "b.pdf", "mat1", resource_key="0-key")
    fake.file("c1", "c.pdf", "mat1")
    folder = link(db, "statistics", "mat1")
    fake.queue(media("b1"), google_error(403, "cannotDownloadFile", "The user does not have permission."))
    fake.queue(media("c1"), google_error(403, "insufficientFilePermissions", "No."))

    assert run() == 0
    assert sorted(imported(db)) == ["a.pdf"]
    assert (
        "  statistics: b.pdf: its owner turned off downloads (403 cannotDownloadFile) "
        "(https://drive.google.com/file/d/b1/view?resourcekey=0-key)"
    ) in out
    assert (
        "  statistics: c.pdf: Drive refused the download (403 insufficientFilePermissions) "
        "(https://drive.google.com/file/d/c1/view)"
    ) in out
    assert runs(db)[0].data["refusedFiles"] == [
        {
            "module": "statistics",
            "file": "b.pdf",
            "why": "its owner turned off downloads (403 cannotDownloadFile)",
            "link": "https://drive.google.com/file/d/b1/view?resourcekey=0-key",
        },
        {
            "module": "statistics",
            "file": "c.pdf",
            "why": "Drive refused the download (403 insufficientFilePermissions)",
            "link": "https://drive.google.com/file/d/c1/view",
        },
    ]
    db.refresh(folder)
    assert db.get(DriveFolder, folder.id) is not None  # the folder's row stays

    out.clear()
    assert run() == 0  # Drive hands them over now
    assert sorted(imported(db)) == ["a.pdf", "b.pdf", "c.pdf"]


def test_a_file_another_run_saves_at_the_same_moment_fails_and_the_run_goes_on(
    db: Session, storage: Storage, fake: FakeDrive, run: Callable[..., int], out: Lines, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake.folder("mat1", "Materials")
    fake.file("a1", "a.pdf", "mat1")
    fake.file("b1", "b.pdf", "mat1")
    link(db, "statistics", "mat1")
    put = storage.put_file

    def put_while_another_run_saves_a(key: str, *rest: Any) -> None:
        put(key, *rest)
        if "/a1/" in key:  # the other run's row lands between this run's check and its insert
            db.add(
                LibraryItem(
                    slug=f"other-{uuid.uuid4().hex[:6]}",
                    source=ItemSource.file,
                    kind="course-materials",
                    title="a",
                    import_key="drive/statistics/a1",
                    status=ItemStatus.published,
                )
            )
            db.commit()

    monkeypatch.setattr(storage, "put_file", put_while_another_run_saves_a)
    assert run() == 1
    assert "  statistics: a.pdf: it couldn't be saved: run the import again" in out
    assert sorted(i.title.lower() for i in imported(db).values()) == ["a", "b"]


def test_a_bad_key_stops_the_import_before_anything_happens(
    db: Session, storage: Storage, fake: FakeDrive, settings: Settings, modules: dict[str, Module], out: Lines
) -> None:
    fake.folder("mat1", "Materials")
    link(db, "statistics", "mat1")
    settings.google_api_key = SecretStr("AIza-not-the-key")
    with connect(settings, transport=fake.transport, sleep=lambda _: None) as wrong:
        assert import_from_drive(db, wrong, storage, echo=out.append) == 1
    assert out[-1] == (
        "Google refused the import: API key not valid. Please pass a valid API key. Nothing was imported."
    )
    assert runs(db) == []


def test_a_bucket_that_refuses_files_stops_the_run_and_the_run_is_recorded(
    db: Session, storage: Storage, fake: FakeDrive, run: Callable[..., int], out: Lines, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake.folder("mat1", "Materials")
    fake.file("a1", "a.pdf", "mat1")
    fake.file("b1", "b.pdf", "mat1")
    link(db, "statistics", "mat1")

    def refuse(*_: object) -> None:
        raise ClientError({"Error": {"Code": "AccessDenied", "Message": "Access Denied"}}, "PutObject")

    monkeypatch.setattr(storage, "put_file", refuse)
    assert run() == 1
    assert imported(db) == {}
    assert (
        "The import stopped early: The bucket refused a file (AccessDenied). Run it again: it carries on where it "
        "stopped." in out
    )
    assert runs(db)[0].data["stopped"] == "The bucket refused a file (AccessDenied)."


def test_an_interrupted_run_keeps_what_it_imported_and_is_recorded(
    db: Session, storage: Storage, fake: FakeDrive, run: Callable[..., int], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake.folder("mat1", "Materials")
    fake.file("a1", "a.pdf", "mat1")
    fake.file("b1", "b.pdf", "mat1")
    link(db, "statistics", "mat1")
    put = storage.put_file
    calls: list[str] = []

    def put_then_stop(key: str, *rest: Any) -> None:
        calls.append(key)
        if len(calls) == 2:
            raise KeyboardInterrupt
        put(key, *rest)

    monkeypatch.setattr(storage, "put_file", put_then_stop)
    with pytest.raises(KeyboardInterrupt):
        run()
    assert sorted(imported(db)) == ["a.pdf"]
    [entry] = runs(db)
    assert (entry.data["imported"], entry.data["stopped"]) == (1, "interrupted")


def test_a_service_account_reads_what_is_shared_with_it_when_the_key_cant(
    db: Session,
    storage: Storage,
    fake: FakeDrive,
    settings: Settings,
    modules: dict[str, Module],
    out: Lines,
    tmp_path: Path,
) -> None:
    settings.google_service_account_file = fake.key_file(tmp_path / "key.json")
    fake.folder("public1", "Materials")
    fake.file("a1", "a.pdf", "public1")
    fake.folder("private1", "Shared with the importer only", access="service")
    fake.file("b1", "b.pdf", "private1", access="service")
    fake.folder("bibf1", "BIBF only", access="none")
    link(db, "statistics", "public1")
    link(db, "statistics", "private1", kind="notes", title="Sara's notes")
    link(db, "economics", "bibf1", kind="notes", title="Mahdi's notes")

    with connect(settings, transport=fake.transport, sleep=lambda _: None) as both:
        assert import_from_drive(db, both, storage, echo=out.append) == 0
    assert sorted(imported(db)) == ["a.pdf", "b.pdf"]
    downloads = {r.url.path: r for r in fake.requests if r.url.params.get("alt") == "media"}
    assert "x-goog-api-key" in downloads["/drive/v3/files/a1"].headers  # the key where it works
    assert downloads["/drive/v3/files/b1"].headers["authorization"].startswith("Bearer ya29.fake-")
    assert any(f"or with the service account ({SERVICE_EMAIL})" in line for line in out)


# ── the command ──────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def command(
    db: Session, fake: FakeDrive, settings: Settings, storage: Storage, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`python -m app.cli import-drive` on the test's session, against the fake Drive."""

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: _session)
    real_connect = drive_module.connect
    monkeypatch.setattr(
        drive_module, "connect", lambda s: real_connect(s, transport=fake.transport, sleep=lambda _: None)
    )


@pytest.mark.usefixtures("command")
def test_the_command_asks_before_it_imports(
    db: Session,
    fake: FakeDrive,
    modules: dict[str, Module],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake.folder("mat1", "Materials")
    fake.file("a1", "a.pdf", "mat1")
    link(db, "statistics", "mat1")
    questions: list[str] = []

    def answer(reply: str | None) -> None:
        def _input(question: str) -> str:
            questions.append(question)
            if reply is None:
                raise EOFError
            return reply

        monkeypatch.setattr("builtins.input", _input)

    answer("n")
    assert cli.main(["import-drive"]) == 1
    answer(None)  # no terminal to answer from
    assert cli.main(["import-drive"]) == 1
    assert capsys.readouterr().out.count("Nothing was imported.") == 2
    assert (imported(db), runs(db)) == ({}, [])
    answer("y")
    assert cli.main(["import-drive"]) == 0
    assert questions == ["Import 1 file into the library? [y/N] "] * 3
    assert sorted(imported(db)) == ["a.pdf"]
    assert len(runs(db)) == 1


@pytest.mark.usefixtures("command")
def test_the_command_checks_what_it_is_given(
    settings: Settings, modules: dict[str, Module], capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.main(["import-drive", "--module", "nope", "--dry-run"]) == 2
    assert "There is no module 'nope'. The modules are: advanced-stats-distribution," in capsys.readouterr().err
    for bad in (["--limit", "0"], ["--pace", "-1"], ["--pace", "soon"]):
        with pytest.raises(SystemExit) as stopped:
            cli.main(["import-drive", *bad])
        assert stopped.value.code == 2
    settings.google_api_key = None
    assert cli.main(["import-drive", "--dry-run"]) == 1
    assert "Set DSBA_GOOGLE_API_KEY (or DSBA_GOOGLE_SERVICE_ACCOUNT_FILE) first" in capsys.readouterr().err


@pytest.mark.usefixtures("command")
def test_the_api_key_never_reaches_the_logs_or_the_output(
    db: Session,
    fake: FakeDrive,
    modules: dict[str, Module],
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.DEBUG)
    fake.folder("mat1", "Materials")
    fake.file("a1", "a.pdf", "mat1")
    fake.file("b1", "b.pdf", "mat1")
    link(db, "statistics", "mat1")
    # a retry (logged), and an error whose message quotes the key (printed): neither may show it
    fake.queue(listing("mat1"), google_error(403, "rateLimitExceeded", f"Rate limit for key {API_KEY}"))
    fake.queue(media("b1"), google_error(400, "badRequest", f"Bad request with key={API_KEY}"))

    assert cli.main(["import-drive", "--dry-run"]) == 0
    assert cli.main(["import-drive", "--yes"]) == 1
    printed = capsys.readouterr()
    assert "  statistics: b.pdf: Bad request with key=[hidden]" in printed.out
    assert API_KEY not in printed.out + printed.err
    assert caplog.records
    assert any(r.name == "httpx" for r in caplog.records)  # httpx logs every request's URL: without the key
    assert any(r.name == "dsba.drive" for r in caplog.records)  # the retry
    assert API_KEY not in caplog.text
    for record in caplog.records:
        assert API_KEY not in record.getMessage()
        assert API_KEY not in repr(record.args)
    assert API_KEY not in json.dumps(runs(db)[0].data)
    google = [r for r in fake.requests if r.url.host == "www.googleapis.com"]
    assert all(r.headers["x-goog-api-key"] == API_KEY for r in google)
    assert all(API_KEY not in str(r.url) for r in google)


def test_no_layer_logs_the_key_on_a_real_connection(
    db: Session,
    storage: Storage,
    settings: Settings,
    modules: dict[str, Module],
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The same, through httpx's real transport (httpcore logs too) to a local server standing in for Google."""
    seen: list[str] = []
    answers: dict[str, bytes] = {
        "/drive/v3/files/real1": json.dumps({"id": "real1", "name": "Materials", "mimeType": FOLDER}).encode(),
        "/drive/v3/files": json.dumps(
            {"files": [{"id": "pdf1", "name": "a.pdf", "mimeType": "application/pdf", "size": str(len(PDF))}]}
        ).encode(),
        "/drive/v3/files/pdf1": PDF,
    }

    class Google(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            seen.append(self.headers.get("X-Goog-Api-Key", ""))
            body = answers.get(self.path.partition("?")[0])
            self.send_response(200 if body is not None else 404)
            self.send_header("Content-Length", str(len(body or b"")))
            self.end_headers()
            self.wfile.write(body or b"")

        def log_message(self, *_: Any) -> None:
            return None

    server = ThreadingHTTPServer(("127.0.0.1", 0), Google)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        monkeypatch.setattr(drive_module, "API", f"http://127.0.0.1:{server.server_port}/drive/v3")
        caplog.set_level(logging.DEBUG)
        link(db, "statistics", "real1")
        with connect(settings, sleep=lambda _: None) as real:
            assert import_from_drive(db, real, storage, echo=lambda _: None) == 0
    finally:
        server.shutdown()
        server.server_close()
    assert seen == [API_KEY] * 3
    assert sorted(imported(db)) == ["a.pdf"]
    assert any(r.name.startswith("httpcore") for r in caplog.records)
    assert API_KEY not in caplog.text
