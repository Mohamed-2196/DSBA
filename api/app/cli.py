"""Command line: python -m app.cli <command>.

openapi            print the OpenAPI document (the web app generates its types from it)
seed [--only X]    load the reference content (modules, calendar, newsletter, career, library links)
set-role ID ROLE   make the account with this email or phone number a student, moderator or admin
backup             pg_dump the database into the bucket (backups/db/<timestamp>.sql.gz), keep the newest 14
sweep-uploads      delete uploads that were never attached (older than a day) from the bucket and the database
"""

from __future__ import annotations

import argparse
import gzip
import json
import subprocess
import sys
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.core.time import utcnow
from app.db import get_sessionmaker
from app.models import Role, Upload, UploadStatus, User
from app.services.storage import get_storage

BACKUP_PREFIX = "backups/db/"
KEEP_BACKUPS = 14


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
    from app.services.identifiers import normalize_identifier

    _, ident = normalize_identifier(args.identifier)
    with get_sessionmaker()() as db:
        user = db.scalar(select(User).where((User.email == ident) | (User.phone == ident)))
        if user is None:
            print(f"no account for {ident}: sign in once first", file=sys.stderr)
            return 1
        user.role = Role(args.role)
        db.commit()
    print(f"{ident} is now {args.role}")
    return 0


def cmd_backup(_: argparse.Namespace) -> int:
    s = get_settings()
    url = make_url(s.database_url)
    env = {"PGPASSWORD": url.password or "", "PATH": "/usr/bin:/bin:/usr/local/bin"}
    cmd = [
        "pg_dump",
        "--no-owner",
        "--no-privileges",
        "-h",
        url.host or "localhost",
        "-p",
        str(url.port or 5432),
        "-U",
        url.username or "postgres",
        url.database or "postgres",
    ]
    dump = subprocess.run(cmd, env=env, check=True, capture_output=True).stdout  # noqa: S603 - fixed argv
    key = f"{BACKUP_PREFIX}{utcnow():%Y%m%dT%H%M%SZ}.sql.gz"
    storage = get_storage()
    storage.put_bytes(key, gzip.compress(dump), "application/gzip")
    keys = sorted(
        o["Key"]
        for o in storage.client.list_objects_v2(Bucket=storage.bucket, Prefix=BACKUP_PREFIX).get("Contents", [])
    )
    for old in keys[:-KEEP_BACKUPS]:
        storage.delete(old)
    print(f"backup written to s3://{storage.bucket}/{key} ({len(dump)} bytes before compression)")
    return 0


def cmd_sweep_uploads(_: argparse.Namespace) -> int:
    cutoff = utcnow() - timedelta(days=1)
    storage = get_storage()
    n = 0
    with get_sessionmaker()() as db:
        stale = db.scalars(
            select(Upload).where(Upload.status != UploadStatus.attached, Upload.created_at < cutoff)
        ).all()
        for up in stale:
            storage.delete(up.storage_key)
            db.delete(up)
            n += 1
        db.commit()
    print(f"swept {n} upload(s)")
    return 0


def cmd_dev_login(args: argparse.Namespace) -> int:
    from app.core.security import hash_token, new_token
    from app.models import UserSession
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
    sub.add_parser("sweep-uploads").set_defaults(fn=cmd_sweep_uploads)
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
