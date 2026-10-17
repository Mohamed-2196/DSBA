"""Request bodies refused before they are read: a route's own ceiling on the size its Content-Length declares
(413 too_large). Caddy caps every body at 1 MB in production; these keep a route's promise without it (security review
SEC-36: one sheet of ink is never parsed whole when it is far too big). Browsers always declare the size of the JSON
they send."""

from __future__ import annotations

import re
from collections.abc import Sequence

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class BodyLimitMiddleware:
    """`limits`: (method, path pattern, most bytes) for the routes that have a ceiling of their own."""

    def __init__(self, app: ASGIApp, limits: Sequence[tuple[str, str, int]]) -> None:
        self.app = app
        self.limits = [(method, re.compile(pattern), most) for method, pattern, most in limits]

    def _most(self, scope: Scope) -> int | None:
        for method, pattern, most in self.limits:
            if scope.get("method") == method and pattern.fullmatch(scope.get("path", "")):
                return most
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            most = self._most(scope)
            declared = dict(scope.get("headers", [])).get(b"content-length", b"")
            if most is not None and declared.isdigit() and int(declared) > most:
                body = {"error": {"code": "too_large", "message": "This is too much to save at once."}}
                await JSONResponse(body, status_code=413)(scope, receive, send)
                return
        await self.app(scope, receive, send)
