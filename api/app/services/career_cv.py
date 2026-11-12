"""Rate my CV, in Career Navigator (feature career.cv). A student uploads their CV (purpose 'cv': a PDF or a Word
file), picks a role, and gets a score out of 100 and how well the CV fits the role. The rules are in cv_rules.py: no
AI, and the CV goes nowhere but the hub's own bucket.

- rate(): reads the uploaded file's text with the sandboxed reader (paper_text.read_pages), rates it, attaches the
  upload and keeps the review with its text. At most RATINGS_PER_DAY new CVs a day and KEPT_CVS kept at once.
- rerate(): the same CV against another role, from the kept text (no second reading).
- The file is seen by its owner only, through a short-lived link (file_link()). delete() removes the object, then
  the upload and the review. Deleting the account deletes them too (accounts.GONE_WITH_THE_ACCOUNT).
Services leave the commit to the handler."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.time import utcnow
from app.models import CvReview, Upload, UploadPurpose, UploadStatus, User
from app.schemas.career import CareerDoc
from app.schemas.career_cv import CvCheck, CvFit, CvRate, CvReviewOut, CvSkill
from app.services import career, cv_rules, paper_text, ratelimit
from app.services.storage import Storage, get_storage
from app.services.uploads import file_type_for

RATINGS_PER_DAY = 10
KEPT_CVS = 10
READ_SECONDS = 20  # the reader's time limit for one CV
MAX_TEXT = 50_000  # characters of a CV's text kept


def _doc(db: Session) -> CareerDoc:
    data = career.content(db).data
    if data is None:
        raise not_found("Career Navigator isn't set up yet.")
    return data


def _role(doc: CareerDoc, role_id: str) -> tuple[str, list[cv_rules.Skill]]:
    """The role's title and its skills, most important first; 422 for a role the page doesn't show."""
    role = next((r for r in doc.roles if r.id == role_id), None)
    if role is None:
        raise invalid("roleId", "Pick one of the roles in Build the skills.")
    skills = [
        cv_rules.Skill(sid, doc.skills[sid].name, [t.module for t in doc.skills[sid].taught])
        for sid in role.skills
        if sid in doc.skills
    ]
    return role.title, skills


def _result(
    pages: list[str], role_id: str, title: str, skills: list[cv_rules.Skill]
) -> tuple[int, int, dict[str, Any]]:
    """The score, the fit and the stored result."""
    rating = cv_rules.rate(pages)
    fit = cv_rules.fit(pages, role_id, title, skills)
    checks = [
        CvCheck(id=c.id, title=c.title, earned=c.earned, max=c.max, status=c.status, found=c.found, tip=c.tip)
        for c in rating.checks
    ]
    out_fit = CvFit(
        role_id=fit.role_id,
        role_title=fit.role_title,
        percent=fit.percent,
        found=[CvSkill(id=s.id, name=s.name, modules=s.modules) for s in fit.found],
        missing=[CvSkill(id=s.id, name=s.name, modules=s.modules) for s in fit.missing],
    )
    result = {
        "words": rating.words,
        "checks": [c.model_dump(by_alias=True) for c in checks],
        "fit": out_fit.model_dump(by_alias=True),
    }
    return rating.score, fit.percent, result


def to_out(review: CvReview, up: Upload) -> CvReviewOut:
    r = review.result
    return CvReviewOut.model_validate(
        {
            "id": review.id,
            "file_name": up.file_name,
            "size_bytes": up.size_bytes,
            "created_at": review.created_at,
            "rated_at": review.rated_at,
            "score": review.score,
            "pages": review.pages,
            "words": r.get("words", 0),
            "checks": r.get("checks", []),
            "fit": r.get("fit"),
        }
    )


def mine(db: Session, user: User) -> list[CvReviewOut]:
    """The student's kept CVs, newest first."""
    rows = db.execute(
        select(CvReview, Upload)
        .join(Upload, Upload.id == CvReview.upload_id)
        .where(CvReview.user_id == user.id)
        .order_by(CvReview.created_at.desc())
    ).all()
    return [to_out(review, up) for review, up in rows]


