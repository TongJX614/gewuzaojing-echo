# -*- coding: utf-8 -*-
"""
辩论小游戏生成器 (Debate Generator)
根据上传剧本的主题描述（main_plot 核心冲突 + 主题），调用独立模型生成
「言弹辩论」小游戏数据（弹丸论破式飞屏击破玩法），供前端直接渲染。

流程：提取剧本素材 → LLM 输出结构化 JSON → 校验重试 → 渲染演出参数。
LLM 只负责内容创作；破绽 HTML 标记与 delay/duration/yPos/angle 等
演出参数由本模块渲染填充，前端游戏逻辑零改动。
"""

from __future__ import annotations

import html

from llm_client import LLMClient
from config_manager import QuillForgeSettings, get_settings
from logger import get_logger

logger = get_logger("debate_generator")


# ═══════════════════════════════════════════════════════
# LLM 客户端（独立模型，不占用游戏运行时模型）
# ═══════════════════════════════════════════════════════

def _build_debate_client(
    settings: QuillForgeSettings | None = None,
) -> LLMClient:
    """构建辩论生成专用 LLM 客户端。

    辩论生成使用 Settings 中独立的 debate_model。
    必须禁用 thinking：思考模型会把 max_tokens 耗尽在 reasoning 上，
    导致正式输出为空（finish_reason=length 且 content 为空串）。
    """
    settings = settings or get_settings()
    return LLMClient(
        connection=settings.connection,
        model=settings.debate_model,
        temperature=0.85,
        max_tokens=4000,
        timeout=120.0,
        connect_timeout=settings.llm_connect_timeout,
        extra_body={"thinking": {"type": "disabled"}},
    )


# ═══════════════════════════════════════════════════════
# 提示词
# ═══════════════════════════════════════════════════════

DEBATE_SYSTEM_PROMPT = """\
你是一位「言弹辩论」小游戏编剧。玩家在游戏中观看对手的言论从屏幕飞过，
用正确的「言弹」（论据）击中标记出的破绽言论，即可论破对手、推进辩论。

根据用户提供的剧本素材（核心冲突、主题、角色），设计一场完整辩论。
玩家的立场是主角一方，需要捍卫剧本主题代表的价值观。

只输出一个 JSON 对象，不要任何额外说明、不要 markdown 代码块，结构如下：
{
  "title": "辩论标题（≤15字，有戏剧张力）",
  "victoryText": "玩家获胜时的结算语（1句话，点明捍卫了什么）",
  "playerStance": "玩家立场（1句话）",
  "truthBullets": [
    { "id": "英文小写单词", "name": "言弹名（≤8字）", "short": "言弹缩写（2字）", "desc": "一句话论据（≤45字）" }
  ],
  "phases": [
    {
      "speaker": "发言人（必须来自候选角色名单）",
      "lines": [
        { "text": "台词（≤24字）", "weakPoint": null },
        { "text": "带破绽的台词（≤24字）", "weakPoint": { "type": "refute", "targetBullet": "言弹id" } }
      ]
    }
  ]
}

硬性约束（违反任何一条都会导致生成失败）：
1. truthBullets 数量 4~6 个，id 唯一；short 必须是恰好 2 个汉字（用于弹巢显示）；
   言弹是玩家手中的论据武器，必须是可以直接反驳对手观点的具体论据，不能是空泛口号
2. phases 数量 3~5 个，每个 phase 是一位角色的一段连续发言
3. speaker 只能使用用户给出的候选角色名单中的名字
4. 每个 phase 包含 4~6 句台词，每句不超过 24 个字，口语化、有攻击性、节奏短促
5. 每个 phase 有且只有 1 句台词的 weakPoint 非 null，放在该 phase 最后一句；
   其余台词 weakPoint 一律为 null
6. weakPoint.targetBullet 必须是 truthBullets 中已定义的 id，
   且不同 phase 的 targetBullet 不得重复
7. type="refute"：该句是对手阵营的谬论，玩家击破后判定「论破」；
   type="agree"：该句是己方阵营盟友说出的关键正确观点，玩家击破后判定「赞同」；
   以 opponent/ally 字段提示的角色阵营为准
8. 辩论内容必须围绕核心冲突展开：把剧本主题转化为具体的对立观点交锋，
   引用剧情细节增强代入感，不要照抄设定原文
9.【内容安全】严禁输出色情低俗、暴力血腥、政治敏感内容；
   剧本中的冲突须转化为语言与观点层面的交锋

每个 phase 附加字段 "stance"："opponent"（对手，玩家要驳倒他）或 "ally"（盟友）。
最后一个 phase 的破绽建议使用 refute 类型，作为辩论的决胜点。
"""


