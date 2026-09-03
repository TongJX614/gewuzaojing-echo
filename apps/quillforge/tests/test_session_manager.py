# -*- coding: utf-8 -*-
"""GameSession 单元测试

测试覆盖：
  1. 会话初始化状态 (IDLE)
  2. 进度计算 (progress, total_scenes)
  3. 状态迁移: IDLE → GENERATED (generate)
  4. 状态迁移: GENERATED → CHOSEN (choose)
  5. 状态迁移: CHOSEN → GENERATED (generate again)
  6. 状态迁移: 最后场景 choose → FINISHED
  7. 非法状态操作防护
  8. 场景跳转 (_resolve_next_scene_index)
  9. 结局匹配 (_match_ending)
  10. 状态查询 (get_state)
  11. PlayerState 属性/关系/性格追踪
"""

from unittest.mock import MagicMock, patch, PropertyMock
import pytest
from fastapi import HTTPException

from session_manager import (
    GameSession, SessionState, PlayerState, ChoiceRequest,
)
from schemas import Character, Dialogue, Choice


# ═══════════════════════════════════════════════════════
# 测试辅助 fixtures
# ═══════════════════════════════════════════════════════

def make_mock_adapter(
    scenes: list[dict] = None,
    worldline_nodes: list[str] = None,
    raw_data: dict = None,
):
    """构建 mock GenericScriptAdapter"""
    adapter = MagicMock()
    # 注意：不能用 `scenes or [...]`，否则显式传入空列表（空剧本场景）会被默认值覆盖
    adapter.scenes = [
        {"id": "scene_01", "name": "场景1", "location": "地点1", "description": "描述1"},
        {"id": "scene_02", "name": "场景2", "location": "地点2", "description": "描述2"},
        {"id": "scene_03", "name": "场景3", "location": "地点3", "description": "描述3"},
    ] if scenes is None else scenes
    adapter.worldline_nodes = worldline_nodes or ["开端", "发展", "结局"]
    adapter.raw_data = raw_data or {}

    # build_harness_input 返回标准 dict
    adapter.build_harness_input.return_value = {
        "currentScene": "测试场景",
        "characters": [
            {"name": "角色A", "role": "主角", "personality": "冷静"},
            {"name": "角色B", "role": "配角", "personality": "热血"},
        ],
        "worldline": "开端 → 发展 → 结局",
        "playerChoice": "",
    }

    # get_scene_choices 返回空列表（无预设选项）
    adapter.get_scene_choices.return_value = []

    return adapter


def make_mock_harness():
    """构建 mock Harness"""
    harness = MagicMock()
    harness.run.return_value = {
        "success": True,
        "data": {
            "narration": "测试旁白文本",
            "dialogues": [
                {"speaker": "角色A", "text": "你好", "emotion": "平静"},
                {"speaker": "角色B", "text": "你好", "emotion": "平静"},
                {"speaker": "角色A", "text": "我们开始吧", "emotion": "坚定"},
            ],
            "nextChoices": [
                {"text": "选项1", "effect": "推进主线", "worldlineImpact": "advance"},
                {"text": "选项2", "effect": "探索支线", "worldlineImpact": "side_branch"},
            ],
            "worldlineState": {
                "currentNode": "开端",
                "nodeIndex": 0,
                "totalNodes": 3,
                "progress": 0.0,
            },
        },
        "validation": {"passed": True, "checks": [], "retryCount": 0},
        "metadata": {"generationTime": 1000, "model": "test-model"},
    }
    return harness


# ═══════════════════════════════════════════════════════
# 会话初始化测试
# ═══════════════════════════════════════════════════════

