"""The Drive client (app/services/drive.py) against the fake Drive: what it trusts, how it authenticates, how it
retries, and how it tells a refusal from a quota error from a broken key."""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from app.config import Settings, get_settings
from app.services.drive import (
    ApiKey,
    Drive,
    DriveBlockedError,
    DriveDeniedError,
    DriveError,
    DriveFatalError,
    DriveFile,
    Ref,
    ServiceAccount,
    TooLargeError,
    connect,
    folder_in,
    parse_file,
)
from tests.content.fake_drive import (
    API_KEY,
    PDF,
    SERVICE_EMAIL,
    BrokenStream,
    FakeDrive,
    automated_queries,
    google_error,
    listing,
    media,
    on_path,
)


@pytest.fixture
def fake() -> FakeDrive:
    return FakeDrive()


@pytest.fixture
def sleeps() -> list[float]:
    return []


@pytest.fixture
def drive(fake: FakeDrive, sleeps: list[float]) -> Iterator[Drive]:
    http = httpx.Client(transport=fake.transport)
    with Drive(http, [ApiKey(SecretStr(API_KEY))], sleep=sleeps.append, jitter=False) as client:
        yield client


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    s = get_settings()
    monkeypatch.setattr(s, "google_api_key", None)
    monkeypatch.setattr(s, "google_service_account_file", None)
    return s


# ── what it trusts ───────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://drive.google.com/drive/folders/1AbC_d-9", Ref("1AbC_d-9")),
        ("https://drive.google.com/drive/folders/1AbC?usp=sharing", Ref("1AbC")),
        ("https://drive.google.com/drive/u/0/folders/1AbC/", Ref("1AbC")),
        ("https://drive.google.com/drive/folders/1AbC?resourcekey=0-xYz_9", Ref("1AbC", "0-xYz_9")),
        ("https://drive.google.com/drive/folders/1AbC?resourcekey=bad/key", Ref("1AbC")),
        ("https://drive.google.com/file/d/1AbC/view", None),  # a single file stays a link
        ("https://docs.google.com/document/d/1AbC/edit", None),
        ("http://drive.google.com/drive/folders/1AbC", None),
        ("https://drive.google.com.evil.example/drive/folders/1AbC", None),
        ("https://drive.google.com/drive/folders/1A'bC", None),
        ("https://drive.google.com/drive/folders/../1AbC", None),
        ("not a url at all", None),
    ],
)
def test_only_drive_folder_links_are_read(url: str, expected: Ref | None) -> None:
    assert folder_in(url) == expected


def test_drive_entries_that_could_escape_a_query_a_header_or_a_key_are_left_out() -> None:
    good = {"id": "1AbC", "name": "Notes.pdf", "mimeType": "application/pdf", "size": "12"}
    assert parse_file(good) == DriveFile("1AbC", "Notes.pdf", "application/pdf", size=12)
    for bad in (
        {**good, "id": "../../etc"},
        {**good, "id": "1AbC' or name contains '"},
        {**good, "id": 7},
        {**good, "name": None},
        {**good, "resourceKey": "0-a,1AbC/other"},
        {**good, "mimeType": "application/vnd.google-apps.shortcut"},  # a shortcut without its details
        {**good, "mimeType": "application/vnd.google-apps.shortcut", "shortcutDetails": {"targetId": "x/y"}},
        "a string",
    ):
        assert parse_file(bad) is None, bad
    # Drive's size is only a hint: anything but plain digits is no size at all
    assert parse_file({**good, "size": "\u00b2\u00b3"}) == DriveFile("1AbC", "Notes.pdf", "application/pdf")
    assert parse_file({**good, "size": "-5"}) == DriveFile("1AbC", "Notes.pdf", "application/pdf")
    with pytest.raises(ValueError, match="not a Drive id"):
        Ref("a/b")


# ── the key ──────────────────────────────────────────────────────────────────────────────────


