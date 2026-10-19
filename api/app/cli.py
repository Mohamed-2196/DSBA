"""Command line: python -m app.cli <command>.

openapi            print the OpenAPI document (the web app generates its types from it)
seed [--only X]    load the reference content (modules, calendar, newsletter, career, the Drive folders to import,
                   and the past questions Claude tagged, on the papers the install has)
set-role ID ROLE...  make the account with this email or phone number hold exactly these roles (slugs; audited)
backup             pg_dump the database into the backup bucket, encrypted at rest, and keep the newest
                   DSBA_BACKUP_KEEP (docs/backend/DEPLOYMENT.md: where backups go, and how to restore one)
sweep              delete what is no longer needed: uploads never attached to anything or whose board card is gone
                   (after a day), sign-in codes older than two days, sessions that expired or were revoked more
                   than 30 days ago, the files of library items rejected or removed more than a week ago, and the
                   screenshots of bug reports closed more than 90 days ago
setup-bucket       create the bucket if needed and set its CORS and lifecycle rules (production: once)
mail-worker        send the queued emails (notifications, account notices, Sunday summaries) with retries; runs
                   until stopped (--once: until nothing is due). Several can run side by side. On Sunday from
                   08:00 Bahrain time it queues the week's summaries itself
weekly-summary     queue this week's Sunday summary now, for everyone who has it on and hasn't had it this week
                   (--preview YEAR: print that year's text and send nothing)
import-drive       copy the files of the modules' Google Drive folders into the library: prints the plan, asks,
                   imports, and lists the folders Drive refused (--dry-run: only the plan; --module ID; --limit N
                   files; --pace S: seconds between downloads, default 2; --yes: no question). Safe to run again:
                   it tries skipped and failed files again. Needs DSBA_GOOGLE_API_KEY (DEPLOYMENT.md, 10)
exam-meta          read the exam year, session, zone and kind of the past papers, reports and solutions the Drive
                   import brought in, from their names, and fill what each lacks (--dry-run: only list them)
text-worker        read the words of each newly published PDF and Word file, for search inside papers; runs until
                   stopped. Several can run side by side.
extract-texts      read the words (and make the covers) of the published files that have none yet, then stop
                   (--retry: read failed and empty files again too; --limit N files)
                   (text-worker and extract-texts need only the database and the bucket settings)
texts-role         create the text worker's database role, or set its password (DSBA_TEXTS_DB_PASSWORD), with only
                   what the worker needs; production runs it after every migration
daily-content import FILE   add the Daily puzzles' content from a file kept out of the repository (themes, guess
                   words, vocabulary, items; what the database has stays as it is). export FILE writes the database's
                   content to one (it holds every answer: keep it private)
tag-questions      have Claude tag each published past paper's questions with its module's chapters: one request a
                   paper, sent as one Message Batch (half the price), then saved as the results come back. Prints
                   the estimate and asks first (--dry-run: only the estimate; --sample N: N papers one by one,
                   printed and saved, for a look at the quality; --module ID or unit code; --limit N papers;
                   --redo: papers Claude tagged before too; --batch ID: collect a batch sent earlier; --yes: no
                   question). Needs DSBA_ANTHROPIC_API_KEY, except for --dry-run
export-question-tags [FILE]  write Claude's tags to the seed (default app/seed/data/paper_questions.json), keyed
                   by each paper's import key and file hash, so `seed` gives every environment the same tags
dev-login ID       development only: print a session token for an account (created if needed, holding Student;
                   --role gives one more role)
enable-features    development only: switch every feature on for everyone (each change goes to the activity log)

Nothing here prints a one-time code, and only dev-login prints a token (it refuses to run in production). Nothing
prints the Google API key."""

from __future__ import annotations

