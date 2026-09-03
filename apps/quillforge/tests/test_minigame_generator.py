# -*- coding: utf-8 -*-
"""剧情小游戏生成器单元测试 — 校验逻辑、演出渲染与判定（不依赖真实 LLM）"""

import copy
import random

import pytest

import minigame_generator as mg
from minigame_generator import (
    _validate_minigame,
    _render_minigame,
    extract_minigame_material,
    generate_minigame,
    judge_minigame,
)


# ═══════════════════════════════════════════════════════
# 测试数据构造
# ═══════════════════════════════════════════════════════

VALID_CLUE = {
    "title": "谁动了账本",
    "question": "是谁在案发前拿走了账本？",
    "successText": "你找到了关键证据！",
    "failureText": "你错过了真正的线索。",
    "correctClueId": "clue_2",
    "clues": [
        {"id": "clue_1", "text": "门口有一串泥泞的脚印", "source": "现场"},
        {"id": "clue_2", "text": "管家当晚持有书房钥匙", "source": "口供"},
        {"id": "clue_3", "text": "窗户的插销从内侧锁上", "source": "现场"},
        {"id": "clue_4", "text": "餐桌上少了半瓶红酒", "source": "餐厅"},
    ],
}

VALID_CIPHER = {
    "title": "附件密文",
    "story": "匿名邮件的附件是一串被打乱的字符。",
    "rule": "reverse",
    "answer": "记忆匣",
    "successText": "附件解开了，真相浮出水面。",
    "failureText": "解密失败，附件自毁了。",
}
VALID_CIPHER_ACROSTIC = {
    "title": "遗信暗语",
    "story": "织女号上留下的告别信，句首藏着一句暗语。",
    "rule": "acrostic",
    "answer": "织女真相",
    "sentences": ["织机在深夜停转了。", "女孩那晚没有回来。", "真相被锁在数据里。", "相信这封信另有深意。"],
    "successText": "暗语拼出来了，信件另有深意。",
    "failureText": "没能读懂这封信。",
}
VALID_CIPHER_TAIL = {
    "title": "便签暗语",
    "story": "苏然抽屉里的便签，每句话的最后一个字藏着暗语。",
    "rule": "tail",
    "answer": "她在哪",
    "sentences": ["沉船那晚没人看见她", "杜维明坚称自己一直待在", "只剩航行日志追问着去哪"],
    "successText": "暗语拼出来了，方向明确了。",
    "failureText": "没能读懂这张便签。",
}

VALID_SEQUENCE = {
    "title": "还原那晚",
    "story": "把碎片按时间排好。",
    "hint": "先有电话，后有敲门。",
    "successText": "时间线闭合了。",
    "failureText": "顺序还是错的。",
    "items": [
        {"id": "seg_1", "text": "深夜接到一通匿名电话"},
        {"id": "seg_2", "text": "有人敲响了后门"},
        {"id": "seg_3", "text": "电闸突然跳掉"},
    ],
}

VALID_MATCH = {
    "title": "人物与动机",
    "question": "把人物与其隐藏动机连起来",
    "successText": "关系网理清了。",
    "failureText": "连线有误，关系网还是乱的。",
    "pairs": [
        {"id": "pair_1", "left": "苏然", "right": "找回被篡改的记忆"},
        {"id": "pair_2", "left": "林晓", "right": "保护苏然的安全"},
        {"id": "pair_3", "left": "杜维明", "right": "掩盖织女号真相"},
    ],
}

VALID_CLASSIFY = {
    "title": "证物分源",
    "question": "按证据来源分类",
    "successText": "来源理清了。",
    "failureText": "有证物放错了箱子。",
    "categories": [
        {"id": "cat_1", "name": "现场痕迹"},
        {"id": "cat_2", "name": "电子记录"},
    ],
    "items": [
        {"id": "item_1", "text": "甲板上的湿脚印", "categoryId": "cat_1"},
        {"id": "item_2", "text": "门禁刷卡日志", "categoryId": "cat_2"},
        {"id": "item_3", "text": "被扒断的缆绳", "categoryId": "cat_1"},
        {"id": "item_4", "text": "被删除的监控备份", "categoryId": "cat_2"},
    ],
}

VALID_UNLOCK = {
    "title": "封存终端",
    "story": "织女号的备用终端上了两道锁，密码都藏在当晚的记忆里。",
    "successText": "终端解锁，档案目录亮了起来。",
    "failureText": "锁定程序重启，只能从头再来。",
    "archive": {
        "title": "封存档案 · 织女号",
        "content": "实验记录：23:41 全船断电，备用终端自动落锁；杜维明于断电后独自返回实验室。",
    },
    "steps": [
        {
            "id": "step_1",
            "prompt": "第一层：那晚断电发生在几点？",
            "options": [{"id": "opt_a", "text": "21:00"}, {"id": "opt_b", "text": "23:41"}],
            "correctId": "opt_b",
            "hint": "断电时刻记在航行日志的同一页里。",
        },
        {
            "id": "step_2",
            "prompt": "第二层：谁最后离开了实验室？",
            "options": [{"id": "opt_c", "text": "杜维明"}, {"id": "opt_d", "text": "苏然"}],
            "correctId": "opt_c",
            "hint": "监控里最后离开实验室的背影不是苏然。",
        },
    ],
}

VALID_VOYAGE = {
    "title": "夜航打捞",
    "story": "织女号沉没前抛出的记忆浮标还漂在港外，趁夜把它们捞回来。",
    "targets": [
        {"id": "t_1", "label": "记忆碎片"},
        {"id": "t_2", "label": "航行日志"},
    ],
    "successText": "浮标捞齐了，数据开始回放。",
    "failureText": "浪太大，只捞到一点残片。",
}

VALID_MATERIAL = {
    "title": "回响",
    "core_conflict": "记忆篡改的真相",
    "themes": ["记忆", "真相"],
    "summary": "记忆修复师发现被篡改的记忆。",
    "character_names": ["苏然", "林晓"],
    "scenes": [{"name": "工作室", "desc": "苏然的记忆修复工作室"}],
}


class _FakeAdapter:
    """模拟 GenericScriptAdapter 的最小结构"""

    def __init__(self, raw_data=None, characters=None, title="测试剧本", scenes=None):
        self.raw_data = raw_data or {}
        self.characters = characters or []
        self.title = title
        self.scenes = scenes or []


