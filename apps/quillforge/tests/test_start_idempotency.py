# -*- coding: utf-8 -*-
"""Reviewed-script start contract and concurrency tests."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path

from fastapi import HTTPException
import pytest

from dependencies import (
    sessions,
    start_receipts,
    uploaded_scripts,
)
from routes.upload import start_game
from script_registry import register_generated_script, registered_scripts
from test_script_registry import write_generated_package


KEY_ONE = "12345678-1234-5678-9234-567812345678"
KEY_TWO = "87654321-4321-6789-a234-678943216789"


def register_ready(
    tmp_path: Path,
    script_id: str,
    name: str,
) -> object:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root, name, worldbook_text=f"{name} 世界书")
    return register_generated_script(script_id, script_dir, root)


@pytest.fixture(autouse=True)
def clear_runtime_stores() -> None:
    sessions.clear()
    start_receipts.clear()
    registered_scripts.clear()
    yield
    sessions.clear()
    start_receipts.clear()
    registered_scripts.clear()


@pytest.mark.parametrize(
    "script_id",
    ["unknown", "../forged", "f" * 32, "e" * 32],
)
def test_header_rejects_unknown_forged_failed_and_not_ready_ids(
    tmp_path: Path,
    script_id: str,
) -> None:
    ready = register_ready(tmp_path, "a" * 32, "base")
    if script_id == "f" * 32:
        uploaded_scripts[script_id] = {
            "path": ready.path,
            "adapter": ready.adapter,
            "summary": ready.summary,
            "status": "failed",
        }
    elif script_id == "e" * 32:
        uploaded_scripts[script_id] = {
            "path": ready.path,
            "adapter": ready.adapter,
            "summary": ready.summary,
            "status": "generating",
        }
    with pytest.raises(HTTPException) as caught:
        start_game(script_id=script_id, idempotency_key=KEY_ONE)
    assert caught.value.status_code == 400
    assert len(sessions) == 0
    assert start_receipts == {}


@pytest.mark.parametrize("bad_key", ["", "not-a-uuid", "1234", KEY_ONE + "x"])
def test_header_requires_valid_uuid(
    tmp_path: Path,
    bad_key: str,
) -> None:
    register_ready(tmp_path, "b" * 32, f"key-{len(bad_key)}")
    with pytest.raises(HTTPException) as caught:
        start_game(script_id="b" * 32, idempotency_key=bad_key)
    assert caught.value.status_code == 400
    assert len(sessions) == 0


def test_same_key_and_script_returns_one_byte_equivalent_receipt(
    tmp_path: Path,
) -> None:
    register_ready(tmp_path, "c" * 32, "one")
    first = start_game(script_id="c" * 32, idempotency_key=KEY_ONE)
    second = start_game(script_id="c" * 32, idempotency_key=KEY_ONE)
    assert first["session_id"] == second["session_id"]
    assert json.dumps(first, ensure_ascii=False, sort_keys=True) == json.dumps(
        second,
        ensure_ascii=False,
        sort_keys=True,
    )
    assert len(sessions) == 1
    assert len(start_receipts) == 1
    assert start_receipts[KEY_ONE].script_id == "c" * 32
    assert KEY_ONE not in json.dumps(first, ensure_ascii=False)
    assert "idempotency" not in registered_scripts["c" * 32]


def test_same_key_with_different_ready_script_returns_conflict(
    tmp_path: Path,
) -> None:
    register_ready(tmp_path, "1" * 32, "first")
    register_ready(tmp_path, "2" * 32, "second")
    first = start_game(script_id="1" * 32, idempotency_key=KEY_ONE)
    with pytest.raises(HTTPException) as caught:
        start_game(script_id="2" * 32, idempotency_key=KEY_ONE)
    assert caught.value.status_code == 409
    assert len(sessions) == 1
    assert start_receipts[KEY_ONE].response["session_id"] == first["session_id"]


def test_concurrent_same_key_requests_create_one_session_and_receipt(
    tmp_path: Path,
) -> None:
    register_ready(tmp_path, "3" * 32, "concurrent")

    def start_once(_index: int) -> dict[str, object]:
        return start_game(script_id="3" * 32, idempotency_key=KEY_TWO)

    with ThreadPoolExecutor(max_workers=8) as executor:
        responses = list(executor.map(start_once, range(16)))

    assert {response["session_id"] for response in responses} == {
        responses[0]["session_id"]
    }
    assert len(sessions) == 1
    assert list(start_receipts) == [KEY_TWO]
