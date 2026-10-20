"""Site settings' links to BIBF and the University go only to their hosts (SEC-64): https:// on a host of
DSBA_PORTAL_HOSTS or a subdomain of one, never a look-alike, a userinfo trick or a Unicode name."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.core.links import is_portal_url

HOSTS = ["bibf.edu.bh", "bibf.com", "london.ac.uk"]
SEED = Path(__file__).resolve().parents[2] / "app" / "seed" / "data" / "site.json"


@pytest.mark.parametrize(
    "url",
    [
        "https://bibf.edu.bh",
        "https://bibf.edu.bh/students",
        "https://myclass.bibf.edu.bh/login?next=/",
        "https://myclass.bibf.com",
        "https://my.london.ac.uk/group/student",
        "https://www.london.ac.uk/sites/default/files/regs.pdf",
        "https://MyClass.BIBF.com",  # host names don't care about case
        "https://bibf.edu.bh:443/",
        "https://xn--bbf-yla.bibf.edu.bh",  # punycode below an allowed host is still that host's
    ],
)
def test_allowed_hosts_and_their_subdomains_pass(url: str) -> None:
    assert is_portal_url(url, HOSTS)


@pytest.mark.parametrize(
    "url",
    [
        "http://bibf.edu.bh",  # not https
        "//bibf.edu.bh",
        "/calendar",
        "javascript:alert(1)",
        "https://bibf.edu.bh.evil.com",  # look-alikes
        "https://evilbibf.edu.bh",
        "https://evil-bibf.com",
        "https://bibf.edu.bh-evil.com",
        "https://edu.bh",
        "https://london.ac.uk.evil.com/group/student",
        "https://bibf.edu.bh@evil.com",  # userinfo tricks
        "https://bibf.edu.bh:pw@evil.com",
        "https://evil.com#@bibf.edu.bh",
        "https://evil.com?@bibf.edu.bh",
        "https://evil.com\\@bibf.edu.bh",
        "https://evil.com%2F@bibf.edu.bh",
        "https://evil.com;bibf.edu.bh",
        "https://bibf%2Eedu%2Ebh",
        "https://bíbf.edu.bh",  # Unicode look-alikes, and their punycode
        "https://xn--bbf-yla.edu.bh",
        "https://myclass.bibf．com",  # a full-width dot a browser would rewrite
        "https://bibf.edu.bh.",  # a trailing dot
        "https://bibf.edu.bh:notaport",
        "https://bibf.edu.bh /x",
        "https://",
    ],
)
def test_other_hosts_and_tricks_are_refused(url: str) -> None:
    assert not is_portal_url(url, HOSTS)


def test_every_seeded_link_passes_the_default_hosts() -> None:
    links = json.loads(SEED.read_text(encoding="utf-8"))["links"]
    hosts = Settings(_env_file=None).portal_hosts  # type: ignore[call-arg]
    assert hosts == HOSTS
    assert links and all(is_portal_url(link["url"], hosts) for link in links.values())


def test_the_hosts_are_a_comma_separated_setting() -> None:
    s = Settings(_env_file=None, portal_hosts=" BIBF.edu.bh , london.ac.uk ")  # type: ignore[call-arg]
    assert s.portal_hosts == ["bibf.edu.bh", "london.ac.uk"]


@pytest.mark.parametrize("value", ["*.bibf.com", "https://bibf.com", "bibf", ""])
def test_a_host_list_that_isnt_plain_host_names_stops_the_api(value: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, portal_hosts=value)  # type: ignore[call-arg]
