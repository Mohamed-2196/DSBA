"""Security headers on every API response (security review, findings 12 and 19).

The reverse proxy in front (web/deploy/Caddyfile) adds HSTS and the web app's Content-Security-Policy; these
headers cover the API's own answers wherever they are served from:

  X-Content-Type-Options: nosniff   a JSON answer is never read as a script or a page
  Referrer-Policy: no-referrer      redirects to the bucket or to a library link carry no Referer
  X-Frame-Options / frame-ancestors no answer is shown inside another site's frame
  Content-Security-Policy           an answer opened as a page can load and run nothing
  Cache-Control: no-store           unless a handler chose its own policy; always for signed-in JSON

The API docs (development only) are left without the CSP, which would break their page."""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
DOCS_PREFIX = "/api/v1/docs"
# All of them, for answers made outside this middleware (unhandled errors: app.core.errors).
ERROR_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": API_CSP,
    "Cache-Control": "no-store",
}


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        docs = path.startswith(DOCS_PREFIX)
        signed_in = get_settings().session_cookie in Request(scope).cookies

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("Referrer-Policy", "no-referrer")
                headers.setdefault("X-Frame-Options", "DENY")
                if not docs:
                    headers.setdefault("Content-Security-Policy", API_CSP)
                    json = headers.get("content-type", "").startswith("application/json")
                    if signed_in and json:  # someone's own data: never kept in a cache
                        headers["Cache-Control"] = "no-store"
                    else:
                        headers.setdefault("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_with_headers)
