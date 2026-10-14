"""Mini Noora's AI answers (R-6): a question streamed to Claude and back, the student's questions left, and the
limits and totals for Manage. The rules live in app/services/noora/ask.py."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Request
from fastapi.responses import StreamingResponse

from app.core.access import Box, Feature
from app.core.security import DB, ActiveUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import SteppedUpAdmin, router_for
from app.schemas.common import ErrorResponse
from app.schemas.noora import NooraEvent, NooraLimitsIn, NooraQuestion, NooraStatus, NooraUsageOut
from app.services.noora import ask

router = router_for("noora", needs_feature(Feature.noora_ai))

# The answer's documented shape: a text/event-stream whose every `data:` line is one NooraEvent, as JSON.
STREAM: dict[int | str, dict[str, Any]] = {
    200: {
        "model": NooraEvent,
        "description": "Server-Sent Events: text pieces, then done, or error when the answer stopped.",
        "content": {"text/event-stream": {}},
    },
    503: {
        "model": ErrorResponse,
        "description": "noora_unavailable (no key), noora_budget_reached (the month's budget is spent) or noora_busy "
        "(too many answers streaming hub-wide).",
    },
}


@router.post("/noora/ask", response_class=StreamingResponse, responses=STREAM)
def ask_noora(body: NooraQuestion, user: ActiveUser, db: DB) -> StreamingResponse:
    """Ask Mini Noora. The answer streams as Server-Sent Events. Only counts are stored: never the question, the
    note or the answer. The note goes only when the student ticked "Include my note". With `paper`, the server adds
    that page of the past paper and the examiners' report for its sitting, from the text it read (IDEA-4): 404
    not_found unless it is a published past paper, 404 feature_off while the library is off for the student.

    Errors, before the stream starts: noora_unavailable (503: no key), noora_budget_reached (503: the hub's monthly
    budget is spent), noora_daily_limit (429: today's questions are used up, retryAfter: midnight in Bahrain),
    rate_limited (429: a question a moment ago, or an answer still streaming to this student), noora_busy (503: too
    many answers streaming hub-wide), invalid_input (422: too long)."""
    prepared = ask.prepare(db, user, body)
    db.commit()
    return StreamingResponse(
        ask.answer(db, prepared),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/noora/status", response_model=NooraStatus)
def noora_status(user: ActiveUser, db: DB) -> NooraStatus:
    """Whether her AI answers work for this student now, and how many questions they have left today."""
    return ask.status(db, user)


@router.get("/admin/noora", response_model=NooraUsageOut)
def noora_usage(user: Annotated[User, requires(Box.stats_view)], db: DB) -> NooraUsageOut:
    """The limits, and the questions, tokens and estimated cost today and this month. Nothing per student."""
    return ask.usage(db)


@router.put("/admin/noora", response_model=NooraUsageOut)
def set_noora_limits(body: NooraLimitsIn, request: Request, user: SteppedUpAdmin, db: DB) -> NooraUsageOut:
    """Set the questions each student may ask a day (0 pauses the AI answers) and the monthly budget in US cents.
    Admins only, with a session started or stepped up in the last ten minutes (403 step_up_required). Audited
    (`noora.limits`)."""
    ask.set_limits(db, user, body, client_ip(request))
    db.commit()
    return ask.usage(db)
