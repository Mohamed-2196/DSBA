"""Search inside papers (the text worker, the backfill, matches with their page) and lessons in search."""

from __future__ import annotations

import contextlib
import json
import os
import secrets
import subprocess
import sys
import uuid
from collections.abc import Callable, Iterator
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, create_engine, delete, select, update
from sqlalchemy import text as sql_text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.cli import main as cli
from app.config import get_settings
from app.core.time import utcnow
from app.db import sessions_for
from app.models import ItemSource, ItemStatus, LibraryItem, LibraryText, Module, Note, TextStatus, User, UserSession
from app.services import paper_text
from app.services.paper_text import ReadError, read_pages
from app.services.text_extract import MAX_CHARS
from tests.content.conftest import API
from tests.content.pdfs import make_docx, make_pdf

Clients = Callable[..., TestClient]
ST2133 = "advanced-stats-distribution"
PAPER = ["Question 1. Find the MGF of X.", "", "Question 2. Derive the Cramer-Rao lower bound for theta."]


def _file(db: Session, storage: Any, title: str, name: str, data: bytes, **extra: Any) -> LibraryItem:
    key = f"library/{uuid.uuid4()}/{name}"
    storage.put_bytes(key, data, "application/octet-stream")
    fields: dict[str, Any] = {
        "slug": f"f-{uuid.uuid4().hex[:8]}",
        "source": ItemSource.file,
        "kind": "past-paper",
        "title": title,
        "module_id": ST2133,
        "year": 2,
        "storage_key": key,
        "file_name": name,
        "content_type": "application/pdf",
        "size_bytes": len(data),
        "status": ItemStatus.published,
        "published_at": utcnow(),
    }
    fields.update(extra)
    item = LibraryItem(**fields)
    db.add(item)
    db.commit()
    return item


def _sessions(db: Session) -> Callable[[], contextlib.AbstractContextManager[Session]]:
    @contextlib.contextmanager
    def _one() -> Iterator[Session]:
        yield db

    return _one


def _text(db: Session, item: LibraryItem) -> LibraryText:
    row = db.get(LibraryText, item.id, populate_existing=True)
    assert row is not None
    return row


# ── reading files ────────────────────────────────────────────────────────────────────────────


def test_pages_are_read_from_pdfs_and_word_files() -> None:
    assert read_pages("pdf", make_pdf(PAPER)) == PAPER
    assert read_pages("docx", make_docx(["Supply &amp; demand", "Elasticity"])) == ["Supply & demand\nElasticity"]


@pytest.mark.parametrize(
    ("fmt", "data"),
    [("pdf", b"%PDF-1.4 not really"), ("docx", b"PK\x03\x04 not a zip"), ("docx", make_pdf(["x"]))],
)
def test_damaged_files_fail_cleanly(fmt: str, data: bytes) -> None:
    with pytest.raises(ReadError):
        read_pages(fmt, data)


def test_a_reader_that_takes_too_long_is_stopped() -> None:
    with pytest.raises(ReadError, match="took longer"):
        read_pages("pdf", make_pdf(PAPER), time_limit=0.001)


def test_text_is_capped() -> None:
    pages = read_pages("pdf", make_pdf(["word " * 2000] * 200))
    assert sum(len(p) for p in pages) <= MAX_CHARS


# ── the worker and the backfill ──────────────────────────────────────────────────────────────


@pytest.fixture
def papers(db: Session, storage: Any, modules: dict[str, Module]) -> dict[str, LibraryItem]:
    return {
        "paper": _file(db, storage, "ST2133 2021 Zone A", "st2133-2021-a.pdf", make_pdf(PAPER)),
        "notes": _file(db, storage, "Week 3 notes", "week3.docx", make_docx(["The likelihood principle"])),
        "scan": _file(db, storage, "Scanned paper", "scan.pdf", make_pdf(["", ""])),
        "broken": _file(db, storage, "Broken paper", "broken.pdf", b"%PDF-1.4 broken"),
        "sheet": _file(db, storage, "Marks", "marks.xlsx", b"PK\x03\x04"),
        "pending": _file(db, storage, "Waiting", "wait.pdf", make_pdf(["pending"]), status=ItemStatus.pending),
    }


