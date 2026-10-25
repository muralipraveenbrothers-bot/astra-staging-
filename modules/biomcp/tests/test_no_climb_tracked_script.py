from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def _copy_no_climb_fixture(tmp_path: Path) -> Path:
    fixture_root = tmp_path / "repo"
    (fixture_root / "scripts").mkdir(parents=True)
    source = REPO_ROOT / "scripts" / "check-no-climb-tracked.sh"
    target = fixture_root / "scripts" / "check-no-climb-tracked.sh"
    shutil.copy2(source, target)
    (fixture_root / ".gitignore").write_text(
        ".climb/\n.climb-test-vault/\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "init"], cwd=fixture_root, check=True, capture_output=True)
    return fixture_root


def _run_no_climb_script(repo_root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", "scripts/check-no-climb-tracked.sh"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )


def test_no_climb_tracked_script_passes_when_no_climb_paths_are_indexed(
    tmp_path: Path,
) -> None:
    repo_root = _copy_no_climb_fixture(tmp_path)

    result = _run_no_climb_script(repo_root)

    assert result.returncode == 0
    assert result.stdout.strip() == "No tracked Climb scratch files found"
    assert result.stderr == ""


def test_no_climb_tracked_script_reports_tracked_climb_paths(tmp_path: Path) -> None:
    repo_root = _copy_no_climb_fixture(tmp_path)
    tracked_path = repo_root / ".climb" / "design.md"
    tracked_path.parent.mkdir(parents=True)
    tracked_path.write_text("# tracked climb file\n", encoding="utf-8")
    subprocess.run(["git", "add", "-f", ".climb/design.md"], cwd=repo_root, check=True)

    result = _run_no_climb_script(repo_root)

    assert result.returncode == 1
    assert result.stdout == ""
    assert "Error: tracked Climb scratch files detected:" in result.stderr
    assert ".climb/design.md" in result.stderr
    assert "Fix: git rm --cached <path>" in result.stderr


def test_no_climb_tracked_script_reports_tracked_climb_test_vault_paths(
    tmp_path: Path,
) -> None:
    repo_root = _copy_no_climb_fixture(tmp_path)
    tracked_path = repo_root / ".climb-test-vault" / "config.md"
    tracked_path.parent.mkdir(parents=True)
    tracked_path.write_text("scratch config\n", encoding="utf-8")
    subprocess.run(
        ["git", "add", "-f", ".climb-test-vault/config.md"],
        cwd=repo_root,
        check=True,
    )

    result = _run_no_climb_script(repo_root)

    assert result.returncode == 1
    assert result.stdout == ""
    assert "Error: tracked Climb scratch files detected:" in result.stderr
    assert ".climb-test-vault/config.md" in result.stderr
    assert "Fix: git rm --cached <path>" in result.stderr
