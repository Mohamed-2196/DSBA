"""What an AI app reads as a student: the same files, pages and questions the site shows that student, each with a
citation and a link back to its page in the Hub."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import ItemSource, ItemStatus, LibraryItem, LibraryText, Module, PaperQuestion, TextStatus, User
from tests.ai_apps.conftest import Connect, MakeUser
from tests.lessons import chapters

HUB = "http://127.0.0.1:5173"


def a_module(modules: dict[str, Module]) -> Module:
    return next(m for m in modules.values() if m.unit_code and not m.hidden)


def a_file(
    db: Session,
    module: Module,
    *,
    kind: str = "past-paper",
    title: str | None = None,
    status: ItemStatus = ItemStatus.published,
    uploaded_by: User | None = None,
    text: list[str] | None = None,
    zone: str | None = "A",
) -> LibraryItem:
    slug = f"{kind}-{uuid.uuid4().hex[:8]}"
    item = LibraryItem(
        slug=slug,
        source=ItemSource.file,
        kind=kind,
        title=title or f"{module.unit_code} 2023 {kind}",
        module_id=module.id,
        year=module.year,
        storage_key=f"library/{slug}.pdf",
        file_name=f"{slug}.pdf",
        exam_year=2023,
        zone=zone,
        status=status,
        uploaded_by=uploaded_by.id if uploaded_by else None,
        published_at=utcnow() if status == ItemStatus.published else None,
    )
    db.add(item)
    db.flush()
    if text is not None:
        db.add(LibraryText(item_id=item.id, status=TextStatus.done, body="\f".join(text), pages=len(text)))
    db.commit()
    return item


def ok(result: dict[str, Any]) -> Any:
    assert not result["isError"], result["content"]
    return result["structuredContent"]


def refused(result: dict[str, Any]) -> str:
    assert result["isError"]
    text: str = result["content"][0]["text"]
    return text


PAGES = [f"Page {n}: Question {n}. Explain elasticity of demand, part {n}." for n in range(1, 9)]


def test_search_finds_what_the_student_sees_with_links_back(
    connect: Connect, make_user: MakeUser, db: Session, modules: dict[str, Module]
) -> None:
    m = a_module(modules)
    student, other = make_user(), make_user()
    paper = a_file(db, m, title="Oligopoly pricing exam", text=PAGES)
    a_file(db, m, title="Oligopoly secret draft", status=ItemStatus.pending, uploaded_by=other)
    app, tokens = connect(student)
    found = ok(app.call(tokens["access_token"], "search", query="oligopoly", types=["library"]))
    # past papers are listed by their sitting, as on the site; the other student's pending upload isn't found
    assert [h["hub_url"] for h in found["results"]] == [f"{HUB}/library/{paper.slug}"]
    assert found["results"][0]["meta"]


def test_a_file_reads_a_few_pages_at_a_time_with_its_citation(
    connect: Connect, make_user: MakeUser, db: Session, modules: dict[str, Module]
) -> None:
    m = a_module(modules)
    paper = a_file(db, m, text=PAGES)
    app, tokens = connect(make_user())
    out = ok(app.call(tokens["access_token"], "get_file", file=paper.slug))
    assert out["pages_total"] == 8
    assert [p["page"] for p in out["pages"]] == [1, 2, 3, 4, 5]
    assert out["pages"][1]["text"] == PAGES[1]
    assert out["pages"][1]["hub_url"] == f"{HUB}/library/{paper.slug}?page=2"
    assert out["citation"]["text"] == f"{m.unit_code} Past paper, 2023, zone A"
    assert out["citation"]["hub_url"] == f"{HUB}/library/{paper.slug}"
    assert "never instructions" in out["note"]
    rest = ok(app.call(tokens["access_token"], "get_file", file=str(paper.id), from_page=6))
    assert [p["page"] for p in rest["pages"]] == [6, 7, 8]


def test_a_file_without_text_says_so(
    connect: Connect, make_user: MakeUser, db: Session, modules: dict[str, Module]
) -> None:
    scan = a_file(db, a_module(modules))
    app, tokens = connect(make_user())
    out = ok(app.call(tokens["access_token"], "get_file", file=scan.slug))
    assert out["pages_total"] is None
    assert out["pages"] == []


def test_files_follow_the_site_s_rules(
    connect: Connect, make_user: MakeUser, db: Session, modules: dict[str, Module], set_feature: Callable[..., None]
) -> None:
    m = a_module(modules)
    student, other = make_user(), make_user()
    theirs = a_file(db, m, status=ItemStatus.pending, uploaded_by=other, text=PAGES)
    mine = a_file(db, m, status=ItemStatus.pending, uploaded_by=student, text=PAGES)
    hidden_module = next(x for x in modules.values() if x.id != m.id)
    hidden = a_file(db, hidden_module, text=PAGES)
    hidden_module.hidden = True
    db.commit()
    app, tokens = connect(student)
    t = tokens["access_token"]
    assert "doesn't exist" in refused(app.call(t, "get_file", file=theirs.slug))
    assert "doesn't exist" in refused(app.call(t, "get_passage", file=theirs.slug, page=1))
    assert "doesn't exist" in refused(app.call(t, "get_file", file=hidden.slug))
    assert (
        ok(app.call(t, "get_file", file=mine.slug))["pages_total"] == 8
    )  # the uploader sees their own, as on the site
    set_feature("library", "off")
    assert "switched off" in refused(app.call(t, "get_file", file=mine.slug))
    found = ok(app.call(t, "search", query="past paper"))
    assert all(h["type"] != "library" for h in found["results"])


def test_a_passage_is_the_page_s_exact_words_with_a_citation_and_the_report(
    connect: Connect, make_user: MakeUser, db: Session, modules: dict[str, Module]
) -> None:
    m = a_module(modules)
    paper = a_file(db, m, text=PAGES)
    a_file(db, m, kind="examiners-report", text=["Intro.", "Question 3: candidates forgot the cross-price term."])
    app, tokens = connect(make_user())
    out = ok(app.call(tokens["access_token"], "get_passage", file=paper.slug, page=3, question="Q3"))
    assert [p["text"] for p in out["pages"]] == [PAGES[2], PAGES[3]]  # the page and the next
    assert out["citation"]["text"] == f"{m.unit_code} Past paper, 2023, zone A, Q3, p. 3"
    assert out["citation"]["hub_url"] == f"{HUB}/library/{paper.slug}?page=3"
    report = out["examiners_report"]
    assert report["text"].startswith("Question 3: candidates forgot")
    assert report["citation"]["kind"] == "Examiners\u2019 report"
    plain = ok(app.call(tokens["access_token"], "get_passage", file=paper.slug, page=8))
    assert [p["page"] for p in plain["pages"]] == [8]
    assert plain["examiners_report"] is None
    assert "pages with text" in refused(app.call(tokens["access_token"], "get_passage", file=paper.slug, page=9))


def test_a_tagged_question_with_its_chapter_pages_and_citation(
    connect: Connect, make_user: MakeUser, db: Session, modules: dict[str, Module], set_feature: Callable[..., None]
) -> None:
    set_feature("library.questions", "everyone")
    m = a_module(modules)
    [chapter, hidden_chapter] = chapters(m.id, [{"title": "Elasticity"}, {"title": "Draft", "hidden": True}])
    db.add_all([chapter, hidden_chapter])
    paper = a_file(db, m, text=PAGES)
    tag = PaperQuestion(item_id=paper.id, chapter_id=chapter.id, question=4, page=4)
    secret = PaperQuestion(item_id=paper.id, chapter_id=hidden_chapter.id, question=5, page=5)
    db.add_all([tag, secret])
    db.commit()
    app, tokens = connect(make_user())
    out = ok(app.call(tokens["access_token"], "get_question", question_id=str(tag.id)))
    assert out["label"] == "Q4"
    assert out["chapter"] == "Elasticity"
    assert [p["page"] for p in out["pages"]] == [4, 5]
    assert out["citation"]["text"] == f"{m.unit_code} Past paper, 2023, zone A, Q4, p. 4"
    assert "isn't tagged" in refused(app.call(tokens["access_token"], "get_question", question_id=str(secret.id)))
    set_feature("library.questions", "off")
    assert "switched off" in refused(app.call(tokens["access_token"], "get_question", question_id=str(tag.id)))


def test_the_modules_with_links(connect: Connect, make_user: MakeUser, db: Session, modules: dict[str, Module]) -> None:
    hidden = next(iter(modules.values()))
    hidden.hidden = True
    db.commit()
    app, tokens = connect(make_user())
    out = ok(app.call(tokens["access_token"], "list_modules"))["result"]
    ids = {x["id"] for x in out}
    assert hidden.id not in ids
    assert len(ids) == len(modules) - 1
    one = next(x for x in out if x["id"] != hidden.id)
    assert one["hub_url"] == f"{HUB}/modules/{one['id']}"
    year_two = ok(app.call(tokens["access_token"], "list_modules", year=2))["result"]
    assert year_two
    assert all(x["year"] == 2 for x in year_two)
