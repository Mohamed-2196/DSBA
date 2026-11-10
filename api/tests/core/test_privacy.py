"""GET /privacy: which outside services the privacy notice names right now. Anthropic only while a switch that uses
it is on (for anyone) and the hub has a key; AI apps while "Connect an AI app" is on."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from tests.core.conftest import SetOption
from tests.core.helpers import API

NONE = {"nooraAnswers": False, "forumCheck": False, "aiApps": False}


@pytest.fixture
def everything_off(set_feature: Callable[..., None]) -> None:
    for f in ("noora", "noora.ai", "forum", "forum.auto-check", "mcp"):
        set_feature(f, "off")


@pytest.mark.usefixtures("everything_off")
def test_a_guest_reads_which_services_handle_data(client: TestClient) -> None:
    r = client.get(f"{API}/privacy")
    assert (r.status_code, r.json()) == (200, NONE)


@pytest.mark.usefixtures("everything_off")
def test_anthropic_counts_only_with_its_switches_and_a_key(
    client: TestClient, set_feature: Callable[..., None], set_option: SetOption
) -> None:
    set_feature("noora", "everyone")
    set_feature("noora.ai", "roles", ["admin"])  # on for some roles is on: those people's questions go to Anthropic
    set_feature("forum", "everyone")
    set_feature("forum.auto-check", "everyone")
    assert client.get(f"{API}/privacy").json() == NONE  # no key: nothing is sent
    set_option("anthropic_api_key", SecretStr("sk-test"))
    assert client.get(f"{API}/privacy").json() == {**NONE, "nooraAnswers": True, "forumCheck": True}
    set_feature("noora", "off")  # Mini Noora off takes her answers with her
    set_feature("forum", "off")
    assert client.get(f"{API}/privacy").json() == NONE


@pytest.mark.usefixtures("everything_off")
def test_ai_apps_count_while_their_switch_is_on(client: TestClient, set_feature: Callable[..., None]) -> None:
    set_feature("mcp", "roles", ["admin"])
    assert client.get(f"{API}/privacy").json() == {**NONE, "aiApps": True}
