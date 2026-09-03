# -*- coding: utf-8 -*-
"""
QuillForge — AI 互动叙事生成引擎（Harness 架构）

核心设计原则：
  1. SUT 隔离：LLM + Prompt 独立为可替换的 SUT 组件
  2. 可插拔 Stage：每个阶段是独立类，实现统一接口
  3. Observer 模式：事件发射与执行逻辑解耦
  4. Fixture 系统：前置数据准备/后置清理
  5. Fallback 策略：三层保底机制抽象为可插拔策略
  6. 薄编排器：Harness 核心只负责组装和驱动
"""

from __future__ import annotations

# Public API
from .core import Harness, create_default_harness
from .sut import NarrativeSUT, LLMClient
from .stages.base import StageBase
from .stages.context_assembly import ContextAssemblyStage
from .stages.narrative import NarrativeStage
from .stages.dialogue import DialogueStage
from .stages.choices import ChoicesStage
from .stages.validation import ValidationStage
from .observer import (
    HarnessObserver,
    LoggingObserver,
    SSEObserver,
    MetricsObserver,
)
from .fixtures import Fixture, ContextFixture, PromptFixture
from .fallback import FallbackStrategy, DialogueFallback

__all__ = [
    # Core
    "Harness",
    "create_default_harness",
    # SUT
    "NarrativeSUT",
    "LLMClient",
    # Stages
    "StageBase",
    "ContextAssemblyStage",
    "NarrativeStage",
    "DialogueStage",
    "ChoicesStage",
    "ValidationStage",
    # Observers
    "HarnessObserver",
    "LoggingObserver",
    "SSEObserver",
    "MetricsObserver",
    # Fixtures
    "Fixture",
    "ContextFixture",
    "PromptFixture",
    # Fallback
    "FallbackStrategy",
    "DialogueFallback",
]
