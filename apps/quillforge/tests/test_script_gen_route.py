# -*- coding: utf-8 -*-
"""No-model SSE contract tests for generated-script registration."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Iterator

import pytest

import routes.script_gen as script_gen_route
from routes.script_gen import GenerateScriptRequest, api_generate_script
from script_registry import (
    ScriptRegistryError,
    get_ready_script,
    registered_scripts,
)
from test_script_registry import write_generated_package


def parse_sse(raw: str) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for block in raw.split("\n\n"):
        if not block.strip():
            continue
        lines = block.splitlines()
        event_type = next(line[7:] for line in lines if line.startswith("event: "))
        data = json.loads(next(line[6:] for line in lines if line.startswith("data: ")))
        events.append({"event": event_type, "data": data})
    return events


async def collect_response(prompt: str = "一个世界") -> list[dict[str, object]]:
    response = await api_generate_script(GenerateScriptRequest(prompt=prompt))
    chunks: list[str] = []
    async for chunk in response.body_iterator:
        chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
    return parse_sse("".join(chunks))


@pytest.fixture(autouse=True)
def clear_registry() -> None:
    registered_scripts.clear()
    yield
    registered_scripts.clear()


def test_done_is_emitted_only_after_ready_disk_registration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(
        root,
        worldbook_text="磁盘规则\n\n第二条",
    )
    script_id = "1" * 32

    def fake_generate(_prompt: str) -> Iterator[dict[str, object]]:
        yield {"type": "progress", "step": "saving", "message": "正在保存"}
        yield {
            "type": "done",
            "script_id": script_id,
            "path": str(script_dir),
            "summary": {"title": "不可信内存摘要", "path": "do-not-send"},
        }

    monkeypatch.setattr(script_gen_route, "generate_script", fake_generate)
    monkeypatch.setattr(script_gen_route, "SAMPLES_DIR", root)
    events = asyncio.run(collect_response())

    assert [event["event"] for event in events] == ["progress", "done"]
    done_events = [event["data"] for event in events if event["event"] == "done"]
    assert len(done_events) == 1
    done = done_events[0]
    record = get_ready_script(script_id)
    assert record is not None
    assert done["script_id"] == script_id
    assert done["summary"] == record.summary
    assert done["summary"]["worldbook_excerpt"] == "磁盘规则 第二条"
    assert done["summary"]["worldbook_truncated"] is False
    serialized = json.dumps(done, ensure_ascii=False)
    for forbidden in (
        str(script_dir),
        "path",
        "api_key",
        "Authorization",
        "Idempotency-Key",
    ):
        assert forbidden not in serialized


@pytest.mark.parametrize(
    "failure_kind",
    ["invalid_path", "collision", "adapter", "worldbook"],
)
def test_registration_failure_emits_one_safe_error_and_no_done(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure_kind: str,
) -> None:
    root = tmp_path / "samples"
    if failure_kind == "invalid_path":
        script_dir = write_generated_package(tmp_path / "outside")
    elif failure_kind == "worldbook":
        script_dir = write_generated_package(root, worldbook_text=None)
    else:
        script_dir = write_generated_package(root)
    script_id = "2" * 32

    def fake_generate(_prompt: str) -> Iterator[dict[str, object]]:
        yield {"type": "progress", "step": "saving", "message": "正在保存"}
        yield {
            "type": "done",
            "script_id": script_id,
            "path": str(script_dir),
        }

    monkeypatch.setattr(script_gen_route, "generate_script", fake_generate)
    monkeypatch.setattr(script_gen_route, "SAMPLES_DIR", root)
    if failure_kind == "collision":
        monkeypatch.setattr(
            script_gen_route,
            "register_generated_script",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                ScriptRegistryError("SCRIPT_ID_COLLISION")
            ),
        )
    elif failure_kind == "adapter":
        monkeypatch.setattr(
            script_gen_route.GenericScriptAdapter,
            "load",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                ValueError("provider body must not leak")
            ),
        )

    events = asyncio.run(collect_response())
    assert [event["event"] for event in events] == ["progress", "error"]
    error = events[-1]["data"]
    assert error == {
        "type": "error",
        "code": "SCRIPT_REGISTRATION_FAILED",
        "message": "生成结果未通过世界书校验",
    }
    assert get_ready_script(script_id) is None
    serialized = json.dumps(error, ensure_ascii=False)
    assert str(script_dir) not in serialized
    assert "provider body" not in serialized
