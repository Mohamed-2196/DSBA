"""The Drive import: the files in the library's Google Drive folders become library files (python -m app.cli
import-drive; scripts/seed-real.sh runs it after the migrations and the seed).

For every published link item that points at a Drive folder (the course materials, exercises, VLE material,
past papers and students' notes):
  1. walk the folder: its files, then its subfolders, shortcuts to files and folders followed, each folder once;
  2. plan each file: the library's type comes from its name (Google Docs and Slides are exported as PDF, Sheets as
     XLSX), and what the library doesn't take, what is too big and what an earlier run imported are skipped;
  3. once confirmed, download each file (its bytes counted against the limit, whatever Drive says its size is), check
     its first bytes with the uploads' own check, store it at library/drive/<module>/<Drive file id>/<safe name> and
     add it as a published file with the link's kind, module and author. Past papers get their exam year and zone
     from their names (exam_names.exam_meta_from_name), and examiners' reports their own kind.

Imported files are ordinary library files (source `file`): they are served, previewed, edited, removed and swept like
uploads. `import_key` ('drive/<module>/<file id>') remembers where each came from, so a rerun skips it whatever became
of it since, even after a rep removed it and the sweep deleted its file. The link items stay.

A folder Drive refuses (403 or 404: shared only inside BIBF's Google domain, or not at all) doesn't stop the run: it is
listed at the end with its module and link, to be shared with "anyone with the link" (or with the service account).
A file Drive won't hand over (downloads turned off, flagged as abuse, its download quota spent) is skipped with the
reason and its own Drive link; its folder's link item stays in the library either way. Skipped and failed files get
no import key, so the next run tries them again.

Downloads are paced (`pace` seconds between files) so Google doesn't take the run for automated queries. When it
does anyway, the client waits the block out (drive.DriveBlockedError) and the run doubles its pace from then on; a
block that outlasts the waits stops the run, and the next run carries on where it stopped.
Each real run is one entry in the audit log (`library.import`, via cli); a dry run changes nothing."""

from __future__ import annotations

import re
import tempfile
import unicodedata
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.text import clashes_on, clip
from app.models import ItemSource, ItemStatus, LibraryItem, Module, UploadPurpose
from app.schemas.library import EXAM_YEAR_MAX, EXAM_YEAR_MIN, LibraryKind
from app.services import audit, exam_names, library
from app.services.drive import (
    FOLDER,
    GOOGLE_APPS,
    Credential,
    Drive,
    DriveDeniedError,
    DriveError,
    DriveFatalError,
    DriveFile,
    Ref,
    TooLargeError,
    file_url,
    folder_in,
    folder_url,
    printable,
)
from app.services.storage import Storage, error_code, safe_file_name
from app.services.uploads import LIBRARY_TYPES, SNIFF_BYTES, FileType, extension, limit_bytes, looks_right, media_type

Echo = Callable[[str], None]

NO_MODULE = "no-module"  # the module part of the keys of a link that has no module
MODULE_SEGMENT = re.compile(r"[A-Za-z0-9_-]{1,64}")
EXPORT_LIMIT = 10 * 1024 * 1024  # Google exports at most 10 MB of a Docs, Sheets or Slides file
EXPORTS: dict[str, tuple[str, str]] = {  # a Google file's type -> the type it is exported as, and its extension
    "application/vnd.google-apps.document": ("application/pdf", "pdf"),
    "application/vnd.google-apps.presentation": ("application/pdf", "pdf"),
    "application/vnd.google-apps.spreadsheet": (LIBRARY_TYPES["xlsx"].content_type, "xlsx"),
}
GOOGLE_NAMES = {  # the part of a Google file's type after GOOGLE_APPS -> what people call it
    "document": "Google Docs",
    "spreadsheet": "Google Sheets",
    "presentation": "Google Slides",
    "form": "Google Forms",
    "drawing": "Google Drawings",
    "site": "Google Sites",
    "jam": "Jamboard",
    "map": "Google My Maps",
    "script": "Apps Script",
}
# Drive's refusals about one file, in words.
REFUSALS = {
    "exportSizeLimitExceeded": "Google exports at most 10 MB of a file, and this one is bigger",
    "downloadQuotaExceeded": "Drive's download quota for it is used up: run the import again tomorrow",
    "cannotDownloadAbusiveFile": "Drive flagged it as abuse",
    "fileNotDownloadable": "Drive has no way to download it",
    "cannotDownloadFile": "its owner turned off downloads",
}
PACE = 2.0  # seconds between two downloads (--pace)
PACE_MAX = 30.0  # the slowest the run gets after Google blocked it
MAX_DEPTH = 12  # folders below the link's own
NAME_MAX = 255  # LibraryItem.file_name
TITLE_MAX = 200  # LibraryItem.title
SPOOL_MAX = 8 * 1024 * 1024  # a download stays in memory up to this size, then goes to a temporary file
SEP = " \u203a "  # 'Week 1 \u203a Lecture 1.pdf'