import argparse
import json
import logging
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
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings, texts_settings
from app.core.access import Feature
from app.core.time import utcnow
from app.db import get_sessionmaker, make_engine, sessions_for
from app.models import AccessRole, OtpChallenge, Upload, UploadPurpose, UploadStatus, User, UserSession
from app.services.storage import Storage, get_storage, s3_client

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

    from app.services.question_tagging import Report as TaggingReport

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
    from app.core.access import ADMIN
    from app.core.errors import ApiError
    from app.services import access
    from app.services.audit import record
    from app.services.identifiers import normalize_identifier

    _, ident = normalize_identifier(args.identifier)
    with get_sessionmaker()() as db:
        user = db.scalar(select(User).where((User.email == ident) | (User.phone == ident)))
        if user is None:
            print(f"no account for {ident}: sign in once first", file=sys.stderr)
            return 1
        found = {slug: access.role_by_slug(db, slug) for slug in args.roles}
        wanted = [role for role in found.values() if role is not None]
        if len(wanted) < len(found):
            missing = ", ".join(slug for slug, role in found.items() if role is None)
            known = ", ".join(db.scalars(select(AccessRole.slug).order_by(AccessRole.position)))
            print(f"no role called {missing}: the roles are {known}", file=sys.stderr)
            return 1
        before = access.role_names(user)
        try:
            if access.access_of(user, db).admin and all(role.slug != ADMIN for role in wanted):
                access.ensure_admins_remain(db, user)
        except ApiError as refused:
            print(refused.message, file=sys.stderr)
            return 1
        access.set_roles(db, user, wanted)
        after = access.role_names(user)
        if after != before:
            record(db, None, "user.roles", "user", user.id, {"from": before, "to": after, "via": "cli"})
        db.commit()
    print(f"{ident} now holds: {', '.join(after)}")
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
    files: int = 0  # files of rejected or removed library items
    bug_report_ips: int = 0  # guests' addresses on bug reports, forgotten once the rate limit no longer counts them
    bug_screenshots: int = 0  # screenshots of bug reports closed long ago


def sweep() -> SweepReport:
    """Deletes uploads never attached to anything, note files no note shows any more (released) and board files off
    their card (objects first, then rows), old
    sign-in codes, sessions that ended long ago, the files of library items rejected or removed a week ago, the
    addresses kept on bug reports and the screenshots of reports closed long ago. Safe to run at any time and to
    run again."""
    from app.services.bugs import clear_old_ips, sweep_screenshots
    from app.services.library import sweep_files
    from app.services.otp import KEEP_CHALLENGES

    now = utcnow()
    storage = get_storage()
    with get_sessionmaker()() as db:
        unused = or_(
            Upload.status != UploadStatus.attached,  # never attached, or a note file released
            (Upload.purpose == UploadPurpose.board) & Upload.card_id.is_(None),  # off its card, or the card is gone
        )
        stale = db.scalars(select(Upload).where(unused, Upload.created_at < now - UPLOAD_GRACE)).all()
        for up in stale:
            storage.delete(up.storage_key)  # a pending upload's incoming object may never have arrived: still fine
            db.delete(up)
        files = sweep_files(db, storage, now)  # library files rejected or removed a week ago
        old_codes = delete(OtpChallenge).where(OtpChallenge.created_at < now - KEEP_CHALLENGES)
        challenges = cast(CursorResult[Any], db.execute(old_codes)).rowcount
        ended = now - SESSION_RETENTION
        dead = delete(UserSession).where(or_(UserSession.expires_at < ended, UserSession.revoked_at < ended))
        sessions = cast(CursorResult[Any], db.execute(dead)).rowcount
        bug_report_ips = clear_old_ips(db)
        bug_screenshots = sweep_screenshots(db, storage, now)
        db.commit()
    return SweepReport(
        uploads=len(stale),
        challenges=challenges,
        sessions=sessions,
        files=files,
        bug_report_ips=bug_report_ips,
        bug_screenshots=bug_screenshots,
    )


def cmd_sweep(_: argparse.Namespace) -> int:
    r = sweep()
    print(
        f"swept {r.uploads} upload(s), {r.files} library file(s), {r.bug_screenshots} bug screenshot(s), "
        f"{r.challenges} sign-in code(s) and {r.sessions} session(s)"
    )
    return 0


def cmd_setup_bucket(_: argparse.Namespace) -> int:
    s = get_settings()
    storage = get_storage()
    lifecycle = "set" if storage.ensure_bucket(s.web_origins) else "not supported here: clear incoming/ yourself"
    print(f"bucket {storage.bucket}: CORS for {', '.join(s.web_origins)}; incoming/ expiry {lifecycle}")
    return 0


