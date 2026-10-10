"""The DSBA Newsletter. Owner: content agent."""

from __future__ import annotations

from uuid import UUID

from fastapi import Request, Response, status

from app.core.security import DB, ActiveUser, Moderator, OptionalUser, is_moderator
from app.models import IssueStatus, NewsletterIssue
from app.routers._base import router_for
from app.schemas.newsletter import IssueCreate, IssueDetail, IssueSummary, IssueUpdate, Reaction, ReactionCounts
from app.services import audit
from app.services import newsletter as svc
from app.services.ratelimit import request_ip

router = router_for("newsletter")


@router.get("/newsletter/issues", response_model=list[IssueSummary])
def list_issues(db: DB, user: OptionalUser, include_drafts: bool = False) -> list[IssueSummary]:
    """Published issues, newest first (drafts too for moderators who ask for them; ignored for everyone else)."""
    return [svc.to_summary(i) for i in svc.list_issues(db, include_drafts and is_moderator(user))]


@router.get("/newsletter/issues/{slug}", response_model=IssueDetail)
def get_issue(slug: str, db: DB, user: OptionalUser) -> IssueDetail:
    """An issue with its sections and the reactions to each section. Drafts: moderators only."""
    return svc.to_detail(db, svc.get_by_slug(db, slug, user), user)


@router.post("/newsletter/issues", response_model=IssueDetail, status_code=status.HTTP_201_CREATED)
def create_issue(body: IssueCreate, request: Request, user: Moderator, db: DB) -> IssueDetail:
    """A draft. Errors: slug_taken (409), invalid_input (422: every section needs a unique id; links must be
    https://, mailto: or a page of the Hub; at most 40 sections and 256 KB)."""
    svc.check_slug_free(db, body.slug)
    svc.check_issue_content(sections=body.sections, cover=body.cover, dek=body.dek, summary=body.summary)
    issue = NewsletterIssue(
        slug=body.slug,
        number=body.number,
        title=body.title,
        date=body.date,
        cover=body.cover,
        dek=body.dek,
        summary=body.summary,
        editors=body.editors,
        sections=body.sections,
        status=IssueStatus.draft,
        created_by=user.id,
    )
    db.add(issue)
    db.flush()
    audit.record(
        db,
        user,
        "newsletter.create",
        "newsletter_issue",
        issue.id,
        {"slug": issue.slug, "title": issue.title},
        request_ip(request),
    )
    db.commit()
    return svc.to_detail(db, issue, user)


@router.patch("/newsletter/issues/{issue_id}", response_model=IssueDetail)
def update_issue(issue_id: UUID, body: IssueUpdate, request: Request, user: Moderator, db: DB) -> IssueDetail:
    """Edit a draft or a published issue (fields that are not sent stay as they are).

    Errors: slug_taken (409), invalid_input (422)."""
    issue = svc.get_by_id(db, issue_id)
    sent = body.model_fields_set
    if body.slug is not None and body.slug != issue.slug:
        svc.check_slug_free(db, body.slug, issue.id)
    svc.check_issue_content(sections=body.sections, cover=body.cover, dek=body.dek, summary=body.summary)
    changed = []
    for field in ("slug", "number", "title", "date", "cover", "dek", "summary", "editors", "sections"):
        value = getattr(body, field)
        if field in sent and value is not None and value != getattr(issue, field):
            setattr(issue, field, value)
            changed.append(field)
    if changed:
        audit.record(
            db,
            user,
            "newsletter.update",
            "newsletter_issue",
            issue.id,
            {"slug": issue.slug, "title": issue.title, "fields": changed},
            request_ip(request),
        )
    db.commit()
    return svc.to_detail(db, issue, user)


@router.post("/newsletter/issues/{issue_id}/publish", response_model=IssueDetail)
def publish_issue(issue_id: UUID, request: Request, user: Moderator, db: DB) -> IssueDetail:
    """Publishes the issue and notifies everyone who wants newsletter notifications. Audited.
    Publishing an issue that is already out changes nothing."""
    issue = svc.get_by_id(db, issue_id)
    svc.publish(db, user, issue, request_ip(request))
    db.commit()
    return svc.to_detail(db, issue, user)


@router.delete("/newsletter/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(issue_id: UUID, request: Request, user: Moderator, db: DB) -> Response:
    issue = svc.get_by_id(db, issue_id)
    audit.record(
        db,
        user,
        "newsletter.delete",
        "newsletter_issue",
        issue.id,
        {"slug": issue.slug, "title": issue.title, "status": issue.status.value},
        request_ip(request),
    )
    db.delete(issue)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/newsletter/issues/{issue_id}/sections/{section_id}/reactions/{reaction}", response_model=ReactionCounts)
def react(issue_id: UUID, section_id: str, reaction: Reaction, user: ActiveUser, db: DB) -> ReactionCounts:
    """Idempotent. Published issues only. Errors: not_found (404: no such issue or section)."""
    counts = svc.set_reaction(db, user, svc.get_by_id(db, issue_id), section_id, reaction, True)
    db.commit()
    return counts


@router.delete(
    "/newsletter/issues/{issue_id}/sections/{section_id}/reactions/{reaction}", response_model=ReactionCounts
)
def unreact(issue_id: UUID, section_id: str, reaction: Reaction, user: ActiveUser, db: DB) -> ReactionCounts:
    counts = svc.set_reaction(db, user, svc.get_by_id(db, issue_id), section_id, reaction, False)
    db.commit()
    return counts
