"""The library. Owner: content agent."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import Path, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.access import Box, Feature
from app.core.pagination import Limit, Offset, YearParam
from app.core.security import DB, ActiveUser, OptionalUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.library import (
    EXAM_YEAR_MAX,
    EXAM_YEAR_MIN,
    FileLink,
    ItemStatus,
    LibraryFacets,
    LibraryItem,
    LibraryItemCreate,
    LibraryItemUpdate,
    LibraryKind,
    LibraryLinkCreate,
    LibraryPage,
    PaperQuestion,
    PaperQuestionCreate,
    PaperSittings,
    ReviewDecision,
    StarResult,
    Zone,
)
from app.services import library as svc
from app.services import past_questions
from app.services.search import text_query, words

router = router_for("library", needs_feature(Feature.library))
COVER_CACHE = "private, max-age=240"  # less than the link lives (download_url_ttl_seconds, 300 s)
Uploader = Annotated[User, requires(Box.library_upload)]
LibraryManager = Annotated[User, requires(Box.library_manage)]
QUESTIONS = [needs_feature(Feature.library_questions)]


@router.get("/library/items", response_model=LibraryPage)
def list_items(
    db: DB,
    user: OptionalUser,
    q: str | None = Query(default=None, max_length=200),
    module_id: str | None = None,
    year: YearParam | None = None,
    kind: LibraryKind | None = None,
    source: Literal["file", "link"] | None = None,
    sort: Literal["new", "popular", "title", "relevance", "sitting"] = Query(
        default="new",
        description="relevance: best match first (with q). sitting: the newest exam sitting first, by zone, then "
        "the paper, its report and its solutions; files without an exam year after them, newest first",
    ),
    exam_year: int | None = Query(default=None, ge=EXAM_YEAR_MIN, le=EXAM_YEAR_MAX),
    zone: Zone | None = None,
    starred: bool = False,
    mine: bool = False,
    status_: ItemStatus | None = Query(default=None, alias="status", description="Library managers: e.g. pending"),
    limit: Limit = 24,
    offset: Offset = 0,
) -> LibraryPage:
    """Published items for everyone. `starred` and `mine` need a session; `mine` includes pending and rejected.
    `q` searches titles, descriptions, authors and file names, plus the module's code and name and the kind
    ("ST2133 past papers"), and the words inside PDF and Word files (those found only there come after the rest,
    with `match`: the words around them and the page); the last word matches as a prefix."""
    filters = svc.ListFilters(
        module_id=module_id,
        year=year,
        kind=kind,
        source=source,
        starred=starred,
        mine=mine,
        status=status_,
        exam_year=exam_year,
        zone=zone,
    )
    tsq = text_query(q) if q and q.strip() else None
    if q and q.strip() and tsq is None:  # only symbols: nothing can match
        return LibraryPage(items=[], total=0, limit=limit, offset=offset)
    items, total = svc.list_items(
        db, user, filters, tsquery=tsq, terms=words(q or ""), sort=sort, limit=limit, offset=offset
    )
    return LibraryPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/library/facets", response_model=LibraryFacets)
def facets(db: DB) -> LibraryFacets:
    return svc.facets(db)


@router.get("/library/papers", response_model=PaperSittings)
def papers(db: DB, user: OptionalUser, module_id: str) -> PaperSittings:
    """A module's past papers, examiners' reports and solutions by sitting (exam year and session) and zone, the
    newest sitting first; the ones without an exam year in `other`. Errors: invalid_input (422: an unknown module)."""
    return svc.sittings(db, user, module_id)


@router.get("/library/items/{ref}", response_model=LibraryItem)
def get_item(
    ref: Annotated[str, Path(description="The item's slug (every link uses it), or its id.")],
    db: DB,
    user: OptionalUser,
) -> LibraryItem:
    """One item, by its slug or its id. Unpublished items: only their uploader and the library's managers."""
    return svc.one_out(db, svc.get_visible(db, ref, user), user)


