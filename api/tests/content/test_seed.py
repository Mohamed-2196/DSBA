"""The seed loader. Expectations come from the seed files themselves: a rep's request to add a date or fix a title
changes the data, never these tests. What is tested is how the files are loaded: once,
completely, and never over what moderators changed since."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any, get_args

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    BoardCard,
    CalendarEvent,
    Chapter,
    ContentDoc,
    DailyGuessWord,
    DailyItem,
    DailyTheme,
    DriveFolder,
    IssueStatus,
    ItemSource,
    ItemStatus,
    Lesson,
    LibraryItem,
    Module,
    NewsletterIssue,
    Note,
    User,
)
from app.schemas.calendar import EventType
from app.schemas.career import CareerDoc
from app.schemas.newsletter import IssueCover, IssueSection
from app.seed.loader import (
    BROKEN_CHAPTERS,
    RETIRED_FOLDERS,
    daily_guess_words,
    load_all,
    load_daily,
    module_folders,
    read,
    seed_issue,
)
from tests.content.conftest import API

Clients = Callable[..., TestClient]


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def expected_folders() -> int:
    return sum(len(list(module_folders(m))) for m in read("modules"))


def first_load(db: Session) -> dict[str, int]:
    report = load_all(db)
    db.commit()
    return report


# ── the files ────────────────────────────────────────────────────────────────────────────────


def test_the_seed_files_hold_together() -> None:
    """What the loader relies on, checked on the files (no database)."""
    modules = read("modules")
    module_ids = [m["id"] for m in modules]
    assert len(set(module_ids)) == len(module_ids)
    assert all(m["year"] in (1, 2, 3) for m in modules)

    events = read("calendar")
    event_ids = [e["id"] for e in events]
    assert len(set(event_ids)) == len(event_ids)
    for e in events:
        assert e["type"] in get_args(EventType), e["id"]
        assert e.get("moduleId") in (None, *module_ids), e["id"]
        start = dt.date.fromisoformat(e["date"])
        assert e.get("endDate") is None or dt.date.fromisoformat(e["endDate"]) >= start, e["id"]

    issues = read("newsletter")
    assert len({i["slug"] for i in issues}) == len(issues)
    for raw in issues:
        body = seed_issue(raw)  # fits the API's schema (raises if not)
        assert [s.id for s in body.sections] == [s["id"] for s in raw["sections"]]

    career = CareerDoc.model_validate(read("career"))
    assert set(career.module_refs()) <= set(module_ids)


def test_module_folders_rules() -> None:
    """How a module's resources become the Drive folders the import reads (synthetic modules: the rules)."""
    module: dict[str, Any] = {
        "id": "some-module",
        "name": "Some Module",
        "unitCode": "AB1234",
        "resources": {
            "materials": "https://drive.example.com/materials",
            "exercises": "https://drive.example.com/exercises",
            "exercisesNote": "Weekly problem sets.",
            "vle": "https://drive.example.com/papers",
            "olderExams": "https://drive.example.com/papers",
            "cheatSheet": "http://insecure.example.com/sheet",
        },
        "notes": [
            {"name": "\U0001f9fd\U0001f34d Patrick: Business Edition", "url": "https://drive.example.com/patrick"},
            {"name": "Mahdi", "author": "Mahdi", "url": "https://drive.example.com/mahdi"},
            {"name": "Revision pack", "author": "Sara", "url": "https://drive.example.com/pack"},
            {"name": "Same folder again", "url": "https://drive.example.com/materials"},
            {"name": "", "url": "https://drive.example.com/nameless"},
            {"name": "No link"},
        ],
    }
    folders = list(module_folders(module))
    assert [(f.kind, f.title, f.url.rsplit("/", 1)[1], f.author_name) for f in folders] == [
        ("course-materials", "Course materials", "materials", None),
        ("exercises", "Exercises", "exercises", None),
        ("past-paper", "VLE and older exams", "papers", None),  # one folder for both: read once
        ("notes", "Patrick: Business Edition", "patrick", None),  # emoji dropped
        ("notes", "Mahdi's notes", "mahdi", "Mahdi"),
        ("notes", "Revision pack", "pack", "Sara"),
    ]  # http:// and repeated links are left out, and notes without a name or a link

    module["resources"] = {
        "vle": "https://a.example.com/vle",
        "olderExams": "https://a.example.com/old",
        "exercises": "https://a.example.com/x",
    }
    assert [(f.kind, f.title) for f in module_folders({**module, "notes": []})] == [
        ("exercises", "Exercises"),
        ("vle-materials", "VLE materials"),
        ("past-paper", "Past exams"),
    ]


# ── loading ──────────────────────────────────────────────────────────────────────────────────