def _extension_by_type() -> dict[str, str]:
    """The library's types whose first bytes can prove them -> their extension: a file whose name has no extension the
    library takes may still be one of these (its bytes decide; a name is never enough)."""
    found: dict[str, str] = {}
    for ext, file_type in LIBRARY_TYPES.items():
        if file_type.magic is not None:
            found.setdefault(file_type.content_type, ext)
    return found


EXTENSION_BY_TYPE = _extension_by_type()


def _quiet(_: str) -> None:
    return None


# ── what the plan holds ──────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Source:
    """A published link item that points at a Drive folder: its files take its kind, module and author."""

    module: Module | None
    kind: LibraryKind
    title: str
    url: str
    author_name: str | None
    folder: Ref

    @property
    def segment(self) -> str:
        """The module part of the keys: its id, or NO_MODULE."""
        return self.module.id if self.module else NO_MODULE

    @property
    def label(self) -> str:
        return f"{self.segment} \u00b7 {printable(self.title, 120)}"


def import_key(source: Source, file: DriveFile) -> str:
    """'drive/<module>/<Drive file id>': where an imported item came from, so a rerun skips it."""
    return f"drive/{source.segment}/{file.id}"


@dataclass(frozen=True)
class Planned:
    """A file the plan imports."""

    source: Source
    file: DriveFile
    credential: Credential  # the credentials Drive showed its folder to
    folders: tuple[str, ...]  # the folders below the link's own, down to the file's
    file_name: str  # as Drive shows it, ending in the extension the library serves it by
    file_type: FileType
    export: str | None  # a Google file: the type it is exported as
    limit: int  # bytes
    kind: LibraryKind
    exam_year: int | None = None
    zone: str | None = None

    @property
    def where(self) -> str:
        return SEP.join((*self.folders, self.file_name))

    @property
    def import_key(self) -> str:
        return import_key(self.source, self.file)

    @property
    def storage_key(self) -> str:
        """library/drive/<module>/<Drive file id>/<name>: the name made safe for a key (ASCII letters, digits, '-'
        and '_', one dot, at most 100 characters); the id keeps it unique."""
        return f"library/drive/{self.source.segment}/{self.file.id}/{safe_file_name(self.file_name)}"

    @property
    def title(self) -> str:
        """The name as Drive shows it, without the extension (the library shows the format next to it)."""
        stem = self.file_name.rsplit(".", 1)[0].strip()
        return clip(stem or self.file_name, TITLE_MAX)

    @property
    def description(self) -> str:
        return f"From the Drive folder {SEP.join((printable(self.source.title, 120), *self.folders))}."


@dataclass(frozen=True)
class Skipped:
    source: Source
    where: str
    reason: str
    url: str | None = None  # a file Drive wouldn't hand over: where to open it in Drive


def _skip_line(indent: str, skipped: Skipped, *, segment: bool = True) -> str:
    where = f"{skipped.source.segment}: {skipped.where}" if segment else skipped.where
    link = f" ({printable(skipped.url, 200)})" if skipped.url else ""
    return f"{indent}{where}: {skipped.reason}{link}"


@dataclass(frozen=True)
class Refused:
    """A folder Drive won't show: the link's own (no folders) or one inside it."""

    source: Source
    folders: tuple[str, ...]
    url: str
    why: str  # '404 notFound'


