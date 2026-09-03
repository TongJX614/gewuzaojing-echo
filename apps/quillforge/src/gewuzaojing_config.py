# -*- coding: utf-8 -*-
"""Strict shared configuration for the GEWUZAOJING applications."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path
import re
from typing import Literal, Mapping, cast
from urllib.parse import urlsplit, urlunsplit


ProviderName = Literal["openai-compatible"]
ConnectionSource = Literal["shared", "dedicated"]
ConnectionPrefix = Literal["SHARED_LLM", "ECHO_LLM", "QUILLFORGE_LLM"]


class GewuzaojingConfigError(ValueError):
    """Stable, value-safe configuration error."""

    def __init__(self, code: str, keys: tuple[str, ...] = ()) -> None:
        self.code = code
        self.keys = keys
        suffix = f": {','.join(keys)}" if keys else ""
        super().__init__(f"{code}{suffix}")


@dataclass(frozen=True)
class OpenAICompatibleConnection:
    provider: ProviderName
    api_key: str
    base_url: str


@dataclass(frozen=True)
class QuillForgeSettings:
    source: ConnectionSource
    connection: OpenAICompatibleConnection
    runtime_model: str
    script_model: str
    debate_model: str
    minigame_model: str
    host: str
    port: int
    echo_entry_enabled: bool

    llm_temperature: float = 0.8
    llm_max_tokens: int = 3000
    llm_timeout: float = 90.0
    llm_connect_timeout: float = 10.0
    script_gen_temperature: float = 0.85
    script_gen_max_tokens: int = 8000
    script_gen_timeout: float = 120.0

    session_ttl_seconds: int = 1800
    session_ttl_minutes: int = 30
    session_max_size: int = 100
    quillforge_api_key: str = ""
    rate_limit_per_minute: int = 10

    image_concurrency: int = 8
    image_bg_preload_count: int = 2
    scene_image_cap: int = 7
    tts_concurrency: int = 6
    image_stagger_sec: float = 1.5
    image_remove_bg: str = "true"
    image_size_bg: str = "1344x768"
    image_size_char: str = "768x1344"

    image_api_key: str = ""
    image_base_url: str = ""
    image_model: str = "black-forest-labs/FLUX.1-schnell"
    image_quality: str = ""
    image_watermark: str = ""

    tts_api_key: str = ""
    tts_base_url: str = ""
    tts_model: str = "mimo-v2.5-tts-voiceclone"
    tts_fallback_model: str = "mimo-v2.5-tts"
    tts_default_voice: str = "mimo_default"
    tts_default_voice_male: str = "苏打"
    tts_default_voice_female: str = "冰糖"
    tts_voice_map: str = ""
    tts_voice_male_by_age: str = ""
    tts_voice_female_by_age: str = ""
    tts_age_thresholds: str = "18,35,55"

    numba_threading_layer: str = "workqueue"
    numba_num_threads: int = 1


def parse_portable_env(text: str) -> dict[str, str]:
    """Parse the strict grammar shared with Echo's TypeScript loader."""

    source = text[1:] if text.startswith("\ufeff") else text
    values: dict[str, str] = {}
    for raw_line in re.split(r"\r?\n", source):
        if "\r" in raw_line:
            raise GewuzaojingConfigError("ENV_SYNTAX")
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        separator = raw_line.find("=")
        if separator <= 0:
            raise GewuzaojingConfigError("ENV_SYNTAX")
        key = raw_line[:separator]
        value = raw_line[separator + 1 :]
        if re.fullmatch(r"[A-Z][A-Z0-9_]*", key) is None:
            raise GewuzaojingConfigError("ENV_SYNTAX")
        if value != value.strip() or re.search("[\"'#$]", value):
            raise GewuzaojingConfigError("ENV_SYNTAX", (key,))
        if key in values:
            raise GewuzaojingConfigError("ENV_SYNTAX", (key,))
        values[key] = value
    return values


def read_portable_env_file(path: str | Path) -> dict[str, str]:
    candidate = Path(path)
    if not candidate.exists():
        raise GewuzaojingConfigError("ENV_FILE_MISSING")
    try:
        return parse_portable_env(candidate.read_text(encoding="utf-8"))
    except GewuzaojingConfigError:
        raise
    except (OSError, UnicodeError):
        raise GewuzaojingConfigError("ENV_FILE_READ_FAILED") from None


