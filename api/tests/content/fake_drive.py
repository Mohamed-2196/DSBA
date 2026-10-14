"""A fake Google Drive for the Drive import's tests: the part of API v3 the import uses (files.list by parent,
files.get, alt=media, export), Google's error bodies, resource keys, and a token endpoint for service accounts, behind
httpx.MockTransport. Every request is recorded, and the fake fails a test that sends the API key in a URL.

Who sees what: a request with the right X-Goog-Api-Key sees the "public" nodes (shared with anyone with the link); a
request with a token the fake issued to the service account sees "public" and "service" nodes; "none" is seen by
nobody (shared only inside BIBF's domain). A node with a resource key needs it in X-Goog-Drive-Resource-Keys."""

from __future__ import annotations

import base64
import json
import re
import secrets
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

API_KEY = "AIzaSyFAKE-test-key-0123456789abcdefghijk"
TOKEN_URI = "https://oauth2.googleapis.com/token"
SERVICE_EMAIL = "hub-importer@dsba-test.iam.gserviceaccount.com"
FOLDER = "application/vnd.google-apps.folder"
SHORTCUT = "application/vnd.google-apps.shortcut"
DOC = "application/vnd.google-apps.document"
SHEET = "application/vnd.google-apps.spreadsheet"
SLIDES = "application/vnd.google-apps.presentation"
FORM = "application/vnd.google-apps.form"
PDF_TYPE = "application/pdf"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

PDF = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n"
XLSX = b"PK\x03\x04" + b"\x00" * 60
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 48

Reply = httpx.Response | Exception
Match = Callable[[httpx.Request], bool]


@dataclass
class Node:
    id: str
    name: str
    mime: str
    parent: str | None
    content: bytes = b""
    access: str = "public"  # public | service | none
    resource_key: str | None = None
    size: int | str | None = None  # what Drive says; None: the real size (files), nothing (Google files)
    can_download: bool | None = None
    target: str | None = None  # shortcuts
    target_mime: str | None = None
    exports: dict[str, bytes] = field(default_factory=dict)  # Google files: export type -> bytes
    refuse_export: str | None = None  # a reason, e.g. exportSizeLimitExceeded


