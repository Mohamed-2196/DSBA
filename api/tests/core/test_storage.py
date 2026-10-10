"""Object storage: safe names, strict presigned GETs, server-side copies and the incoming/ lifecycle rule
(security review, findings 6 and 7)."""

from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest

from app.services.storage import INCOMING_PREFIX, INCOMING_RULE_ID, Storage, safe_file_name


@pytest.mark.parametrize(
    ("name", "safe"),
    [
        ("Week 3 - Notes (final).pdf", "Week-3-Notes-final.pdf"),  # what the docstring promises
        ("a -- b __ c.R", "a-b-__-c.R"),
        ("--- dashes ---.txt", "dashes.txt"),
        ("Résumé.docx", "Resume.docx"),
        ("ملاحظات.pdf", "file.pdf"),
        ("no extension", "no-extension"),
        (".hidden", "file.hidden"),
        ("report.tar.gz", "report-tar.gz"),
        ("weird.ext!@#name", "weird.extname"),
    ],
)
def test_safe_file_names(name: str, safe: str) -> None:
    assert safe_file_name(name) == safe


def test_long_names_are_cut_cleanly() -> None:
    cut = safe_file_name("abc-" * 40 + ".pdf")  # the cut falls on a dash: it goes too
    assert len(cut) <= 100
    assert cut.endswith("-abc.pdf")
    assert safe_file_name("x" * 300) == "x" * 100


def _params(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


@pytest.mark.parametrize(
    ("content_type", "inline", "shown"),
    [
        ("application/pdf", True, True),
        ("image/png", True, True),
        ("image/webp", True, True),
        ("application/pdf", False, False),
        ("image/svg+xml", True, False),  # never inline, whatever the caller asks
        ("text/html", True, False),
        ("application/xhtml+xml", True, False),
        ("text/plain", True, False),
        ("IMAGE/PNG; charset=binary", True, True),
    ],
)
def test_presigned_get_shows_only_pdfs_and_images(
    storage: Storage, content_type: str, inline: bool, shown: bool
) -> None:
    p = _params(
        storage.presigned_get("library/x/y", file_name="Week 3 notes.pdf", content_type=content_type, inline=inline)
    )
    assert p["response-content-type"] == content_type.split(";")[0].lower()
    disposition = p["response-content-disposition"]
    assert disposition.startswith("inline;" if shown else "attachment;")
    assert 'filename="Week-3-notes.pdf"' in disposition


def test_copy_sets_the_type_again(storage: Storage) -> None:
    src, dst = f"{INCOMING_PREFIX}{uuid.uuid4()}", f"forum/{uuid.uuid4()}/graph.png"
    storage.client.put_object(Bucket=storage.bucket, Key=src, Body=b"\x89PNG....", ContentType="text/html")
    storage.copy(src, dst, "image/png")
    info = storage.head(dst)
    assert info is not None
    assert (info.size, info.content_type) == (8, "image/png")
    assert storage.head(src) is not None  # the caller deletes the source once the copy is in place


def test_incoming_uploads_expire_after_a_day(storage: Storage) -> None:
    other = {"ID": "keep-me", "Filter": {"Prefix": "tmp/"}, "Status": "Enabled", "Expiration": {"Days": 7}}
    storage.client.put_bucket_lifecycle_configuration(Bucket=storage.bucket, LifecycleConfiguration={"Rules": [other]})  # type: ignore[list-item]
    assert storage.ensure_lifecycle() is True
    assert storage.ensure_lifecycle() is True  # run again: still one rule of ours
    rules: list[Any] = storage.client.get_bucket_lifecycle_configuration(Bucket=storage.bucket)["Rules"]
    ours = [r for r in rules if r["ID"] == INCOMING_RULE_ID]
    assert len(ours) == 1
    assert ours[0]["Filter"]["Prefix"] == "incoming/"
    assert ours[0]["Expiration"]["Days"] == 1
    assert any(r["ID"] == "keep-me" for r in rules)
