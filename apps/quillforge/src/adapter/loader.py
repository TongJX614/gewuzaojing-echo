# -*- coding: utf-8 -*-
"""
adapter.loader — 剧本加载与场景工具函数

从 generic_adapter.py 提取的模块级函数：
  load_story / get_scene_characters / build_worldline / build_scene_text
  以及内部辅助 _load_yaml / _find_yaml / _find_file / _format_character_for_prompt
"""

from __future__ import annotations

import os
import re
import yaml
from typing import Optional

from .normalizer import fill_character_gaps


# ═══════════════════════════════════════════════════════
# 内部辅助
# ═══════════════════════════════════════════════════════

def _load_yaml(path: str) -> dict | list:
    """加载单个 YAML 文件"""
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _find_yaml(directory: str, keyword: str) -> Optional[str]:
    """在目录树中按关键词查找 YAML 文件"""
    for root, dirs, files in os.walk(directory):
        for f in files:
            if f.endswith((".yaml", ".yml")) and keyword in f:
                return os.path.join(root, f)
    return None


def _find_file(directory: str, keyword: str, ext: str = "") -> Optional[str]:
    """在目录树中按关键词查找指定类型文件"""
    for root, dirs, files in os.walk(directory):
        for f in files:
            if keyword in f and (not ext or f.endswith(ext)):
                return os.path.join(root, f)
    return None


def _format_character_for_prompt(c: dict) -> dict:
    """将原始 YAML 角色数据格式化为 prompt 可用的字符串字段。
    委托给 GenericScriptAdapter._normalize_character 的相同逻辑，
    确保 auto_run 路径与 session 路径角色数据格式统一。"""
    from .parser import GenericScriptAdapter
    _adapter = GenericScriptAdapter.__new__(GenericScriptAdapter)
    return _adapter._normalize_character(c)


# ═══════════════════════════════════════════════════════
# 公共 API
# ═══════════════════════════════════════════════════════

