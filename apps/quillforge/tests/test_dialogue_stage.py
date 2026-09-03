# -*- coding: utf-8 -*-
"""DialogueStage 集成测试

测试覆盖：
  1. execute 非流式执行
  2. execute_stream 流式执行
  3. speaker 归一化
  4. 动作/心理旁白穿插
  5. 非法 speaker 过滤
"""

from unittest.mock import MagicMock, patch
import pytest

from schemas import (
    Character, Dialogue, HarnessInput, AssembledContext,
    GenerationOptions, PreviousContext,
)
from quillforge.stages.dialogue import DialogueStage
from quillforge.fixtures import PreparedContext


# ═══════════════════════════════════════════════════════
# 测试辅助
# ═══════════════════════════════════════════════════════

def make_characters():
    """构建测试角色列表"""
    return [
        Character(name="苏然", role="主角", personality="冷静", id="su_ran"),
        Character(name="林晓", role="配角", personality="活泼", id="lin_xiao"),
        Character(name="杜维明", role="导师", personality="睿智", id="du_weiming"),
    ]


def make_assembled(characters=None):
    """构建 AssembledContext"""
    if characters is None:
        characters = make_characters()
    return AssembledContext(
        current_node="开端",
        node_index=0,
        total_nodes=3,
        previous_node="",
        next_node="发展",
        worldline_progress=0.0,
        scene_description="测试场景",
        active_characters=characters,
        player_decision="",
        tension="medium",
        narrative_direction="测试方向",
        raw_worldline="开端 → 发展 → 结局",
        annotated_worldline="【开端】 → 发展 ○ → 结局 ○",
        nodes=["开端", "发展", "结局"],
    )


def make_prepared_context(characters=None):
    """构建 PreparedContext"""
    assembled = make_assembled(characters)
    return PreparedContext(
        assembled=assembled,
        rendered_system_prompt="测试系统提示词",
        extra={},
    )


def make_harness_input():
    """构建 HarnessInput"""
    return HarnessInput(
        current_scene="测试场景描述",
        characters=make_characters(),
        worldline="【开端】 → 发展 → 结局",
        player_choice="",
        options=GenerationOptions(
            dialogue_count_min=3,
            dialogue_count_max=10,
        ),
    )


def make_mock_sut():
    """构建 mock SUT"""
    sut = MagicMock()
    sut.prompts = {"dialogue": "对话模板 {{narration}}"}
    sut.render_template.return_value = "渲染后的 prompt"
    return sut


# ═══════════════════════════════════════════════════════
# DialogueStage 基本属性测试
# ═══════════════════════════════════════════════════════

class TestDialogueStageBasics:
    """DialogueStage 基本属性"""

    def test_name(self):
        stage = DialogueStage()
        assert stage.name == "dialogue_generation"

    def test_stage_number(self):
        stage = DialogueStage()
        assert stage.stage_number == 3


# ═══════════════════════════════════════════════════════
# execute 非流式执行测试
# ═══════════════════════════════════════════════════════

