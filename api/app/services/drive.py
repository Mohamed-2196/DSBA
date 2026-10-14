"""Google Drive API v3, read-only: what the Drive import needs (python -m app.cli import-drive).

Credentials (app/config.py): an API key reads what is shared with "anyone with the link"; a service account reads
what is shared with its email. With both, a call tries the key first and the service account when the key is
refused; the import then keeps using whichever worked for a folder for everything inside it.

The key is a secret. It travels only in the X-Goog-Api-Key header, never in a URL (httpx logs request URLs), never
follows a redirect off Google's API host, and `Drive.scrub()` takes it (and the service account's token) out of any
text that leaves this module.

Drive's answers are untrusted: ids and resource keys must look like Drive's before they go into a query or a header,
bodies are read with a cap, and names, types and sizes are only hints (the import counts the bytes and checks the
first ones itself).

Errors (`DriveError`): quota refusals (403 rateLimitExceeded or userRateLimitExceeded, and 429), server errors and
broken connections are retried with exponential backoff and jitter, honouring Retry-After. Google's "automated
queries" page (a 403 or 429 in HTML, without a reason: Google blocks the network for a while after many downloads in a
row) is `DriveBlockedError`: waited out with far longer waits, then fatal, since every other download would be refused
too. A refusal for permission (403, 404) is `DriveDeniedError`. A problem with the credentials or the Cloud project (a
bad or restricted key, the Drive API turned off, the day's quota spent) is `DriveFatalError`: no other call can work
either, so the import stops."""

from __future__ import annotations

import json
import logging
import random
import re
import time
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import IO, Any, TypeVar
from urllib.parse import parse_qs, urlsplit

import httpx
from pydantic import SecretStr

from app.config import Settings
from app.core.text import clip

log = logging.getLogger("dsba.drive")

API = "https://www.googleapis.com/drive/v3"
API_HOST = "www.googleapis.com"
CONTENT_HOST_SUFFIX = ".googleusercontent.com"  # where Drive may send a download; it gets no credentials
SCOPE = "https://www.googleapis.com/auth/drive.readonly"
FOLDER = "application/vnd.google-apps.folder"
SHORTCUT = "application/vnd.google-apps.shortcut"
GOOGLE_APPS = "application/vnd.google-apps."
FILE_FIELDS = (
    "id,name,mimeType,size,resourceKey,capabilities(canDownload),"
    "shortcutDetails(targetId,targetMimeType,targetResourceKey)"
)
DRIVE_ID = re.compile(r"[A-Za-z0-9_-]{1,100}")  # file ids and resource keys
NAME_MAX = 1000  # longer names are cut: the library keeps 255 characters anyway
PAGE_SIZE = 1000
MAX_PAGES = 100  # 100,000 entries in one folder is not a folder of course material
JSON_MAX = 16 * 1024 * 1024  # a page of 1,000 entries is far smaller
ERROR_MAX = 64 * 1024
CHUNK = 256 * 1024
REDIRECTS = 3
RETRY_AFTER_MAX = 300.0
BLOCK_DELAY = 60.0  # the first wait after Google's "automated queries" page; it doubles from there
BLOCK_MAX_DELAY = 600.0
TIMEOUT = httpx.Timeout(60.0, connect=15.0)

