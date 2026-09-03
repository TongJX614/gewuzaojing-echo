# -*- coding: utf-8 -*-
"""轻量 API 路由：/api/story, /api/scene, /play"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from generic_adapter import load_story, get_scene_characters, build_worldline, build_scene_text
from formatters import (
    _extract_worldbook_rules, _get_current_stage, _format_current_stage_context,
    _format_beats_for_scene, _format_hooks_for_scene, _format_themes,
    _format_relationships, _format_stages_overview, _format_events,
    _format_key_choices, _format_endings, _format_worldlines,
    _extract_script_choices, _format_scene_details,
    build_harness_input_from_story,
)
from dependencies import get_harness, _loaded_stories

router = APIRouter(tags=["story"])

_WEB_PLAY_HTML_PATH = Path(__file__).resolve().parent.parent / "static" / "web_play.html"


class PlayRequest(BaseModel):
    storyPath: str
    sceneIndex: int
    playerChoice: Optional[str] = None
    previousDialogues: Optional[list[dict]] = None


@router.get("/play", summary="打开轻量版互动剧情 Web 界面")
async def web_play(
    path: str = Query("", description="剧本目录路径"),
) -> HTMLResponse:
    """返回轻量版互动剧情 HTML 页面（基于路径直接加载剧本）"""
    if not _WEB_PLAY_HTML_PATH.exists():
        raise HTTPException(404, "web_play.html 不存在")
    html = _WEB_PLAY_HTML_PATH.read_text(encoding="utf-8")
    html = html.replace("__DEFAULT_PATH__", path)
    return HTMLResponse(html)


@router.post("/api/story", summary="加载剧本数据")
async def api_load_story(body: dict) -> dict:
    """加载指定目录的剧本 YAML 数据（轻量 API，无需会话）"""
    path = body.get("path", "")
    if not path or not os.path.isdir(path):
        raise HTTPException(400, f"剧本目录不存在：{path}")
    story = load_story(path)
    _loaded_stories[path] = story
    return {
        "title": story["title"],
        "genre": story.get("genre", ""),
        "narrativeStyle": story.get("narrative_style", ""),
        "characters": story["characters"],
        "totalScenes": len(story["scenes"]),
        "scenes": [
            {
                "name": s.get("name", ""),
                "location": s.get("location", ""),
                "time": s.get("time", ""),
            }
            for s in story["scenes"]
        ],
        "worldLines": story.get("world_lines", []),
        "characterRelationships": story.get("character_relationships", []),
        "events": story.get("events", []),
        "endings": story.get("endings", []),
        "hasWorldbook": bool(story.get("worldbook", "")),
        "plotSummary": story.get("plot_summary", ""),
    }


@router.post("/api/scene", summary="生成/续写当前场景（轻量 API）")
async def api_play_scene(body: PlayRequest) -> dict:
    """根据剧本和玩家选择生成当前场景对话（无需会话，直接传入路径）"""
    path = body.storyPath
    story = _loaded_stories.get(path)
    if not story:
        story = load_story(path)
        _loaded_stories[path] = story

    scenes = story.get("scenes", [])
    idx = body.sceneIndex
    if idx < 0 or idx >= len(scenes):
        raise HTTPException(400, f"场景索引 {idx} 超出范围（共 {len(scenes)} 个场景）")

    scene = scenes[idx]
    harness_input = build_harness_input_from_story(
        story, scene, idx,
        player_choice=body.playerChoice or "",
        previous_data={"dialogues": body.previousDialogues} if body.previousDialogues else None,
    )

    h = get_harness()
    try:
        result = await asyncio.to_thread(h.run, harness_input)
        data = result.get("data", {})
        return {
            "narration": data.get("narration", ""),
            "dialogues": data.get("dialogues", []),
            "nextChoices": data.get("nextChoices", []),
            "_sceneName": scene.get("name", ""),
            "_location": scene.get("location", ""),
            "_time": scene.get("time", ""),
            "_choicePrompt": (
                scene.get("interactions", [{}])[0].get("prompt", "请选择你的行动")
                if scene.get("interactions") else "请选择你的行动"
            ),
        }
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:
        raise HTTPException(503, f"AI 服务调用失败: {e}")
