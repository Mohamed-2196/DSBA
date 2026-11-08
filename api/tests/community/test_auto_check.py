"""The forum's automatic check (forum.auto-check, app/services/forum/checks.py), with stand-in answers from Claude:
nothing here reaches the network."""

from __future__ import annotations

import io
import json
import uuid
from collections.abc import Callable, Iterator
from contextlib import nullcontext
from dataclasses import dataclass, field
from typing import Any

import anthropic
import httpx2 as httpx
import pytest
from anthropic.types import Message
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import AuditEntry, ContentCheck, ForumThread, NooraUsage, PostStatus, Report, Upload, User
from app.services.forum import checks
from tests.community.helpers import API, new_reply, new_thread, notifications_for, reply_row, thread_row

Clients = Callable[..., TestClient]


def png(color: str = "red", size: tuple[int, int] = (40, 30)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "PNG")
    return out.getvalue()


def answer(verdict: str = "clear", category: str = "none", reason: str = "Nothing against the rules.") -> Message:
    return message(json.dumps({"verdict": verdict, "category": category, "reason": reason}))


def message(text: str, *, stop: str = "end_turn") -> Message:
    return Message.model_validate(
        {
            "id": f"msg_{uuid.uuid4().hex[:8]}",
            "type": "message",
            "role": "assistant",
            "model": "claude-haiku-5-5",
            "content": [{"type": "text", "text": text}] if text else [],
            "stop_reason": stop,
            "stop_sequence": None,
            "usage": {"input_tokens": 1_800, "output_tokens": 60},
        }
    )


REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


@dataclass
class Stub:
    """Claude, as the check sees it: answers in turn (an exception is raised), and the requests it was sent."""

    answers: list[Message | Exception] = field(default_factory=list)
    sent: list[Any] = field(default_factory=list)

    def create(self, params: Any) -> Message:
        self.sent.append(params)
        reply = self.answers.pop(0) if self.answers else answer()
        if isinstance(reply, Exception):
            raise reply
        return reply


@dataclass
class Harness:
    stub: Stub
    db: Session
    settings: Settings
    key: bool = True
    inline: bool = True  # run the checks straight after the request, as the API does

    def connect(self, _s: Settings) -> Stub | None:
        return self.stub if self.key else None

    def run(self) -> int:
        return checks.run_due(lambda: nullcontext(self.db), connect=self.connect, settings=self.settings)


@pytest.fixture
def harness(app: FastAPI, db: Session, set_feature: Callable[..., None]) -> Iterator[Harness]:
    """The switch on, and Claude replaced by a stand-in. The background run after a request uses it with the test's
    own session."""
    set_feature("forum.auto-check", "everyone")
    h = Harness(Stub(), db, get_settings().model_copy())

    def run_after() -> None:
        if h.inline:
            h.run()

    app.dependency_overrides[checks.runner] = lambda: run_after
    yield h
    app.dependency_overrides.pop(checks.runner, None)


def upload_picture(client: TestClient, storage: Any, body: bytes | None = None, name: str = "graph.png") -> str:
    """A forum picture uploaded and completed through the API, as the composer does. Its media URL."""
    data = body if body is not None else png()
    r = client.post(
        f"{API}/uploads",
        json={"purpose": "forum_image", "fileName": name, "contentType": "image/png", "sizeBytes": len(data)},
    )
    assert r.status_code == 201, r.text
    fields = r.json()["fields"]
    storage.client.put_object(Bucket=storage.bucket, Key=fields["key"], Body=data, ContentType="image/png")
    done = client.post(f"{API}/uploads/{r.json()['uploadId']}/complete")
    assert done.status_code == 200, done.text
    url: str = done.json()["mediaUrl"]
    return url


def upload_of(db: Session, media_url: str) -> Upload:
    up = db.get(Upload, uuid.UUID(media_url.rsplit("/", 1)[1]), populate_existing=True)
    assert up is not None
    return up


def status_of(client: TestClient, media_url: str) -> int:
    return client.get(media_url, follow_redirects=False).status_code


def hub_reports(db: Session) -> list[Report]:
    return list(db.scalars(select(Report).where(Report.reporter_id.is_(None)).order_by(Report.created_at)))


def check_of(db: Session, target_id: str | uuid.UUID) -> ContentCheck:
    row = db.scalar(select(ContentCheck).where(ContentCheck.target_id == uuid.UUID(str(target_id))))
    assert row is not None
    db.refresh(row)
    return row


