# -*- coding: utf-8 -*-
"""
Fixture 系统 — 前置数据准备 / 后置清理

Fixture 负责在 Stage 执行前准备上下文数据，执行后清理资源。
这实现了 Harness 架构中的 Setup/Teardown 生命周期管理。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from schemas import HarnessInput, AssembledContext


@dataclass
class PreparedContext:
    """Fixture 准备后的完整上下文，传递给所有 Stage"""
    assembled: AssembledContext          # Stage 1 产物：组装后的场景上下文
    rendered_system_prompt: str = ""    # 渲染后的系统提示词
    extra: dict = field(default_factory=dict)  # 额外上下文（世界书、叙事风格等）


class Fixture(ABC):
    """Fixture 抽象基类：前置数据准备 / 后置清理"""

    @abstractmethod
    def setup(self, input_data: dict | HarnessInput, extra: dict = None) -> dict:
        """
        前置准备：从输入数据构建执行所需的上下文。

        Args:
            input_data: 原始输入（dict 或 HarnessInput）
            extra: 额外上下文字典

        Returns:
            准备后的上下文片段，合并到 PreparedContext
        """
        ...

    def teardown(self, context: PreparedContext) -> None:
        """后置清理：释放资源、清理临时数据。默认空实现。"""
        pass


class ContextFixture(Fixture):
    """
    准备 AssembledContext。

    从 HarnessInput 构建 AssembledContext（Stage 1 的核心逻辑），
    解析世界线节点、检测当前位置、推断紧张度等。
    """

    def setup(self, input_data: dict | HarnessInput, extra: dict = None) -> dict:
        if isinstance(input_data, dict):
            harness_input = HarnessInput.from_dict(input_data)
        else:
            harness_input = input_data
        assembled = AssembledContext.from_input(harness_input)
        return {"assembled": assembled, "harness_input": harness_input}


class PromptFixture(Fixture):
    """
    准备渲染后的系统提示词。

    将世界书约束、叙事风格等变量注入系统提示词模板，
    生成最终供 Stage 2-4 使用的 system prompt。
    """

    def __init__(self, sut):
        self.sut = sut

    def setup(self, input_data: dict | HarnessInput, extra: dict = None) -> dict:
        extra = extra or {}
        if isinstance(input_data, dict):
            harness_input = HarnessInput.from_dict(input_data)
        else:
            harness_input = input_data
        rendered = self.sut.render_system_prompt(extra, harness_input)
        return {"rendered_system_prompt": rendered}
