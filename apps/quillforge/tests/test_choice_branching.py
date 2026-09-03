# -*- coding: utf-8 -*-
"""专项测试：验证"玩家选择不同选项后，后续剧情是否真的发生相应变化"

测试目标（统一游玩管线 GameSession + Harness）：
  1. 确认 trigger_conditions 在 Harness 管线中是否生效（分支跳转）
  2. 确认 player_choice 在 Harness 五阶段流水线中的传递路径
  3. 确认 choice_made 条件按选项 ID 匹配（回响-DEMO 格式兼容）
  4. 确认世界线分支检测与上下文注入、下一场景回退逻辑
"""

import copy
import json
import threading
from unittest.mock import patch, MagicMock, call

import pytest
from session_manager import GameSession, SessionState, PlayerState


# ═══════════════════════════════════════════════════════
# 辅助工具
# ═══════════════════════════════════════════════════════

def _make_mock_adapter_with_triggers():
    """构建带有 trigger_conditions 的 mock adapter（Harness 管线）。"""
    adapter = MagicMock()
    adapter.scenes = [
        {"id": "scene_01", "name": "开场", "location": "城市",
         "trigger_conditions": {"type": "game_start"}},
        {"id": "scene_02", "name": "普通发展", "location": "街道",
         "trigger_conditions": {}},
        {"id": "scene_03", "name": "调查分支", "location": "图书馆",
         "trigger_conditions": {"type": "choice_made", "value": "在scene_01选择调查线索"}},
        {"id": "scene_04", "name": "逃跑分支", "location": "车站",
         "trigger_conditions": {"type": "choice_made", "value": "在scene_01选择逃跑"}},
        {"id": "scene_05", "name": "结局", "location": "终点"},
    ]
    adapter.worldline_nodes = ["开端", "发展", "高潮", "结局"]
    adapter.raw_data = {"endings": []}
    adapter.build_harness_input.return_value = {
        "currentScene": "测试场景",
        "characters": [{"name": "角色A", "role": "主角", "personality": "冷静"}],
        "worldline": "开端 → 发展 → 高潮 → 结局",
        "playerChoice": "",
    }
    adapter.get_scene_choices.return_value = [
        {"id": "c1", "text": "调查线索", "description": "", "consequences": {}},
        {"id": "c2", "text": "逃跑", "description": "", "consequences": {}},
    ]
    return adapter


def _make_mock_harness():
    """构建 mock Harness"""
    harness = MagicMock()
    harness.run.return_value = {
        "success": True,
        "data": {
            "narration": "测试旁白",
            "dialogues": [
                {"speaker": "角色A", "text": "你好", "emotion": "平静"},
                {"speaker": "角色A", "text": "我们出发吧", "emotion": "坚定"},
                {"speaker": "角色A", "text": "好的", "emotion": "平静"},
            ],
            "nextChoices": [
                {"text": "选项1", "effect": "推进", "worldlineImpact": "advance"},
            ],
            "worldlineState": {"currentNode": "开端", "nodeIndex": 0, "totalNodes": 4, "progress": 0.0},
        },
        "validation": {"passed": True, "checks": [], "retryCount": 0},
        "metadata": {"generationTime": 500, "model": "test"},
    }
    return harness


# ═══════════════════════════════════════════════════════
# 测试 5: Harness 管线 trigger_conditions 分支验证
# ═══════════════════════════════════════════════════════

