# -*- coding: utf-8 -*-
"""Shared GEWUZAOJING environment contract tests."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

import config_manager
from config_manager import (
    GewuzaojingConfigError,
    apply_atomic_connection_override,
    get_settings,
    load_settings,
    parse_portable_env,
    resolve_gewuzaojing_env_path,
    validate_final_bind,
)


VALID_SHARED_ENV = "\n".join(
    [
        "SHARED_LLM_PROVIDER=openai-compatible",
        "SHARED_LLM_API_KEY=unit-secret",
        "SHARED_LLM_BASE_URL=https://provider.example/v1",
        "ECHO_LLM_SOURCE=shared",
        "QUILLFORGE_LLM_SOURCE=shared",
        "ECHO_CHAT_MODEL=echo-chat",
        "ECHO_QUEST_MODEL=echo-quest",
        "QUILLFORGE_RUNTIME_MODEL=runtime-model",
        "QUILLFORGE_SCRIPT_MODEL=script-model",
        "QUILLFORGE_DEBATE_MODEL=debate-model",
        "QUILLFORGE_MINIGAME_MODEL=minigame-model",
        "ECHO_HOST=127.0.0.1",
        "ECHO_PORT=5000",
        "QUILLFORGE_HOST=127.0.0.1",
        "QUILLFORGE_PORT=8050",
        "QUILLFORGE_ECHO_ENTRY_ENABLED=true",
        "IMAGE_CONCURRENCY=6",
        "TTS_CONCURRENCY=4",
    ]
) + "\n"


def assert_config_error(callable_, code: str, forbidden: str = "") -> None:
    with pytest.raises(GewuzaojingConfigError) as caught:
        callable_()
    assert caught.value.code == code
    if forbidden:
        assert forbidden not in str(caught.value)


def test_contract_is_loaded_from_repository_shared_file() -> None:
    contract = (
        Path(__file__).resolve().parents[3]
        / "shared"
        / "contracts"
        / "environment.json"
    )
    parsed = json.loads(contract.read_text(encoding="utf-8"))
    assert parsed["schemaVersion"] == 1
    assert parsed["connectionGroups"] == [
        "SHARED_LLM",
        "ECHO_LLM",
        "QUILLFORGE_LLM",
    ]


def test_portable_parser_matches_typescript_grammar() -> None:
    parsed = parse_portable_env(
        "\ufeff# comment\r\n  # indented comment\r\n\r\n"
        "API_KEY=abc=def\r\nMODEL=demo-model\r\n"
    )
    assert parsed == {"API_KEY": "abc=def", "MODEL": "demo-model"}

    invalid_texts = [
        "lower=value",
        " export KEY=value",
        'KEY="quoted"',
        "KEY='quoted'",
        "KEY=value # inline",
        "KEY=$OTHER",
        "KEY=value ",
        "KEY= value",
        "KEY",
        "KEY=value\ncontinuation",
        "KEY=first\nKEY=second",
        "KEY=value\rcontinuation",
    ]
    for invalid in invalid_texts:
        assert_config_error(lambda value=invalid: parse_portable_env(value), "ENV_SYNTAX")


def test_connection_process_override_is_atomic_and_secret_safe() -> None:
    values = parse_portable_env(VALID_SHARED_ENV)
    unchanged = apply_atomic_connection_override(values, {}, "SHARED_LLM")
    assert unchanged["SHARED_LLM_API_KEY"] == "unit-secret"

    overridden = apply_atomic_connection_override(
        values,
        {
            "SHARED_LLM_PROVIDER": "openai-compatible",
            "SHARED_LLM_API_KEY": "process-secret",
            "SHARED_LLM_BASE_URL": "https://process.example/v1",
        },
        "SHARED_LLM",
    )
    assert overridden["SHARED_LLM_API_KEY"] == "process-secret"
    assert overridden["SHARED_LLM_BASE_URL"] == "https://process.example/v1"
    assert_config_error(
        lambda: apply_atomic_connection_override(
            values, {"SHARED_LLM_API_KEY": "partial-secret"}, "SHARED_LLM"
        ),
        "ATOMIC_CONNECTION_OVERRIDE",
        "partial-secret",
    )


def test_topology_resolution_ignores_local_env_files(tmp_path: Path) -> None:
    root = tmp_path / "TiaoZhanBei2026"
    (root / "shared" / "contracts").mkdir(parents=True)
    (root / "package.json").write_text(
        '{"name":"gewuzaojing-echo","private":true}\n', encoding="utf-8"
    )
    (root / "shared" / "contracts" / "environment.json").write_text(
        '{"version":1}\n', encoding="utf-8"
    )
    echo = root / "src" / "echo"
    quillforge_repo = root / "src" / "Quillforge"
    package = quillforge_repo / "quillforge"
    source = package / "src"
    echo.mkdir(parents=True)
    source.mkdir(parents=True)
    root_env = root / ".env"
    root_env.write_text(VALID_SHARED_ENV, encoding="utf-8")
    (quillforge_repo / ".env").write_text("POISON=repo", encoding="utf-8")
    (package / ".env").write_text("POISON=package", encoding="utf-8")
    (package / ".env.example").write_text("POISON=example", encoding="utf-8")

    for start in (root, quillforge_repo, package, source):
        assert resolve_gewuzaojing_env_path({}, start) == root_env.resolve()
    assert resolve_gewuzaojing_env_path(
        {"GEWUZAOJING_ENV_FILE": str(root_env.resolve())}, source
    ) == root_env.resolve()
    assert_config_error(
        lambda: resolve_gewuzaojing_env_path(
            {"GEWUZAOJING_ENV_FILE": ".env"}, source
        ),
        "ENV_PATH_NOT_ABSOLUTE",
    )


def test_settings_select_models_connection_scalars_and_bind_rules(tmp_path: Path) -> None:
    env_path = tmp_path / "shared.env"
    env_path.write_text(VALID_SHARED_ENV, encoding="utf-8")
    settings = load_settings(environ={}, env_path=env_path)
    assert settings.source == "shared"
    assert settings.connection.provider == "openai-compatible"
    assert settings.connection.api_key == "unit-secret"
    assert settings.connection.base_url == "https://provider.example/v1/"
    assert (
        settings.runtime_model,
        settings.script_model,
        settings.debate_model,
        settings.minigame_model,
    ) == ("runtime-model", "script-model", "debate-model", "minigame-model")
    assert settings.image_concurrency == 6
    assert settings.tts_concurrency == 4
    assert validate_final_bind(settings, "127.0.0.1", 8050) == (
        "127.0.0.1",
        8050,
    )
    assert_config_error(
        lambda: validate_final_bind(settings, "0.0.0.0", 8050),
        "INVALID_PORT",
    )

    standalone_path = tmp_path / "standalone.env"
    standalone_path.write_text(
        VALID_SHARED_ENV.replace(
            "QUILLFORGE_ECHO_ENTRY_ENABLED=true",
            "QUILLFORGE_ECHO_ENTRY_ENABLED=false",
        ),
        encoding="utf-8",
    )
    standalone = load_settings(environ={}, env_path=standalone_path)
    assert validate_final_bind(standalone, "0.0.0.0", 9000) == ("0.0.0.0", 9000)


def test_dedicated_selection_scalar_override_validation_and_cache(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dedicated_text = VALID_SHARED_ENV.replace(
        "QUILLFORGE_LLM_SOURCE=shared", "QUILLFORGE_LLM_SOURCE=dedicated"
    ) + "\n".join(
        [
            "QUILLFORGE_LLM_PROVIDER=openai-compatible",
            "QUILLFORGE_LLM_API_KEY=dedicated-secret",
            "QUILLFORGE_LLM_BASE_URL=https://dedicated.example/api",
        ]
    ) + "\n"
    env_path = tmp_path / "dedicated.env"
    env_path.write_text(dedicated_text, encoding="utf-8")
    settings = load_settings(
        environ={"QUILLFORGE_SCRIPT_MODEL": "process-script"},
        env_path=env_path,
    )
    assert settings.source == "dedicated"
    assert settings.connection.api_key == "dedicated-secret"
    assert settings.script_model == "process-script"

    placeholder = tmp_path / "placeholder.env"
    placeholder.write_text(
        VALID_SHARED_ENV.replace("unit-secret", "replace-with-real-secret"),
        encoding="utf-8",
    )
    assert_config_error(
        lambda: load_settings(environ={}, env_path=placeholder),
        "PLACEHOLDER_SECRET",
        "replace-with-real-secret",
    )
    bad_base = tmp_path / "bad-base.env"
    bad_base.write_text(
        VALID_SHARED_ENV.replace(
            "https://provider.example/v1",
            "https://user:pass@provider.example/v1?leak=1",
        ),
        encoding="utf-8",
    )
    assert_config_error(
        lambda: load_settings(environ={}, env_path=bad_base), "INVALID_BASE_URL"
    )
    bad_port = tmp_path / "bad-port.env"
    bad_port.write_text(
        VALID_SHARED_ENV.replace("QUILLFORGE_PORT=8050", "QUILLFORGE_PORT=0"),
        encoding="utf-8",
    )
    assert_config_error(
        lambda: load_settings(environ={}, env_path=bad_port), "INVALID_PORT"
    )

    monkeypatch.setenv("GEWUZAOJING_ENV_FILE", str(env_path.resolve()))
    get_settings.cache_clear()
    try:
        first = get_settings()
        second = get_settings()
        assert first is second
    finally:
        get_settings.cache_clear()


def test_check_cli_is_no_network_and_value_safe(tmp_path: Path) -> None:
    env_path = tmp_path / "check.env"
    env_path.write_text(VALID_SHARED_ENV, encoding="utf-8")
    environment = os.environ.copy()
    environment["GEWUZAOJING_ENV_FILE"] = str(env_path.resolve())
    result = subprocess.run(
        [sys.executable, str(Path(config_manager.__file__).resolve()), "--check"],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=environment,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == [
        "envPathMatches=true",
        "quillforgeConfigValid=true",
        "source=shared",
    ]
    assert "unit-secret" not in (result.stdout + result.stderr)


def test_compatibility_entry_has_no_second_configuration_implementation() -> None:
    source = Path(config_manager.__file__).read_text(encoding="utf-8")
    for forbidden in (
        "BaseSettings",
        "pydantic_settings",
        "effective_api_key",
        "sk-placeholder",
        '"env_file"',
    ):
        assert forbidden not in source