def cmd_mail_worker(args: argparse.Namespace) -> int:
    """Sends the queued emails until stopped (SIGTERM or Ctrl-C), or with --once until nothing is due."""
    from app.services.outbox import run_worker

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    return run_worker(get_sessionmaker(), once=args.once, poll_seconds=args.poll)


def texts_worker() -> tuple[sessionmaker[Session], Storage]:
    """The text worker's database sessions and bucket, from its own settings: in production it is given only those
    (compose.prod.yaml), so the API's checks of everything else don't apply (config.texts_settings())."""
    settings = texts_settings()
    return sessions_for(make_engine(settings.database_url)), Storage(settings)


def cmd_text_worker(args: argparse.Namespace) -> int:
    """Reads published files' text until stopped (SIGTERM or Ctrl-C)."""
    from app.services.paper_text import run_worker

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sessions, storage = texts_worker()
    return run_worker(sessions, storage, poll_seconds=args.poll)


def cmd_texts_role(_: argparse.Namespace) -> int:
    """Sets up the text worker's database role (paper_text.set_up_worker_role()), as the database's owner."""
    from app.services import paper_text

    password = get_settings().texts_db_password
    if password is None:
        print("DSBA_TEXTS_DB_PASSWORD is not set: the text worker's database role was left as it is.", file=sys.stderr)
        return 1
    with get_sessionmaker()() as db:
        try:
            paper_text.set_up_worker_role(db, password.get_secret_value(), paper_text.WORKER_ROLE)
        except ValueError as e:
            print(f"DSBA_TEXTS_DB_PASSWORD: {e}", file=sys.stderr)
            return 1
        db.commit()
    print(f"the text worker's database role {paper_text.WORKER_ROLE} is set up")
    return 0


def cmd_extract_texts(args: argparse.Namespace) -> int:
    """Reads every published file without text, printing how it went."""
    from app.models import TextStatus
    from app.services import paper_text

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    sessions, storage = texts_worker()
    with sessions() as db:
        if args.retry:
            again = paper_text.forget(db, (TextStatus.failed, TextStatus.empty))
            db.commit()
            print(f"reading {again} failed or empty file(s) again")
        print(f"{paper_text.waiting(db)} file(s) to read")
    counts = paper_text.drain(sessions, storage, limit=args.limit)
    print(
        f"read {sum(counts.values())} file(s): {counts[TextStatus.done]} with text, "
        f"{counts[TextStatus.empty]} without (scans), {counts[TextStatus.failed]} failed"
    )
    return 0


def cmd_weekly_summary(args: argparse.Namespace) -> int:
    """The Sunday summary on demand: the mail worker queues it on Sunday mornings by itself."""
    from app.core.time import bahrain_today
    from app.services import summary

    with get_sessionmaker()() as db:
        if args.preview is not None:
            s = summary.build(db, args.preview, summary.week_of(bahrain_today()), frozenset(Feature))
            print(s.text(), end="")
            return 0
        queued = summary.send_week(db, bahrain_today())
        db.commit()
    print(f"queued {queued} Sunday summar{'y' if queued == 1 else 'ies'}")
    return 0


def cmd_import_drive(args: argparse.Namespace) -> int:
    """The Drive import (app/services/drive_import.py), run from the server's shell (scripts/seed-real.sh)."""
    from app.models import Module
    from app.services import drive
    from app.services.drive_import import import_from_drive

    # The client's warnings (a retry, a wait for Google's block to lift) show; httpx's request lines don't.
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    try:
        client = drive.connect(get_settings())
    except drive.DriveFatalError as e:
        print(e.message, file=sys.stderr)
        return 1
    with client, get_sessionmaker()() as db:
        if args.module is not None and db.get(Module, args.module) is None:
            known = ", ".join(db.scalars(select(Module.id).order_by(Module.id))) or "none yet (run the seed first)"
            print(f"There is no module {args.module!r}. The modules are: {known}.", file=sys.stderr)
            return 2
        return import_from_drive(
            db,
            client,
            get_storage(),
            module_id=args.module,
            limit=args.limit,
            dry_run=args.dry_run,
            pace=args.pace,
            confirm=None if args.yes else _confirm,
        )