def test_the_key_goes_in_a_header_and_resource_keys_go_with_their_files(fake: FakeDrive, drive: Drive) -> None:
    fake.folder("root1", "Materials", resource_key="0-rootkey")
    for i in range(5):  # three pages of two
        fake.file(f"f{i}", f"Week {i}.pdf", "root1", resource_key=f"0-key{i}")
    entries, unusable, cred = drive.children(Ref("root1", "0-rootkey"))
    assert [e.name for e in entries] == [f"Week {i}.pdf" for i in range(5)]
    assert unusable == 0
    assert isinstance(cred, ApiKey)
    assert len(fake.calls("/drive/v3/files")) == 3
    sink = io.BytesIO()
    size, _ = drive.fetch(entries[2], sink, limit=1000)
    assert (size, sink.getvalue()) == (len(PDF), PDF)
    for request in fake.requests:
        assert request.headers["x-goog-api-key"] == API_KEY
        assert API_KEY not in str(request.url)
    assert fake.requests[0].headers["x-goog-drive-resource-keys"] == "root1/0-rootkey"
    assert fake.requests[-1].headers["x-goog-drive-resource-keys"] == "f2/0-key2"


def test_without_its_resource_key_an_old_shared_folder_is_not_found(fake: FakeDrive, drive: Drive) -> None:
    fake.folder("old1", "Shared in 2019", resource_key="0-old")
    with pytest.raises(DriveDeniedError):
        drive.get(Ref("old1"))
    assert drive.get(Ref("old1", "0-old"))[0].name == "Shared in 2019"


def test_messages_never_carry_the_key(fake: FakeDrive, drive: Drive) -> None:
    fake.folder("root1", "Materials")
    fake.queue(on_path("/files/root1"), google_error(400, "badRequest", f"Request with key {API_KEY} is malformed"))
    with pytest.raises(DriveError) as caught:
        drive.get(Ref("root1"))
    assert API_KEY not in caught.value.message
    assert "[hidden]" in caught.value.message


# ── retries ──────────────────────────────────────────────────────────────────────────────────


def test_quota_refusals_are_retried_with_growing_waits(fake: FakeDrive, drive: Drive, sleeps: list[float]) -> None:
    fake.folder("root1", "Materials")
    fake.file("f1", "a.pdf", "root1")
    fake.queue(
        listing("root1"),
        google_error(403, "userRateLimitExceeded", "User Rate Limit Exceeded"),
        google_error(403, "rateLimitExceeded", "Rate Limit Exceeded"),
        httpx.Response(429, headers={"Retry-After": "7"}),
        httpx.Response(503),
        httpx.ConnectError("connection refused"),
    )
    entries, _, _ = drive.children(Ref("root1"))
    assert [e.id for e in entries] == ["f1"]
    assert sleeps == [1.0, 2.0, 7.0, 8.0, 16.0]  # doubling, and Retry-After when it asks for longer


def test_a_403_for_permission_is_not_retried_but_one_for_quota_is(fake: FakeDrive, drive: Drive) -> None:
    fake.folder("root1", "Materials")
    fake.queue(on_path("/files/root1"), google_error(403, "insufficientFilePermissions", "No."))
    with pytest.raises(DriveDeniedError) as caught:
        drive.get(Ref("root1"))
    assert caught.value.describe() == "403 insufficientFilePermissions"
    assert len(fake.requests) == 1


def test_a_call_that_keeps_failing_gives_up_after_six_tries(fake: FakeDrive, drive: Drive, sleeps: list[float]) -> None:
    fake.folder("root1", "Materials")
    fake.queue(on_path("/files/root1"), *[httpx.Response(500) for _ in range(6)])
    with pytest.raises(DriveError) as caught:
        drive.get(Ref("root1"))
    assert caught.value.retryable
    assert len(fake.requests) == 6
    assert len(sleeps) == 5


def test_googles_automated_queries_page_is_waited_out_with_long_waits(
    fake: FakeDrive, drive: Drive, sleeps: list[float]
) -> None:
    fake.folder("root1", "Materials")
    fake.file("f1", "a.pdf", "root1")
    fake.queue(media("f1"), automated_queries(), automated_queries(429))
    size, _ = drive.fetch(DriveFile("f1", "a.pdf", "application/pdf"), io.BytesIO(), limit=1024)
    assert size == len(PDF)
    assert sleeps == [60.0, 120.0]
    assert drive.blocks == 2