def _build_user_prompt(material: dict, errors: list[str] | None = None) -> str:
    """组装用户 Prompt：剧本素材 + （重试时）上一次的校验错误"""
    chars_block = "\n".join(
        f"- {c['name']}（{c['stance']}）：{c['desc']}" for c in material["characters"]
    )
    themes_str = "、".join(material["themes"]) if material["themes"] else "（未提供）"

    prompt = f"""剧本标题：{material['title']}
核心冲突：{material['core_conflict'] or '（未提供）'}
主题：{themes_str}
剧情梗概：{material['summary'] or '（未提供）'}
世界观摘要：{material['worldbook'] or '（未提供）'}

候选角色名单（speaker 只能从中选择）：
{chars_block}

请基于以上素材生成这场辩论。"""

    if errors:
        prompt += "\n\n你上一次的输出未通过校验，存在以下问题，请逐条修正后重新输出完整 JSON：\n"
        prompt += "\n".join(f"- {e}" for e in errors)
    return prompt


# ═══════════════════════════════════════════════════════
# 素材提取
# ═══════════════════════════════════════════════════════

def extract_debate_material(adapter) -> dict:
    """从已解析的剧本适配器中提取辩论生成所需素材。

    Returns:
        {title, core_conflict, themes, summary, worldbook,
         characters: [{name, stance, desc}], character_names: [name]}
    Raises:
        ValueError: 剧本缺少主题描述（core_conflict/themes/summary 全空）
    """
    raw = getattr(adapter, "raw_data", {}) or {}
    main_plot = raw.get("main_plot") or {}
    if not isinstance(main_plot, dict):
        main_plot = {}

    themes = main_plot.get("themes") or []
    if isinstance(themes, str):
        themes = [themes]
    core_conflict = str(main_plot.get("core_conflict", "") or "")
    summary = str(main_plot.get("summary", "") or "")

    if not core_conflict and not themes and not summary:
        raise ValueError("剧本缺少主题描述（main_plot 的 core_conflict/themes/summary 均为空），无法生成辩论")

    # 角色素材：前 4 位，首位视为主角阵营（ally），其余为对手（opponent）
    characters: list[dict] = []
    for i, c in enumerate(adapter.characters[:4]):
        name = c.get("name") or c.get("id") or ""
        if not name:
            continue
        desc_parts = [p for p in (c.get("role", ""), c.get("personality", ""), c.get("motivation", "")) if p]
        characters.append({
            "name": name,
            "stance": "ally" if i == 0 else "opponent",
            "desc": "；".join(desc_parts)[:80] or "（无描述）",
        })
    if not characters:
        raise ValueError("剧本中未解析到任何角色，无法生成辩论")

    worldbook = str(getattr(adapter, "worldbook", "") or "")[:600]

    return {
        "title": getattr(adapter, "title", "") or "未命名剧本",
        "core_conflict": core_conflict,
        "themes": [str(t) for t in themes][:3],
        "summary": summary[:120],
        "worldbook": worldbook,
        "characters": characters,
        "character_names": [c["name"] for c in characters],
    }


# ═══════════════════════════════════════════════════════
# 校验
# ═══════════════════════════════════════════════════════