def test_the_worker_reads_each_published_file_once(db: Session, storage: Any, papers: dict[str, LibraryItem]) -> None:
    assert paper_text.waiting(db) == 4
    counts = paper_text.drain(_sessions(db), storage)
    assert counts == {TextStatus.working: 0, TextStatus.done: 2, TextStatus.empty: 1, TextStatus.failed: 1}
    paper = _text(db, papers["paper"])
    assert (paper.status, paper.pages) == (TextStatus.done, 3)
    assert paper.body is not None
    assert paper.body.split(paper_text.PAGE_BREAK)[2].startswith("Question 2")
    notes = _text(db, papers["notes"])
    assert (notes.status, notes.pages, notes.body) == (TextStatus.done, None, "The likelihood principle")
    assert _text(db, papers["scan"]).status == TextStatus.empty
    broken = _text(db, papers["broken"])
    assert broken.status == TextStatus.failed
    assert broken.error
    assert db.get(LibraryText, papers["sheet"].id) is None  # no text to read in a spreadsheet
    assert db.get(LibraryText, papers["pending"].id) is None  # not published
    assert paper_text.waiting(db) == 0
    assert sum(paper_text.drain(_sessions(db), storage).values()) == 0  # nothing is read twice


def test_files_too_big_are_not_read(
    db: Session, storage: Any, papers: dict[str, LibraryItem], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(paper_text, "MAX_FILE_BYTES", 100)
    paper_text.drain(_sessions(db), storage)
    row = _text(db, papers["paper"])
    assert row.status == TextStatus.failed
    assert "bigger than" in (row.error or "")


def test_a_stale_claim_is_taken_again(db: Session, storage: Any, papers: dict[str, LibraryItem]) -> None:
    paper_text.drain(_sessions(db), storage)
    row = _text(db, papers["paper"])
    row.status, row.body, row.started_at = TextStatus.working, None, utcnow() - timedelta(hours=1)
    db.commit()
    assert paper_text.drain(_sessions(db), storage)[TextStatus.done] == 1
    assert _text(db, papers["paper"]).status == TextStatus.done


def test_the_backfill_command(
    db: Session,
    storage: Any,
    papers: dict[str, LibraryItem],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr("app.cli.texts_worker", lambda: (_sessions(db), storage))
    assert cli(["extract-texts", "--limit", "1"]) == 0
    assert "4 file(s) to read" in capsys.readouterr().out
    assert cli(["extract-texts"]) == 0
    assert "read 3 file(s)" in capsys.readouterr().out
    assert cli(["extract-texts", "--retry"]) == 0
    out = capsys.readouterr().out
    assert "reading 2 failed or empty file(s) again" in out
    assert "read 2 file(s): 0 with text, 1 without (scans), 1 failed" in out


# ── searching inside ─────────────────────────────────────────────────────────────────────────


@pytest.fixture
def read(db: Session, storage: Any, papers: dict[str, LibraryItem]) -> dict[str, LibraryItem]:
    paper_text.drain(_sessions(db), storage)
    return papers


def test_search_finds_words_inside_papers_with_their_page(
    read: dict[str, LibraryItem], client_for: Clients, storage: Any, db: Session
) -> None:
    titled = _file(db, storage, "Cramer-Rao bound notes", "cr.pdf", make_pdf(["nothing"]), kind="notes")
    r = client_for().get(f"{API}/search", params={"q": "cramer ra", "types": "library"})
    hits = r.json()["library"]
    assert [h["title"] for h in hits] == [titled.title, "ST2133 2021 Zone A"]  # its title matches: first
    assert hits[0]["page"] is None
    inside = hits[1]
    assert inside["page"] == 3
    assert inside["url"] == f"/library/{read['paper'].slug}?page=3"
    assert inside["meta"] == "Past paper · ST2133 · Page 3"
    assert "Cramer-Rao lower bound" in inside["snippet"]
    word = client_for().get(f"{API}/search", params={"q": "likelihood", "types": "library"}).json()["library"]
    assert [(h["title"], h["page"]) for h in word] == [("Week 3 notes", None)]
    assert word[0]["snippet"] == "The likelihood principle"


def test_the_library_list_finds_words_inside_files(read: dict[str, LibraryItem], client_for: Clients) -> None:
    r = client_for().get(f"{API}/library/items", params={"q": "cramer", "sort": "relevance"})
    items = r.json()["items"]
    assert [i["title"] for i in items] == ["ST2133 2021 Zone A"]
    assert items[0]["match"] == {"snippet": "Question 2. Derive the Cramer-Rao lower bound for theta.", "page": 3}
    titled = client_for().get(f"{API}/library/items", params={"q": "zone"}).json()["items"]
    assert [i["match"] for i in titled] == [None]  # found by its title: no match inside shown


def test_text_of_unpublished_files_is_never_found(
    read: dict[str, LibraryItem], client_for: Clients, db: Session
) -> None:
    read["paper"].status = ItemStatus.removed
    db.commit()
    assert client_for().get(f"{API}/search", params={"q": "cramer", "types": "library"}).json()["library"] == []
    assert db.scalar(select(LibraryText.status).where(LibraryText.item_id == read["paper"].id)) == TextStatus.done


# ── lessons ──────────────────────────────────────────────────────────────────────────────────


def test_search_finds_chapters_then_videos(modules: dict[str, Module], client_for: Clients, db: Session) -> None:
    economics = modules["economics"]
    chapter = next(c for c in economics.chapters if c.title == "Supply and Demand")
    hits = client_for().get(f"{API}/search", params={"q": "supply and dem", "types": "lesson"}).json()["lessons"]
    assert hits[0] == {
        "type": "lesson",
        "id": chapter.id,
        "title": "Supply and Demand",
        "snippet": None,
        "url": f"/modules/economics/lessons/{chapter.lessons[0].id}",
        "meta": "EC1002 · Chapter",
        "date": None,
        "page": None,
    }
    videos = [h for h in hits if h["meta"].endswith("Video")]
    assert videos, hits
    assert all(h["url"].startswith("/modules/") for h in videos)
    # A video's own title: "comparative" is in no chapter title.
    found = client_for().get(f"{API}/search", params={"q": "comparative advantage", "types": "lesson"}).json()
    law = next(h for h in found["lessons"] if h["title"] == "Law of Comparative Advantage")
    assert (law["snippet"], law["meta"]) == ("The Economic Problem", "EC1002 · Video")

    chapter.hidden = True
    db.commit()
    hidden = client_for().get(f"{API}/search", params={"q": "supply and dem", "types": "lesson"}).json()["lessons"]
    assert all(h["id"] != chapter.id and "Supply and Demand - Part" not in h["title"] for h in hidden)


def test_the_sweep_drops_the_text_with_the_file(read: dict[str, LibraryItem], db: Session, storage: Any) -> None:
    from app.services.library import sweep_files

    read["paper"].status = ItemStatus.removed
    db.commit()
    assert sweep_files(db, storage, now=utcnow() + timedelta(days=30)) >= 1
    db.commit()
    assert db.get(LibraryText, read["paper"].id, populate_existing=True) is None


# ── what a reader and the worker can reach ───────────────────────────────────────────────────

# Run in a worker process of its own, with made-up settings: a reader started as read_file() starts one (same user,
# same environment) tries to read the worker's environment back from /proc, before the worker has read a file and
# after.
PEEK_FROM_A_READER = """
import json, subprocess, sys
from app.services import paper_text

PEEK = (
    "import os\\n"
    "try:\\n"
    "    print(open(f'/proc/{os.getppid()}/environ', 'rb').read().decode(errors='replace'))\\n"
    "except OSError as e:\\n"
    "    print(type(e).__name__)\\n"
)


def peek():
    done = subprocess.run(
        [sys.executable, "-c", PEEK], capture_output=True, timeout=30, check=True, cwd=paper_text._API_ROOT,
        env=paper_text._child_env(), preexec_fn=paper_text._limit_memory,
    )
    return done.stdout.decode().strip()


before = peek()
try:
    paper_text.read_pages("pdf", b"%PDF-1.4 not really")
except paper_text.ReadError:
    pass
print(json.dumps({"before": before, "after": peek()}))
"""


@pytest.mark.skipif(sys.platform != "linux", reason="/proc is Linux's; production and CI run Linux")
def test_a_reader_cannot_read_the_workers_settings_back_from_proc() -> None:
    """The reader's own environment holds no setting, and it runs as the worker's user: before the worker starts one,
    it makes itself non-dumpable, so code running in the reader can't read the worker's /proc files either (it could
    before, which shows the check is real)."""
    secret = "made-up-secret-key-for-the-reader-test"
    env = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": paper_text._API_ROOT,
        "DSBA_SECRET_KEY": secret,
        "DSBA_DATABASE_URL": "postgresql+psycopg://dsba:made-up-password@db:5432/dsba",
    }
    done = subprocess.run(  # noqa: S603 - this interpreter, a fixed script
        [sys.executable, "-c", PEEK_FROM_A_READER],
        cwd=paper_text._API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    seen = json.loads(done.stdout.strip().splitlines()[-1])
    assert f"DSBA_SECRET_KEY={secret}" in seen["before"]
    assert seen["after"] == "PermissionError"


@pytest.fixture
def owner(engine: Engine) -> Iterator[sessionmaker[Session]]:
    """The database owner's sessions on connections of their own: what they commit is real."""
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessions_for(separate)
    separate.dispose()


def test_the_workers_database_role_reaches_only_what_the_worker_needs(
    owner: sessionmaker[Session],
    engine: Engine,
    storage: Any,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """`texts-role` (after every migration in production) gives the worker's role the two tables it reads and
    writes, and nothing else: the worker reads a file as that role, and anything else is refused."""
    role, password = f"dsba_texts_{uuid.uuid4().hex[:8]}", secrets.token_urlsafe(32)
    monkeypatch.setattr(paper_text, "WORKER_ROLE", role)
    monkeypatch.setattr("app.cli.get_sessionmaker", lambda: owner)
    settings = get_settings()
    monkeypatch.setattr(settings, "texts_db_password", None)
    assert cli(["texts-role"]) == 1
    assert "DSBA_TEXTS_DB_PASSWORD is not set" in capsys.readouterr().err
    monkeypatch.setattr(settings, "texts_db_password", SecretStr("too short: and @ in a URL"))
    assert cli(["texts-role"]) == 1
    assert "Use 24 or more letters, digits, - and _" in capsys.readouterr().err

    key, item_id = f"library/{uuid.uuid4()}/paper.pdf", uuid.uuid4()
    storage.put_bytes(key, make_pdf(PAPER), "application/pdf")
    as_worker = create_engine(
        engine.url.set(username=role, password=password).render_as_string(hide_password=False), poolclass=NullPool
    )
    try:
        with owner() as s:
            s.add(
                LibraryItem(
                    id=item_id,
                    slug=f"f-{item_id.hex[:8]}",
                    source=ItemSource.file,
                    kind="past-paper",
                    title="A paper the worker reads",
                    storage_key=key,
                    file_name="paper.pdf",
                    content_type="application/pdf",
                    size_bytes=1,
                    status=ItemStatus.published,
                    published_at=utcnow(),
                )
            )
            s.commit()
        monkeypatch.setattr(settings, "texts_db_password", SecretStr(password))
        assert cli(["texts-role"]) == 0
        assert cli(["texts-role"]) == 0  # again, as after the next migration
        assert f"database role {role} is set up" in capsys.readouterr().out

        worker = sessions_for(as_worker)
        paper_text.drain(worker, storage)
        with worker() as w:
            row = w.get(LibraryText, item_id)
            assert row is not None
            assert (row.status, row.cover_key) == (TextStatus.done, paper_text.cover_key(item_id))
            assert w.scalar(select(LibraryItem.content_hash).where(LibraryItem.id == item_id)) is not None
            assert paper_text.without_cover(w) == []
            paper_text.forget(w, (TextStatus.failed,))
            w.commit()
            for elsewhere in (
                select(User.email),
                select(UserSession.token_hash),
                select(Note.text),
                update(LibraryItem).where(LibraryItem.id == item_id).values(title="Changed"),
                delete(LibraryItem).where(LibraryItem.id == item_id),
            ):
                with pytest.raises(ProgrammingError, match="permission denied"):
                    w.execute(elsewhere)
                w.rollback()
    finally:
        as_worker.dispose()
        with owner() as s:
            s.execute(delete(LibraryText).where(LibraryText.item_id == item_id))
            s.execute(delete(LibraryItem).where(LibraryItem.id == item_id))
            s.execute(sql_text(f'DROP OWNED BY "{role}"'))
            s.execute(sql_text(f'DROP ROLE IF EXISTS "{role}"'))
            s.commit()