# Google's error reasons: errors[].reason in Drive's own format, details[].reason (ErrorInfo) in the newer one.
QUOTA = frozenset({"rateLimitExceeded", "userRateLimitExceeded", "RATE_LIMIT_EXCEEDED"})
FATAL = frozenset(
    {
        "keyInvalid",
        "keyExpired",
        "accessNotConfigured",
        "ipRefererBlocked",
        "dailyLimitExceeded",
        "dailyLimitExceededUnreg",
        "API_KEY_INVALID",
        "API_KEY_EXPIRED",
        "SERVICE_DISABLED",
        "API_KEY_SERVICE_BLOCKED",
        "API_KEY_HTTP_REFERRER_BLOCKED",
        "API_KEY_IP_ADDRESS_BLOCKED",
        "API_KEY_ANDROID_APP_BLOCKED",
        "API_KEY_IOS_APP_BLOCKED",
        "CONSUMER_INVALID",
        "BILLING_DISABLED",
    }
)
# 403s about the file itself, not about who asks: other credentials would be refused too.
NOT_PERMISSION = frozenset(
    {"exportSizeLimitExceeded", "downloadQuotaExceeded", "cannotDownloadAbusiveFile", "fileNotDownloadable"}
)
AUTOMATED = "automatedQueries"  # the reason the import gives Google's "Sorry..." page, which has none of its own
# What Google's "Sorry..." page says ("your computer or network may be sending automated queries"), lower case.
AUTOMATED_SIGNS = (b"automated queries", b"unusual traffic", b"<title>sorry...</title>")

T = TypeVar("T")


# ── errors ───────────────────────────────────────────────────────────────────────────────────


