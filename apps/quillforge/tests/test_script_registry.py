# -*- coding: utf-8 -*-
"""Trusted generated-script registry and worldbook boundary tests."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

import script_registry
from script_registry import (
    ScriptRegistryError,
    get_ready_script,
    read_worldbook_excerpt,
    register_generated_script,
    registered_scripts,
)


def write_generated_package(
    storage_root: Path,
    name: str = "generated",
    *,
    worldbook_text: str | None = "真实世界书",
) -> Path:
    script_dir = storage_root / name
    script_dir.mkdir(parents=True)
    (script_dir / "剧本.yaml").write_text(
        """
title: 磁盘剧本
characters:
  - id: observer
    name: 观察者
    role: 主角
worldline: 开始 → 结束
scenes:
  - id: scene-1
    name: 第一幕
    description: 开始
""".strip(),
        encoding="utf-8",
    )
    if worldbook_text is not None:
        (script_dir / "世界书.md").write_text(worldbook_text, encoding="utf-8")
    return script_dir


@pytest.fixture(autouse=True)
def clear_registry() -> None:
    registered_scripts.clear()
    yield
    registered_scripts.clear()


def test_registers_valid_directory_strictly_below_storage_root(
    tmp_path: Path,
) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root, worldbook_text="规则一\n\n规则二")

    record = register_generated_script(
        "a" * 32,
        script_dir,
        root,
    )

    assert record.status == "ready"
    assert record.path == script_dir.resolve()
    assert record.summary["title"] == "磁盘剧本"
    assert record.summary["worldbook_excerpt"] == "规则一 规则二"
    assert record.summary["worldbook_truncated"] is False
    assert registered_scripts["a" * 32]["adapter"] is record.adapter
    assert registered_scripts["a" * 32]["path"] == record.path
    assert registered_scripts["a" * 32]["summary"] == record.summary
    assert registered_scripts["a" * 32]["status"] == "ready"
    assert get_ready_script("a" * 32) == record


def test_storage_root_itself_is_not_a_generated_directory(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    write_generated_package(root)
    with pytest.raises(ScriptRegistryError):
        read_worldbook_excerpt(root, root)


def test_rejects_parent_traversal_and_absolute_escape(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    root.mkdir()
    outside = write_generated_package(tmp_path / "outside-root")
    for candidate in (root / ".." / "outside-root" / "generated", outside):
        with pytest.raises(ScriptRegistryError):
            read_worldbook_excerpt(candidate, root)


def test_rejects_directory_symlink_escape(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    root.mkdir()
    outside = write_generated_package(tmp_path / "outside")
    linked = root / "linked"
    try:
        os.symlink(outside, linked, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"directory symlink unavailable: {type(error).__name__}")
    with pytest.raises(ScriptRegistryError):
        read_worldbook_excerpt(linked, root)


def test_rejects_worldbook_file_symlink(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root, worldbook_text=None)
    outside = tmp_path / "outside-worldbook.md"
    outside.write_text("outside", encoding="utf-8")
    try:
        os.symlink(outside, script_dir / "世界书.md")
    except OSError as error:
        pytest.skip(f"file symlink unavailable: {type(error).__name__}")
    with pytest.raises(ScriptRegistryError):
        read_worldbook_excerpt(script_dir, root)


def test_rejects_detected_reparse_component(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root)
    original = script_registry._is_link_or_reparse
    monkeypatch.setattr(
        script_registry,
        "_is_link_or_reparse",
        lambda path: path == script_dir or original(path),
    )
    with pytest.raises(ScriptRegistryError):
        read_worldbook_excerpt(script_dir, root)


def test_requires_exact_worldbook_filename(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root, worldbook_text=None)
    (script_dir / "我的世界设定.md").write_text("wrong file", encoding="utf-8")
    with pytest.raises(ScriptRegistryError):
        read_worldbook_excerpt(script_dir, root)


@pytest.mark.parametrize(
    ("size", "accepted"),
    [(1_048_576, True), (1_048_577, False)],
)
def test_worldbook_size_boundary(
    tmp_path: Path,
    size: int,
    accepted: bool,
) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root, worldbook_text=None)
    (script_dir / "世界书.md").write_bytes(b"x" * size)
    if accepted:
        excerpt = read_worldbook_excerpt(script_dir, root)
        assert excerpt.text == "x" * 280 + "…"
        assert excerpt.truncated is True
    else:
        with pytest.raises(ScriptRegistryError):
            read_worldbook_excerpt(script_dir, root)


def test_rejects_invalid_utf8(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root, worldbook_text=None)
    (script_dir / "世界书.md").write_bytes(b"valid\xffinvalid")
    with pytest.raises(ScriptRegistryError):
        read_worldbook_excerpt(script_dir, root)


def test_normalizes_whitespace(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(
        root,
        worldbook_text="  第一条\n\t第二条\r\n  第三条  ",
    )
    excerpt = read_worldbook_excerpt(script_dir, root)
    assert excerpt.text == "第一条 第二条 第三条"
    assert excerpt.truncated is False


@pytest.mark.parametrize("length", [279, 280, 281])
def test_excerpt_codepoint_boundary(tmp_path: Path, length: int) -> None:
    root = tmp_path / f"samples-{length}"
    script_dir = write_generated_package(root, worldbook_text="界" * length)
    excerpt = read_worldbook_excerpt(script_dir, root)
    assert excerpt.text == ("界" * length if length <= 280 else "界" * 280 + "…")
    assert excerpt.truncated is (length > 280)


def test_counts_emoji_and_combining_characters_as_python_codepoints(
    tmp_path: Path,
) -> None:
    root = tmp_path / "samples"
    text = "😀" * 278 + "e\u0301"
    assert len(text) == 280
    script_dir = write_generated_package(root, worldbook_text=text)
    excerpt = read_worldbook_excerpt(script_dir, root)
    assert excerpt.text == text
    assert excerpt.truncated is False


def test_xss_looking_worldbook_remains_plain_string(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    text = "<img src=x onerror=window.__projectTwoXss=1>"
    script_dir = write_generated_package(root, worldbook_text=text)
    excerpt = read_worldbook_excerpt(script_dir, root)
    assert excerpt.text == text
    assert isinstance(excerpt.text, str)


def test_adapter_failure_leaves_no_ready_record(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root)

    def fail_load(self: object, source: str) -> None:
        raise ValueError("adapter failure")

    monkeypatch.setattr(script_registry.GenericScriptAdapter, "load", fail_load)
    with pytest.raises(ScriptRegistryError):
        register_generated_script("b" * 32, script_dir, root)
    assert get_ready_script("b" * 32) is None
    assert "b" * 32 not in registered_scripts


def test_worldbook_failure_leaves_no_ready_record(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    script_dir = write_generated_package(root, worldbook_text=None)
    with pytest.raises(ScriptRegistryError):
        register_generated_script("c" * 32, script_dir, root)
    assert get_ready_script("c" * 32) is None
    assert "c" * 32 not in registered_scripts


def test_duplicate_script_id_is_rejected_without_overwrite(tmp_path: Path) -> None:
    root = tmp_path / "samples"
    first = write_generated_package(root, "first", worldbook_text="first")
    second = write_generated_package(root, "second", worldbook_text="second")
    original = register_generated_script("d" * 32, first, root)
    with pytest.raises(ScriptRegistryError):
        register_generated_script("d" * 32, second, root)
    assert get_ready_script("d" * 32) == original