class _FakeClient:
    """模拟 LLMClient.generate_json 的返回序列"""

    def __init__(self, outputs: list):
        self.outputs = list(outputs)
        self.calls = 0

    def generate_json(self, system, user, expect_type=dict, retries=1):
        self.calls += 1
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return out


@pytest.fixture(autouse=True)
def _clear_pending():
    """每个测试前后清空待判定暂存，避免相互污染"""
    mg._PENDING_GAMES.clear()
    yield
    mg._PENDING_GAMES.clear()


# ═══════════════════════════════════════════════════════
# 素材提取
# ═══════════════════════════════════════════════════════

def test_extract_material_ok():
    adapter = _FakeAdapter(
        raw_data={"main_plot": {"core_conflict": "冲突", "themes": ["记忆"], "summary": "梗概"}},
        characters=[{"name": "苏然"}, {"name": "林晓", "id": "lin_xiao"}],
        title="回响",
        scenes=[{"name": "工作室", "description": "修复工作室" * 20}],
    )
    m = extract_minigame_material(adapter)
    assert m["title"] == "回响"
    assert m["character_names"] == ["苏然", "林晓"]
    assert m["scenes"][0]["name"] == "工作室"
    assert len(m["scenes"][0]["desc"]) <= 60


def test_extract_material_missing_raises():
    adapter = _FakeAdapter(raw_data={"main_plot": {}})
    with pytest.raises(ValueError, match="缺少主题描述"):
        extract_minigame_material(adapter)


# ═══════════════════════════════════════════════════════
# 校验逻辑
# ═══════════════════════════════════════════════════════

def test_validate_clue_passes():
    assert _validate_minigame("clue", copy.deepcopy(VALID_CLUE)) == []


def test_validate_clue_wrong_correct_id():
    data = copy.deepcopy(VALID_CLUE)
    data["correctClueId"] = "clue_99"
    errors = _validate_minigame("clue", data)
    assert any("correctClueId" in e for e in errors)


def test_validate_clue_too_few_clues():
    data = copy.deepcopy(VALID_CLUE)
    data["clues"] = data["clues"][:2]
    errors = _validate_minigame("clue", data)
    assert any("4~6" in e for e in errors)


def test_validate_cipher_passes_and_rejects_empty():
    assert _validate_minigame("cipher", copy.deepcopy(VALID_CIPHER)) == []
    data = copy.deepcopy(VALID_CIPHER)
    data["answer"] = ""
    assert any("answer" in e for e in _validate_minigame("cipher", data))


def test_validate_cipher_rejects_bad_rule():
    data = copy.deepcopy(VALID_CIPHER)
    data["rule"] = "ascii"
    assert any("rule" in e for e in _validate_minigame("cipher", data))


def test_validate_cipher_rejects_short_or_long_answer():
    data = copy.deepcopy(VALID_CIPHER)
    data["answer"] = "记忆"  # 2 字，低于新难度下限
    assert any("过短" in e for e in _validate_minigame("cipher", data))
    data2 = copy.deepcopy(VALID_CIPHER)
    data2["answer"] = "记忆匣里藏着的东西太多了"
    assert any("过长" in e for e in _validate_minigame("cipher", data2))


def test_validate_cipher_acrostic_checks_heads():
    assert _validate_minigame("cipher", copy.deepcopy(VALID_CIPHER_ACROSTIC)) == []
    data = copy.deepcopy(VALID_CIPHER_ACROSTIC)
    data["sentences"][2] = "信号下落不明。"  # 首字不再是「的」
    assert any("首字" in e for e in _validate_minigame("cipher", data))
    data2 = copy.deepcopy(VALID_CIPHER_ACROSTIC)
    data2["sentences"] = data2["sentences"][:3]  # 句数不足
    assert any("数量" in e for e in _validate_minigame("cipher", data2))


def test_validate_cipher_tail_checks_tails():
    assert _validate_minigame("cipher", copy.deepcopy(VALID_CIPHER_TAIL)) == []
    data = copy.deepcopy(VALID_CIPHER_TAIL)
    data["sentences"][1] = "杜维明坚持自己早有不在场证明。"  # 末字不再是「在」
    assert any("末字" in e for e in _validate_minigame("cipher", data))


def test_validate_sequence_passes_and_rejects_duplicate_id():
    assert _validate_minigame("sequence", copy.deepcopy(VALID_SEQUENCE)) == []
    data = copy.deepcopy(VALID_SEQUENCE)
    data["items"][1]["id"] = "seg_1"
    assert any("重复" in e for e in _validate_minigame("sequence", data))


def test_validate_sequence_rejects_too_few_items():
    data = copy.deepcopy(VALID_SEQUENCE)
    data["items"] = data["items"][:2]
    errors = _validate_minigame("sequence", data)
    assert any("3~6" in e for e in errors)


def test_validate_dossier_alias_maps_to_sequence():
    # dossier 已并入 sequence：别名归一化后按时间线排序校验
    from minigame_generator import normalize_kind
    assert normalize_kind("dossier") == "sequence"
    assert normalize_kind("puzzle") == "cipher"


def test_validate_unknown_kind():
    errors = _validate_minigame("poker", {})
    assert errors and "未知玩法" in errors[0]


def test_validate_match_passes_and_rejects_dup_right():
    assert _validate_minigame("match", copy.deepcopy(VALID_MATCH)) == []
    data = copy.deepcopy(VALID_MATCH)
    data["pairs"][2]["right"] = data["pairs"][0]["right"]
    assert any("right 重复" in e for e in _validate_minigame("match", data))
    data2 = copy.deepcopy(VALID_MATCH)
    data2["pairs"] = data2["pairs"][:2]
    assert any("3~5" in e for e in _validate_minigame("match", data2))


def test_validate_classify_checks_category_refs():
    assert _validate_minigame("classify", copy.deepcopy(VALID_CLASSIFY)) == []
    data = copy.deepcopy(VALID_CLASSIFY)
    data["items"][0]["categoryId"] = "cat_99"
    assert any("categoryId" in e for e in _validate_minigame("classify", data))
    # 某类别没有任何条目
    data2 = copy.deepcopy(VALID_CLASSIFY)
    for it in data2["items"]:
        it["categoryId"] = "cat_1"
    assert any("没有分配到任何条目" in e for e in _validate_minigame("classify", data2))


