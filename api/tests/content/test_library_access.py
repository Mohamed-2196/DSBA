"""In the library, library.upload is for sharing, and library.manage for reviewing and for seeing what waits for
review, held through any role."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.core.access import Box
from app.models import User
from tests.core.helpers import API, PDF, share_pdf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
PDF_UPLOAD = {"purpose": "library", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)}


def test_sharing_needs_library_upload(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    reader = make_user(name="Only Reads", roles=("newsletter-manager",))
    refused = client_for(reader).post(f"{API}/uploads", json=PDF_UPLOAD)
    assert refused.status_code == 403
    assert refused.json()["error"]["message"] == "Your account can't upload to the library. Contact a student rep."


def test_reviewing_comes_from_the_box_through_any_role(
    client_for: ClientFor,
    make_user: MakeUser,
    make_role: Callable[..., Any],
    give_roles: Callable[..., None],
    storage: Any,
) -> None:
    pending = share_pdf(client_for(make_user(name="Sara Student")), storage, title="Waiting for review")
    make_role("library-team", Box.library_manage)
    make_role("forum-helpers", Box.forum_moderate)
    librarian, helper = make_user(name="Library Helper"), make_user(name="Forum Helper")
    give_roles(librarian, "student", "library-team")
    give_roles(helper, "student", "forum-helpers")
    url = f"{API}/library/items/{pending['id']}"
    assert client_for(helper).get(url).status_code == 404  # a pending file is for the library's managers
    assert client_for(helper).post(f"{url}/review", json={"decision": "publish"}).status_code == 403
    assert client_for(librarian).get(url).status_code == 200
    assert client_for(librarian).post(f"{url}/review", json={"decision": "publish"}).status_code == 200
    assert client_for().get(url).status_code == 200
    assert share_pdf(client_for(librarian), storage, title="Straight in")["status"] == "published"
