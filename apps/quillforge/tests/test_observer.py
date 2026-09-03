# -*- coding: utf-8 -*-
"""Observer 模块集成测试

测试覆盖：
  1. LoggingObserver 日志输出
  2. SSEObserver 事件收集
  3. MetricsObserver 指标收集
  4. Observer 通知链
"""

from unittest.mock import MagicMock
import pytest

from schemas import Dialogue, Choice, ValidationResult, ValidationCheck
from quillforge.observer import LoggingObserver, SSEObserver, MetricsObserver


# ═══════════════════════════════════════════════════════
# LoggingObserver 测试
# ═══════════════════════════════════════════════════════

class TestLoggingObserver:
    """LoggingObserver 日志观察者"""

    def test_on_run_start(self, capsys):
        """开始执行时输出分隔线"""
        obs = LoggingObserver()
        obs.on_run_start({"test": "data"})
        captured = capsys.readouterr()
        assert "=" * 50 in captured.out
        assert "Harness 开始执行" in captured.out

    def test_on_stage_start(self, capsys):
        """阶段开始时输出阶段信息"""
        obs = LoggingObserver()
        obs.on_stage_start(2, "narrative_anchoring")
        captured = capsys.readouterr()
        assert "[Stage 2/5]" in captured.out
        assert "narrative_anchoring" in captured.out

    def test_on_stage_complete_string_result(self, capsys):
        """阶段完成时输出字符串结果预览"""
        obs = LoggingObserver()
        obs.on_stage_complete(2, "这是一段很长的旁白内容" * 10)
        captured = capsys.readouterr()
        assert "[OK] Stage 2 完成" in captured.out
        assert "..." in captured.out

    def test_on_stage_complete_list_result(self, capsys):
        """阶段完成时输出列表结果数量"""
        obs = LoggingObserver()
        obs.on_stage_complete(3, [Dialogue("A", "text1"), Dialogue("B", "text2")])
        captured = capsys.readouterr()
        assert "[OK] Stage 3 完成: 2 项" in captured.out

    def test_on_narration_complete(self, capsys):
        """旁白完成时输出预览"""
        obs = LoggingObserver()
        obs.on_narration_complete("这是一段旁白内容" * 10)
        captured = capsys.readouterr()
        assert "[NARRATION] 旁白生成完成" in captured.out

    def test_on_retry(self, capsys):
        """重试时输出重试次数"""
        obs = LoggingObserver()
        obs.on_retry(2)
        captured = capsys.readouterr()
        assert "[RETRY] 重试第 2 次" in captured.out

    def test_on_validation_passed(self, capsys):
        """验证通过时输出成功信息"""
        obs = LoggingObserver()
        result = ValidationResult(passed=True, checks=[])
        obs.on_validation(result)
        captured = capsys.readouterr()
        assert "[OK] 验证通过" in captured.out

    def test_on_validation_failed(self, capsys):
        """验证失败时输出失败检查项"""
        obs = LoggingObserver()
        result = ValidationResult(
            passed=False,
            checks=[
                ValidationCheck(name="schema_compliance", passed=False, severity="critical"),
                ValidationCheck(name="dialogue_count", passed=True, severity="high"),
            ],
        )
        obs.on_validation(result)
        captured = capsys.readouterr()
        assert "[FAIL] 验证未通过" in captured.out
        assert "schema_compliance" in captured.out

    def test_on_fallback(self, capsys):
        """触发保底时输出信息"""
        obs = LoggingObserver()
        obs.on_fallback({"reason": "对话不足"})
        captured = capsys.readouterr()
        assert "[FALLBACK]" in captured.out

    def test_on_run_complete(self, capsys):
        """执行完成时输出汇总信息"""
        obs = LoggingObserver()
        obs.on_run_complete({
            "success": True,
            "metadata": {"generationTime": 1234},
        })
        captured = capsys.readouterr()
        assert "Harness 完成" in captured.out
        assert "1234ms" in captured.out
        assert "通过" in captured.out

    def test_on_error(self, capsys):
        """出错时输出错误信息"""
        obs = LoggingObserver()
        obs.on_error(Exception("测试错误"))
        captured = capsys.readouterr()
        assert "[ERROR]" in captured.out
        assert "测试错误" in captured.out


