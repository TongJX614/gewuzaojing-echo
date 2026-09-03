# -*- coding: utf-8 -*-
"""辩论小游戏生成器单元测试 — 校验逻辑与演出参数渲染（不依赖 LLM）"""

import copy

import pytest

from debate_generator import (
    _validate_debate,
    _render_game_data,
    extract_debate_material,
)


# ═══════════════════════════════════════════════════════
# 测试数据构造
# ═══════════════════════════════════════════════════════

CHARACTER_NAMES = ["苏然", "林晓", "杜伟明"]

VALID_DATA = {
    "title": "重生之辩",
    "victoryText": "你捍卫了生命的价值！",
    "playerStance": "主角立场",
    "truthBullets": [
        {"id": "bond", "name": "情感纽带", "short": "纽带", "desc": "友谊真实存在"},
        {"id": "worth", "name": "生命价值", "short": "价值", "desc": "每个生命都有价值"},
        {"id": "plan", "name": "拯救计划", "short": "计划", "desc": "存在替代方案"},
        {"id": "logic", "name": "逻辑漏洞", "short": "逻辑", "desc": "对方推理有漏洞"},
    ],
    "phases": [
        {
            "speaker": "杜伟明",
            "stance": "opponent",
            "lines": [
                {"text": "农场不养闲畜生。", "weakPoint": None},
                {"text": "这头猪养得够肥了。", "weakPoint": None},
                {"text": "下周就送它去屠宰场！", "weakPoint": {"type": "refute", "targetBullet": "bond"}},
            ],
        },
        {
            "speaker": "林晓",
            "stance": "ally",
            "lines": [
                {"text": "你们不能这样做！", "weakPoint": None},
                {"text": "它救过我们的命！", "weakPoint": None},
                {"text": "它早就是大家的朋友了。", "weakPoint": {"type": "agree", "targetBullet": "worth"}},
            ],
        },
    ],
}

VALID_MATERIAL = {
    "title": "猪圈里的重生者",
    "core_conflict": "如何化解生存危机",
    "themes": ["生命的价值"],
    "summary": "程序员重生为猪",
    "worldbook": "",
    "characters": [{"name": n, "stance": "ally", "desc": "x"} for n in CHARACTER_NAMES],
    "character_names": CHARACTER_NAMES,
}


class _FakeAdapter:
    """模拟 GenericScriptAdapter 的最小结构"""

    def __init__(self, raw_data=None, characters=None, title="测试剧本", worldbook=""):
        self.raw_data = raw_data or {}
        self.characters = characters or []
        self.title = title
        self.worldbook = worldbook


# ═══════════════════════════════════════════════════════
# 校验逻辑
# ═══════════════════════════════════════════════════════

def test_validate_passes_valid_data():
    assert _validate_debate(copy.deepcopy(VALID_DATA), CHARACTER_NAMES) == []


def test_validate_rejects_too_few_bullets():
    data = copy.deepcopy(VALID_DATA)
    data["truthBullets"] = data["truthBullets"][:2]
    errors = _validate_debate(data, CHARACTER_NAMES)
    assert any("4~6" in e for e in errors)


def test_validate_rejects_duplicate_bullet_id():
    data = copy.deepcopy(VALID_DATA)
    data["truthBullets"][1]["id"] = "bond"
    errors = _validate_debate(data, CHARACTER_NAMES)
    assert any("重复" in e for e in errors)


def test_validate_rejects_unknown_speaker():
    data = copy.deepcopy(VALID_DATA)
    data["phases"][0]["speaker"] = "不存在的角色"
    errors = _validate_debate(data, CHARACTER_NAMES)
    assert any("候选角色名单" in e for e in errors)


def test_validate_rejects_undefined_target_bullet():
    data = copy.deepcopy(VALID_DATA)
    data["phases"][0]["lines"][2]["weakPoint"]["targetBullet"] = "not_exist"
    errors = _validate_debate(data, CHARACTER_NAMES)
    assert any("targetBullet" in e for e in errors)


