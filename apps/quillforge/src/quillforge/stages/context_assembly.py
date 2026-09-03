# -*- coding: utf-8 -*-
"""
Stage 1: Context Assembly — 上下文组装

纯数据处理阶段，无 LLM 调用。
从 HarnessInput 构建 AssembledContext，解析世界线节点、检测当前位置、推断紧张度。

从原 harness.py 的 run() / run_stream() 中 Stage 1 逻辑提取。
"""

from __future__ import annotations

from typing import Any

from schemas import HarnessInput, AssembledContext
from ..fixtures import PreparedContext
from ..sut import NarrativeSUT
from .base import StageBase


class ContextAssemblyStage(StageBase):
    """Stage 1: 上下文组装"""

    @property
    def name(self) -> str:
        return "context_assembly"

    @property
    def stage_number(self) -> int:
        return 1

    def execute(
        self,
        ctx: PreparedContext,
        sut: NarrativeSUT,
        input_data: HarnessInput,
        extra: dict,
    ) -> AssembledContext:
        """
        组装场景上下文。
        注意：此阶段通常在 Fixture 中已完成，这里返回 ctx.assembled 即可。
        但如果 Fixture 未准备，则在此构建。
        """
        if ctx.assembled is not None:
            return ctx.assembled
        return AssembledContext.from_input(input_data)