# ═══════════════════════════════════════════════════════
# SSEObserver 测试
# ═══════════════════════════════════════════════════════

class TestSSEObserver:
    """SSEObserver 事件收集"""

    def test_init_empty_events(self):
        """初始化时事件队列为空"""
        obs = SSEObserver()
        assert obs.events == []

    def test_on_stage_start(self):
        """阶段开始时收集 stage 事件"""
        obs = SSEObserver()
        obs.on_stage_start(2, "narrative_anchoring")
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "stage"
        assert obs.events[0]["stage"] == 2
        assert "narrative_anchoring" in obs.events[0]["message"]

    def test_on_narration_delta(self):
        """旁白增量时收集 narration_delta 事件"""
        obs = SSEObserver()
        obs.on_narration_delta("测试")
        obs.on_narration_delta("旁白")
        assert len(obs.events) == 2
        assert obs.events[0]["event"] == "narration_delta"
        assert obs.events[0]["delta"] == "测试"
        assert obs.events[1]["delta"] == "旁白"

    def test_on_narration_complete(self):
        """旁白完成时收集 narration 事件"""
        obs = SSEObserver()
        obs.on_narration_complete("完整旁白内容")
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "narration"
        assert obs.events[0]["text"] == "完整旁白内容"

    def test_on_dialogue(self):
        """对话时收集 dialogue 事件"""
        obs = SSEObserver()
        dialogue = Dialogue(speaker="角色A", text="你好", emotion="平静")
        obs.on_dialogue(dialogue)
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "dialogue"
        assert obs.events[0]["speaker"] == "角色A"
        assert obs.events[0]["text"] == "你好"
        assert obs.events[0]["emotion"] == "平静"

    def test_on_action(self):
        """动作时收集 action 事件"""
        obs = SSEObserver()
        obs.on_action("角色A", "走到窗前")
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "action"
        assert obs.events[0]["subject"] == "角色A"
        assert obs.events[0]["text"] == "走到窗前"

    def test_on_choices(self):
        """选项时收集 choices 事件"""
        obs = SSEObserver()
        choices = [
            Choice(text="选项1", effect="效果1", worldline_impact="advance"),
            Choice(text="选项2", effect="效果2", worldline_impact="stay_current"),
        ]
        obs.on_choices(choices)
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "choices"
        assert len(obs.events[0]["choices"]) == 2
        assert obs.events[0]["choices"][0]["text"] == "选项1"

    def test_on_retry(self):
        """重试时收集 retry 事件"""
        obs = SSEObserver()
        obs.on_retry(2)
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "retry"
        assert obs.events[0]["attempt"] == 2

    def test_on_fallback(self):
        """保底时收集 fallback 事件"""
        obs = SSEObserver()
        obs.on_fallback({"reason": "对话不足"})
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "fallback"
        assert obs.events[0]["info"]["reason"] == "对话不足"

    def test_on_run_complete(self):
        """完成时收集 done 事件"""
        obs = SSEObserver()
        obs.on_run_complete({
            "success": True,
            "validation": {"passed": True},
            "metadata": {"generationTime": 1234},
        })
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "done"
        assert obs.events[0]["success"] is True
        assert obs.events[0]["elapsed_ms"] == 1234

    def test_on_error(self):
        """错误时收集 error 事件"""
        obs = SSEObserver()
        obs.on_error(Exception("测试错误"))
        assert len(obs.events) == 1
        assert obs.events[0]["event"] == "error"
        assert "测试错误" in obs.events[0]["message"]

    def test_drain(self):
        """drain 取出并清空事件"""
        obs = SSEObserver()
        obs.on_narration_delta("测试1")
        obs.on_narration_delta("测试2")
        obs.on_dialogue(Dialogue("A", "内容"))

        events = obs.drain()
        assert len(events) == 3
        assert obs.events == []  # 清空

        # 再次 drain 应返回空
        events2 = obs.drain()
        assert events2 == []

    def test_event_sequence(self):
        """事件按调用顺序收集"""
        obs = SSEObserver()
        obs.on_stage_start(2, "narrative")
        obs.on_narration_delta("旁白")
        obs.on_dialogue(Dialogue("A", "对话"))
        obs.on_run_complete({"success": True})

        assert len(obs.events) == 4
        assert obs.events[0]["event"] == "stage"
        assert obs.events[1]["event"] == "narration_delta"
        assert obs.events[2]["event"] == "dialogue"
        assert obs.events[3]["event"] == "done"


