"""scripts/seed-real.sh: one command that fills an install with the real content (migrations, seed, Drive import).

The script runs from a copy in a temporary folder, with its own compose files and .env, and a stand-in for docker that
records each call: nothing here touches a real stack or a real .env."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "seed-real.sh"
KEY = "AIzaSy-test-key-for-the-script-000000"

FAKE_DOCKER = """#!{python}
import json, os, sys
with open(os.environ["DOCKER_LOG"], "a") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
fail = os.environ.get("DOCKER_FAIL_ON")
sys.exit(1 if fail and fail in sys.argv else 0)
"""


class Setup:
    def __init__(self, tmp_path: Path) -> None:
        self.root = tmp_path / "hub"
        (self.root / "scripts").mkdir(parents=True)
        shutil.copy(SCRIPT, self.root / "scripts" / "seed-real.sh")
        for name in ("compose.yaml", "compose.prod.yaml"):
            (self.root / name).write_text("services: {}\n")
        self.bin = tmp_path / "bin"
        self.bin.mkdir()
        docker = self.bin / "docker"
        docker.write_text(FAKE_DOCKER.format(python=sys.executable))
        docker.chmod(0o755)
        self.log = tmp_path / "docker.log"

    def env_file(self, text: str) -> None:
        (self.root / ".env").write_text(text)

    def run(self, *args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        base = {"PATH": f"{self.bin}:/usr/bin:/bin", "DOCKER_LOG": str(self.log), "HOME": str(self.root)}
        return subprocess.run(  # noqa: S603 - the script under test, with arguments from the test
            ["bash", str(self.root / "scripts" / "seed-real.sh"), *args],  # noqa: S607 - bash from PATH
            env={**base, **(env or {})},
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )

    def calls(self) -> list[list[str]]:
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]


@pytest.fixture
def setup(tmp_path: Path) -> Setup:
    if shutil.which("bash") is None:
        pytest.skip("bash is needed")
    return Setup(tmp_path)


def test_it_migrates_seeds_then_imports_in_the_local_stack(setup: Setup) -> None:
    setup.env_file(f"POSTGRES_PASSWORD=dsba\nDSBA_GOOGLE_API_KEY={KEY}\n")
    done = setup.run()
    assert done.returncode == 0, done.stderr
    compose = ["compose", "-f", str(setup.root / "compose.yaml"), "run", "--rm"]
    assert setup.calls() == [
        [*compose, "api", "alembic", "upgrade", "head"],
        [*compose, "api", "python", "-m", "app.cli", "seed"],
        [*compose, "-e", "DSBA_GOOGLE_API_KEY", "api", "python", "-m", "app.cli", "import-drive"],
    ]
    assert "== 3/3 Library files from Google Drive" in done.stdout
    assert KEY not in done.stdout + done.stderr  # passed on by name only, never on a command line
    assert KEY not in setup.log.read_text()


def test_prod_uses_the_servers_stack_and_passes_the_imports_options_through(setup: Setup) -> None:
    done = setup.run("--prod", "--dry-run", "--module", "statistics", env={"DSBA_GOOGLE_API_KEY": KEY})
    assert done.returncode == 0, done.stderr
    calls = setup.calls()
    assert [call[:3] for call in calls] == [["compose", "-f", str(setup.root / "compose.prod.yaml")]] * 3
    assert calls[1][-1] == "seed"  # the dry run still loads the links the plan reads
    assert calls[2][calls[2].index("import-drive") :] == ["import-drive", "--dry-run", "--module", "statistics"]


def test_a_service_account_key_file_is_mounted_read_only(setup: Setup, tmp_path: Path) -> None:
    key_file = tmp_path / "importer key.json"
    key_file.write_text("{}")
    setup.env_file(f'DSBA_GOOGLE_SERVICE_ACCOUNT_FILE="{key_file}"\n')
    done = setup.run("--prod", "--yes")
    assert done.returncode == 0, done.stderr
    imported = setup.calls()[2]
    assert imported[imported.index("--rm") + 1 : imported.index("api")] == [
        "-e",
        "DSBA_GOOGLE_API_KEY",
        "-v",
        f"{key_file}:/run/secrets/google-service-account.json:ro",
        "-e",
        "DSBA_GOOGLE_SERVICE_ACCOUNT_FILE=/run/secrets/google-service-account.json",
    ]
    assert imported[-1] == "--yes"


def test_without_google_credentials_nothing_runs(setup: Setup, tmp_path: Path) -> None:
    setup.env_file("POSTGRES_PASSWORD=dsba\nDSBA_GOOGLE_API_KEY=\n")
    done = setup.run()
    assert done.returncode == 1
    assert "needs DSBA_GOOGLE_API_KEY" in done.stderr
    assert setup.calls() == []
    setup.env_file(f"DSBA_GOOGLE_SERVICE_ACCOUNT_FILE={tmp_path / 'missing.json'}\n")
    done = setup.run()
    assert done.returncode == 1
    assert "can't be read" in done.stderr
    assert setup.calls() == []


def test_a_step_that_fails_stops_the_rest(setup: Setup) -> None:
    done = setup.run(env={"DSBA_GOOGLE_API_KEY": KEY, "DOCKER_FAIL_ON": "alembic"})
    assert done.returncode == 1
    assert len(setup.calls()) == 1
    assert "== 2/3" not in done.stdout


def test_help_says_what_it_does(setup: Setup) -> None:
    done = setup.run("--help")
    assert done.returncode == 0
    assert done.stdout.startswith("Fills an install with the real content in one go")
    assert "scripts/seed-real.sh --prod" in done.stdout
    assert setup.calls() == []
