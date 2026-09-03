# -*- coding: utf-8 -*-
"""
adapter.parser — GenericScriptAdapter 类

当前阶段：从 generic_adapter.py 重导出（避免 1176 行大搬迁引入回归风险）。
后续迭代将逐步把类体物理迁移到此文件。
"""

from generic_adapter import GenericScriptAdapter  # noqa: F401

__all__ = ["GenericScriptAdapter"]