def test_validate_unlock_checks_correct_id():
    assert _validate_minigame("unlock", copy.deepcopy(VALID_UNLOCK)) == []
    data = copy.deepcopy(VALID_UNLOCK)
    data["steps"][1]["correctId"] = "opt_z"
    assert any("correctId" in e for e in _validate_minigame("unlock", data))
    data2 = copy.deepcopy(VALID_UNLOCK)
    data2["steps"] = data2["steps"][:1]
    assert any("2~4" in e for e in _validate_minigame("unlock", data2))


def test_validate_unlock_requires_hints_and_archive():
    data = copy.deepcopy(VALID_UNLOCK)
    data["steps"][0]["hint"] = ""
    assert any("hint" in e for e in _validate_minigame("unlock", data))
    data2 = copy.deepcopy(VALID_UNLOCK)
    data2.pop("archive")
    assert any("archive" in e for e in _validate_minigame("unlock", data2))
    data3 = copy.deepcopy(VALID_UNLOCK)
    data3["archive"]["content"] = ""
    assert any("archive.content" in e for e in _validate_minigame("unlock", data3))


def test_validate_voyage_rejects_bad_targets():
    assert _validate_minigame("voyage", copy.deepcopy(VALID_VOYAGE)) == []
    data = copy.deepcopy(VALID_VOYAGE)
    data["targets"][1]["label"] = data["targets"][0]["label"]
    assert any("label 重复" in e for e in _validate_minigame("voyage", data))
    data2 = copy.deepcopy(VALID_VOYAGE)
    data2["targets"] = data2["targets"][:1]
    assert any("2~4" in e for e in _validate_minigame("voyage", data2))


# ═══════════════════════════════════════════════════════
# 渲染：答案不下发前端 + 演出参数填充
# ═══════════════════════════════════════════════════════

def _dump(obj) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False)


def test_render_clue_hides_answer_and_colors():
    game_data, answer_key = _render_minigame("clue", copy.deepcopy(VALID_CLUE), VALID_MATERIAL)
    assert game_data["type"] == "clue"
    assert len(game_data["clues"]) == 4
    for c in game_data["clues"]:
        assert c["color"] and c["index"] >= 1
    # 前端数据不得泄露正确答案
    dumped = _dump(game_data)
    assert "correctClueId" not in dumped
    assert answer_key["answer"] == "clue_2"
    assert "管家当晚持有书房钥匙" in answer_key["correctDisplay"]
    # 分玩法提示：先来源后首字，而非统一的「答案首字」
    assert "来源" in answer_key["hintSteps"][0]
    assert "开头" in answer_key["hintSteps"][1]


def test_render_cipher_shows_length_not_answer():
    game_data, answer_key = _render_minigame("cipher", copy.deepcopy(VALID_CIPHER), VALID_MATERIAL)
    assert game_data["mode"] == "cipher"
    # 密文由后端按倒序模板生成，与答案必然自洽
    assert game_data["cipherText"] == "匣忆记"
    assert game_data["answerLength"] == len("记忆匣")
    assert "记忆匣" not in _dump(game_data)
    assert answer_key["answer"] == "记忆匣"


def test_render_cipher_acrostic_builds_cipher_from_sentences():
    game_data, answer_key = _render_minigame("cipher", copy.deepcopy(VALID_CIPHER_ACROSTIC), VALID_MATERIAL)
    assert game_data["cipherText"] == "织机在深夜停转了。；女孩那晚没有回来。；真相被锁在数据里。；相信这封信另有深意。"
    assert "第一个字" in game_data["hint"]
    assert game_data["answerLength"] == 4
    assert answer_key["answer"] == "织女真相"


def test_render_cipher_tail_builds_cipher_from_sentences():
    game_data, answer_key = _render_minigame("cipher", copy.deepcopy(VALID_CIPHER_TAIL), VALID_MATERIAL)
    assert game_data["cipherText"] == "沉船那晚没人看见她；杜维明坚称自己一直待在；只剩航行日志追问着去哪"
    assert "最后一个字" in game_data["hint"]
    assert game_data["answerLength"] == 3
    assert answer_key["answer"] == "她在哪"


def test_render_sequence_shuffles_and_keeps_order():
    game_data, answer_key = _render_minigame("sequence", copy.deepcopy(VALID_SEQUENCE), VALID_MATERIAL)
    assert game_data["mode"] == "sequence"
    assert len(game_data["items"]) == 3
    # 打乱后展示顺序与正确顺序不同（3 张必保证不同）
    shown = [it["id"] for it in game_data["items"]]
    assert shown != answer_key["answer"]
    assert sorted(shown) == sorted(answer_key["answer"])
    assert answer_key["correctDisplay"].count("→") == 2


def test_render_match_hides_pairing():
    game_data, answer_key = _render_minigame("match", copy.deepcopy(VALID_MATCH), VALID_MATERIAL)
    assert game_data["type"] == "match"
    assert len(game_data["lefts"]) == 3 and len(game_data["rights"]) == 3
    # 左右栏用不透明 id，前端数据不泄露 LLM 的配对关系
    dumped = _dump(game_data)
    assert "pair_" not in dumped
    assert answer_key["answer"] == {"l1": "r1", "l2": "r2", "l3": "r3"}
    assert "苏然" in answer_key["correctDisplay"]


def test_render_classify_strips_category_id():
    game_data, answer_key = _render_minigame("classify", copy.deepcopy(VALID_CLASSIFY), VALID_MATERIAL)
    assert game_data["type"] == "classify"
    assert [c["id"] for c in game_data["categories"]] == ["c1", "c2"]
    for it in game_data["items"]:
        assert "categoryId" not in it
    # 条目打乱后答案映射仍按条目 id 指向类别 id
    assert answer_key["answer"] == {"i1": "c1", "i2": "c2", "i3": "c1", "i4": "c2"}
    assert "现场痕迹" in answer_key["correctDisplay"]