@dataclass
class LinkPlan:
    source: Source
    folder_name: str | None = None  # the folder's own name in Drive
    planned: list[Planned] = field(default_factory=list)
    skipped: list[Skipped] = field(default_factory=list)
    already: int = 0  # files an earlier run imported
    refused: list[Refused] = field(default_factory=list)
    errors: list[Skipped] = field(default_factory=list)  # folders Drive failed to list (other than by refusing)


@dataclass(frozen=True)
class OtherLink:
    """A published link that isn't a Drive folder (a single file, a Google Doc): it stays a link."""

    segment: str
    title: str
    url: str


@dataclass
class Plan:
    links: list[LinkPlan]
    other_links: list[OtherLink]
    limit: int | None = None

    @property
    def planned(self) -> list[Planned]:
        return [p for link in self.links for p in link.planned]

    @property
    def to_import(self) -> list[Planned]:
        """What this run imports: everything planned, or the first `limit`."""
        planned = self.planned
        return planned if self.limit is None else planned[: self.limit]

    @property
    def skipped(self) -> list[Skipped]:
        return [s for link in self.links for s in link.skipped]

    @property
    def refused(self) -> list[Refused]:
        return [r for link in self.links for r in link.refused]

    @property
    def errors(self) -> list[Skipped]:
        return [e for link in self.links for e in link.errors]

    @property
    def already(self) -> int:
        return sum(link.already for link in self.links)


@dataclass
class Report:
    imported: list[Planned] = field(default_factory=list)
    skipped: list[Skipped] = field(default_factory=list)
    failed: list[Skipped] = field(default_factory=list)
    already: int = 0  # imported by another run since the plan was made
    stopped: str | None = None  # why the run ended early


class BucketError(Exception):
    """The bucket refused a file: the next ones would fail the same way, so the run stops."""


class _SkipError(Exception):
    def __init__(self, reason: str, url: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.url = url


# ── names ────────────────────────────────────────────────────────────────────────────────────


def _fit_name(name: str) -> str:
    """At most NAME_MAX characters, the extension kept."""
    if len(name) <= NAME_MAX:
        return name
    stem, dot, ext = name.rpartition(".")
    if not dot or not stem or len(ext) > 10:
        return clip(name, NAME_MAX)
    return f"{clip(stem, NAME_MAX - len(ext) - 1)}.{ext}"


def shown_name(raw: str) -> str:
    """Drive's name as the library shows it: without control or invisible formatting characters, its spaces as Drive
    shows them, at most NAME_MAX characters with the extension kept. Slashes, backslashes and dots stay: it is a name,
    never a path (the storage key gets safe_file_name() of it)."""
    name = "".join(ch for ch in raw if unicodedata.category(ch)[0] != "C")
    return _fit_name(" ".join(name.split())) or "file"


def _with_extension(name: str, ext: str) -> str:
    return name if extension(name) == ext else _fit_name(f"{name}.{ext}")


def _natural(name: str) -> list[str | int]:
    """'Week 2' before 'Week 10'."""
    return [int(part) if part.isascii() and part.isdigit() else part.casefold() for part in re.split(r"([0-9]+)", name)]


def _join(parts: tuple[str, ...], fallback: str) -> str:
    return SEP.join(parts) or fallback


def _size(n: int) -> str:
    if n >= 1024**3:
        return f"{n / 1024**3:.1f} GB"
    if n >= 1024**2:
        return f"{n / 1024**2:.1f} MB"
    if n >= 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n} bytes"


def _mb(limit: int) -> str:
    return f"{limit // (1024 * 1024)} MB"


def _plural(n: int, word: str, words: str | None = None) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {words or word + 's'}"


# ── the plan ─────────────────────────────────────────────────────────────────────────────────