def test_a_block_that_outlasts_the_waits_is_fatal_and_says_what_to_do(
    fake: FakeDrive, drive: Drive, sleeps: list[float]
) -> None:
    fake.folder("root1", "Materials")
    fake.file("f1", "a.pdf", "root1")
    fake.queue(media("f1"), *[automated_queries() for _ in range(6)])
    with pytest.raises(DriveBlockedError) as caught:
        drive.fetch(DriveFile("f1", "a.pdf", "application/pdf"), io.BytesIO(), limit=1024)
    assert isinstance(caught.value, DriveFatalError)
    assert caught.value.describe() == "403 automatedQueries"
    assert "Wait an hour or so, then run the import again." in caught.value.message
    assert sleeps == [60.0, 120.0, 240.0, 480.0, 600.0]  # doubling, up to ten minutes


def test_an_html_403_that_isnt_the_block_is_a_refusal(fake: FakeDrive, drive: Drive) -> None:
    fake.folder("root1", "Materials")
    fake.queue(on_path("/files/root1"), httpx.Response(403, text="<html><title>Forbidden</title></html>"))
    with pytest.raises(DriveDeniedError):
        drive.get(Ref("root1"))
    assert drive.blocks == 0


@pytest.mark.parametrize(
    "reply",
    [
        google_error(400, "badRequest", "API key not valid. Please pass a valid API key.", details="API_KEY_INVALID"),
        google_error(403, "accessNotConfigured", "Google Drive API has not been used in project 1 before"),
        google_error(
            403, "forbidden", "Requests from referer <empty> are blocked.", details="API_KEY_HTTP_REFERRER_BLOCKED"
        ),
        google_error(403, "dailyLimitExceeded", "Daily Limit Exceeded"),
    ],
)
def test_a_broken_key_or_project_is_fatal(fake: FakeDrive, drive: Drive, reply: httpx.Response) -> None:
    fake.folder("root1", "Materials")
    fake.queue(on_path("/files/root1"), reply)
    with pytest.raises(DriveFatalError):
        drive.get(Ref("root1"))
    assert len(fake.requests) == 1


def test_a_403_about_the_file_itself_is_not_a_refusal_to_these_credentials(fake: FakeDrive, drive: Drive) -> None:
    fake.folder("root1", "Materials")
    fake.queue(on_path("/files/root1"), google_error(403, "exportSizeLimitExceeded", "Too large."))
    with pytest.raises(DriveError) as caught:
        drive.get(Ref("root1"))
    assert not isinstance(caught.value, DriveDeniedError)
    assert caught.value.reason == "exportSizeLimitExceeded"


# ── downloads ────────────────────────────────────────────────────────────────────────────────


def test_a_download_stops_at_its_limit_whatever_drive_announced(fake: FakeDrive, drive: Drive) -> None:
    big = PDF + b"0" * (640 * 1024)
    node = fake.file("f1", "big.pdf", "root1", content=big, size=100)  # Drive says 100 bytes
    sink = io.BytesIO()
    with pytest.raises(TooLargeError):
        drive.fetch(DriveFile(node.id, node.name, node.mime, size=100), sink, limit=200 * 1024)
    assert fake.streams["f1"].served < 11  # stopped reading early: the body has 11 chunks
    fake.queue(media("f1"), httpx.Response(200, content=big, headers={"Content-Length": str(len(big))}))
    with pytest.raises(TooLargeError):
        drive.fetch(DriveFile(node.id, node.name, node.mime), sink, limit=200 * 1024)


def test_a_retried_download_starts_again_from_the_first_byte(fake: FakeDrive, drive: Drive) -> None:
    fake.file("f1", "a.pdf", "root1")
    half = b"%PDF-1.7" + b"x" * (300 * 1024)  # more than one chunk arrives before the connection drops
    fake.queue(media("f1"), httpx.ReadError("connection reset"), httpx.Response(200, stream=BrokenStream(half)))
    sink = io.BytesIO(b"left over from somewhere else " * 100)
    size, _ = drive.fetch(DriveFile("f1", "a.pdf", "application/pdf"), sink, limit=1024 * 1024)
    assert sink.getvalue() == PDF
    assert size == len(PDF)
    assert len(fake.calls("/files/f1")) == 3