# ── pictures ─────────────────────────────────────────────────────────────────────────────────


def test_a_clean_picture_shows_once_checked(
    harness: Harness, client_for: Clients, student: User, classmate: User, storage: Any, db: Session
) -> None:
    me = client_for(student)
    url = upload_picture(me, storage)
    thread = new_thread(me, body=f"Here is my chart:\n\n![chart]({url})")

    assert upload_of(db, url).check_state is None
    assert status_of(client_for(classmate), url) == 302
    assert thread_row(db, thread["id"]).status == PostStatus.visible
    job = check_of(db, upload_of(db, url).id)
    assert (job.verdict, job.category, job.model) == ("clear", None, "claude-haiku-5-5")
    assert job.cost_microusd > 0
    assert hub_reports(db) == []
    # its cost counts toward the monthly budget for Claude, with no person
    assert db.scalar(select(NooraUsage).where(NooraUsage.user_id.is_(None))) is not None


def test_what_goes_to_claude_is_the_picture_and_the_rules_only(
    harness: Harness, client_for: Clients, make_user: Callable[..., User], storage: Any
) -> None:
    sara = make_user(name="Sara Almahmood", email="sara.private@example.com", year=2)
    upload_picture(client_for(sara), storage, png(size=(3000, 2000)), name="sara-almahmood-cpr.png")

    [sent] = harness.stub.sent
    assert sent["model"] == "claude-haiku-5-5"
    assert sent["output_config"]["format"]["type"] == "json_schema"
    assert sent["system"] == checks.SYSTEM
    [image, text] = sent["messages"][0]["content"]
    assert image["source"]["media_type"] == "image/jpeg"
    shrunk = Image.open(io.BytesIO(__import__("base64").b64decode(image["source"]["data"])))
    assert max(shrunk.size) <= checks.IMAGE_EDGE
    words = json.dumps({k: v for k, v in sent.items() if k != "messages"}) + text["text"]
    for private in ("Sara", "Almahmood", "sara.private", "example.com", "cpr", str(sara.id)):
        assert private not in words


def test_while_it_is_checked_only_its_uploader_sees_the_picture(
    harness: Harness, client_for: Clients, student: User, classmate: User, moderator: User, storage: Any, db: Session
) -> None:
    harness.inline = False  # Claude hasn't answered yet
    me = client_for(student)
    url = upload_picture(me, storage)
    thread = new_thread(me, body=f"![chart]({url})")
    up = upload_of(db, url)
    assert up.check_state == "checking"

    assert status_of(me, url) == 302
    assert status_of(client_for(moderator), url) == 302
    assert status_of(client_for(classmate), url) == 404
    assert status_of(client_for(), url) == 404
    slug = thread["slug"]
    mine = me.get(f"{API}/forum/threads/{slug}").json()["heldImages"]
    theirs = client_for(classmate).get(f"{API}/forum/threads/{slug}").json()
    assert mine == [{"id": str(up.id), "state": "checking", "mine": True}]
    assert theirs["heldImages"] == [{"id": str(up.id), "state": "checking", "mine": False}]
    assert theirs["image"] is None  # lists never point at a picture others can't open

    assert harness.run() == 2  # the picture, and the thread's text
    assert status_of(client_for(classmate), url) == 302
    assert client_for(classmate).get(f"{API}/forum/threads/{slug}").json()["heldImages"] == []