def find_sources(db: Session, module_id: str | None = None) -> tuple[list[Source], list[OtherLink]]:
    """The library's published links (of one module, or all), as Drive folders to read and the other links. A folder
    linked twice from one module is read once."""
    query = (
        select(LibraryItem, Module)
        .outerjoin(Module, Module.id == LibraryItem.module_id)
        .where(LibraryItem.source == ItemSource.link, LibraryItem.status == ItemStatus.published)
        .order_by(Module.year, Module.position, Module.id, LibraryItem.created_at, LibraryItem.title, LibraryItem.id)
    )
    if module_id is not None:
        query = query.where(LibraryItem.module_id == module_id)
    sources: list[Source] = []
    others: list[OtherLink] = []
    seen: set[tuple[str, str]] = set()
    for item, module in db.execute(query).tuples():
        segment = module.id if module else NO_MODULE
        folder = folder_in(item.url or "")
        if folder is None or not MODULE_SEGMENT.fullmatch(segment):
            others.append(OtherLink(segment, item.title, item.url or ""))
            continue
        if (segment, folder.id) in seen:
            continue
        seen.add((segment, folder.id))
        sources.append(Source(module, item.kind, item.title, item.url or "", item.author_name, folder))
    return sources, others


def make_plan(
    db: Session, drive: Drive, *, module_id: str | None = None, limit: int | None = None, echo: Echo = _quiet
) -> Plan:
    """Reads every linked folder (metadata only: nothing is downloaded) and decides what to do with each file.
    DriveFatalError when the credentials or the Cloud project are wrong."""
    sources, others = find_sources(db, module_id)
    done = {key for key in db.scalars(select(LibraryItem.import_key).where(LibraryItem.import_key.is_not(None))) if key}
    seen: set[str] = set()
    links: list[LinkPlan] = []
    if sources:
        echo(f"Reading {_plural(len(sources), 'Drive folder')} linked from the library:")
    for source in sources:
        echo(f"  {source.label}")
        links.append(_plan_link(drive, source, done, seen))
    return Plan(links, others, limit)


def _plan_link(drive: Drive, source: Source, done: set[str], seen: set[str]) -> LinkPlan:
    plan = LinkPlan(source)
    try:
        root, cred = drive.get(source.folder)
    except DriveFatalError:
        raise
    except DriveDeniedError as e:
        plan.refused.append(Refused(source, (), source.url, e.describe()))
        return plan
    except DriveError as e:
        plan.errors.append(Skipped(source, printable(source.title, 120), e.message))
        return plan
    if not root.is_folder:
        plan.errors.append(Skipped(source, printable(source.title, 120), "the link leads to a file, not a folder"))
        return plan
    plan.folder_name = shown_name(root.name)
    upload_limit = limit_bytes(UploadPurpose.library)
    for found in _walk(drive, plan, root.ref, cred):
        _plan_file(plan, found, done, seen, upload_limit)
    return plan


@dataclass(frozen=True)
class _Found:
    file: DriveFile
    folders: tuple[str, ...]
    credential: Credential


def _walk(drive: Drive, plan: LinkPlan, root: Ref, cred: Credential) -> Iterator[_Found]:
    """Every file below the link's folder: a folder's own files, then its subfolders in name order. Shortcuts are
    followed; each folder is read once (a shortcut can point back up), at most MAX_DEPTH folders down."""
    source = plan.source
    stack: list[tuple[Ref, tuple[str, ...], Credential]] = [(root, (), cred)]
    visited = {root.id}
    while stack:
        folder, folders, cred = stack.pop()
        here = _join(folders, printable(source.title, 120))
        try:
            entries, unusable, cred = drive.children(folder, cred)
        except DriveFatalError:
            raise
        except DriveDeniedError as e:
            url = folder_url(folder) if folders else source.url  # the link's own folder: as the library links it
            plan.refused.append(Refused(source, folders, url, e.describe()))
            continue
        except DriveError as e:
            plan.errors.append(Skipped(source, here, e.message))
            continue
        if unusable:
            plan.skipped.append(Skipped(source, here, f"{_plural(unusable, 'entry', 'entries')} Drive described oddly"))
        subfolders: list[tuple[str, Ref]] = []
        for entry in sorted(entries, key=lambda e: _natural(e.name)):
            name = shown_name(entry.name)
            if entry.is_folder:
                subfolders.append((name, entry.ref))
            elif entry.is_shortcut and entry.target is not None and entry.target_mime_type == FOLDER:
                subfolders.append((name, entry.target))
            elif entry.is_shortcut:
                target = _shortcut_target(drive, plan, entry, folders, cred)
                if target is not None:
                    yield target
            else:
                yield _Found(entry, folders, cred)
        if subfolders and len(folders) >= MAX_DEPTH:
            plan.skipped.append(Skipped(source, here, f"its folders are more than {MAX_DEPTH} levels deep"))
            continue
        for name, ref in reversed(subfolders):  # the stack pops the first subfolder next
            if ref.id not in visited:
                visited.add(ref.id)
                stack.append((ref, (*folders, name), cred))