def _read(up: Upload, storage: Storage) -> list[str]:
    fmt = paper_text.text_format(up.file_name)
    data = storage.read_head(up.storage_key, up.size_bytes + 1) if fmt else None
    if fmt is None or data is None:
        raise invalid("uploadId", "This file isn't here any more. Upload it again.")
    try:
        pages = paper_text.read_pages(fmt, data, time_limit=READ_SECONDS)
    except paper_text.ReadError:
        raise invalid(
            "uploadId", "We couldn't read this file. Save it again as a PDF from Word or Google Docs, then upload it."
        ) from None
    if not "".join(pages).strip():
        raise invalid(
            "uploadId",
            "This file has no text we can read: it may be a scanned picture. Export it as a PDF from Word or "
            "Google Docs, then upload it.",
        )
    return pages


def rate(db: Session, user: User, body: CvRate, storage: Storage | None = None) -> CvReviewOut:
    """Rates a CV the student just uploaded and keeps it. Errors: not_found (404: not their upload, or not a CV),
    not_uploaded (409: the upload isn't complete), limit_reached (409: KEPT_CVS kept), invalid_input (422: an
    unknown role, or a file with no readable text), rate_limited (429)."""
    title, skills = _role(_doc(db), body.role_id)
    up = db.get(Upload, body.upload_id, with_for_update=True)
    if up is None or up.user_id != user.id or up.purpose != UploadPurpose.cv:
        raise not_found("This upload doesn't exist.")
    if up.status == UploadStatus.attached:
        raise conflict("not_uploaded", "This CV is rated already: it's in your list.")
    if up.status != UploadStatus.uploaded:
        raise conflict("not_uploaded", "The file hasn't arrived yet. Upload it again.")
    kept = db.scalar(select(func.count()).select_from(CvReview).where(CvReview.user_id == user.id)) or 0
    if kept >= KEPT_CVS:
        raise conflict("limit_reached", f"You keep {KEPT_CVS} CVs already. Delete an old one first.")
    ratelimit.enforce(
        db,
        f"cv:{user.id}",
        CvReview.created_at,
        [CvReview.user_id == user.id],
        limit=RATINGS_PER_DAY,
        window=timedelta(days=1),
        message=f"You've rated {RATINGS_PER_DAY} CVs today. Try again in {{}}.",
    )
    pages = _read(up, storage or get_storage())
    score, fit, result = _result(pages, body.role_id, title, skills)
    now = utcnow()
    review = CvReview(
        id=uuid.uuid4(),
        user_id=user.id,
        upload_id=up.id,
        role_id=body.role_id,
        score=score,
        fit=fit,
        result=result,
        text="\f".join(pages)[:MAX_TEXT],
        pages=len(pages),
        created_at=now,
        rated_at=now,
    )
    up.status = UploadStatus.attached
    db.add(review)
    db.flush()
    return to_out(review, up)


def _own(db: Session, user: User, review_id: uuid.UUID) -> tuple[CvReview, Upload]:
    review = db.get(CvReview, review_id)
    up = db.get(Upload, review.upload_id) if review is not None else None
    if review is None or up is None or review.user_id != user.id:
        raise not_found("This CV doesn't exist.")
    return review, up


def rerate(db: Session, user: User, review_id: uuid.UUID, role_id: str) -> CvReviewOut:
    """Rates a kept CV again, against `role_id`. Errors: not_found (404), invalid_input (422: an unknown role)."""
    review, up = _own(db, user, review_id)
    title, skills = _role(_doc(db), role_id)
    score, fit, result = _result(review.text.split("\f"), role_id, title, skills)
    review.role_id = role_id
    review.score = score
    review.fit = fit
    review.result = result
    review.rated_at = utcnow()
    return to_out(review, up)


def file_link(db: Session, user: User, review_id: uuid.UUID, storage: Storage | None = None) -> str:
    """A short-lived link to the CV's file: a PDF opens in the browser, a Word file downloads. 404 for anyone else."""
    _, up = _own(db, user, review_id)
    ft = file_type_for(up.file_name, UploadPurpose.cv)
    if ft is None:
        raise not_found("This CV doesn't exist.")
    st = storage or get_storage()
    return st.presigned_get(
        up.storage_key,
        file_name=up.file_name,
        content_type=ft.content_type,
        inline=ft.content_type == "application/pdf",
    )


def delete(db: Session, user: User, review_id: uuid.UUID, storage: Storage | None = None) -> None:
    """Deletes the CV: its file first, then the upload (the review goes with it). Errors: not_found (404),
    storage_unavailable (503)."""
    _, up = _own(db, user, review_id)
    try:
        (storage or get_storage()).delete(up.storage_key)
    except (BotoCoreError, ClientError) as e:
        raise ApiError(
            503, "storage_unavailable", "We couldn't delete the file just now. Try again in a minute."
        ) from e
    db.delete(up)
