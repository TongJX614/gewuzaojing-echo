# -*- coding: utf-8 -*-
"""
格式化工具函数 — 从 server.py 提取

将剧本数据（世界书、阶段、事件、选择、结局、世界线等）格式化为
LLM 可读的 prompt 文本片段。
"""

from __future__ import annotations

import re


def _extract_worldbook_rules(worldbook: str) -> str:
    """从世界书提取关键约束规则（含世界背景、历史信息）"""
    if not worldbook:
        return ""
    rules = []
    # 约束类章节
    for section in ["必须遵守", "禁止出现", "情感基调", "故事边界"]:
        match = re.search(rf'###?\s*{section}\s*\n(.*?)(?=###?|\Z)', worldbook, re.DOTALL)
        if match:
            rules.append(f"【{section}】{match.group(1).strip()}")
    # 设定类章节（含历史背景）
    for section in ["世界背景", "核心科技", "组织设定", "社会规则", "历史背景", "时间线", "大事记"]:
        match = re.search(rf'##?\s*{section}\s*\n(.*?)(?=##?|\Z)', worldbook, re.DOTALL)
        if match:
            content = match.group(1).strip()
            if len(content) > 800:
                content = content[:800] + "…"
            rules.append(f"【{section}】{content}")
    return "\n\n".join(rules) if rules else worldbook[:500]


def _get_current_stage(stages: list, scene_id: str) -> dict | None:
    """找到当前场景所属的剧情阶段"""
    for stage in stages:
        if not isinstance(stage, dict):
            continue
        scenes = stage.get("scenes", [])
        if isinstance(scenes, list) and scene_id in scenes:
            return stage
        if isinstance(scenes, str) and scenes == scene_id:
            return stage
    return None


def _format_current_stage_context(stage: dict | None) -> str:
    """格式化当前阶段的剧情要求（关键事件+情感弧线）"""
    if not stage:
        return ""
    parts = []
    name = stage.get("name", "")
    desc = str(stage.get("description", "")).strip()
    if name:
        parts.append(f"当前阶段：{name}")
    if desc:
        parts.append(f"阶段目标：{desc}")
    key_events = stage.get("key_events", []) or []
    if key_events:
        events = []
        for e in key_events:
            if isinstance(e, dict):
                events.append(str(e.get("name", e.get("description", "")))[:40])
            else:
                events.append(str(e)[:40])
        parts.append("本场景必须体现的关键事件：")
        for i, ev in enumerate(events, 1):
            parts.append(f"  {i}. {ev}")
    emotional_arc = str(stage.get("emotional_arc", "")).strip()
    if emotional_arc:
        parts.append(f"情感弧线走向：{emotional_arc}")
    return "\n".join(parts)


def _format_beats_for_scene(beats: list, scene_id: str) -> str:
    """格式化当前场景的剧情节拍"""
    if not beats:
        return ""
    relevant = [b for b in beats if isinstance(b, dict) and b.get("scene") == scene_id]
    if not relevant:
        return ""
    parts = []
    for b in relevant:
        name = b.get("name", "")
        desc = str(b.get("description", "")).strip()[:80]
        purpose = str(b.get("purpose", "")).strip()[:60]
        line = f"● {name}"
        if desc:
            line += f"：{desc}"
        if purpose:
            line += f"（叙事目的：{purpose}）"
        parts.append(line)
    return "\n".join(parts)


def _format_hooks_for_scene(hooks: list, scene_id: str) -> str:
    """格式化当前场景的剧情钩子"""
    if not hooks:
        return ""
    relevant = [h for h in hooks if isinstance(h, dict) and h.get("scene") == scene_id]
    if not relevant:
        return ""
    parts = []
    for h in relevant:
        htype = h.get("type", "")
        desc = str(h.get("description", "")).strip()[:80]
        parts.append(f"[{htype}] {desc}")
    return "\n".join(parts)


def _format_themes(themes: list) -> str:
    """格式化故事主题"""
    if not themes:
        return ""
    return "；".join(str(t)[:50] for t in themes[:5])


def _format_relationships(rels: list) -> str:
    """格式化关系网络为可读字符串"""
    if not rels:
        return ""
    parts = []
    for r in rels[:6]:
        if isinstance(r, dict):
            src = r.get("source", "")
            tgt = r.get("target", "")
            rtype = r.get("type", "")
            desc = str(r.get("description", "")).strip()[:80]
            parts.append(f"{src} ↔ {tgt}（{rtype}）：{desc}")
    return "\n".join(parts)


