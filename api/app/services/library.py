"""The library: uploaded and imported files and links, stars, reviews, and how an item looks to the person asking.

Visibility: published items are public. Pending and rejected items are seen only by their uploader and by people
who manage the library (library.manage), removed ones only by them; everyone else gets a 404, as if they did not
exist."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import Select, case, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.access import Box
from app.core.errors import ApiError, conflict, forbidden, invalid, not_found, unauthenticated
from app.core.text import has_latin, insert_with_unique_slug, short_id, slugify
from app.core.time import utcnow
from app.models import (
    ItemSource,
    ItemStatus,
    LibraryItem,
    LibraryStar,
    Module,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
)
from app.schemas.library import (
    FileLink,
    LibraryFacets,
    LibraryItemCreate,
    LibraryItemUpdate,
    LibraryKind,
    LibraryLinkCreate,
    PaperSittings,
    Sitting,
    SittingZone,
)
from app.schemas.library import LibraryItem as LibraryItemOut
from app.schemas.notifications import NotificationKind
from app.services import access, ratelimit
from app.services.accounts import public_user
from app.services.content import apply_patch, record
from app.services.modules import require_module
from app.services.notify import notify
from app.services.storage import INLINE_TYPES, Storage, get_storage
from app.services.uploads import extension, serve_type

log = logging.getLogger("dsba.library")

MAX_PENDING = 10  # files one student may have waiting for review (security review SEC-14)
FILE_GRACE = timedelta(days=7)  # a rejected or removed file stays in the bucket this long, then the sweep deletes it
# When the reference material counts as published (the seeded links, and the files the Drive import brings in from
# their folders): before anything students share, so "newest first" lists their uploads above it whenever the seed
# or the import ran.
REFERENCE_PUBLISHED_AT = datetime(2026, 9, 1, tzinfo=UTC)

KIND_LABELS: dict[str, str] = {
    "past-paper": "Past paper",
    "examiners-report": "Examiners\u2019 report",
    "exam-solutions": "Solutions",
    "subject-guide": "Subject guide",
    "reading": "Essential reading",
    "study-guide": "Study guide",
    "exercises": "Exercise set",
    "notes": "Students\u2019 notes",
    "cheat-sheet": "Cheat sheet",
    "course-materials": "Course materials",
    "vle-materials": "VLE materials",
    "other": "Other",
}
# Extra words a kind is found by in search (the 'simple' configuration has no stemming).
KIND_WORDS: dict[str, str] = {
    "past-paper": "past paper papers exam exams",
    "examiners-report": "examiners examiner report reports commentary commentaries",
    "exam-solutions": "solutions solution answers exam",
    "subject-guide": "subject guide guides book books",
    "reading": "essential reading readings",
    "study-guide": "study guide guides",
    "exercises": "exercise exercises practice questions",
    "notes": "notes note",
    "cheat-sheet": "cheat sheet sheets",
    "course-materials": "course materials material books",
    "vle-materials": "vle materials material",
}
FORMATS: dict[str, str] = {
    "pdf": "PDF",
    "docx": "DOCX",
    "doc": "DOCX",
    "xlsx": "XLSX",
    "xls": "XLSX",
    "pptx": "PPTX",
    "ppt": "PPTX",
    "ipynb": "IPYNB",
    "r": "R",
    "txt": "TXT",
    "csv": "CSV",
    "png": "PNG",
    "jpg": "JPG",
    "jpeg": "JPG",
    "webp": "WEBP",
    "gif": "GIF",
}
Sort = Literal["new", "popular", "title", "relevance"]
LINK_MAX = 2000


def format_of(file_name: str | None) -> str | None:
    """'Week 3.pdf' -> 'PDF'; None for links and unknown extensions."""
    return FORMATS.get(extension(file_name)) if file_name else None


def kind_label(kind: str) -> str:
    return KIND_LABELS.get(kind, "Other")


# ── visibility ───────────────────────────────────────────────────────────────────────────────


def manages(user: User | None) -> bool:
    """Holds library.manage with an active account: reviews uploads, sees pending and removed items, edits any item,
    and publishes their own files without review."""
    return access.can(user, Box.library_manage)


def can_see(item: LibraryItem, user: User | None) -> bool:
    """Published: everyone. Pending and rejected: the uploader and the library's managers. Removed: the library's
    managers only."""
    if item.status == ItemStatus.published:
        return True
    if user is None:
        return False
    if manages(user):
        return True
    return item.uploaded_by == user.id and item.status != ItemStatus.removed


def can_edit(item: LibraryItem, user: User | None) -> bool:
    """PATCH: people who manage the library always; the uploader while the item waits for review, if they may
    upload."""
    if user is None:
        return False
    if manages(user):
        return True
    mine = item.uploaded_by == user.id and item.status == ItemStatus.pending
    return mine and access.can(user, Box.library_upload)


def find(db: Session, ref: str | uuid.UUID) -> LibraryItem | None:
    """By id (the routes that act on an item), or by slug (reading one: every link uses the slug)."""
    if isinstance(ref, uuid.UUID):
        return db.get(LibraryItem, ref)
    return db.scalar(select(LibraryItem).where(LibraryItem.slug == ref))


def get_visible(db: Session, ref: str | uuid.UUID, user: User | None) -> LibraryItem:
    item = find(db, ref)
    if item is None or not can_see(item, user):
        raise not_found("This file doesn't exist or isn't public yet.")
    return item


# ── output ───────────────────────────────────────────────────────────────────────────────────


def to_out(db: Session, items: Sequence[LibraryItem], user: User | None) -> list[LibraryItemOut]:
    """Items as this person sees them (uploader, star, edit rights, review note), in one query per relation."""
    uploader_ids = {i.uploaded_by for i in items if i.uploaded_by}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(uploader_ids)))} if uploader_ids else {}
    access.prefetch(db, users.values())
    starred: set[uuid.UUID] = set()
    if user is not None and items:
        starred = set(
            db.scalars(
                select(LibraryStar.item_id).where(
                    LibraryStar.user_id == user.id, LibraryStar.item_id.in_([i.id for i in items])
                )
            )
        )
    moderator = manages(user)
    out = []
    for i in items:
        mine = user is not None and i.uploaded_by == user.id
        out.append(
            LibraryItemOut.model_validate(
                {
                    "id": i.id,
                    "slug": i.slug,
                    "source": i.source.value,
                    "kind": i.kind,
                    "title": i.title,
                    "description": i.description,
                    "module_id": i.module_id,
                    "year": i.year,
                    "url": i.url if i.source == ItemSource.link else None,
                    "file_name": i.file_name,
                    "content_type": i.content_type,
                    "size_bytes": i.size_bytes,
                    "format": format_of(i.file_name) if i.source == ItemSource.file else None,
                    "exam_year": i.exam_year,
                    "zone": i.zone,
                    "exam_session": i.exam_session,
                    "author_name": i.author_name,
                    "uploaded_by": public_user(users.get(i.uploaded_by)) if i.uploaded_by else None,
                    "status": i.status.value,
                    "review_note": i.review_note if (mine or moderator) else None,
                    "download_count": i.download_count,
                    "created_at": i.created_at,
                    "published_at": i.published_at,
                    "starred": i.id in starred,
                    "is_mine": mine,
                    "can_edit": can_edit(i, user),
                }
            )
        )
    return out


def one_out(db: Session, item: LibraryItem, user: User | None) -> LibraryItemOut:
    return to_out(db, [item], user)[0]


# ── listing and search ───────────────────────────────────────────────────────────────────────


def search_document() -> ColumnElement[Any]:
    """What a library search matches: the item's own search_vector, plus its module's code and names and words for
    its kind ("ST2133 past papers" finds the past papers of ST2133). Needs Module outer-joined on module_id."""
    kind_words = case(KIND_WORDS, value=LibraryItem.kind, else_=func.replace(LibraryItem.kind, "-", " "))
    extra = func.concat_ws(" ", Module.unit_code, Module.short_name, Module.name, kind_words)
    return LibraryItem.search_vector.op("||")(func.to_tsvector("simple", extra))


@dataclass(frozen=True)
class ListFilters:
    module_id: str | None = None
    year: int | None = None
    kind: str | None = None
    source: str | None = None
    starred: bool = False
    mine: bool = False
    status: str | None = None
    exam_year: int | None = None
    zone: str | None = None


def _visible_statuses(user: User | None, f: ListFilters) -> list[ItemStatus]:
    """`mine`: the person's own items in any state but removed (or the one asked for). Otherwise published only,
    unless a library manager asks for a status (the review queue); `status` from anyone else is ignored."""
    if f.mine:
        if f.status is not None:
            return [ItemStatus(f.status)]
        return [ItemStatus.pending, ItemStatus.published, ItemStatus.rejected]
    if f.status is not None and manages(user):
        return [ItemStatus(f.status)]
    return [ItemStatus.published]


def list_items(
    db: Session,
    user: User | None,
    f: ListFilters,
    *,
    tsquery: ColumnElement[Any] | None,
    sort: Sort,
    limit: int,
    offset: int,
) -> tuple[list[LibraryItemOut], int]:
    if (f.starred or f.mine) and user is None:
        raise unauthenticated("Sign in to see your files.")
    q: Select[tuple[LibraryItem]] = select(LibraryItem).where(LibraryItem.status.in_(_visible_statuses(user, f)))
    if f.mine and user is not None:
        q = q.where(LibraryItem.uploaded_by == user.id)
    if f.starred and user is not None:
        q = q.join(LibraryStar, (LibraryStar.item_id == LibraryItem.id) & (LibraryStar.user_id == user.id))
    if f.module_id:
        q = q.where(LibraryItem.module_id == f.module_id)
    if f.year is not None:
        q = q.where(LibraryItem.year == f.year)
    if f.kind:
        q = q.where(LibraryItem.kind == f.kind)
    if f.source:
        q = q.where(LibraryItem.source == ItemSource(f.source))
    if f.exam_year is not None:
        q = q.where(LibraryItem.exam_year == f.exam_year)
    if f.zone:
        q = q.where(LibraryItem.zone == f.zone)
    rank: ColumnElement[Any] | None = None
    if tsquery is not None:
        doc = search_document()
        q = q.outerjoin(Module, Module.id == LibraryItem.module_id).where(doc.bool_op("@@")(tsquery))
        rank = func.ts_rank(doc, tsquery)

    total = db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    newest = func.coalesce(LibraryItem.published_at, LibraryItem.created_at)
    if sort == "popular":
        order: list[Any] = [LibraryItem.download_count.desc(), newest.desc()]
    elif sort == "title":
        order = [func.lower(LibraryItem.title).asc()]
    elif sort == "relevance" and rank is not None:
        order = [rank.desc(), newest.desc()]
    else:
        order = [newest.desc()]
    q = q.order_by(*order, LibraryItem.title.asc(), LibraryItem.id.asc()).limit(limit).offset(offset)
    return to_out(db, db.scalars(q).all(), user), total


def facets(db: Session) -> LibraryFacets:
    published = LibraryItem.status == ItemStatus.published

    def counts(col: Any) -> dict[str, int]:
        rows = db.execute(select(col, func.count()).where(published, col.is_not(None)).group_by(col)).all()
        return {str(k): int(n) for k, n in rows}

    total = db.scalar(select(func.count()).select_from(LibraryItem).where(published)) or 0
    return LibraryFacets(
        total=total,
        by_kind=counts(LibraryItem.kind),
        by_module=counts(LibraryItem.module_id),
        by_year=counts(LibraryItem.year),
    )


# ── past papers by sitting ───────────────────────────────────────────────────────────────────

EXAM_KINDS: tuple[LibraryKind, ...] = ("past-paper", "examiners-report", "exam-solutions")
_SESSION_ORDER = {"october": 0, "may": 1, None: 2}  # newest first within a year: the resits come after May
_ZONE_ORDER = {"A": 0, "B": 1, None: 2}


def sittings(db: Session, user: User | None, module_id: str) -> PaperSittings:
    """A module's published papers, reports and solutions, grouped by sitting (exam year and session) and zone,
    newest first; those without an exam year go to `other`. Titles sort each list. Files only: the links to Drive
    folders stay in the library's lists."""
    require_module(db, module_id)
    items = db.scalars(
        select(LibraryItem)
        .where(
            LibraryItem.module_id == module_id,
            LibraryItem.source == ItemSource.file,
            LibraryItem.status == ItemStatus.published,
            LibraryItem.kind.in_(EXAM_KINDS),
        )
        .order_by(func.lower(LibraryItem.title), LibraryItem.id)
    ).all()
    out = {i.id: o for i, o in zip(items, to_out(db, items, user), strict=True)}
    groups: dict[tuple[int, str | None], dict[str | None, SittingZone]] = {}
    other = []
    for i in items:
        if i.exam_year is None:
            other.append(out[i.id])
            continue
        zones = groups.setdefault((i.exam_year, i.exam_session), {})
        zone = i.zone if i.zone in ("A", "B") else None
        bucket = zones.setdefault(zone, SittingZone(zone=zone, papers=[], reports=[], solutions=[]))
        if i.kind == "examiners-report":
            bucket.reports.append(out[i.id])
        elif i.kind == "exam-solutions":
            bucket.solutions.append(out[i.id])
        else:
            bucket.papers.append(out[i.id])
    ordered = sorted(groups.items(), key=lambda g: (-g[0][0], _SESSION_ORDER.get(g[0][1], 2)))
    return PaperSittings(
        sittings=[
            Sitting(
                exam_year=year,
                session=session,
                zones=sorted(zones.values(), key=lambda z: _ZONE_ORDER[z.zone]),
            )
            for (year, session), zones in ordered
        ],
        other=other,
    )


