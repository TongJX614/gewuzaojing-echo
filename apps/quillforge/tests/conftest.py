# -*- coding: utf-8 -*-
"""pytest 配置和公共 fixtures"""

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# 添加 src 目录到 Python 路径
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import pytest


_ORIGINAL_ENV_FILE = os.environ.get("GEWUZAOJING_ENV_FILE")
_TEST_ENV_DIRECTORY = TemporaryDirectory(prefix="gewuzaojing-pytest-")
_TEST_ENV_PATH = Path(_TEST_ENV_DIRECTORY.name) / "test.env"
_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_TEST_ENV_PATH.write_text(
    (_REPOSITORY_ROOT / ".env.example")
    .read_text(encoding="utf-8")
    .replace(
        "SHARED_LLM_API_KEY=replace-with-real-secret",
        "SHARED_LLM_API_KEY=pytest-secret",
        1,
    ),
    encoding="utf-8",
)
os.environ["GEWUZAOJING_ENV_FILE"] = str(_TEST_ENV_PATH.resolve())


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    del session, exitstatus
    if _ORIGINAL_ENV_FILE is None:
        os.environ.pop("GEWUZAOJING_ENV_FILE", None)
    else:
        os.environ["GEWUZAOJING_ENV_FILE"] = _ORIGINAL_ENV_FILE
    _TEST_ENV_DIRECTORY.cleanup()