class TestHarnessTriggerConditions:
    """验证 Harness 管线中 trigger_conditions 是否导致不同分支"""

    def test_choice_made_trigger_routes_to_different_scene(self):
        """不同选择应通过 trigger_conditions 路由到不同场景"""
        adapter = _make_mock_adapter_with_triggers()
        harness = _make_mock_harness()

        # 会话 1：选择"调查线索"
        session1 = GameSession(adapter)
        session1.generate(harness)
        session1.choose(0, "调查线索")
        next_idx_1 = session1.current_scene_index

        # 会话 2：选择"逃跑"
        adapter2 = _make_mock_adapter_with_triggers()
        session2 = GameSession(adapter2)
        session2.generate(harness)
        session2.choose(1, "逃跑")
        next_idx_2 = session2.current_scene_index

        # 验证不同选择导致不同的场景跳转
        # "调查线索" 应匹配 scene_03 (index=2) 的 trigger_conditions
        assert next_idx_1 == 2, \
            f"选择'调查线索'应跳转到 scene_03 (index=2)，实际跳到 index={next_idx_1}"
        # "逃跑" 应匹配 scene_04 (index=3) 的 trigger_conditions
        assert next_idx_2 == 3, \
            f"选择'逃跑'应跳转到 scene_04 (index=3)，实际跳到 index={next_idx_2}"

        # 两个会话的下一场景应该不同
        assert next_idx_1 != next_idx_2, \
            "不同选择应导致不同的场景跳转"

    def test_no_trigger_conditions_falls_back_to_linear(self):
        """无 trigger_conditions 匹配时回退到线性递增"""
        adapter = MagicMock()
        adapter.scenes = [
            {"id": "scene_01", "name": "场景1"},
            {"id": "scene_02", "name": "场景2"},
            {"id": "scene_03", "name": "场景3"},
        ]
        adapter.worldline_nodes = ["A", "B", "C"]
        adapter.raw_data = {}
        adapter.build_harness_input.return_value = {
            "currentScene": "测试", "characters": [], "worldline": "A → B → C",
            "playerChoice": "",
        }
        adapter.get_scene_choices.return_value = []

        session = GameSession(adapter)
        harness = _make_mock_harness()
        session.generate(harness)
        session.choose(0, "任意选择")

        # 无 trigger_conditions → 线性递增到 index=1
        assert session.current_scene_index == 1

    def test_trigger_conditions_choice_text_matching(self):
        """trigger_conditions 的 choice_made 条件应正确匹配选项文本"""
        adapter = _make_mock_adapter_with_triggers()
        session = GameSession(adapter)

        # 模拟历史：在 scene_01 选择了 "调查线索"
        session.history = [{
            "scene_id": "scene_01",
            "player_choice": "调查线索",
            "scene_index": 0,
        }]
        session.current_scene_index = 0

        next_idx = session._resolve_next_scene_index()
        # 应匹配 scene_03 (index=2): "在scene_01选择调查线索"
        assert next_idx == 2, \
            f"应匹配 scene_03 (index=2)，实际为 {next_idx}"


# ═══════════════════════════════════════════════════════
# 测试 6: Harness 管线 player_choice 传递路径
# ═══════════════════════════════════════════════════════