# ── creating, editing, removing ──────────────────────────────────────────────────────────────


def _slug_text(title: str, module: Module | None) -> str:
    """What an item's slug is made from: the title, led by the module's code when the title doesn't start with it
    ('st2133-past-paper-2024-zone-a'). A title without Latin letters gives a short id instead (decision D8):
    'st2133-x3k9q2', or 'f-x3k9q2' without a module."""
    code = (module.unit_code or module.id) if module else None
    if not has_latin(title):
        return f"{code or 'f'} {short_id()}"
    text = title.replace("\u2019", "").replace("'", "")
    if code and not slugify(text).startswith(slugify(code)):
        text = f"{code} {text}"
    return text


def pending_count(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count()).where(LibraryItem.uploaded_by == user.id, LibraryItem.status == ItemStatus.pending)
        )
        or 0
    )


def check_pending_room(db: Session, user: User, *, lock: bool = False) -> None:
    """At most MAX_PENDING of a student's files wait for review at once (security review SEC-14); library managers'
    files are published at once. With `lock`, parallel requests by the same person count one after the other."""
    if manages(user):
        return
    if lock:
        ratelimit.lock(db, f"library-pending:{user.id}")
    if pending_count(db, user) >= MAX_PENDING:
        raise conflict(
            "too_many_pending",
            f"You have {MAX_PENDING} files waiting for review. Share more once a student rep has looked at them.",
        )


