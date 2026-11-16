"""Rate my CV, in Career Navigator: a student's own CVs, scored by rules (app/services/career_cv.py)."""

from __future__ import annotations

import uuid

from fastapi import Response, status

from app.core.access import Feature
from app.core.security import DB, ActiveUser, CurrentUser, needs_feature
from app.routers._base import router_for
from app.schemas.career_cv import CvFileLink, CvRate, CvRerate, CvReviewOut
from app.services import career_cv as svc

router = router_for("career-cv", needs_feature(Feature.career), needs_feature(Feature.career_cv))


@router.get("/career/cvs", response_model=list[CvReviewOut])
def my_cvs(user: CurrentUser, db: DB) -> list[CvReviewOut]:
    """The signed-in student's kept CVs and their latest ratings, newest first."""
    return svc.mine(db, user)


@router.post("/career/cvs", response_model=CvReviewOut, status_code=status.HTTP_201_CREATED)
def rate_cv(body: CvRate, user: ActiveUser, db: DB) -> CvReviewOut:
    """Rates a CV just uploaded (purpose 'cv') against a role, and keeps it.

    Errors: not_found (404: not the student's CV upload), not_uploaded (409), limit_reached (409: ten CVs kept),
    invalid_input (422: an unknown role, or no readable text), rate_limited (429: ten a day)."""
    out = svc.rate(db, user, body)
    db.commit()
    return out


@router.post("/career/cvs/{review_id}/rate", response_model=CvReviewOut)
def rerate_cv(review_id: uuid.UUID, body: CvRerate, user: ActiveUser, db: DB) -> CvReviewOut:
    """Rates a kept CV again against another role. Errors: not_found (404), invalid_input (422: an unknown role)."""
    out = svc.rerate(db, user, review_id, body.role_id)
    db.commit()
    return out


@router.get("/career/cvs/{review_id}/file", response_model=CvFileLink)
def cv_file(review_id: uuid.UUID, user: CurrentUser, db: DB) -> CvFileLink:
    """A short-lived link to the student's own CV file. Errors: not_found (404 for anyone else)."""
    return CvFileLink(url=svc.file_link(db, user, review_id))


@router.delete("/career/cvs/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cv(review_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    """Deletes the CV, its file and its rating. Errors: not_found (404), storage_unavailable (503)."""
    svc.delete(db, user, review_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