class TestHarnessPlayerChoicePipeline:
    """验证 Harness 管线中 player_choice 的完整传递路径"""

    def test_player_choice_passed_to_build_harness_input(self):
        """choose 后 generate 应将 player_choice 传入 build_harness_input"""
        adapter = MagicMock()
        adapter.scenes = [
            {"id": "scene_01", "name": "场景1"},
            {"id": "scene_02", "name": "场景2"},
            {"id": "scene_03", "name": "场景3"},
        ]
        adapter.worldline_nodes = ["A", "B", "C"]
        adapter.raw_data = {}
        adapter.build_harness_input.return_value = {
            "currentScene": "测试", "characters": [], "worldline": "A → B → C",
            "playerChoice": "",
        }
        adapter.get_scene_choices.return_value = [
            {"id": "c1", "text": "深入调查", "description": "", "consequences": {}},
        ]

        session = GameSession(adapter)
        harness = _make_mock_harness()

        # 第一次生成
        session.generate(harness)
        # 做出选择
        session.choose(0, "深入调查")

        # 第二次生成
        session.generate(harness)

        # 验证 build_harness_input 被调用时传入了 player_choice
        calls = adapter.build_harness_input.call_args_list
        assert len(calls) >= 2
        # 第二次调用应包含 player_choice="深入调查"
        second_call_kwargs = calls[1][1] if len(calls[1]) > 1 else {}
        second_call_args = calls[1]
        # 检查 player_choice 参数
        if "player_choice" in second_call_kwargs:
            assert second_call_kwargs["player_choice"] == "深入调查"
        else:
            # 可能是位置参数
            assert "深入调查" in str(second_call_args), \
                f"第二次 generate 应传入 player_choice='深入调查'，实际调用: {second_call_args}"

    def test_player_state_accumulates_across_choices(self):
        """玩家状态应随选择累积，并传入后续生成"""
        adapter = MagicMock()
        adapter.scenes = [
            {"id": "scene_01", "name": "场景1"},
            {"id": "scene_02", "name": "场景2"},
            {"id": "scene_03", "name": "场景3"},
            {"id": "scene_04", "name": "场景4"},
        ]
        adapter.worldline_nodes = ["A", "B", "C", "D"]
        adapter.raw_data = {}
        adapter.build_harness_input.return_value = {
            "currentScene": "测试", "characters": [], "worldline": "A → B → C → D",
            "playerChoice": "",
        }
        adapter.get_scene_choices.return_value = [
            {"id": "c1", "text": "勇敢前进", "description": "",
             "consequences": {"stats_changes": {"courage": 3}},
             "personality_impact": "展现果断一面"},
        ]

        session = GameSession(adapter)
        harness = _make_mock_harness()

        # 第一轮
        session.generate(harness)
        session.choose(0, "勇敢前进")

        # 验证 player_state 已更新
        assert session.player_state.stats["courage"] == 3
        assert "展现果断一面" in session.player_state.personality_traits

        # 第二轮
        session.generate(harness)

        # 验证 player_state 被传入 build_harness_input
        calls = adapter.build_harness_input.call_args_list
        second_call = calls[1]
        # player_state 参数应包含累积的状态信息
        if len(second_call) > 1 and "player_state" in second_call[1]:
            ps_arg = second_call[1]["player_state"]
            assert ps_arg is not None
            assert "courage" in ps_arg



# ═══════════════════════════════════════════════════════
# 测试 8: 现有测试覆盖缺口验证
# ═══════════════════════════════════════════════════════

