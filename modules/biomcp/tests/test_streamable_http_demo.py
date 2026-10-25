from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
DEMO_PATH = REPO_ROOT / "examples/streamable-http/streamable_http_client.py"


def _load_demo_module():
    spec = importlib.util.spec_from_file_location("streamable_http_client_demo", DEMO_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_default_base_url_is_localhost() -> None:
    module = _load_demo_module()

    assert module.DEFAULT_BASE_URL == "http://127.0.0.1:8080"
    assert (
        module.resolve_base_url(["examples/streamable-http/streamable_http_client.py"])
        == module.DEFAULT_BASE_URL
    )


def test_resolve_base_url_accepts_explicit_url() -> None:
    module = _load_demo_module()

    assert (
        module.resolve_base_url(
            ["examples/streamable-http/streamable_http_client.py", "http://demo.test:9000"]
        )
        == "http://demo.test:9000"
    )


def test_resolve_base_url_rejects_extra_args() -> None:
    module = _load_demo_module()

    with pytest.raises(
        SystemExit,
        match=re.escape("Usage: examples/streamable-http/streamable_http_client.py [base_url]"),
    ):
        module.resolve_base_url(
            [
                "examples/streamable-http/streamable_http_client.py",
                "http://demo.test:9000",
                "unexpected",
            ]
        )


def test_workflow_contains_expected_commands() -> None:
    module = _load_demo_module()

    assert len(module.WORKFLOW) == 3

    discovery_command, evidence_command, trial_command = module.WORKFLOW

    assert "BRAF" in discovery_command
    assert "melanoma" in discovery_command
    assert "counts-only" in discovery_command

    assert "BRAF V600E" in evidence_command
    assert "clinvar" in evidence_command

    assert "trial" in trial_command
    assert "melanoma" in trial_command
    assert "BRAF V600E" in trial_command


def test_demo_python_floor_matches_syntax() -> None:
    source = DEMO_PATH.read_text()

    meta_match = re.search(r'requires-python\s*=\s*"([^"]+)"', source)
    assert meta_match, "requires-python not found in demo inline metadata"
    spec_str = meta_match.group(1)

    version_match = re.search(r">=(\d+)\.(\d+)", spec_str)
    assert version_match, f"Unrecognised requires-python spec: {spec_str!r}"
    min_version = (int(version_match.group(1)), int(version_match.group(2)))

    pep695 = re.compile(r"^\s*type\s+[A-Za-z_]\w*\s*=", re.MULTILINE)
    hits = pep695.findall(source)
    if min_version < (3, 12):
        assert not hits, (
            f"Demo declares requires-python={spec_str!r} (floor < 3.12) "
            f"but contains PEP 695 'type' statement(s): {hits}"
        )
