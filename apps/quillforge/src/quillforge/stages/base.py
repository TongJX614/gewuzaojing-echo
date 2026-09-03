# -*- coding: utf-8 -*-
"""
Stage Base — 所有 Pipeline 阶段的统一接口

每个 Stage 是一个独立的、可替换的组件。
Harness 编排器按顺序调用各 Stage 的 execute / execute_stream 方法。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Generator, TYPE_CHECKING, Union

if TYPE_CHECKING:
    from ..sut import NarrativeSUT
    from ..fixtures import PreparedContext
    from schemas import HarnessInput
    from extra_context import ExtraContext

# Stage execute() 的 extra 参数类型（向后兼容 dict，新代码推荐 ExtraContext）
ExtraType = Union[dict, "ExtraContext"]


class StageBase(ABC):
    """Pipeline 阶段抽象基类

    子类必须实现：
      - name: 阶段名称（如 "context_assembly"）
      - stage_number: 阶段编号（1-5）
      - execute(): 非流式执行，返回阶段产物

    可选覆盖：
      - execute_stream(): 流式执行，yield 事件字典。
        默认实现回退到 execute()，不支持增量推送。
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """阶段名称（如 'narrative_anchoring'）"""
        ...

    @property
    @abstractmethod
    def stage_number(self) -> int:
        """阶段编号（1-5）"""
        ...

    @abstractmethod
    def execute(
        self,
        ctx: "PreparedContext",
        sut: "NarrativeSUT",
        input_data: "HarnessInput",
        extra: ExtraType,
    ) -> Any:
        """
        非流式执行阶段逻辑。

        Args:
            ctx: PreparedContext（含 AssembledContext + 渲染后的 system prompt）
            sut: System Under Test（LLM + Prompt 渲染器）
            input_data: 原始 HarnessInput
            extra: 额外上下文（世界书、叙事风格等，键以 _ 开头）

        Returns:
            阶段产物（str / list[Dialogue] / list[Choice] / ValidationResult）
        """
        ...

    def execute_stream(
        self,
        ctx: "PreparedContext",
        sut: "NarrativeSUT",
        input_data: "HarnessInput",
        extra: ExtraType,
    ) -> Generator[dict, None, Any]:
        """
        流式执行阶段逻辑，yield 事件字典。

        默认实现：调用 execute() 并包装为单个事件。
        子类可覆盖以支持增量推送（如旁白逐字、对话逐条）。
        """
        result = self.execute(ctx, sut, input_data, extra)
        yield {"event": "stage_result", "stage": self.stage_number, "result": result}

    @staticmethod
    def _common_variables(extra: ExtraType) -> dict:
        """提取所有 Stage 共用的剧本全局上下文变量。

        子类在 _build_prompt 中调用此方法后，只需补充各自特有变量。
        支持 dict（向后兼容）和 ExtraContext（类型安全）两种输入。
        """
        # ExtraContext 直接调用 to_prompt_variables()
        if hasattr(extra, "to_prompt_variables"):
            return extra.to_prompt_variables()
        # dict 回退
        return {
            "events": extra.get("_events", ""),
            "stagesOverview": extra.get("_stagesOverview", ""),
            "coreConflict": extra.get("_coreConflict", ""),
            "plotSummary": extra.get("_plotSummary", ""),
            "relationshipNetwork": extra.get("_relationshipNetwork", ""),
            "sceneDetails": extra.get("_sceneDetails", ""),
            "worldlines": extra.get("_worldlines", ""),
            "endings": extra.get("_endings", ""),
            "keyChoices": extra.get("_keyChoices", ""),
            "themes": extra.get("_themes", ""),
            "worldbookRules": extra.get("_worldbook", ""),
            "choiceHistory": extra.get("_choiceHistory", ""),
            "playerState": extra.get("_playerState", ""),
            "currentStageContext": extra.get("_currentStageContext", ""),
            "sceneBeats": extra.get("_sceneBeats", ""),
            "sceneHooks": extra.get("_sceneHooks", ""),
            "characterVoiceTones": extra.get("_characterVoiceTones", ""),
            "activeBranchContext": extra.get("_activeBranchContext", ""),
        }

    @staticmethod
    def _extra_get(extra: ExtraType, key: str, default=None):
        """统一的 extra 字段访问（兼容 dict 和 ExtraContext）。

        key 格式：带下划线前缀的原始键名（如 '_hasScriptChoices'）。
        """
        if hasattr(extra, "to_prompt_variables"):
            # ExtraContext: 去掉前导下划线，camelCase → snake_case
            import re
            attr = re.sub(r'(?<!^)(?=[A-Z])', '_', key.lstrip('_')).lower()
            return getattr(extra, attr, default)
        return extra.get(key, default)