def test_a_flagged_picture_stays_hidden_and_goes_to_reports(
    harness: Harness, client_for: Clients, student: User, classmate: User, moderator: User, storage: Any, db: Session
) -> None:
    harness.inline = False
    me = client_for(student)
    url = upload_picture(me, storage)
    thread = new_thread(me, body=f"![x]({url})")
    harness.stub.answers.append(answer("flag", "sexual", "A nude photo."))
    harness.run()

    up = upload_of(db, url)
    assert up.check_state == "held"
    assert status_of(client_for(classmate), url) == 404
    assert status_of(me, url) == 302
    theirs = client_for(classmate).get(f"{API}/forum/threads/{thread['slug']}").json()["heldImages"]
    assert theirs == [{"id": str(up.id), "state": "checking", "mine": False}]  # others aren't told it was flagged
    mine = me.get(f"{API}/forum/threads/{thread['slug']}").json()["heldImages"]
    assert mine == [{"id": str(up.id), "state": "held", "mine": True}]

    [report] = hub_reports(db)
    assert (report.target_type, report.target_id, report.reason) == ("image", up.id, "hub_flagged")
    assert report.note == "Flagged by the Hub's automatic check as sexual content: A nude photo."
    [told] = [n for n in notifications_for(db, student) if n.title == "Your picture is hidden for now"]
    assert told.url == f"/forum/{thread['slug']}"
    assert "flagged a picture you posted in" in (told.body or "")

    queue = client_for(moderator).get(f"{API}/admin/reports").json()["items"]
    [item] = [i for i in queue if i["id"] == str(report.id)]
    assert item["fromHub"] is True
    assert item["reporter"] is None
    assert item["targetType"] == "image"
    assert item["targetImage"] == url
    assert item["targetUrl"] == f"/forum/{thread['slug']}"
    assert item["targetStatus"] == "hidden"
    assert item["targetAuthor"]["id"] == str(student.id)


def test_a_moderator_shows_a_flagged_picture_by_dismissing_the_report(
    harness: Harness, client_for: Clients, student: User, classmate: User, moderator: User, storage: Any, db: Session
) -> None:
    harness.stub.answers.append(answer("flag", "violence", "Blood."))
    me = client_for(student)
    url = upload_picture(me, storage)
    new_thread(me, body=f"![x]({url})")
    [report] = hub_reports(db)

    r = client_for(moderator).post(f"{API}/admin/reports/{report.id}/resolve", json={"status": "dismissed"})
    assert r.status_code == 200, r.text
    assert upload_of(db, url).check_state is None
    assert status_of(client_for(classmate), url) == 302
    actions = db.scalars(select(AuditEntry.action).where(AuditEntry.target_id == str(upload_of(db, url).id)))
    assert set(actions) == {"forum.image.auto_hold", "forum.image.show"}
    held = db.scalar(select(AuditEntry).where(AuditEntry.action == "forum.image.auto_hold"))
    assert held is not None
    assert held.actor_id is None
    assert held.data["via"] == "check"  # the activity log shows it as the Hub


def test_a_moderator_removes_a_flagged_picture_by_resolving_the_report(
    harness: Harness, client_for: Clients, student: User, classmate: User, moderator: User, storage: Any, db: Session
) -> None:
    harness.stub.answers.append(answer("flag", "harassment", "Insults a classmate by name."))
    me = client_for(student)
    url = upload_picture(me, storage)
    thread = new_thread(me, body=f"Look\n\n![x]({url})")
    [report] = hub_reports(db)

    r = client_for(moderator).post(f"{API}/admin/reports/{report.id}/resolve", json={"status": "resolved"})
    assert r.status_code == 200, r.text
    assert r.json()["targetStatus"] == "removed"
    assert upload_of(db, url).check_state == "removed"
    assert status_of(me, url) == 404  # removed: not even its uploader
    assert status_of(client_for(moderator), url) == 302
    theirs = client_for(classmate).get(f"{API}/forum/threads/{thread['slug']}").json()["heldImages"]
    assert [i["state"] for i in theirs] == ["removed"]
    assert thread_row(db, thread["id"]).status == PostStatus.visible  # the rest of the post stays up
    assert any(n.title == "A student rep removed your picture" for n in notifications_for(db, student))


def test_a_picture_claude_refuses_to_read_counts_as_flagged(
    harness: Harness, client_for: Clients, student: User, classmate: User, storage: Any, db: Session
) -> None:
    harness.stub.answers.append(message("", stop="refusal"))
    url = upload_picture(client_for(student), storage)

    assert upload_of(db, url).check_state == "held"
    job = check_of(db, upload_of(db, url).id)
    assert (job.verdict, job.category) == ("flagged", "declined")
    [report] = hub_reports(db)
    assert report.reason == "hub_flagged"


