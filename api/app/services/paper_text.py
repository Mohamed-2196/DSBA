"""Search inside papers, and their covers: the words of published PDF and Word files, kept in `library_texts`, and
the first page of each as a small WebP picture in the bucket (covers/<item id>.webp).

- The text worker (`python -m app.cli text-worker`) takes published files that have no text row yet, one at a
  time, oldest first: it claims one with a 'working' row (committed at once, so other workers pass it by), reads
  the file from the bucket and fills the row. Files are published by uploads, reviews and the Drive import alike:
  the worker finds them all, so none of those requests waits for a file to be read. The same reading makes the
  file's cover and notes the SHA-256 of its bytes (library_items.content_hash), so a second copy of a file is
  shown once.
  `python -m app.cli extract-texts` does the same until nothing is left (the backfill), and can read failed or
  empty files again. `python -m app.cli make-covers` makes the covers (and hashes) of files read before covers
  existed.
- Guards: only files up to MAX_FILE_BYTES are read; the reading itself runs in a child process
  (app/services/text_extract.py) that is killed after TIME_LIMIT seconds and limited to MEMORY_LIMIT bytes, with
  its pages and characters capped, and given no secrets: its environment holds PATH and PYTHONPATH only (security
  review SEC-33). A file that trips any of these is marked failed and never tried again on its
  own. A claim left 'working' longer than STALE (a worker died) is taken again.
- Searching: content_match() is the condition "its text matches", served by the GIN index on library_texts;
  matches() finds the page and the words around the first match, for the result's snippet."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import signal
import subprocess
import sys
import threading
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import timedelta
from types import FrameType
from typing import Any

from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.text import snippet
from app.core.time import utcnow
from app.models import ItemSource, ItemStatus, LibraryItem, LibraryText, TextStatus
from app.services.storage import Storage

log = logging.getLogger("dsba.texts")

FORMATS = ("pdf", "docx")  # the files that have text to read (by extension)
MAX_FILE_BYTES = 60 * 1024 * 1024
TIME_LIMIT = 60  # seconds the reader may take over one file
MEMORY_LIMIT = 1024 * 1024 * 1024  # bytes of address space for the reader (Linux; macOS ignores it)
STALE = timedelta(minutes=15)
PAGE_BREAK = "\f"
COVER_TYPE = "image/webp"


class ReadError(Exception):
    """Why a file's text couldn't be read (short: it goes in library_texts.error)."""


# ── reading one file ─────────────────────────────────────────────────────────────────────────


def text_format(file_name: str | None) -> str | None:
    """'pdf' or 'docx' for a file with text to read, by its name's extension."""
    stem, dot, ext = (file_name or "").rpartition(".")
    return ext.lower() if dot and stem and ext.lower() in FORMATS else None


def _limit_memory() -> None:  # pragma: no cover - runs in the child, before it starts
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT, MEMORY_LIMIT))
    except (ImportError, ValueError, OSError):
        pass


def cover_key(item_id: uuid.UUID) -> str:
    return f"covers/{item_id}.webp"


_API_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _child_env() -> dict[str, str]:
    """The reader's whole environment: where Python and our package are, nothing else (no keys, no passwords)."""
    return {"PATH": os.environ.get("PATH", ""), "PYTHONPATH": _API_ROOT}


@dataclass(frozen=True)
class Reading:
    pages: list[str] | None  # None when the text wasn't asked for
    cover: bytes | None  # WebP; None when it wasn't asked for or the file gives none
    cover_error: str | None = None