class TestChoiceMadeBugReproduction:
    """复现核心 BUG：choice_made trigger_conditions 格式不兼容导致分支永远不生效

    真实脚本（回响-DEMO）中 scene_03 的 trigger_conditions:
      - type: "scene_completed"
        value: "scene_02"
      - type: "choice_made"
        value: "continue"       ← 简单值格式（选项ID）

    但 _check_condition 的正则只支持 "在scene_XX选择YY" 格式，
    导致简单值 "continue" 永远无法匹配 → 分支跳转永远失败 → 线性递增。
    """

    def _make_adapter_like_huixiang(self):
        """构建与回响-DEMO 结构一致的 mock adapter"""
        adapter = MagicMock()
        adapter.scenes = [
            {"id": "scene_01", "name": "信号", "location": "记忆工坊",
             "trigger_conditions": [{"type": "game_start", "value": "初始场景"}]},
            {"id": "scene_02", "name": "碎片", "location": "记忆空间",
             "trigger_conditions": [{"type": "scene_completed", "value": "scene_01"}]},
            {"id": "scene_03", "name": "对峙", "location": "织星科技总部",
             "trigger_conditions": [
                 {"type": "scene_completed", "value": "scene_02"},
                 {"type": "choice_made", "value": "continue"},  # ← 选项ID格式
             ]},
            {"id": "scene_04", "name": "回响", "location": "结局",
             "trigger_conditions": [{"type": "scene_completed", "value": "scene_03"}]},
        ]
        adapter.worldline_nodes = ["开端", "发展", "高潮", "结局"]
        adapter.raw_data = {"endings": []}
        adapter.build_harness_input.return_value = {
            "currentScene": "测试", "characters": [], "worldline": "",
            "playerChoice": "",
        }
        # 模拟 get_scene_choices 返回与关键选择.yaml 一致的选项
        adapter.get_scene_choices.return_value = [
            {"id": "continue", "text": "继续深入", "description": "不管多不安",
             "consequences": {"stats_changes": {"courage": 3}}},
            {"id": "stop", "text": "停止修复", "description": "太危险了",
             "consequences": {"stats_changes": {"self_preservation": 2}}},
        ]
        return adapter

    def test_bug_choice_made_simple_value_never_matches(self):
        """复现 BUG：choice_made value='continue' 永远无法匹配

        场景：玩家在 scene_02 选择了 "继续深入"(id=continue)，
        scene_03 的 trigger_conditions 要求 choice_made value="continue"，
        但 _check_condition 的正则无法解析这个简单值 → 返回 False → 线性递增。
        """
        adapter = self._make_adapter_like_huixiang()
        session = GameSession(adapter)
        harness = _make_mock_harness()

        # 模拟玩家已经完成了 scene_01 和 scene_02
        session.current_scene_index = 1  # 当前在 scene_02
        session.history = [
            {"scene_id": "scene_01", "player_choice": "立即解密附件",
             "option_id": "decrypt", "scene_index": 0},
            {"scene_id": "scene_02", "player_choice": "继续深入",
             "option_id": "continue", "scene_index": 1},
        ]

        # 调用 _resolve_next_scene_index
        next_idx = session._resolve_next_scene_index()

        # 期望：应跳转到 scene_03 (index=2)，因为：
        #   - scene_completed "scene_02" ✓ (history 中有 scene_02)
        #   - choice_made "continue" ✓ (玩家在 scene_02 选了 id=continue)
        # 实际 BUG：返回 default_next = 2（碰巧也是 2，因为线性递增）
        # 但如果 scene_03 后面还有 scene_03b（index=3），就不会跳到那里
        assert next_idx == 2, f"应进入 scene_03 (index=2)，实际 {next_idx}"

    def test_bug_choice_made_should_distinguish_different_choices(self):
        """核心测试：不同选择应导致不同的场景跳转

        场景 A：玩家选择 "继续深入"(id=continue) → 应匹配 scene_03
        场景 B：玩家选择 "停止修复"(id=stop) → 不应匹配 scene_03，应跳到其他场景
        """
        # ── 场景 A：选择了 continue ──
        adapter_a = self._make_adapter_like_huixiang()
        # 添加一个 "停止" 分支场景
        adapter_a.scenes.insert(3, {
            "id": "scene_03b", "name": "逃避",
            "location": "安全屋",
            "trigger_conditions": [
                {"type": "scene_completed", "value": "scene_02"},
                {"type": "choice_made", "value": "stop"},
            ],
        })
        session_a = GameSession(adapter_a)
        session_a.current_scene_index = 1
        session_a.history = [
            {"scene_id": "scene_01", "player_choice": "立即解密附件",
             "option_id": "decrypt", "scene_index": 0},
            {"scene_id": "scene_02", "player_choice": "继续深入",
             "option_id": "continue", "scene_index": 1},
        ]
        next_a = session_a._resolve_next_scene_index()

        # ── 场景 B：选择了 stop ──
        adapter_b = self._make_adapter_like_huixiang()
        adapter_b.scenes.insert(3, {
            "id": "scene_03b", "name": "逃避",
            "location": "安全屋",
            "trigger_conditions": [
                {"type": "scene_completed", "value": "scene_02"},
                {"type": "choice_made", "value": "stop"},
            ],
        })
        session_b = GameSession(adapter_b)
        session_b.current_scene_index = 1
        session_b.history = [
            {"scene_id": "scene_01", "player_choice": "立即解密附件",
             "option_id": "decrypt", "scene_index": 0},
            {"scene_id": "scene_02", "player_choice": "停止修复",
             "option_id": "stop", "scene_index": 1},
        ]
        next_b = session_b._resolve_next_scene_index()

        # 关键断言：不同选择应导致不同跳转
        # 选择 continue → scene_03 (index=2)
        # 选择 stop → scene_03b (index=3)
        assert next_a != next_b, (
            f"不同选择应导致不同跳转！"
            f"选择'继续深入'(continue) → index={next_a}，"
            f"选择'停止修复'(stop) → index={next_b}。"
            f"如果相同，说明 choice_made 条件未生效。"
        )

    def test_bug_choice_made_full_format_with_option_id(self):
        """复现 BUG：即使使用完整格式 "在scene_02选择continue"，
        由于 history 存储的是选项文本而非 ID，匹配仍然失败。
        """
        adapter = MagicMock()
        adapter.scenes = [
            {"id": "scene_01", "name": "场景1"},
            {"id": "scene_02", "name": "场景2"},
            {"id": "scene_03", "name": "分支场景",
             "trigger_conditions": [
                 {"type": "choice_made", "value": "在scene_01选择investigate"},
             ]},
        ]
        adapter.worldline_nodes = ["A", "B", "C"]
        adapter.raw_data = {}

        session = GameSession(adapter)
        session.current_scene_index = 0
        # 玩家选择了 "先调查发件人"(id=investigate)
        session.history = [
            {"scene_id": "scene_01", "player_choice": "先调查发件人",
             "option_id": "investigate", "scene_index": 0},
        ]

        next_idx = session._resolve_next_scene_index()

        # 期望：匹配 scene_03 (index=2)
        # 实际 BUG："investigate" not in "先调查发件人" → False → 线性递增到 1
        assert next_idx == 2, (
            f"应匹配 scene_03 (index=2)，实际 {next_idx}。"
            f"原因：history 存储选项文本'先调查发件人'，"
            f"但条件要求匹配选项ID 'investigate'。"
        )



