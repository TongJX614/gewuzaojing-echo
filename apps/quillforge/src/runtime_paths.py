from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class RuntimePaths:
    root: Path
    uploads: Path
    generated_images: Path
    generated_audio: Path


def resolve_runtime_paths(
    environ: Mapping[str, str] | None = None,
    app_root: str | Path | None = None,
) -> RuntimePaths:
    environment = os.environ if environ is None else environ
    root = Path(app_root).resolve() if app_root is not None else Path(__file__).resolve().parents[1]
    override = environment.get("QUILLFORGE_VAR_DIR")
    if override is not None:
        runtime_root = Path(override)
        if not runtime_root.is_absolute():
            raise ValueError("QUILLFORGE_VAR_DIR_NOT_ABSOLUTE")
        runtime_root = runtime_root.resolve()
    else:
        runtime_root = (root / "var").resolve()
    return RuntimePaths(
        root=runtime_root,
        uploads=runtime_root / "uploads",
        generated_images=runtime_root / "generated_images",
        generated_audio=runtime_root / "generated_audio",
    )


def ensure_runtime_paths(paths: RuntimePaths) -> RuntimePaths:
    for directory in (paths.uploads, paths.generated_images, paths.generated_audio):
        directory.mkdir(parents=True, exist_ok=True)
    return paths