def test_downloads_follow_redirects_only_to_google_and_never_take_the_key_along(fake: FakeDrive, drive: Drive) -> None:
    fake.file("f1", "a.pdf", "root1")
    fake.content_hosts["/files/abc"] = PDF
    fake.queue(
        media("f1"), httpx.Response(302, headers={"Location": "https://doc-0s-docs.googleusercontent.com/files/abc"})
    )
    sink = io.BytesIO()
    assert drive.fetch(DriveFile("f1", "a.pdf", "application/pdf"), sink, limit=10_000)[0] == len(PDF)
    assert fake.requests[-1].url.host == "doc-0s-docs.googleusercontent.com"  # checked there: no key, no token

    fake.queue(media("f1"), httpx.Response(302, headers={"Location": "https://evil.example.com/steal"}))
    with pytest.raises(DriveError, match=r"evil\.example\.com: not followed"):
        drive.fetch(DriveFile("f1", "a.pdf", "application/pdf"), sink, limit=10_000)
    assert all(r.url.host != "evil.example.com" for r in fake.requests)

    again = "https://www.googleapis.com/drive/v3/files/f1?alt=media"
    fake.queue(media("f1"), *[httpx.Response(302, headers={"Location": again}) for _ in range(4)])
    with pytest.raises(DriveError, match="too many times"):
        drive.fetch(DriveFile("f1", "a.pdf", "application/pdf"), sink, limit=10_000)
    assert all(r.headers.get("x-goog-api-key") == API_KEY for r in fake.requests if r.url.host == "www.googleapis.com")


# ── credentials ──────────────────────────────────────────────────────────────────────────────


def test_without_credentials_it_says_what_to_set(settings: Settings) -> None:
    with pytest.raises(DriveFatalError, match="Set DSBA_GOOGLE_API_KEY"):
        connect(settings)


def test_a_service_account_key_file_that_isnt_one_is_refused(settings: Settings, tmp_path: Path) -> None:
    for content in ("not json", '{"type": "service_account"}'):
        (tmp_path / "key.json").write_text(content)
        settings.google_service_account_file = str(tmp_path / "key.json")
        with pytest.raises(DriveFatalError, match="can't be read as a service account's JSON key"):
            connect(settings)
    settings.google_service_account_file = str(tmp_path / "missing.json")
    with pytest.raises(DriveFatalError, match="FileNotFoundError"):
        connect(settings)


def test_the_service_account_signs_in_and_takes_over_what_the_key_cant_see(
    fake: FakeDrive, settings: Settings, tmp_path: Path
) -> None:
    settings.google_api_key = SecretStr(API_KEY)
    settings.google_service_account_file = fake.key_file(tmp_path / "key.json")
    fake.folder("public1", "Materials")
    fake.folder("private1", "Shared with the importer", access="service")
    fake.file("p1", "Notes.pdf", "private1", access="service")
    with connect(settings, transport=fake.transport, sleep=lambda _: None) as drive:
        account = drive.service_account
        assert account is not None
        assert account.email == SERVICE_EMAIL
        _, cred = drive.get(Ref("public1"))
        assert isinstance(cred, ApiKey)  # the key first
        entries, _, cred = drive.children(Ref("private1"))
        assert isinstance(cred, ServiceAccount)  # refused to the key, shown to the account
        assert [e.name for e in entries] == ["Notes.pdf"]
        drive.fetch(entries[0], io.BytesIO(), limit=10_000, prefer=cred)
    assert len(fake.grants) == 1  # one token, reused
    tokens = [r.headers["authorization"] for r in fake.requests if "authorization" in r.headers]
    assert tokens
    assert all(t.removeprefix("Bearer ") in fake.tokens for t in tokens)


def test_a_service_account_whose_token_is_refused_signs_in_again_once(
    fake: FakeDrive, settings: Settings, tmp_path: Path
) -> None:
    settings.google_service_account_file = fake.key_file(tmp_path / "key.json")
    fake.folder("private1", "Shared with the importer", access="service")
    fake.queue(on_path("/files/private1"), google_error(401, "authError", "Invalid Credentials"))
    with connect(settings, transport=fake.transport, sleep=lambda _: None) as drive:
        assert drive.get(Ref("private1"))[0].name == "Shared with the importer"
    assert len(fake.grants) == 2
