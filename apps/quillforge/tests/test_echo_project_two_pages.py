# -*- coding: utf-8 -*-
"""Static and source-level gates for the Echo project-two review entry."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from fastapi.testclient import TestClient

from config_manager import OpenAICompatibleConnection, QuillForgeSettings
from server import create_app


ROOT = Path(__file__).parents[1]
INDEX_PATH = ROOT / "src" / "static" / "index.html"
GAME_PATH = ROOT / "src" / "static" / "game.html"
ENTRY_SCRIPT_PATH = ROOT / "src" / "static" / "echo-project-two-entry.js"
BRIDGE_PATH = ROOT / "src" / "static" / "echo-embed-bridge.js"


def _settings() -> QuillForgeSettings:
    return QuillForgeSettings(
        source="shared",
        connection=OpenAICompatibleConnection(
            provider="openai-compatible",
            api_key="test-secret",
            base_url="https://provider.example/v1/",
        ),
        runtime_model="test-runtime-model",
        script_model="test-script-model",
        debate_model="test-debate-model",
        minigame_model="test-minigame-model",
        host="127.0.0.1",
        port=8050,
        echo_entry_enabled=True,
    )


class _ScriptCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.scripts: list[str | None] = []

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        if tag == "script":
            self.scripts.append(dict(attrs).get("src"))


def _index_source() -> str:
    return INDEX_PATH.read_text(encoding="utf-8")


def test_precise_static_mount_serves_the_actual_entry_script() -> None:
    client = TestClient(create_app(_settings()))
    response = client.get("/static/echo-project-two-entry.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert response.content == ENTRY_SCRIPT_PATH.read_bytes()
    assert client.get("/static/../server.py").status_code == 404


def test_index_loads_entry_module_before_inline_bootstrap() -> None:
    client = TestClient(create_app(_settings()))
    response = client.get("/")
    assert response.status_code == 200

    collector = _ScriptCollector()
    collector.feed(response.text)
    assert collector.scripts[:3] == [
        "/static/echo-embed-bridge.js",
        "/static/echo-project-two-entry.js",
        None,
    ]


def test_embed_bridge_is_served_and_loaded_by_entry_and_game_pages() -> None:
    client = TestClient(create_app(_settings()))
    bridge = client.get("/static/echo-embed-bridge.js")
    assert bridge.status_code == 200
    assert bridge.content == BRIDGE_PATH.read_bytes()

    script_tag = '<script src="/static/echo-embed-bridge.js"></script>'
    assert script_tag in _index_source()
    game_source = GAME_PATH.read_text(encoding="utf-8")
    assert script_tag in game_source
    assert "document.addEventListener('echo:pause'" in game_source
    assert "document.addEventListener('echo:resume'" in game_source
    assert "clearTimeout(vnAutoPlayTimer)" in game_source
    assert "echoPausedAudio.pause()" in game_source


def test_bootstrap_routes_ordinary_and_project_two_without_unconditional_home() -> None:
    source = _index_source()

    assert "const entryOutcome = entryController.bootstrap();" in source
    assert "if (entryOutcome.kind === 'ordinary')" in source
    assert "showHomeScreen();" in source
    assert "\nshowHomeScreen();\n</script>" not in source
    assert "transport: { generate: generateScriptTransport }" in source
    assert "renderer: { render: renderProjectTwoView }" in source


def test_project_two_transport_uses_only_the_controller_prompt() -> None:
    source = _index_source()
    start = source.index("function generateScriptTransport(prompt, handlers)")
    end = source.index("function renderProjectTwoView", start)
    transport_source = source[start:end]

    assert "fetch('/api/generate-script'" in transport_source
    assert "body: JSON.stringify({prompt})" in transport_source
    assert "aiPromptInput" not in transport_source
    assert "location.search" not in transport_source


def test_review_start_is_explicit_and_bound_to_the_immutable_record() -> None:
    source = _index_source()

    assert "projectTwoStartBtn.addEventListener('click', startReviewedProjectTwo)" in source
    assert (
        "`/api/start?script_id=${encodeURIComponent(request.scriptId)}`" in source
    )
    assert "'Idempotency-Key': request.idempotencyKey" in source
    assert "entryController.beginReviewedStart()" in source
    assert (
        "entryController.acceptReviewedStart(request.scriptId, request.idempotencyKey)"
        in source
    )
    assert "确认世界书，进入项目二" in source
    assert "按同一简报重新生成世界书" in source
    assert "按同一简报重试" in source
    assert "重试进入项目二" in source


def test_review_title_and_worldbook_are_written_as_text_content() -> None:
    source = _index_source()

    assert "projectTwoReviewTitle.textContent = record.reviewSnapshot.title" in source
    assert (
        "projectTwoWorldbookExcerpt.textContent = "
        "record.reviewSnapshot.worldbookExcerpt" in source
    )
    assert "${record.reviewSnapshot.title}" not in source
    assert "${record.reviewSnapshot.worldbookExcerpt}" not in source
