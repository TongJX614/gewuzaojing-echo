# -*- coding: utf-8 -*-
"""
Observer 模式 — 事件发射与执行逻辑解耦

观察者监听 Harness 执行全过程的事件，实现日志、SSE推送、指标收集等。
Harness 编排器在关键节点通知观察者，不关心观察者如何处理事件。

从原 harness.py 中散落的 print 语句和 yield 事件提取为统一观察者接口。
"""

from __future__ import annotations

import time
from abc import ABC
from typing import Any, Optional

from schemas import Dialogue, Choice, ValidationResult


class HarnessObserver(ABC):
    """
    观察者接口：监听 Harness 执行全过程。

    所有方法默认空实现，子类按需覆盖。
    Harness 编排器在各关键节点调用对应方法。
    """

    def on_run_start(self, input_data: Any) -> None:
        """Harness 开始执行"""
        pass

    def on_stage_start(self, stage_number: int, stage_name: str) -> None:
        """某个阶段开始执行"""
        pass

    def on_stage_complete(self, stage_number: int, result: Any) -> None:
        """某个阶段执行完成"""
        pass

    def on_narration_delta(self, delta: str) -> None:
        """旁白流式增量推送"""
        pass

    def on_narration_complete(self, narration: str) -> None:
        """旁白生成完成"""
        pass

    def on_dialogue(self, dialogue: Dialogue) -> None:
        """单条对话生成"""
        pass

    def on_action(self, subject: str, text: str) -> None:
        """动作/心理旁白穿插"""
        pass

    def on_choices(self, choices: list[Choice]) -> None:
        """选项生成"""
        pass

    def on_retry(self, attempt: int) -> None:
        """验证失败，准备重试"""
        pass

    def on_validation(self, result: ValidationResult) -> None:
        """验证完成"""
        pass

    def on_fallback(self, info: dict) -> None:
        """触发保底机制"""
        pass

    def on_run_complete(self, output: dict) -> None:
        """Harness 执行完成"""
        pass

    def on_error(self, error: Exception) -> None:
        """执行出错"""
        pass


class LoggingObserver(HarnessObserver):
    """控制台日志观察者：替代原 harness.py 中散落的 print 语句"""

    def on_run_start(self, input_data: Any) -> None:
        print(f"\n{'=' * 50}")
        print("Harness 开始执行")

    def on_stage_start(self, stage_number: int, stage_name: str) -> None:
        print(f"[Stage {stage_number}/5] {stage_name}...")

    def on_stage_complete(self, stage_number: int, result: Any) -> None:
        if isinstance(result, str):
            preview = result[:80].replace('\n', ' ')
            print(f"  [OK] Stage {stage_number} 完成: {preview}...")
        elif isinstance(result, list):
            print(f"  [OK] Stage {stage_number} 完成: {len(result)} 项")

    def on_narration_complete(self, narration: str) -> None:
        preview = narration[:80].replace('\n', ' ')
        print(f"  [NARRATION] 旁白生成完成: {preview}...")

    def on_retry(self, attempt: int) -> None:
        print(f"  [RETRY] 重试第 {attempt} 次...")

    def on_validation(self, result: ValidationResult) -> None:
        if result.passed:
            print("  [OK] 验证通过")
        else:
            failed = [c.name for c in result.checks if not c.passed]
            print(f"  [FAIL] 验证未通过: {failed}")

    def on_fallback(self, info: dict) -> None:
        print(f"  [FALLBACK] {info}")

    def on_run_complete(self, output: dict) -> None:
        success = output.get("success", False)
        elapsed = output.get("metadata", {}).get("generationTime", 0)
        print(f"\n{'=' * 50}")
        print(f"Harness 完成 | 耗时: {elapsed}ms | 验证: {'通过' if success else '未通过'}")
        print(f"{'=' * 50}")

    def on_error(self, error: Exception) -> None:
        print(f"  [ERROR] {error}")


class SSEObserver(HarnessObserver):
    """
    SSE 事件收集观察者：run_stream 用它收集事件后 yield 给前端。

    内部维护 events 队列，run_stream 从中取出事件并 yield 为 SSE 格式。
    事件格式与原 harness.py 的 run_stream yield 格式完全一致，确保前端兼容。
    """

    def __init__(self):
        self.events: list[dict] = []

    def _emit(self, event: dict) -> None:
        """收集事件到队列"""
        self.events.append(event)

    def drain(self) -> list[dict]:
        """取出并清空所有待发送的事件"""
        events = self.events
        self.events = []
        return events

    def on_stage_start(self, stage_number: int, stage_name: str) -> None:
        self._emit({"event": "stage", "stage": stage_number, "message": f"正在{stage_name}..."})

    def on_narration_delta(self, delta: str) -> None:
        self._emit({"event": "narration_delta", "delta": delta})

    def on_narration_complete(self, narration: str) -> None:
        self._emit({"event": "narration", "text": narration})

    def on_dialogue(self, dialogue: Dialogue) -> None:
        self._emit({
            "event": "dialogue",
            "speaker": dialogue.speaker,
            "text": dialogue.text,
            "emotion": dialogue.emotion,
        })

    def on_action(self, subject: str, text: str) -> None:
        self._emit({"event": "action", "subject": subject, "text": text})

    def on_choices(self, choices: list[Choice]) -> None:
        self._emit({"event": "choices", "choices": [c.to_dict() for c in choices]})

    def on_retry(self, attempt: int) -> None:
        self._emit({"event": "retry", "attempt": attempt})

    def on_fallback(self, info: dict) -> None:
        self._emit({"event": "fallback", "info": info})

    def on_run_complete(self, output: dict) -> None:
        self._emit({
            "event": "done",
            "success": output.get("success", False),
            "validation": output.get("validation", {}),
            "elapsed_ms": output.get("metadata", {}).get("generationTime", 0),
            "result": output,
        })

    def on_error(self, error: Exception) -> None:
        self._emit({"event": "error", "message": str(error)})


class MetricsObserver(HarnessObserver):
    """指标收集观察者：收集耗时、验证分数、重试次数等指标"""

    def __init__(self):
        self._start_time: float = 0
        self._stage_start: float = 0
        self.metrics: dict = {
            "stages": {},
            "total_retries": 0,
            "validation_passed": False,
            "fallback_triggered": False,
            "total_elapsed_ms": 0,
        }

    def on_run_start(self, input_data: Any) -> None:
        self._start_time = time.time()

    def on_stage_start(self, stage_number: int, stage_name: str) -> None:
        self._stage_start = time.time()

    def on_stage_complete(self, stage_number: int, result: Any) -> None:
        elapsed = int((time.time() - self._stage_start) * 1000)
        self.metrics["stages"][stage_number] = {
            "name": stage_name if hasattr(self, '_current_name') else f"stage_{stage_number}",
            "elapsed_ms": elapsed,
        }

    def on_retry(self, attempt: int) -> None:
        self.metrics["total_retries"] = max(self.metrics["total_retries"], attempt)

    def on_validation(self, result: ValidationResult) -> None:
        self.metrics["validation_passed"] = result.passed

    def on_fallback(self, info: dict) -> None:
        self.metrics["fallback_triggered"] = True

    def on_run_complete(self, output: dict) -> None:
        self.metrics["total_elapsed_ms"] = output.get("metadata", {}).get("generationTime", 0)

    def get_metrics(self) -> dict:
        return self.metrics
