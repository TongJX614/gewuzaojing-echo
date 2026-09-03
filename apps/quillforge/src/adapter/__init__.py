# -*- coding: utf-8 -*-
"""
adapter 包 — generic_adapter.py 的模块化拆分

对外导出与 generic_adapter.py 完全一致的公共接口，
现有 `from generic_adapter import ...` 和 `from adapter import ...` 均可使用。

模块结构：
  adapter/
  ├── __init__.py      # 统一导出
  ├── parser.py        # GenericScriptAdapter 类（YAML 解析核心）
  ├── normalizer.py    # 角色字段归一化（fill_character_gaps）
  └── loader.py        # load_story / get_scene_characters / build_worldline / build_scene_text
"""

from .parser import GenericScriptAdapter  # noqa: F401
from .normalizer import fill_character_gaps, _fill_character_gaps  # noqa: F401
from .loader import (  # noqa: F401
    load_story,
    get_scene_characters,
    build_worldline,
    build_scene_text,
)

__all__ = [
    "GenericScriptAdapter",
    "load_story",
    "get_scene_characters",
    "build_worldline",
    "build_scene_text",
    "fill_character_gaps",
]