def test_seed_loads_everything_once(db: Session) -> None:
    files = {name: len(read(name)) for name in ("modules", "calendar", "newsletter")}
    folders = expected_folders()
    themes = len(read("daily/themes"))
    daily = themes + len(daily_guess_words())
    assert first_load(db) == {
        **files,
        "broken-chapters": 0,
        "chapter-words": 0,  # the modules arrive with their words
        "career": 1,
        "drive-folders": folders,
        "retired-folders": 0,
        "home-blocks": 0,
        "daily": daily,
        "paper-questions": 0,  # the library is empty until the import
        "report-answers": 0,  # and has no examiners' reports yet
    }
    totals = (count(db, Module), count(db, CalendarEvent), count(db, NewsletterIssue), count(db, ContentDoc))
    assert totals == (files["modules"], files["calendar"], files["newsletter"], 1)
    assert (count(db, DriveFolder), count(db, LibraryItem)) == (folders, 0)  # the library holds no Drive links
    # Daily: the themes, out of the rotation until they have puzzles, and the guess list; no puzzles (they're kept
    # out of the repository)
    assert (count(db, DailyTheme), count(db, DailyGuessWord), count(db, DailyItem)) == (
        themes,
        len(daily_guess_words()),
        0,
    )
    assert not db.scalar(select(func.count()).select_from(DailyTheme).where(DailyTheme.in_rotation))

    # run it again: nothing is added, and the modules stay as they are
    again = load_all(db)
    db.commit()
    assert again == {
        "modules": 0,
        "broken-chapters": 0,
        "chapter-words": 0,
        "calendar": 0,
        "newsletter": 0,
        "career": 0,
        "drive-folders": 0,
        "retired-folders": 0,
        "home-blocks": 0,
        "daily": 0,
        "paper-questions": 0,
        "report-answers": 0,
    }
    assert (count(db, CalendarEvent), count(db, NewsletterIssue), count(db, DriveFolder)) == (
        files["calendar"],
        files["newsletter"],
        folders,
    )


def test_the_seed_fills_a_short_guess_list_and_leaves_a_full_one_as_editors_keep_it(db: Session) -> None:
    """A Daily whose content file came first holds that file's answers only, and the word game refuses everyday
    guesses: the next seed adds the shipped list. Words editors took off a full list stay off."""
    shipped = daily_guess_words()
    db.add_all(DailyGuessWord(word=w) for w in ("BLORP", shipped[0]))  # the file's own answer, and a dictionary word
    db.commit()
    assert load_daily(db) == len(read("daily/themes")) + len(shipped) - 1
    db.commit()
    assert count(db, DailyGuessWord) == len(shipped) + 1

    db.execute(delete(DailyGuessWord).where(DailyGuessWord.word.in_(shipped[:3])))  # an editor took three off
    db.commit()
    assert load_daily(db) == 0
    assert count(db, DailyGuessWord) == len(shipped) - 2


def test_seeded_content_is_what_the_files_say(db: Session) -> None:
    first_load(db)

    # calendar: every date as written
    events = {e.id: e for e in db.scalars(select(CalendarEvent))}
    for e in read("calendar"):
        row = events[e["id"]]
        assert (row.date.isoformat(), row.end_date.isoformat() if row.end_date else None) == (
            e["date"],
            e.get("endDate"),
        )
        assert (row.title, row.type, row.year, row.time, row.place) == (
            e["title"],
            e["type"],
            e.get("year"),
            e.get("time"),
            e.get("place"),
        )
        assert (row.module_id, row.unit_code, row.sample) == (
            e.get("moduleId"),
            e.get("unitCode"),
            bool(e.get("sample")),
        )

    # newsletter: drafts in the API's shape
    issues = {i.slug: i for i in db.scalars(select(NewsletterIssue))}
    for raw in read("newsletter"):
        issue = issues[raw["slug"]]
        assert (issue.status, issue.published_at, issue.created_by) == (IssueStatus.draft, None, None)
        assert (issue.title, issue.number, issue.date.isoformat()) == (raw["title"], raw["number"], raw["date"])
        assert (issue.dek, issue.summary) == (raw.get("dek") or "", raw.get("summary") or "")
        assert issue.editors == raw["editors"]
        assert [s["id"] for s in issue.sections] == [s["id"] for s in raw["sections"]]
        assert all(IssueSection.model_validate(s) for s in issue.sections)
        assert IssueCover.model_validate(issue.cover)

    # career: the document, stored in the API's shape
    career = db.get(ContentDoc, "career")
    assert career is not None
    assert career.data == CareerDoc.model_validate(read("career")).model_dump(mode="json", by_alias=True)

    # Drive folders: one per module resource and shared notes, for the import only
    rows = {(f.module_id, f.url): f for f in db.scalars(select(DriveFolder))}
    for spec in read("modules"):
        for folder in module_folders(spec):
            folder_row = rows[(spec["id"], folder.url)]
            expected = (folder.kind, folder.title, folder.author_name)
            assert (folder_row.kind, folder_row.title, folder_row.author_name) == expected