class TestGameSessionInit:
    """会话初始化"""

    def test_initial_state(self):
        session = GameSession(make_mock_adapter())
        assert session.state == SessionState.IDLE
        assert session.current_scene_index == 0
        assert session.history == []
        assert session.previous_result is None
        assert session.current_result is None
        assert len(session.session_id) == 8

    def test_session_id_unique(self):
        """不同会话应有不同 session_id"""
        s1 = GameSession(make_mock_adapter())
        s2 = GameSession(make_mock_adapter())
        assert s1.session_id != s2.session_id

    def test_total_scenes_from_scenes(self):
        """total_scenes 优先从 scenes 获取"""
        adapter = make_mock_adapter(scenes=[
            {"id": "s1"}, {"id": "s2"}, {"id": "s3"}, {"id": "s4"},
        ])
        session = GameSession(adapter)
        assert session.total_scenes == 4

    def test_total_scenes_fallback_to_nodes(self):
        """scenes 为空时 total_scenes 应为 0（不回退到 worldline_nodes，避免越界生成 500）"""
        adapter = make_mock_adapter(scenes=[], worldline_nodes=["A", "B", "C"])
        session = GameSession(adapter)
        assert session.total_scenes == 0

    def test_progress_zero(self):
        session = GameSession(make_mock_adapter(scenes=[
            {"id": "s1"}, {"id": "s2"}, {"id": "s3"},
        ]))
        assert session.progress == 0.0

    def test_player_state_initial(self):
        session = GameSession(make_mock_adapter())
        assert session.player_state.stats == {}
        assert session.player_state.relationships == {}
        assert session.player_state.personality_traits == []


# ═══════════════════════════════════════════════════════
# 状态迁移: generate (IDLE → GENERATED)
# ═══════════════════════════════════════════════════════

class TestGenerate:
    """generate 状态迁移"""

    def test_idle_to_generated(self):
        """IDLE 状态执行 generate 后应变为 GENERATED"""
        session = GameSession(make_mock_adapter())
        harness = make_mock_harness()

        result = session.generate(harness)

        assert session.state == SessionState.GENERATED
        assert session.current_result is not None
        assert result["session_state"] == "generated"
        assert "narration" in result["data"]
        assert "dialogues" in result["data"]
        assert "scene_meta" in result

    def test_already_generated_raises(self):
        """GENERATED 状态再次 generate 应抛出异常"""
        session = GameSession(make_mock_adapter())
        harness = make_mock_harness()
        session.state = SessionState.GENERATED

        with pytest.raises(HTTPException) as exc_info:
            session.generate(harness)
        assert exc_info.value.status_code == 400
        assert "已生成" in exc_info.value.detail

    def test_finished_raises_on_generate(self):
        """FINISHED 状态 generate 应抛出异常"""
        session = GameSession(make_mock_adapter())
        harness = make_mock_harness()
        session.state = SessionState.FINISHED

        with pytest.raises(HTTPException) as exc_info:
            session.generate(harness)
        assert "已结束" in exc_info.value.detail

    def test_no_more_scenes_raises(self):
        """场景索引超出时应抛出异常"""
        adapter = make_mock_adapter(scenes=[{"id": "s1"}])
        session = GameSession(adapter)
        session.current_scene_index = 1  # >= total_scenes
        harness = make_mock_harness()

        with pytest.raises(HTTPException) as exc_info:
            session.generate(harness)
        assert "没有更多场景" in exc_info.value.detail


# ═══════════════════════════════════════════════════════
# 状态迁移: choose (GENERATED → CHOSEN / FINISHED)
# ═══════════════════════════════════════════════════════

class TestChoose:
    """choose 状态迁移"""

    def test_generated_to_chosen(self):
        """GENERATED 状态选择非最后场景 → CHOSEN"""
        adapter = make_mock_adapter(scenes=[
            {"id": "scene_01", "name": "场景1"},
            {"id": "scene_02", "name": "场景2"},
            {"id": "scene_03", "name": "场景3"},
        ])
        session = GameSession(adapter)
        harness = make_mock_harness()
        session.generate(harness)

        result = session.choose(choice_index=0, choice_text="选项1")

        assert session.state == SessionState.CHOSEN
        assert result["session_state"] == "chosen"
        assert result["message"] == "选择已确认"
        assert len(session.history) == 1
        assert session.current_result is None

    def test_not_generated_raises(self):
        """非 GENERATED 状态 choose 应抛出异常"""
        session = GameSession(make_mock_adapter())

        with pytest.raises(HTTPException) as exc_info:
            session.choose(0, "选项1")
        assert "无法做出选择" in exc_info.value.detail

    def test_last_scene_to_finished(self):
        """选择最后一个场景 → FINISHED"""
        adapter = make_mock_adapter(scenes=[
            {"id": "scene_01", "name": "最终场景"},
        ])
        adapter.get_scene_choices.return_value = [
            {"id": "choice_1", "text": "结束", "description": "结束故事"},
        ]
        session = GameSession(adapter)
        harness = make_mock_harness()
        session.generate(harness)

        result = session.choose(0, "结束")

        assert session.state == SessionState.FINISHED
        assert result["session_state"] == "finished"
        assert "故事已结束" in result["message"]
        assert "ending" in result

    def test_choose_triggers_scene_advance(self):
        """选择后 scene_index 应推进"""
        adapter = make_mock_adapter(scenes=[
            {"id": "s1"}, {"id": "s2"}, {"id": "s3"},
        ])
        session = GameSession(adapter)
        harness = make_mock_harness()
        session.generate(harness)

        assert session.current_scene_index == 0
        session.choose(0, "选项1")
        # 无 trigger_conditions → 线性递增
        assert session.current_scene_index == 1

    def test_choose_stores_history(self):
        """选择应存储到 history"""
        adapter = make_mock_adapter(scenes=[
            {"id": "scene_01", "name": "场景1"},
            {"id": "scene_02", "name": "场景2"},
        ])
        session = GameSession(adapter)
        harness = make_mock_harness()
        session.generate(harness)
        session.choose(0, "选项1")

        assert len(session.history) == 1
        assert session.history[0]["scene_id"] == "scene_01"
        assert session.history[0]["player_choice"] == "选项1"


