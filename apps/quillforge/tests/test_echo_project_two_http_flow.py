# -*- coding: utf-8 -*-
"""No-cost HTTP integration for Echo project two through real QuillForge routes."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from script_registry import get_ready_script
from support.echo_project_two_test_server import (
    CANONICAL_PROMPT,
    PRIMARY_SCRIPT_ID,
    SECONDARY_PROMPT,
    SECONDARY_SCRIPT_ID,
    WORLD_BOOK_EXCERPT,
    no_cost_echo_server,
)


START_KEY = "11111111-1111-4111-8111-111111111111"


def _sse_events(body: str) -> list[dict[str, object]]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in body.splitlines()
        if line.startswith("data: ")
    ]


def test_real_http_flow_registers_disk_review_then_starts_idempotently() -> None:
    with no_cost_echo_server() as harness:
        assert harness.runtime_generation_calls == 0
        assert harness.image_generation_calls == 0
        assert harness.tts_generation_calls == 0
        assert harness.blocked_outbound_calls == []
        with TestClient(harness.app) as client:
            home = client.get("/")
            entry_script = client.get("/static/echo-project-two-entry.js")
            assert home.status_code == 200
            assert "/static/echo-project-two-entry.js" in home.text
            assert entry_script.status_code == 200
            assert "javascript" in entry_script.headers["content-type"]

            generated = client.post(
                "/api/generate-script",
                json={"prompt": CANONICAL_PROMPT},
            )
            assert generated.status_code == 200
            events = _sse_events(generated.text)
            progress = [event for event in events if event["type"] == "progress"]
            done = [event for event in events if event["type"] == "done"]
            assert progress
            assert len(done) == 1
            assert harness.generate_prompts == [CANONICAL_PROMPT]
            assert "/api/start" not in harness.request_paths

            done_event = done[0]
            assert done_event["script_id"] == PRIMARY_SCRIPT_ID
            assert done_event["summary"]["worldbook_excerpt"] == WORLD_BOOK_EXCERPT
            assert done_event["summary"]["worldbook_truncated"] is False
            assert "path" not in done_event
            assert "path" not in done_event["summary"]
            assert "key" not in json.dumps(done_event, ensure_ascii=False).lower()
            ready = get_ready_script(PRIMARY_SCRIPT_ID)
            assert ready is not None
            assert ready.status == "ready"
            assert ready.summary == done_event["summary"]

            first_start = client.post(
                "/api/start",
                params={"script_id": PRIMARY_SCRIPT_ID},
                headers={"Idempotency-Key": START_KEY},
            )
            retry_start = client.post(
                "/api/start",
                params={"script_id": PRIMARY_SCRIPT_ID},
                headers={"Idempotency-Key": START_KEY},
            )
            assert first_start.status_code == 200
            assert retry_start.status_code == 200
            assert retry_start.json() == first_start.json()

            session_id = first_start.json()["session_id"]
            assets_stream = client.get(
                f"/api/session/{session_id}/assets-stream",
            )
            runtime_stream = client.post(
                f"/api/session/{session_id}/generate-stream",
            )
            runtime_events = _sse_events(runtime_stream.text)
            assert assets_stream.status_code == 200
            assert runtime_stream.status_code == 200
            assert any(event.get("event") == "done" for event in runtime_events)
            assert harness.runtime_generation_calls == 1
            assert harness.image_generation_calls > 0
            assert harness.tts_generation_calls == 0
            assert harness.blocked_outbound_calls == []

            second_generated = client.post(
                "/api/generate-script",
                json={"prompt": SECONDARY_PROMPT},
            )
            second_done = [
                event
                for event in _sse_events(second_generated.text)
                if event["type"] == "done"
            ]
            assert second_generated.status_code == 200
            assert second_done[0]["script_id"] == SECONDARY_SCRIPT_ID
            conflict = client.post(
                "/api/start",
                params={"script_id": SECONDARY_SCRIPT_ID},
                headers={"Idempotency-Key": START_KEY},
            )
            assert conflict.status_code == 409

            legacy_load = client.post(
                "/api/upload-sample-path",
                params={"path": str(harness.primary_script_dir)},
            )
            assert legacy_load.status_code == 200
            legacy_start = client.post(
                "/api/start",
                params={"script_id": legacy_load.json()["script_id"]},
            )
            assert legacy_start.status_code == 200
            assert legacy_start.json()["session_id"]
