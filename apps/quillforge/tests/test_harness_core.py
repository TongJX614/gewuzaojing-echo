# -*- coding: utf-8 -*-
"""Harness Core 单元测试

测试覆盖：
  1. Harness.run() 成功执行流程
  2. 重试机制（验证失败触发重试）
  3. Fallback 机制（对话不足触发保底）
  4. 输入准备（_prepare_input）
  5. 上下文构建（_build_prepared_context）
  6. 输出构建（_build_output）
  7. Observer 通知机制
  8. run_stream 流式模式
  9. 工厂函数 create_default_harness
"""

from unittest.mock import MagicMock, patch, call, ANY
import pytest

from schemas import (
    HarnessInput, HarnessOutput, AssembledContext,
    Character, Dialogue, Choice, ValidationResult, ValidationCheck,
    GenerationOptions,
)
from quillforge.core import Harness


# ═══════════════════════════════════════════════════════
# 测试辅助 fixtures
# ═══════════════════════════════════════════════════════

def make_mock_sut():
    """构建 mock NarrativeSUT"""
    sut = MagicMock()
    sut.llm = MagicMock()
    sut.llm.model = "test-model"
    sut.render_system_prompt.return_value = "rendered system prompt"
    return sut


def make_mock_stages():
    """构建 mock stages 字典"""
    return {
        "context_assembly": MagicMock(),
        "narrative": MagicMock(),
        "dialogue": MagicMock(),
        "choices": MagicMock(),
        "validation": MagicMock(),
    }


def make_mock_fallback():
    """构建 mock FallbackStrategy"""
    fallback = MagicMock()
    fallback.execute.return_value = []
    fallback.hardcode_fallback.return_value = []
    return fallback


def make_mock_observer():
    """构建 mock HarnessObserver"""
    return MagicMock()


def make_test_config():
    """构建最小配置"""
    return {
        "quillforge": {
            "stages": {
                "validationGate": {
                    "maxRetries": 2,
                },
            },
        },
    }


def make_harness_input():
    """构建测试用 HarnessInput"""
    return HarnessInput(
        current_scene="测试场景描述",
        characters=[
            Character(name="角色A", role="主角", personality="冷静"),
            Character(name="角色B", role="配角", personality="热血"),
        ],
        worldline="【开端】 → 发展 → 结局",
        player_choice="",
        options=GenerationOptions(
            dialogue_count_min=3,
            dialogue_count_max=10,
            narration_length="medium",
            language="zh-CN",
        ),
    )


def make_dialogues(count: int = 3) -> list[Dialogue]:
    """快速构建 Dialogue 列表"""
    return [
        Dialogue(speaker=f"角色{'A' if i % 2 == 0 else 'B'}", text=f"对话内容{i}", emotion="平静")
        for i in range(count)
    ]


def make_choices(count: int = 2) -> list[Choice]:
    """快速构建 Choice 列表"""
    return [
        Choice(text=f"选项{i}", effect=f"效果{i}", worldline_impact="advance" if i == 0 else "side_branch")
        for i in range(count)
    ]


def make_validation_result(passed: bool = True) -> ValidationResult:
    """构建测试用 ValidationResult"""
    return ValidationResult(
        passed=passed,
        checks=[
            ValidationCheck(name="schema_compliance", passed=True, severity="critical", detail="合规"),
            ValidationCheck(name="dialogue_count", passed=True, severity="high", detail="3 轮对话"),
        ],
        retry_count=0,
    )


# ═══════════════════════════════════════════════════════
# Harness 初始化
# ═══════════════════════════════════════════════════════

class TestHarnessInit:
    """Harness 初始化"""

    def test_basic_init(self):
        sut = make_mock_sut()
        stages = make_mock_stages()
        fallback = make_mock_fallback()
        config = make_test_config()
        observers = [make_mock_observer()]

        harness = Harness(
            config=config,
            sut=sut,
            stages=stages,
            fallback=fallback,
            observers=observers,
        )

        assert harness.config == config
        assert harness.sut == sut
        assert harness.stages == stages
        assert harness.fallback == fallback
        assert len(harness.observers) == 1

    def test_default_observers_empty(self):
        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )
        assert harness.observers == []


