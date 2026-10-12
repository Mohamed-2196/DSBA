"""The forum list's full-text search (GET /forum/threads?q=).

Every word of the query must match somewhere in the thread: its title or body, one of its visible replies, its
module's unit code or name, one of its tags or its category ("calculator office" finds a thread titled "Lost my
calculator" whose answer mentions the office). Words of two letters or more match as prefixes (search as you type;
the 'simple' configuration doesn't stem), and common English words are skipped. A query with quotes or a "-word" is
read as web-search syntax by Postgres and must match within one of those texts.

Why this differs from the site-wide search (app/services/search.py text_query, websearch with the last word as a
prefix, over each document's own text): a forum thread is a conversation, and its answer is often in a reply, so the
forum looks for each word across the whole thread. Both use the same search_vector columns and the 'simple' config."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, String, and_, exists, func, literal, or_, select

from app.models import ForumReply, ForumThread, Module, PostStatus
from app.services.forum.taxonomy import CATEGORIES, TAGS


def has_tag(tag: str) -> ColumnElement[bool]:
    """The thread carries this tag."""
    return literal(tag, String) == ForumThread.tags.any_()


_STOP_WORDS = (
    "a an and are as at be but by can could do does for from get got has have how i if in into is it its me my of on "
    "or our should so than that the their them then there these this to was we were what when where which who why "
    "will with would you your any anyone someone just about vs"
)
_STOP = frozenset(_STOP_WORDS.split())
_MAX_TERMS = 8
# Quotes or a "-word" mean the person wrote a web-search style query: Postgres parses it as it is.
_WEBSEARCH_SYNTAX = re.compile(r'"|(?:^|\s)-[^\W_]')


def _tokens(text: str) -> list[str]:
    """Words: runs of letters (with their marks) and digits, lower-cased."""
    words: list[str] = []
    cur: list[str] = []
    for ch in text.lower():
        if unicodedata.category(ch)[0] in "LMN":
            cur.append(ch)
        elif cur:
            words.append("".join(cur))
            cur = []
    if cur:
        words.append("".join(cur))
    return [w for w in words if any(unicodedata.category(c)[0] in "LN" for c in w)]


def search_terms(q: str) -> list[str]:
    """The words of a query worth matching: no repeats, stop words dropped (unless that leaves nothing)."""
    words = list(dict.fromkeys(_tokens(q)))
    kept = [w for w in words if w not in _STOP] or words
    return kept[:_MAX_TERMS]


def _words_of(*texts: str) -> frozenset[str]:
    return frozenset(w for t in texts for w in _tokens(t))


_TAG_WORDS = {t.id: _words_of(t.id, t.label) for t in TAGS}
_CATEGORY_WORDS = {c.id: _words_of(c.id, c.label, c.short) for c in CATEGORIES}


def _named(words_by_id: dict[str, frozenset[str]], term: str, prefix: bool) -> list[str]:
    return [i for i, words in words_by_id.items() if any(w == term or (prefix and w.startswith(term)) for w in words)]


def _module_vector() -> ColumnElement[Any]:
    return func.to_tsvector("simple", func.concat_ws(" ", Module.unit_code, Module.name, Module.short_name))


def _matches_anywhere(
    tsq: ColumnElement[Any], tag_ids: Sequence[str] = (), category_ids: Sequence[str] = ()
) -> ColumnElement[bool]:
    """The query matches the thread (title and body), one of its visible replies, its module, a tag or the category."""
    conds: list[ColumnElement[bool]] = [
        ForumThread.search_vector.bool_op("@@")(tsq),
        ForumThread.module_id.in_(select(Module.id).where(_module_vector().bool_op("@@")(tsq))),
        exists().where(
            ForumReply.thread_id == ForumThread.id,
            ForumReply.status == PostStatus.visible,
            ForumReply.search_vector.bool_op("@@")(tsq),
        ),
    ]
    conds += [has_tag(t) for t in tag_ids]
    if category_ids:
        conds.append(ForumThread.category.in_(category_ids))
    return or_(*conds)


def search_condition(q: str) -> ColumnElement[bool] | None:
    """Every word must match somewhere in the thread, its replies, its module, its tags or its category.
    Words of two letters or more match as prefixes (search as you type; the 'simple' config doesn't stem).
    A query with quotes or "-word" is handed to websearch_to_tsquery as it is. None: nothing to search for."""
    q = q.strip()
    if _WEBSEARCH_SYNTAX.search(q):
        return _matches_anywhere(func.websearch_to_tsquery("simple", q)) if _tokens(q) else None
    terms = search_terms(q)
    if not terms:
        return None
    conds: list[ColumnElement[bool]] = []
    for term in terms:
        prefix = len(term) >= 2
        tsq = func.to_tsquery("simple", f"{term}:*" if prefix else term)
        conds.append(_matches_anywhere(tsq, _named(_TAG_WORDS, term, prefix), _named(_CATEGORY_WORDS, term, prefix)))
    return and_(*conds)
