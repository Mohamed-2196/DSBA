"""No bearer secret in the API's logs: the private calendar feed's secret is taken out of every line."""

from __future__ import annotations

import logging

from app.core.logs import RedactFeedSecrets, redact_path

SECRET = "Ab3_-" + "x" * 38


def test_the_feeds_secret_is_taken_out_of_a_path() -> None:
    assert redact_path(f"/api/v1/feeds/calendar/{SECRET}.ics") == "/api/v1/feeds/calendar/….ics"
    assert redact_path(f"/api/v1/feeds/calendar/{SECRET}.ics?x=1") == "/api/v1/feeds/calendar/….ics?x=1"
    assert redact_path("/api/v1/calendar/events/123.ics") == "/api/v1/calendar/events/123.ics"
    assert redact_path("/api/v1/calendar/feed.ics") == "/api/v1/calendar/feed.ics"


def test_an_access_line_keeps_everything_but_the_secret() -> None:
    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", f"/api/v1/feeds/calendar/{SECRET}.ics", "1.1", 200),
        None,
    )
    assert RedactFeedSecrets().filter(record)
    assert record.getMessage() == '127.0.0.1:5000 - "GET /api/v1/feeds/calendar/….ics HTTP/1.1" 200'
