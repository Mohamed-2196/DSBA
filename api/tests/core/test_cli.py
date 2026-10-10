"""The command line: the daily sweep (finding 17), backups (finding 10), set-role (finding 21), bucket set-up."""

from __future__ import annotations

import argparse
import gzip
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any

import boto3
import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.core.time import utcnow
from app.models import (
    AuditEntry,
    Channel,
    OtpChallenge,
    OtpPurpose,
    Role,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
    UserSession,
)
from app.services.storage import INCOMING_RULE_ID, Storage
from tests.core.conftest import SetOption


@pytest.fixture
def same_session(db: Session, monkeypatch: pytest.MonkeyPatch) -> Session:
    """The commands open their own session: give them the test's (rolled back afterwards)."""

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: _session)
    return db


def _upload(db: Session, storage: Storage, owner: User, status: UploadStatus, age: timedelta, key: str) -> Upload:
    storage.client.put_object(Bucket=storage.bucket, Key=key, Body=b"x", ContentType="image/png")
    up = Upload(
        user_id=owner.id,
        purpose=UploadPurpose.forum_image,
        storage_key=key,
        file_name="a.png",
        content_type="image/png",
        size_bytes=1,
        status=status,
        created_at=utcnow() - age,
    )
    db.add(up)
    return up


def test_sweep_deletes_what_is_no_longer_needed(
    same_session: Session, storage: Storage, make_user: Callable[..., User]
) -> None:
    db, owner, now = same_session, make_user(), utcnow()
    day = timedelta(days=1)
    gone = [
        _upload(db, storage, owner, UploadStatus.pending, 2 * day, f"incoming/{uuid.uuid4()}"),
        _upload(db, storage, owner, UploadStatus.uploaded, 2 * day, f"forum/{uuid.uuid4()}/a.png"),
    ]
    kept = [
        _upload(db, storage, owner, UploadStatus.attached, 30 * day, f"forum/{uuid.uuid4()}/b.png"),
        _upload(db, storage, owner, UploadStatus.uploaded, timedelta(hours=2), f"forum/{uuid.uuid4()}/c.png"),
    ]

    def challenge(age: timedelta) -> OtpChallenge:
        return OtpChallenge(
            purpose=OtpPurpose.sign_in,
            channel=Channel.email,
            identifier=f"{uuid.uuid4().hex[:8]}@example.com",
            code_hash="0" * 64,
            created_at=now - age,
            expires_at=now - age + timedelta(minutes=10),
        )

    def session(**dates: Any) -> UserSession:
        return UserSession(user_id=owner.id, token_hash=uuid.uuid4().hex * 2, **dates)

    old_code, recent_code = challenge(3 * day), challenge(day)
    dead = [session(expires_at=now - 31 * day), session(expires_at=now + day, revoked_at=now - 31 * day)]
    alive = [
        session(expires_at=now - day),
        session(expires_at=now + day, revoked_at=now - day),
        session(expires_at=now + day),
    ]
    db.add_all([old_code, recent_code, *dead, *alive])
    db.commit()
    ids = {"codes": (old_code.id, recent_code.id), "dead": [s.id for s in dead], "alive": [s.id for s in alive]}

    report = cli.sweep()
    assert (report.uploads, report.challenges, report.sessions) == (2, 1, 2)
    db.expire_all()
    for up in gone:
        assert db.get(Upload, up.id) is None
        assert storage.head(up.storage_key) is None
    for up in kept:
        assert db.get(Upload, up.id) is not None
        assert storage.head(up.storage_key) is not None
    assert db.get(OtpChallenge, ids["codes"][0]) is None
    assert db.get(OtpChallenge, ids["codes"][1]) is not None
    assert all(db.get(UserSession, i) is None for i in ids["dead"])
    assert all(db.get(UserSession, i) is not None for i in ids["alive"])
    assert cli.sweep().uploads == 0  # nothing left to do


def test_sweep_uploads_is_the_old_name_of_sweep(same_session: Session, capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["sweep-uploads"]) == 0
    assert capsys.readouterr().out.startswith("swept ")


def _keys(client: Any, bucket: str, prefix: str = "") -> list[str]:
    return sorted(o["Key"] for o in client.list_objects_v2(Bucket=bucket, Prefix=prefix).get("Contents", []))