# ═══════════════════════════════════════════════════════
# 场景跳转测试
# ═══════════════════════════════════════════════════════

class TestResolveNextSceneIndex:
    """场景跳转逻辑"""

    def test_default_linear_advance(self):
        """无 trigger_conditions 时线性递增"""
        adapter = make_mock_adapter(scenes=[
            {"id": "s1"}, {"id": "s2"}, {"id": "s3"},
        ])
        session = GameSession(adapter)
        # 无历史，无 trigger_conditions → 默认 linear
        next_idx = session._resolve_next_scene_index()
        assert next_idx == 1

    def test_scene_completed_trigger(self):
        """scene_completed 条件匹配时应跳转到对应场景"""
        adapter = make_mock_adapter(scenes=[
            {"id": "scene_01", "name": "场景1"},
            {"id": "scene_02", "name": "普通场景"},
            {"id": "scene_special", "name": "特殊场景",
             "trigger_conditions": {"type": "scene_completed", "value": "scene_01"}},
            {"id": "scene_03", "name": "场景3"},
        ])
        session = GameSession(adapter)
        # 模拟已访问过 scene_01
        session.history = [{"scene_id": "scene_01", "player_choice": "选项1"}]

        next_idx = session._resolve_next_scene_index()
        # 应跳过 scene_02，直接到 scene_special (index 2)
        assert next_idx == 2

    def test_empty_trigger_conditions_skip(self):
        """空 trigger_conditions 的场景应被跳过"""
        adapter = make_mock_adapter(scenes=[
            {"id": "s1"},  # 0
            {"id": "s2", "trigger_conditions": {}},  # 1 - 空条件，跳过
            {"id": "s3"},  # 2
        ])
        session = GameSession(adapter)
        next_idx = session._resolve_next_scene_index()
        # 跳过空条件场景 s2，但最终回退到线性递增 1
        # 因为代码逻辑是：无条件场景 continue 跳过，后面无匹配则返回 default_next (1)
        assert next_idx == 1


# ═══════════════════════════════════════════════════════
# 结局匹配测试
# ═══════════════════════════════════════════════════════

class TestMatchEnding:
    """结局匹配"""

    def test_no_endings_returns_none(self):
        session = GameSession(make_mock_adapter())
        result = session._match_ending([], [])
        assert result is None

    def test_match_by_choice(self):
        endings = [
            {
                "title": "好结局",
                "type": "good",
                "narrative": "一切都很美好",
                "trigger_conditions": [
                    {"type": "choice_made", "value": "在scene_01选择帮助"},
                ],
            },
        ]
        history = [
            {"scene_id": "scene_01", "player_choice": "帮助"},
        ]
        session = GameSession(make_mock_adapter())
        result = session._match_ending(endings, history)

        assert result is not None
        assert result["title"] == "好结局"
        assert result["type"] == "good"

    def test_empty_history_low_score(self):
        """空历史时结局匹配得分应为 0（未命中任何条件），不应返回零分结局"""
        endings = [
            {
                "title": "隐藏结局",
                "type": "hidden",
                "trigger_conditions": [
                    {"type": "choice_made", "value": "在scene_01选择特殊选项"},
                ],
            },
        ]
        session = GameSession(make_mock_adapter())
        result = session._match_ending(endings, [])
        # 空历史时 normalized_score = 0，零分不应被当作匹配成功
        # （旧行为会无条件返回结局列表第一个，导致玩家选择与结局无关）
        assert result is None