def find_repository_root(start_path: str | Path) -> Path:
    candidate = Path(start_path).resolve()
    current = candidate if candidate.is_dir() else candidate.parent
    for directory in (current, *current.parents):
        if (
            (directory / "package.json").is_file()
            and (directory / "shared" / "contracts" / "environment.json").is_file()
        ):
            return directory
    raise GewuzaojingConfigError(
        "AGGREGATION_ROOT_NOT_FOUND", ("GEWUZAOJING_ENV_FILE",)
    )


def resolve_gewuzaojing_env_path(
    environ: Mapping[str, str] | None = None,
    start_path: str | Path | None = None,
) -> Path:
    """Resolve only the aggregation-root .env, never a nearest local file."""

    environment = os.environ if environ is None else environ
    override = environment.get("GEWUZAOJING_ENV_FILE")
    if override is not None:
        override_path = Path(override)
        if not override_path.is_absolute():
            raise GewuzaojingConfigError(
                "ENV_PATH_NOT_ABSOLUTE", ("GEWUZAOJING_ENV_FILE",)
            )
        return override_path.resolve()
    return (find_repository_root(start_path or Path(__file__)) / ".env").resolve()


def apply_atomic_connection_override(
    file_values: Mapping[str, str],
    environ: Mapping[str, str],
    prefix: ConnectionPrefix,
) -> dict[str, str]:
    keys = (
        f"{prefix}_PROVIDER",
        f"{prefix}_API_KEY",
        f"{prefix}_BASE_URL",
    )
    present = tuple(key for key in keys if key in environ)
    if not present:
        return dict(file_values)
    if len(present) != len(keys):
        raise GewuzaojingConfigError("ATOMIC_CONNECTION_OVERRIDE", present)
    return {
        **file_values,
        keys[0]: environ[keys[0]],
        keys[1]: environ[keys[1]],
        keys[2]: environ[keys[2]],
    }


def _required(values: Mapping[str, str], key: str) -> str:
    value = values.get(key)
    if value is None or not value:
        raise GewuzaojingConfigError("REQUIRED_ENV_VALUE", (key,))
    return value


def _scalar(
    values: Mapping[str, str], environ: Mapping[str, str], key: str
) -> str:
    if key in environ:
        value = environ[key]
        if not value:
            raise GewuzaojingConfigError("REQUIRED_ENV_VALUE", (key,))
        return value
    return _required(values, key)


def _optional(
    values: Mapping[str, str],
    environ: Mapping[str, str],
    key: str,
    default: str,
) -> str:
    return environ[key] if key in environ else values.get(key, default)


def _integer(
    values: Mapping[str, str],
    environ: Mapping[str, str],
    key: str,
    default: int,
    minimum: int = 1,
) -> int:
    raw = _optional(values, environ, key, str(default))
    if re.fullmatch(r"\d+", raw) is None:
        raise GewuzaojingConfigError("ENV_SYNTAX", (key,))
    value = int(raw)
    if value < minimum:
        raise GewuzaojingConfigError("ENV_SYNTAX", (key,))
    return value


def _float(
    values: Mapping[str, str],
    environ: Mapping[str, str],
    key: str,
    default: float,
    minimum: float = 0.0,
) -> float:
    raw = _optional(values, environ, key, str(default))
    try:
        value = float(raw)
    except ValueError:
        raise GewuzaojingConfigError("ENV_SYNTAX", (key,)) from None
    if value < minimum:
        raise GewuzaojingConfigError("ENV_SYNTAX", (key,))
    return value


def _port(values: Mapping[str, str], environ: Mapping[str, str], key: str) -> int:
    raw = _scalar(values, environ, key)
    if re.fullmatch(r"\d+", raw) is None:
        raise GewuzaojingConfigError("INVALID_PORT", (key,))
    port = int(raw)
    if port < 1 or port > 65535:
        raise GewuzaojingConfigError("INVALID_PORT", (key,))
    return port


def _boolean(
    values: Mapping[str, str], environ: Mapping[str, str], key: str
) -> bool:
    raw = _scalar(values, environ, key)
    if raw == "true":
        return True
    if raw == "false":
        return False
    raise GewuzaojingConfigError("ENV_SYNTAX", (key,))


