"""The DSBA Newsletter. Owner: content agent."""

from __future__ import annotations

from uuid import UUID

from fastapi import Request, Response, status

from app.core.security import DB, ActiveUser, Moderator, OptionalUser
from app.routers._base import router_for
from app.schemas.newsletter import IssueCreate, IssueDetail, IssueSummary, IssueUpdate, Reaction, ReactionCounts

router = router_for("newsletter")


@router.get("/newsletter/issues", response_model=list[IssueSummary])
def list_issues(db: DB, user: OptionalUser, include_drafts: bool = False) -> list[IssueSummary]:
    """Published issues, newest first (drafts too for moderators who ask for them)."""
    raise NotImplementedError


@router.get("/newsletter/issues/{slug}", response_model=IssueDetail)
def get_issue(slug: str, db: DB, user: OptionalUser) -> IssueDetail:
    raise NotImplementedError


@router.post("/newsletter/issues", response_model=IssueDetail, status_code=status.HTTP_201_CREATED)
def create_issue(body: IssueCreate, request: Request, user: Moderator, db: DB) -> IssueDetail:
    """A draft. Errors: slug_taken (409)."""
    raise NotImplementedError


@router.patch("/newsletter/issues/{issue_id}", response_model=IssueDetail)
def update_issue(issue_id: UUID, body: IssueUpdate, request: Request, user: Moderator, db: DB) -> IssueDetail:
    raise NotImplementedError


@router.post("/newsletter/issues/{issue_id}/publish", response_model=IssueDetail)
def publish_issue(issue_id: UUID, request: Request, user: Moderator, db: DB) -> IssueDetail:
    """Publishes the issue and notifies everyone who wants newsletter notifications. Audited."""
    raise NotImplementedError


@router.delete("/newsletter/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(issue_id: UUID, request: Request, user: Moderator, db: DB) -> Response:
    raise NotImplementedError


@router.put("/newsletter/issues/{issue_id}/sections/{section_id}/reactions/{reaction}", response_model=ReactionCounts)
def react(issue_id: UUID, section_id: str, reaction: Reaction, user: ActiveUser, db: DB) -> ReactionCounts:
    raise NotImplementedError


@router.delete(
    "/newsletter/issues/{issue_id}/sections/{section_id}/reactions/{reaction}", response_model=ReactionCounts
)
def unreact(issue_id: UUID, section_id: str, reaction: Reaction, user: ActiveUser, db: DB) -> ReactionCounts:
    raise NotImplementedError
