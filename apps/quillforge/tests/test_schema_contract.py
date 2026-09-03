# -*- coding: utf-8 -*-
"""Schema Contract Tests — 向后兼容性验证

验证所有 dataclass：
  1. 所有字段都有默认值（向后兼容）
  2. 可以用无参构造实例
  3. test_harness_core.py 中手动构造的 dataclass 实例化仍然成功
"""

from __future__ import annotations

import dataclasses
import pytest

from schemas import (
    Character,
    GenerationOptions,
    PreviousContext,
    HarnessInput,
    AssembledContext,
    Dialogue,
    Choice,
    ValidationCheck,
    ValidationResult,
    HarnessOutput,
    StageResult,
    HarnessState,
)


# ═══════════════════════════════════════════════════════
# 所有 dataclass 的完整列表
# ═══════════════════════════════════════════════════════

ALL_DATACLASSES = [
    Character,
    GenerationOptions,
    PreviousContext,
    HarnessInput,
    AssembledContext,
    Dialogue,
    Choice,
    ValidationCheck,
    ValidationResult,
    HarnessOutput,
    StageResult,
    HarnessState,
]


# ═══════════════════════════════════════════════════════
# 1. 所有字段都有默认值
# ═══════════════════════════════════════════════════════

class TestAllFieldsHaveDefaults:
    """验证所有 dataclass 的每个字段都有默认值（向后兼容性保障）"""

    @pytest.mark.parametrize("cls", ALL_DATACLASSES, ids=lambda c: c.__name__)
    def test_all_fields_have_defaults(self, cls):
        """每个 dataclass 的所有字段都必须有默认值"""
        fields = dataclasses.fields(cls)
        assert len(fields) > 0, f"{cls.__name__} 没有任何字段"

        fields_without_defaults = []
        for f in fields:
            has_default = (
                f.default is not dataclasses.MISSING
                or f.default_factory is not dataclasses.MISSING
            )
            if not has_default:
                fields_without_defaults.append(f.name)

        assert fields_without_defaults == [], (
            f"{cls.__name__} 以下字段缺少默认值: {fields_without_defaults}"
        )


# ═══════════════════════════════════════════════════════
# 2. 无参构造
# ═══════════════════════════════════════════════════════

class TestZeroArgConstruction:
    """验证所有 dataclass 可以用无参构造"""

    @pytest.mark.parametrize("cls", ALL_DATACLASSES, ids=lambda c: c.__name__)
    def test_zero_arg_construction(self, cls):
        """每个 dataclass 都应能用 cls() 无参构造"""
        instance = cls()
        assert instance is not None

    @pytest.mark.parametrize("cls", ALL_DATACLASSES, ids=lambda c: c.__name__)
    def test_zero_arg_produces_valid_instance(self, cls):
        """无参构造的实例类型正确"""
        instance = cls()
        assert isinstance(instance, cls)


# ═══════════════════════════════════════════════════════
# 3. test_harness_core.py 中的手动构造仍然成功
# ═══════════════════════════════════════════════════════

class TestHarnessCoreInstantiation:
    """复现 test_harness_core.py 中的手动 dataclass 构造，确保仍然成功"""

    def test_character_positional(self):
        """Character(name, role, personality) 位置参数构造"""
        c = Character(name="角色A", role="主角", personality="冷静")
        assert c.name == "角色A"
        assert c.role == "主角"
        assert c.personality == "冷静"

    def test_character_with_optional_fields(self):
        """Character 带可选字段构造"""
        c = Character(
            name="角色B", role="配角", personality="热血",
            id="char_b", speaking_style="大声", background="背景",
        )
        assert c.id == "char_b"
        assert c.speaking_style == "大声"

    def test_generation_options(self):
        """GenerationOptions 构造"""
        opts = GenerationOptions(
            dialogue_count_min=3,
            dialogue_count_max=10,
            narration_length="medium",
            language="zh-CN",
        )
        assert opts.dialogue_count_min == 3
        assert opts.model == ""

    def test_harness_input(self):
        """HarnessInput 构造"""
        hi = HarnessInput(
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
        assert hi.current_scene == "测试场景描述"
        assert len(hi.characters) == 2

    def test_dialogue(self):
        """Dialogue 构造"""
        d = Dialogue(speaker="角色A", text="对话内容", emotion="平静")
        assert d.speaker == "角色A"
        assert d.text == "对话内容"

    def test_choice(self):
        """Choice 构造"""
        c = Choice(text="选项1", effect="效果1", worldline_impact="advance")
        assert c.text == "选项1"
        assert c.worldline_impact == "advance"

    def test_validation_check(self):
        """ValidationCheck 构造"""
        vc = ValidationCheck(name="schema_compliance", passed=True, severity="critical", detail="合规")
        assert vc.name == "schema_compliance"
        assert vc.passed is True

    def test_validation_result(self):
        """ValidationResult 构造"""
        vr = ValidationResult(
            passed=True,
            checks=[
                ValidationCheck(name="schema_compliance", passed=True, severity="critical", detail="合规"),
                ValidationCheck(name="dialogue_count", passed=True, severity="high", detail="3 轮对话"),
            ],
            retry_count=0,
        )
        assert vr.passed is True
        assert len(vr.checks) == 2