def _shortcut_target(
    drive: Drive, plan: LinkPlan, shortcut: DriveFile, folders: tuple[str, ...], cred: Credential
) -> _Found | None:
    """The file a shortcut points at, with the credentials Drive shows it to; None (and why) when it can't be had."""
    where = SEP.join((*folders, shown_name(shortcut.name)))
    if shortcut.target is None:
        plan.skipped.append(Skipped(plan.source, where, "a shortcut that leads nowhere"))
        return None
    try:
        target, target_cred = drive.get(shortcut.target, cred)
    except DriveFatalError:
        raise
    except DriveError as e:
        plan.skipped.append(Skipped(plan.source, where, f"a shortcut to a file Drive won't show ({e.describe()})"))
        return None
    if target.is_folder or target.is_shortcut:  # the shortcut described it otherwise: never followed further
        plan.skipped.append(Skipped(plan.source, where, "a shortcut Drive described inconsistently"))
        return None
    return _Found(target, folders, target_cred)


def _plan_file(plan: LinkPlan, found: _Found, done: set[str], seen: set[str], upload_limit: int) -> None:
    source, file = plan.source, found.file
    shown = shown_name(file.name)
    where = SEP.join((*found.folders, shown))

    def skip(reason: str, url: str | None = None) -> None:
        plan.skipped.append(Skipped(source, where, reason, url))

    export: str | None = None
    limit = upload_limit
    if file.is_google_file:
        conversion = EXPORTS.get(file.mime_type)
        if conversion is None:
            product = GOOGLE_NAMES.get(file.mime_type.removeprefix(GOOGLE_APPS))
            skip(
                f"the library doesn't take {product} files" if product else "the library doesn't take this Google file"
            )
            return
        export, ext = conversion
        name = _with_extension(shown, ext)
        limit = min(EXPORT_LIMIT, upload_limit)
    else:
        name, ext = shown, extension(shown)
        if ext not in LIBRARY_TYPES:
            by_type = EXTENSION_BY_TYPE.get(media_type(file.mime_type))
            if by_type is None:
                known = re.fullmatch(r"[a-z0-9]{1,10}", ext) is not None
                skip(f"the library doesn't take .{ext} files" if known else "the library can't tell what kind of file")
                return
            name, ext = _with_extension(shown, by_type), by_type
    if file.can_download is False:
        skip(REFUSALS["cannotDownloadFile"], file_url(file.ref))
        return
    if file.size is not None and file.size > limit:
        skip(f"it is over the {_mb(limit)} limit ({_size(file.size)})")
        return
    key = import_key(source, file)
    if key in done:
        plan.already += 1
        return
    if key in seen:  # the same file again in this module: a shortcut, or a folder linked twice
        return
    seen.add(key)
    kind, exam_year, zone = source.kind, None, None
    if source.kind == "past-paper":
        kind, exam_year, zone = exam_kind(shown)
    plan.planned.append(
        Planned(
            source=source,
            file=file,
            credential=found.credential,
            folders=found.folders,
            file_name=name,
            file_type=LIBRARY_TYPES[ext],
            export=export,
            limit=limit,
            kind=kind,
            exam_year=exam_year,
            zone=zone,
        )
    )


def exam_kind(name: str) -> tuple[LibraryKind, int | None, str | None]:
    """A past paper's kind ('examiners-report' when its name says so), exam year and zone, read from its name by
    exam_names.exam_meta_from_name. What the name doesn't say, or says implausibly, stays empty."""
    meta = exam_names.exam_meta_from_name(name)
    year = meta.exam_year
    exam_year = year if isinstance(year, int) and EXAM_YEAR_MIN <= year <= EXAM_YEAR_MAX else None
    zone = meta.zone if meta.zone in ("A", "B") else None
    return ("examiners-report" if meta.examiners_report is True else "past-paper"), exam_year, zone


# ── the run ──────────────────────────────────────────────────────────────────────────────────


