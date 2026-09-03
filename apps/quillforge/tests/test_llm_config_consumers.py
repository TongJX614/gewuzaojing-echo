# -*- coding: utf-8 -*-
"""Composition-boundary tests for QuillForge model configuration."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest

import llm_client
import debate_generator
import image_gen
import minigame_generator
import script_generator
import tts_gen
from config_manager import (
    OpenAICompatibleConnection,
    QuillForgeSettings,
)
from llm_client import LLMClient, LLMRequestError
from quillforge import sut as sut_module


class FakeOpenAI:
    captured: dict[str, object] = {}

    def __init__(self, **kwargs: object) -> None:
        type(self).captured = kwargs
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=lambda **_kwargs: None)
        )


def test_llm_client_uses_only_explicit_connection_and_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(llm_client, "OpenAI", FakeOpenAI)
    connection = OpenAICompatibleConnection(
        provider="openai-compatible",
        api_key="unit-secret",
        base_url="https://provider.example/v1/",
    )
    client = LLMClient(connection=connection, model="task-model")
    assert client._connection is connection
    assert client._model == "task-model"
    assert FakeOpenAI.captured["api_key"] == "unit-secret"
    assert FakeOpenAI.captured["base_url"] == "https://provider.example/v1/"


def test_llm_request_errors_do_not_expose_secret_or_provider_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(llm_client, "OpenAI", FakeOpenAI)
    connection = OpenAICompatibleConnection(
        provider="openai-compatible",
        api_key="redaction-secret",
        base_url="https://provider.example/v1/",
    )
    client = LLMClient(connection=connection, model="task-model")

    def fail(**_kwargs: object) -> None:
        raise RuntimeError("Authorization: Bearer redaction-secret provider-body")

    client.client.chat.completions.create = fail
    with pytest.raises(LLMRequestError) as caught:
        client.generate("system", "user")
    assert "redaction-secret" not in str(caught.value)
    assert "provider-body" not in str(caught.value)


def test_runtime_sources_have_no_legacy_configuration_path() -> None:
    src = Path(__file__).parents[1] / "src"
    checks = {
        src / "llm_client.py": [
            "effective_api_key",
            "sk-placeholder",
            "load_dotenv",
            "os.environ",
        ],
        src / "server.py": [
            'os.environ["OPENAI_API_KEY"]',
            "settings.openai_api_key",
        ],
        Path(__file__).parents[1] / "server_start.py": [
            "DEEPSEEK_API_KEY",
            "OPENAI_API_KEY",
            "input(",
        ],
    }
    for path, forbidden_tokens in checks.items():
        source = path.read_text(encoding="utf-8")
        for token in forbidden_tokens:
            assert token not in source, f"{path}: legacy token {token}"


def test_server_exposes_settings_factory_and_rejects_legacy_cli_source() -> None:
    server_source = (Path(__file__).parents[1] / "src" / "server.py").read_text(
        encoding="utf-8"
    )
    assert "def create_app(settings: QuillForgeSettings) -> FastAPI:" in server_source
    assert "validate_final_bind(settings" in server_source
    assert "--api-key" in server_source
    assert "已停用" in server_source


class SpyLLMClient:
    records: list[tuple[OpenAICompatibleConnection, str, dict[str, object]]] = []

    def __init__(
        self,
        connection: OpenAICompatibleConnection,
        model: str,
        **kwargs: object,
    ) -> None:
        type(self).records.append((connection, model, kwargs))


def _distinct_settings() -> QuillForgeSettings:
    base = QuillForgeSettings(
        source="shared",
        connection=OpenAICompatibleConnection(
            provider="openai-compatible",
            api_key="ownership-secret",
            base_url="https://provider.example/v1/",
        ),
        runtime_model="runtime-model",
        script_model="script-model",
        debate_model="debate-model",
        minigame_model="minigame-model",
        host="127.0.0.1",
        port=8050,
        echo_entry_enabled=True,
    )
    return replace(
        base,
        image_model="image-model",
        image_size_bg="1200x700",
        image_size_char="700x1200",
        image_stagger_sec=0.25,
        tts_model="tts-model",
        tts_fallback_model="tts-fallback",
        image_api_key="",
        tts_api_key="",
    )


def test_each_consumer_gets_its_task_model_and_the_same_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _distinct_settings()
    SpyLLMClient.records.clear()
    for module in (
        sut_module,
        script_generator,
        debate_generator,
        minigame_generator,
    ):
        monkeypatch.setattr(module, "LLMClient", SpyLLMClient)

    sut_module.NarrativeSUT(
        config={
            "quillforge": {
                "llm": {"temperature": 0.7, "maxTokens": 2345, "timeout": 91000}
            }
        },
        settings=settings,
    )
    script_generator._build_script_gen_client(settings)
    debate_generator._build_debate_client(settings)
    minigame_generator._build_minigame_client(settings)

    assert [record[1] for record in SpyLLMClient.records] == [
        "runtime-model",
        "script-model",
        "debate-model",
        "minigame-model",
    ]
    assert all(record[0] is settings.connection for record in SpyLLMClient.records)


def test_image_and_tts_helpers_use_explicit_typed_settings() -> None:
    settings = _distinct_settings()
    image = image_gen.ImageGenerator(settings)
    speech = tts_gen.TTSGenerator(settings)
    assert image._settings is settings
    assert image.model == "image-model"
    assert image.default_bg_size == "1200x700"
    assert image.default_char_size == "700x1200"
    assert speech._settings is settings
    assert speech.model == "tts-model"
    assert speech.fallback_model == "tts-fallback"


def test_yaml_and_runtime_modules_do_not_own_connections_or_models() -> None:
    package = Path(__file__).parents[1]
    config_text = (package / "config" / "quillforge_config.yaml").read_text(
        encoding="utf-8"
    )
    for forbidden in ("apiBase:", "apiKey:", "model:"):
        assert forbidden not in config_text

    source_paths = [
        package / "src" / "quillforge" / "sut.py",
        package / "src" / "script_generator.py",
        package / "src" / "debate_generator.py",
        package / "src" / "minigame_generator.py",
        package / "src" / "image_gen.py",
        package / "src" / "tts_gen.py",
        package / "src" / "dependencies.py",
        package / "src" / "routes" / "session.py",
    ]
    for path in source_paths:
        source = path.read_text(encoding="utf-8")
        for forbidden in (
            "os.environ",
            "os.getenv",
            "load_dotenv",
            "dotenv_values",
            "SCRIPT_GEN_MODEL",
            "DEBATE_MODEL",
            "MINIGAME_MODEL",
        ):
            assert forbidden not in source, f"{path}: {forbidden}"

    dependencies_source = (package / "src" / "dependencies.py").read_text(
        encoding="utf-8"
    )
    assert "settings = get_settings()" in dependencies_source
    assert "ImageGenerator(settings)" in dependencies_source
    assert "TTSGenerator(settings)" in dependencies_source
    assert "create_default_harness(settings=settings)" in dependencies_source