def _format_stages_overview(stages: list) -> str:
    """格式化主线剧情阶段为时间线概览"""
    if not stages:
        return ""
    parts = []
    for i, s in enumerate(stages):
        if isinstance(s, dict):
            name = s.get("name", f"阶段{i+1}")
            # 兼容 scenes(list) 和 scene(str)
            scenes_val = s.get("scenes", s.get("scene", ""))
            scene_str = ", ".join(str(x) for x in scenes_val) if isinstance(scenes_val, list) else str(scenes_val)
            desc = str(s.get("description", s.get("summary", ""))).strip()[:80]
            key_events = s.get("key_events", s.get("keyEvents", [])) or []
            # 兼容字符串列表和字典列表
            events_str = "；".join(
                (str(e.get("name", e))[:20] if isinstance(e, dict) else str(e)[:20])
                for e in key_events[:3]
            ) if key_events else ""
            emotional_arc = str(s.get("emotional_arc", s.get("emotionalArc", ""))).strip()
            line = f"{'→' if i > 0 else '●'} {name}"
            if scene_str:
                line += f"（场景：{scene_str}）"
            if desc:
                line += f" — {desc}"
            if events_str:
                line += f"\n   关键事件：{events_str}"
            if emotional_arc:
                line += f"\n   情感弧线：{emotional_arc}"
            parts.append(line)
    return "\n".join(parts)


def _format_events(events: list) -> str:
    """格式化事件清单为可读字符串"""
    if not events:
        return ""
    parts = []
    for e in events[:8]:
        if isinstance(e, dict):
            name = e.get("name", e.get("title", ""))
            # 触发条件: 兼容 trigger_conditions(list) / triggerCondition(str) / trigger_stage(str)
            tc_raw = e.get("trigger_conditions", e.get("triggerCondition", e.get("trigger_condition", "")))
            if isinstance(tc_raw, list):
                trigger_cond = "；".join(
                    str(c.get("value", c.get("type", c))).strip()[:30]
                    for c in tc_raw[:3]
                )
            else:
                trigger_cond = str(tc_raw).strip()[:60]
            trigger_stage = e.get("triggerStage", e.get("trigger_stage", ""))
            content = str(e.get("content", e.get("description", ""))).strip()[:100]
            outcome = str(e.get("outcome", e.get("result", ""))).strip()[:60]
            chars_involved = e.get("characters_involved", [])
            line = f"【{name}】"
            if trigger_stage:
                line += f" 触发于「{trigger_stage}」"
            if trigger_cond:
                line += f"\n  触发条件：{trigger_cond}"
            if chars_involved:
                line += f"\n  涉及角色：{', '.join(str(c) for c in chars_involved[:3])}"
            if content:
                line += f"\n  内容：{content}"
            if outcome:
                line += f"\n  结果：{outcome}"
            parts.append(line)
    return "\n\n".join(parts)


def _format_key_choices(choices: list) -> str:
    """格式化关键选择为可读字符串（含后果/性格影响/关系变化）"""
    if not choices:
        return ""
    parts = []
    for c in choices[:6]:
        if isinstance(c, dict):
            # 兼容多种字段名: name/title/description, scene_id/position/scene, prompt
            name = c.get("name", c.get("title", c.get("prompt", "")))
            if not name:
                name = str(c.get("description", ""))[:60]
            position = c.get("scene_id", c.get("position", c.get("scene", "")))
            desc = str(c.get("description", "")).strip()[:80]
            opts = c.get("options", []) or []
            option_strs = []
            for o in opts[:4]:
                if isinstance(o, dict):
                    text = str(o.get("text", o.get("label", ""))).strip()[:40]
                    opt_desc = str(o.get("description", "")).strip()[:50]
                    # 后果: 兼容 consequences(dict)/consequence(str)/result(str)
                    cons_raw = o.get("consequences", o.get("consequence", o.get("result", "")))
                    if isinstance(cons_raw, dict):
                        immediate = str(cons_raw.get("immediate", "")).strip()[:60]
                        delayed = str(cons_raw.get("delayed", "")).strip()[:60]
                        consequence = immediate
                    else:
                        consequence = str(cons_raw).strip()[:60]
                    # 性格影响
                    personality = str(o.get("personality_impact", "")).strip()[:40]
                    # 关系变化
                    rel_changes = o.get("relationship_changes", [])
                    rel_str = ""
                    if isinstance(rel_changes, list) and rel_changes:
                        rel_items = []
                        for r in rel_changes[:2]:
                            if isinstance(r, dict):
                                ch = r.get("character", "")
                                val = r.get("change", 0)
                                reason = str(r.get("reason", ""))[:30]
                                rel_items.append(f"{ch}{'↑' if val > 0 else '↓'}{reason}")
                        rel_str = "；".join(rel_items)
                    # 导向结局
                    leads_to = o.get("leads_to_ending", "")
                    # 组装选项文本
                    opt = f"「{text}」"
                    if opt_desc:
                        opt += f" — {opt_desc}"
                    if consequence:
                        opt += f"\n     即时后果：{consequence}"
                    if personality:
                        opt += f"\n     性格体现：{personality}"
                    if rel_str:
                        opt += f"\n     关系变化：{rel_str}"
                    if leads_to:
                        opt += f"\n     导向结局：{leads_to}"
                    option_strs.append(opt)
            line = f"【{name}】"
            if position:
                line += f"（场景：{position}）"
            if desc and desc != name:
                line += f"\n  {desc}"
            if option_strs:
                line += "\n  " + "\n  ".join(option_strs)
            parts.append(line)
    return "\n\n".join(parts)