def cmd_exam_meta(args: argparse.Namespace) -> int:
    """Imported papers, reports and VLE files get the exam details their names give (backfill_exam_meta)."""
    from app.services.drive_import import backfill_exam_meta

    with get_sessionmaker()() as db:
        result = backfill_exam_meta(db, dry_run=args.dry_run)
        for line in result.changed:
            print(f"  {line}")
        verb = "Would change" if args.dry_run else "Changed"
        print(f"{verb} {len(result.changed)} of {result.checked} imported papers, reports and VLE files.")
        if not args.dry_run:
            db.commit()
    return 0


def _confirm(question: str) -> bool:
    try:
        answer = input(question)
    except EOFError:  # nobody to answer (no terminal): --yes says it beforehand
        print()
        return False
    return answer.strip().lower() in ("y", "yes")


def _positive(value: str) -> int:
    try:
        n = int(value)
    except ValueError:
        n = 0
    if n < 1:
        raise argparse.ArgumentTypeError("a whole number of files, 1 or more")
    return n


def _seconds(value: str) -> float:
    try:
        n = float(value)
    except ValueError:
        n = -1.0
    if not 0 <= n <= 600:
        raise argparse.ArgumentTypeError("a number of seconds from 0 to 600")
    return n


def cmd_tag_questions(args: argparse.Namespace) -> int:
    """Past questions tagged by Claude (app/services/question_tagging.py)."""
    from app.services import question_tagging as qt

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    with get_sessionmaker()() as db:
        module_id = None
        if args.module is not None:
            module = qt.resolve_module(db, args.module)
            if module is None:
                print(f"There is no module {args.module!r} (give its id or its unit code).", file=sys.stderr)
                return 2
            module_id = module.id
        claude = None if args.dry_run else qt.connect(get_settings())
        if claude is None and not args.dry_run:
            print("Tagging needs DSBA_ANTHROPIC_API_KEY. Nothing was sent.", file=sys.stderr)
            return 1
        if args.batch is not None:
            assert claude is not None
            qt.wait(claude, args.batch, out=print)
            return _tagging_report(qt.collect_batch(db, claude, args.batch, redo=args.redo), batch=True)

        ids = qt.candidates(db, module_id=module_id, redo=args.redo, limit=args.sample or args.limit)
        papers, skipped = qt.load_papers(db, ids)
        for item_id, why in skipped:
            print(f"  passed by {item_id}: {why}")
        est = qt.estimate(papers)
        how = "one by one" if args.sample else "as one batch"
        print(
            f"{est.papers} papers to tag {how} with {qt.MODEL}: about {est.input_tokens:,} input and "
            f"{est.output_tokens:,} output tokens, about ${est.cost(batch=not args.sample):.2f}."
        )
        if args.dry_run or not papers:
            return 0
        assert claude is not None
        if args.sample:
            return _tagging_report(qt.run_sample(db, claude, papers, redo=args.redo, out=print), batch=False)
        if not args.yes and not _confirm("Send them? [y/N] "):
            print("Nothing was sent.")
            return 1
        batch = qt.submit_batch(claude, papers)
        print(f"Sent batch {batch.id}. If this stops, collect it with: tag-questions --batch {batch.id}")
        qt.wait(claude, batch.id, out=print)
        return _tagging_report(qt.collect_batch(db, claude, batch.id, redo=args.redo), batch=True)


def _tagging_report(report: TaggingReport, *, batch: bool) -> int:
    for title, why in report.failed:
        print(f"  failed: {title}: {why}")
    print(
        f"Tagged {report.papers} papers ({report.tags} tags); {len(report.failed)} failed. Used "
        f"{report.input_tokens:,} input and {report.output_tokens:,} output tokens, about "
        f"${report.cost(batch=batch):.2f}."
    )
    return 0