# ═══════════════════════════════════════════════════════
# MetricsObserver 测试
# ═══════════════════════════════════════════════════════

class TestMetricsObserver:
    """MetricsObserver 指标收集"""

    def test_init_metrics(self):
        """初始化时指标为空"""
        obs = MetricsObserver()
        metrics = obs.get_metrics()
        assert metrics["stages"] == {}
        assert metrics["total_retries"] == 0
        assert metrics["validation_passed"] is False
        assert metrics["fallback_triggered"] is False

    def test_on_run_start(self):
        """开始执行时记录起始时间"""
        obs = MetricsObserver()
        obs.on_run_start({"test": "data"})
        assert obs._start_time > 0

    def test_on_stage_start_and_complete(self):
        """阶段开始和完成时记录耗时"""
        obs = MetricsObserver()
        obs.on_stage_start(2, "narrative_anchoring")
        obs.on_stage_complete(2, "旁白内容")

        metrics = obs.get_metrics()
        assert 2 in metrics["stages"]
        assert metrics["stages"][2]["elapsed_ms"] >= 0

    def test_on_retry(self):
        """重试时更新重试次数"""
        obs = MetricsObserver()
        obs.on_retry(1)
        obs.on_retry(2)
        obs.on_retry(3)

        metrics = obs.get_metrics()
        assert metrics["total_retries"] == 3

    def test_on_validation(self):
        """验证时更新验证结果"""
        obs = MetricsObserver()
        result = ValidationResult(passed=True, checks=[])
        obs.on_validation(result)

        metrics = obs.get_metrics()
        assert metrics["validation_passed"] is True

    def test_on_fallback(self):
        """保底时更新保底触发标志"""
        obs = MetricsObserver()
        obs.on_fallback({"reason": "对话不足"})

        metrics = obs.get_metrics()
        assert metrics["fallback_triggered"] is True

    def test_on_run_complete(self):
        """完成时更新总耗时"""
        obs = MetricsObserver()
        obs.on_run_complete({
            "metadata": {"generationTime": 5678},
        })

        metrics = obs.get_metrics()
        assert metrics["total_elapsed_ms"] == 5678


# ═══════════════════════════════════════════════════════
# Observer 通知链测试
# ═══════════════════════════════════════════════════════

class TestObserverChain:
    """Observer 通知链"""

    def test_multiple_observers_receive_events(self):
        """多个观察者同时接收事件"""
        obs1 = SSEObserver()
        obs2 = SSEObserver()
        obs3 = MetricsObserver()

        observers = [obs1, obs2, obs3]

        # 模拟通知链
        for obs in observers:
            obs.on_stage_start(2, "narrative")
            obs.on_narration_delta("测试旁白")
            obs.on_narration_complete("完整旁白")

        assert len(obs1.events) == 3
        assert len(obs2.events) == 3
        assert obs3._start_time == 0  # MetricsObserver 需要 on_run_start

    def test_observer_chain_with_all_events(self):
        """完整事件链"""
        obs = SSEObserver()

        # 完整执行流程
        obs.on_stage_start(1, "context_assembly")
        obs.on_stage_start(2, "narrative_anchoring")
        obs.on_narration_delta("旁白")
        obs.on_narration_complete("完整旁白")
        obs.on_stage_start(3, "dialogue_generation")
        obs.on_dialogue(Dialogue("A", "对话1"))
        obs.on_dialogue(Dialogue("B", "对话2"))
        obs.on_stage_start(4, "choice_branching")
        obs.on_choices([Choice("选项1", "效果1")])
        obs.on_stage_start(5, "validation_gate")
        obs.on_validation(ValidationResult(passed=True, checks=[]))
        obs.on_run_complete({"success": True})

        # 验证事件数量
        assert len(obs.events) == 11

        # 验证事件类型分布
        event_types = [e["event"] for e in obs.events]
        assert event_types.count("stage") == 5
        assert event_types.count("narration_delta") == 1
        assert event_types.count("narration") == 1
        assert event_types.count("dialogue") == 2
        assert event_types.count("choices") == 1
        assert event_types.count("done") == 1