def test_seed_keeps_what_moderators_changed(db: Session, client_for: Clients, make_user: Callable[..., User]) -> None:
    first_load(db)
    rep = client_for(make_user(name="Rep", roles=("student", "rep")))
    events = [e["id"] for e in read("calendar")]
    edited_event, deleted_event = events[0], events[1]
    slugs = [i["slug"] for i in read("newsletter")]
    assert len(slugs) >= 2, "this test edits one seeded issue and deletes another"
    edited_issue, deleted_issue = slugs[0], slugs[1]

    # edit and delete calendar dates; edit and delete issues
    assert rep.patch(f"{API}/calendar/events/{edited_event}", json={"place": "Hall 2"}).status_code == 200
    assert rep.delete(f"{API}/calendar/events/{deleted_event}").status_code == 204
    issue_ids = {i.slug: i.id for i in db.scalars(select(NewsletterIssue))}
    assert rep.delete(f"{API}/newsletter/issues/{issue_ids[deleted_issue]}").status_code == 204
    r = rep.patch(f"{API}/newsletter/issues/{issue_ids[edited_issue]}", json={"editors": ["Real Editor"]})
    assert r.status_code == 200
    career = {**read("career"), "checkedOn": "1 January 2027"}
    admin = client_for(make_user(name="Admin", roles=("student", "admin")))
    assert admin.put(f"{API}/career", json={"version": 1, "data": career}).status_code == 200

    again = load_all(db)
    db.commit()
    assert again == {
        "modules": 0,
        "broken-chapters": 0,
        "chapter-words": 0,
        "calendar": 0,
        "newsletter": 0,
        "career": 0,
        "drive-folders": 0,
        "retired-folders": 0,
        "home-blocks": 0,
        "daily": 0,
        "paper-questions": 0,
        "report-answers": 0,
    }
    edited = db.get(CalendarEvent, edited_event)
    assert edited is not None
    assert edited.place == "Hall 2"
    assert db.get(CalendarEvent, deleted_event) is None
    assert db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == deleted_issue)) is None
    kept = db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == edited_issue))
    assert kept is not None
    db.refresh(kept)
    assert kept.editors == ["Real Editor"]
    doc = db.get(ContentDoc, "career")
    assert doc is not None
    db.refresh(doc)
    assert doc.data["checkedOn"] == "1 January 2027"


def test_the_seeded_library_is_empty_until_the_import(db: Session, client_for: Clients) -> None:
    """The seed gives the import its folders; students get files, never a link to Drive."""
    first_load(db)
    guest = client_for()
    assert guest.get(f"{API}/library/items", params={"limit": 100}).json()["items"] == []
    assert guest.get(f"{API}/library/facets").json()["total"] == 0
    assert guest.get(f"{API}/newsletter/issues").json() == []  # drafts until a moderator publishes them


def test_the_seed_removes_a_broken_chapter_and_moves_students_notes_and_cards_to_its_stand_in(
    db: Session, client_for: Clients, make_user: Callable[..., User], set_feature: Callable[..., None]
) -> None:
    files = read("modules")
    assert not any(c["id"] in BROKEN_CHAPTERS for m in files for c in m.get("chapters") or [])
    for m in files:  # no chapter twice in a module, no half-downloaded lesson
        titles = [c["title"] for c in m.get("chapters") or []]
        assert len(titles) == len(set(titles)), m["id"]
        assert not any(".crdownload" in (v.get("title") or "") for c in m.get("chapters") or [] for v in c["videos"])
    first_load(db)

    # an install seeded before: MN1178's second "International Project Management" is there, with notes and cards
    module = next(m for m in db.scalars(select(Module)) if m.unit_code == "MN1178")
    good = db.get(Lesson, "me34n26c")
    assert good is not None
    assert good.chapter_id == "p96a6t6q"
    module.chapters.append(
        Chapter(
            id="fjdyedyg",
            title="International Project Management",
            position=len(module.chapters),
            lessons=[Lesson(id="6z8mmrtu", module_id=module.id, kind="youtube", video_id="AQwveBtsuyI", position=0)],
        )
    )
    version = module.version
    db.commit()
    set_feature("notes", "everyone")
    set_feature("board", "everyone")
    me, them = client_for(make_user()), client_for(make_user())
    note = me.post(f"{API}/notes", json={"title": "IPM", "moduleId": module.id, "lessonId": "6z8mmrtu"})
    assert note.status_code == 201, note.text
    broken = {"link": {"type": "lesson", "id": "6z8mmrtu"}}
    assert me.post(f"{API}/board-cards", json=broken).status_code == 201
    assert them.post(f"{API}/board-cards", json={"link": {"type": "lesson", "id": "me34n26c"}}).status_code == 201
    assert them.post(f"{API}/board-cards", json=broken).status_code == 201  # holds both: this one goes

    assert load_all(db, only="broken-chapters") == {"broken-chapters": 1}
    db.commit()
    db.expire_all()
    assert db.get(Chapter, "fjdyedyg") is None
    assert db.get(Lesson, "6z8mmrtu") is None
    saved = db.get(Note, uuid.UUID(note.json()["id"]))
    assert saved is not None
    assert saved.lesson_id == "me34n26c"
    cards = db.scalars(select(BoardCard.lesson_id).where(BoardCard.lesson_id.is_not(None))).all()
    assert list(cards) == ["me34n26c", "me34n26c"]
    db.refresh(module)
    assert [c.position for c in module.chapters] == list(range(len(module.chapters)))
    assert module.version == version + 1
    assert [c.title for c in module.chapters].count("International Project Management") == 1
    assert load_all(db, only="broken-chapters") == {"broken-chapters": 0}  # once