# ═══════════════════════════════════════════════════════
# 9. 世界线分支检测与上下文注入
# ═══════════════════════════════════════════════════════

class TestActiveBranchDetection:
    """验证 _detect_active_branch 能正确检测玩家所在分支并注入上下文"""

    def _make_adapter_with_worldlines(self):
        """构建含有世界线分支数据的 adapter"""
        from generic_adapter import GenericScriptAdapter
        adapter = GenericScriptAdapter()
        adapter.scenes = [
            {"id": "scene_01", "name": "信号", "location": "记忆工坊"},
            {"id": "scene_02", "name": "碎片", "location": "记忆空间"},
            {"id": "scene_03", "name": "对峝", "location": "织星科技"},
        ]
        adapter.raw_data = {
            "world_lines": [
                {
                    "id": "main_line",
                    "name": "主线",
                    "description": "基础路线",
                    "path": [
                        {"scene_id": "scene_01", "sequence": 1, "description": "开始"},
                        {"scene_id": "scene_02", "sequence": 2, "description": "发现"},
                    ],
                },
                {
                    "id": "branch_line_a",
                    "name": "真相线",
                    "description": "苏然选择深入真相",
                    "conditions": [{"type": "choice_made", "value": "在scene_02选择continue"}],
                    "path": [
                        {"scene_id": "scene_02", "sequence": 2, "description": "苏然选择继续深入修复"},
                        {"scene_id": "scene_03", "sequence": 3, "description": "苏然携带完整证据对峝"},
                    ],
                    "consequences": "苏然获得完整真相",
                },
                {
                    "id": "branch_line_b",
                    "name": "安全线",
                    "description": "苏然选择停止修复，保护自己",
                    "conditions": [{"type": "choice_made", "value": "在scene_02选择stop"}],
                    "path": [
                        {"scene_id": "scene_02", "sequence": 2, "description": "苏然选择停止修复"},
                        {"scene_id": "scene_03", "sequence": 3, "description": "苏然在不完全了解真相的情况下对峝"},
                    ],
                    "consequences": "苏然放弃了了解真相的机会",
                },
            ],
        }
        return adapter

    def test_detect_branch_stop(self):
        """选择 stop 后应检测到安全线分支"""
        adapter = self._make_adapter_with_worldlines()
        history = [
            {"scene_id": "scene_02", "player_choice": "停止修复", "option_id": "stop"},
        ]
        result = adapter._detect_active_branch(history)
        assert "安全线" in result
        assert "不完全了解真相" in result

    def test_detect_branch_continue(self):
        """选择 continue 后应检测到真相线分支"""
        adapter = self._make_adapter_with_worldlines()
        history = [
            {"scene_id": "scene_02", "player_choice": "继续深入", "option_id": "continue"},
        ]
        result = adapter._detect_active_branch(history)
        assert "真相线" in result
        assert "完整真相" in result or "完整证据" in result

    def test_no_branch_without_history(self):
        """无选择历史时不返回分支"""
        adapter = self._make_adapter_with_worldlines()
        assert adapter._detect_active_branch(None) == ""
        assert adapter._detect_active_branch([]) == ""

    def test_branch_context_injected_in_harness_input(self):
        """确认 build_harness_input 中注入了 _activeBranchContext"""
        adapter = self._make_adapter_with_worldlines()
        adapter.characters = [{"name": "苏然", "role": "主角"}]
        adapter.worldline_nodes = ["开始", "发现", "对峝", "结局"]
        history = [
            {"scene_id": "scene_02", "scene_name": "碎片",
             "player_choice": "停止修复", "option_id": "stop",
             "consequences": "你退出记忆空间"},
        ]
        result = adapter.build_harness_input(
            scene_index=2,
            player_choice="停止修复",
            choice_history=history,
        )
        assert "_activeBranchContext" in result
        assert "安全线" in result["_activeBranchContext"]
        assert "不完全了解真相" in result["_activeBranchContext"]

    def test_different_branches_produce_different_context(self):
        """确认不同选择产生不同的分支上下文"""
        adapter = self._make_adapter_with_worldlines()
        adapter.characters = [{"name": "苏然", "role": "主角"}]
        adapter.worldline_nodes = ["开始", "发现", "对峝"]

        history_stop = [{"scene_id": "scene_02", "scene_name": "碎片",
                         "player_choice": "停止修复", "option_id": "stop"}]
        history_continue = [{"scene_id": "scene_02", "scene_name": "碎片",
                             "player_choice": "继续深入", "option_id": "continue"}]

        ctx_stop = adapter.build_harness_input(2, player_choice="停止修复",
                                               choice_history=history_stop)
        ctx_cont = adapter.build_harness_input(2, player_choice="继续深入",
                                               choice_history=history_continue)

        branch_stop = ctx_stop.get("_activeBranchContext", "")
        branch_cont = ctx_cont.get("_activeBranchContext", "")

        # 两个分支上下文必须不同
        assert branch_stop != branch_cont
        assert "安全线" in branch_stop
        assert "真相线" in branch_cont