# ═══════════════════════════════════════════════════════
# get_state 测试
# ═══════════════════════════════════════════════════════

class TestGetState:
    """状态查询"""

    def test_get_state_idle(self):
        session = GameSession(make_mock_adapter())
        state = session.get_state()

        assert state["state"] == "idle"
        assert state["session_id"] == session.session_id
        assert "current_scene" in state
        assert state["total_scenes"] == 3
        assert state["completed_scenes"] == 0

    def test_get_state_after_generate(self):
        session = GameSession(make_mock_adapter())
        harness = make_mock_harness()
        session.generate(harness)

        state = session.get_state()
        assert state["state"] == "generated"
        assert state["completed_scenes"] == 0  # 还未选择

    def test_get_state_after_choose(self):
        adapter = make_mock_adapter(scenes=[
            {"id": "s1"}, {"id": "s2"}, {"id": "s3"},
        ])
        session = GameSession(adapter)
        harness = make_mock_harness()
        session.generate(harness)
        session.choose(0, "选项1")

        state = session.get_state()
        assert state["state"] == "chosen"
        assert state["completed_scenes"] == 1  # 已完成一个场景


# ═══════════════════════════════════════════════════════
# PlayerState 测试
# ═══════════════════════════════════════════════════════

class TestPlayerState:
    """玩家状态追踪"""

    def test_apply_stats_changes(self):
        ps = PlayerState()
        cons = {"stats_changes": {"courage": 3, "mental_stability": -2}}
        ps.apply_consequences(cons)

        assert ps.stats["courage"] == 3
        assert ps.stats["mental_stability"] == -2

    def test_apply_relationship_changes(self):
        ps = PlayerState()
        cons = {
            "relationship_changes": [
                {"character": "char_a", "change": 2, "reason": "帮助了ta"},
                {"character": "char_b", "change": -1, "reason": "拒绝了ta"},
            ],
        }
        ps.apply_consequences(cons)

        assert ps.relationships["char_a"] == 2
        assert ps.relationships["char_b"] == -1
        assert "帮助了ta" in ps.relationship_reasons["char_a"]

    def test_apply_personality_impact(self):
        ps = PlayerState()
        option_data = {"personality_impact": "展现了果断、勇敢的一面"}
        ps.apply_consequences({}, option_data)

        assert "展现了果断、勇敢的一面" in ps.personality_traits

    def test_accumulate_multiple_choices(self):
        """多次选择应累积效果"""
        ps = PlayerState()
        ps.apply_consequences({"stats_changes": {"courage": 2}})
        ps.apply_consequences({"stats_changes": {"courage": 1}})
        assert ps.stats["courage"] == 3

    def test_format_for_prompt_with_stats(self):
        ps = PlayerState()
        ps.apply_consequences({"stats_changes": {"courage": 3, "mental_stability": -1}})
        formatted = ps.format_for_prompt()

        assert "courage" in formatted
        assert "+3" in formatted
        assert "mental_stability" in formatted

    def test_format_for_prompt_empty(self):
        ps = PlayerState()
        assert ps.format_for_prompt() == ""


# ═══════════════════════════════════════════════════════
# ChoiceRequest 测试
# ═══════════════════════════════════════════════════════

class TestChoiceRequest:
    """选项请求模型"""

    def test_model_creation(self):
        req = ChoiceRequest(choice_text="选项1", choice_index=0)
        assert req.choice_text == "选项1"
        assert req.choice_index == 0


# ═══════════════════════════════════════════════════════
# 内嵌小游戏：start / resolve / cancel 状态迁移
# ═══════════════════════════════════════════════════════