def _validate_debate(data: dict, character_names: list[str]) -> list[str]:
    """校验 LLM 输出，返回错误列表（空列表表示通过）"""
    errors: list[str] = []

    bullets = data.get("truthBullets")
    if not isinstance(bullets, list):
        return ["truthBullets 必须是数组"]
    if not 4 <= len(bullets) <= 6:
        errors.append(f"truthBullets 数量必须为 4~6 个（当前 {len(bullets)}）")

    bullet_ids: set[str] = set()
    for b in bullets:
        if not isinstance(b, dict):
            errors.append("truthBullets 中存在非对象元素")
            continue
        bid = str(b.get("id", "")).strip()
        if not bid:
            errors.append("存在缺少 id 的言弹")
        elif bid in bullet_ids:
            errors.append(f"言弹 id 重复: {bid}")
        else:
            bullet_ids.add(bid)
        if not str(b.get("name", "")).strip():
            errors.append(f"言弹 {bid or '?'} 缺少 name")
        if not str(b.get("short", "")).strip():
            errors.append(f"言弹 {bid or '?'} 缺少 short")
        if not str(b.get("desc", "")).strip():
            errors.append(f"言弹 {bid or '?'} 缺少 desc")

    phases = data.get("phases")
    if not isinstance(phases, list):
        errors.append("phases 必须是数组")
        return errors
    if not 2 <= len(phases) <= 6:
        errors.append(f"phases 数量必须为 2~6 个（当前 {len(phases)}）")

    used_targets: set[str] = set()
    for pi, phase in enumerate(phases, start=1):
        if not isinstance(phase, dict):
            errors.append(f"phase {pi} 不是对象")
            continue
        speaker = str(phase.get("speaker", "")).strip()
        if not speaker:
            errors.append(f"phase {pi} 缺少 speaker")
        elif speaker not in character_names:
            errors.append(f"phase {pi} 的 speaker「{speaker}」不在候选角色名单中（只能使用：{'、'.join(character_names)}）")

        lines = phase.get("lines")
        if not isinstance(lines, list) or not 3 <= len(lines) <= 7:
            errors.append(f"phase {pi} 的台词数量必须为 3~7 句")
            continue

        weak_count = 0
        for li, line in enumerate(lines, start=1):
            if not isinstance(line, dict):
                errors.append(f"phase {pi} 第 {li} 句不是对象")
                continue
            text = str(line.get("text", "")).strip()
            if not text:
                errors.append(f"phase {pi} 第 {li} 句台词为空")
            elif len(text) > 30:
                errors.append(f"phase {pi} 第 {li} 句台词超过 30 字（{len(text)} 字），请压缩到 24 字以内")

            wp = line.get("weakPoint")
            if wp is None:
                continue
            weak_count += 1
            if not isinstance(wp, dict):
                errors.append(f"phase {pi} 第 {li} 句的 weakPoint 必须是对象或 null")
                continue
            if wp.get("type") not in ("refute", "agree"):
                errors.append(f"phase {pi} 第 {li} 句的 weakPoint.type 必须是 refute 或 agree")
            target = str(wp.get("targetBullet", "")).strip()
            if target not in bullet_ids:
                errors.append(f"phase {pi} 第 {li} 句的 targetBullet「{target}」不是已定义的言弹 id")
            elif target in used_targets:
                errors.append(f"phase {pi} 的 targetBullet「{target}」与其他 phase 重复，每个 phase 须使用不同言弹")
            else:
                used_targets.add(target)

        if weak_count != 1:
            errors.append(f"phase {pi} 必须有且只有 1 句破绽台词（当前 {weak_count} 句）")

    return errors


# ═══════════════════════════════════════════════════════
# 演出参数渲染（LLM 不生成排版参数，全部由此处自动计算）
# ═══════════════════════════════════════════════════════

_SPEAKER_COLORS = ["#ff007f", "#00ccff", "#ffaa00", "#33ff77", "#cc66ff", "#ff3333"]
_Y_CYCLE = [20, 35, 50, 65, 40, 55, 30]
_ANGLE_CYCLE = [-2, 3, -1, 2, -4, 1, -3, 4]
_LINE_INTERVAL_MS = 3600  # 相邻台词飞屏间隔
_FIRST_DELAY_MS = 1000


