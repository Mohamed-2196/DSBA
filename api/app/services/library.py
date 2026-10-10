"""The library: uploaded files and links, stars, reviews, and how an item looks to the person asking.

Visibility: published items are public. Pending and rejected items are seen only by their uploader and by
moderators, removed ones only by moderators; everyone else gets a 404, as if they did not exist."""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import Select, case, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import ApiError, conflict, forbidden, invalid, not_found, unauthenticated
from app.core.security import is_moderator
from app.core.text import slugify, unique_slug
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
from app.schemas.library import FileLink, LibraryFacets, LibraryItemCreate, LibraryItemUpdate, LibraryLinkCreate
from app.schemas.library import LibraryItem as LibraryItemOut
from app.services import audit
from app.services.notify import notify
from app.services.storage import INLINE_TYPES, Storage, get_storage
from app.services.uploads import extension, serve_type

KIND_LABELS: dict[str, str] = {
    "past-paper": "Past paper",
    "examiners-report": "Examiners\u2019 report",
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
    "examiners-report": "examiners examiner report reports",
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


def can_see(item: LibraryItem, user: User | None) -> bool:
    """Published: everyone. Pending and rejected: the uploader and moderators. Removed: moderators only."""
    if item.status == ItemStatus.published:
        return True
    if user is None:
        return False
    if is_moderator(user):
        return True
    return item.uploaded_by == user.id and item.status != ItemStatus.removed


def can_edit(item: LibraryItem, user: User | None) -> bool:
    """PATCH: moderators always; the uploader while the item waits for review."""
    if user is None:
        return False
    return is_moderator(user) or (item.uploaded_by == user.id and item.status == ItemStatus.pending)


def find(db: Session, ref: str | uuid.UUID) -> LibraryItem | None:
    """By id, else by slug."""
    if isinstance(ref, uuid.UUID):
        return db.get(LibraryItem, ref)
    try:
        item = db.get(LibraryItem, uuid.UUID(ref))
    except ValueError:
        item = None
    return item or db.scalar(select(LibraryItem).where(LibraryItem.slug == ref))


def get_visible(db: Session, ref: str | uuid.UUID, user: User | None) -> LibraryItem:
    item = find(db, ref)
    if item is None or not can_see(item, user):
        raise not_found("This file doesn't exist or isn't public yet.")
    return item


# ── output ───────────────────────────────────────────────────────────────────────────────────


def _public(u: User | None) -> dict[str, Any] | None:
    if u is None or not u.display_name:
        return None
    return {"id": u.id, "display_name": u.display_name, "year": u.year, "role": u.role.value}


def to_out(db: Session, items: Sequence[LibraryItem], user: User | None) -> list[LibraryItemOut]:
    """Items as this person sees them (uploader, star, edit rights, review note), in one query per relation."""
    uploader_ids = {i.uploaded_by for i in items if i.uploaded_by}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(uploader_ids)))} if uploader_ids else {}
    starred: set[uuid.UUID] = set()
    if user is not None and items:
        starred = set(
            db.scalars(
                select(LibraryStar.item_id).where(
                    LibraryStar.user_id == user.id, LibraryStar.item_id.in_([i.id for i in items])
                )
            )
        )
    moderator = is_moderator(user)
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
                    "author_name": i.author_name,
                    "uploaded_by": _public(users.get(i.uploaded_by)) if i.uploaded_by else None,
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


def _visible_statuses(user: User | None, f: ListFilters) -> list[ItemStatus]:
    """`mine`: the person's own items in any state but removed (or the one asked for). Otherwise published only,
    unless a moderator asks for a status (the review queue); `status` from anyone else is ignored."""
    if f.mine:
        if f.status is not None:
            return [ItemStatus(f.status)]
        return [ItemStatus.pending, ItemStatus.published, ItemStatus.rejected]
    if f.status is not None and is_moderator(user):
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


# ── creating, editing, removing ──────────────────────────────────────────────────────────────


def _module(db: Session, module_id: str | None) -> Module | None:
    if module_id is None:
        return None
    m = db.get(Module, module_id)
    if m is None:
        raise invalid("moduleId", "This module doesn't exist.")
    return m


def item_slug(db: Session, title: str, module: Module | None) -> str:
    """A free slug from the title, led by the module's code when the title doesn't start with it
    ('st2133-past-paper-2024-zone-a')."""
    code = (module.unit_code or module.id) if module else None
    text = title.replace("\u2019", "").replace("'", "")
    if code and not slugify(text).startswith(slugify(code)):
        text = f"{code} {text}"
    return unique_slug(db, LibraryItem.slug, text, fallback="file")


def insert_with_slug(db: Session, item: LibraryItem, module: Module | None) -> None:
    """Adds the item with a free slug. Two uploads with the same title at the same moment can both see a slug as
    free: the loser retries with a short random suffix instead of failing."""
    base = item_slug(db, item.title, module)
    for attempt in range(3):
        item.slug = base if attempt == 0 else f"{base}-{secrets.token_hex(2)}"
        try:
            with db.begin_nested():
                db.add(item)
                db.flush()
        except IntegrityError:
            continue
        return
    raise conflict("slug_taken", "Try again in a moment.")


