"""Rate my CV (app/services/career_cv.py, routers/career_cv.py): a student uploads a CV, it is rated against a role and
kept for them alone; they rate it for another role, open it and delete it."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CvReview, Upload, User
from app.seed.loader import load_career
from app.services import accounts
from tests.content.pdfs import make_docx, make_pdf

API = "/api/v1"
CVS = f"{API}/career/cvs"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
Clients = Callable[..., TestClient]

CV = [
    "Sara Ahmed",
    "sara.ahmed@example.com | +973 3300 0000 | linkedin.com/in/sara-example",
    "Education",
    "BSc Data Science and Business Analytics, Sep 2024 \u2013 Jun 2027",
    "Experience",
    "• Built a Power BI dashboard that cut monthly report time by 30%",
    "• Cleaned 12,000 rows of customer records with Python and pandas",
    "Projects",
    "• Analysed 3 years of sales with SQL and forecast demand within 5%",
    "Skills",
    "SQL, Python, Excel, Power BI",
]


@pytest.fixture
def career_doc(db: Session) -> None:
    load_career(db)
    db.commit()


def upload_cv(upload_file: Callable[..., dict[str, Any]], client: TestClient, lines: list[str] = CV) -> str:
    up = upload_file(client, purpose="cv", name="Sara CV.docx", content_type=DOCX, body=make_docx(lines))
    return str(up["uploadId"])


def test_a_student_rates_a_cv_keeps_it_and_rates_it_for_another_role(
    career_doc: None, client_for: Clients, make_user: Callable[..., User], upload_file: Callable[..., dict[str, Any]]
) -> None:
    sara = client_for(make_user())
    r = sara.post(CVS, json={"uploadId": upload_cv(upload_file, sara), "roleId": "data-analyst"})
    assert r.status_code == 201, r.text
    cv = r.json()
    assert cv["fileName"] == "Sara CV.docx"
    assert 0 < cv["score"] <= 100
    assert cv["score"] == sum(c["earned"] for c in cv["checks"])
    assert {c["id"] for c in cv["checks"]} >= {"contact", "sections", "verbs", "numbers"}
    assert cv["fit"]["roleId"] == "data-analyst"
    assert {"sql", "excel", "programming", "bi"} <= {s["id"] for s in cv["fit"]["found"]}
    missing = {s["id"]: s for s in cv["fit"]["missing"]}
    assert "ml" in missing
    assert missing["ml"]["modules"]

    listed = sara.get(CVS).json()
    assert [c["id"] for c in listed] == [cv["id"]]

    again = sara.post(f"{CVS}/{cv['id']}/rate", json={"roleId": "risk-analyst"})
    assert again.status_code == 200, again.text
    assert again.json()["fit"]["roleId"] == "risk-analyst"
    assert again.json()["score"] == cv["score"]  # the CV itself didn't change

    link = sara.get(f"{CVS}/{cv['id']}/file")
    assert link.status_code == 200
    assert link.json()["url"].startswith("http")


def test_a_cv_is_its_owners_alone(
    career_doc: None, client_for: Clients, make_user: Callable[..., User], upload_file: Callable[..., dict[str, Any]]
) -> None:
    sara, ali = client_for(make_user()), client_for(make_user())
    upload_id = upload_cv(upload_file, sara)
    assert ali.post(CVS, json={"uploadId": upload_id, "roleId": "data-analyst"}).status_code == 404
    cv = sara.post(CVS, json={"uploadId": upload_id, "roleId": "data-analyst"}).json()
    assert ali.get(CVS).json() == []
    assert ali.get(f"{CVS}/{cv['id']}/file").status_code == 404
    assert ali.post(f"{CVS}/{cv['id']}/rate", json={"roleId": "data-analyst"}).status_code == 404
    assert ali.delete(f"{CVS}/{cv['id']}").status_code == 404
    assert client_for().get(CVS).status_code == 401


def test_a_rated_upload_isnt_rated_twice_and_an_unknown_role_is_refused(
    career_doc: None, client_for: Clients, make_user: Callable[..., User], upload_file: Callable[..., dict[str, Any]]
) -> None:
    sara = client_for(make_user())
    upload_id = upload_cv(upload_file, sara)
    bad = sara.post(CVS, json={"uploadId": upload_id, "roleId": "astronaut"})
    assert bad.status_code == 422
    assert "roleId" in bad.json()["error"]["fields"]
    assert sara.post(CVS, json={"uploadId": upload_id, "roleId": "data-analyst"}).status_code == 201
    twice = sara.post(CVS, json={"uploadId": upload_id, "roleId": "data-analyst"})
    assert (twice.status_code, twice.json()["error"]["code"]) == (409, "not_uploaded")


def test_a_cv_without_text_is_refused_with_what_to_do(
    career_doc: None, client_for: Clients, make_user: Callable[..., User], upload_file: Callable[..., dict[str, Any]]
) -> None:
    sara = client_for(make_user())
    scan = upload_file(sara, purpose="cv", name="scan.pdf", content_type="application/pdf", body=make_pdf([""]))
    r = sara.post(CVS, json={"uploadId": scan["uploadId"], "roleId": "data-analyst"})
    assert r.status_code == 422
    assert "scanned picture" in r.json()["error"]["fields"]["uploadId"]


def test_only_pdf_and_word_files_go_up_as_a_cv(client_for: Clients, make_user: Callable[..., User]) -> None:
    sara = client_for(make_user())
    r = sara.post(
        f"{API}/uploads", json={"purpose": "cv", "fileName": "cv.png", "contentType": "image/png", "sizeBytes": 100}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (422, "unsupported_type")
    big = sara.post(
        f"{API}/uploads",
        json={"purpose": "cv", "fileName": "cv.pdf", "contentType": "application/pdf", "sizeBytes": 6 * 1024 * 1024},
    )
    assert (big.status_code, big.json()["error"]["code"]) == (422, "too_large")


def test_deleting_a_cv_or_the_account_takes_its_file(
    career_doc: None,
    client_for: Clients,
    make_user: Callable[..., User],
    upload_file: Callable[..., dict[str, Any]],
    db: Session,
    storage: Any,
) -> None:
    student = make_user()
    sara = client_for(student)
    first = sara.post(CVS, json={"uploadId": upload_cv(upload_file, sara), "roleId": "data-analyst"}).json()
    second = sara.post(CVS, json={"uploadId": upload_cv(upload_file, sara), "roleId": "data-analyst"}).json()
    key: dict[str, str] = {}
    for review in db.scalars(select(CvReview).where(CvReview.user_id == student.id)):
        up = db.get(Upload, review.upload_id)
        assert up is not None
        key[str(review.id)] = up.storage_key
    assert storage.head(key[first["id"]]) is not None

    assert sara.delete(f"{CVS}/{first['id']}").status_code == 204
    assert [c["id"] for c in sara.get(CVS).json()] == [second["id"]]
    assert storage.head(key[first["id"]]) is None
    assert storage.head(key[second["id"]]) is not None

    db.expire_all()
    accounts.delete_account(db, db.get(User, student.id), storage)
    db.commit()
    assert db.scalar(select(func.count()).select_from(CvReview).where(CvReview.user_id == student.id)) == 0
    assert storage.head(key[second["id"]]) is None


def test_switched_off_the_tab_and_its_uploads_are_gone(
    career_doc: None, client_for: Clients, make_user: Callable[..., User], set_feature: Callable[..., None]
) -> None:
    set_feature("career.cv", "off")
    sara = client_for(make_user())
    assert sara.get(CVS).json()["error"]["code"] == "feature_off"
    r = sara.post(
        f"{API}/uploads", json={"purpose": "cv", "fileName": "cv.pdf", "contentType": "application/pdf", "sizeBytes": 9}
    )
    assert r.json()["error"]["code"] == "feature_off"