def test_render_unlock_strips_correct_id_and_archive():
    game_data, answer_key = _render_minigame("unlock", copy.deepcopy(VALID_UNLOCK), VALID_MATERIAL)
    assert game_data["type"] == "unlock"
    assert len(game_data["steps"]) == 2
    dumped = _dump(game_data)
    assert "correctId" not in dumped
    # 档案只在结算成功时下发，不得提前进入 game_data 防剧透
    assert "封存档案" not in dumped
    assert answer_key["answer"] == ["opt_b", "opt_c"]
    assert answer_key["correctDisplay"] == "23:41 → 杜维明"
    assert answer_key["archive"]["title"] == "封存档案 · 织女号"
    assert answer_key["stepHints"][0] == "断电时刻记在航行日志的同一页里。"


def test_render_voyage_injects_backend_params():
    game_data, answer_key = _render_minigame("voyage", copy.deepcopy(VALID_VOYAGE), VALID_MATERIAL)
    assert game_data["type"] == "voyage"
    assert game_data["targets"] == ["记忆碎片", "航行日志"]
    assert game_data["timeLimit"] == mg._VOYAGE_TIME_LIMIT
    assert game_data["passScore"] == mg._VOYAGE_PASS_SCORE
    assert answer_key["answer"] == mg._VOYAGE_PASS_SCORE


# ═══════════════════════════════════════════════════════
# 判定逻辑
# ═══════════════════════════════════════════════════════

def _store(kind: str, data: dict) -> str:
    game_data, answer_key = _render_minigame(kind, copy.deepcopy(data), VALID_MATERIAL)
    mg._store_pending(game_data["gameId"], answer_key)
    return game_data["gameId"]


def test_judge_clue():
    gid = _store("clue", VALID_CLUE)
    assert judge_minigame(gid, "clue_2")["success"] is True
    # 一次性结算：同一 game_id 再次判定应报错
    with pytest.raises(KeyError):
        judge_minigame(gid, "clue_2")


def test_judge_clue_wrong():
    gid = _store("clue", VALID_CLUE)
    res = judge_minigame(gid, "clue_1")
    # 首次答错为非终局：仍有重试机会，揭示分玩法提示（先来源），不泄底
    assert res["success"] is False
    assert res["final"] is False
    assert res["attemptsLeft"] == 2
    assert "correctAnswer" not in res
    assert res["revealHint"] == "正确线索的来源是：口供"


def test_judge_retries_then_success():
    gid = _store("clue", VALID_CLUE)
    judge_minigame(gid, "clue_1")  # 答错一次
    res = judge_minigame(gid, "clue_2")  # 第二次答对
    assert res["success"] is True
    assert res["final"] is True
    with pytest.raises(KeyError):
        judge_minigame(gid, "clue_2")  # 已结算


def test_judge_exhausts_attempts_then_final_failure():
    gid = _store("clue", VALID_CLUE)
    expected_hints = [
        "正确线索的来源是：口供",
        "正确线索的内容以「管」开头",
    ]
    for i in range(mg._MAX_ATTEMPTS - 1):
        res = judge_minigame(gid, "clue_1")
        assert res["final"] is False
        # 逐次揭示一条分玩法针对性提示
        assert res["revealHint"] == expected_hints[i]
    res = judge_minigame(gid, "clue_1")
    assert res["success"] is False
    assert res["final"] is True
    assert res["correctAnswer"] == "管家当晚持有书房钥匙"


def test_judge_cipher_normalizes_whitespace_and_case():
    gid = _store("cipher", VALID_CIPHER)
    assert judge_minigame(gid, " 记 忆 匣 ")["success"] is True

    gid2 = _store("cipher", VALID_CIPHER)
    assert judge_minigame(gid2, "别的答 案")["success"] is False


def test_judge_sequence_exact_order():
    gid = _store("sequence", VALID_SEQUENCE)
    assert judge_minigame(gid, ["seg_1", "seg_2", "seg_3"])["success"] is True

    gid2 = _store("sequence", VALID_SEQUENCE)
    assert judge_minigame(gid2, ["seg_2", "seg_1", "seg_3"])["success"] is False

    gid3 = _store("sequence", VALID_SEQUENCE)
    assert judge_minigame(gid3, "not-a-list")["success"] is False


def test_judge_match_mapping():
    gid = _store("match", VALID_MATCH)
    assert judge_minigame(gid, {"l1": "r1", "l2": "r2", "l3": "r3"})["success"] is True

    gid2 = _store("match", VALID_MATCH)
    assert judge_minigame(gid2, {"l1": "r2", "l2": "r1", "l3": "r3"})["success"] is False

    gid3 = _store("match", VALID_MATCH)
    assert judge_minigame(gid3, "not-a-dict")["success"] is False


def test_judge_classify_mapping():
    gid = _store("classify", VALID_CLASSIFY)
    assert judge_minigame(gid, {"i1": "c1", "i2": "c2", "i3": "c1", "i4": "c2"})["success"] is True

    gid2 = _store("classify", VALID_CLASSIFY)
    assert judge_minigame(gid2, {"i1": "c2", "i2": "c2", "i3": "c1", "i4": "c2"})["success"] is False


def test_judge_unlock_sequence():
    gid = _store("unlock", VALID_UNLOCK)
    res = judge_minigame(gid, ["opt_b", "opt_c"])
    assert res["success"] is True
    # 终局成功附带解锁的档案
    assert res["archive"]["title"] == "封存档案 · 织女号"

    gid2 = _store("unlock", VALID_UNLOCK)
    assert judge_minigame(gid2, ["opt_a", "opt_c"])["success"] is False


def test_judge_unlock_layer_by_layer():
    gid = _store("unlock", VALID_UNLOCK)
    # 第一层选对：非终局，进入下一层
    res = judge_minigame(gid, {"partial": True, "selection": "opt_b"})
    assert res["success"] is True
    assert res["final"] is False
    assert res["layerCleared"] is True
    assert res["stepIndex"] == 1
    # 最后一层选对：直接终局成功并附档案
    res2 = judge_minigame(gid, {"partial": True, "selection": "opt_c"})
    assert res2["success"] is True
    assert res2["final"] is True
    assert res2["archive"]["title"] == "封存档案 · 织女号"
    with pytest.raises(KeyError):
        judge_minigame(gid, {"partial": True, "selection": "opt_c"})  # 已结算