class TestResolveNextSceneFallback:
    """验证 _resolve_next_scene_index 回退逻辑不会落入条件失败的场景"""

    def test_fallback_skips_condition_failed_scene(self):
        """当 default_next 场景条件失败时，应跳过它"""
        adapter = MagicMock()
        adapter.scenes = [
            {"id": "scene_01", "name": "A"},
            {"id": "scene_02", "name": "B"},
            {"id": "scene_03", "name": "C",
             "trigger_conditions": [{"type": "choice_made", "value": "go_left"}]},
            {"id": "scene_04", "name": "D"},  # 无条件 = 可进入
        ]
        session = GameSession(adapter)
        session.current_scene_index = 1
        session.history = [
            {"scene_id": "scene_02", "player_choice": "向右走", "option_id": "go_right"},
        ]
        # scene_03 条件失败（玩家选了 go_right 不是 go_left）
        # 应该跳过 scene_03，进入 scene_04
        result = session._resolve_next_scene_index()
        assert result == 3  # scene_04 index

    def test_fallback_returns_default_when_all_fail(self):
        """所有后续场景条件都失败时，回退到 default_next 避免卡死"""
        adapter = MagicMock()
        adapter.scenes = [
            {"id": "scene_01", "name": "A"},
            {"id": "scene_02", "name": "B"},
            {"id": "scene_03", "name": "C",
             "trigger_conditions": [{"type": "choice_made", "value": "go_left"}]},
            {"id": "scene_04", "name": "D",
             "trigger_conditions": [{"type": "scene_completed", "value": "scene_03"}]},
        ]
        session = GameSession(adapter)
        session.current_scene_index = 1
        session.history = [
            {"scene_id": "scene_02", "player_choice": "向右走", "option_id": "go_right"},
        ]
        # scene_03 条件失败，scene_04 条件也失败，回退到 default_next=2
        result = session._resolve_next_scene_index()
        assert result == 2  # 回退到 default_next 避免卡死