MG_CHOICE = {
    "id": "decrypt",
    "text": "立即解密附件",
    "description": "直觉不简单",
    "consequences": {"immediate": "默认后果"},
    "minigame": {"type": "puzzle", "hint": "解密附件"},
}
PLAIN_CHOICE = {"id": "investigate", "text": "先调查发件人", "description": "谨慎行事", "consequences": {}}
GAME_DATA = {"type": "puzzle", "mode": "cipher", "gameId": "g_test", "title": "解密附件", "cipherText": "◈◆◈", "hint": "提示", "answerLength": 4}
JUDGE_OK = {"success": True, "successText": "解密成功，附件打开了", "failureText": "解密失败", "correctAnswer": "织星", "final": True}
JUDGE_BAD = {**JUDGE_OK, "success": False}
JUDGE_RETRY = {"success": False, "final": False, "attemptsLeft": 2, "revealHint": "织", "failureText": "解密失败"}


def make_minigame_session(monkeypatch, choices=None, scenes=3, judge_result=None):
    """构造已 generate 的会话，并替换小游戏生成/判定为确定性 stub

    默认同时禁用随机注入（确定性）；注入行为由 TestChoiceInjection 专门覆盖。
    """
    import session_manager as sm
    monkeypatch.setattr(sm, "generate_minigame", lambda adapter, kind, scene_context=None: dict(GAME_DATA))
    monkeypatch.setattr(sm, "judge_minigame", lambda game_id, answer: dict(judge_result or JUDGE_OK))
    monkeypatch.setattr(sm, "inject_choice_minigames",
                        lambda choices, last_kind=None, config=None, scene_index=None: (list(choices), {}))
    adapter = make_mock_adapter(scenes=[{"id": f"s{i}", "name": f"场景{i}"} for i in range(1, scenes + 1)])
    adapter.get_scene_choices.return_value = [MG_CHOICE, PLAIN_CHOICE] if choices is None else choices
    session = GameSession(adapter)
    session.generate(make_mock_harness())
    return session


class TestStartMinigame:
    """start_minigame: GENERATED → MINIGAME"""

    def test_generated_to_minigame(self, monkeypatch):
        session = make_minigame_session(monkeypatch)
        game = session.start_minigame(0)

        assert session.state == SessionState.MINIGAME
        assert game["gameId"] == "g_test"
        assert session.pending_minigame["game_id"] == "g_test"
        assert session.pending_minigame["choice_index"] == 0
        assert session.pending_minigame["chosen"]["text"] == "立即解密附件"

    def test_puzzle_alias_normalized(self, monkeypatch):
        """剧本声明 puzzle 应归一化为 cipher 调用生成器"""
        import session_manager as sm
        session = make_minigame_session(monkeypatch)
        calls = {}
        monkeypatch.setattr(sm, "generate_minigame", lambda adapter, kind, scene_context=None: (calls.setdefault("kind", kind), GAME_DATA)[1])
        session.start_minigame(0)
        assert calls["kind"] == "cipher"

    def test_scene_context_passed(self, monkeypatch):
        """生成器应收到当前场景上下文（选项/旁白/对话/历史）"""
        import session_manager as sm
        session = make_minigame_session(monkeypatch)
        captured = {}
        monkeypatch.setattr(sm, "generate_minigame", lambda adapter, kind, scene_context=None: (captured.update(ctx=scene_context), GAME_DATA)[1])
        session.start_minigame(0)
        ctx = captured["ctx"]
        assert ctx["choice_text"] == "立即解密附件"
        assert ctx["hint"] == "解密附件"
        assert ctx["narration"] == "测试旁白文本"
        assert len(ctx["dialogues"]) == 3

    def test_not_generated_raises(self, monkeypatch):
        import session_manager as sm
        monkeypatch.setattr(sm, "generate_minigame", lambda adapter, kind, scene_context=None: dict(GAME_DATA))
        session = GameSession(make_mock_adapter())  # IDLE
        with pytest.raises(HTTPException) as exc_info:
            session.start_minigame(0)
        assert exc_info.value.status_code == 400
        assert "无法开始小游戏" in exc_info.value.detail

    def test_invalid_choice_index(self, monkeypatch):
        session = make_minigame_session(monkeypatch)
        with pytest.raises(HTTPException) as exc_info:
            session.start_minigame(99)
        assert "无效的选项" in exc_info.value.detail

    def test_choice_without_minigame_raises(self, monkeypatch):
        session = make_minigame_session(monkeypatch)
        with pytest.raises(HTTPException) as exc_info:
            session.start_minigame(1)  # PLAIN_CHOICE 无 minigame 声明
        assert "未配置小游戏" in exc_info.value.detail

    def test_generate_blocked_during_minigame(self, monkeypatch):
        """MINIGAME 状态下 generate 应被拦截"""
        session = make_minigame_session(monkeypatch)
        session.start_minigame(0)
        with pytest.raises(HTTPException) as exc_info:
            session.generate(make_mock_harness())
        assert "小游戏进行中" in exc_info.value.detail