@router.post(
    "/library/items",
    response_model=LibraryItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[needs_feature(Feature.library_uploads)],
)
def create_item(body: LibraryItemCreate, request: Request, user: Uploader, db: DB) -> LibraryItem:
    """Turn a completed upload into a library item: pending for students, published for library managers.

    Errors: not_uploaded (409), already_used (409), too_many_pending (409: the student already has 10 files waiting
    for review), invalid_input (422: an unknown module), feature_off (404: library uploads are switched off)."""
    item = svc.create_from_upload(db, user, body, client_ip(request))
    db.commit()
    return svc.one_out(db, item, user)


@router.post("/library/links", response_model=LibraryItem, status_code=status.HTTP_201_CREATED)
def create_link(body: LibraryLinkCreate, request: Request, user: LibraryManager, db: DB) -> LibraryItem:
    """A link to a resource kept elsewhere (https only, not Google Drive or Docs), published at once.
    Errors: invalid_input (422: not https, too long, or a Google Drive or Docs link)."""
    item = svc.create_link(db, user, body, client_ip(request))
    db.commit()
    return svc.one_out(db, item, user)


@router.patch("/library/items/{item_id}", response_model=LibraryItem)
def update_item(item_id: UUID, body: LibraryItemUpdate, request: Request, user: ActiveUser, db: DB) -> LibraryItem:
    """The uploader while the item is pending; library managers always."""
    item = svc.get_visible(db, item_id, user)
    svc.apply_update(db, user, item, body, client_ip(request))
    db.commit()
    return svc.one_out(db, item, user)