def test_validate_rejects_duplicate_target_across_phases():
    data = copy.deepcopy(VALID_DATA)
    data["phases"][1]["lines"][2]["weakPoint"]["targetBullet"] = "bond"
    errors = _validate_debate(data, CHARACTER_NAMES)
    assert any("重复" in e for e in errors)


def test_validate_rejects_wrong_weak_point_count():
    data = copy.deepcopy(VALID_DATA)
    data["phases"][0]["lines"][0]["weakPoint"] = {"type": "refute", "targetBullet": "plan"}
    errors = _validate_debate(data, CHARACTER_NAMES)
    assert any("有且只有 1 句破绽" in e for e in errors)


def test_validate_rejects_overlong_line():
    data = copy.deepcopy(VALID_DATA)
    data["phases"][0]["lines"][0]["text"] = "这是一句超过三十个字的台词，用来测试长度校验逻辑是否生效，必须足够长。"
    errors = _validate_debate(data, CHARACTER_NAMES)
    assert any("超过 30 字" in e for e in errors)


# ═══════════════════════════════════════════════════════
# 演出参数渲染
# ═══════════════════════════════════════════════════════

def test_render_converts_weak_point_to_span():
    game_data = _render_game_data(copy.deepcopy(VALID_DATA), VALID_MATERIAL)
    weak_line = game_data["phases"][0][2]
    assert "<span class='weak-point refute' data-target='bond'>" in weak_line["text"]
    assert "下周就送它去屠宰场！" in weak_line["text"]


def test_render_fills_timing_params():
    game_data = _render_game_data(copy.deepcopy(VALID_DATA), VALID_MATERIAL)
    for phase in game_data["phases"]:
        for i, line in enumerate(phase):
            assert line["delay"] == 1000 + i * 3600
            assert 7800 <= line["duration"] <= 12500
            assert 0 < line["yPos"] < 100
            assert -5 <= line["angle"] <= 5
            assert line["speaker"]
            assert line["color"].startswith("#")


def test_render_preserves_frontend_shape():
    """phases 必须是二维数组（与原前端 debatePhases 结构一致）"""
    game_data = _render_game_data(copy.deepcopy(VALID_DATA), VALID_MATERIAL)
    assert isinstance(game_data["phases"], list)
    assert all(isinstance(p, list) for p in game_data["phases"])
    assert len(game_data["truthBullets"]) == 4
    assert game_data["victoryText"] == "你捍卫了生命的价值！"


def test_render_escapes_html_in_text():
    data = copy.deepcopy(VALID_DATA)
    data["phases"][0]["lines"][1]["text"] = "别<tag>乱来"
    game_data = _render_game_data(data, VALID_MATERIAL)
    assert "<tag>" not in game_data["phases"][0][1]["text"]
    assert "&lt;tag&gt;" in game_data["phases"][0][1]["text"]


# ═══════════════════════════════════════════════════════
# 素材提取
# ═══════════════════════════════════════════════════════

def test_extract_material_from_main_plot():
    adapter = _FakeAdapter(
        raw_data={"main_plot": {
            "summary": "主角重生为猪",
            "themes": ["接纳自我", "友谊"],
            "core_conflict": "化解生存危机",
        }},
        characters=[
            {"name": "苏然", "role": "主角", "personality": "乐观", "motivation": "活下去"},
            {"name": "杜伟明", "role": "反派", "personality": "冷酷"},
        ],
    )
    material = extract_debate_material(adapter)
    assert material["core_conflict"] == "化解生存危机"
    assert material["themes"] == ["接纳自我", "友谊"]
    assert material["characters"][0]["stance"] == "ally"
    assert material["characters"][1]["stance"] == "opponent"
    assert material["character_names"] == ["苏然", "杜伟明"]


def test_extract_material_raises_without_theme():
    adapter = _FakeAdapter(raw_data={}, characters=[{"name": "苏然"}])
    with pytest.raises(ValueError, match="主题描述"):
        extract_debate_material(adapter)


def test_extract_material_raises_without_characters():
    adapter = _FakeAdapter(raw_data={"main_plot": {"core_conflict": "冲突"}})
    with pytest.raises(ValueError, match="角色"):
        extract_debate_material(adapter)
