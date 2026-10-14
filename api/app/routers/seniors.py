"""Seniors who answer, in Career Navigator. Owner: community agent."""

from __future__ import annotations

from fastapi import Response, status

from app.core.access import Feature
from app.core.security import DB, ActiveUser, CurrentUser, needs_feature
from app.routers._base import router_for
from app.schemas.seniors import MySenior, Senior, SeniorUpdate
from app.services import seniors as svc

router = router_for("seniors", needs_feature(Feature.career), needs_feature(Feature.career_seniors))


@router.get("/career/seniors", response_model=list[Senior])
def list_seniors(db: DB) -> list[Senior]:
    """The Year 3 students taking questions: name, cohort, badge, topics and their line. Never contact details."""
    return svc.listed(db)


@router.get("/career/seniors/me", response_model=MySenior)
def my_listing(user: CurrentUser, db: DB) -> MySenior:
    """The signed-in person's listing, and whether they may have one (Year 3 accounts at least 30 days old)."""
    return svc.mine(db, user)


@router.put("/career/seniors/me", response_model=MySenior)
def save_listing(body: SeniorUpdate, user: ActiveUser, db: DB) -> MySenior:
    """List yourself, change your topics or line, or pause.

    Errors: forbidden (403: not in Year 3, or the account is under 30 days old), invalid (422: the line reads as
    staff or holds a link)."""
    out = svc.save(db, user, body)
    db.commit()
    return out


@router.delete("/career/seniors/me", status_code=status.HTTP_204_NO_CONTENT)
def remove_listing(user: CurrentUser, db: DB) -> Response:
    """Take yourself off the list. Idempotent."""
    svc.remove(db, user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