def test_backup_goes_to_its_own_bucket_with_its_own_key_encrypted_and_pruned(
    storage: Storage, set_option: SetOption, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    set_option("backup_bucket", "dsba-backups-test")
    set_option("backup_access_key_id", "backup-writer")
    set_option("backup_secret_access_key", SecretStr("backup-writer-secret"))
    set_option("backup_keep", 2)
    used: list[dict[str, Any]] = []
    real_client = cli.s3_client

    def spy(*args: Any, **kwargs: Any) -> Any:
        used.append(kwargs)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(cli, "s3_client", spy)
    backups = boto3.client("s3", region_name="us-east-1")
    backups.create_bucket(Bucket="dsba-backups-test")
    before = ["backups/db/20250101T000000Z.sql.gz", "backups/db/20250102T000000Z.sql.gz", "backups/db/notes.txt"]
    for key in before:
        backups.put_object(Bucket="dsba-backups-test", Key=key, Body=b"old")

    assert cli.cmd_backup(argparse.Namespace()) == 0
    out = capsys.readouterr().out
    assert "its own bucket" in out
    assert "encryption: AES256" in out
    assert [kw["access_key_id"] for kw in used] == ["backup-writer"]  # never the API's key

    keys = _keys(backups, "dsba-backups-test")
    new = [k for k in keys if k not in before]
    assert len(new) == 1
    assert cli.BACKUP_NAME.fullmatch(new[0].removeprefix("backups/db/"))
    # the newest two dumps stay, the oldest goes; files that aren't dumps are left alone
    assert keys == sorted([before[1], new[0], before[2]])
    assert _keys(storage.client, storage.bucket, "backups/") == []  # nothing in the uploads bucket

    head = backups.head_object(Bucket="dsba-backups-test", Key=new[0])
    assert head["ServerSideEncryption"] == "AES256"
    sql = gzip.decompress(backups.get_object(Bucket="dsba-backups-test", Key=new[0])["Body"].read()).decode()
    assert "CREATE TABLE public.uploads" in sql
    assert "COPY public.alembic_version" in sql
    for table in cli.BACKUP_SKIP_DATA:  # their rows stay out (a restore signs everyone out)
        assert f"CREATE TABLE public.{table}" in sql
        assert f"COPY public.{table}" not in sql


def test_backup_without_its_own_settings_uses_the_main_bucket(storage: Storage, set_option: SetOption) -> None:
    set_option("backup_sse", "none")
    target = cli.backup_target(cli.get_settings())
    assert (target.bucket, target.prefix, target.separate) == (storage.bucket, "backups/db/", False)
    assert cli.encryption_args(cli.get_settings()) == {}
    set_option("backup_sse", "aws:kms")
    set_option("backup_kms_key_id", "key-123")
    assert cli.encryption_args(cli.get_settings()) == {"ServerSideEncryption": "aws:kms", "SSEKMSKeyId": "key-123"}


def test_pg_dump_gets_the_password_in_its_environment_only(set_option: SetOption) -> None:
    set_option("database_url", "postgresql+psycopg://dsba:s3cret@db.internal:6543/hub?sslmode=require")
    cmd, env = cli.pg_dump_command(cli.get_settings(), "/tmp/out.sql.gz")  # noqa: S108 - a name, not a file
    assert not any("s3cret" in part for part in cmd)
    assert (env["PGHOST"], env["PGPORT"], env["PGUSER"], env["PGPASSWORD"]) == ("db.internal", "6543", "dsba", "s3cret")
    assert (env["PGDATABASE"], env["PGSSLMODE"]) == ("hub", "require")


def test_set_role_is_audited(
    same_session: Session, make_user: Callable[..., User], capsys: pytest.CaptureFixture[str]
) -> None:
    user = make_user(email="soon.rep@example.com", name="Soon A Rep")
    assert cli.main(["set-role", "Soon.Rep@Example.com", "moderator"]) == 0
    assert capsys.readouterr().out == "soon.rep@example.com is now moderator\n"
    same_session.refresh(user)
    assert user.role == Role.moderator
    entry = same_session.scalar(select(AuditEntry).where(AuditEntry.action == "user.role"))
    assert entry is not None
    assert entry.actor_id is None
    assert entry.target_id == str(user.id)
    assert entry.data == {"from": "student", "to": "moderator", "via": "cli", "targetName": "Soon A Rep"}
    assert cli.main(["set-role", "nobody@example.com", "admin"]) == 1


def test_setup_bucket_sets_cors_and_the_incoming_rule(storage: Storage, capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["setup-bucket"]) == 0
    assert "incoming/ expiry set" in capsys.readouterr().out
    rules = storage.client.get_bucket_lifecycle_configuration(Bucket=storage.bucket)["Rules"]
    assert any(r.get("ID") == INCOMING_RULE_ID for r in rules)
    cors = storage.client.get_bucket_cors(Bucket=storage.bucket)["CORSRules"]
    assert set(cors[0]["AllowedMethods"]) == {"GET", "POST", "HEAD"}