@pytest.mark.parametrize(
    ("trouble", "why"),
    [
        (anthropic.APITimeoutError(request=REQUEST), "Claude didn't answer in time."),
        (
            anthropic.InternalServerError("overloaded", response=httpx.Response(529, request=REQUEST), body=None),
            "The API said: InternalServerError 529",
        ),
        (message("not json at all"), "Claude's answer wasn't in the expected shape."),
        (message('{"verdict": "maybe"}'), "Claude's answer wasn't in the expected shape."),
        (message('{"verdict": "clear"', stop="max_tokens"), "Claude's answer was cut off."),
    ],
)
def test_a_picture_that_couldnt_be_checked_stays_hidden(
    harness: Harness,
    client_for: Clients,
    student: User,
    classmate: User,
    storage: Any,
    db: Session,
    trouble: Message | Exception,
    why: str,
) -> None:
    harness.stub.answers.append(trouble)
    me = client_for(student)
    url = upload_picture(me, storage)

    assert upload_of(db, url).check_state == "held"  # fail closed
    assert status_of(client_for(classmate), url) == 404
    job = check_of(db, upload_of(db, url).id)
    assert (job.verdict, job.reason) == ("unchecked", why)
    [report] = hub_reports(db)
    assert report.reason == "hub_unchecked"
    assert report.note == f"The Hub's automatic check couldn't check it: {why}"
    [told] = [n for n in notifications_for(db, student) if n.title == "Your picture is hidden for now"]
    assert "couldn't check a picture you posted" in (told.body or "")


