# -*- coding: utf-8 -*-
"""
Fallback 策略 — 三层保底机制

当验证失败且对话不足时，按层级降级：
  Layer 1: LLM 重试（极简 prompt，减少上下文干扰）
  Layer 2: 简化 prompt 再试
  Layer 3: 硬编码保底（轮流发言，基于角色性格生成最小对话）

从原 harness.py 的 _generate_fallback_dialogues 提取。
"""

from __future__ import annotations

import sys
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

_SRC_DIR = str(Path(__file__).resolve().parent.parent)
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from logger import get_logger
from schemas import AssembledContext, Dialogue, HarnessState
from .sut import NarrativeSUT
from .stages.dialogue import DialogueStage

logger = get_logger("harness.fallback")


class FallbackStrategy(ABC):
    """Fallback 策略抽象基类"""

    @abstractmethod
    def should_trigger(self, state: HarnessState) -> bool:
        """判断是否需要触发保底"""
        ...

    @abstractmethod
    def execute(self, ctx: AssembledContext, sut: NarrativeSUT, state: HarnessState,
                min_required: int = 0) -> list[Dialogue]:
        """执行保底策略，返回保底对话列表

        Args:
            min_required: 调用方要求的最低对话总数（子类应以此为目标生成）
        """
        ...


class DialogueFallback(FallbackStrategy):
    """
    对话保底策略：三层降级。

    Layer 1: LLM 极简 prompt 重试
    Layer 2: 简化 prompt 再试（与 Layer 1 合并，均使用极简 prompt）
    Layer 3: 硬编码保底（轮流发言）
    """

    def should_trigger(self, state: HarnessState, min_required: int = 0) -> bool:
        """当对话数量不足最低要求时触发"""
        return len(state.dialogues) < min_required

    def execute(self, ctx: AssembledContext, sut: NarrativeSUT, state: HarnessState,
                min_required: int = 0) -> list[Dialogue]:
        """执行三层保底

        Args:
            min_required: 调用方要求的最低对话总数。为 0 时回退到
                当前已有对话数（向后兼容）。
        """
        # 以调用方要求的最低数为准，而非当前已有数，
        # 否则 Layer 1 索要的轮数永远达不到要求，白白浪费 LLM 调用
        min_count = max(min_required, len(state.dialogues), 1)
        if not ctx.active_characters:
            return []

        char_names = [c.name for c in ctx.active_characters]

        # Layer 1+2: LLM 极简 prompt 保底
        try:
            raw = self._llm_fallback(ctx, sut, state.narration, min_count)
            if isinstance(raw, list):
                dialogues = self._filter_dialogues(raw, ctx)
                if len(dialogues) >= min_count:
                    logger.info("  [FALLBACK] LLM保底生成 %d 轮对话", len(dialogues))
                    return dialogues
                logger.info("  [FALLBACK] LLM保底仅 %d 轮，不足 %d，启用硬编码保底", len(dialogues), min_count)
        except Exception as e:
            logger.warning("  [FALLBACK] LLM保底异常: %s，启用硬编码保底", e)

        # Layer 3: 硬编码保底
        return self.hardcode_fallback(ctx, min_count)

    def _llm_fallback(self, ctx: AssembledContext, sut: NarrativeSUT, narration: str, min_count: int) -> list:
        """LLM 极简 prompt 保底生成"""
        char_names = [c.name for c in ctx.active_characters]
        chars_text = "\n".join(
            f"- {c.name}（{c.role}）：{c.personality[:80]}，说话风格：{c.speaking_style[:50]}"
            for c in ctx.active_characters
        )
        prompt = (
            f"你是一位剧本对话作家。请为以下场景写 {min_count} 轮角色对话。\n\n"
            f"场景：{narration[:200]}\n\n"
            f"角色：\n{chars_text}\n\n"
            f"要求：\n"
            f"1. 必须生成恰好 {min_count} 轮对话\n"
            f"2. speaker 只能是以下名字之一：{', '.join(char_names)}\n"
            f"3. 每轮必须有 speaker 和 text\n"
            f"4. 同一角色不得连续发言超过2轮\n"
            f"5. 直接输出 JSON 数组，不要添加其他文字\n\n"
            f'输出格式：[{{"speaker": "角色名", "text": "对话内容", "emotion": "平静"}}]'
        )
        system = "你是一位专业的剧本对话作家，严格按JSON格式输出。"
        return sut.call_json(system, prompt, _retries=2)

    def _filter_dialogues(self, raw: list, ctx: AssembledContext) -> list[Dialogue]:
        """过滤 LLM 保底结果中的非法 speaker"""
        char_names = [c.name for c in ctx.active_characters]
        valid_speakers = set(char_names)
        speaker_map = DialogueStage._build_speaker_map(ctx.active_characters)
        dialogues = []
        for d in raw:
            if isinstance(d, dict):
                speaker = d.get("speaker", "").strip()
                speaker = speaker_map.get(speaker, speaker)
                speaker = speaker_map.get(speaker.lower(), speaker)
                if speaker in valid_speakers and d.get("text"):
                    dialogues.append(Dialogue(
                        speaker=speaker,
                        text=d.get("text", ""),
                        emotion=d.get("emotion", "平静"),
                    ))
        return dialogues

    def hardcode_fallback(self, ctx: AssembledContext, min_count: int) -> list[Dialogue]:
        """硬编码保底：轮流发言，基于角色性格生成最小对话"""
        char_names = [c.name for c in ctx.active_characters]
        if not char_names:
            # 空角色列表时直接返回，避免下方取模除零崩溃
            logger.warning("  [FALLBACK] 无可用角色，跳过硬编码保底")
            return []
        logger.info("  [FALLBACK] 硬编码保底：为 %s 生成 %d 轮对话", char_names, min_count)
        dialogues = []
        for i in range(min_count):
            speaker = char_names[i % len(char_names)]
            char = next((c for c in ctx.active_characters if c.name == speaker), None)
            role_hint = char.role if char else ""
            text = f"（{speaker}观察着周围的情况，思考着下一步行动）"
            if char and char.personality:
                text = f"（{speaker}以{char.personality[:10]}的态度回应）目前的情况需要我们谨慎应对。"
            dialogues.append(Dialogue(
                speaker=speaker,
                text=text,
                emotion="平静",
            ))
        return dialogues
