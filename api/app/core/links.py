"""The rules for links, pictures and copy that moderators and admins write (newsletter issues, the Career
Navigator), and the paths /media serves. One home for every area (code quality review CQ-6); the Pydantic types
built on them are in app/schemas/links.py.

A link is https:// (without user:password@), mailto:, or a page of the Hub ('/calendar', not '//host' or '/\\host').
Never javascript:, data:, http:// or any other scheme, and never whitespace, a control character or a backslash
anywhere: browsers drop tabs and newlines from URLs ('/\\t/host' becomes '//host') and read '\\' as '/'.
A picture is an image file of the web app ('demo/news/photo.jpg') or an uploaded image ('/api/v1/media/<id>'):
pictures from other hosts would log every reader's address. Copy may hold [label](link) markup, whose links follow
the same rule. (Security design review findings 12 and 18, security review SEC-3.)"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any
from urllib.parse import urlsplit

LINK_RULE = "Links must start with https:// or point to a page of the Hub (like /calendar)."
HTTPS_RULE = "Use an https:// link."
PICTURE_RULE = "Use a picture of the Hub (like brand/newsletter-cover.jpg) or an uploaded image (/api/v1/media/…)."

_UNSAFE_IN_LINK = re.compile(r"[\x00-\x20\x7f\x85\u2028\u2029\\]")
_MARKUP_LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]*)\)")
# A forum image as the web app links it: /api/v1/media/<upload id> (group 1: the id), nothing glued after it.
MEDIA_PATH = re.compile(r"/api/v1/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-zA-Z/])")
# A picture file of the web app's public/ folder ('brand/newsletter-cover.jpg'): folders, then an image file name.
_APP_FILE = re.compile(
    r"/?(?:[a-z0-9][a-z0-9_-]*/)*[a-z0-9][a-z0-9_.-]*\.(?:jpe?g|png|webp|gif|avif|svg)", re.IGNORECASE
)


def is_https(value: str) -> bool:
    """An https:// address with a host, no user:password@ and nothing unsafe in it."""
    if _UNSAFE_IN_LINK.search(value) or not value.lower().startswith("https://"):
        return False
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return bool(parts.hostname) and parts.username is None and parts.password is None


def is_hub_path(value: str) -> bool:
    """A page of the Hub: '/forum/new?title=…', never '//host' or '/\\host'."""
    return value.startswith("/") and not value.startswith(("//", "/\\")) and not _UNSAFE_IN_LINK.search(value)


def safe_link(value: str) -> bool:
    """What a link may be: https://, mailto: or a page of the Hub."""
    v = value.strip()
    if _UNSAFE_IN_LINK.search(v):
        return False
    return is_https(v) or is_hub_path(v) or (v.lower().startswith("mailto:") and len(v) > len("mailto:"))


def safe_picture(value: str) -> bool:
    """What a picture may be: an uploaded image or a file of the web app, never another host."""
    v = value.strip()
    return bool(MEDIA_PATH.fullmatch(v)) or (bool(_APP_FILE.fullmatch(v)) and ".." not in v)


def markup_links(text: str) -> list[str]:
    """The links of the [label](link) markup in a piece of copy."""
    return [m.group(2) for m in _MARKUP_LINK.finditer(text)]


def json_size(value: Any) -> int:
    """Bytes of a value as JSON (UTF-8, Python's separators): what the size caps measure."""
    return len(json.dumps(value, ensure_ascii=False).encode())


def media_path(upload_id: uuid.UUID) -> str:
    """Where the web app links an uploaded forum image: '/api/v1/media/<id>'."""
    return f"/api/v1/media/{upload_id}"
