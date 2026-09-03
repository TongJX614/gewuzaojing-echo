# -*- coding: utf-8 -*-
"""Trusted boundary for generated scripts and their on-disk worldbooks."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import re
import stat
from threading import RLock
from typing import Literal, cast

from generic_adapter import GenericScriptAdapter


ScriptStatus = Literal["ready", "failed"]


class ScriptRegistryError(ValueError):
    """Stable, value-safe registry rejection."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class WorldbookExcerpt:
    text: str
    truncated: bool


@dataclass(frozen=True)
class RegisteredScript:
    script_id: str
    path: Path
    adapter: GenericScriptAdapter
    summary: dict[str, object]
    status: ScriptStatus


# Values deliberately retain the legacy mapping shape consumed by upload,
# debate, and minigame routes.
registered_scripts: dict[str, dict[str, object]] = {}
_registry_lock = RLock()


def _resolve_existing(path: str | Path, error_code: str) -> Path:
    try:
        return Path(path).resolve(strict=True)
    except (OSError, RuntimeError):
        raise ScriptRegistryError(error_code) from None


def _is_link_or_reparse(path: Path) -> bool:
    """Detect symlinks, Windows junctions, and other reparse-point entries."""

    try:
        if path.is_symlink():
            return True
        is_junction = getattr(path, "is_junction", None)
        if callable(is_junction) and is_junction():
            return True
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
        reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
        return bool(attributes & reparse_flag)
    except OSError:
        raise ScriptRegistryError("PATH_INSPECTION_FAILED") from None


def _absolute_without_resolving(path: str | Path) -> Path:
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return Path(os.path.abspath(candidate))


def _reject_lexical_reparse_components(
    script_dir: str | Path,
    storage_root: str | Path,
) -> None:
    lexical_root = _absolute_without_resolving(storage_root)
    lexical_target = _absolute_without_resolving(script_dir)
    try:
        relative = lexical_target.relative_to(lexical_root)
    except ValueError:
        return
    current = lexical_root
    for component in relative.parts:
        current = current / component
        if _is_link_or_reparse(current):
            raise ScriptRegistryError("REPARSE_POINT_REJECTED")


def _resolve_script_directory(
    script_dir: str | Path,
    storage_root: str | Path,
) -> tuple[Path, Path]:
    root = _resolve_existing(storage_root, "STORAGE_ROOT_INVALID")
    target = _resolve_existing(script_dir, "SCRIPT_DIRECTORY_INVALID")
    if not root.is_dir() or not target.is_dir():
        raise ScriptRegistryError("SCRIPT_DIRECTORY_INVALID")
    try:
        relative = target.relative_to(root)
    except ValueError:
        raise ScriptRegistryError("SCRIPT_PATH_OUTSIDE_STORAGE") from None
    if not relative.parts:
        raise ScriptRegistryError("SCRIPT_PATH_NOT_STRICT_CHILD")
    _reject_lexical_reparse_components(script_dir, storage_root)
    return root, target


def read_worldbook_excerpt(
    script_dir: str | Path,
    storage_root: str | Path,
    max_bytes: int = 1_048_576,
    max_codepoints: int = 280,
) -> WorldbookExcerpt:
    """Read only the exact trusted worldbook and return a normalized excerpt."""

    if max_bytes < 1 or max_codepoints < 1:
        raise ScriptRegistryError("WORLD_BOOK_LIMIT_INVALID")
    _root, target = _resolve_script_directory(script_dir, storage_root)
    lexical_worldbook = _absolute_without_resolving(script_dir) / "世界书.md"
    if _is_link_or_reparse(lexical_worldbook):
        raise ScriptRegistryError("REPARSE_POINT_REJECTED")
    worldbook = target / "世界书.md"
    try:
        if not worldbook.exists() or not worldbook.is_file():
            raise ScriptRegistryError("WORLD_BOOK_MISSING")
        if _is_link_or_reparse(worldbook):
            raise ScriptRegistryError("REPARSE_POINT_REJECTED")
        resolved_worldbook = worldbook.resolve(strict=True)
        if resolved_worldbook.parent != target:
            raise ScriptRegistryError("WORLD_BOOK_PATH_INVALID")
        if resolved_worldbook.stat().st_size > max_bytes:
            raise ScriptRegistryError("WORLD_BOOK_TOO_LARGE")
        raw = resolved_worldbook.read_bytes()
    except ScriptRegistryError:
        raise
    except OSError:
        raise ScriptRegistryError("WORLD_BOOK_READ_FAILED") from None
    try:
        text = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        raise ScriptRegistryError("WORLD_BOOK_INVALID_UTF8") from None
    normalized = " ".join(text.split())
    if len(normalized) > max_codepoints:
        return WorldbookExcerpt(
            text=normalized[:max_codepoints] + "…",
            truncated=True,
        )
    return WorldbookExcerpt(text=normalized, truncated=False)


def register_generated_script(
    script_id: str,
    script_dir: str | Path,
    storage_root: str | Path,
) -> RegisteredScript:
    """Validate, reload, summarize, and atomically register one generated package."""

    if re.fullmatch(r"[0-9a-f]{32}", script_id) is None:
        raise ScriptRegistryError("SCRIPT_ID_INVALID")
    with _registry_lock:
        if script_id in registered_scripts:
            raise ScriptRegistryError("SCRIPT_ID_COLLISION")

    excerpt = read_worldbook_excerpt(script_dir, storage_root)
    _root, resolved_dir = _resolve_script_directory(script_dir, storage_root)
    adapter = GenericScriptAdapter()
    try:
        adapter.load(str(resolved_dir))
        summary = adapter.to_summary(
            worldbook_excerpt=excerpt.text,
            worldbook_truncated=excerpt.truncated,
        )
    except Exception:
        raise ScriptRegistryError("SCRIPT_ADAPTER_INVALID") from None
    record = RegisteredScript(
        script_id=script_id,
        path=resolved_dir,
        adapter=adapter,
        summary=summary,
        status="ready",
    )
    with _registry_lock:
        if script_id in registered_scripts:
            raise ScriptRegistryError("SCRIPT_ID_COLLISION")
        registered_scripts[script_id] = {
            "adapter": record.adapter,
            "path": record.path,
            "summary": record.summary,
            "status": record.status,
        }
    return record


def get_ready_script(script_id: str) -> RegisteredScript | None:
    with _registry_lock:
        raw = registered_scripts.get(script_id)
        if raw is None or raw.get("status") != "ready":
            return None
        adapter = raw.get("adapter")
        path = raw.get("path")
        summary = raw.get("summary")
        if (
            not isinstance(adapter, GenericScriptAdapter)
            or not isinstance(path, (str, Path))
            or not isinstance(summary, dict)
        ):
            return None
        return RegisteredScript(
            script_id=script_id,
            path=Path(path),
            adapter=adapter,
            summary=cast(dict[str, object], summary),
            status="ready",
        )