def cmd_export_question_tags(args: argparse.Namespace) -> int:
    from pathlib import Path

    from app.seed.loader import DATA
    from app.services import question_tagging as qt

    path = Path(args.file) if args.file else DATA / f"{qt.SEED_FILE}.json"
    with get_sessionmaker()() as db:
        entries = qt.export_tags(db)
    path.write_text(json.dumps(entries, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    tags = sum(len(q["chapters"]) for e in entries for q in e["questions"])
    print(f"Wrote {tags} tags on {len(entries)} papers to {path}.")
    return 0


def cmd_daily_content(args: argparse.Namespace) -> int:
    from pathlib import Path

    from app.core.errors import ApiError
    from app.services.daily import bundle

    path = Path(args.file)
    with get_sessionmaker()() as db:
        if args.action == "export":
            data = bundle.export(db)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(f"wrote {len(data['items'])} items and {len(data['vocabulary'])} vocabulary words to {path}")
            print("It holds every answer: keep it out of the repository.")
            return 0
        try:
            content = bundle.read(path.read_text(encoding="utf-8"))
        except OSError as e:
            print(f"can't read {path}: {e}", file=sys.stderr)
            return 1
        except ApiError as e:
            print(f"{path}: {e.message}", file=sys.stderr)
            return 1
        result = bundle.load(db, content)
        db.commit()
    items = sum(c["added"] for c in result.items.values())
    kept = sum(c["kept"] for c in result.items.values())
    print(
        f"added {result.themes['added']} themes, {result.guesses['added']} guess words, "
        f"{result.vocabulary['added']} vocabulary words and {items} items ({kept} were there already)"
    )
    if result.rotation:
        print(f"the rotation: {', '.join(result.rotation)}")
    for problem in result.problems:
        print(f"not imported: {problem}", file=sys.stderr)
    return 1 if result.problems else 0


def cmd_dev_login(args: argparse.Namespace) -> int:
    from app.core.access import STUDENT
    from app.core.security import hash_token, new_token
    from app.services import access
    from app.services.identifiers import normalize_identifier

    if get_settings().is_production:
        print("dev-login is disabled in production", file=sys.stderr)
        return 1
    kind, ident = normalize_identifier(args.identifier)
    with get_sessionmaker()() as db:
        if args.role and access.role_by_slug(db, args.role) is None:
            print(f"no role called {args.role}", file=sys.stderr)
            return 1
        user = db.scalar(select(User).where((User.email == ident) | (User.phone == ident)))
        if user is None:
            user = User(email=ident if kind == "email" else None, phone=ident if kind == "phone" else None)
            db.add(user)
            db.flush()
            access.give(db, user, STUDENT)
        if args.name:
            user.display_name = args.name
        if args.year:
            user.year = args.year
        if args.role:
            access.give(db, user, args.role)
        db.flush()
        token = new_token()
        db.add(UserSession(user_id=user.id, token_hash=hash_token(token), expires_at=utcnow() + timedelta(days=7)))
        db.commit()
    print(token)
    return 0


def cmd_enable_features(_: argparse.Namespace) -> int:
    """Development only: every feature on for everyone, each change in the activity log."""
    from app.core.access import FEATURES
    from app.services import access
    from app.services.audit import record

    if get_settings().is_production:
        print("enable-features is disabled in production: switch features in Manage, Access", file=sys.stderr)
        return 1
    turned_on: list[str] = []
    with get_sessionmaker()() as db:
        states = access.switches(db)
        for feature in FEATURES:
            state = states.get(feature)
            if state is not None and state.mode == "everyone":
                continue
            access.store_switch(db, feature, "everyone", (), by=None)
            change = {
                "feature": feature.value,
                "label": FEATURES[feature].label,
                "from": state.mode if state else "off",
                "to": "everyone",
            }
            record(db, None, "feature.switch", "feature", feature.value, change)
            turned_on.append(feature.value)
        db.commit()
    print(f"switched on for everyone: {', '.join(turned_on)}" if turned_on else "every feature was already on")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="python -m app.cli", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("openapi").set_defaults(fn=cmd_openapi)
    sp = sub.add_parser("seed")
    sp.add_argument(
        "--only",
        choices=["modules", "calendar", "newsletter", "career", "drive-folders", "daily", "paper-questions"],
        default=None,
    )
    sp.set_defaults(fn=cmd_seed)
    sr = sub.add_parser("set-role")
    sr.add_argument("identifier")
    sr.add_argument(
        "roles",
        nargs="+",
        metavar="ROLE",
        help="role slugs: student, rep, newsletter-manager, content-manager, admin, or one an admin made",
    )
    sr.set_defaults(fn=cmd_set_role)
    sub.add_parser("backup").set_defaults(fn=cmd_backup)
    sub.add_parser("sweep").set_defaults(fn=cmd_sweep)
    sub.add_parser("setup-bucket").set_defaults(fn=cmd_setup_bucket)
    mw = sub.add_parser("mail-worker")
    mw.add_argument("--once", action="store_true", help="stop when nothing is due")
    mw.add_argument("--poll", type=float, default=5.0, help="seconds to wait when nothing is due (default 5)")
    mw.set_defaults(fn=cmd_mail_worker)
    ws = sub.add_parser("weekly-summary")
    ws.add_argument("--preview", type=int, choices=[1, 2, 3], default=None, metavar="YEAR", help="print, don't send")
    ws.set_defaults(fn=cmd_weekly_summary)
    di = sub.add_parser("import-drive")
    di.add_argument("--dry-run", action="store_true", help="print the plan and import nothing")
    di.add_argument("--module", metavar="ID", default=None, help="only the links of this module")
    di.add_argument("--limit", metavar="N", type=_positive, default=None, help="import at most N files this run")
    di.add_argument(
        "--pace", metavar="SECONDS", type=_seconds, default=2.0, help="seconds between two downloads (default 2)"
    )
    di.add_argument("--yes", action="store_true", help="import without asking first")
    di.set_defaults(fn=cmd_import_drive)
    em = sub.add_parser("exam-meta")
    em.add_argument("--dry-run", action="store_true", help="list what would change and change nothing")
    em.set_defaults(fn=cmd_exam_meta)
    tw = sub.add_parser("text-worker")
    tw.add_argument("--poll", type=float, default=10.0, help="seconds to wait when nothing is new (default 10)")
    tw.set_defaults(fn=cmd_text_worker)
    et = sub.add_parser("extract-texts")
    et.add_argument("--retry", action="store_true", help="read failed and empty files again too")
    et.add_argument("--limit", metavar="N", type=_positive, default=None, help="read at most N files this run")
    et.set_defaults(fn=cmd_extract_texts)
    sub.add_parser("texts-role").set_defaults(fn=cmd_texts_role)
    dc = sub.add_parser("daily-content")
    dc.add_argument("action", choices=["import", "export"])
    dc.add_argument("file", metavar="FILE")
    dc.set_defaults(fn=cmd_daily_content)
    tq = sub.add_parser("tag-questions")
    once = tq.add_mutually_exclusive_group()
    once.add_argument("--dry-run", action="store_true", help="print the papers and the estimate; send nothing")
    once.add_argument("--sample", metavar="N", type=_positive, default=None, help="tag N papers one by one, printed")
    once.add_argument("--batch", metavar="ID", default=None, help="collect the results of a batch sent earlier")
    tq.add_argument("--module", metavar="ID", default=None, help="only this module (its id or unit code)")
    tq.add_argument("--limit", metavar="N", type=_positive, default=None, help="at most N papers this run")
    tq.add_argument("--redo", action="store_true", help="tag papers Claude tagged before again (replaces its tags)")
    tq.add_argument("--yes", action="store_true", help="send the batch without asking first")
    tq.set_defaults(fn=cmd_tag_questions)
    xq = sub.add_parser("export-question-tags")
    xq.add_argument("file", metavar="FILE", nargs="?", default=None, help="default: the seed's paper_questions.json")
    xq.set_defaults(fn=cmd_export_question_tags)
    dl = sub.add_parser("dev-login")
    dl.add_argument("identifier")
    dl.add_argument("--role", default=None, metavar="ROLE", help="give this role too (a slug, such as rep or admin)")
    dl.add_argument("--name", default=None)
    dl.add_argument("--year", type=int, choices=[1, 2, 3], default=None)
    dl.set_defaults(fn=cmd_dev_login)
    sub.add_parser("enable-features").set_defaults(fn=cmd_enable_features)
    args = p.parse_args(argv)
    return int(args.fn(args))


if __name__ == "__main__":
    raise SystemExit(main())