def _format_endings(endings: list) -> str:
    """格式化结局系统为可读字符串"""
    if not endings:
        return ""
    parts = []
    for e in endings[:5]:
        if isinstance(e, dict):
            name = e.get("title", e.get("name", ""))
            etype = e.get("type", "")
            # 兼容 trigger_conditions(list) 和 condition(str)
            cond_val = e.get("trigger_conditions", e.get("condition", ""))
            if isinstance(cond_val, list):
                condition = "；".join(
                    str(c.get("value", c))[:30] for c in cond_val[:3]
                ) if cond_val else ""
            else:
                condition = str(cond_val).strip()[:60]
            narrative = str(e.get("narrative", "")).strip()[:80]
            epilogue = str(e.get("epilogue", "")).strip()[:60]
            replay = str(e.get("replay_value", "")).strip()[:60]
            line = f"结局「{name}」（{etype}）"
            if condition:
                line += f"\n  达成条件：{condition}"
            if narrative:
                line += f"\n  叙事：{narrative}"
            if epilogue:
                line += f"\n  尾声：{epilogue}"
            if replay:
                line += f"\n  价值：{replay}"
            parts.append(line)
    return "\n\n".join(parts)


def _format_worldlines(world_lines: list, convergence_points: list = None, rules: list = None) -> str:
    """格式化世界线结构（含分支路径、汇聚点、规则）"""
    if not world_lines:
        return ""
    parts = []
    for wl in world_lines[:4]:
        if isinstance(wl, dict):
            name = wl.get("name", wl.get("id", ""))
            desc = str(wl.get("description", "")).strip()[:80]
            # 路径
            path = wl.get("path", [])
            path_strs = []
            for p in sorted(path, key=lambda x: x.get("sequence", 0)):
                if isinstance(p, dict):
                    sid = p.get("scene_id", "")
                    pdesc = str(p.get("description", "")).strip()[:30]
                    path_strs.append(f"{sid}({pdesc})" if pdesc else sid)
            path_line = " → ".join(path_strs) if path_strs else ""
            # 条件
            conditions = wl.get("conditions", [])
            cond_str = ""
            if isinstance(conditions, list) and conditions:
                cond_str = "；".join(
                    str(c.get("value", c))[:30] for c in conditions[:2]
                )
            # 后果
            consequences = str(wl.get("consequences", "")).strip()[:80]
            # 结局
            end_ending = wl.get("end结局", wl.get("end_ending", ""))

            line = f"● {name}"
            if desc:
                line += f" — {desc}"
            if path_line:
                line += f"\n  路径：{path_line}"
            if cond_str:
                line += f"\n  触发条件：{cond_str}"
            if consequences:
                line += f"\n  后果：{consequences}"
            if end_ending:
                line += f"\n  结局：{end_ending}"
            parts.append(line)

    # 汇聚点
    if convergence_points:
        conv_strs = []
        for cp in convergence_points[:3]:
            if isinstance(cp, dict):
                sid = cp.get("scene_id", "")
                desc = str(cp.get("description", "")).strip()[:50]
                conv_strs.append(f"{sid}: {desc}" if desc else sid)
        if conv_strs:
            parts.append("\n【汇聚点】" + "；".join(conv_strs))

    # 规则
    if rules:
        rule_strs = []
        for r in rules[:4]:
            if isinstance(r, dict):
                rname = r.get("name", r.get("rule_id", ""))
                rdesc = str(r.get("description", "")).strip()[:60]
                cond = str(r.get("condition", "")).strip()[:40]
                effect = str(r.get("effect", "")).strip()[:40]
                rule_strs.append(f"{rname}: {rdesc}（条件：{cond} → {effect}）")
        if rule_strs:
            parts.append("\n【世界线规则】" + "\n  " + "\n  ".join(rule_strs))

    return "\n\n".join(parts)