def load_story(path: str) -> dict:
    """
    从剧本目录加载所有数据（兼容 harness/story_loader.load_story）。
    返回结构化剧本字典，包含全部剧本信息。
    """
    story: dict = {
        "title": "",
        "characters": [],
        "scenes": [],
        "stages": [],
        "world_lines": [],
        "convergence_points": [],
        "worldline_rules": [],
        "key_choices": [],
        "narrative_style": "",
        "genre": "",
        "worldbook": "",
        "character_relationships": [],
        "events": [],
        "endings": [],
        "plot_summary": "",
        "core_conflict": "",
        "themes": [],
        "beats": [],
        "hooks": [],
    }

    # 元数据
    meta_file = _find_yaml(path, "元数据")
    if meta_file:
        meta = _load_yaml(meta_file)
        story["title"] = meta.get("title", "未命名剧本")
        story["narrative_style"] = str(meta.get("narrative_style", "")).strip()
        story["genre"] = meta.get("genre", "")

    # 角色
    char_file = _find_yaml(path, "主要角色") or _find_yaml(path, "角色")
    if char_file:
        data = _load_yaml(char_file)
        for c in data.get("characters", []):
            personality = str(c.get("personality", "")).strip()
            if "\n" in personality:
                tags = re.findall(r'[-•]\s*([^：:\n]+)[：:]?', personality)
                personality = "、".join(t.strip() for t in tags[:4]) if tags else personality[:80]

            speaking_style = str(c.get("voice_tone", c.get("speaking_style", ""))).strip()
            if "\n" in speaking_style:
                speaking_style = speaking_style.split("\n")[0][:80]

            backstory = str(c.get("backstory", c.get("background", ""))).strip()
            if len(backstory) > 150:
                backstory = backstory[:150] + "…"

            motivation = str(c.get("motivation", "")).strip()
            if "\n" in motivation:
                lines = [l.strip().lstrip("- ") for l in motivation.split("\n") if l.strip()][:2]
                motivation = "；".join(lines)
            if len(motivation) > 100:
                motivation = motivation[:100] + "…"

            secrets_raw = c.get("secrets", [])
            if isinstance(secrets_raw, list):
                secrets = "；".join(str(s).strip() for s in secrets_raw[:3])
            else:
                secrets = str(secrets_raw).strip()
            if len(secrets) > 120:
                secrets = secrets[:120] + "…"

            rels_raw = c.get("relationships", [])
            relationships = []
            if isinstance(rels_raw, list):
                for r in rels_raw[:4]:
                    if isinstance(r, dict):
                        relationships.append(
                            f"{r.get('target', '')}（{r.get('type', '')}）：{r.get('description', '')}"
                        )
                    elif isinstance(r, str):
                        relationships.append(r)
            rel_str = "；".join(relationships) if relationships else ""
            if len(rel_str) > 150:
                rel_str = rel_str[:150] + "…"

            appearance = str(c.get("appearance", "")).strip()
            if "\n" in appearance:
                appearance = "；".join(l.strip() for l in appearance.split("\n") if l.strip())
            if len(appearance) > 120:
                appearance = appearance[:120] + "…"

            arc = str(c.get("arc", "")).strip()
            if "\n" in arc:
                lines = [l.strip() for l in arc.split("\n") if l.strip()]
                arc = " → ".join(lines[:3])
            if len(arc) > 100:
                arc = arc[:100] + "…"

            story["characters"].append({
                "id": c.get("id", c.get("name", "")),
                "name": c.get("name", ""),
                "role": c.get("role", "") + (f"，{c.get('occupation', '')}" if c.get("occupation") else ""),
                "personality": personality if personality else "未定义",
                "speakingStyle": speaking_style,
                "background": backstory,
                "motivation": motivation,
                "secrets": secrets,
                "relationships": rel_str,
                "appearance": appearance,
                "arc": arc,
            })

    # 场景
    scene_file = _find_yaml(path, "场景清单") or _find_yaml(path, "场景")
    if scene_file:
        data = _load_yaml(scene_file)
        story["scenes"] = data.get("scenes", [])

    # 主线阶段
    plot_file = _find_yaml(path, "主线剧情") or _find_yaml(path, "主线")
    if plot_file:
        plot = _load_yaml(plot_file).get("main_plot", {})
        story["stages"] = plot.get("stages", [])

    # 世界线
    wl_file = _find_yaml(path, "世界线")
    if wl_file:
        wl_data = _load_yaml(wl_file)
        story["world_lines"] = wl_data.get("world_lines", [])
        story["convergence_points"] = wl_data.get("convergence_points", [])
        story["worldline_rules"] = wl_data.get("rules", [])

    # 关键选择
    choice_file = _find_yaml(path, "关键选择")
    if choice_file:
        story["key_choices"] = _load_yaml(choice_file).get("choices", [])

    # 角色关系
    rel_file = _find_yaml(path, "角色关系")
    if rel_file:
        rel_data = _load_yaml(rel_file)
        story["character_relationships"] = rel_data.get("relationships", [])

    # 事件清单
    event_file = _find_yaml(path, "事件清单")
    if event_file:
        story["events"] = _load_yaml(event_file).get("events", [])

    # 结局系统
    ending_file = _find_yaml(path, "结局")
    if ending_file:
        story["endings"] = _load_yaml(ending_file).get("endings", [])

    # 世界书（Markdown）
    wb_file = _find_file(path, "世界书", ".md")
    if wb_file:
        with open(wb_file, "r", encoding="utf-8") as f:
            story["worldbook"] = f.read()

    # 主线剧情扩展：summary + core_conflict + themes + beats + hooks
    if plot_file:
        plot = _load_yaml(plot_file).get("main_plot", {})
        story["plot_summary"] = str(plot.get("summary", "")).strip()
        story["core_conflict"] = str(plot.get("core_conflict", "")).strip()
        story["themes"] = plot.get("themes", [])
        story["beats"] = plot.get("beats", [])
        story["hooks"] = plot.get("hooks", [])

    # 角色缺失字段降级推断
    fill_character_gaps(story["characters"])

    return story


def get_scene_characters(story: dict, scene: dict) -> list[dict]:
    """获取当前场景在场角色的角色卡列表（已格式化为 prompt 可用字段）"""
    present = scene.get("characters_present", [])
    char_map = {c.get("id", ""): c for c in story["characters"]}
    name_map = {c.get("name", ""): c for c in story["characters"]}
    result = []
    for ref in present:
        raw = None
        if ref in char_map:
            raw = char_map[ref]
        elif ref in name_map:
            raw = name_map[ref]
        if raw:
            result.append(_format_character_for_prompt(raw))
    if not result:
        result = [_format_character_for_prompt(c) for c in story["characters"][:2]]
    return result


def build_worldline(story: dict, scene_index: int) -> str:
    """根据主线阶段构建世界线字符串，标注当前节点"""
    stages = story.get("stages", [])
    if not stages:
        return f"第{scene_index + 1}幕"
    names = [s.get("name", "") for s in stages]
    current = min(scene_index, len(names) - 1)
    return "→".join(f"{'【' + n + '】' if i == current else n}" for i, n in enumerate(names))


def build_scene_text(scene: dict) -> str:
    """将场景字典格式化为场景描述文本"""
    parts = []
    if scene.get("name"):
        parts.append(f"【场景：{scene['name']}】")
    for key in ("location", "time", "atmosphere"):
        if scene.get(key):
            parts.append(f"{key}：{scene[key]}")
    parts.append("")
    desc = scene.get("description", "")
    parts.append(str(desc).strip() if desc else "")
    return "\n".join(parts)
