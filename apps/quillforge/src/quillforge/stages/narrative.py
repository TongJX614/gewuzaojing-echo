# -*- coding: utf-8 -*-
"""
Stage 2: Narrative Anchoring — 叙事锚定

调用 SUT 生成场景旁白文本，支持流式/非流式两种模式。
从原 harness.py 的 _stage_narrative / _stage_narrative_stream / _build_narrative_prompt 提取。
"""

from __future__ import annotations

import re
from typing import Generator

from schemas import HarnessInput, AssembledContext
from ..fixtures import PreparedContext
from ..sut import NarrativeSUT
from .base import StageBase


class NarrativeStage(StageBase):
    """Stage 2: 生成场景旁白"""

    @property
    def name(self) -> str:
        return "narrative_anchoring"

    @property
    def stage_number(self) -> int:
        return 2

    def execute(
        self,
        ctx: PreparedContext,
        sut: NarrativeSUT,
        input_data: HarnessInput,
        extra: dict,
    ) -> str:
        """非流式生成旁白"""
        user_prompt = self._build_prompt(ctx.assembled, input_data, extra, sut)
        narration = sut.call(ctx.rendered_system_prompt, user_prompt)
        return self._clean_narration(narration)

    def execute_stream(
        self,
        ctx: PreparedContext,
        sut: NarrativeSUT,
        input_data: HarnessInput,
        extra: dict,
    ) -> Generator[dict, None, str]:
        """流式生成旁白，逐块 yield 增量文本"""
        user_prompt = self._build_prompt(ctx.assembled, input_data, extra, sut)
        narration = ""
        for delta in sut.call_stream(ctx.rendered_system_prompt, user_prompt):
            narration += delta
            yield {"event": "narration_delta", "delta": delta}
        narration = self._clean_narration(narration)
        yield {"event": "narration", "text": narration}
        return narration

    def _build_prompt(
        self,
        assembled: AssembledContext,
        inp: HarnessInput,
        extra: dict,
        sut: NarrativeSUT,
    ) -> str:
        """构建旁白生成的 user prompt"""
        variables = self._common_variables(extra)
        variables.update({
            "worldline": assembled.raw_worldline,
            "annotatedWorldline": assembled.annotated_worldline,
            "currentNode": assembled.current_node,
            "nodeIndex": assembled.node_index + 1,
            "totalNodes": assembled.total_nodes,
            "previousNode": assembled.previous_node or "（起始）",
            "nextNode": assembled.next_node or "（终局）",
            "worldlineProgress": int(assembled.worldline_progress * 100),
            "sceneDescription": assembled.scene_description,
            "characters": assembled.active_characters,
            "playerDecision": assembled.player_decision,
            "previousNarration": inp.previous_context.narration if inp.previous_context else "",
        })
        return sut.render_template(sut.prompts["narration"], variables)

    @staticmethod
    def _clean_narration(narration: str) -> str:
        """清理旁白中可能的 markdown 标记"""
        narration = narration.strip()
        if narration.startswith("```"):
            narration = re.sub(r'^```[a-z]*\n?', '', narration)
            narration = re.sub(r'\n?```$', '', narration)
        return narration.strip()

    @staticmethod
    def truncate(narration: str, max_chars: int = 250) -> str:
        """硬截断旁白到 max_chars 字以内，在句号/感叹号/问号处断句"""
        if len(narration) <= max_chars:
            return narration
        cut = narration[:max_chars]
        for punct in ('。', '！', '？', '…', '.', '!', '?'):
            idx = cut.rfind(punct)
            if idx > max_chars // 2:
                return cut[:idx + 1]
        return cut.rstrip() + '……'
