"""The notifications the forum sends, and takes back.

- A reply tells the thread's author (thread_reply) and the author of the reply it answers (reply_reply); an accepted
  answer tells its author (answer_accepted). They link to the reply itself, /forum/<slug>#reply-<id> (ST-4), and quote
  the start of the reply, so two replies in one thread read differently (ST-6).
- An anonymous thread's author isn't named in what their actions send (a reply in their thread, accepting an
  answer): the notification says "The person who asked" and has no actor.
- Followers hear about accepted answers and, if they chose, new replies (follows.py).
- When a student rep hides a post, its author is told, with the rep's reason if they gave one (decision D3, ST-5).
  The rep isn't named: the notice comes from "a student rep".
- When a reply is deleted or hidden, the notifications about it go, and so do their emails that haven't gone out yet
  (ST-6)."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.text import clip
from app.models import EmailOutbox, ForumReply, ForumThread, Notification, OutboxStatus, ThreadFollow, User
from app.services.forum.text import excerpt
from app.services.notify import notify

REPLY_KINDS = (
    "thread_reply",
    "reply_reply",
    "answer_accepted",
    "followed_reply",
    "followed_answer",
)  # the notifications about one reply
QUOTE_LENGTH = 140  # characters of a reply quoted in its notification
TITLE_LENGTH = 60  # characters of a thread title in a notification's title


def reply_url(t: ForumThread, reply_id: uuid.UUID) -> str:
    """The reply on its thread's page: the page scrolls to it."""
    return f"/forum/{t.slug}#reply-{reply_id}"


def quoted_title(t: ForumThread) -> str:
    """The thread's title in quotes, cut at a word when it is long."""
    return f"“{clip(t.title, TITLE_LENGTH + 1, at_word=True)}”"


def named(t: ForumThread, actor: User) -> bool:
    """Whether a notification may name `actor`: not when they are the author of the anonymous thread `t`."""
    return not (t.anonymous and t.author_id == actor.id)


def reply_posted(db: Session, t: ForumThread, r: ForumReply, parent: ForumReply | None, actor: User) -> set[uuid.UUID]:
    """The thread's author and the parent reply's author hear about a new reply, once each: someone answering the
    thread author's own reply sends them one notification, not two. Nobody hears about their own reply.
    -> the people told."""
    shown = named(t, actor)
    name = (actor.display_name or "Someone") if shown else "The person who asked"
    quote = excerpt(r.body, QUOTE_LENGTH) or None
    url = reply_url(t, r.id)
    data = {"threadId": str(t.id), "replyId": str(r.id)}
    parent_author = parent.author_id if parent is not None else None
    if parent_author is not None:
        title = f"{name} replied to you in {quoted_title(t)}"
        notify(db, parent_author, "reply_reply", title, body=quote, url=url, actor=actor, named=shown, data=data)
    if t.author_id is not None and t.author_id != parent_author:
        title = f"{name} replied to your thread {quoted_title(t)}"
        notify(db, t.author_id, "thread_reply", title, body=quote, url=url, actor=actor, named=shown, data=data)
    return {i for i in (parent_author, t.author_id) if i is not None}


def answer_accepted(db: Session, t: ForumThread, r: ForumReply, actor: User) -> None:
    if r.author_id is None:
        return
    notify(
        db,
        r.author_id,
        "answer_accepted",
        "Your reply was accepted as the answer",
        body=f"“{t.title}”",
        url=reply_url(t, r.id),
        actor=actor,
        named=named(t, actor),
        data={"threadId": str(t.id), "replyId": str(r.id)},
    )


def post_hidden(db: Session, t: ForumThread, r: ForumReply | None, rep: User, reason: str | None) -> None:
    """A rep hid the thread `t` (r None) or the reply `r` in it: its author is told why, if the rep said. They can
    still open it (D3). Not when a rep hides their own post."""
    author_id = r.author_id if r is not None else t.author_id
    if author_id is None or author_id == rep.id:
        return
    what = "reply" if r is not None else "thread"
    where = f"in {quoted_title(t)}" if r is not None else quoted_title(t)
    body = f"Your {what} {where} is now visible only to you and the student reps."
    body += f" Reason: {reason}" if reason else " Contact a student rep if you think this is a mistake."
    notify(
        db,
        author_id,
        "system",
        f"A student rep hid your {what}",
        body=body,
        url=reply_url(t, r.id) if r is not None else f"/forum/{t.slug}",
        data={"threadId": str(t.id), **({"replyId": str(r.id)} if r is not None else {}), "reason": reason},
    )


def forget_reply(db: Session, t: ForumThread, r: ForumReply) -> None:
    """The notifications about this reply go (it was deleted or hidden), and their emails if they haven't gone out.
    They can only be in the inboxes of the thread's author, the parent reply's author, the reply's own author or the
    thread's followers."""
    parent_author = db.scalar(select(ForumReply.author_id).where(ForumReply.id == r.parent_id)) if r.parent_id else None
    inboxes = {i for i in (t.author_id, parent_author, r.author_id) if i is not None}
    inboxes |= set(db.scalars(select(ThreadFollow.user_id).where(ThreadFollow.thread_id == t.id)))
    if not inboxes:
        return
    about_it = select(Notification.id).where(
        Notification.user_id.in_(inboxes),
        Notification.kind.in_(REPLY_KINDS),
        Notification.data.contains({"replyId": str(r.id)}),
    )
    db.execute(
        update(EmailOutbox)
        .where(EmailOutbox.notification_id.in_(about_it), EmailOutbox.status == OutboxStatus.pending)
        .values(status=OutboxStatus.cancelled)
        .execution_options(synchronize_session=False)
    )
    db.execute(delete(Notification).where(Notification.id.in_(about_it)).execution_options(synchronize_session=False))