def read_file(
    fmt: str, data: bytes, *, text: bool = True, cover: bool = True, time_limit: float = TIME_LIMIT
) -> Reading:
    """The pages of a file and its cover, read in a child process with a time and memory limit and no secrets.
    Raises ReadError when the reader fails, or when the text was asked for and can't be read."""
    cmd = [sys.executable, "-m", "app.services.text_extract", fmt]
    if cover:
        cmd.append("--cover")
    if not text:
        cmd.append("--no-text")
    try:
        done = subprocess.run(  # noqa: S603 - fixed argv: this interpreter, our module, a format from FORMATS
            cmd,
            input=data,
            capture_output=True,
            timeout=time_limit,
            check=False,
            cwd=_API_ROOT,
            env=_child_env(),
            preexec_fn=_limit_memory if sys.platform == "linux" else None,
        )
    except subprocess.TimeoutExpired as e:
        raise ReadError(f"took longer than {time_limit:.0f} s") from e
    if done.returncode != 0:
        raise ReadError(f"the reader stopped (exit {done.returncode})")
    try:
        out = json.loads(done.stdout)
    except ValueError as e:
        raise ReadError("the reader's answer was unreadable") from e
    if not isinstance(out, dict):
        raise ReadError("the reader's answer was unreadable")
    if text and "error" in out:
        raise ReadError(str(out["error"])[:200])
    pages = out.get("pages") if text else None
    if text and (not isinstance(pages, list) or not all(isinstance(p, str) for p in pages)):
        raise ReadError("the reader's answer was unreadable")
    picture: bytes | None = None
    raw = out.get("cover")
    if cover and isinstance(raw, str):
        try:
            picture = base64.b64decode(raw, validate=True)
        except ValueError as e:
            raise ReadError("the reader's cover was unreadable") from e
    reason = out.get("cover_error")
    return Reading(pages=pages, cover=picture, cover_error=str(reason)[:200] if isinstance(reason, str) else None)


def read_pages(fmt: str, data: bytes, *, time_limit: float = TIME_LIMIT) -> list[str]:
    """The pages of a file only (no cover). Raises ReadError."""
    return read_file(fmt, data, cover=False, time_limit=time_limit).pages or []


def _store_cover(storage: Storage, item_id: uuid.UUID, reading: Reading) -> str | None:
    """Puts the cover in the bucket. -> its key, or None when there is none."""
    if reading.cover is None:
        if reading.cover_error:
            log.info("no cover for library item %s: %s", item_id, reading.cover_error)
        return None
    key = cover_key(item_id)
    storage.put_bytes(key, reading.cover, COVER_TYPE)
    return key


def _note_hash(db: Session, item_id: uuid.UUID, data: bytes) -> None:
    db.execute(
        update(LibraryItem)
        .where(LibraryItem.id == item_id, LibraryItem.content_hash.is_(None))
        .values(content_hash=hashlib.sha256(data).hexdigest())
    )


# ── the queue ────────────────────────────────────────────────────────────────────────────────


def _readable() -> ColumnElement[bool]:
    """Published files with a format that has text."""
    return and_(
        LibraryItem.source == ItemSource.file,
        LibraryItem.status == ItemStatus.published,
        LibraryItem.storage_key.is_not(None),
        or_(*(LibraryItem.file_name.ilike(f"%.{fmt}") for fmt in FORMATS)),
    )


@dataclass(frozen=True)
class Claimed:
    id: uuid.UUID
    file_name: str | None
    storage_key: str | None


def claim(db: Session) -> Claimed | None:
    """Takes the oldest published file without text (or whose claim went stale) for this worker, and commits."""
    stale = select(LibraryText.item_id).where(
        LibraryText.status == TextStatus.working, LibraryText.started_at < utcnow() - STALE
    )
    has_text = select(LibraryText.item_id).where(LibraryText.item_id == LibraryItem.id)
    item = db.scalar(
        select(LibraryItem)
        .where(_readable(), or_(~has_text.exists(), LibraryItem.id.in_(stale)))
        .order_by(LibraryItem.published_at.asc().nulls_last(), LibraryItem.id)
        .limit(1)
        .with_for_update(of=LibraryItem, skip_locked=True)
    )
    if item is None:
        db.rollback()
        return None
    claimed = Claimed(item.id, item.file_name, item.storage_key)
    now = utcnow()
    db.execute(
        insert(LibraryText)
        .values(item_id=item.id, status=TextStatus.working, started_at=now)
        .on_conflict_do_update(
            index_elements=[LibraryText.item_id],
            set_={"status": TextStatus.working, "started_at": now, "error": None},
        )
    )
    db.commit()
    return claimed


