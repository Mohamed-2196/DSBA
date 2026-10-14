"""Polls in newsletter issues: one vote per student, counts after voting, never who voted."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.models import User
from tests.content.conftest import API
from tests.content.test_newsletter import fields, new_issue

Clients = Callable[..., TestClient]
SetFeature = Callable[..., None]
ISSUES = f"{API}/newsletter/issues"
POLL = {"type": "poll", "id": "emails", "question": "Should emails be on by default?", "answers": ["Yes", "No"]}


def with_poll(*blocks: dict[str, Any]) -> dict[str, Any]:
    return new_issue(cover={}, sections=[{"id": "ask", "title": "Ask the cohort", "blocks": list(blocks)}])


def publish(client: TestClient, body: dict[str, Any]) -> dict[str, Any]:
    r = client.post(ISSUES, json=body)
    assert r.status_code == 201, r.text
    out = client.post(f"{ISSUES}/{r.json()['id']}/publish")
    assert out.status_code == 200, out.text
    issue: dict[str, Any] = out.json()
    return issue


def vote(client: TestClient, issue_id: str, choice: int, poll: str = "emails") -> Any:
    return client.put(f"{ISSUES}/{issue_id}/polls/{poll}/vote", json={"choice": choice})


def test_one_vote_each_and_counts_only_after_voting(
    client_for: Clients, student: User, moderator: User, make_user: Callable[..., User], set_feature: SetFeature
) -> None:
    set_feature("newsletter.polls", "everyone")
    issue = publish(client_for(moderator), with_poll(POLL))
    slug = issue["slug"]
    assert client_for(student).get(f"{ISSUES}/{slug}").json()["polls"] == {
        "emails": {"total": 0, "counts": None, "mine": None}
    }
    other = make_user(name="Layla F.", year=1)
    assert vote(client_for(other), issue["id"], 1).status_code == 200
    r = vote(client_for(student), issue["id"], 0)
    assert r.json() == {"total": 2, "counts": [1, 1], "mine": 0}
    again = vote(client_for(student), issue["id"], 1)
    assert (again.status_code, again.json()["error"]["code"]) == (409, "already_voted")
    # the manager sees counts without voting; a guest sees only the total
    assert client_for(moderator).get(f"{ISSUES}/{slug}").json()["polls"]["emails"]["counts"] == [1, 1]
    assert client_for().get(f"{ISSUES}/{slug}").json()["polls"]["emails"] == {"total": 2, "counts": None, "mine": None}
    assert vote(client_for(), issue["id"], 0).status_code == 401
    export = client_for(student).get(f"{API}/me/export").json()
    assert [(v["pollId"], v["choice"]) for v in export["pollVotes"]] == [("emails", 0)]


def test_a_vote_must_be_one_of_the_answers_in_a_published_issue(
    client_for: Clients, student: User, moderator: User, set_feature: SetFeature
) -> None:
    set_feature("newsletter.polls", "everyone")
    issue = publish(client_for(moderator), with_poll(POLL))
    assert vote(client_for(student), issue["id"], 3).status_code == 422
    assert vote(client_for(student), issue["id"], 0, poll="nope").status_code == 404
    draft = client_for(moderator).post(ISSUES, json={**with_poll(POLL), "slug": "draft-poll"}).json()
    assert vote(client_for(student), draft["id"], 0).status_code == 404
    assert vote(client_for(moderator), draft["id"], 0).json()["error"]["code"] == "not_published"


def test_polls_need_two_to_five_answers_and_their_own_ids(client_for: Clients, moderator: User) -> None:
    rep = client_for(moderator)
    assert "sections.0.blocks.0.poll.answers" in fields(rep.post(ISSUES, json=with_poll({**POLL, "answers": ["Yes"]})))
    six = {**POLL, "answers": ["a", "b", "c", "d", "e", "f"]}
    assert rep.post(ISSUES, json=with_poll(six)).status_code == 422
    assert rep.post(ISSUES, json=with_poll(POLL, POLL)).status_code == 422


def test_polls_switched_off_give_no_results_and_refuse_votes(
    client_for: Clients, student: User, moderator: User
) -> None:
    issue = publish(client_for(moderator), with_poll(POLL))
    assert client_for(student).get(f"{ISSUES}/{issue['slug']}").json()["polls"] == {}
    r = vote(client_for(student), issue["id"], 0)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")


def test_a_voted_polls_answers_are_fixed_but_it_can_be_reworded_and_closed(
    client_for: Clients, student: User, moderator: User, set_feature: SetFeature
) -> None:
    set_feature("newsletter.polls", "everyone")
    rep = client_for(moderator)
    issue = publish(rep, with_poll(POLL))
    url = f"{ISSUES}/{issue['id']}"
    # no votes yet: the answers may change
    assert (
        rep.patch(
            url, json={"sections": with_poll({**POLL, "answers": ["Yes", "No", "Maybe"]})["sections"]}
        ).status_code
        == 200
    )
    assert vote(client_for(student), issue["id"], 2).status_code == 200
    r = rep.patch(url, json={"sections": with_poll({**POLL, "answers": ["Yes", "No"]})["sections"]})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "poll_has_votes")
    answers = ["Yes", "No", "Maybe"]
    closed = {**POLL, "question": "Emails on by default?", "answers": answers, "closed": True}
    assert rep.patch(url, json={"sections": with_poll(closed)["sections"]}).status_code == 200
    late = vote(client_for(moderator), issue["id"], 0)
    assert (late.status_code, late.json()["error"]["code"]) == (409, "poll_closed")
    # closed: everyone sees the counts
    assert client_for().get(f"{ISSUES}/{issue['slug']}").json()["polls"]["emails"]["counts"] == [0, 0, 1]