def create_from_upload(db: Session, user: User, body: LibraryItemCreate, ip: str | None = None) -> LibraryItem:
    """A completed upload of the user's own becomes an item: pending for students; published at once (and audited,
    as it skipped review) for library managers."""
    up = db.get(Upload, body.upload_id)
    if up is None or up.user_id != user.id:
        raise not_found("This upload doesn't exist.")
    if up.purpose != UploadPurpose.library:
        raise invalid("uploadId", "This file wasn't uploaded for the library.")
    if up.status == UploadStatus.pending:
        raise conflict("not_uploaded", "The file hasn't finished uploading.")
    if up.status == UploadStatus.attached:
        raise conflict("already_used", "This file is already in the library.")
    module = require_module(db, body.module_id)
    check_pending_room(db, user, lock=True)
    now = utcnow()
    moderator = manages(user)
    item = LibraryItem(
        source=ItemSource.file,
        kind=body.kind,
        title=body.title,
        description=body.description or None,
        module_id=module.id if module else None,
        year=body.year if body.year is not None else (module.year if module else None),
        storage_key=up.storage_key,
        file_name=up.file_name,
        content_type=up.content_type,
        size_bytes=up.size_bytes,
        exam_year=body.exam_year,
        zone=body.zone,
        exam_session=body.exam_session,
        author_name=body.author_name or None,
        uploaded_by=user.id,
        status=ItemStatus.published if moderator else ItemStatus.pending,
        published_at=now if moderator else None,
        reviewed_by=user.id if moderator else None,
        reviewed_at=now if moderator else None,
    )
    insert_with_unique_slug(db, item, LibraryItem.slug, _slug_text(item.title, module), fallback="file")
    up.status = UploadStatus.attached
    if moderator:
        record(db, user, "library.publish", "library_item", item.id, item.title, ip, own=True)
    return item