def read_item(db: Session, item: Claimed, storage: Storage, *, time_limit: float = TIME_LIMIT) -> TextStatus:
    """Reads a claimed file (no transaction is open meanwhile), then stores what came of it. The caller commits."""
    body: str | None = None
    pages: int | None = None
    error: str | None = None
    cover: str | None = None
    fmt = text_format(item.file_name)
    try:
        data = _fetch(item, storage)
        _note_hash(db, item.id, data)
        reading = read_file(fmt or "", data, time_limit=time_limit)
        found = reading.pages or []
        cover = _store_cover(storage, item.id, reading)
    except ReadError as e:
        status, error = TextStatus.failed, str(e)[:200]
        log.warning("no text from library item %s: %s", item.id, error)
    else:
        status = TextStatus.done if any(p.strip() for p in found) else TextStatus.empty
        if status == TextStatus.done:
            body = PAGE_BREAK.join(found)
            pages = len(found) if fmt == "pdf" else None
    row = db.get(LibraryText, item.id)
    if row is None:
        row = LibraryText(item_id=item.id)
        db.add(row)
    row.status, row.body, row.pages, row.error, row.finished_at = status, body, pages, error, utcnow()
    row.cover_key = cover
    return status


def _fetch(item: Claimed, storage: Storage) -> bytes:
    """The file's bytes from the bucket. Raises ReadError when it has no text format, is gone or is too big."""
    if text_format(item.file_name) is None or item.storage_key is None:
        raise ReadError("no text to read in this kind of file")
    data = storage.read_head(item.storage_key, MAX_FILE_BYTES + 1)
    if data is None:
        raise ReadError("the file isn't in the bucket")
    if len(data) > MAX_FILE_BYTES:
        raise ReadError(f"bigger than {MAX_FILE_BYTES // (1024 * 1024)} MB")
    return data


def without_cover(db: Session, limit: int | None = None, *, pdf_only: bool = False) -> list[Claimed]:
    """Published files read before covers existed: text read (with or without words), no cover yet."""
    query = (
        select(LibraryItem.id, LibraryItem.file_name, LibraryItem.storage_key)
        .join(LibraryText, LibraryText.item_id == LibraryItem.id)
        .where(
            _readable(),
            LibraryText.status.in_((TextStatus.done, TextStatus.empty)),
            LibraryText.cover_key.is_(None),
        )
        .order_by(LibraryItem.published_at.asc().nulls_last(), LibraryItem.id)
    )
    if pdf_only:
        query = query.where(LibraryItem.file_name.ilike("%.pdf"))
    if limit is not None:
        query = query.limit(limit)
    return [Claimed(i, name, key) for i, name, key in db.execute(query).all()]


def make_cover(db: Session, item: Claimed, storage: Storage, *, time_limit: float = TIME_LIMIT) -> bool:
    """Makes one file's cover (and notes its hash). -> whether it has one now. The caller commits."""
    try:
        data = _fetch(item, storage)
        _note_hash(db, item.id, data)
        reading = read_file(text_format(item.file_name) or "", data, text=False, time_limit=time_limit)
        key = _store_cover(storage, item.id, reading)
    except ReadError as e:
        log.warning("no cover for library item %s: %s", item.id, e)
        return False
    if key is None:
        return False
    db.execute(update(LibraryText).where(LibraryText.item_id == item.id).values(cover_key=key))
    return True