def run(
    db: Session,
    drive: Drive,
    storage: Storage,
    plan: Plan,
    report: Report,
    *,
    pace: float = PACE,
    echo: Echo = _quiet,
) -> None:
    """Imports the plan's files, one transaction each, recording each outcome in `report` as it goes, `pace` seconds
    apart (drive.sleep), twice as far apart after each time Google blocked the run. DriveFatalError (a block that
    outlasted the waits included) and BucketError stop it; anything else about one file is that file's outcome."""
    todo = plan.to_import
    downloaded = False
    blocks = 0  # the blocks already answered by slowing down (any while planning count too)
    for n, planned in enumerate(todo, 1):
        step = f"[{n}/{len(todo)}] {planned.source.segment}: {planned.where}"
        if db.scalar(select(LibraryItem.id).where(LibraryItem.import_key == planned.import_key)) is not None:
            report.already += 1
            echo(f"{step}: already in the library")
            continue
        if drive.blocks > blocks:
            blocks = drive.blocks
            pace = min(PACE_MAX, max(pace * 2, 1.0))
            echo(f"Google blocked the requests for a while: {pace:.0f} s between downloads from now on.")
        if downloaded and pace > 0:
            drive.sleep(pace)
        downloaded = True
        try:
            size = _store(drive, storage, planned)
        except _SkipError as s:
            report.skipped.append(Skipped(planned.source, planned.where, s.reason, s.url))
            echo(f"{step}: skipped, {s.reason}" + (f" ({s.url})" if s.url else ""))
            continue
        except DriveFatalError:
            raise
        except DriveError as e:
            reason = f"{e.message} ({e.reason})" if e.reason else e.message
            report.failed.append(Skipped(planned.source, planned.where, reason))
            echo(f"{step}: failed, {reason}")
            continue
        try:
            library.create_imported(
                db,
                planned.source.module,
                kind=planned.kind,
                title=planned.title,
                description=planned.description,
                storage_key=planned.storage_key,
                file_name=planned.file_name,
                size_bytes=size,
                import_key=planned.import_key,
                exam_year=planned.exam_year,
                zone=planned.zone,
                author_name=planned.source.author_name,
            )
            db.commit()
        except (ApiError, IntegrityError) as e:  # another run saved the same file (or a title's slug, three times)
            db.rollback()
            if isinstance(e, IntegrityError) and not clashes_on(e, LibraryItem.import_key):
                raise
            report.failed.append(Skipped(planned.source, planned.where, "it couldn't be saved: run the import again"))
            echo(f"{step}: failed, it couldn't be saved")
            continue
        report.imported.append(planned)
        echo(f"{step}: imported")


def _store(drive: Drive, storage: Storage, planned: Planned) -> int:
    """Downloads the file, checks it (its size as counted, its first bytes against its type) and puts it at its key.
    -> its size. _SkipError when the library can't take it; DriveError when Drive failed."""
    with tempfile.SpooledTemporaryFile(max_size=SPOOL_MAX) as tmp:
        try:
            size, _ = drive.fetch(
                planned.file, tmp, limit=planned.limit, export=planned.export, prefer=planned.credential
            )
        except TooLargeError:
            if planned.export:
                raise _SkipError(REFUSALS["exportSizeLimitExceeded"]) from None
            raise _SkipError(f"it is over the {_mb(planned.limit)} limit") from None
        except DriveFatalError:
            raise
        except DriveError as e:
            url = file_url(planned.file.ref)
            if e.reason in REFUSALS:
                raise _SkipError(f"{REFUSALS[e.reason]} ({e.describe()})", url) from None
            if isinstance(e, DriveDeniedError):
                raise _SkipError(f"Drive refused the download ({e.describe()})", url) from None
            raise
        if size == 0:
            raise _SkipError("it is empty")
        tmp.seek(0)
        if not looks_right(planned.file_type, tmp.read(SNIFF_BYTES)):
            what = extension(planned.file_name)
            raise _SkipError(f"what Drive sent isn't a real .{what} file: its first bytes don't match")
        try:
            storage.put_file(planned.storage_key, tmp, planned.file_type.content_type)
        except ClientError as e:
            raise BucketError(f"The bucket refused a file ({error_code(e) or 'error'}).") from None
        except BotoCoreError as e:
            raise BucketError(f"The bucket couldn't be reached ({type(e).__name__}).") from None
    return size