def create_link(db: Session, user: User, body: LibraryLinkCreate, ip: str | None) -> LibraryItem:
    url = str(body.url)
    if body.url.scheme != "https":
        raise invalid("url", "Use an https:// link.")
    if body.url.username or body.url.password:
        raise invalid("url", "Remove the user name and password from the link.")
    if len(url) > LINK_MAX:
        raise invalid("url", "This link is too long.")
    module = require_module(db, body.module_id)
    now = utcnow()
    item = LibraryItem(
        source=ItemSource.link,
        kind=body.kind,
        title=body.title,
        description=body.description or None,
        module_id=module.id if module else None,
        year=body.year if body.year is not None else (module.year if module else None),
        url=url,
        author_name=body.author_name or None,
        uploaded_by=user.id,
        status=ItemStatus.published,
        published_at=now,
        reviewed_by=user.id,
        reviewed_at=now,
    )
    insert_with_unique_slug(db, item, LibraryItem.slug, _slug_text(item.title, module), fallback="link")
    record(db, user, "library.link", "library_item", item.id, item.title, ip, url=url)
    return item


def create_imported(
    db: Session,
    module: Module | None,
    *,
    kind: LibraryKind,
    title: str,
    description: str,
    storage_key: str,
    file_name: str,
    size_bytes: int,
    import_key: str,
    exam_year: int | None = None,
    zone: str | None = None,
    exam_session: str | None = None,
    author_name: str | None = None,
) -> LibraryItem:
    """A file the server put in the bucket itself, after checking it (the Drive import): published at once, without
    an uploader (the import is audited as a whole), in its module's year, dated with the reference material, and served
    as the allowlist's type for its name. The caller commits."""
    item = LibraryItem(
        source=ItemSource.file,
        kind=kind,
        title=title,
        description=description or None,
        module_id=module.id if module else None,
        year=module.year if module else None,
        storage_key=storage_key,
        file_name=file_name,
        content_type=serve_type(file_name),
        size_bytes=size_bytes,
        exam_year=exam_year,
        zone=zone,
        exam_session=exam_session,
        author_name=author_name or None,
        import_key=import_key,
        status=ItemStatus.published,
        published_at=REFERENCE_PUBLISHED_AT,
    )
    insert_with_unique_slug(db, item, LibraryItem.slug, _slug_text(item.title, module), fallback="file")
    return item