def drain(
    sessions: Callable[[], AbstractContextManager[Session]],
    storage: Storage,
    *,
    limit: int | None = None,
    stop: threading.Event | None = None,
) -> dict[TextStatus, int]:
    """Reads files until none is waiting (or `limit` files, or `stop`). -> how many ended in each state."""
    counts = dict.fromkeys(TextStatus, 0)
    while (limit is None or sum(counts.values()) < limit) and not (stop and stop.is_set()):
        with sessions() as db:
            item = claim(db)
            if item is None:
                break
            status = read_item(db, item, storage)
            db.commit()
        counts[status] += 1
    return counts


def forget(db: Session, statuses: tuple[TextStatus, ...]) -> int:
    """Drops the rows in these states, so their files are read again. The caller commits."""
    result = db.execute(delete(LibraryText).where(LibraryText.status.in_(statuses)))
    return int(getattr(result, "rowcount", 0) or 0)


def waiting(db: Session) -> int:
    """Published files whose text hasn't been read yet."""
    has_text = select(LibraryText.item_id).where(LibraryText.item_id == LibraryItem.id)
    return db.scalar(select(func.count()).select_from(LibraryItem).where(_readable(), ~has_text.exists())) or 0


def run_worker(
    sessions: Callable[[], AbstractContextManager[Session]],
    storage: Storage,
    *,
    poll_seconds: float = 10.0,
    stop: threading.Event | None = None,
) -> int:
    """Reads files as they are published until stopped (SIGTERM, SIGINT: after the file in hand)."""
    stop = stop or threading.Event()

    def _stop(signum: int, _frame: FrameType | None) -> None:
        log.info("text worker stopping (signal %d)", signum)
        stop.set()

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)
    log.info("text worker started")
    attempted_covers: set[uuid.UUID] = set()
    while not stop.is_set():
        try:
            counts = drain(sessions, storage, stop=stop)
            if not any(counts.values()) and not stop.is_set():
                with sessions() as db:
                    missing = [c for c in without_cover(db, limit=25, pdf_only=True) if c.id not in attempted_covers]
                if missing:
                    made = 0
                    for item in missing:
                        if stop.is_set():
                            break
                        attempted_covers.add(item.id)
                        with sessions() as db:
                            if make_cover(db, item, storage):
                                made += 1
                            db.commit()
                    if made:
                        log.info("text worker backfilled %d cover(s)", made)
                        continue
        except SQLAlchemyError:
            log.exception("text worker: database error; trying again in %.0f s", poll_seconds)
            counts = {}
        if any(counts.values()):
            log.info("text worker read %s", ", ".join(f"{n} {s.value}" for s, n in counts.items() if n))
        stop.wait(poll_seconds)
    log.info("text worker stopped")
    return 0


# ── searching ────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Match:
    snippet: str
    page: int | None  # 1-based, PDFs only


def content_match(tsq: ColumnElement[Any]) -> ColumnElement[bool]:
    """The item's text matches the query (served by ix_library_texts_search)."""
    return LibraryItem.id.in_(select(LibraryText.item_id).where(LibraryText.search_vector.bool_op("@@")(tsq)))


def find(body: str, terms: list[str], *, paged: bool) -> Match | None:
    """The first page where any of the terms appears, and the words around it."""
    for number, page in enumerate(body.split(PAGE_BREAK), start=1):
        low = page.lower()
        if any(t in low for t in terms):
            cut = snippet(page, terms)
            if cut:
                return Match(snippet=cut, page=number if paged else None)
    return None


def matches(db: Session, item_ids: list[uuid.UUID], terms: list[str]) -> dict[uuid.UUID, Match]:
    """Where the terms appear in each item's text (items without text, or where they don't appear, are left out)."""
    if not item_ids or not terms:
        return {}
    rows = db.execute(
        select(LibraryText.item_id, LibraryText.body, LibraryText.pages).where(
            LibraryText.item_id.in_(item_ids), LibraryText.status == TextStatus.done
        )
    ).all()
    out: dict[uuid.UUID, Match] = {}
    for item_id, body, pages in rows:
        found = find(body or "", terms, paged=pages is not None)
        if found:
            out[item_id] = found
    return out