# ═══════════════════════════════════════════════════════
# _prepare_input 测试
# ═══════════════════════════════════════════════════════

class TestPrepareInput:
    """输入准备"""

    def test_from_dict(self):
        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )

        input_data = {
            "currentScene": "测试场景",
            "characters": [
                {"name": "角色A", "role": "主角", "personality": "冷静"},
                {"name": "角色B", "role": "配角", "personality": "热血"},
            ],
            "worldline": "【开端】 → 发展 → 结局",
            "_worldbook": "世界书内容",
            "_narrativeStyle": "第二人称",
        }

        harness_input, extra = harness._prepare_input(input_data)

        assert isinstance(harness_input, HarnessInput)
        assert harness_input.current_scene == "测试场景"
        assert len(harness_input.characters) == 2
        assert extra.worldbook == "世界书内容"
        assert extra.narrative_style == "第二人称"

    def test_from_harness_input(self):
        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )

        hi = make_harness_input()
        harness_input, extra = harness._prepare_input(hi)

        assert harness_input is hi
        # 从 HarnessInput 直接传入时 extra 应为空 ExtraContext
        assert extra.worldbook == ""

    def test_model_override(self):
        """options.model 非空时覆盖 SUT 模型（run 方法中处理）"""
        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )

        hi = make_harness_input()
        hi.options.model = "gpt-4"

        harness_input, _ = harness._prepare_input(hi)
        assert harness_input.options.model == "gpt-4"


# ═══════════════════════════════════════════════════════
# _build_prepared_context 测试
# ═══════════════════════════════════════════════════════

class TestBuildPreparedContext:
    """上下文构建"""

    def test_build_context(self):
        sut = make_mock_sut()
        sut.render_system_prompt.return_value = "rendered system prompt"
        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )

        hi = make_harness_input()
        ctx = harness._build_prepared_context(hi, {})

        assert ctx.assembled is not None
        assert ctx.assembled.current_node == "开端"
        assert ctx.assembled.total_nodes == 3
        assert ctx.rendered_system_prompt == "rendered system prompt"
        assert len(ctx.assembled.active_characters) == 2


# ═══════════════════════════════════════════════════════
# _build_output 测试
# ═══════════════════════════════════════════════════════

class TestBuildOutput:
    """输出构建"""

    def test_build_success_output(self):
        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )

        hi = make_harness_input()
        ctx = harness._build_prepared_context(hi, {})
        dialogues = make_dialogues(3)
        choices = make_choices(2)
        validation = make_validation_result(passed=True)

        output = harness._build_output(
            ctx, "测试旁白", dialogues, choices, validation, start_time=0.0
        )

        assert isinstance(output, HarnessOutput)
        assert output.success is True
        assert output.narration == "测试旁白"
        assert len(output.dialogues) == 3
        assert len(output.next_choices) == 2
        assert "worldlineState" in output.to_dict()["data"]

    def test_build_failure_output(self):
        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )

        hi = make_harness_input()
        ctx = harness._build_prepared_context(hi, {})
        validation = make_validation_result(passed=False)

        output = harness._build_output(
            ctx, "测试旁白", [], [], validation, start_time=0.0
        )

        assert output.success is False


# ═══════════════════════════════════════════════════════
# run() 主流程测试
# ═══════════════════════════════════════════════════════