def google_error(status: int, reason: str, message: str = "", *, details: str | None = None) -> httpx.Response:
    """An error as Google writes it: errors[].reason in Drive's format, details[].reason (ErrorInfo) in the newer."""
    error: dict[str, Any] = {
        "code": status,
        "message": message or reason,
        "errors": [{"domain": "global", "reason": reason, "message": message or reason}],
    }
    if details:
        error["details"] = [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": details}]
    return httpx.Response(status, json={"error": error})


def automated_queries(status: int = 403) -> httpx.Response:
    """Google's "Sorry..." page, as www.googleapis.com serves it to a network it takes for a bot: HTML, no reason."""
    page = (
        '<html><head><meta http-equiv="content-type" content="text/html; charset=utf-8"/><title>Sorry...</title>'
        "</head><body><h1>We're sorry...</h1><p>... but your computer or network may be sending automated queries. "
        "To protect our users, we can't process your request right now.</p></body></html>"
    )
    return httpx.Response(status, text=page, headers={"Content-Type": "text/html; charset=UTF-8"})


def not_found(file_id: str) -> httpx.Response:
    return google_error(404, "notFound", f"File not found: {file_id}.")


class CountingStream(httpx.SyncByteStream):
    """A body served in chunks, counting how many were read (a download must stop at its limit)."""

    def __init__(self, data: bytes, chunk: int = 64 * 1024) -> None:
        self.data, self.chunk, self.served = data, chunk, 0

    def __iter__(self) -> Iterator[bytes]:
        for start in range(0, len(self.data), self.chunk):
            self.served += 1
            yield self.data[start : start + self.chunk]


class BrokenStream(httpx.SyncByteStream):
    """A body that breaks off after its first part, as a dropped connection does."""

    def __init__(self, first: bytes) -> None:
        self.first = first

    def __iter__(self) -> Iterator[bytes]:
        yield self.first
        raise httpx.ReadError("connection reset by peer")


class FakeDrive:
    def __init__(self) -> None:
        self.nodes: dict[str, Node] = {}
        self.requests: list[httpx.Request] = []
        self.queued: list[tuple[Match, Reply]] = []
        self.page_size = 2  # small pages: listings take several
        self.tokens: set[str] = set()
        self.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.grants: list[dict[str, Any]] = []
        self.content_hosts: dict[str, bytes] = {}  # redirect targets on googleusercontent.com: path -> bytes
        self.streams: dict[str, CountingStream] = {}  # file id -> its last download's stream

    # ── building the drive ──

    def add(self, node: Node) -> Node:
        self.nodes[node.id] = node
        return node

    def folder(self, node_id: str, name: str, parent: str | None = None, **kw: Any) -> Node:
        return self.add(Node(node_id, name, FOLDER, parent, **kw))

    def file(self, node_id: str, name: str, parent: str, content: bytes = PDF, mime: str = PDF_TYPE, **kw: Any) -> Node:
        return self.add(Node(node_id, name, mime, parent, content=content, **kw))

    def google(self, node_id: str, name: str, parent: str, mime: str = DOC, **kw: Any) -> Node:
        exports = {PDF_TYPE: PDF} if mime in (DOC, SLIDES) else {XLSX_TYPE: XLSX} if mime == SHEET else {}
        return self.add(Node(node_id, name, mime, parent, exports=exports, **kw))

    def shortcut(self, node_id: str, name: str, parent: str, target: str, **kw: Any) -> Node:
        target_mime = self.nodes[target].mime if target in self.nodes else PDF_TYPE
        return self.add(Node(node_id, name, SHORTCUT, parent, target=target, target_mime=target_mime, **kw))

    def queue(self, match: Match, *replies: Reply) -> None:
        """Replies served, in order, to the next requests that match (before the drive answers them itself)."""
        self.queued.extend((match, reply) for reply in replies)

    # ── what the tests look at ──

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def calls(self, path_part: str = "") -> list[httpx.Request]:
        return [r for r in self.requests if path_part in r.url.path]

    def key_file(self, path: Any) -> str:
        """Writes a service account's JSON key file (this fake's account) and returns its path."""
        pem = self.private_key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        ).decode()
        info = {
            "type": "service_account",
            "project_id": "dsba-test",
            "private_key_id": "test-key-1",
            "private_key": pem,
            "client_email": SERVICE_EMAIL,
            "client_id": "1234567890",
            "token_uri": TOKEN_URI,
        }
        path.write_text(json.dumps(info), encoding="utf-8")
        return str(path)

    # ── answering ──

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert "key" not in request.url.params, "the API key must never travel in a URL"
        for i, (match, reply) in enumerate(self.queued):
            if match(request):
                del self.queued[i]
                if isinstance(reply, Exception):
                    raise reply
                return reply
        if str(request.url).startswith(TOKEN_URI):
            return self._token(request)
        if request.url.host.endswith(".googleusercontent.com"):
            assert "x-goog-api-key" not in request.headers
            assert "authorization" not in request.headers
            body = self.content_hosts.get(request.url.path)
            return httpx.Response(200, content=body) if body is not None else httpx.Response(404)
        assert request.url.host == "www.googleapis.com", f"unexpected request to {request.url.host}"
        who = self._who(request)
        if isinstance(who, httpx.Response):
            return who
        path = request.url.path
        if path == "/drive/v3/files":
            return self._list(request, who)
        m = re.fullmatch(r"/drive/v3/files/([A-Za-z0-9_-]+)(/export)?", path)
        assert m is not None, path
        node = self._visible(m.group(1), request, who)
        if isinstance(node, httpx.Response):
            return node
        if m.group(2):
            return self._export(node, request)
        if request.url.params.get("alt") == "media":
            return self._media(node)
        return httpx.Response(200, json=self.describe(node))

    def _who(self, request: httpx.Request) -> str | httpx.Response:
        key = request.headers.get("x-goog-api-key")
        bearer = request.headers.get("authorization", "")
        if key is not None:
            if key != API_KEY:
                return google_error(
                    400, "badRequest", "API key not valid. Please pass a valid API key.", details="API_KEY_INVALID"
                )
            return "public"
        if bearer.startswith("Bearer ") and bearer.removeprefix("Bearer ") in self.tokens:
            return "service"
        return google_error(401, "authError", "Invalid Credentials")

    def _can_see(self, node: Node, who: str) -> bool:
        return node.access == "public" or (node.access == "service" and who == "service")

    def _has_key(self, node: Node, request: httpx.Request) -> bool:
        if node.resource_key is None:
            return True
        sent = request.headers.get("x-goog-drive-resource-keys", "")
        return f"{node.id}/{node.resource_key}" in sent.split(",")

    def _visible(self, node_id: str, request: httpx.Request, who: str) -> Node | httpx.Response:
        node = self.nodes.get(node_id)
        if node is None or not self._can_see(node, who) or not self._has_key(node, request):
            return not_found(node_id)
        return node

    def describe(self, node: Node) -> dict[str, Any]:
        out: dict[str, Any] = {"id": node.id, "name": node.name, "mimeType": node.mime}
        if node.size is not None:
            out["size"] = str(node.size)
        elif not node.mime.startswith("application/vnd.google-apps."):
            out["size"] = str(len(node.content))
        if node.resource_key:
            out["resourceKey"] = node.resource_key
        if node.can_download is not None:
            out["capabilities"] = {"canDownload": node.can_download}
        if node.target:
            target = self.nodes.get(node.target)
            details: dict[str, Any] = {"targetId": node.target, "targetMimeType": node.target_mime}
            if target is not None and target.resource_key:
                details["targetResourceKey"] = target.resource_key
            out["shortcutDetails"] = details
        return out

    def _list(self, request: httpx.Request, who: str) -> httpx.Response:
        params = request.url.params
        assert params.get("supportsAllDrives") == "true"
        assert params.get("includeItemsFromAllDrives") == "true"
        m = re.fullmatch(r"'([A-Za-z0-9_-]+)' in parents and trashed = false", params.get("q", ""))
        assert m is not None, params.get("q")
        folder = self._visible(m.group(1), request, who)
        if isinstance(folder, httpx.Response):
            return folder
        children = [n for n in self.nodes.values() if n.parent == folder.id and self._can_see(n, who)]
        start = int(params.get("pageToken") or 0)
        page = children[start : start + self.page_size]
        body: dict[str, Any] = {"files": [self.describe(n) for n in page]}
        if start + self.page_size < len(children):
            body["nextPageToken"] = str(start + self.page_size)
        return httpx.Response(200, json=body)

    def _media(self, node: Node) -> httpx.Response:
        if node.mime.startswith("application/vnd.google-apps."):
            return google_error(403, "fileNotDownloadable", "Only files with binary content can be downloaded.")
        if node.can_download is False:
            return google_error(403, "cannotDownloadFile", "The user does not have permission to download this file.")
        stream = CountingStream(node.content)
        self.streams[node.id] = stream
        return httpx.Response(200, stream=stream, headers={"Content-Type": node.mime})

    def _export(self, node: Node, request: httpx.Request) -> httpx.Response:
        if node.refuse_export:
            return google_error(403, node.refuse_export, "This file is too large to be exported.")
        body = node.exports.get(request.url.params.get("mimeType", ""))
        if body is None:
            return google_error(400, "badRequest", "The requested conversion is not supported.")
        return httpx.Response(200, content=body)

    def _token(self, request: httpx.Request) -> httpx.Response:
        """The OAuth token endpoint: checks the JWT grant the service account signed, then issues a token."""
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        assert form["grant_type"] == "urn:ietf:params:oauth:grant-type:jwt-bearer"
        header_b64, claims_b64, signature_b64 = form["assertion"].split(".")
        signature = base64.urlsafe_b64decode(signature_b64 + "=" * (-len(signature_b64) % 4))
        self.private_key.public_key().verify(
            signature, f"{header_b64}.{claims_b64}".encode(), padding.PKCS1v15(), hashes.SHA256()
        )
        claims = json.loads(base64.urlsafe_b64decode(claims_b64 + "=" * (-len(claims_b64) % 4)))
        self.grants.append(claims)
        assert claims["iss"] == SERVICE_EMAIL
        assert claims["aud"] == TOKEN_URI
        assert claims["scope"] == "https://www.googleapis.com/auth/drive.readonly"
        assert claims["exp"] > time.time()
        token = f"ya29.fake-{secrets.token_hex(8)}"
        self.tokens.add(token)
        return httpx.Response(200, json={"access_token": token, "expires_in": 3600, "token_type": "Bearer"})


def on_path(part: str) -> Match:
    """Requests whose path contains `part` ('/files/abc', '/export')."""
    return lambda request: part in request.url.path


def listing(folder_id: str) -> Match:
    return lambda request: request.url.path == "/drive/v3/files" and folder_id in request.url.params.get("q", "")


def media(file_id: str) -> Match:
    return lambda r: r.url.path == f"/drive/v3/files/{file_id}" and r.url.params.get("alt") == "media"
