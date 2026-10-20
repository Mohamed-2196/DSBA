"""The command line: the daily sweep (finding 17), backups (finding 10), set-role (finding 21), bucket set-up."""

from __future__ import annotations

import argparse
import gzip
import urllib.request
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
from app.config import get_settings
from app.core.access import FEATURES, Feature
from app.core.security import hash_token
from app.core.time import utcnow
from app.models import (
    AuditEntry,
    Channel,
    ItemSource,
    ItemStatus,
    LibraryItem,
    OtpChallenge,
    OtpPurpose,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
    UserSession,
)
from app.services import access
from app.services.storage import INCOMING_RULE_ID, Storage, s3_client
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
    real_client = s3_client

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
    target = cli.backup_target(get_settings())
    assert (target.bucket, target.prefix, target.separate) == (storage.bucket, "backups/db/", False)
    assert cli.encryption_args(get_settings()) == {}
    set_option("backup_sse", "aws:kms")
    set_option("backup_kms_key_id", "key-123")
    assert cli.encryption_args(get_settings()) == {"ServerSideEncryption": "aws:kms", "SSEKMSKeyId": "key-123"}


def test_pg_dump_gets_the_password_in_its_environment_only(set_option: SetOption) -> None:
    set_option("database_url", "postgresql+psycopg://dsba:s3cret@db.internal:6543/hub?sslmode=require")
    cmd, env = cli.pg_dump_command(get_settings(), "/tmp/out.sql.gz")  # noqa: S108 - a name, not a file
    assert not any("s3cret" in part for part in cmd)
    assert (env["PGHOST"], env["PGPORT"], env["PGUSER"], env["PGPASSWORD"]) == ("db.internal", "6543", "dsba", "s3cret")
    assert (env["PGDATABASE"], env["PGSSLMODE"]) == ("hub", "require")


def test_set_role_gives_exactly_these_roles_and_is_audited(
    same_session: Session, make_user: Callable[..., User], capsys: pytest.CaptureFixture[str]
) -> None:
    user = make_user(email="soon.rep@example.com", name="Soon A Rep")
    assert cli.main(["set-role", "Soon.Rep@Example.com", "student", "rep"]) == 0
    assert capsys.readouterr().out == "soon.rep@example.com now holds: Rep, Student\n"
    assert access.access_of(user).slugs == ("rep", "student")
    entry = same_session.scalar(select(AuditEntry).where(AuditEntry.action == "user.roles"))
    assert entry is not None
    assert entry.actor_id is None
    assert entry.target_id == str(user.id)
    assert entry.data == {"from": ["Student"], "to": ["Rep", "Student"], "via": "cli", "targetName": "Soon A Rep"}
    assert cli.main(["set-role", "nobody@example.com", "admin"]) == 1
    assert cli.main(["set-role", "soon.rep@example.com", "owner"]) == 1
    assert "no role called owner" in capsys.readouterr().err


def test_set_role_never_leaves_the_hub_without_an_admin(
    same_session: Session, make_user: Callable[..., User], capsys: pytest.CaptureFixture[str]
) -> None:
    boss = make_user(email="only.admin@example.com", name="Only Admin", roles=("student", "admin"))
    assert cli.main(["set-role", "only.admin@example.com", "student"]) == 1
    assert "at least one active admin" in capsys.readouterr().err
    assert access.is_admin(boss)
    make_user(email="second.admin@example.com", name="Second Admin", roles=("student", "admin"))
    assert cli.main(["set-role", "only.admin@example.com", "student"]) == 0
    assert not access.is_admin(boss)


def test_setup_bucket_sets_cors_and_the_incoming_rule(storage: Storage, capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["setup-bucket"]) == 0
    assert "incoming/ expiry set" in capsys.readouterr().out
    rules = storage.client.get_bucket_lifecycle_configuration(Bucket=storage.bucket)["Rules"]
    assert any(r.get("ID") == INCOMING_RULE_ID for r in rules)
    cors = storage.client.get_bucket_cors(Bucket=storage.bucket)["CORSRules"]
    assert set(cors[0]["AllowedMethods"]) == {"GET", "POST", "HEAD"}