class TestResolveMinigame:
    """resolve_minigame: MINIGAME → CHOSEN / FINISHED"""

    def test_success_to_chosen(self, monkeypatch):
        session = make_minigame_session(monkeypatch, judge_result=JUDGE_OK)
        session.start_minigame(0)
        result = session.resolve_minigame("织星")

        assert result["success"] is True
        assert result["session_state"] == "chosen"
        assert session.state == SessionState.CHOSEN
        assert session.pending_minigame is None
        assert session.current_scene_index == 1

    def test_success_history_and_consequences(self, monkeypatch):
        """成功结算：成功文案覆盖后果，option_id 带 _mg_success 后缀"""
        session = make_minigame_session(monkeypatch, judge_result=JUDGE_OK)
        session.start_minigame(0)
        session.resolve_minigame("织星")

        assert len(session.history) == 1
        h = session.history[0]
        assert h["player_choice"] == "立即解密附件"
        assert h["option_id"] == "decrypt_mg_success"
        assert h["consequences"] == "解密成功，附件打开了"

    def test_failure_suffix_and_text(self, monkeypatch):
        session = make_minigame_session(monkeypatch, judge_result=JUDGE_BAD)
        session.start_minigame(0)
        result = session.resolve_minigame("错误答案")

        assert result["success"] is False
        assert session.history[0]["option_id"] == "decrypt_mg_failure"
        assert session.history[0]["consequences"] == "解密失败"

    def test_last_scene_to_finished(self, monkeypatch):
        """最后场景结算 → FINISHED 且携带 ending"""
        session = make_minigame_session(monkeypatch, scenes=1)
        session.start_minigame(0)
        result = session.resolve_minigame("织星")

        assert session.state == SessionState.FINISHED
        assert result["session_state"] == "finished"
        assert "ending" in result

    def test_resolve_without_pending_raises(self, monkeypatch):
        session = make_minigame_session(monkeypatch)
        with pytest.raises(HTTPException) as exc_info:
            session.resolve_minigame("织星")
        assert "无待结算的小游戏" in exc_info.value.detail

    def test_non_final_retry_stays_minigame(self, monkeypatch):
        """非终局结果（仍有重试机会）不推进剧情，保持 MINIGAME"""
        session = make_minigame_session(monkeypatch, judge_result=JUDGE_RETRY)
        session.start_minigame(0)
        result = session.resolve_minigame("错误答案")

        assert result["success"] is False
        assert result["final"] is False
        assert result["attemptsLeft"] == 2
        assert result["revealHint"] == "织"
        assert result["session_state"] == "minigame"
        assert session.state == SessionState.MINIGAME
        assert session.pending_minigame is not None
        assert session.current_scene_index == 0
        assert session.history == []


class TestCancelMinigame:
    """cancel_minigame: MINIGAME → GENERATED"""

    def test_cancel_back_to_generated(self, monkeypatch):
        session = make_minigame_session(monkeypatch)
        session.start_minigame(0)
        result = session.cancel_minigame()

        assert session.state == SessionState.GENERATED
        assert session.pending_minigame is None
        assert result["session_state"] == "generated"

    def test_cancel_without_minigame_raises(self, monkeypatch):
        session = make_minigame_session(monkeypatch)
        with pytest.raises(HTTPException) as exc_info:
            session.cancel_minigame()
        assert "无进行中的小游戏" in exc_info.value.detail

    def test_cancel_then_generate_ok(self, monkeypatch):
        """取消后可重新生成场景（回到正常流程）"""
        session = make_minigame_session(monkeypatch)
        session.start_minigame(0)
        session.cancel_minigame()
        session.choose(0, "立即解密附件")  # 改走普通 choose 路径
        assert session.state == SessionState.CHOSEN


# ═══════════════════════════════════════════════════════
# 空选项兜底与 finish 完稿（结局不显示问题回归）
# ═══════════════════════════════════════════════════════