def record_run(db: Session, plan: Plan, report: Report, *, module_id: str | None, limit: int | None) -> None:
    """One audit entry per real run, the way the other commands run on the server record theirs: no actor, via cli.
    The caller commits."""
    n = len(report.imported)
    audit.record(
        db,
        None,
        "library.import",
        data={
            "via": "cli",
            "from": "google-drive",
            "title": f"{_plural(n, 'file')} from Google Drive",
            "imported": n,
            "skipped": len(plan.skipped) + len(report.skipped),
            "failed": len(report.failed),
            "refusedFiles": [
                {"module": s.source.segment, "file": s.where, "why": s.reason, "link": s.url}
                for s in (*plan.skipped, *report.skipped)
                if s.url
            ],
            "refusedFolders": [
                {"module": r.source.segment, "link": r.source.url, "folder": r.url} for r in plan.refused
            ],
            "module": module_id,
            "limit": limit,
            "stopped": report.stopped,
        },
    )


def import_from_drive(
    db: Session,
    drive: Drive,
    storage: Storage,
    *,
    module_id: str | None = None,
    limit: int | None = None,
    dry_run: bool = False,
    pace: float = PACE,
    confirm: Callable[[str], bool] | None = None,
    echo: Echo = print,
) -> int:
    """The whole command: plan, print the plan, ask (`confirm`, None for --yes), import, audit, report.
    -> the exit status: 0 when done (or nothing to do), 1 when it was declined or stopped, or a file failed."""
    try:
        plan = make_plan(db, drive, module_id=module_id, limit=limit, echo=echo)
    except DriveFatalError as e:
        echo(f"Google refused the import: {e.message} Nothing was imported.")
        return 1
    service_account = drive.service_account
    for line in plan_lines(plan, dry_run=dry_run, service_account=service_account.email if service_account else None):
        echo(line)
    if dry_run or not plan.to_import:
        return 0
    count = _plural(len(plan.to_import), "file")
    if confirm is not None and not confirm(f"Import {count} into the library? [y/N] "):
        echo("Nothing was imported.")
        return 1
    report = Report()
    try:
        run(db, drive, storage, plan, report, pace=pace, echo=echo)
    except (DriveFatalError, BucketError) as e:
        report.stopped = e.message if isinstance(e, DriveFatalError) else str(e)
    except BaseException:
        report.stopped = "interrupted"
        raise
    finally:
        db.rollback()  # whatever a failure left half done: every imported file is committed already
        record_run(db, plan, report, module_id=module_id, limit=limit)
        db.commit()
    for line in report_lines(plan, report):
        echo(line)
    return 1 if report.failed or report.stopped else 0


# ── what it prints ───────────────────────────────────────────────────────────────────────────


def _module_heading(module: Module | None) -> str:
    if module is None:
        return "Links without a module"
    code = f"{module.unit_code} " if module.unit_code else ""
    return f"Year {module.year} \u00b7 {code}{printable(module.name, 120)} ({module.id})"


def _details(planned: Planned) -> str:
    """' (2.1 MB)', ' (Google Docs, as PDF)', ' (0.4 MB; Past paper 2021, zone A)'."""
    parts: list[str] = []
    if planned.export:
        product = GOOGLE_NAMES.get(planned.file.mime_type.removeprefix(GOOGLE_APPS), "Google file")
        parts.append(f"{product}, as {extension(planned.file_name).upper()}")
    elif planned.file.size is not None:
        parts.append(_size(planned.file.size))
    if planned.kind != planned.source.kind or planned.exam_year or planned.zone:
        exam = library.kind_label(planned.kind)
        if planned.exam_year:
            exam += f" {planned.exam_year}"
        if planned.zone:
            exam += f", zone {planned.zone}"
        parts.append(exam)
    return f" ({'; '.join(parts)})" if parts else ""