def test_the_sweep_reports_the_library_files_it_deleted(
    same_session: Session, storage: Storage, make_user: Callable[..., User], capsys: pytest.CaptureFixture[str]
) -> None:
    db, owner, now = same_session, make_user(), utcnow()
    key = f"library/{uuid.uuid4()}/old.pdf"
    storage.client.put_object(Bucket=storage.bucket, Key=key, Body=b"%PDF-1.4", ContentType="application/pdf")
    item = LibraryItem(
        slug=f"old-{uuid.uuid4().hex[:6]}",
        source=ItemSource.file,
        kind="notes",
        title="Turned down a while ago",
        storage_key=key,
        file_name="old.pdf",
        content_type="application/pdf",
        size_bytes=8,
        uploaded_by=owner.id,
        status=ItemStatus.rejected,
        created_at=now - timedelta(days=9),
        reviewed_at=now - timedelta(days=8),
    )
    db.add(item)
    db.commit()
    assert cli.main(["sweep"]) == 0
    assert "1 library file(s)" in capsys.readouterr().out
    assert storage.head(key) is None
    db.refresh(item)
    assert item.storage_key is None  # the item stays, without its file


def test_dev_login_saves_the_session_it_prints(
    same_session: Session, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The printed token signs in: the command commits the session it creates."""
    commits: list[int] = []
    real_commit = same_session.commit

    def counted_commit() -> None:
        commits.append(1)
        real_commit()

    monkeypatch.setattr(same_session, "commit", counted_commit)
    assert cli.main(["dev-login", "dev.check@example.com", "--name", "Dev Check", "--year", "2"]) == 0
    token = capsys.readouterr().out.strip().splitlines()[-1]
    assert commits
    saved = same_session.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    assert saved is not None


def test_enable_features_switches_everything_on_and_logs_it(same_session: Session) -> None:
    access.store_switch(same_session, Feature.notes, "off", (), by=None)
    assert cli.main(["enable-features"]) == 0
    states = access.switches(same_session)
    assert all(states[f].mode == "everyone" for f in FEATURES)
    logged = same_session.scalars(select(AuditEntry).where(AuditEntry.action == "feature.switch")).all()
    assert any(e.target_id == Feature.notes.value for e in logged)


def test_enable_features_refuses_in_production(same_session: Session, set_option: SetOption) -> None:
    set_option("env", "production")
    assert cli.main(["enable-features"]) == 1


def test_a_failed_backup_says_so_loudly_and_tells_its_monitor(
    set_option: SetOption, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """SEC-57: exit status 1, BACKUP FAILED in the log, and DSBA_BACKUP_PING_URL/fail; a good run pings the URL."""
    pinged: list[str] = []
    set_option("backup_ping_url", "https://hc-ping.example.com/abc")
    monkeypatch.setattr(cli, "ping", lambda url, ok: pinged.append(f"{url} {'ok' if ok else 'fail'}"))

    def broken(_: Any) -> bool:
        raise RuntimeError("the bucket said no")

    monkeypatch.setattr(cli, "backup", broken)
    assert cli.cmd_backup(argparse.Namespace()) == 1
    assert "BACKUP FAILED" in capsys.readouterr().err
    monkeypatch.setattr(cli, "backup", lambda _: True)
    assert cli.cmd_backup(argparse.Namespace()) == 0
    assert pinged == ["https://hc-ping.example.com/abc fail", "https://hc-ping.example.com/abc ok"]


def test_a_failed_sweep_says_so_loudly(
    set_option: SetOption, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    pinged: list[bool] = []
    monkeypatch.setattr(cli, "ping", lambda url, ok: pinged.append(ok))

    def broken() -> cli.SweepReport:
        raise RuntimeError("the database went away")

    monkeypatch.setattr(cli, "sweep", broken)
    assert cli.cmd_sweep(argparse.Namespace()) == 1
    assert "SWEEP FAILED" in capsys.readouterr().err
    assert pinged == [False]


def test_the_ping_goes_only_to_https(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    opened: list[str] = []

    class Answer:
        def __enter__(self) -> Answer:
            return self

        def __exit__(self, *_: object) -> None:
            return None

    def urlopen(url: str, timeout: float) -> Answer:
        opened.append(url)
        return Answer()

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    cli.ping("https://hc-ping.example.com/abc/", ok=False)
    cli.ping("http://hc-ping.example.com/abc", ok=True)
    cli.ping(None, ok=True)
    assert opened == ["https://hc-ping.example.com/abc/fail"]
    assert "must be https://" in capsys.readouterr().err
