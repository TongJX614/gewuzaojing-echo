# -*- coding: utf-8 -*-
"""Compatibility exports for the strict GEWUZAOJING configuration."""

from __future__ import annotations

from gewuzaojing_config import (  # noqa: F401
    ConnectionSource,
    GewuzaojingConfigError,
    OpenAICompatibleConnection,
    ProviderName,
    QuillForgeSettings,
    apply_atomic_connection_override,
    get_settings,
    load_settings,
    main as _gewuzaojing_main,
    parse_portable_env,
    read_portable_env_file,
    resolve_gewuzaojing_env_path,
    validate_final_bind,
)


if __name__ == "__main__":
    raise SystemExit(_gewuzaojing_main())