class DriveError(Exception):
    """Drive refused, failed, or couldn't be reached. `message` is safe to print: no secret, no control characters."""

    def __init__(
        self,
        message: str,
        *,
        status: int = 0,
        reason: str = "",
        retryable: bool = False,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.reason = reason
        self.retryable = retryable
        self.retry_after = retry_after

    def describe(self) -> str:
        """'404 notFound', '403 insufficientFilePermissions', or the message for a failure without a status."""
        if not self.status:
            return self.message.rstrip(".")
        return f"{self.status} {self.reason}".strip()


class DriveDeniedError(DriveError):
    """403 or 404: these credentials may not see or download it (a folder shared only inside BIBF, or not at all)."""


class DriveFatalError(DriveError):
    """The credentials or the Cloud project are wrong (or the day's quota is spent): no other call can work either."""


class DriveBlockedError(DriveFatalError):
    """Google's "automated queries" page: it blocks this network for a while (minutes to an hour or so) after many
    requests in a row. Retried with long waits; once the waits are spent, nothing else can be downloaded either."""


class TooLargeError(Exception):
    """The download passed its limit, whatever size Drive had announced."""

    def __init__(self, limit: int) -> None:
        super().__init__(f"more than {limit} bytes")
        self.limit = limit


# ── what Drive says about a file ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Ref:
    """A file or folder as a request names it: its id and, for files shared before 2021, its resource key. Both are
    checked against Drive's alphabet, so they are safe in a query and in a header."""

    id: str
    resource_key: str | None = None

    def __post_init__(self) -> None:
        if not DRIVE_ID.fullmatch(self.id) or (
            self.resource_key is not None and not DRIVE_ID.fullmatch(self.resource_key)
        ):
            raise ValueError("not a Drive id or resource key")


@dataclass(frozen=True)
class DriveFile:
    id: str
    name: str
    mime_type: str
    size: int | None = None  # as Drive says: a hint, never trusted
    resource_key: str | None = None
    can_download: bool | None = None
    target: Ref | None = None  # a shortcut's target
    target_mime_type: str | None = None

    @property
    def ref(self) -> Ref:
        return Ref(self.id, self.resource_key)

    @property
    def is_folder(self) -> bool:
        return self.mime_type == FOLDER

    @property
    def is_shortcut(self) -> bool:
        return self.mime_type == SHORTCUT

    @property
    def is_google_file(self) -> bool:
        """A Google Docs, Sheets, Slides, Forms, ... file: no bytes of its own, at most an export."""
        return self.mime_type.startswith(GOOGLE_APPS)


def _drive_id(value: object) -> str | None:
    return value if isinstance(value, str) and DRIVE_ID.fullmatch(value) else None


def _size(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    if isinstance(value, str) and re.fullmatch(r"[0-9]{1,18}", value):
        return int(value)
    return None


def parse_file(raw: object) -> DriveFile | None:
    """One entry of Drive's answer, or None when it can't be used safely: an id or resource key outside Drive's
    alphabet, no name or type, a shortcut without a usable target."""
    if not isinstance(raw, dict):
        return None
    file_id, name, mime = _drive_id(raw.get("id")), raw.get("name"), raw.get("mimeType")
    if file_id is None or not isinstance(name, str) or not isinstance(mime, str):
        return None
    key = raw.get("resourceKey")
    if key is not None and _drive_id(key) is None:
        return None
    capabilities = raw.get("capabilities")
    can_download = capabilities.get("canDownload") if isinstance(capabilities, dict) else None
    target: Ref | None = None
    target_mime: str | None = None
    if mime == SHORTCUT:
        details = raw.get("shortcutDetails")
        if not isinstance(details, dict):
            return None
        target_id, target_key, target_mime_raw = (
            _drive_id(details.get("targetId")),
            details.get("targetResourceKey"),
            details.get("targetMimeType"),
        )
        if target_id is None or (target_key is not None and _drive_id(target_key) is None):
            return None
        target = Ref(target_id, target_key if isinstance(target_key, str) else None)
        target_mime = target_mime_raw if isinstance(target_mime_raw, str) else None
    return DriveFile(
        id=file_id,
        name=name[:NAME_MAX],
        mime_type=mime[:255],
        size=_size(raw.get("size")),
        resource_key=key if isinstance(key, str) else None,
        can_download=can_download if isinstance(can_download, bool) else None,
        target=target,
        target_mime_type=target_mime,
    )


def folder_in(url: str) -> Ref | None:
    """The Drive folder a library link points at ('https://drive.google.com/drive/folders/<id>', with or without
    '/u/<n>' and '?resourcekey=<key>'), or None for anything else: a single file, a Google Doc, another site."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme != "https" or parts.hostname != "drive.google.com":
        return None
    match = re.fullmatch(r"/drive/(?:u/\d{1,2}/)?folders/([A-Za-z0-9_-]{1,100})/?", parts.path)
    if match is None:
        return None
    key = (parse_qs(parts.query).get("resourcekey") or [""])[0]
    return Ref(match.group(1), key if DRIVE_ID.fullmatch(key) else None)


def folder_url(ref: Ref) -> str:
    url = f"https://drive.google.com/drive/folders/{ref.id}"
    return f"{url}?resourcekey={ref.resource_key}" if ref.resource_key else url


def file_url(ref: Ref) -> str:
    """Where a person opens the file in Drive."""
    url = f"https://drive.google.com/file/d/{ref.id}/view"
    return f"{url}?resourcekey={ref.resource_key}" if ref.resource_key else url


def printable(text: str, limit: int = 300) -> str:
    """Text from Google as one safe line for a terminal: no control characters (no escape sequences), at most
    `limit` characters."""
    text = "".join(ch if unicodedata.category(ch)[0] != "C" else " " for ch in text)
    text = " ".join(text.split())
    return clip(text, limit)


# ── credentials ──────────────────────────────────────────────────────────────────────────────


class Credential:
    """How a request proves who asks."""

    label = "credentials"

    def headers(self) -> dict[str, str]:
        raise NotImplementedError

    def secrets(self) -> list[str]:
        """Values that must never appear in a message."""
        return []

    def renew(self) -> bool:
        """After a 401: get fresh credentials, and say whether trying again is worth it."""
        return False


class ApiKey(Credential):
    """DSBA_GOOGLE_API_KEY, in the X-Goog-Api-Key header (Google accepts it there as well as in `key=`)."""

    label = "the API key"

    def __init__(self, key: SecretStr) -> None:
        self._key = key

    def headers(self) -> dict[str, str]:
        return {"X-Goog-Api-Key": self._key.get_secret_value()}

    def secrets(self) -> list[str]:
        return [self._key.get_secret_value()]


class _GoogleResponse:
    """google.auth.transport.Response, from an httpx response."""

    def __init__(self, response: httpx.Response) -> None:
        self.status = response.status_code
        self.headers = dict(response.headers)
        self.data = response.content


class _GoogleRequest:
    """google.auth.transport.Request over httpx: google-auth asks for its tokens through the import's own client."""

    def __init__(self, http: httpx.Client) -> None:
        self.http = http

    def __call__(
        self,
        url: str,
        method: str = "GET",
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
        timeout: float | None = None,
        **_: Any,
    ) -> _GoogleResponse:
        from google.auth.exceptions import TransportError

        try:
            response = self.http.request(method, url, content=body, headers=headers, timeout=timeout or 30.0)
        except httpx.HTTPError as e:  # google-auth's exceptions and loaders are unannotated: hence the ignores
            raise TransportError(f"the token request failed ({type(e).__name__})") from None  # type: ignore[no-untyped-call]
        return _GoogleResponse(response)


class ServiceAccount(Credential):
    """DSBA_GOOGLE_SERVICE_ACCOUNT_FILE: short-lived OAuth tokens (drive.readonly) made from the account's key file,
    renewed before they expire. Drive shows it what is shared with its email."""

    label = "the service account"

    def __init__(self, path: str, http: httpx.Client) -> None:
        from google.auth.exceptions import GoogleAuthError
        from google.oauth2 import service_account

        try:
            load = service_account.Credentials.from_service_account_file
            self._credentials = load(path, scopes=[SCOPE])  # type: ignore[no-untyped-call]
        except (OSError, ValueError, KeyError, GoogleAuthError) as e:
            raise DriveFatalError(
                f"DSBA_GOOGLE_SERVICE_ACCOUNT_FILE can't be read as a service account's JSON key ({type(e).__name__})."
            ) from None
        self._request = _GoogleRequest(http)

    @property
    def email(self) -> str:
        return str(self._credentials.service_account_email)

    def headers(self) -> dict[str, str]:
        if not self._credentials.valid:
            self._refresh()
        return {"Authorization": f"Bearer {self._credentials.token}"}

    def secrets(self) -> list[str]:
        token = self._credentials.token
        return [token] if isinstance(token, str) and token else []

    def renew(self) -> bool:
        self._refresh()
        return True

    def _refresh(self) -> None:
        from google.auth.exceptions import RefreshError, TransportError

        try:
            self._credentials.refresh(self._request)
        except TransportError:
            raise DriveError("Google's sign-in for the service account couldn't be reached.", retryable=True) from None
        except RefreshError as e:
            raise DriveFatalError(
                f"Google refused the service account's key ({printable(str(e), 120)}). Check the key file, or make a "
                "new key for the account."
            ) from None


# ── the client ───────────────────────────────────────────────────────────────────────────────


class Drive:
    """A read-only Drive client: retries, credentials in order, capped reads, no secret in any message."""

    def __init__(
        self,
        http: httpx.Client,
        credentials: Sequence[Credential],
        *,
        sleep: Callable[[float], None] = time.sleep,
        attempts: int = 6,
        base_delay: float = 1.0,
        max_delay: float = 64.0,
        jitter: bool = True,
        block_delay: float = BLOCK_DELAY,
        block_max_delay: float = BLOCK_MAX_DELAY,
    ) -> None:
        if not credentials:
            raise ValueError("no credentials")
        self.http = http
        self.credentials = list(credentials)
        self.sleep = sleep
        self.attempts = attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter
        self.block_delay = block_delay
        self.block_max_delay = block_max_delay
        self.blocks = 0  # how often Google's "automated queries" page was waited out: the import slows down after one

    def __enter__(self) -> Drive:
        return self

    def __exit__(self, *_: object) -> None:
        self.http.close()

    @property
    def service_account(self) -> ServiceAccount | None:
        return next((c for c in self.credentials if isinstance(c, ServiceAccount)), None)

    def scrub(self, text: str) -> str:
        """`text` without any secret this client holds, as one printable line."""
        for cred in self.credentials:
            for secret in cred.secrets():
                text = text.replace(secret, "[hidden]")
        return printable(text)

    # ── what the import asks ──

    def get(self, ref: Ref, prefer: Credential | None = None) -> tuple[DriveFile, Credential]:
        """A file's or folder's metadata, and the credentials Drive showed it to."""

        def call(cred: Credential) -> DriveFile:
            params = {"fields": FILE_FIELDS, "supportsAllDrives": "true"}
            found = parse_file(self._send(cred, f"{API}/files/{ref.id}", params, [ref], _read_json))
            if found is None or found.id != ref.id:
                raise DriveError("Drive's answer about it doesn't describe a file.")
            return found

        return self._allowed(call, prefer)

    def children(self, folder: Ref, prefer: Credential | None = None) -> tuple[list[DriveFile], int, Credential]:
        """What a folder holds (not what is in the bin), page after page. -> the entries, how many entries couldn't be
        used (see parse_file), and the credentials Drive showed the folder to."""

        def call(cred: Credential) -> tuple[list[DriveFile], int]:
            entries: list[DriveFile] = []
            unusable = 0
            token: str | None = None
            for _ in range(MAX_PAGES):
                params = {
                    "q": f"'{folder.id}' in parents and trashed = false",  # the id is checked: no quote can be in it
                    "fields": f"nextPageToken,files({FILE_FIELDS})",
                    "pageSize": str(PAGE_SIZE),
                    "supportsAllDrives": "true",
                    "includeItemsFromAllDrives": "true",
                }
                if token:
                    params["pageToken"] = token
                page = self._send(cred, f"{API}/files", params, [folder], _read_json)
                files = page.get("files")
                for raw in files if isinstance(files, list) else []:
                    entry = parse_file(raw)
                    if entry is None:
                        unusable += 1
                    else:
                        entries.append(entry)
                next_token = page.get("nextPageToken")
                if not isinstance(next_token, str) or not next_token or next_token == token:
                    return entries, unusable
                token = next_token
            raise DriveError(f"The folder has more than {MAX_PAGES * PAGE_SIZE} entries: it was not read.")

        (entries, unusable), cred = self._allowed(call, prefer)
        return entries, unusable, cred

    def fetch(
        self,
        file: DriveFile,
        sink: IO[bytes],
        *,
        limit: int,
        export: str | None = None,
        prefer: Credential | None = None,
    ) -> tuple[int, Credential]:
        """Writes the file's bytes to `sink` from its start (a Google Docs, Sheets or Slides file: its export as the
        media type `export`). -> how many bytes, and the credentials that could. TooLargeError past `limit` bytes,
        whatever size Drive announced."""
        if export:
            url, params = f"{API}/files/{file.id}/export", {"mimeType": export}
        else:
            url, params = f"{API}/files/{file.id}", {"alt": "media", "supportsAllDrives": "true"}

        def call(cred: Credential) -> int:
            return self._send(cred, url, params, [file.ref], lambda r: _write(r, sink, limit), redirects=True)

        return self._allowed(call, prefer)

    # ── how ──

    def _allowed(self, call: Callable[[Credential], T], prefer: Credential | None) -> tuple[T, Credential]:
        """call(credentials) with each in turn, the preferred first, until Drive doesn't refuse."""
        order = [prefer, *(c for c in self.credentials if c is not prefer)] if prefer else self.credentials
        refused: DriveDeniedError | None = None
        for cred in order:
            try:
                return call(cred), cred
            except DriveDeniedError as e:
                refused = e
        assert refused is not None
        raise refused

    def _send(
        self,
        cred: Credential,
        url: str,
        params: Mapping[str, str],
        refs: Sequence[Ref],
        consume: Callable[[httpx.Response], T],
        *,
        redirects: bool = False,
    ) -> T:
        """One GET, retried while Drive asks to slow down or fails on its side. -> what `consume` made of the answer."""
        renewed = False
        attempt = 0
        while True:
            attempt += 1
            try:
                return self._attempt(cred, url, params, refs, consume, redirects)
            except DriveError as e:
                failure = e
            except httpx.TransportError as e:  # timeouts, refused or broken connections, also in the middle of a body
                failure = DriveError(f"Google couldn't be reached ({type(e).__name__}).", retryable=True)
            if failure.status == 401 and not renewed and cred.renew():
                renewed = True
                continue
            if not failure.retryable or attempt >= self.attempts:
                raise failure
            blocked = isinstance(failure, DriveBlockedError)
            if blocked:
                self.blocks += 1
            delay = self._delay(attempt, failure.retry_after, blocked=blocked)
            log.warning(
                "Drive: %s; trying again in %.0f s (try %d of %d)",
                failure.describe(),
                delay,
                attempt + 1,
                self.attempts,
            )
            self.sleep(delay)

    def _attempt(
        self,
        cred: Credential,
        url: str,
        params: Mapping[str, str],
        refs: Sequence[Ref],
        consume: Callable[[httpx.Response], T],
        redirects: bool,
    ) -> T:
        headers = {**cred.headers(), **_resource_keys(refs)}
        request = self.http.build_request("GET", url, params=params, headers=headers)
        for hop in range(REDIRECTS + 1):
            response = self.http.send(request, stream=True)  # httpx follows no redirect by itself
            try:
                if response.is_success:
                    return consume(response)
                if redirects and response.is_redirect:
                    if hop == REDIRECTS:
                        break
                    request = self._redirect(request, response)
                    continue
                raise classify(response.status_code, _read(response, ERROR_MAX, cut=True), response.headers, self.scrub)
            finally:
                response.close()
        raise DriveError("Drive redirected the download too many times.")

    def _redirect(self, request: httpx.Request, response: httpx.Response) -> httpx.Request:
        """Where a download was sent: Google's API host (with the same credentials) or its content host (without
        any). Anywhere else is refused, so the key never leaves Google's API."""
        target = request.url.join(response.headers.get("location", ""))
        host = target.host
        if target.scheme == "https" and host == API_HOST:
            return self.http.build_request("GET", target, headers=dict(request.headers))
        if target.scheme == "https" and host.endswith(CONTENT_HOST_SUFFIX):
            return self.http.build_request("GET", target)
        raise DriveError(f"Drive sent the download to {printable(host, 80) or 'an odd address'}: not followed.")

    def _delay(self, attempt: int, retry_after: float | None, *, blocked: bool = False) -> float:
        base, cap = (self.block_delay, self.block_max_delay) if blocked else (self.base_delay, self.max_delay)
        delay = min(cap, base * 2.0 ** (attempt - 1))
        if retry_after is not None:
            delay = max(delay, min(retry_after, RETRY_AFTER_MAX))
        if self.jitter:
            delay += random.uniform(0, delay / 4)  # noqa: S311 - spreading retries, not a secret
        return delay


def _resource_keys(refs: Sequence[Ref]) -> dict[str, str]:
    keys = [f"{r.id}/{r.resource_key}" for r in refs if r.resource_key]
    return {"X-Goog-Drive-Resource-Keys": ",".join(keys)} if keys else {}


def _read(response: httpx.Response, limit: int, *, cut: bool = False) -> bytes:
    """The body, at most `limit` bytes: the rest is cut off (`cut`) or refused."""
    body = bytearray()
    for chunk in response.iter_bytes(CHUNK):
        body += chunk
        if len(body) > limit:
            if cut:
                return bytes(body[:limit])
            raise DriveError("Drive's answer was far longer than it should be.")
    return bytes(body)


def _read_json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = json.loads(_read(response, JSON_MAX))
    except ValueError:
        raise DriveError("Drive's answer wasn't the JSON it should be.") from None
    if not isinstance(data, dict):
        raise DriveError("Drive's answer wasn't the JSON it should be.")
    return data


def _write(response: httpx.Response, sink: IO[bytes], limit: int) -> int:
    """Copies the body into `sink` from its start, counting: TooLargeError past `limit` bytes, whatever Content-Length
    said."""
    sink.seek(0)
    sink.truncate()
    declared = response.headers.get("content-length", "")
    if re.fullmatch(r"[0-9]{1,18}", declared) and int(declared) > limit:
        raise TooLargeError(limit)
    total = 0
    for chunk in response.iter_bytes(CHUNK):
        total += len(chunk)
        if total > limit:
            raise TooLargeError(limit)
        sink.write(chunk)
    return total


def google_error(body: bytes) -> tuple[list[str], str]:
    """The reasons and the message in a Google error body ({"error": {"errors": [{"reason"}], "details":
    [{"reason"}], "message"}}); nothing when it isn't one."""
    try:
        data = json.loads(body)
    except ValueError:
        return [], ""
    error = data.get("error") if isinstance(data, dict) else None
    if not isinstance(error, dict):
        return [], ""
    reasons: list[str] = []
    for key in ("errors", "details"):
        entries = error.get(key)
        for entry in entries if isinstance(entries, list) else []:
            reason = entry.get("reason") if isinstance(entry, dict) else None
            if isinstance(reason, str) and reason and reason not in reasons:
                reasons.append(reason[:80])
    message = error.get("message")
    return reasons, message if isinstance(message, str) else ""


def _retry_after(headers: httpx.Headers) -> float | None:
    value = headers.get("retry-after", "").strip()
    return float(value) if re.fullmatch(r"[0-9]{1,6}", value) else None


def classify(status: int, body: bytes, headers: httpx.Headers, scrub: Callable[[str], str]) -> DriveError:
    """What an error answer means for the import (see the module's docstring)."""
    reasons, message = google_error(body)
    found = set(reasons)
    reason = reasons[0] if reasons else ""
    if status in (403, 429) and not reasons and any(sign in body.lower() for sign in AUTOMATED_SIGNS):
        return DriveBlockedError(
            "Google is refusing requests from this network for now: it took the import's many downloads in a row for "
            "automated queries. Wait an hour or so, then run the import again.",
            status=status,
            reason=AUTOMATED,
            retryable=True,
            retry_after=_retry_after(headers),
        )
    text = scrub(message) if message else f"Drive answered {status}."
    if status in (429, 500, 502, 503, 504) or (status == 403 and found & QUOTA):
        return DriveError(text, status=status, reason=reason, retryable=True, retry_after=_retry_after(headers))
    if status == 401 or found & FATAL:
        return DriveFatalError(text, status=status, reason=reason)
    if status == 404 or (status == 403 and not found & NOT_PERMISSION):
        return DriveDeniedError(text, status=status, reason=reason)
    return DriveError(text, status=status, reason=reason)


def connect(
    settings: Settings,
    *,
    transport: httpx.BaseTransport | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> Drive:
    """The import's Drive client, with the credentials the settings give: the API key, then the service account.
    DriveFatalError when there are none, or when the service account's key file can't be used."""
    http = httpx.Client(transport=transport, timeout=TIMEOUT, headers={"User-Agent": "dsba-hub-drive-import"})
    credentials: list[Credential] = []
    try:
        if settings.google_api_key is not None and settings.google_api_key.get_secret_value():
            credentials.append(ApiKey(settings.google_api_key))
        if settings.google_service_account_file:
            credentials.append(ServiceAccount(settings.google_service_account_file, http))
        if not credentials:
            raise DriveFatalError(
                "Set DSBA_GOOGLE_API_KEY (or DSBA_GOOGLE_SERVICE_ACCOUNT_FILE) first: docs/backend/DEPLOYMENT.md, "
                "section 10, says how."
            )
    except BaseException:
        http.close()
        raise
    return Drive(http, credentials, sleep=sleep)