def _duration_for(text: str) -> int:
    """按台词长度计算飞屏时长（越长停留越久），钳制在 7.8~12.5 秒"""
    return max(7800, min(12500, 6500 + len(text) * 280))


def _render_game_data(data: dict, material: dict) -> dict:
    """将校验通过的 LLM 输出渲染为前端 GAME_DATA。

    - weakPoint 结构 → <span class='weak-point ...'> HTML 标记
    - 自动填充 delay/duration/yPos/angle 演出参数
    - 为每位 speaker 分配固定主题色
    输出结构与前端 debatePhases 原始格式一致（phases 为行对象二维数组）。
    """
    color_map: dict[str, str] = {}

    def _color_of(speaker: str) -> str:
        if speaker not in color_map:
            color_map[speaker] = _SPEAKER_COLORS[len(color_map) % len(_SPEAKER_COLORS)]
        return color_map[speaker]

    phases_out: list[list[dict]] = []
    for phase in data["phases"]:
        speaker = str(phase["speaker"]).strip()
        color = _color_of(speaker)
        lines_out: list[dict] = []
        for idx, line in enumerate(phase["lines"]):
            text = html.escape(str(line["text"]).strip(), quote=False)
            wp = line.get("weakPoint")
            if isinstance(wp, dict):
                text = (
                    f"<span class='weak-point {wp['type']}' "
                    f"data-target='{html.escape(str(wp['targetBullet']), quote=True)}'>{text}</span>"
                )
            lines_out.append({
                "speaker": speaker,
                "color": color,
                "text": text,
                "delay": _FIRST_DELAY_MS + idx * _LINE_INTERVAL_MS,
                "duration": _duration_for(str(line["text"])),
                "yPos": _Y_CYCLE[idx % len(_Y_CYCLE)],
                "angle": _ANGLE_CYCLE[idx % len(_ANGLE_CYCLE)],
            })
        phases_out.append(lines_out)

    return {
        "title": str(data.get("title") or f"{material['title']}：主题辩论"),
        "victoryText": str(data.get("victoryText") or "你赢得了这场辩论！"),
        "playerStance": str(data.get("playerStance") or ""),
        "truthBullets": [
            {
                "id": str(b["id"]).strip(),
                "name": str(b["name"]).strip(),
                "short": str(b["short"]).strip()[:3],
                "desc": str(b["desc"]).strip(),
            }
            for b in data["truthBullets"]
        ],
        "phases": phases_out,
    }


# ═══════════════════════════════════════════════════════
# 主入口
# ═══════════════════════════════════════════════════════

def generate_debate(adapter, max_retries: int = 1) -> dict:
    """生成辩论小游戏数据（GAME_DATA）。

    Args:
        adapter: 已 load 的 GenericScriptAdapter
        max_retries: 校验失败后的重试次数（重试时携带错误反馈）
    Returns:
        前端可直接渲染的 GAME_DATA dict
    Raises:
        ValueError: 素材不足或重试耗尽仍未通过校验
    """
    material = extract_debate_material(adapter)
    client = _build_debate_client()

    errors: list[str] | None = None
    for attempt in range(max_retries + 1):
        user_prompt = _build_user_prompt(material, errors)
        try:
            data = client.generate_json(
                DEBATE_SYSTEM_PROMPT, user_prompt, expect_type=dict, retries=1,
            )
        except ValueError as e:
            logger.warning("[debate] 第 %d 次 LLM 调用 JSON 解析失败: %s", attempt + 1, e)
            errors = ["输出不是合法 JSON，请只输出 JSON 对象"]
            continue

        errors = _validate_debate(data, material["character_names"])
        if not errors:
            logger.info("[debate] 生成成功（第 %d 次尝试）: %s", attempt + 1, data.get("title"))
            return _render_game_data(data, material)
        logger.warning("[debate] 第 %d 次尝试校验未通过: %s", attempt + 1, errors)

    raise ValueError("辩论生成失败（重试耗尽）：" + "；".join(errors or ["未知错误"]))