def _extract_script_choices(scene: dict, key_choices: list) -> list[dict]:
    """从场景数据中提取剧本定义的选项（非 LLM 生成）
    
    优先级（key_choices 含最完整数据，优先查找）：
    1. critical_choice → key_choices/choices[].options（含 consequences/unlock_conditions）
    2. interactions[].options[]
    3. 顶层 choices
    """
    raw = []
    # 1. 优先通过 critical_choice 从 key_choices 匹配
    cid = scene.get("critical_choice", "")
    if cid:
        for kc in (key_choices if isinstance(key_choices, list) else []):
            if isinstance(kc, dict) and kc.get("id") == cid:
                raw = kc.get("options", [])
                break
    # 2. interactions[].options[]
    if not raw:
        for interaction in (scene.get("interactions", []) or []):
            if isinstance(interaction, dict):
                opts = interaction.get("options", [])
                if opts and isinstance(opts, list):
                    raw = raw + opts
    # 3. 顶层 choices
    if not raw:
        raw = scene.get("choices", [])
    
    result = []
    for c in (raw if isinstance(raw, list) else []):
        if isinstance(c, dict):
            consequences = c.get("consequences", {})
            if isinstance(consequences, dict):
                effect = consequences.get("immediate", consequences.get("delayed", ""))
            else:
                effect = str(consequences) if consequences else ""
            result.append({
                "text": c.get("text", ""),
                "effect": effect or c.get("description", ""),
            })
    return result


def _format_scene_details(scene: dict, key_choices: list = None) -> str:
    """格式化当前场景的详细信息（叙事笔记、互动、关键选择）"""
    if not scene:
        return ""
    parts = []

    # 氛围
    atmosphere = str(scene.get("atmosphere", "")).strip()
    if atmosphere:
        parts.append(f"氛围：{atmosphere}")

    # 叙事笔记（导演指导）
    notes = str(scene.get("narrative_notes", "")).strip()
    if notes:
        parts.append(f"叙事指导：{notes}")

    # 在场角色
    chars = scene.get("characters_present", [])
    if chars:
        parts.append(f"在场角色：{', '.join(str(c) for c in chars)}")

    # 互动
    interactions = scene.get("interactions", [])
    if isinstance(interactions, list) and interactions:
        for inter in interactions[:2]:
            if isinstance(inter, dict):
                itype = inter.get("type", "")
                idesc = str(inter.get("description", "")).strip()[:60]
                iprompt = str(inter.get("prompt", "")).strip()[:80]
                line = f"互动（{itype}）：{idesc}"
                if iprompt:
                    line += f"\n  提示：{iprompt}"
                # 互动选项
                iopts = inter.get("options", [])
                if isinstance(iopts, list) and iopts:
                    opt_strs = []
                    for o in iopts[:4]:
                        if isinstance(o, dict):
                            txt = str(o.get("text", "")).strip()[:30]
                            odesc = str(o.get("description", "")).strip()[:40]
                            opt_strs.append(f"「{txt}」{odesc}")
                    if opt_strs:
                        line += "\n  可选行动：" + "；".join(opt_strs)
                parts.append(line)

    # 分支点
    if scene.get("branching_point"):
        parts.append("⚠ 本场景是分支决策点，选择将影响后续走向")

    # 关联的关键选择
    critical_choice_id = scene.get("critical_choice")
    if critical_choice_id and key_choices:
        for kc in key_choices:
            if isinstance(kc, dict) and kc.get("id") == critical_choice_id:
                prompt = str(kc.get("prompt", "")).strip()
                if prompt:
                    parts.append(f"本场景关键抉择：{prompt}")
                break

    return "\n".join(parts)