def _refused_lines(plan: Plan, service_account: str | None) -> list[str]:
    refused = plan.refused
    if not refused:
        return []
    whom = f" or with the service account ({service_account})" if service_account else ""
    lines = [
        "",
        f"Folders Drive refused: {len(refused)}. Share each with \u201canyone with the link\u201d{whom}, then run the "
        "import again. A folder limited to BIBF accounts can't be shared with the import: its files have to be "
        "uploaded by hand.",
    ]
    for r in refused:
        inside = f" \u203a {SEP.join(r.folders)}" if r.folders else ""
        lines.append(f"  {r.source.label}{inside}: {printable(r.url, 200)} ({r.why})")
    return lines


def plan_lines(plan: Plan, *, dry_run: bool, service_account: str | None = None) -> list[str]:
    """The plan as the command prints it: per module and link, what is imported (+), skipped (-), failed to read (!),
    refused (x) and already there (=); then the links that aren't folders, the refused folders and the totals."""
    if not plan.links and not plan.other_links:
        return ["No published library link leads to a Drive folder: load the links first (python -m app.cli seed)."]
    lines: list[str] = []
    heading: str | None = None
    for link in plan.links:
        module_heading = _module_heading(link.source.module)
        if module_heading != heading:
            heading = module_heading
            lines += ["", module_heading]
        named = f", \u201c{printable(link.folder_name, 120)}\u201d in Drive" if link.folder_name else ""
        lines.append(f"  {printable(link.source.title, 120)}{named}: {printable(link.source.url, 200)}")
        lines += [f"    + {p.where}{_details(p)}" for p in link.planned]
        lines += [_skip_line("    - ", s, segment=False) for s in link.skipped]
        lines += [f"    ! {e.where}: {e.reason}" for e in link.errors]
        for r in link.refused:
            where = SEP.join(r.folders) or "the folder"
            lines.append(f"    x {where}: Drive refused it ({r.why})")
        if link.already:
            lines.append(f"    = {link.already} already in the library")
    if plan.other_links:
        lines += ["", f"Links that aren't Drive folders stay links: {len(plan.other_links)}"]
        lines += [f"  {o.segment} \u00b7 {printable(o.title, 120)}: {printable(o.url, 200)}" for o in plan.other_links]
    lines += _refused_lines(plan, service_account)

    planned, todo = plan.planned, plan.to_import
    measured = sum(p.file.size or 0 for p in planned if not p.export)
    google = sum(1 for p in planned if p.export)
    size = f"{_size(measured)} as Drive measures them" + (f", plus {_plural(google, 'Google file')}" if google else "")
    totals = f"To import: {_plural(len(planned), 'file')} ({size}). Skipped: {len(plan.skipped)}."
    totals += f" Already in the library: {plan.already}."
    if plan.refused:
        totals += f" Folders refused: {len(plan.refused)}."
    if plan.errors:
        totals += f" Folders Drive failed to list: {len(plan.errors)}."
    lines += ["", totals]
    if len(todo) < len(planned):
        lines.append(f"This run imports the first {len(todo)} (--limit); run the import again for the rest.")
    if dry_run:
        lines.append("Dry run: nothing was imported.")
    elif not planned:
        lines.append("Nothing to import.")
    return lines


def report_lines(plan: Plan, report: Report) -> list[str]:
    """What a real run did, with the refused folders again at the end (their module and link)."""
    lines = [
        "",
        f"Imported {_plural(len(report.imported), 'file')} into the library. Skipped: {len(report.skipped)}. "
        f"Failed: {len(report.failed)}.",
    ]
    if report.already:
        lines.append(f"{report.already} had been imported by another run meanwhile.")
    if report.skipped:
        lines.append("Skipped:")
        lines += [_skip_line("  ", s) for s in report.skipped]
        lines.append("Skipped files stay out of the library; their folders' links stay. The next run tries them again.")
    if report.failed:
        lines.append("Failed (run the import again to try them again):")
        lines += [_skip_line("  ", s) for s in report.failed]
    if report.stopped:
        lines.append(f"The import stopped early: {report.stopped} Run it again: it carries on where it stopped.")
    left = len(plan.planned) - len(plan.to_import)
    if left and not report.stopped:
        lines.append(f"{_plural(left, 'file')} {'waits' if left == 1 else 'wait'} for the next run (--limit).")
    lines += _refused_lines(plan, None)
    return lines
