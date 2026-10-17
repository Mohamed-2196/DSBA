"""Links, pictures and copy as Pydantic types, for the documents moderators and admins write (newsletter issues,
the Career Navigator). The rules themselves are in app/core/links.py."""

from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator, StringConstraints
from pydantic_core import PydanticCustomError

from app.core.links import (
    HTTPS_RULE,
    HUB_PATH_RULE,
    LINK_RULE,
    PICTURE_RULE,
    is_https,
    is_hub_path,
    markup_links,
    safe_link,
    safe_picture,
)

# ── as Pydantic types ────────────────────────────────────────────────────────────────────────


def _link(value: str) -> str:
    if not safe_link(value):
        raise PydanticCustomError("link", LINK_RULE)
    return value


def _https(value: str) -> str:
    if not is_https(value):
        raise PydanticCustomError("link", HTTPS_RULE)
    return value


def _hub_path(value: str) -> str:
    if not is_hub_path(value):
        raise PydanticCustomError("link", HUB_PATH_RULE)
    return value


def _picture(value: str) -> str:
    if not safe_picture(value):
        raise PydanticCustomError("picture", PICTURE_RULE)
    return value


def _markup(value: str) -> str:
    if any(not safe_link(href) for href in markup_links(value)):
        raise PydanticCustomError("link", LINK_RULE)
    return value


# A link: https://, mailto: or a page of the Hub ('/calendar').
HubLink = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000), AfterValidator(_link)]
# An address on another site: https:// only.
HttpsUrl = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000), AfterValidator(_https)
]
# A page of the Hub: '/library?type=notes'.
HubPath = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500), AfterValidator(_hub_path)
]
# A picture: 'brand/newsletter-cover.jpg' (a file of the web app) or '/api/v1/media/<id>' (an uploaded image).
PictureSrc = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300), AfterValidator(_picture)
]
# Copy, with **bold**, *italic*, ==highlight== and [label](link) markup; the length is set where it is used.
MARKUP = AfterValidator(_markup)