EDITABLE = ("title", "kind", "year", "description", "exam_year", "zone", "exam_session", "author_name")
CLEARABLE = ("year", "description", "exam_year", "zone", "exam_session", "author_name")


def apply_update(db: Session, user: User, item: LibraryItem, body: LibraryItemUpdate, ip: str | None) -> None:
    """The uploader while the item waits for review, library managers always. Moving it to another module moves it to
    that module's year too, unless `year` is sent."""
    if not can_edit(item, user):
        raise forbidden("You can edit your upload only while it waits for review.")
    sent = body.model_fields_set
    module = require_module(db, body.module_id) if "module_id" in sent else None
    changed = apply_patch(item, body, EDITABLE, clearable=CLEARABLE)
    if "module_id" in sent and (module.id if module else None) != item.module_id:
        item.module_id = module.id if module else None
        changed.append("module_id")
        if module is not None and "year" not in sent and item.year != module.year:
            item.year = module.year
            changed.append("year")
    if changed and item.uploaded_by != user.id:
        record(db, user, "library.edit", "library_item", item.id, item.title, ip, fields=sorted(changed))


def remove(db: Session, user: User, item: LibraryItem, ip: str | None) -> None:
    """The uploader or a library manager. The row stays as `removed` (reports and the audit log keep pointing at it, and
    the seed never brings a removed link back); nothing serves its file any more, and the daily sweep deletes the
    file from the bucket after FILE_GRACE (sweep_files)."""
    mine = item.uploaded_by == user.id
    if not (mine or manages(user)):
        raise forbidden("Only the person who shared this file or a student rep can remove it.")
    if item.status == ItemStatus.removed:
        return
    previous = item.status
    item.status = ItemStatus.removed
    if not mine:
        record(db, user, "library.remove", "library_item", item.id, item.title, ip, was=previous.value)


