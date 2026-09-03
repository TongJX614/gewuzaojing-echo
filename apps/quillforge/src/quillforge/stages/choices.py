# -*- coding: utf-8 -*-
"""
Stage 4: Choice Branching — 选择分支

调用 SUT 生成选择分支选项，支持剧本预设选项跳过。
从原 harness.py 的 _stage_choices 提取。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Generator

_SRC_DIR = str(Path(__file__).resolve().parent.parent.parent)
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from logger import get_logger
from schemas import HarnessInput, AssembledContext, Dialogue, Choice
from ..fixtures import PreparedContext
from ..sut import NarrativeSUT
from .base import StageBase

logger = get_logger("stage.choices")


class ChoicesStage(StageBase):
    """Stage 4: 生成选择分支"""

    @property
    def name(self) -> str:
        return "choice_branching"

    @property
    def stage_number(self) -> int:
        return 4

    def execute(
        self,
        ctx: PreparedContext,
        sut: NarrativeSUT,
        input_data: HarnessInput,
        extra: dict,
        narration: str = "",
        dialogues: list[Dialogue] = None,
    ) -> list[Choice]:
        """
        生成选择分支。

        当剧本已定义选项时（_hasScriptChoices），跳过 LLM 生成，
        直接使用剧本选项。
        """
        dialogues = dialogues or []

        # 剧本预设选项跳过
        if self._extra_get(extra, "_hasScriptChoices"):
            logger.info("[Stage 4/5] 选择分支 (跳过：剧本已定义选项)")
            script_choices_raw = self._extra_get(extra, "_scriptChoices", [])
            # 剧本未填 effect 时补默认值（轮换措辞兼顾多样性），否则 schema_compliance 必挂且重试无意义
            _default_effects = ("推动剧情发展", "深入探索当前处境", "谨慎观察后再行动")
            return [
                Choice(
                    text=c.get("text", ""),
                    effect=c.get("effect", "") or _default_effects[i % len(_default_effects)],
                    worldline_impact=c.get("worldlineImpact", "advance"),
                )
                for i, c in enumerate(script_choices_raw)
            ]

        user_prompt = self._build_prompt(ctx.assembled, input_data, extra, narration, dialogues, sut)
        choices: list[Choice] = []

        try:
            raw_choices = sut.call_json(ctx.rendered_system_prompt, user_prompt)
        except (ValueError, json.JSONDecodeError, KeyError) as e:
            logger.info("  [CHOICES] LLM JSON 解析失败: %s", e)
            return choices

        if isinstance(raw_choices, list):
            for c in raw_choices:
                if isinstance(c, dict):
                    choices.append(Choice(
                        text=c.get("text", ""),
                        effect=c.get("effect", ""),
                        worldline_impact=c.get("worldlineImpact", "advance"),
                    ))

        return choices

    def execute_stream(
        self,
        ctx: PreparedContext,
        sut: NarrativeSUT,
        input_data: HarnessInput,
        extra: dict,
        narration: str = "",
        dialogues: list[Dialogue] = None,
    ) -> Generator[dict, None, list[Choice]]:
        """流式生成选项（选项通常一次性返回，流式仅包装为事件）"""
        choices = self.execute(ctx, sut, input_data, extra, narration, dialogues)
        yield {"event": "choices", "choices": [c.to_dict() for c in choices]}
        return choices

    def _build_prompt(
        self,
        assembled: AssembledContext,
        inp: HarnessInput,
        extra: dict,
        narration: str,
        dialogues: list[Dialogue],
        sut: NarrativeSUT,
    ) -> str:
        """构建选择分支的 user prompt"""
        variables = self._common_variables(extra)
        variables.update({
            "narration": narration,
            "dialogues": [d.to_dict() for d in dialogues],
            "worldline": assembled.raw_worldline,
            "currentNode": assembled.current_node,
            "nextNode": assembled.next_node or "（终局）",
            "worldlineProgress": int(assembled.worldline_progress * 100),
        })
        return sut.render_template(sut.prompts["choices"], variables)