def create_from_upload(db: Session, user: User, body: LibraryItemCreate, ip: str | None = None) -> LibraryItem:
    """A completed upload of the user's own becomes an item: pending for students; published at once (and audited,
    as it skipped review) for moderators."""
    up = db.get(Upload, body.upload_id)
    if up is None or up.user_id != user.id:
        raise not_found("This upload doesn't exist.")
    if up.purpose != UploadPurpose.library:
        raise invalid("uploadId", "This file wasn't uploaded for the library.")
    if up.status == UploadStatus.pending:
        raise conflict("not_uploaded", "The file hasn't finished uploading.")
    if up.status == UploadStatus.attached:
        raise conflict("already_used", "This file is already in the library.")
    module = _module(db, body.module_id)
    now = utcnow()
    moderator = is_moderator(user)
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
        author_name=body.author_name or None,
        uploaded_by=user.id,
        status=ItemStatus.published if moderator else ItemStatus.pending,
        published_at=now if moderator else None,
        reviewed_by=user.id if moderator else None,
        reviewed_at=now if moderator else None,
    )
    insert_with_slug(db, item, module)
    up.status = UploadStatus.attached
    if moderator:
        audit.record(db, user, "library.publish", "library_item", item.id, {"title": item.title, "own": True}, ip=ip)
    return item


def create_link(db: Session, user: User, body: LibraryLinkCreate, ip: str | None) -> LibraryItem:
    url = str(body.url)
    if body.url.scheme != "https":
        raise invalid("url", "Use an https:// link.")
    if body.url.username or body.url.password:
        raise invalid("url", "Remove the user name and password from the link.")
    if len(url) > LINK_MAX:
        raise invalid("url", "This link is too long.")
    module = _module(db, body.module_id)
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
    insert_with_slug(db, item, module)
    audit.record(db, user, "library.link", "library_item", item.id, {"title": item.title, "url": url}, ip=ip)
    return item


def apply_update(db: Session, user: User, item: LibraryItem, body: LibraryItemUpdate, ip: str | None) -> None:
    if not can_edit(item, user):
        raise forbidden("You can edit your upload only while it waits for review.")
    sent = body.model_fields_set
    changes: dict[str, Any] = {}
    for field in ("title", "kind"):  # required columns: null means "leave as it is"
        value = getattr(body, field)
        if field in sent and value is not None and value != getattr(item, field):
            changes[field] = value
    if "module_id" in sent and body.module_id != item.module_id:
        module = _module(db, body.module_id)
        changes["module_id"] = module.id if module else None
        if "year" not in sent and module is not None:
            changes["year"] = module.year
    for field in ("year", "description", "exam_year", "zone", "author_name"):
        if field in sent:
            value = getattr(body, field)
            if value == "":  # an emptied text field clears it
                value = None
            if value != getattr(item, field):
                changes[field] = value
    for field, value in changes.items():
        setattr(item, field, value)
    if changes and item.uploaded_by != user.id:
        audit.record(db, user, "library.edit", "library_item", item.id, {"fields": sorted(changes)}, ip=ip)


def remove(db: Session, user: User, item: LibraryItem, ip: str | None, storage: Storage | None = None) -> None:
    """The uploader or a moderator. Files leave the bucket at once; the row stays as `removed` (reports and the
    audit log keep pointing at it, and the seed never brings a removed link back)."""
    mine = item.uploaded_by == user.id
    if not (mine or is_moderator(user)):
        raise forbidden("Only the person who shared this file or a student rep can remove it.")
    if item.status == ItemStatus.removed:
        return
    if item.source == ItemSource.file and item.storage_key:
        (storage or get_storage()).delete(item.storage_key)
        db.execute(delete(Upload).where(Upload.storage_key == item.storage_key))
    previous = item.status
    item.status = ItemStatus.removed
    if not mine:
        audit.record(
            db, user, "library.remove", "library_item", item.id, {"title": item.title, "was": previous.value}, ip=ip
        )


def review(
    db: Session, user: User, item: LibraryItem, decision: Literal["publish", "reject"], note: str | None, ip: str | None
) -> None:
    if item.status == ItemStatus.removed:
        raise conflict("removed", "This file was removed.")
    now = utcnow()
    previous = item.status
    item.status = ItemStatus.published if decision == "publish" else ItemStatus.rejected
    if decision == "publish" and item.published_at is None:
        item.published_at = now
    item.review_note = note or None
    item.reviewed_by = user.id
    item.reviewed_at = now
    audit.record(
        db, user, f"library.{decision}", "library_item", item.id, {"title": item.title, "note": note or None}, ip=ip
    )
    if item.uploaded_by is not None and item.status != previous:
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


# ── files and stars ──────────────────────────────────────────────────────────────────────────


def download_url(db: Session, item: LibraryItem, storage: Storage | None = None) -> str:
    """Where /download sends the browser: a short-lived attachment link for files, the stored https URL for links.
    Opening a published item counts as a download (in SQL, in the caller's transaction). A removed item has
    nothing left to open, even for the moderators who still see its page: 404."""
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


def published_count_by_module(db: Session, module_id: str | None = None) -> dict[str, int]:
    q = (
        select(LibraryItem.module_id, func.count())
        .where(LibraryItem.status == ItemStatus.published, LibraryItem.module_id.is_not(None))
        .group_by(LibraryItem.module_id)
    )
    if module_id is not None:
        q = q.where(LibraryItem.module_id == module_id)
    return {str(mid): int(n) for mid, n in db.execute(q).all()}
