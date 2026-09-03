from pathlib import Path

from runtime_paths import ensure_runtime_paths, resolve_runtime_paths


def test_default_runtime_paths_are_under_app_var(tmp_path: Path) -> None:
    paths = resolve_runtime_paths(environ={}, app_root=tmp_path)
    assert paths.root == (tmp_path / "var").resolve()
    assert paths.uploads == paths.root / "uploads"
    assert paths.generated_images == paths.root / "generated_images"
    assert paths.generated_audio == paths.root / "generated_audio"
    assert not paths.root.exists()
    ensure_runtime_paths(paths)
    assert all(path.is_dir() for path in (paths.uploads, paths.generated_images, paths.generated_audio))


def test_absolute_override_is_allowed_and_relative_override_is_rejected(tmp_path: Path) -> None:
    external = (tmp_path / "runtime").resolve()
    assert resolve_runtime_paths({"QUILLFORGE_VAR_DIR": str(external)}, tmp_path).root == external
    try:
        resolve_runtime_paths({"QUILLFORGE_VAR_DIR": "relative"}, tmp_path)
    except ValueError as error:
        assert str(error) == "QUILLFORGE_VAR_DIR_NOT_ABSOLUTE"
    else:
        raise AssertionError("relative runtime path was accepted")