def test_judge_unlock_layer_wrong_keeps_progress():
    gid = _store("unlock", VALID_UNLOCK)
    judge_minigame(gid, {"partial": True, "selection": "opt_b"})  # 第一层过
    res = judge_minigame(gid, {"partial": True, "selection": "opt_d"})  # 第二层错
    assert res["success"] is False
    assert res["final"] is False
    assert res["layerCleared"] is False
    assert res["attemptsLeft"] == 2
    # 层内提示用该层 hint，进度不退回
    assert res["revealHint"] == "监控里最后离开实验室的背影不是苏然。"
    res2 = judge_minigame(gid, {"partial": True, "selection": "opt_c"})
    assert res2["success"] is True and res2["final"] is True


def test_judge_unlock_layer_exhausts_attempts():
    gid = _store("unlock", VALID_UNLOCK)
    for _ in range(mg._MAX_ATTEMPTS):
        res = judge_minigame(gid, {"partial": True, "selection": "opt_a"})
    assert res["success"] is False
    assert res["final"] is True
    assert "correctAnswer" in res


def test_judge_voyage_score():
    gid = _store("voyage", VALID_VOYAGE)
    assert judge_minigame(gid, mg._VOYAGE_PASS_SCORE)["success"] is True

    gid2 = _store("voyage", VALID_VOYAGE)
    assert judge_minigame(gid2, mg._VOYAGE_PASS_SCORE - 10)["success"] is False

    gid3 = _store("voyage", VALID_VOYAGE)
    assert judge_minigame(gid3, "not-a-number")["success"] is False


def test_judge_unknown_game_raises():
    with pytest.raises(KeyError):
        judge_minigame("nope", "x")


# ═══════════════════════════════════════════════════════
# 主入口（mock LLM）：重试与暂存
# ═══════════════════════════════════════════════════════

def _adapter():
    return _FakeAdapter(
        raw_data={"main_plot": {"core_conflict": "冲突", "themes": ["记忆"], "summary": "梗概"}},
        characters=[{"name": "苏然"}],
        title="回响",
        scenes=[{"name": "工作室", "description": "工作室"}],
    )


def test_generate_minigame_success_and_pending(monkeypatch):
    fake = _FakeClient([copy.deepcopy(VALID_CLUE)])
    monkeypatch.setattr(mg, "_build_minigame_client", lambda: fake)

    game_data = generate_minigame(_adapter(), "clue")
    assert fake.calls == 1
    assert game_data["gameId"] in mg._PENDING_GAMES
    # 生成后可直接判定
    assert judge_minigame(game_data["gameId"], "clue_2")["success"] is True


def test_generate_minigame_retries_on_invalid(monkeypatch):
    bad = copy.deepcopy(VALID_CIPHER)
    bad["answer"] = ""  # 第一次校验失败
    fake = _FakeClient([bad, copy.deepcopy(VALID_CIPHER)])
    monkeypatch.setattr(mg, "_build_minigame_client", lambda: fake)

    game_data = generate_minigame(_adapter(), "cipher")
    assert fake.calls == 2
    assert game_data["mode"] == "cipher"


def test_generate_minigame_retries_on_json_error(monkeypatch):
    fake = _FakeClient([ValueError("not json"), copy.deepcopy(VALID_SEQUENCE)])
    monkeypatch.setattr(mg, "_build_minigame_client", lambda: fake)

    game_data = generate_minigame(_adapter(), "sequence")
    assert fake.calls == 2
    assert game_data["mode"] == "sequence"


def test_generate_minigame_exhausted_raises(monkeypatch):
    bad = copy.deepcopy(VALID_SEQUENCE)
    bad["items"] = bad["items"][:2]  # 片段数量不足，持续校验失败
    fake = _FakeClient([copy.deepcopy(bad), copy.deepcopy(bad)])
    monkeypatch.setattr(mg, "_build_minigame_client", lambda: fake)

    with pytest.raises(ValueError, match="重试耗尽"):
        generate_minigame(_adapter(), "sequence")


def test_generate_minigame_invalid_kind():
    with pytest.raises(ValueError, match="未知玩法"):
        generate_minigame(_adapter(), "poker")


# ═════════════════════════════════════════════════
# 新玩法：碎纸复原 / 频段截听 / 现场搜证
# ═════════════════════════════════════════════════

VALID_SHUFFLE = {
    "title": "碎纸复原",
    "story": "废纸篓里发现一份被撕碎的尸检报告。",
    "docTitle": "尸检报告·柒号",
    "pieces": [{"id": f"p_{i}", "text": f"报告片段内容第{i}片"} for i in range(1, 10)],
    "successText": "报告复原了。",
    "failureText": "拼接顺序还是错的。",
}

VALID_RADIO = {
    "title": "深夜截听",
    "story": "一台秘密电台总在午夜播发同一段旋律。",
    "callSign": "夜枭",
    "interceptText": "十七日午夜码头见，带上密码本，不要带任何人来。",
    "successText": "密电截获成功。",
    "failureText": "信号消失在杂波里。",
}

VALID_SEARCH = {
    "title": "搜查工作室",
    "story": "勘查工作室，找出所有与纵火有关的物品。",
    "targetDesc": "找出所有与纵火有关的物品",
    "items": [
        {"id": "ev_1", "name": "打火机", "desc": "烧焦的煤油打火机", "isTarget": True},
        {"id": "ev_2", "name": "相框", "desc": "倒扣在桌上的合影", "isTarget": False},
        {"id": "ev_3", "name": "助燃剂", "desc": "半桶未开封的酒精", "isTarget": True},
        {"id": "ev_4", "name": "笔记本", "desc": "写满数字的草稿本", "isTarget": False},
        {"id": "ev_5", "name": "火柴盒", "desc": "只剩两根的火柴盒", "isTarget": True},
        {"id": "ev_6", "name": "茶杯", "desc": "还有余温的红茶杯", "isTarget": False},
        {"id": "ev_7", "name": "留声机", "desc": "唱片停在半首夜曲", "isTarget": False},
        {"id": "ev_8", "name": "地图", "desc": "折痕磨白的港区地图", "isTarget": False},
    ],
    "successText": "搜证完成。",
    "failureText": "圈选有遗漏。",
}