class TestDialogueStageExecute:
    """execute 非流式执行"""

    def test_execute_basic(self):
        """基本非流式执行"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        # mock LLM 返回对话列表
        sut.call_json.return_value = [
            {"speaker": "苏然", "text": "你好", "emotion": "平静"},
            {"speaker": "林晓", "text": "你好啊", "emotion": "开心"},
            {"speaker": "苏然", "text": "开始吧", "emotion": "坚定"},
        ]

        result = stage.execute(ctx, sut, inp, {}, "旁白内容")

        assert len(result) == 3
        assert result[0].speaker == "苏然"
        assert result[0].text == "你好"
        assert result[1].speaker == "林晓"
        assert result[2].speaker == "苏然"

    def test_execute_with_id_normalization(self):
        """通过角色 ID 归一化 speaker"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json.return_value = [
            {"speaker": "su_ran", "text": "通过ID识别", "emotion": "平静"},
            {"speaker": "lin_xiao", "text": "也是ID", "emotion": "开心"},
        ]

        result = stage.execute(ctx, sut, inp, {}, "")

        assert len(result) == 2
        assert result[0].speaker == "苏然"
        assert result[1].speaker == "林晓"

    def test_execute_with_lowercase_normalization(self):
        """通过小写名归一化 speaker"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json.return_value = [
            {"speaker": "苏然", "text": "正常", "emotion": "平静"},
            {"speaker": "林晓", "text": "也正常", "emotion": "开心"},
        ]

        result = stage.execute(ctx, sut, inp, {}, "")
        assert len(result) == 2

    def test_execute_filter_invalid_speaker(self):
        """过滤非法 speaker"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json.return_value = [
            {"speaker": "苏然", "text": "合法对话", "emotion": "平静"},
            {"speaker": "路人甲", "text": "非法角色", "emotion": ""},
            {"speaker": "林晓", "text": "另一条合法", "emotion": "开心"},
            {"speaker": "unknown", "text": "又一个非法", "emotion": ""},
        ]

        result = stage.execute(ctx, sut, inp, {}, "")

        # 只保留合法 speaker
        assert len(result) == 2
        assert result[0].speaker == "苏然"
        assert result[1].speaker == "林晓"

    def test_execute_json_decode_error(self):
        """JSON 解析失败时返回空列表"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        import json
        sut.call_json.side_effect = json.JSONDecodeError("test", "", 0)

        result = stage.execute(ctx, sut, inp, {}, "")
        assert result == []

    def test_execute_non_list_response(self):
        """LLM 返回非列表类型"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json.return_value = {"not": "a list"}

        result = stage.execute(ctx, sut, inp, {}, "")
        assert result == []

    def test_execute_empty_response(self):
        """LLM 返回空列表"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json.return_value = []

        result = stage.execute(ctx, sut, inp, {}, "")
        assert result == []


# ═══════════════════════════════════════════════════════
# execute_stream 流式执行测试
# ═══════════════════════════════════════════════════════

class TestDialogueStageExecuteStream:
    """execute_stream 流式执行"""

    def test_stream_basic(self):
        """基本流式执行"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json_stream.return_value = iter([
            {"type": "dialogue", "speaker": "苏然", "text": "你好", "emotion": "平静"},
            {"type": "dialogue", "speaker": "林晓", "text": "你好", "emotion": "开心"},
            {"type": "dialogue", "speaker": "苏然", "text": "开始吧", "emotion": "坚定"},
        ])

        events = []
        gen = stage.execute_stream(ctx, sut, inp, {}, "旁白")
        while True:
            try:
                event = next(gen)
                events.append(event)
            except StopIteration as e:
                result = e.value
                break

        assert len(events) == 3
        assert all(e["kind"] == "dialogue" for e in events)
        assert len(result) == 3
        assert result[0].speaker == "苏然"

    def test_stream_with_actions(self):
        """流式执行穿插动作旁白"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json_stream.return_value = iter([
            {"type": "dialogue", "speaker": "苏然", "text": "你好", "emotion": "平静"},
            {"type": "action", "subject": "林晓", "text": "走到窗前"},
            {"type": "dialogue", "speaker": "林晓", "text": "天气真好", "emotion": "开心"},
            {"type": "narration", "text": "阳光洒进房间"},
            {"type": "dialogue", "speaker": "苏然", "text": "是的", "emotion": "微笑"},
        ])

        events = []
        gen = stage.execute_stream(ctx, sut, inp, {}, "")
        while True:
            try:
                event = next(gen)
                events.append(event)
            except StopIteration as e:
                result = e.value
                break

        # 3 条对话 + 2 条动作
        assert len(events) == 5
        dialogue_events = [e for e in events if e["kind"] == "dialogue"]
        action_events = [e for e in events if e["kind"] == "action"]
        assert len(dialogue_events) == 3
        assert len(action_events) == 2
        assert action_events[0]["text"] == "走到窗前"
        assert action_events[1]["text"] == "阳光洒进房间"

    def test_stream_action_without_speaker(self):
        """无 speaker 但有 text 的项作为动作处理"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json_stream.return_value = iter([
            {"speaker": "", "text": "一段心理描写", "type": ""},
            {"type": "beat", "text": "停顿片刻"},
        ])

        events = []
        gen = stage.execute_stream(ctx, sut, inp, {}, "")
        while True:
            try:
                event = next(gen)
                events.append(event)
            except StopIteration as e:
                result = e.value
                break

        assert len(events) == 2
        assert all(e["kind"] == "action" for e in events)
        assert len(result) == 0  # 没有对话

    def test_stream_filter_invalid_speaker(self):
        """流式过滤非法 speaker"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json_stream.return_value = iter([
            {"type": "dialogue", "speaker": "苏然", "text": "合法", "emotion": ""},
            {"type": "dialogue", "speaker": "路人甲", "text": "非法", "emotion": ""},
            {"type": "dialogue", "speaker": "林晓", "text": "合法", "emotion": ""},
        ])

        events = []
        gen = stage.execute_stream(ctx, sut, inp, {}, "")
        while True:
            try:
                event = next(gen)
                events.append(event)
            except StopIteration as e:
                result = e.value
                break

        # 只有 2 条合法对话
        dialogue_events = [e for e in events if e["kind"] == "dialogue"]
        assert len(dialogue_events) == 2
        assert len(result) == 2

    def test_stream_action_with_invalid_subject(self):
        """动作的 subject 非法时置空"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json_stream.return_value = iter([
            {"type": "action", "subject": "路人乙", "text": "某个动作"},
        ])

        events = []
        gen = stage.execute_stream(ctx, sut, inp, {}, "")
        while True:
            try:
                event = next(gen)
                events.append(event)
            except StopIteration:
                break

        assert len(events) == 1
        assert events[0]["kind"] == "action"
        assert events[0]["subject"] == ""  # 非法 subject 被置空

    def test_stream_skip_non_dict_items(self):
        """流式跳过非 dict 项"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json_stream.return_value = iter([
            "not a dict",
            42,
            None,
            {"type": "dialogue", "speaker": "苏然", "text": "合法", "emotion": ""},
        ])

        events = []
        gen = stage.execute_stream(ctx, sut, inp, {}, "")
        while True:
            try:
                event = next(gen)
                events.append(event)
            except StopIteration as e:
                result = e.value
                break

        assert len(events) == 1
        assert len(result) == 1

    def test_stream_empty(self):
        """空流式响应"""
        stage = DialogueStage()
        ctx = make_prepared_context()
        sut = make_mock_sut()
        inp = make_harness_input()

        sut.call_json_stream.return_value = iter([])

        events = []
        gen = stage.execute_stream(ctx, sut, inp, {}, "")
        while True:
            try:
                event = next(gen)
                events.append(event)
            except StopIteration as e:
                result = e.value
                break

        assert events == []
        assert result == []


# ═══════════════════════════════════════════════════════
# _build_speaker_map 测试
# ═══════════════════════════════════════════════════════

class TestBuildSpeakerMap:
    """speaker 归一化映射"""

    def test_build_speaker_map(self):
        """构建 speaker 映射"""
        characters = make_characters()
        speaker_map = DialogueStage._build_speaker_map(characters)

        # 中文名
        assert speaker_map["苏然"] == "苏然"
        assert speaker_map["林晓"] == "林晓"
        assert speaker_map["杜维明"] == "杜维明"

        # 小写中文名
        assert speaker_map["苏然"] == "苏然"

        # ID
        assert speaker_map["su_ran"] == "苏然"
        assert speaker_map["lin_xiao"] == "林晓"
        assert speaker_map["du_weiming"] == "杜维明"

        # ID 去下划线
        assert speaker_map["suran"] == "苏然"
        assert speaker_map["linxiao"] == "林晓"
        assert speaker_map["duweiming"] == "杜维明"

    def test_build_speaker_map_empty(self):
        """空角色列表"""
        speaker_map = DialogueStage._build_speaker_map([])
        assert speaker_map == {}

    def test_build_speaker_map_no_id(self):
        """角色无 ID"""
        characters = [
            Character(name="角色A", role="主角", personality="冷静", id=""),
        ]
        speaker_map = DialogueStage._build_speaker_map(characters)

        assert speaker_map["角色A"] == "角色A"
        # 不应有 ID 相关映射
        assert "" not in speaker_map


# ═══════════════════════════════════════════════════════
# _build_prompt 测试
# ═══════════════════════════════════════════════════════

class TestBuildPrompt:
    """构建对话 prompt"""

    def test_build_prompt(self):
        """prompt 构建包含关键变量"""
        stage = DialogueStage()
        assembled = make_assembled()
        sut = make_mock_sut()
        inp = make_harness_input()

        extra = {
            "_worldbook": "世界书内容",
            "_plotSummary": "剧情概要",
            "_coreConflict": "核心冲突",
            "_themes": "主题",
            "_relationshipNetwork": "关系网",
            "_sceneDetails": "场景细节",
            "_worldlines": "世界线",
            "_endings": "结局",
            "_keyChoices": "关键选择",
            "_events": "事件",
            "_stagesOverview": "阶段概览",
            "_choiceHistory": "选择历史",
            "_playerState": "玩家状态",
            "_currentStageContext": "当前阶段上下文",
            "_sceneBeats": "场景节拍",
            "_sceneHooks": "场景钩子",
            "_characterVoiceTones": "角色语调",
        }

        stage._build_prompt(assembled, inp, extra, "旁白内容", sut)

        # 验证 render_template 被调用
        sut.render_template.assert_called_once()
        call_args = sut.render_template.call_args
        variables = call_args[0][1]

        assert variables["narration"] == "旁白内容"
        assert variables["currentNode"] == "开端"
        assert variables["nextNode"] == "发展"
        assert variables["worldlineProgress"] == 0
        assert "characters" in variables