class TestEmptyChoicesFallback:
    """剧本无选项且 LLM 返回空选项时应注入兜底推进项"""

    def test_generate_injects_fallback_choices(self):
        """非终局场景空选项 → 注入 __advance__ 兜底项"""
        adapter = make_mock_adapter(scenes=[{"id": "s1"}, {"id": "s2"}])
        session = GameSession(adapter)
        harness = make_mock_harness()
        harness.run.return_value["data"]["nextChoices"] = []

        result = session.generate(harness)

        fallback = result["data"]["nextChoices"]
        assert len(fallback) == 1
        assert fallback[0]["id"] == "__advance__"

    def test_final_scene_fallback_choice_reaches_finished(self):
        """终局场景兜底项应为 __finish__，点击后到达 FINISHED 并携带 ending"""
        adapter = make_mock_adapter(scenes=[{"id": "s1"}])
        session = GameSession(adapter)
        harness = make_mock_harness()
        harness.run.return_value["data"]["nextChoices"] = []

        result = session.generate(harness)
        fallback = result["data"]["nextChoices"]
        assert fallback[0]["id"] == "__finish__"

        result = session.choose(0, fallback[0]["text"])
        assert session.state == SessionState.FINISHED
        assert result["session_state"] == "finished"
        assert "ending" in result

    def test_script_choices_not_overridden(self):
        """剧本已有选项时不注入兜底项"""
        adapter = make_mock_adapter(scenes=[{"id": "s1"}, {"id": "s2"}])
        adapter.get_scene_choices.return_value = [
            {"id": "c1", "text": "已有选项", "consequences": {}},
        ]
        session = GameSession(adapter)
        harness = make_mock_harness()
        harness.run.return_value["data"]["nextChoices"] = []

        result = session.generate(harness)
        assert result["data"]["nextChoices"] == []


class TestFinish:
    """finish()：终局场景无选项时直接完稿进入结局"""

    def test_finish_on_final_scene(self):
        adapter = make_mock_adapter(scenes=[{"id": "s1"}, {"id": "s2"}])
        session = GameSession(adapter)
        harness = make_mock_harness()
        session.generate(harness)          # 场景 1/2
        session.choose(0, "选项1")         # → CHOSEN，推进到终局场景
        session.generate(harness)          # 终局场景 GENERATED

        result = session.finish()

        assert session.state == SessionState.FINISHED
        assert result["session_state"] == "finished"
        assert "ending" in result
        assert len(session.history) == 2

    def test_finish_on_non_final_scene_raises(self):
        """尚有后续场景时不允许直接完稿"""
        session = GameSession(make_mock_adapter())  # 3 个场景
        harness = make_mock_harness()
        session.generate(harness)  # 场景 1/3

        with pytest.raises(HTTPException) as exc_info:
            session.finish()
        assert "尚有未完成的场景" in exc_info.value.detail

    def test_finish_in_idle_raises(self):
        session = GameSession(make_mock_adapter())
        with pytest.raises(HTTPException) as exc_info:
            session.finish()
        assert "无法完稿" in exc_info.value.detail

    def test_finish_twice_raises(self):
        adapter = make_mock_adapter(scenes=[{"id": "s1"}])
        session = GameSession(adapter)
        harness = make_mock_harness()
        session.generate(harness)
        session.finish()

        with pytest.raises(HTTPException) as exc_info:
            session.finish()
        assert "故事已结束" in exc_info.value.detail


# ═══════════════════════════════════════════════
# 选项随机注入小游戏：标记下发/触发/生命周期
# ═══════════════════════════════════════════════