def test_the_daily_cap_stops_the_check_without_calling_claude(
    harness: Harness, client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    harness.settings = harness.settings.model_copy(update={"forum_check_daily_cents": 0})
    url = upload_picture(client_for(student), storage)

    assert harness.stub.sent == []
    assert upload_of(db, url).check_state == "held"
    assert check_of(db, upload_of(db, url).id).reason == "The check's daily spending cap was reached."
    assert [r.reason for r in hub_reports(db)] == ["hub_unchecked"]


def test_the_daily_cap_counts_what_the_checks_spent_today(
    harness: Harness, client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    harness.settings = harness.settings.model_copy(update={"forum_check_daily_cents": 1})
    me = client_for(student)
    upload_picture(me, storage)
    assert len(harness.stub.sent) == 1
    first = db.scalar(select(ContentCheck))
    assert first is not None
    first.cost_microusd = 9_900  # 0.99 cents spent today: the next check's worst case doesn't fit
    db.commit()
    upload_picture(me, storage)
    assert len(harness.stub.sent) == 1


def test_the_monthly_budget_for_claude_stops_the_check(
    harness: Harness, client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    from app.services.noora import ask

    ask.limits(db).monthly_budget_cents = 0
    db.commit()
    url = upload_picture(client_for(student), storage)
    assert harness.stub.sent == []
    assert check_of(db, upload_of(db, url).id).reason == "The monthly budget for Claude (Manage → Numbers) was reached."


def test_without_a_key_pictures_wait_for_a_student_rep(
    harness: Harness, client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    harness.key = False
    url = upload_picture(client_for(student), storage)
    assert upload_of(db, url).check_state == "held"
    assert check_of(db, upload_of(db, url).id).reason == "There is no Anthropic API key (DSBA_ANTHROPIC_API_KEY)."


def test_a_picture_that_isnt_readable_waits_for_a_student_rep(
    harness: Harness, client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    broken = png()[:60]  # a PNG's first bytes (it passes the upload's check), but no picture
    url = upload_picture(client_for(student), storage, broken)
    assert harness.stub.sent == []
    assert check_of(db, upload_of(db, url).id).reason == "The picture couldn't be read."


def test_an_animated_picture_is_read_frame_by_frame() -> None:
    frames = [Image.new("RGB", (20, 20), c) for c in ("red", "green", "blue", "white", "black", "yellow")]
    out = io.BytesIO()
    frames[0].save(out, "GIF", save_all=True, append_images=frames[1:])
    content = checks.image_content(out.getvalue())
    assert [b["type"] for b in content] == ["image"] * checks.MAX_FRAMES + ["text"]


# ── switched off, and moderators ─────────────────────────────────────────────────────────────


def test_switched_off_nothing_is_checked(
    harness: Harness,
    set_feature: Callable[..., None],
    client_for: Clients,
    student: User,
    classmate: User,
    storage: Any,
    db: Session,
) -> None:
    set_feature("forum.auto-check", "off")
    me = client_for(student)
    url = upload_picture(me, storage)
    thread = new_thread(me, body=f"![x]({url})")
    new_reply(me, thread["id"])

    assert harness.stub.sent == []
    assert db.scalar(select(ContentCheck)) is None
    assert upload_of(db, url).check_state is None
    assert status_of(client_for(classmate), url) == 302


def test_switched_off_while_waiting_the_picture_shows(
    harness: Harness, set_feature: Callable[..., None], client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    harness.inline = False
    url = upload_picture(client_for(student), storage)
    set_feature("forum.auto-check", "off")
    harness.run()
    assert harness.stub.sent == []
    assert upload_of(db, url).check_state is None


def test_the_switch_is_stored_off_by_its_migration(db: Session) -> None:
    from app.core.access import Feature
    from app.services import access

    switch = access.switches(db).get(Feature.forum_auto_check)
    assert switch is not None
    assert switch.mode == "off"


def test_posts_and_pictures_of_moderators_are_not_checked(
    harness: Harness, client_for: Clients, moderator: User, storage: Any, db: Session
) -> None:
    rep = client_for(moderator)
    url = upload_picture(rep, storage)
    new_thread(rep, body=f"Exam timetable: ![x]({url})")
    assert harness.stub.sent == []
    assert upload_of(db, url).check_state is None


# ── text ─────────────────────────────────────────────────────────────────────────────────────


def test_a_clean_thread_stays_up(harness: Harness, client_for: Clients, student: User, db: Session) -> None:
    thread = new_thread(client_for(student), title="Group study for ST1?", body="Anyone free on Thursday?")
    [sent] = harness.stub.sent
    text = sent["messages"][0]["content"][0]["text"]
    assert "<title>\nGroup study for ST1?\n</title>" in text
    assert "Anyone free on Thursday?" in text
    assert thread_row(db, thread["id"]).status == PostStatus.visible
    assert check_of(db, thread["id"]).verdict == "clear"


def test_a_flagged_thread_is_hidden_until_a_moderator_looks(
    harness: Harness, client_for: Clients, student: User, classmate: User, moderator: User, db: Session
) -> None:
    harness.stub.answers.append(answer("flag", "exam_leak", "Shares answers to today's exam."))
    me = client_for(student)
    thread = new_thread(me, title="ST2 answers for today", body="Q1 is b, Q2 is d")

    assert thread_row(db, thread["id"]).status == PostStatus.hidden
    assert client_for(classmate).get(f"{API}/forum/threads/{thread['slug']}").status_code == 404
    mine = me.get(f"{API}/forum/threads/{thread['slug']}").json()
    assert (mine["status"], mine["heldByCheck"]) == ("hidden", True)  # its author still reads it, and is told why
    [report] = hub_reports(db)
    assert (report.target_type, report.reason) == ("thread", "hub_flagged")
    assert "answers to a live exam" in (report.note or "")
    [told] = [n for n in notifications_for(db, student) if n.title == "Your thread is hidden for now"]
    assert told.url == f"/forum/{thread['slug']}"

    r = client_for(moderator).post(f"{API}/admin/reports/{report.id}/resolve", json={"status": "dismissed"})
    assert r.status_code == 200, r.text
    assert thread_row(db, thread["id"]).status == PostStatus.visible
    assert me.get(f"{API}/forum/threads/{thread['slug']}").json()["heldByCheck"] is False


def test_a_flagged_reply_is_hidden_and_leaves_the_count(
    harness: Harness, client_for: Clients, student: User, classmate: User, moderator: User, db: Session
) -> None:
    thread = new_thread(client_for(student))
    harness.stub.answers.append(answer("flag", "harassment", "Insults the asker."))
    reply = new_reply(client_for(classmate), thread["id"], body="you are so stupid lol")

    assert reply_row(db, reply["id"]).status == PostStatus.hidden
    assert thread_row(db, thread["id"]).reply_count == 0
    [theirs] = client_for(classmate).get(f"{API}/forum/threads/{thread['slug']}").json()["replies"]
    assert (theirs["status"], theirs["heldByCheck"]) == ("hidden", True)
    [report] = hub_reports(db)
    assert (report.target_type, report.target_id) == ("reply", uuid.UUID(reply["id"]))
    assert any(n.title == "Your reply is hidden for now" for n in notifications_for(db, classmate))

    client_for(moderator).post(f"{API}/admin/reports/{report.id}/resolve", json={"status": "resolved"})
    assert reply_row(db, reply["id"]).status == PostStatus.hidden  # removed: it stays hidden


def test_a_post_that_couldnt_be_checked_stays_up_and_goes_to_reports(
    harness: Harness, client_for: Clients, student: User, classmate: User, moderator: User, db: Session
) -> None:
    harness.stub.answers.append(anthropic.APITimeoutError(request=REQUEST))
    thread = new_thread(client_for(student))

    assert thread_row(db, thread["id"]).status == PostStatus.visible  # fail open
    assert client_for(classmate).get(f"{API}/forum/threads/{thread['slug']}").status_code == 200
    [report] = hub_reports(db)
    assert report.reason == "hub_unchecked"
    assert not any("hidden" in n.title for n in notifications_for(db, student))
    # a rep who finds it against the rules removes it from Reports: it is hidden then
    client_for(moderator).post(f"{API}/admin/reports/{report.id}/resolve", json={"status": "resolved"})
    assert thread_row(db, thread["id"]).status == PostStatus.hidden


def test_a_refused_post_is_hidden(harness: Harness, client_for: Clients, student: User, db: Session) -> None:
    harness.stub.answers.append(message("", stop="refusal"))
    thread = new_thread(client_for(student))
    assert thread_row(db, thread["id"]).status == PostStatus.hidden
    assert check_of(db, thread["id"]).category == "declined"


def test_the_daily_cap_keeps_posts_up(harness: Harness, client_for: Clients, student: User, db: Session) -> None:
    harness.settings = harness.settings.model_copy(update={"forum_check_daily_cents": 0})
    thread = new_thread(client_for(student))
    assert harness.stub.sent == []
    assert thread_row(db, thread["id"]).status == PostStatus.visible
    assert [r.reason for r in hub_reports(db)] == ["hub_unchecked"]


def test_an_edit_is_checked_again(harness: Harness, client_for: Clients, student: User, db: Session) -> None:
    me = client_for(student)
    thread = new_thread(me)
    reply = new_reply(me, thread["id"])
    harness.stub.answers.extend([answer("flag", "personal_data", "Posts a phone number."), answer()])
    r = me.patch(f"{API}/forum/threads/{thread['id']}", json={"body": "Call Ali on 3999 1234"})
    assert r.status_code == 200, r.text
    assert thread_row(db, thread["id"]).status == PostStatus.hidden
    assert len(harness.stub.sent) == 3
    # an edit that changes nothing isn't sent again
    me.patch(f"{API}/forum/replies/{reply['id']}", json={"body": reply["body"]})
    assert len(harness.stub.sent) == 3


def test_one_open_report_from_the_hub_per_post(
    harness: Harness, client_for: Clients, student: User, db: Session
) -> None:
    harness.stub.answers.extend([anthropic.APITimeoutError(request=REQUEST)] * 2)
    me = client_for(student)
    thread = new_thread(me)
    me.patch(f"{API}/forum/threads/{thread['id']}", json={"body": "Edited."})
    assert len(hub_reports(db)) == 1


def test_a_check_whose_run_died_is_run_again(
    harness: Harness, client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    from datetime import timedelta

    from app.core.time import utcnow

    harness.inline = False
    url = upload_picture(client_for(student), storage)
    job = check_of(db, upload_of(db, url).id)
    job.status, job.started_at, job.attempts = "working", utcnow() - timedelta(minutes=10), 1
    db.commit()
    assert harness.run() == 1
    assert upload_of(db, url).check_state is None
    # and given up after MAX_ATTEMPTS: the picture waits for a student rep
    url2 = upload_picture(client_for(student), storage)
    job2 = check_of(db, upload_of(db, url2).id)
    job2.status, job2.started_at = "working", utcnow() - timedelta(minutes=10)
    job2.attempts = checks.MAX_ATTEMPTS
    db.commit()
    harness.run()
    assert upload_of(db, url2).check_state == "held"
    assert check_of(db, upload_of(db, url2).id).verdict == "unchecked"


def test_a_post_deleted_before_its_check_ran_is_left_alone(
    harness: Harness, client_for: Clients, student: User, db: Session
) -> None:
    harness.inline = False
    me = client_for(student)
    thread = new_thread(me)
    assert me.delete(f"{API}/forum/threads/{thread['id']}").status_code == 204
    harness.run()
    assert harness.stub.sent == []
    assert check_of(db, thread["id"]).verdict is None
    assert db.get(ForumThread, uuid.UUID(thread["id"])) is not None