def review(
    db: Session, user: User, item: LibraryItem, decision: Literal["publish", "reject"], note: str | None, ip: str | None
) -> None:
    """Publishes or rejects an item. The row is locked first, so two reviews at once act one after the other; a
    review that changes nothing (the same decision and note again) writes no activity and tells nobody."""
    db.refresh(item, with_for_update=True)
    if item.status == ItemStatus.removed:
        raise conflict("post_unavailable", "This file was removed.")
    if decision == "publish" and item.source == ItemSource.file and not item.storage_key:
        raise conflict("file_gone", "This file was deleted after it was rejected. Ask for it to be shared again.")
    status = ItemStatus.published if decision == "publish" else ItemStatus.rejected
    if item.status == status and item.review_note == (note or None):
        return
    now = utcnow()
    previous = item.status
    item.status = status
    if decision == "publish" and item.published_at is None:
        item.published_at = now
    item.review_note = note or None
    item.reviewed_by = user.id
    item.reviewed_at = now
    record(db, user, f"library.{decision}", "library_item", item.id, item.title, ip, note=note or None)
    if item.uploaded_by is not None and item.status != previous:
        kind: NotificationKind
        if decision == "publish":
            kind, title = "upload_published", f"Your file is in the library: {item.title}"
        else:
            kind, title = "upload_rejected", f"Your file wasn't published: {item.title}"
        notify(
            db,
            item.uploaded_by,
            kind,
            title,
            body=note or None,
            url=f"/library/{item.slug}",
            actor=user,
            data={"itemId": str(item.id)},
        )


def sweep_files(db: Session, storage: Storage | None = None, now: datetime | None = None) -> int:
    """For the daily sweep: deletes from the bucket the files of items rejected or removed more than FILE_GRACE ago
    (security review SEC-14), with their upload rows; the item rows stay, without a file. -> how many files.
    The caller commits. Safe to run again: a file already gone is skipped."""
    cutoff = (now or utcnow()) - FILE_GRACE
    decided = func.coalesce(LibraryItem.updated_at, LibraryItem.reviewed_at, LibraryItem.created_at)
    items = db.scalars(
        select(LibraryItem).where(
            LibraryItem.source == ItemSource.file,
            LibraryItem.status.in_([ItemStatus.rejected, ItemStatus.removed]),
            LibraryItem.storage_key.is_not(None),
            decided < cutoff,
        )
    ).all()
    st = storage or get_storage()
    for item in items:
        if item.storage_key is None:
            continue
        st.delete(item.storage_key)
        db.execute(delete(Upload).where(Upload.storage_key == item.storage_key))
        item.storage_key = None
    if items:
        log.info("deleted %d rejected or removed library file(s)", len(items))
    return len(items)


# ── files and stars ──────────────────────────────────────────────────────────────────────────


def download_url(db: Session, item: LibraryItem, storage: Storage | None = None) -> str:
    """Where /download sends the browser: a short-lived attachment link for files, the stored https URL for links.
    Opening a published item counts as a download (in SQL, in the caller's transaction). A removed item has
    nothing left to open, even for the library managers who still see its page: 404."""
    if item.status == ItemStatus.removed:
        raise not_found("This file was removed.")
    if item.source == ItemSource.link:
        if not item.url or not item.url.startswith("https://"):
            raise not_found("This link isn't available.")
        target = item.url
    else:
        if not item.storage_key:
            raise not_found("This file isn't available.")
        target = (storage or get_storage()).presigned_get(
            item.storage_key, file_name=item.file_name or "file", inline=False, content_type=serve_type(item.file_name)
        )
    if item.status == ItemStatus.published:
        # atomic in SQL; the session's copy of the item is brought up to date too (synchronize_session="auto")
        db.execute(
            update(LibraryItem).where(LibraryItem.id == item.id).values(download_count=LibraryItem.download_count + 1)
        )
    return target


def preview_link(item: LibraryItem, storage: Storage | None = None) -> FileLink:
    """A short-lived inline link for the viewer: PDFs and images only (404 once the item was removed)."""
    if item.status == ItemStatus.removed:
        raise not_found("This file was removed.")
    content_type = serve_type(item.file_name)
    if item.source != ItemSource.file or not item.storage_key or content_type not in INLINE_TYPES:
        raise ApiError(409, "no_preview", "This file can't be shown in the browser. Download it instead.")
    st = storage or get_storage()
    url = st.presigned_get(item.storage_key, file_name=item.file_name or "file", inline=True, content_type=content_type)
    return FileLink(url=url, expires_in=st.settings.download_url_ttl_seconds)


def set_star(db: Session, user: User, item: LibraryItem, on: bool) -> bool:
    if on:
        db.execute(pg_insert(LibraryStar).values(user_id=user.id, item_id=item.id).on_conflict_do_nothing())
    else:
        db.execute(delete(LibraryStar).where(LibraryStar.user_id == user.id, LibraryStar.item_id == item.id))
    return on
