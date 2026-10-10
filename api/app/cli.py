"""Command line: python -m app.cli <command>.

openapi            print the OpenAPI document (the web app generates its types from it)
seed [--only X]    load the reference content (modules, calendar, newsletter, career, library links)
set-role ID ROLE   make the account with this email or phone number a student, moderator or admin (audited)
backup             pg_dump the database into the backup bucket, encrypted at rest, and keep the newest
                   DSBA_BACKUP_KEEP (docs/backend/DEPLOYMENT.md: where backups go, and how to restore one)
sweep              delete what is no longer needed: uploads never attached to anything (after a day), sign-in
                   codes older than two days, and sessions that expired or were revoked more than 30 days ago
setup-bucket       create the bucket if needed and set its CORS and lifecycle rules (production: once)
dev-login ID       development only: print a session token for an account (created if needed)

Nothing here prints a one-time code, and only dev-login prints a token (it refuses to run in production)."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING, Any, cast

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import CursorResult, delete, or_, select
from sqlalchemy.engine import make_url

from app.config import Settings, get_settings
from app.core.time import utcnow
from app.db import get_sessionmaker
from app.models import OtpChallenge, Role, Upload, UploadStatus, User, UserSession
from app.services.storage import get_storage, s3_client

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

# Rows a dump leaves out: sign-in codes and sessions are of no use after a restore (everyone signs in again).
BACKUP_SKIP_DATA = ("otp_challenges", "user_sessions")
BACKUP_NAME = re.compile(r"\d{8}T\d{6}Z\.sql\.gz")
UPLOAD_GRACE = timedelta(days=1)  # an upload not attached to anything after this long is swept
SESSION_RETENTION = timedelta(days=30)  # expired or revoked sessions are kept this long (who signed in from where)


def cmd_openapi(_: argparse.Namespace) -> int:
    from app.main import create_app

    json.dump(create_app().openapi(), sys.stdout, indent=2, sort_keys=False)
    sys.stdout.write("\n")
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    from app.seed.loader import load_all

    with get_sessionmaker()() as db:
        report = load_all(db, only=args.only)
        db.commit()
    for name, count in report.items():
        print(f"{name}: {count}")
    return 0


def cmd_set_role(args: argparse.Namespace) -> int:
    from app.services.audit import record
    from app.services.identifiers import normalize_identifier

    _, ident = normalize_identifier(args.identifier)
    with get_sessionmaker()() as db:
        user = db.scalar(select(User).where((User.email == ident) | (User.phone == ident)))
        if user is None:
            print(f"no account for {ident}: sign in once first", file=sys.stderr)
            return 1
        role = Role(args.role)
        if user.role != role:
            record(db, None, "user.role", "user", user.id, {"from": user.role.value, "to": role.value, "via": "cli"})
            user.role = role
            db.commit()
    print(f"{ident} is now {args.role}")
    return 0


# ── backups ──────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BackupTarget:
    client: S3Client
    bucket: str
    prefix: str
    separate: bool  # its own bucket or key, not the API's


def backup_target(s: Settings) -> BackupTarget:
    """Where dumps go: DSBA_BACKUP_BUCKET with DSBA_BACKUP_* credentials when set (the endpoint, region and keys
    default to the main store's), else the main bucket under DSBA_BACKUP_PREFIX with the API's key."""
    own_key = s.backup_access_key_id is not None and s.backup_secret_access_key is not None
    if not (s.backup_bucket or own_key or s.backup_s3_endpoint_url):
        st = get_storage()
        return BackupTarget(st.client, st.bucket, s.backup_prefix, separate=False)
    if own_key:
        key_id = s.backup_access_key_id or ""
        secret = s.backup_secret_access_key.get_secret_value() if s.backup_secret_access_key else ""
    else:
        key_id, secret = s.s3_access_key_id, s.s3_secret_access_key.get_secret_value()
    client = s3_client(
        s,
        endpoint_url=s.backup_s3_endpoint_url or s.s3_endpoint_url,
        region=s.backup_s3_region or s.s3_region,
        access_key_id=key_id,
        secret_access_key=secret,
    )
    return BackupTarget(client, s.backup_bucket or s.s3_bucket, s.backup_prefix, separate=True)


def pg_dump_command(s: Settings, out_path: str) -> tuple[list[str], dict[str, str]]:
    """pg_dump's argv and environment: the password and connection details travel in the environment, never in the
    command line (which other processes can read)."""
    url = make_url(s.database_url)
    env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}
    parts = {
        "PGHOST": url.host or "localhost",
        "PGPORT": str(url.port or 5432),
        "PGUSER": url.username or "postgres",
        "PGPASSWORD": url.password or "",
        "PGDATABASE": url.database or "postgres",
        "PGSSLMODE": str(url.query.get("sslmode", "")),
    }
    env.update({k: v for k, v in parts.items() if v})
    cmd = [
        "pg_dump",
        "--no-owner",
        "--no-privileges",
        "--compress=6",  # plain SQL, gzipped: gunzip -c <file> | psql
        *[f"--exclude-table-data={table}" for table in BACKUP_SKIP_DATA],
        "--file",
        out_path,
    ]
    return cmd, env


def encryption_args(s: Settings) -> dict[str, str]:
    if s.backup_sse == "none":
        return {}
    args: dict[str, str] = {"ServerSideEncryption": s.backup_sse}
    if s.backup_sse == "aws:kms" and s.backup_kms_key_id:
        args["SSEKMSKeyId"] = s.backup_kms_key_id
    return args


def prune_backups(target: BackupTarget, keep: int) -> int:
    """Deletes all but the newest `keep` dumps under the prefix (only files named like a dump). -> how many."""
    if keep <= 0:
        return 0
    names: list[str] = []
    for page in target.client.get_paginator("list_objects_v2").paginate(Bucket=target.bucket, Prefix=target.prefix):
        names.extend(
            o["Key"] for o in page.get("Contents", []) if BACKUP_NAME.fullmatch(o["Key"][len(target.prefix) :])
        )
    old = sorted(names)[:-keep]
    for key in old:
        target.client.delete_object(Bucket=target.bucket, Key=key)
    return len(old)


def cmd_backup(_: argparse.Namespace) -> int:
    s = get_settings()
    target = backup_target(s)
    key = f"{target.prefix}{utcnow():%Y%m%dT%H%M%SZ}.sql.gz"
    with tempfile.TemporaryDirectory(prefix="dsba-backup-") as tmp:
        path = os.path.join(tmp, "dump.sql.gz")
        cmd, env = pg_dump_command(s, path)
        done = subprocess.run(cmd, env=env, capture_output=True, text=True, check=False)  # noqa: S603 - fixed argv
        if done.returncode != 0:
            print(f"backup failed: pg_dump exited with {done.returncode}\n{done.stderr.strip()}", file=sys.stderr)
            return 1
        size = os.path.getsize(path)
        extra: dict[str, Any] = {"ContentType": "application/gzip", **encryption_args(s)}
        target.client.upload_file(path, target.bucket, key, ExtraArgs=extra)
    where = "its own bucket" if target.separate else "the main bucket"
    print(f"backup written to s3://{target.bucket}/{key} ({size} bytes, {where}, encryption: {s.backup_sse})")
    try:
        pruned = prune_backups(target, s.backup_keep)
    except (ClientError, BotoCoreError) as e:  # a write-only backup key can't list or delete: a lifecycle rule must
        print(f"old backups were not pruned ({type(e).__name__}): keep them with a lifecycle rule", file=sys.stderr)
    else:
        if pruned:
            print(f"deleted {pruned} older backup(s), keeping the newest {s.backup_keep}")
    return 0


# ── sweep ────────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SweepReport:
    uploads: int
    challenges: int
    sessions: int


def sweep() -> SweepReport:
    """Deletes uploads never attached to anything (objects first, then rows), old sign-in codes, and sessions that
    ended long ago. Safe to run at any time and to run again."""
    from app.services.otp import KEEP_CHALLENGES

    now = utcnow()
    storage = get_storage()
    with get_sessionmaker()() as db:
        stale = db.scalars(
            select(Upload).where(Upload.status != UploadStatus.attached, Upload.created_at < now - UPLOAD_GRACE)
        ).all()
        for up in stale:
            storage.delete(up.storage_key)  # a pending upload's incoming object may never have arrived: still fine
            db.delete(up)
        old_codes = delete(OtpChallenge).where(OtpChallenge.created_at < now - KEEP_CHALLENGES)
        challenges = cast(CursorResult[Any], db.execute(old_codes)).rowcount
        ended = now - SESSION_RETENTION
        dead = delete(UserSession).where(or_(UserSession.expires_at < ended, UserSession.revoked_at < ended))
        sessions = cast(CursorResult[Any], db.execute(dead)).rowcount
        db.commit()
    return SweepReport(uploads=len(stale), challenges=challenges, sessions=sessions)


def cmd_sweep(_: argparse.Namespace) -> int:
    r = sweep()
    print(f"swept {r.uploads} upload(s), {r.challenges} sign-in code(s) and {r.sessions} session(s)")
    return 0


def cmd_setup_bucket(_: argparse.Namespace) -> int:
    s = get_settings()
    storage = get_storage()
    lifecycle = "set" if storage.ensure_bucket(s.web_origins) else "not supported here: clear incoming/ yourself"
    print(f"bucket {storage.bucket}: CORS for {', '.join(s.web_origins)}; incoming/ expiry {lifecycle}")
    return 0


def cmd_dev_login(args: argparse.Namespace) -> int:
    from app.core.security import hash_token, new_token
    from app.services.identifiers import normalize_identifier

    if get_settings().is_production:
        print("dev-login is disabled in production", file=sys.stderr)
        return 1
    kind, ident = normalize_identifier(args.identifier)
    with get_sessionmaker()() as db:
        user = db.scalar(select(User).where((User.email == ident) | (User.phone == ident)))
        if user is None:
            user = User(email=ident if kind == "email" else None, phone=ident if kind == "phone" else None)
            db.add(user)
        if args.name:
            user.display_name = args.name
        if args.year:
            user.year = args.year
        if args.role:
            user.role = Role(args.role)
        db.flush()
        token = new_token()
        db.add(UserSession(user_id=user.id, token_hash=hash_token(token), expires_at=utcnow() + timedelta(days=7)))
        db.commit()
    print(token)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="python -m app.cli", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("openapi").set_defaults(fn=cmd_openapi)
    sp = sub.add_parser("seed")
    sp.add_argument("--only", choices=["modules", "calendar", "newsletter", "career", "library"], default=None)
    sp.set_defaults(fn=cmd_seed)
    sr = sub.add_parser("set-role")
    sr.add_argument("identifier")
    sr.add_argument("role", choices=[r.value for r in Role])
    sr.set_defaults(fn=cmd_set_role)
    sub.add_parser("backup").set_defaults(fn=cmd_backup)
    sub.add_parser("sweep", aliases=["sweep-uploads"]).set_defaults(fn=cmd_sweep)
    sub.add_parser("setup-bucket").set_defaults(fn=cmd_setup_bucket)
    dl = sub.add_parser("dev-login")
    dl.add_argument("identifier")
    dl.add_argument("--role", choices=[r.value for r in Role], default=None)
    dl.add_argument("--name", default=None)
    dl.add_argument("--year", type=int, choices=[1, 2, 3], default=None)
    dl.set_defaults(fn=cmd_dev_login)
    args = p.parse_args(argv)
    return int(args.fn(args))


if __name__ == "__main__":
    raise SystemExit(main())