def test_validate_shuffle_rejects_bad_grid_count():
    assert _validate_minigame("shuffle", copy.deepcopy(VALID_SHUFFLE)) == []
    bad = copy.deepcopy(VALID_SHUFFLE)
    bad["pieces"] = bad["pieces"][:7]  # 7 片无法整齐铺满矩形
    assert any("6/8/9" in e for e in _validate_minigame("shuffle", bad))


def test_validate_radio_rejects_short_intercept():
    assert _validate_minigame("radio", copy.deepcopy(VALID_RADIO)) == []
    bad = copy.deepcopy(VALID_RADIO)
    bad["interceptText"] = "太短"
    assert any("interceptText" in e for e in _validate_minigame("radio", bad))


def test_validate_search_rejects_bad_target_count():
    assert _validate_minigame("search", copy.deepcopy(VALID_SEARCH)) == []
    bad = copy.deepcopy(VALID_SEARCH)
    for it in bad["items"]:  # 全部取消目标标记
        it["isTarget"] = False
    assert any("2~4" in e for e in _validate_minigame("search", bad))


def test_render_shuffle_grid_and_answer():
    game_data, answer_key = _render_minigame("shuffle", copy.deepcopy(VALID_SHUFFLE), VALID_MATERIAL)
    assert game_data["type"] == "shuffle"
    assert game_data["cols"] == 3 and game_data["rows"] == 3
    shown = [p["id"] for p in game_data["pieces"]]
    assert sorted(shown) == sorted(answer_key["answer"])
    assert shown != answer_key["answer"]  # 打乱后与正确顺序不同
    assert answer_key["correctDisplay"].startswith("尸检报告·柒号：")


def test_render_radio_backend_params_and_no_leak():
    game_data, answer_key = _render_minigame("radio", copy.deepcopy(VALID_RADIO), VALID_MATERIAL)
    assert game_data["type"] == "radio"
    assert 88.0 <= game_data["targetFreq"] <= 108.0
    assert game_data["holdMs"] == mg._RADIO_HOLD_MS
    assert game_data["timeLimit"] == mg._RADIO_TIME_LIMIT
    # 干扰频段不覆盖目标锁定窗口，且彼此不重叠
    tol = game_data["tolerance"]
    for b in game_data["interference"]:
        assert b["to"] < game_data["targetFreq"] - tol or b["from"] > game_data["targetFreq"] + tol
    # 密电内容不得提前进入 game_data 防剧透
    dumped = _dump(game_data)
    assert "码头" not in dumped
    assert answer_key["intercept"]["text"] == VALID_RADIO["interceptText"]


def test_render_search_strips_target_flag():
    game_data, answer_key = _render_minigame("search", copy.deepcopy(VALID_SEARCH), VALID_MATERIAL)
    assert game_data["type"] == "search"
    assert game_data["targetCount"] == 3
    assert game_data["timeLimit"] == mg._SEARCH_TIME_LIMIT
    dumped = _dump(game_data)
    # isTarget 标记与原始 id 命名模式都不允许下发
    assert "isTarget" not in dumped
    assert "ev_" not in dumped
    assert sorted(answer_key["answer"]) == ["i1", "i3", "i5"]


def test_judge_shuffle_exact_order():
    gid = _store("shuffle", VALID_SHUFFLE)
    order = mg._PENDING_GAMES[gid]["answer"]
    assert judge_minigame(gid, list(order))["success"] is True

    gid2 = _store("shuffle", VALID_SHUFFLE)
    assert judge_minigame(gid2, list(reversed(mg._PENDING_GAMES[gid2]["answer"]))) is not None

    gid3 = _store("shuffle", VALID_SHUFFLE)
    wrong = list(mg._PENDING_GAMES[gid3]["answer"])
    wrong[0], wrong[1] = wrong[1], wrong[0]
    res = judge_minigame(gid3, wrong)
    assert res["success"] is False and res["final"] is False
    assert res["revealHint"].startswith("正确顺序的前 1 片是")


def test_judge_radio_tolerance():
    gid = _store("radio", VALID_RADIO)
    target = mg._PENDING_GAMES[gid]["answer"]
    res = judge_minigame(gid, round(target + 0.15, 2))  # 容差内
    assert res["success"] is True and res["final"] is True
    # 截获成功随结果下发密电
    assert res["intercept"]["callSign"] == "夜枭"

    gid2 = _store("radio", VALID_RADIO)
    target2 = mg._PENDING_GAMES[gid2]["answer"]
    res2 = judge_minigame(gid2, round(target2 + 3.0, 1))  # 容差外
    assert res2["success"] is False and res2["final"] is False

    gid3 = _store("radio", VALID_RADIO)
    assert judge_minigame(gid3, "not-a-freq")["success"] is False


def test_judge_search_set_equality():
    gid = _store("search", VALID_SEARCH)
    res = judge_minigame(gid, ["i5", "i1", "i3"])  # 顺序无关
    assert res["success"] is True and res["final"] is True

    gid2 = _store("search", VALID_SEARCH)
    res2 = judge_minigame(gid2, ["i1", "i3", "i4"])  # 多圈了无关项
    assert res2["success"] is False and res2["final"] is False
    assert res2["revealHint"].startswith("已确认的证物：")

    gid3 = _store("search", VALID_SEARCH)
    assert judge_minigame(gid3, [])["success"] is False


# ═════════════════════════════════════════════════
# 密码转盘（dial）与档案室迷宫（maze）
# ═════════════════════════════════════════════════

VALID_DIAL = {
    "title": "档案柜转盘锁",
    "story": "档案柜上挂着一把转盘密码锁，里面锁着当晚的值班记录。",
    "secret": "915",
    "lockNote": "他离开的那天，成了锁上的数字",
    "lockMark": "刻痕写着：月与日，各取一位",
    "hintClue": "九月十五，码头黄昏",
    "successText": "锁开了。",
    "failureText": "试拨次数耗尽，锁纹丝不动。",
}

VALID_MAZE = {
    "title": "档案室脱身",
    "story": "脚步声逼近，必须赶在巡夜人折返前穿过档案室。",
    "mapNote": "别碰巡逻手电的光",
    "successText": "你从侧门脱身了。",
    "failureText": "被堵在了档案室里。",
}