def _base_url(raw: str, key: str) -> str:
    try:
        parsed = urlsplit(raw)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError
        path = parsed.path if parsed.path.endswith("/") else f"{parsed.path}/"
        return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))
    except (TypeError, ValueError):
        raise GewuzaojingConfigError("INVALID_BASE_URL", (key,)) from None


def _api_key(raw: str, key: str) -> str:
    if re.search(
        r"(?:placeholder|replace-|change-?me|example-secret)", raw, re.IGNORECASE
    ):
        raise GewuzaojingConfigError("PLACEHOLDER_SECRET", (key,))
    return raw


def load_settings(
    environ: Mapping[str, str] | None = None,
    env_path: str | Path | None = None,
    start_path: str | Path | None = None,
) -> QuillForgeSettings:
    """Load and validate one uncached settings object."""

    environment = dict(os.environ if environ is None else environ)
    if env_path is None:
        source_path = resolve_gewuzaojing_env_path(environment, start_path)
    else:
        source_path = Path(env_path)
        if not source_path.is_absolute():
            raise GewuzaojingConfigError("ENV_PATH_NOT_ABSOLUTE", ("env_path",))
        source_path = source_path.resolve()

    values = read_portable_env_file(source_path)
    for raw_prefix in ("SHARED_LLM", "ECHO_LLM", "QUILLFORGE_LLM"):
        prefix = cast(ConnectionPrefix, raw_prefix)
        values = apply_atomic_connection_override(values, environment, prefix)

    source_value = _scalar(values, environment, "QUILLFORGE_LLM_SOURCE")
    if source_value not in {"shared", "dedicated"}:
        raise GewuzaojingConfigError(
            "INVALID_CONNECTION_SOURCE", ("QUILLFORGE_LLM_SOURCE",)
        )
    source = cast(ConnectionSource, source_value)
    prefix = "SHARED_LLM" if source == "shared" else "QUILLFORGE_LLM"
    provider_key = f"{prefix}_PROVIDER"
    api_key_name = f"{prefix}_API_KEY"
    base_url_key = f"{prefix}_BASE_URL"
    if _required(values, provider_key) != "openai-compatible":
        raise GewuzaojingConfigError("UNSUPPORTED_PROVIDER", (provider_key,))

    return QuillForgeSettings(
        source=source,
        connection=OpenAICompatibleConnection(
            provider="openai-compatible",
            api_key=_api_key(_required(values, api_key_name), api_key_name),
            base_url=_base_url(_required(values, base_url_key), base_url_key),
        ),
        runtime_model=_scalar(values, environment, "QUILLFORGE_RUNTIME_MODEL"),
        script_model=_scalar(values, environment, "QUILLFORGE_SCRIPT_MODEL"),
        debate_model=_scalar(values, environment, "QUILLFORGE_DEBATE_MODEL"),
        minigame_model=_scalar(values, environment, "QUILLFORGE_MINIGAME_MODEL"),
        host=_scalar(values, environment, "QUILLFORGE_HOST"),
        port=_port(values, environment, "QUILLFORGE_PORT"),
        echo_entry_enabled=_boolean(
            values, environment, "QUILLFORGE_ECHO_ENTRY_ENABLED"
        ),
        llm_temperature=_float(values, environment, "LLM_TEMPERATURE", 0.8),
        llm_max_tokens=_integer(values, environment, "LLM_MAX_TOKENS", 3000),
        llm_timeout=_float(values, environment, "LLM_TIMEOUT", 90.0),
        llm_connect_timeout=_float(
            values, environment, "LLM_CONNECT_TIMEOUT", 10.0
        ),
        script_gen_temperature=_float(
            values, environment, "SCRIPT_GEN_TEMPERATURE", 0.85
        ),
        script_gen_max_tokens=_integer(
            values, environment, "SCRIPT_GEN_MAX_TOKENS", 8000
        ),
        script_gen_timeout=_float(
            values, environment, "SCRIPT_GEN_TIMEOUT", 120.0
        ),
        session_ttl_seconds=_integer(
            values, environment, "SESSION_TTL_SECONDS", 1800
        ),
        session_ttl_minutes=_integer(
            values, environment, "SESSION_TTL_MINUTES", 30
        ),
        session_max_size=_integer(values, environment, "SESSION_MAX_SIZE", 100),
        quillforge_api_key=_optional(
            values, environment, "QUILLFORGE_API_KEY", ""
        ),
        rate_limit_per_minute=_integer(
            values, environment, "RATE_LIMIT_PER_MINUTE", 10
        ),
        image_concurrency=_integer(
            values, environment, "IMAGE_CONCURRENCY", 8
        ),
        image_bg_preload_count=_integer(
            values, environment, "IMAGE_BG_PRELOAD_COUNT", 2, minimum=0
        ),
        scene_image_cap=_integer(values, environment, "SCENE_IMAGE_CAP", 7),
        tts_concurrency=_integer(values, environment, "TTS_CONCURRENCY", 6),
        image_stagger_sec=_float(
            values, environment, "IMAGE_STAGGER_SEC", 1.5
        ),
        image_remove_bg=_optional(
            values, environment, "IMAGE_REMOVE_BG", "true"
        ),
        image_size_bg=_optional(
            values, environment, "IMAGE_SIZE_BG", "1344x768"
        ),
        image_size_char=_optional(
            values, environment, "IMAGE_SIZE_CHAR", "768x1344"
        ),
        image_api_key=_optional(values, environment, "IMAGE_API_KEY", ""),
        image_base_url=_optional(values, environment, "IMAGE_BASE_URL", ""),
        image_model=_optional(
            values,
            environment,
            "IMAGE_MODEL",
            "black-forest-labs/FLUX.1-schnell",
        ),
        image_quality=_optional(values, environment, "IMAGE_QUALITY", ""),
        image_watermark=_optional(values, environment, "IMAGE_WATERMARK", ""),
        tts_api_key=_optional(values, environment, "TTS_API_KEY", ""),
        tts_base_url=_optional(values, environment, "TTS_BASE_URL", ""),
        tts_model=_optional(
            values, environment, "TTS_MODEL", "mimo-v2.5-tts-voiceclone"
        ),
        tts_fallback_model=_optional(
            values, environment, "TTS_FALLBACK_MODEL", "mimo-v2.5-tts"
        ),
        tts_default_voice=_optional(
            values, environment, "TTS_DEFAULT_VOICE", "mimo_default"
        ),
        tts_default_voice_male=_optional(
            values, environment, "TTS_DEFAULT_VOICE_MALE", "苏打"
        ),
        tts_default_voice_female=_optional(
            values, environment, "TTS_DEFAULT_VOICE_FEMALE", "冰糖"
        ),
        tts_voice_map=_optional(values, environment, "TTS_VOICE_MAP", ""),
        tts_voice_male_by_age=_optional(
            values, environment, "TTS_VOICE_MALE_BY_AGE", ""
        ),
        tts_voice_female_by_age=_optional(
            values, environment, "TTS_VOICE_FEMALE_BY_AGE", ""
        ),
        tts_age_thresholds=_optional(
            values, environment, "TTS_AGE_THRESHOLDS", "18,35,55"
        ),
        numba_threading_layer=_optional(
            values, environment, "NUMBA_THREADING_LAYER", "workqueue"
        ),
        numba_num_threads=_integer(
            values, environment, "NUMBA_NUM_THREADS", 1
        ),
    )


@lru_cache(maxsize=1)
def get_settings() -> QuillForgeSettings:
    """Return the single validated settings object for this process."""

    return load_settings()


def validate_final_bind(
    settings: QuillForgeSettings, host: str, port: int
) -> tuple[str, int]:
    """Enforce the fixed localhost entry used by Echo's Project Two portal."""

    if not host or port < 1 or port > 65535:
        raise GewuzaojingConfigError(
            "INVALID_PORT", ("QUILLFORGE_HOST", "QUILLFORGE_PORT")
        )
    if settings.echo_entry_enabled and (host != "127.0.0.1" or port != 8050):
        raise GewuzaojingConfigError(
            "INVALID_PORT", ("QUILLFORGE_HOST", "QUILLFORGE_PORT")
        )
    return host, port


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate QuillForge configuration")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("only --check is supported")

    environment = dict(os.environ)
    env_path = resolve_gewuzaojing_env_path(environment)
    settings = load_settings(environ=environment, env_path=env_path)
    print("envPathMatches=true")
    print("quillforgeConfigValid=true")
    print(f"source={settings.source}")
    return 0