class TestHarnessRun:
    """Harness.run() 编排逻辑"""

    def test_run_success(self):
        """完整成功执行流程"""
        sut = make_mock_sut()
        stages = make_mock_stages()

        # 设置 stage mock 返回值
        stages["narrative"].execute.return_value = "测试旁白内容文本"
        stages["dialogue"].execute.return_value = make_dialogues(4)
        # validation stage 不直接在 run 中被调用 execute，而是每次都新建 NarrativeValidator
        # NarrativeValidator 在 run 内部创建，mock 它的 validate_all

        # Mock NarrativeValidator
        mock_validator_instance = MagicMock()
        mock_validator_instance.validate_all.return_value = make_validation_result(passed=True)

        observer = make_mock_observer()

        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=stages,
            fallback=make_mock_fallback(),
            observers=[observer],
        )

        with patch("quillforge.core.NarrativeValidator", return_value=mock_validator_instance):
            result = harness.run(make_harness_input())

        assert result["success"] is True
        assert "data" in result
        assert result["data"]["narration"] == "测试旁白内容文本"
        assert len(result["data"]["dialogues"]) == 4

        # 验证 observer 被通知
        assert observer.on_run_start.called
        assert observer.on_run_complete.called
        # on_stage_start 应被多次调用（stage 2-5）
        assert observer.on_stage_start.call_count >= 4

    def test_run_with_retry(self):
        """验证失败后触发重试，最终成功"""
        sut = make_mock_sut()
        stages = make_mock_stages()

        stages["narrative"].execute.return_value = "测试旁白内容文本"
        stages["dialogue"].execute.return_value = make_dialogues(4)
        stages["choices"].execute.return_value = make_choices(2)

        # 第一次验证失败，第二次成功
        fail_result = make_validation_result(passed=False)
        pass_result = make_validation_result(passed=True)

        mock_validator = MagicMock()
        mock_validator.validate_all.side_effect = [fail_result, pass_result]

        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=stages,
            fallback=make_mock_fallback(),
        )

        with patch("quillforge.core.NarrativeValidator", return_value=mock_validator):
            result = harness.run(make_harness_input())

        assert result["success"] is True
        # validate_all 被调用了 2 次（第一次失败，第二次重试成功）
        assert mock_validator.validate_all.call_count == 2

    def test_run_with_fallback(self):
        """对话不足时触发 Fallback"""
        sut = make_mock_sut()
        stages = make_mock_stages()

        stages["narrative"].execute.return_value = "测试旁白内容文本"
        # 只生成 1 轮对话，不足 min_dialogues=3
        stages["dialogue"].execute.return_value = make_dialogues(1)
        stages["choices"].execute.return_value = make_choices(2)

        mock_validator = MagicMock()
        mock_validator.validate_all.return_value = make_validation_result(passed=True)

        fallback = make_mock_fallback()
        fallback.execute.return_value = []

        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=stages,
            fallback=fallback,
        )

        with patch("quillforge.core.NarrativeValidator", return_value=mock_validator):
            result = harness.run(make_harness_input())

        # Fallback 应被触发（execute 和 hardcode_fallback 至少调用一个）
        assert fallback.execute.called or fallback.hardcode_fallback.called

    def test_run_all_retries_exhausted(self):
        """全部重试均失败"""
        sut = make_mock_sut()
        stages = make_mock_stages()

        stages["narrative"].execute.return_value = "测试旁白内容文本"
        stages["dialogue"].execute.return_value = make_dialogues(4)
        stages["choices"].execute.return_value = make_choices(2)

        # 所有重试都失败
        fail_result = make_validation_result(passed=False)
        mock_validator = MagicMock()
        mock_validator.validate_all.return_value = fail_result

        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=stages,
            fallback=make_mock_fallback(),
        )

        with patch("quillforge.core.NarrativeValidator", return_value=mock_validator):
            # 即使验证全失败，fallback 可能也会补充对话
            result = harness.run(make_harness_input())

        # 输出仍会生成（即使验证失败）
        assert "data" in result


# ═══════════════════════════════════════════════════════
# 观察者通知测试
# ═══════════════════════════════════════════════════════

class TestObserverNotify:
    """观察者通知"""

    def test_notify_calls_all_observers(self):
        observer1 = make_mock_observer()
        observer2 = make_mock_observer()

        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
            observers=[observer1, observer2],
        )

        harness._notify("on_run_start", make_harness_input())

        assert observer1.on_run_start.called
        assert observer2.on_run_start.called

    def test_notify_method_not_exist(self):
        """observer 没有对应方法时不抛异常"""
        observer = make_mock_observer()
        # 删除 on_run_start 方法
        del observer.on_run_start

        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
            observers=[observer],
        )

        # 不应抛异常
        harness._notify("on_run_start", "test")