# ═══════════════════════════════════════════════════════
# 角色 voice_tone / 关系 格式化（M8 + M12）
# ═══════════════════════════════════════════════════════

def _format_character_voice_tones(characters: list) -> str:
    """格式化角色的 speakingStyle / voice_tone 信息，供 LLM 和 TTS 参考。"""
    if not characters:
        return ""
    parts = []
    for c in characters:
        if not isinstance(c, dict):
            continue
        name = c.get("name", "")
        style = (
            c.get("speakingStyle", "")
            or c.get("speaking_style", "")
            or c.get("voice_tone", "")
        )
        if name and style:
            parts.append(f"{name}：{str(style).strip()}")
    return "\n".join(parts)


def _format_character_relationships_detail(characters: list) -> str:
    """将每个角色的 relationships 字段格式化为可读文本，注入到 prompt 中。
    与 _format_relationships（处理全局关系网络列表）互补：
    本函数处理的是角色卡内嵌的 per-character 关系描述。"""
    if not characters:
        return ""
    parts = []
    for c in characters:
        if not isinstance(c, dict):
            continue
        name = c.get("name", "")
        rels = c.get("relationships", "")
        if name and rels:
            parts.append(f"【{name}的角色关系】{str(rels).strip()}")
    return "\n".join(parts)


# ═══════════════════════════════════════════════════════
# Harness Input 构建（统一入口，消除 server.py / routes/story.py 重复）
# ═══════════════════════════════════════════════════════

def build_harness_input_from_story(
    story: dict,
    scene: dict,
    idx: int,
    player_choice: str = "",
    previous_data: dict | None = None,
) -> dict:
    """从剧本数据构建单个场景的 harness_input。

    统一了 server.py _build_scene_harness_input 和 routes/story.py api_play_scene 中的重复逻辑。
    """
    from generic_adapter import get_scene_characters, build_worldline, build_scene_text

    scene_id = scene.get("id", scene.get("scene_id", ""))
    characters = get_scene_characters(story, scene)
    worldline = build_worldline(story, idx)
    scene_text = build_scene_text(scene)
    current_stage = _get_current_stage(story.get("stages", []), scene_id)

    harness_input = {
        "currentScene": scene_text,
        "characters": characters,
        "worldline": worldline,
        "playerChoice": player_choice,
        "_worldbook": _extract_worldbook_rules(story.get("worldbook", "")),
        "_narrativeStyle": story.get("narrative_style", "") or "第二人称叙事",
        "_plotSummary": story.get("plot_summary", ""),
        "_coreConflict": story.get("core_conflict", ""),
        "_themes": _format_themes(story.get("themes", [])),
        "_relationshipNetwork": _format_relationships(story.get("character_relationships", [])),
        "_stagesOverview": _format_stages_overview(story.get("stages", [])),
        "_events": _format_events(story.get("events", [])),
        "_keyChoices": _format_key_choices(story.get("key_choices", [])),
        "_endings": _format_endings(story.get("endings", [])),
        "_sceneDetails": _format_scene_details(scene, story.get("key_choices", [])),
        "_worldlines": _format_worldlines(
            story.get("world_lines", []),
            story.get("convergence_points", []),
            story.get("worldline_rules", []),
        ),
        "_currentStageContext": _format_current_stage_context(current_stage),
        "_sceneBeats": _format_beats_for_scene(story.get("beats", []), scene_id),
        "_sceneHooks": _format_hooks_for_scene(story.get("hooks", []), scene_id),
        "_characterVoiceTones": _format_character_voice_tones(characters),
    }
    # M12: 将角色关系数据注入到角色信息中（补充全局关系网络）
    char_rels_detail = _format_character_relationships_detail(characters)
    if char_rels_detail:
        existing_rels = harness_input.get("_relationshipNetwork", "")
        if existing_rels:
            harness_input["_relationshipNetwork"] = existing_rels + "\n\n" + char_rels_detail
        else:
            harness_input["_relationshipNetwork"] = char_rels_detail
    # 当本场景有剧本选项时，标记跳过 Stage 4 的 LLM 生成
    _scene_script_choices = _extract_script_choices(scene, story.get("key_choices", []))
    if _scene_script_choices:
        harness_input["_hasScriptChoices"] = True
        harness_input["_scriptChoices"] = _scene_script_choices
    if previous_data:
        harness_input["previousContext"] = previous_data
    return harness_input
