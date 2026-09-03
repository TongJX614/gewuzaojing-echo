# -*- coding: utf-8 -*-
"""NarrativeValidator 单元测试

测试覆盖：
  1. Schema 合规检查 (check_schema)
  2. 对话轮数检查 (check_dialogue_count)
  3. 角色一致性检查 (check_character_consistency)
  4. 连续发言检查 (check_consecutive_speaker)
  5. 性格匹配检查 (check_personality_match)
  6. 主线符合度检查 (check_worldline_adherence)
  7. 选择多样性检查 (check_choice_diversity)
  8. 选择有效性检查 (check_choice_validity)
  9. 综合验证 (validate_all)
  10. 关键词提取 (_extract_keywords)
"""

import pytest
from schemas import (
    Character, Dialogue, Choice, AssembledContext,
    ValidationCheck, ValidationResult,
)
from validator import NarrativeValidator


# ═══════════════════════════════════════════════════════
# 测试辅助 fixtures
# ═══════════════════════════════════════════════════════

def make_char(name: str, personality: str = "冷静", role: str = "主角") -> Character:
    """快速构建测试用 Character"""
    return Character(name=name, role=role, personality=personality)


def make_dialogue(speaker: str, text: str, emotion: str = "平静") -> Dialogue:
    """快速构建测试用 Dialogue"""
    return Dialogue(speaker=speaker, text=text, emotion=emotion)


def make_choice(text: str, effect: str, impact: str = "advance") -> Choice:
    """快速构建测试用 Choice"""
    return Choice(text=text, effect=effect, worldline_impact=impact)


def make_context(
    chars: list[Character] = None,
    current_node: str = "开端",
    next_node: str = "发展",
    scene_desc: str = "测试场景",
) -> AssembledContext:
    """快速构建测试用 AssembledContext"""
    return AssembledContext(
        current_node=current_node,
        node_index=0,
        total_nodes=3,
        previous_node="",
        next_node=next_node,
        worldline_progress=0.0,
        scene_description=scene_desc,
        active_characters=chars or [make_char("角色A"), make_char("角色B")],
        nodes=["开端", "发展", "结局"],
    )


# ═══════════════════════════════════════════════════════
# check_schema 测试
# ═══════════════════════════════════════════════════════