# ═══════════════════════════════════════════════════════
# _apply_fallback 测试
# ═══════════════════════════════════════════════════════

class TestApplyFallback:
    """Fallback 逻辑"""

    def test_no_fallback_when_sufficient(self):
        """对话足够时不触发 fallback"""
        harness = Harness(
            config=make_test_config(),
            sut=make_mock_sut(),
            stages=make_mock_stages(),
            fallback=make_mock_fallback(),
        )

        hi = make_harness_input()
        ctx = harness._build_prepared_context(hi, {})
        fallback = make_mock_fallback()

        harness.fallback = fallback

        dialogues, validation = harness._apply_fallback(
            ctx, hi, "旁白", make_dialogues(5), make_choices(2), make_validation_result(), 2
        )

        # 对话足够，不应调用 fallback
        assert not fallback.execute.called


# ═══════════════════════════════════════════════════════
# run_stream 测试
# ═══════════════════════════════════════════════════════

class TestRunStream:
    """run_stream 流式模式"""

    def test_run_stream_basic_events(self):
        """流式模式应 yield 正确的事件序列"""
        sut = make_mock_sut()
        stages = make_mock_stages()

        stages["narrative"].execute_stream.return_value = iter([
            {"event": "narration_delta", "delta": "测试"},
            {"event": "narration_delta", "delta": "旁白"},
        ])
        stages["dialogue"].execute_stream.return_value = iter([
            {"kind": "dialogue", "dialogue": Dialogue(speaker="角色A", text="你好", emotion="平静")},
            {"kind": "dialogue", "dialogue": Dialogue(speaker="角色B", text="你好", emotion="平静")},
            {"kind": "dialogue", "dialogue": Dialogue(speaker="角色A", text="开始吧", emotion="坚定")},
        ])
        stages["choices"].execute.return_value = make_choices(2)

        mock_validator = MagicMock()
        mock_validator.validate_all.return_value = make_validation_result(passed=True)

        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=stages,
            fallback=make_mock_fallback(),
        )

        with patch("quillforge.core.NarrativeValidator", return_value=mock_validator):
            events = list(harness.run_stream(make_harness_input()))

        # 应包含 stage 事件、narration 事件、dialogue 事件、choices 事件、done 事件
        event_types = [e["event"] for e in events]
        assert "stage" in event_types
        assert "narration" in event_types
        assert "dialogue" in event_types
        assert "choices" in event_types
        assert "done" in event_types

    def test_run_stream_done_event(self):
        """流式模式的 done 事件应包含结果"""
        sut = make_mock_sut()
        stages = make_mock_stages()

        stages["narrative"].execute_stream.return_value = iter([])
        stages["dialogue"].execute_stream.return_value = iter([])
        stages["choices"].execute.return_value = make_choices(2)

        mock_validator = MagicMock()
        mock_validator.validate_all.return_value = make_validation_result(passed=True)

        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=stages,
            fallback=make_mock_fallback(),
        )

        with patch("quillforge.core.NarrativeValidator", return_value=mock_validator):
            events = list(harness.run_stream(make_harness_input()))

        done_event = events[-1]
        assert done_event["event"] == "done"
        assert "success" in done_event
        assert "result" in done_event

    def test_run_stream_error(self):
        """流式模式异常时应 yield error 事件"""
        sut = make_mock_sut()
        stages = make_mock_stages()

        # _build_prepared_context 中会调用 sut.render_system_prompt
        sut.render_system_prompt.side_effect = Exception("Test error")

        harness = Harness(
            config=make_test_config(),
            sut=sut,
            stages=stages,
            fallback=make_mock_fallback(),
        )

        events = list(harness.run_stream(make_harness_input()))

        # 应在异常后 yield error 事件
        error_events = [e for e in events if e.get("event") == "error"]
        assert len(error_events) == 1
        assert "Test error" in error_events[0]["message"]
