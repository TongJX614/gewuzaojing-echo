# -*- coding: utf-8 -*-
"""
Stage 5: Validation Gate — 验证门控

委托给 Validator 组件对生成结果进行验证。
从原 harness.py 的 Stage 5 逻辑提取。
Validator 通过构造函数注入，不再在 Stage 内部直接 new。
"""

from __future__ import annotations

from typing import Optional

from schemas import HarnessInput, Dialogue, Choice, ValidationResult
from ..fixtures import PreparedContext
from ..sut import NarrativeSUT
from .base import StageBase


class ValidationStage(StageBase):
    """Stage 5: 验证门控"""

    def __init__(self, validator=None):
        """
        Args:
            validator: 验证器实例（实现 validate_all 方法）。
                       如果为 None，则使用默认的 NarrativeValidator。
        """
        self._validator = validator

    @property
    def name(self) -> str:
        return "validation_gate"

    @property
    def stage_number(self) -> int:
        return 5

    def execute(
        self,
        ctx: PreparedContext,
        sut: NarrativeSUT,
        input_data: HarnessInput,
        extra: dict,
        narration: str = "",
        dialogues: list[Dialogue] = None,
        choices: list[Choice] = None,
        retry_count: int = 0,
    ) -> ValidationResult:
        """执行验证"""
        dialogues = dialogues or []
        choices = choices or []

        validator = self._get_validator(input_data, ctx.assembled)
        return validator.validate_all(narration, dialogues, choices, retry_count=retry_count)

    def _get_validator(self, input_data: HarnessInput, assembled=None):
        """获取验证器实例（延迟创建，因为需要 input_data 的对话数量约束）"""
        if self._validator is not None:
            return self._validator

        # 默认使用 NarrativeValidator
        from validator import NarrativeValidator
        return NarrativeValidator(
            context=assembled,
            min_dialogues=input_data.options.dialogue_count_min,
            max_dialogues=input_data.options.dialogue_count_max,
        )
