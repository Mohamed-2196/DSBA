"""Request bodies a route caps for itself, whatever the proxy in front does. For a route with a ceiling:

- a declared Content-Length over it is refused at once, unread (413 too_large), and one that isn't a number with
  400 bad_request;
- the body is then read here, its size added up as it arrives (a chunked request declares none): past the ceiling
  the reading stops and the answer is 413 too_large;
- a body within it is handed to the route as one piece, so the route never sees more than its ceiling."""

from __future__ import annotations

import re
from collections.abc import Sequence

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def _refuse(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


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
        most = self._most(scope) if scope["type"] == "http" else None
        if most is None:
            await self.app(scope, receive, send)
            return
        declared = dict(scope.get("headers", [])).get(b"content-length")
        if declared is not None:
            if not declared.isdigit():
                await _refuse(400, "bad_request", "This request's size isn't a number.")(scope, receive, send)
                return
            if int(declared) > most:
                await _refuse(413, "too_large", "This is too much to save at once.")(scope, receive, send)
                return

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return  # the client went away: nothing to answer
            body += message.get("body", b"")
            if len(body) > most:
                await _refuse(413, "too_large", "This is too much to save at once.")(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        handed = False

        async def replay() -> Message:
            nonlocal handed
            if not handed:
                handed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