class TestChoiceInjection:
    """场景生成时按概率给选项挂载随机小游戏（后端注入）"""

    def _injected_session(self, monkeypatch, injected_map: dict,
                          generate_stub=None, context_sink=None):
        """构造会话：注入函数被 stub 为按 injected_map 确定性注入

        generate_stub/context_sink 用于需要观察 generate_minigame 调用的测试，
        避免被默认 stub 覆盖。
        """
        import session_manager as sm
        if generate_stub is not None:
            monkeypatch.setattr(sm, "generate_minigame", generate_stub)
        elif context_sink is not None:
            monkeypatch.setattr(
                sm, "generate_minigame",
                lambda adapter, kind, scene_context=None: (
                    context_sink.update(ctx=scene_context), dict(GAME_DATA))[1])
        else:
            monkeypatch.setattr(sm, "generate_minigame",
                                lambda adapter, kind, scene_context=None: dict(GAME_DATA))
        monkeypatch.setattr(sm, "judge_minigame",
                            lambda game_id, answer: dict(JUDGE_OK))

        def fake_inject(choices, last_kind=None, config=None, scene_index=None):
            out, injected = [], {}
            for i, c in enumerate(choices):
                c = dict(c)
                if i in injected_map and not c.get("minigame"):
                    decl = {"type": injected_map[i], "hint": "", "injected": True}
                    c["minigame"] = decl
                    injected[i] = decl
                out.append(c)
            return out, injected

        monkeypatch.setattr(sm, "inject_choice_minigames", fake_inject)
        adapter = make_mock_adapter(scenes=[{"id": "s1", "name": "场景1"}, {"id": "s2", "name": "场景2"}])
        adapter.get_scene_choices.return_value = [dict(MG_CHOICE), dict(PLAIN_CHOICE)]
        session = GameSession(adapter)
        return session

    def test_generate_exposes_injected_badge(self, monkeypatch):
        """available_choices 携带注入的 minigame 标记供前端渲染徽章"""
        session = self._injected_session(monkeypatch, {1: "shuffle"})
        result = session.generate(make_mock_harness())
        ac = result["available_choices"]
        assert ac[0]["minigame"]["type"] == "puzzle"  # YAML 声明原样保留（触发时才归一化）
        assert ac[1]["minigame"]["type"] == "shuffle"
        assert ac[1]["minigame"]["injected"] is True
        # adapter 原始数据不被污染
        raw = session.adapter.get_scene_choices.return_value
        assert "minigame" not in raw[1]

    def test_injection_stable_within_scene(self, monkeypatch):
        """同一场景多次取选项（流式 meta 两次下发）注入结果不变"""
        session = self._injected_session(monkeypatch, {1: "radio"})
        session.generate(make_mock_harness())
        raw = session.adapter.get_scene_choices.return_value
        first = session._prepare_scene_choices(raw)
        second = session._prepare_scene_choices(raw)
        assert first[1]["minigame"] == second[1]["minigame"]

    def test_start_minigame_with_injected_decl(self, monkeypatch):
        """点击被注入的选项：无 YAML 声明也能触发小游戏"""
        import session_manager as sm
        calls = {}
        stub = lambda adapter, kind, scene_context=None: (calls.update(kind=kind), dict(GAME_DATA))[1]  # noqa: E731
        session = self._injected_session(monkeypatch, {1: "search"}, generate_stub=stub)
        session.generate(make_mock_harness())

        game = session.start_minigame(1)
        assert game["gameId"] == "g_test"
        assert calls["kind"] == "search"
        assert session.state == SessionState.MINIGAME
        assert session.pending_minigame["kind"] == "search"

    def test_injection_reset_after_scene_advance(self, monkeypatch):
        """选择推进场景后注入记录作废；结算记录 last_minigame_kind"""
        session = self._injected_session(monkeypatch, {1: "voyage"})
        session.generate(make_mock_harness())
        session.start_minigame(1)
        session.resolve_minigame("x")  # JUDGE_OK → 终局成功，推进场景
        assert session.last_minigame_kind == "voyage"
        assert session._injected_minigames is None

    def test_cancel_keeps_injection(self, monkeypatch):
        """放弃小游戏回到选项：注入记录保留，可重新进入"""
        session = self._injected_session(monkeypatch, {1: "clue"})
        session.generate(make_mock_harness())
        session.start_minigame(1)
        session.cancel_minigame()
        assert session.state == SessionState.GENERATED
        assert session._injected_minigames is not None
        session.start_minigame(1)  # 再次进入不报错
        assert session.state == SessionState.MINIGAME

    def test_scene_context_carries_revealed_view(self, monkeypatch):
        """内嵌上下文携带已揭示视野：登场角色 + 走过场景"""
        captured = {}
        session = self._injected_session(monkeypatch, {1: "clue"}, context_sink=captured)
        session.generate(make_mock_harness())
        session.start_minigame(1)
        ctx = captured["ctx"]
        # mock harness 对话 speaker：角色A/角色B
        assert ctx["appeared_characters"] == ["角色A", "角色B"]
        assert ctx["visited_scenes"] == ["场景1"]
