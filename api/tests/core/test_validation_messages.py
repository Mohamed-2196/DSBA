"""422s speak the hub's words, never Pydantic's: what is wrong with which field and what to do about it."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, time
from enum import Enum
from typing import Annotated, Any, Literal
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, EmailStr, Field, HttpUrl, ValidationError, field_validator
from pydantic_core import PydanticCustomError

from app.core.errors import field_label, plain_message, validation_error
from app.models import User
from app.schemas.common import ApiModel
from tests.core.helpers import API

Clients = Callable[..., TestClient]


class Colour(Enum):
    RED = "red"


class Form(ApiModel):
    display_name: str = Field(default="Sara", min_length=1, max_length=40)
    title: str = Field(default="Long enough", min_length=5)
    year: int = Field(default=1, ge=1, le=3)
    score: float = Field(default=1, gt=0, lt=100)
    step: int = Field(default=2, multiple_of=2)
    tags: list[str] = Field(default_factory=lambda: ["a"], min_length=1, max_length=3)
    words: list[str] = Field(default_factory=lambda: ["a", "b"], min_length=2)
    kind: Literal["post", "reply"] = "post"
    colour: Colour = Colour.RED
    video_url: HttpUrl = HttpUrl("https://example.com")
    email: EmailStr = "someone@example.com"
    module_id: UUID = UUID(int=1)
    role_ids: list[UUID] = Field(default_factory=list)
    due: date = date(2026, 9, 14)
    starts: datetime = datetime(2026, 9, 14, 9, 30, tzinfo=UTC)
    at: time = time(14, 30)
    public: bool = False
    slug: str = Field(default="abc", pattern=r"^[a-z]+$")
    options: list[Annotated[str, Field(max_length=5)]] = Field(default_factory=list)


def errors_for(**data: Any) -> list[dict[str, Any]]:
    with pytest.raises(ValidationError) as e:
        Form.model_validate(data)
    return [dict(err) for err in e.value.errors()]


def says(**data: Any) -> str:
    (error,) = errors_for(**data)
    return plain_message(error)


@pytest.mark.parametrize(
    ("data", "message"),
    [
        ({"displayName": ""}, "Display name can't be empty. Fill it in."),
        ({"displayName": "x" * 41}, "Display name must be 40 characters or fewer."),
        ({"title": "Hi"}, "Title must be at least 5 characters."),
        ({"year": "two"}, "Year must be a whole number."),
        ({"year": 2.5}, "Year must be a whole number."),
        ({"year": 0}, "Year must be 1 or more."),
        ({"year": 4}, "Year must be 3 or less."),
        ({"score": "lots"}, "Score must be a number."),
        ({"score": 0}, "Score must be more than 0."),
        ({"score": 100}, "Score must be less than 100."),
        ({"step": 3}, "Step must be a multiple of 2."),
        ({"tags": []}, "Tags needs at least 1 entry."),
        ({"tags": ["a", "b", "c", "d"]}, "Tags can have 3 entries at most. Remove some."),
        ({"words": ["a"]}, "Words needs at least 2 entries."),
        ({"tags": "a"}, "Tags isn't in the shape this takes. Reload the page and try again."),
        ({"kind": "poll"}, "Kind isn't one of the choices. Pick one from the list."),
        ({"colour": "blue"}, "Colour isn't one of the choices. Pick one from the list."),
        ({"videoUrl": "not a link"}, "Video link must be a full web address, like https://example.com."),
        ({"videoUrl": "ftp://example.com"}, "Video link must be a web address starting with http or https."),
        ({"email": "nobody"}, "Email must be an email address, like name@example.com."),
        ({"moduleId": "abc"}, "Module isn't a valid id. Reload the page and try again."),
        ({"roleIds": ["abc"]}, "Each of the roles isn't a valid id. Reload the page and try again."),
        ({"due": "soon"}, "Due must be a date, like 2026-09-14."),
        ({"starts": "soon"}, "Starts must be a date and time, like 2026-09-14 09:30."),
        ({"at": "noon"}, "At must be a time, like 14:30."),
        ({"public": "perhaps"}, "Public must be true or false."),
        ({"title": 5}, "Title must be text."),
        ({"slug": "ABC"}, "Slug isn't in the right format. Check it and try again."),
        ({"options": ["fine", "too long"]}, "Each of the options must be 5 characters or fewer."),
    ],
)
def test_each_kind_of_error_has_a_plain_message(data: dict[str, Any], message: str) -> None:
    assert says(**data) == message


def test_a_missing_field_says_so() -> None:
    class Needs(ApiModel):
        display_name: str

    with pytest.raises(ValidationError) as e:
        Needs.model_validate({})
    assert plain_message(dict(e.value.errors()[0])) == "Display name is missing. Fill it in."


def test_our_own_validators_come_through_as_written() -> None:
    class Ours(BaseModel):
        title: str
        points: list[int]

        @field_validator("title")
        @classmethod
        def check_title(cls, v: str) -> str:
            raise ValueError("Give the post a title people can search for.")

        @field_validator("points")
        @classmethod
        def check_points(cls, v: list[int]) -> list[int]:
            raise PydanticCustomError("duplicate", "Two {what} have the same id.", {"what": "points"})

    with pytest.raises(ValidationError) as e:
        Ours.model_validate({"title": "x", "points": [1]})
    title, points = (plain_message(dict(err)) for err in e.value.errors())
    assert title == "Give the post a title people can search for."  # no "Value error, "
    assert points == "Two points have the same id."


@pytest.mark.parametrize(
    "error",
    [
        {"type": "assertion_error", "loc": ("body", "displayName"), "msg": "Assertion failed, x > 1", "input": 0},
        {"type": "is_instance_of", "loc": ("body", "displayName"), "msg": "Input should be an instance of X"},
        {"type": "value_error", "loc": ("body", "displayName"), "msg": "Value error, something", "ctx": {}},
        {"type": "string_too_long", "loc": ("body", "displayName"), "msg": "String should have at most 4"},
    ],
)
def test_anything_else_gets_a_plain_fallback_never_pydantics_words(error: dict[str, Any]) -> None:
    assert plain_message(error) == "Display name isn't valid. Check it and try again."


@pytest.mark.parametrize(
    ("loc", "label"),
    [
        (("body", "displayName"), "Display name"),
        (("query", "module_id"), "Module"),
        (("body", "roleIds"), "Roles"),
        (("body", "videoUrl"), "Video link"),
        (("body", "sections", 0, "href"), "Href"),
        (("body", "options", 1), "Each of the options"),
        (("body", "body"), "Body"),  # a reply's text: only the first segment says where the value came from
        (("body",), "The request"),
        ((), "The request"),
    ],
)
def test_field_labels(loc: tuple[object, ...], label: str) -> None:
    assert field_label(loc) == label


def test_one_field_is_the_whole_message_and_several_lead_with_the_first() -> None:
    one = validation_error(errors_for(displayName=""))
    assert one.message == "Display name can't be empty. Fill it in."
    assert one.fields == {"displayName": "Display name can't be empty. Fill it in."}

    several = validation_error(errors_for(displayName="", year=9))
    assert several.message == "Some fields need a look. Display name can't be empty. Fill it in."
    assert several.fields == {
        "displayName": "Display name can't be empty. Fill it in.",
        "year": "Year must be 3 or less.",
    }


def test_the_first_error_on_a_field_wins() -> None:
    loc = ("body", "title")
    err = validation_error(
        [
            {"type": "missing", "loc": loc, "msg": "Field required"},
            {"type": "string_type", "loc": loc, "msg": "Input should be a valid string"},
        ]
    )
    assert err.fields == {"title": "Title is missing. Fill it in."}


class Named(ApiModel):
    display_name: str = Field(max_length=40)
    note: str

    @field_validator("note")
    @classmethod
    def check(cls, v: str) -> str:
        raise ValueError("Keep notes to one line.")


@pytest.mark.own_app
def test_a_route_answers_in_plain_words(app: FastAPI, client_for: Clients, student: User) -> None:
    @app.post("/api/v1/_named")
    def named(body: Named) -> None:
        return None

    r = client_for(student).post(f"{API}/_named", json={"displayName": "x" * 41, "note": "a\nb"})
    assert r.status_code == 422
    assert r.json() == {
        "error": {
            "code": "invalid_input",
            "message": "Some fields need a look. Display name must be 40 characters or fewer.",
            "fields": {
                "displayName": "Display name must be 40 characters or fewer.",
                "note": "Keep notes to one line.",
            },
        }
    }


def test_real_endpoints_answer_in_plain_words(client_for: Clients, student: User) -> None:
    c = client_for(student)
    short = c.post(f"{API}/forum/threads", json={"title": "Hi", "body": "Hello"})
    assert short.status_code == 422
    assert short.json()["error"] == {
        "code": "invalid_input",
        "message": "Title must be at least 5 characters.",
        "fields": {"title": "Title must be at least 5 characters."},
    }

    tags = c.post(f"{API}/forum/threads", json={"title": "A real question", "tags": ["a", "b", "c", "d"]})
    assert tags.json()["error"]["fields"] == {"tags": "Tags can have 3 entries at most. Remove some."}

    offset = client_for().get(f"{API}/library/items", params={"offset": "lots"})
    assert offset.status_code == 422
    assert offset.json()["error"]["fields"] == {"offset": "Offset must be a whole number."}

    broken = c.post(f"{API}/forum/threads", content=b"{not json", headers={"Content-Type": "application/json"})
    assert broken.status_code == 422
    assert broken.json()["error"]["message"] == "The request isn't valid JSON. Reload the page and try again."


def test_an_address_whose_id_cant_be_one_is_not_found() -> None:
    """Student test ST-77: /requests/nope said "Request isn't a valid id. Reload the page"; nothing is there."""
    e = validation_error([{"type": "uuid_parsing", "loc": ("path", "request_id"), "msg": "x"}])
    assert (e.status, e.code, e.message) == (404, "not_found", "We couldn't find that. Check the link.")
    body = validation_error([{"type": "uuid_parsing", "loc": ("body", "moduleId"), "msg": "x"}])
    assert (body.status, body.code) == (422, "invalid_input")