def test_validate_dial_checks_secret_and_hints():
    assert _validate_minigame("dial", copy.deepcopy(VALID_DIAL)) == []
    # secret 必须恰好是 3 位数字
    bad = copy.deepcopy(VALID_DIAL)
    bad["secret"] = "91a5"
    assert any("secret" in e for e in _validate_minigame("dial", bad))
    # lockNote 不得直接包含真实密码
    bad2 = copy.deepcopy(VALID_DIAL)
    bad2["lockNote"] = "密码就是 915，别忘了"
    assert any("lockNote" in e for e in _validate_minigame("dial", bad2))
    # lockMark 不能缺失也不得直接包含密码
    bad_m1 = copy.deepcopy(VALID_DIAL)
    bad_m1["lockMark"] = ""
    assert any("lockMark" in e for e in _validate_minigame("dial", bad_m1))
    bad_m2 = copy.deepcopy(VALID_DIAL)
    bad_m2["lockMark"] = "直接拨 915"
    assert any("lockMark" in e for e in _validate_minigame("dial", bad_m2))
    # hintClue 不能缺失也不得直接写出密码
    bad3 = copy.deepcopy(VALID_DIAL)
    bad3["hintClue"] = ""
    assert any("hintClue" in e for e in _validate_minigame("dial", bad3))
    bad4 = copy.deepcopy(VALID_DIAL)
    bad4["hintClue"] = "拨 915 就行"
    assert any("hintClue" in e for e in _validate_minigame("dial", bad4))


def test_validate_maze_passes_and_rejects_empty_mapnote():
    assert _validate_minigame("maze", copy.deepcopy(VALID_MAZE)) == []
    bad = copy.deepcopy(VALID_MAZE)
    bad["mapNote"] = ""
    assert any("mapNote" in e for e in _validate_minigame("maze", bad))


def test_render_dial_secret_from_llm_no_leak():
    game_data, answer_key = _render_minigame("dial", copy.deepcopy(VALID_DIAL), VALID_MATERIAL)
    assert game_data["type"] == "dial"
    assert game_data["codeLength"] == mg._DIAL_CODE_LEN
    assert game_data["lockNote"] == VALID_DIAL["lockNote"]  # 谜面一开始就展示
    assert game_data["lockMark"] == VALID_DIAL["lockMark"]  # 锁身刻痕同样开场展示
    # 转盘玩法使用独立试拨预算，而非默认 3 次
    assert game_data["maxAttempts"] == mg._DIAL_MAX_TRIES
    assert answer_key["attemptsLeft"] == mg._DIAL_MAX_TRIES
    secret = answer_key["answer"]
    assert secret == VALID_DIAL["secret"]
    # 真实密码与更明确的线索都不得出现在下发前端的数据里
    data_no_id = {k: v for k, v in game_data.items() if k != "gameId"}
    dumped = _dump(data_no_id)
    assert secret not in dumped
    assert VALID_DIAL["hintClue"] not in dumped
    # 首次答错揭示的是 LLM 提供的来历线索
    assert answer_key["hintSteps"][0] == VALID_DIAL["hintClue"]


def test_render_maze_grid_is_solvable():
    game_data, answer_key = _render_minigame("maze", copy.deepcopy(VALID_MAZE), VALID_MATERIAL)
    assert game_data["type"] == "maze"
    assert game_data["rows"] == mg._MAZE_SIZE and game_data["cols"] == mg._MAZE_SIZE
    grid = game_data["grid"]
    start, exit_cell = tuple(game_data["start"]), tuple(game_data["exit"])
    assert grid[start[0]][start[1]] == 0 and grid[exit_cell[0]][exit_cell[1]] == 0
    # BFS 验证入口可达出口（程序化生成保证可解）
    from collections import deque
    seen = {start}
    queue = deque([start])
    while queue:
        r, c = queue.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) \
                    and grid[nr][nc] == 0 and (nr, nc) not in seen:
                seen.add((nr, nc))
                queue.append((nr, nc))
    assert exit_cell in seen
    assert answer_key["answer"] is True
    # 巡逻光点：出生点为画布内连续坐标，离入口≥ 3 格、彼此间距≥ 2 格，速度有快有慢
    patrols = game_data["patrols"]
    assert len(patrols) == mg._MAZE_PATROL_COUNT
    sx, sy = start[1] + 0.5, start[0] + 0.5
    base_speed = mg._MAZE_SIZE / mg._MAZE_PATROL_CROSS_SEC
    for i, pt in enumerate(patrols):
        assert 0 <= pt["x"] <= mg._MAZE_SIZE and 0 <= pt["y"] <= mg._MAZE_SIZE
        assert (pt["x"] - sx) ** 2 + (pt["y"] - sy) ** 2 >= 9.0
        assert base_speed * 0.7 - 0.01 <= pt["speed"] <= base_speed * 1.3 + 0.01
        for other in patrols[i + 1:]:
            assert (pt["x"] - other["x"]) ** 2 + (pt["y"] - other["y"]) ** 2 >= 4.0
    assert game_data["caughtPenalty"] == mg._MAZE_CAUGHT_PENALTY
    assert "patrolStepMs" not in game_data


def test_dial_feedback_counts():
    assert mg._dial_feedback("123", "123") == {"guess": "123", "a": 3, "b": 0}
    assert mg._dial_feedback("321", "123") == {"guess": "321", "a": 1, "b": 2}
    assert mg._dial_feedback("112", "121")["a"] == 1  # 重复数字按最小计数
    assert mg._dial_feedback("112", "121")["b"] == 2


def _shift_guess(secret: str) -> str:
    """构造每位都与真实密码不同的试拨码（逐位 +1 取模）"""
    return "".join(str((int(d) + 1) % 10) for d in secret)