@router.delete("/library/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: UUID, request: Request, user: ActiveUser, db: DB) -> Response:
    """The uploader or a library manager. Nothing serves the file any more; the daily sweep deletes it from storage
    a week later."""
    item = svc.get_visible(db, item_id, user)
    svc.remove(db, user, item, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/library/items/{item_id}/download", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def download(item_id: UUID, db: DB, user: OptionalUser) -> RedirectResponse:
    """302 to a short-lived link that downloads the file (counted), or to the link's URL."""
    item = svc.get_visible(db, item_id, user)
    target = svc.download_url(db, item)
    db.commit()
    return RedirectResponse(target, status_code=status.HTTP_302_FOUND)


@router.get("/library/items/{item_id}/file", response_model=FileLink)
def file_link(item_id: UUID, db: DB, user: OptionalUser) -> FileLink:
    """A short-lived link that shows the file in the browser (PDFs and images), for the viewer. Not counted.

    Errors: no_preview (409) for links and other formats: download them instead."""
    return svc.preview_link(svc.get_visible(db, item_id, user))


@router.get("/library/items/{item_id}/cover", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def cover(item_id: UUID, db: DB, user: OptionalUser) -> RedirectResponse:
    """302 to a short-lived link to the file's cover: its first page as a small WebP picture. The browser may keep
    the redirect a few minutes. Errors: not_found (404: no such file, or no cover)."""
    target = svc.cover_link(db, svc.get_visible(db, item_id, user))
    return RedirectResponse(target, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": COVER_CACHE})


@router.put("/library/items/{item_id}/star", response_model=StarResult)
def star(item_id: UUID, user: ActiveUser, db: DB) -> StarResult:
    item = svc.get_visible(db, item_id, user)
    starred = svc.set_star(db, user, item, True)
    db.commit()
    return StarResult(starred=starred)


@router.delete("/library/items/{item_id}/star", response_model=StarResult)
def unstar(item_id: UUID, user: ActiveUser, db: DB) -> StarResult:
    item = svc.get_visible(db, item_id, user)
    starred = svc.set_star(db, user, item, False)
    db.commit()
    return StarResult(starred=starred)


@router.post("/library/items/{item_id}/review", response_model=LibraryItem)
def review(item_id: UUID, body: ReviewDecision, request: Request, user: LibraryManager, db: DB) -> LibraryItem:
    """Publish or reject a pending upload. Notifies the uploader. Audited. A rejected file is deleted from storage a
    week later (the item and its note stay).

    Errors: removed (409), file_gone (409: publishing a file that was rejected more than a week ago)."""
    item = svc.get_visible(db, item_id, user)
    svc.review(db, user, item, body.decision, body.note, client_ip(request))
    db.commit()
    return svc.one_out(db, item, user)


# ── past questions by topic ──────────────────────────────────────────────────────────────────


@router.get("/library/questions", response_model=list[PaperQuestion], dependencies=QUESTIONS)
def module_questions(
    db: DB, user: OptionalUser, module_id: str | None = None, flagged: bool = False
) -> list[PaperQuestion]:
    """The questions tagged on a module's published past papers, chapter by chapter, the newest sitting first.
    `flagged`: only the tags someone flagged, the most flagged first, of `module_id` or of every module (library
    managers; 403 for others). Errors: invalid_input (422: an unknown module, or none without `flagged`)."""
    return past_questions.for_module(db, module_id, user, flagged=flagged)


@router.get("/library/items/{item_id}/questions", response_model=list[PaperQuestion], dependencies=QUESTIONS)
def paper_questions(item_id: UUID, db: DB, user: OptionalUser) -> list[PaperQuestion]:
    """A published past paper's tagged questions, by question number. Errors: not_found (404), not_a_paper (409)."""
    return past_questions.for_paper(db, item_id, user)


@router.post(
    "/library/items/{item_id}/questions",
    response_model=PaperQuestion,
    status_code=status.HTTP_201_CREATED,
    dependencies=QUESTIONS,
)
def tag_question(item_id: UUID, body: PaperQuestionCreate, user: ActiveUser, db: DB) -> PaperQuestion:
    """Tag a question of a published past paper with one of its module's chapters, and the page it starts on.

    Errors: not_found (404), not_a_paper (409), already_tagged (409), invalid_input (422: another module's chapter),
    rate_limited (429: 60 an hour)."""
    row = past_questions.tag(db, user, item_id, body)
    db.commit()
    return past_questions.to_out(db, [row], user)[0]


@router.delete("/library/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=QUESTIONS)
def remove_question(question_id: UUID, request: Request, user: ActiveUser, db: DB) -> Response:
    """Whoever tagged it, or a library manager (audited: `library.question_remove`). Errors: not_found (404)."""
    past_questions.remove(db, user, past_questions.get(db, question_id), client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/library/questions/{question_id}/keep", response_model=PaperQuestion, dependencies=QUESTIONS)
def keep_question(question_id: UUID, request: Request, user: LibraryManager, db: DB) -> PaperQuestion:
    """The tag is right: clear its flags (library managers; audited: `library.question_keep`)."""
    row = past_questions.get(db, question_id)
    past_questions.keep(db, user, row, client_ip(request))
    db.commit()
    return past_questions.to_out(db, [row], user)[0]


@router.put("/library/questions/{question_id}/flag", response_model=PaperQuestion, dependencies=QUESTIONS)
def flag_question(question_id: UUID, user: ActiveUser, db: DB) -> PaperQuestion:
    """Say a tag is wrong: the library's managers see it. Saying it twice changes nothing."""
    row = past_questions.get(db, question_id)
    past_questions.set_flag(db, user, row, True)
    db.commit()
    return past_questions.to_out(db, [row], user)[0]


@router.delete("/library/questions/{question_id}/flag", response_model=PaperQuestion, dependencies=QUESTIONS)
def unflag_question(question_id: UUID, user: ActiveUser, db: DB) -> PaperQuestion:
    """Take a flag back."""
    row = past_questions.get(db, question_id)
    past_questions.set_flag(db, user, row, False)
    db.commit()
    return past_questions.to_out(db, [row], user)[0]