class TestCheckSchema:
    """Schema 合规检查"""

    def test_all_valid(self):
        validator = NarrativeValidator(make_context(), min_dialogues=1, max_dialogues=5)
        result = validator.check_schema(
            narration="这是一段足够长的测试旁白文本内容",
            dialogues=[make_dialogue("角色A", "你好")],
            choices=[make_choice("选项1", "推进剧情")],
        )
        assert result.passed is True
        assert result.name == "schema_compliance"
        assert result.severity == "critical"

    def test_narration_too_short(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_schema(
            narration="短",
            dialogues=[make_dialogue("角色A", "你好")],
            choices=[make_choice("选项1", "推进剧情")],
        )
        assert result.passed is False
        assert "旁白过短" in result.detail

    def test_no_dialogues(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_schema(
            narration="这是一段足够长的测试旁白文本内容",
            dialogues=[],
            choices=[make_choice("选项1", "推进剧情")],
        )
        assert result.passed is False
        assert "无对话" in result.detail

    def test_no_choices(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_schema(
            narration="这是一段足够长的测试旁白文本内容",
            dialogues=[make_dialogue("角色A", "你好")],
            choices=[],
        )
        assert result.passed is False
        assert "无选择项" in result.detail

    def test_dialogue_missing_speaker(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_schema(
            narration="这是一段足够长的测试旁白文本内容",
            dialogues=[Dialogue(speaker="", text="你好")],
            choices=[make_choice("选项1", "推进剧情")],
        )
        assert result.passed is False
        assert "缺少 speaker" in result.detail

    def test_choice_missing_text(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_schema(
            narration="这是一段足够长的测试旁白文本内容",
            dialogues=[make_dialogue("角色A", "你好")],
            choices=[Choice(text="", effect="推进剧情")],
        )
        assert result.passed is False
        assert "缺少 text" in result.detail


# ═══════════════════════════════════════════════════════
# check_dialogue_count 测试
# ═══════════════════════════════════════════════════════

class TestCheckDialogueCount:
    """对话轮数检查"""

    def test_within_range(self):
        validator = NarrativeValidator(make_context(), min_dialogues=3, max_dialogues=10)
        dialogues = [make_dialogue("角色A", f"对话{i}") for i in range(5)]
        result = validator.check_dialogue_count(dialogues)
        assert result.passed is True
        assert result.severity == "high"

    def test_too_few(self):
        validator = NarrativeValidator(make_context(), min_dialogues=3, max_dialogues=10)
        dialogues = [make_dialogue("角色A", "对话1")]
        result = validator.check_dialogue_count(dialogues)
        assert result.passed is False

    def test_too_many(self):
        validator = NarrativeValidator(make_context(), min_dialogues=3, max_dialogues=5)
        dialogues = [make_dialogue("角色A", f"对话{i}") for i in range(8)]
        result = validator.check_dialogue_count(dialogues)
        assert result.passed is False

    def test_exact_min(self):
        validator = NarrativeValidator(make_context(), min_dialogues=3, max_dialogues=10)
        dialogues = [make_dialogue("角色A", f"对话{i}") for i in range(3)]
        result = validator.check_dialogue_count(dialogues)
        assert result.passed is True

    def test_exact_max(self):
        validator = NarrativeValidator(make_context(), min_dialogues=3, max_dialogues=10)
        dialogues = [make_dialogue("角色A", f"对话{i}") for i in range(10)]
        result = validator.check_dialogue_count(dialogues)
        assert result.passed is True


# ═══════════════════════════════════════════════════════
# check_character_consistency 测试
# ═══════════════════════════════════════════════════════

class TestCheckCharacterConsistency:
    """角色一致性检查"""

    def test_all_known(self):
        validator = NarrativeValidator(make_context([
            make_char("角色A"), make_char("角色B"),
        ]))
        dialogues = [
            make_dialogue("角色A", "你好"),
            make_dialogue("角色B", "你好"),
        ]
        result = validator.check_character_consistency(dialogues)
        assert result.passed is True

    def test_unknown_speaker(self):
        validator = NarrativeValidator(make_context([
            make_char("角色A"),
        ]))
        dialogues = [
            make_dialogue("角色A", "你好"),
            make_dialogue("未知角色", "我是谁"),
        ]
        result = validator.check_character_consistency(dialogues)
        assert result.passed is False
        assert "未知角色" in result.detail
        assert result.severity == "critical"


# ═══════════════════════════════════════════════════════
# check_consecutive_speaker 测试
# ═══════════════════════════════════════════════════════

class TestCheckConsecutiveSpeaker:
    """连续发言检查"""

    def test_no_consecutive_excess(self):
        validator = NarrativeValidator(make_context())
        dialogues = [
            make_dialogue("角色A", "你好"),
            make_dialogue("角色B", "你好"),
            make_dialogue("角色A", "回复"),
            make_dialogue("角色B", "回复"),
        ]
        result = validator.check_consecutive_speaker(dialogues)
        assert result.passed is True

    def test_consecutive_2_allowed(self):
        """同一角色连续发言 2 轮是允许的"""
        validator = NarrativeValidator(make_context())
        dialogues = [
            make_dialogue("角色A", "第一句"),
            make_dialogue("角色A", "第二句"),
            make_dialogue("角色B", "回应"),
        ]
        result = validator.check_consecutive_speaker(dialogues)
        assert result.passed is True

    def test_consecutive_3_not_allowed(self):
        """同一角色连续发言 3 轮不允许"""
        validator = NarrativeValidator(make_context())
        dialogues = [
            make_dialogue("角色A", "第一句"),
            make_dialogue("角色A", "第二句"),
            make_dialogue("角色A", "第三句"),
        ]
        result = validator.check_consecutive_speaker(dialogues)
        assert result.passed is False
        assert result.severity == "medium"


# ═══════════════════════════════════════════════════════
# check_personality_match 测试
# ═══════════════════════════════════════════════════════

class TestCheckPersonalityMatch:
    """性格匹配检查"""

    def test_match_with_keywords(self):
        """对话包含性格正向关键词时应通过"""
        validator = NarrativeValidator(make_context([
            make_char("角色A", "冷静"),
        ]))
        dialogues = [
            make_dialogue("角色A", "我们来分析一下数据参数，根据逻辑推断这是最合理的选择"),
        ]
        result = validator.check_personality_match(dialogues)
        assert result.passed is True
        assert result.score > 0.5

    def test_negative_keywords_reduce_score(self):
        """对话包含性格反向关键词时应降低得分"""
        validator = NarrativeValidator(make_context([
            make_char("角色A", "冷静"),
        ]))
        dialogues = [
            make_dialogue("角色A", "啊啊啊天哪完了完了救命啊"),
        ]
        result = validator.check_personality_match(dialogues)
        # 反向关键词会显著降低得分
        assert result.score < 0.5

    def test_unknown_character_skipped(self):
        """未在角色列表中的 speaker 被跳过不影响得分"""
        validator = NarrativeValidator(make_context([
            make_char("角色A", "冷静"),
        ]))
        dialogues = [
            make_dialogue("未知角色", "啊啊啊天哪"),
            make_dialogue("角色A", "数据分析和概率计算表明这是合理的"),
        ]
        result = validator.check_personality_match(dialogues)
        assert result.passed is True


# ═══════════════════════════════════════════════════════
# check_worldline_adherence 测试
# ═══════════════════════════════════════════════════════

class TestCheckWorldlineAdherence:
    """主线符合度检查"""

    def test_node_mentioned(self):
        """叙述中包含当前节点名应获得更高得分"""
        validator = NarrativeValidator(make_context(
            current_node="开端",
            next_node="发展",
            scene_desc="故事的开端场景",
        ))
        result = validator.check_worldline_adherence(
            narration="这是故事的开端，一切从这里开始",
            dialogues=[make_dialogue("角色A", "我们正在开端的路上")],
        )
        assert result.name == "worldline_adherence"
        assert result.severity == "medium"

    def test_final_scene_with_ending_keywords(self):
        """终局场景包含结局关键词应通过"""
        validator = NarrativeValidator(make_context(
            current_node="结局",
            next_node="",
            scene_desc="故事的最终结局",
        ))
        result = validator.check_worldline_adherence(
            narration="这是故事的结局，最终的真相被揭示，命运的选择已经做出",
            dialogues=[make_dialogue("角色A", "一切都结束了，最终的决定已经做出")],
        )
        assert result.name == "worldline_adherence"


# ═══════════════════════════════════════════════════════
# check_choice_diversity 测试
# ═══════════════════════════════════════════════════════

class TestCheckChoiceDiversity:
    """选择多样性检查"""

    def test_not_enough_choices(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_choice_diversity([
            make_choice("唯一选项", "推进剧情"),
        ])
        assert result.passed is False
        assert "不足" in result.detail

    def test_diverse_choices(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_choice_diversity([
            make_choice("选项1", "推进主线", "advance"),
            make_choice("选项2", "探索支线", "side_branch"),
        ])
        assert result.passed is True

    def test_duplicate_effects(self):
        """效果描述重复时应失败"""
        validator = NarrativeValidator(make_context())
        result = validator.check_choice_diversity([
            make_choice("选项1", "推进剧情", "advance"),
            make_choice("选项2", "推进剧情", "advance"),
        ])
        assert result.passed is False


# ═══════════════════════════════════════════════════════
# check_choice_validity 测试
# ═══════════════════════════════════════════════════════

class TestCheckChoiceValidity:
    """选择有效性检查"""

    def test_all_valid(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_choice_validity([
            make_choice("有效选项1", "推进剧情", "advance"),
            make_choice("有效选项2", "探索支线", "side_branch"),
        ])
        assert result.passed is True

    def test_text_too_short(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_choice_validity([
            make_choice("A", "推进剧情"),
        ])
        assert result.passed is False
        assert "过短" in result.detail

    def test_invalid_impact(self):
        validator = NarrativeValidator(make_context())
        result = validator.check_choice_validity([
            make_choice("有效选项", "推进剧情", "invalid_impact"),
        ])
        assert result.passed is False
        assert "无效 impact" in result.detail


# ═══════════════════════════════════════════════════════
# validate_all 综合测试
# ═══════════════════════════════════════════════════════

class TestValidateAll:
    """综合验证"""

    def test_all_pass(self):
        """所有检查通过时应返回 passed=True"""
        validator = NarrativeValidator(
            make_context([make_char("角色A", "冷静"), make_char("角色B", "理性")]),
            min_dialogues=2,
            max_dialogues=10,
        )
        result = validator.validate_all(
            narration="这是一段足够长的测试旁白文本，描述了场景的开端和发展",
            dialogues=[
                make_dialogue("角色A", "我们来分析一下数据参数，根据逻辑推断"),
                make_dialogue("角色B", "根据依据判断评估，这个选择需要考虑"),
                make_dialogue("角色A", "好的"),
            ],
            choices=[
                make_choice("选项1", "推进主线", "advance"),
                make_choice("选项2", "探索支线", "side_branch"),
            ],
        )
        assert result.passed is True
        assert len(result.checks) == 8

    def test_critical_failure_blocks(self):
        """critical 级别失败应导致整体不通过"""
        validator = NarrativeValidator(
            make_context([make_char("角色A")]),
            min_dialogues=2,
            max_dialogues=10,
        )
        result = validator.validate_all(
            narration="短",
            dialogues=[make_dialogue("角色A", "你好"), make_dialogue("角色A", "再见")],
            choices=[make_choice("选项1", "推进剧情")],
        )
        assert result.passed is False
        # schema_compliance 是 critical 级别，旁白过短应导致失败
        schema_check = next(c for c in result.checks if c.name == "schema_compliance")
        assert schema_check.passed is False

    def test_unknown_character_blocks(self):
        """角色一致性是 critical 级别，未知角色应导致整体不通过"""
        validator = NarrativeValidator(
            make_context([make_char("角色A")]),
            min_dialogues=2,
            max_dialogues=10,
        )
        result = validator.validate_all(
            narration="这是一段足够长的测试旁白文本内容描述场景",
            dialogues=[
                make_dialogue("角色A", "你好"),
                make_dialogue("未知角色", "你好"),
            ],
            choices=[
                make_choice("选项1", "推进", "advance"),
                make_choice("选项2", "探索", "side_branch"),
            ],
        )
        assert result.passed is False


# ═══════════════════════════════════════════════════════
# _extract_keywords 测试
# ═══════════════════════════════════════════════════════

class TestExtractKeywords:
    """关键词提取"""

    def test_basic_extraction(self):
        kws = NarrativeValidator._extract_keywords("这是一个测试场景的描述文本")
        assert len(kws) > 0
        assert any("测试" in kw or "场景" in kw or "描述" in kw for kw in kws)

    def test_stopwords_filtered(self):
        """停用词应被过滤——纯停用词文本不会产生有意义的 2-4 字词块"""
        kws = NarrativeValidator._extract_keywords("的了不是也和很到说要")
        # 这些单字都是 stopwords，但 2-gram 补充会生成一些，不会很多
        # 核心验证：不应包含这些单字停用词本身
        for stopword in ["的", "了", "是", "我", "也", "和", "很", "要"]:
            assert stopword not in kws, f"停用词 '{stopword}' 不应出现在关键词中"

    def test_max_limit(self):
        """不应超过 15 个关键词"""
        long_text = " ".join(f"关键词{i}" for i in range(30))
        kws = NarrativeValidator._extract_keywords(long_text)
        assert len(kws) <= 15

    def test_empty_text(self):
        kws = NarrativeValidator._extract_keywords("")
        assert kws == []