def test_judge_dial_feedback_loop_and_exhaustion():
    gid = _store("dial", VALID_DIAL)
    secret = mg._PENDING_GAMES[gid]["answer"]
    wrong = _shift_guess(secret)  # 每位均错位
    res = judge_minigame(gid, wrong)
    assert res["success"] is False and res["final"] is False
    fb = res["guessFeedback"]
    assert fb["a"] == 0 and fb["guess"] == wrong
    assert res["attemptsLeft"] == mg._DIAL_MAX_TRIES - 1
    # 格式非法：返回 formatError 且不泄露密码
    gid2 = _store("dial", VALID_DIAL)
    res2 = judge_minigame(gid2, "12")
    assert res2["success"] is False and "formatError" in res2["guessFeedback"]
    # 拨中真实密码：终局成功
    gid3 = _store("dial", VALID_DIAL)
    res3 = judge_minigame(gid3, mg._PENDING_GAMES[gid3]["answer"])
    assert res3["success"] is True and res3["final"] is True
    # 耗尽全部试拨机会：终局失败并揭示正确答案
    gid4 = _store("dial", VALID_DIAL)
    secret4 = mg._PENDING_GAMES[gid4]["answer"]
    wrong4 = _shift_guess(secret4)
    res4 = None
    for _ in range(mg._DIAL_MAX_TRIES):
        res4 = judge_minigame(gid4, wrong4)
    assert res4["final"] is True and res4["success"] is False
    assert secret4 in res4["correctAnswer"]


def test_judge_maze_reached_report():
    gid = _store("maze", VALID_MAZE)
    res = judge_minigame(gid, {"reached": True})
    assert res["success"] is True and res["final"] is True

    gid2 = _store("maze", VALID_MAZE)
    res2 = judge_minigame(gid2, {"reached": False})  # 超时：未耗尽机会，可重试
    assert res2["success"] is False and res2["final"] is False
    assert res2["revealHint"]


# ═══════════════════════════════════════════════
# 选项随机注入（剧情内嵌）
# ═══════════════════════════════════════════════

def _plain_choice(i: int) -> dict:
    return {"id": f"opt_{i}", "text": f"选项{i}", "consequences": {}}


def test_inject_full_probability_unique_kinds():
    choices = [
        {"id": "yaml_decl", "text": "作者声明项", "minigame": {"type": "cipher", "hint": "x"}},
        _plain_choice(1), _plain_choice(2), _plain_choice(3),
        {"id": "__advance__", "text": "继续"},
    ]
    out, injected = mg.inject_choice_minigames(
        choices, config={"choiceProbability": 1.0, "avoidRecentKind": True})

    # YAML 声明保留且不参与注入；占位项不注入
    assert out[0]["minigame"] == {"type": "cipher", "hint": "x"}
    assert "minigame" not in out[4]
    # 普通选项全部挂上注入声明，玩法互不重复
    assert set(injected) == {1, 2, 3}
    kinds = [injected[i]["type"] for i in sorted(injected)]
    assert len(set(kinds)) == 3
    assert all(k in mg.VALID_KINDS for k in kinds)
    assert all(out[i]["minigame"]["injected"] is True for i in (1, 2, 3))
    # 入参不被原地修改
    assert "minigame" not in choices[1]


def test_inject_zero_probability_injects_nothing():
    choices = [_plain_choice(1), _plain_choice(2)]
    out, injected = mg.inject_choice_minigames(
        choices, config={"choiceProbability": 0.0, "avoidRecentKind": True})
    assert injected == {}
    assert all("minigame" not in c for c in out)


def test_inject_avoids_recent_kind():
    choices = [_plain_choice(i) for i in range(4)]
    out, injected = mg.inject_choice_minigames(
        choices, last_kind="clue", config={"choiceProbability": 1.0, "avoidRecentKind": True})
    assert "clue" not in [injected[i]["type"] for i in injected]


def test_inject_early_scene_only_flavor_kinds():
    """前期场景只注入风味型玩法，内容配额型（易剧透）不得出现"""
    for idx in range(mg._EARLY_SCENE_LIMIT):
        choices = [_plain_choice(i) for i in range(8)]
        out, injected = mg.inject_choice_minigames(
            choices, config={"choiceProbability": 1.0, "avoidRecentKind": False},
            scene_index=idx)
        kinds = [injected[i]["type"] for i in injected]
        assert kinds
        assert all(k not in mg._CONTENT_HEAVY_KINDS for k in kinds)
    # 前期结束后放开全量池：多次采样内必然出现内容配额型玩法
    seen_heavy = False
    for seed in range(50):
        random.seed(seed)
        choices = [_plain_choice(i) for i in range(8)]
        out, injected = mg.inject_choice_minigames(
            choices, config={"choiceProbability": 1.0, "avoidRecentKind": False},
            scene_index=mg._EARLY_SCENE_LIMIT)
        if any(injected[i]["type"] in mg._CONTENT_HEAVY_KINDS for i in injected):
            seen_heavy = True
            break
    assert seen_heavy


def test_inject_config_loaded_from_yaml():
    cfg = mg.get_inject_config()
    assert cfg["choiceProbability"] == 0.8
    assert cfg["avoidRecentKind"] is True


# ═══════════════════════════════════════════════
# 视野隔离：内嵌模式不透出整本剧本
# ═══════════════════════════════════════════════

def test_prompt_embedded_hides_full_script():
    """内嵌视野：不含核心冲突/梗概/未到达场景，只含已揭示内容"""
    material = dict(VALID_MATERIAL)
    material["scenes"] = VALID_MATERIAL["scenes"] + [
        {"name": "终局天台", "desc": "真相在这里揭晓"}]
    ctx = {
        "choice_text": "调查发件人",
        "hint": "",
        "narration": "工作室的灯还亮着。",
        "dialogues": [{"speaker": "苏然", "text": "这段记忆被动过。"}],
        "history": [],
        "appeared_characters": ["苏然"],
        "visited_scenes": ["工作室"],
    }
    prompt = mg._build_user_prompt(material, None, ctx)
    # 整本剧本的机密不得出现
    assert "记忆篡改的真相" not in prompt        # 核心冲突
    assert "记忆修复师发现被篡改的记忆" not in prompt  # 剧情梗概
    assert "终局天台" not in prompt              # 未到达场景
    assert "林晓" not in prompt                  # 未登场角色
    # 已揭示视野必须出现
    assert "已揭示剧情视野" in prompt
    assert "防剧透硬规则" in prompt
    assert "工作室" in prompt
    assert "苏然" in prompt
    assert "调查发件人" in prompt


def test_prompt_standalone_contains_full_material():
    """独立试玩模式仍给全量素材"""
    prompt = mg._build_user_prompt(dict(VALID_MATERIAL), None, None)
    assert "记忆篡改的真相" in prompt
    assert "记忆修复师发现被篡改的记忆" in prompt
    assert "林晓" in prompt

