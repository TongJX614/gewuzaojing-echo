# -*- coding: utf-8 -*-
"""Legacy upload/sample and compatible adapter-map regressions."""

from __future__ import annotations

from pathlib import Path

import pytest

import routes.debate as debate_route
import routes.minigame as minigame_route
from dependencies import sessions, start_receipts, uploaded_scripts
from routes.upload import start_game
from script_registry import registered_scripts
from test_script_registry import write_generated_package
from generic_adapter import GenericScriptAdapter


@pytest.fixture(autouse=True)
def clear_runtime_stores() -> None:
    sessions.clear()
    start_receipts.clear()
    registered_scripts.clear()
    yield
    sessions.clear()
    start_receipts.clear()
    registered_scripts.clear()


def make_legacy_record(tmp_path: Path, script_id: str = "legacy-upload") -> object:
    root = tmp_path / "legacy"
    script_dir = write_generated_package(root)
    adapter = GenericScriptAdapter()
    adapter.load(str(script_dir))
    uploaded_scripts[script_id] = {
        "path": str(script_dir),
        "adapter": adapter,
        "summary": adapter.to_summary(),
    }
    return adapter


def test_no_header_legacy_upload_folder_and_sample_shape_still_starts(
    tmp_path: Path,
) -> None:
    make_legacy_record(tmp_path)
    first = start_game(script_id="legacy-upload", idempotency_key=None)
    second = start_game(script_id="legacy-upload", idempotency_key=None)
    assert first["session_id"] != second["session_id"]
    assert len(sessions) == 2
    assert start_receipts == {}


def test_debate_and_minigame_routes_read_adapter_from_compatible_mapping(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = make_legacy_record(tmp_path, "legacy-tools")
    monkeypatch.setattr(
        debate_route,
        "generate_debate",
        lambda candidate: {"same_adapter": candidate is adapter},
    )
    monkeypatch.setattr(
        minigame_route,
        "generate_minigame",
        lambda candidate, kind: {
            "same_adapter": candidate is adapter,
            "kind": kind,
        },
    )
    debate = debate_route.api_generate_debate("legacy-tools")
    minigame = minigame_route.api_generate_minigame("legacy-tools", "clue")
    assert debate == {"success": True, "data": {"same_adapter": True}}
    assert minigame == {
        "success": True,
        "data": {"same_adapter": True, "kind": "clue"},
    }
