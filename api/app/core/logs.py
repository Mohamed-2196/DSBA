"""What the API's logs may hold: no bearer secrets. The private calendar feed is the one address with a secret in its
path (/api/v1/feeds/calendar/<secret>.ics, routers/feeds.py): every log line that would carry it, the access log's
request line included, carries /api/v1/feeds/calendar/….ics instead."""

from __future__ import annotations

import logging
import re

_FEED_SECRET = re.compile(r"(/feeds/calendar/)[^/?#\s\"]+(\.ics)")


def redact_path(text: str) -> str:
    """`text` with any private feed's secret taken out of it."""
    return _FEED_SECRET.sub(r"\1…\2", text)


class RedactFeedSecrets(logging.Filter):
    """Takes the feed's secret out of a record's message and its arguments (uvicorn's access line is
    '%s - "%s %s HTTP/%s" %d' with the path as an argument)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_path(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(redact_path(a) if isinstance(a, str) else a for a in record.args)
        return True


def keep_secrets_out_of_access_log() -> None:
    """Puts the filter on uvicorn's access logger, once (uvicorn's own logging config leaves a logger's filters as
    they are)."""
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, RedactFeedSecrets) for f in access.filters):
        access.addFilter(RedactFeedSecrets())