def test_the_seeds_chapter_words_reach_a_catalogue_loaded_before_them(db: Session) -> None:
    """IDEA-50: a chapter without words gets the seed's; one a content manager gave words keeps them."""
    from app.models import Chapter
    from app.seed.loader import load_chapter_words, load_modules

    load_modules(db)
    for c in db.scalars(select(Chapter)):
        c.keywords = []
    edited = db.get(Chapter, "hhfxb62g")
    assert edited is not None
    edited.keywords = ["estimators"]
    db.commit()
    assert load_chapter_words(db) > 0
    db.commit()
    point = db.get(Chapter, "dzzxifwd")
    assert point is not None
    assert "mle" in point.keywords
    assert edited.keywords == ["estimators"]
    assert load_chapter_words(db) == 0


def test_the_seed_removes_a_retired_folder_and_the_files_it_brought(db: Session, client_for: Clients) -> None:
    """MT1186's topic workbooks: the folder is out of the seed files, and a database that has it loses it and its
    files; files from other folders stay."""
    assert not any((m["id"], f.url) in RETIRED_FOLDERS for m in read("modules") for f in module_folders(m))
    first_load(db)
    ((module_id, url),) = RETIRED_FOLDERS
    retired = DriveFolder(module_id=module_id, kind="exercises", title="Exercises", url=url)
    kept = db.scalar(select(DriveFolder).where(DriveFolder.module_id == module_id))
    assert kept is not None
    db.add(retired)
    db.flush()

    def imported(folder: DriveFolder, title: str) -> LibraryItem:
        item = LibraryItem(
            slug=f"f-{uuid.uuid4().hex[:8]}",
            source=ItemSource.file,
            kind=folder.kind,
            title=title,
            module_id=module_id,
            storage_key=f"library/{uuid.uuid4()}/f.pdf",
            file_name="f.pdf",
            content_type="application/pdf",
            size_bytes=8,
            status=ItemStatus.published,
            import_key=f"drive/{module_id}/{uuid.uuid4().hex}",
            drive_folder_id=folder.id,
        )
        db.add(item)
        return item

    workbooks = [imported(retired, f"{n}. Topic - workbook") for n in (1, 2)]
    other = imported(kept, "Course outline")
    db.commit()
    assert {i["title"] for i in client_for().get(f"{API}/library/items").json()["items"]} >= {"1. Topic - workbook"}

    assert load_all(db, only="retired-folders") == {"retired-folders": 2}
    db.commit()
    db.expire_all()
    assert [i.status for i in workbooks] == [ItemStatus.removed, ItemStatus.removed]
    assert all(i.import_key for i in workbooks)  # the import never brings them back
    assert other.status == ItemStatus.published
    assert db.scalar(select(DriveFolder).where(DriveFolder.url == url)) is None
    assert [i["title"] for i in client_for().get(f"{API}/library/items").json()["items"]] == ["Course outline"]
    assert load_all(db, only="retired-folders") == {"retired-folders": 0}  # once


def test_the_seed_takes_blocks_home_no_longer_has_out_of_saved_site_settings(db: Session) -> None:
    first_load(db)
    data = dict(read("site"))
    data["homeBlocks"] = ["gone_block", *data["homeBlocks"]]
    db.add(ContentDoc(key="site", data=data, version=3))
    db.commit()
    assert load_all(db, only="home-blocks") == {"home-blocks": 1}
    db.commit()
    row = db.get(ContentDoc, "site")
    assert row is not None
    db.refresh(row)
    assert (row.data["homeBlocks"], row.version) == (read("site")["homeBlocks"], 4)
    assert load_all(db, only="home-blocks") == {"home-blocks": 0}
