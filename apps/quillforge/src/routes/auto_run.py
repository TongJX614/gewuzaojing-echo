# -*- coding: utf-8 -*-
"""一键运行路由：/api/auto-run, /api/auto-run/stream"""

from __future__ import annotations

import json
import time
import asyncio
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from generic_adapter import load_story
from formatters import _extract_script_choices, build_harness_input_from_story
from dependencies import get_harness

router = APIRouter(tags=["auto-run"])
limiter = Limiter(key_func=get_remote_address)


class AutoRunRequest(BaseModel):
    path: str
    max_scenes: Optional[int] = None
    start_scene: Optional[int] = 0


def _build_scene_harness_input(story: dict, scene: dict, idx: int, previous_data: dict | None = None) -> dict:
    """构建单个场景的 harness_input（供 auto_run 和 auto_run_stream 共用）"""
    return build_harness_input_from_story(story, scene, idx, "", previous_data)


@router.post("/api/auto-run", summary="一键运行：加载剧本文件夹并自动生成全部场景")
@limiter.limit("10/minute")
async def auto_run(request: Request, req: AutoRunRequest) -> dict:
    """
    给定文件夹路径，自动完成：加载剧本 → 逐场景生成对话 → 返回完整结果。
    无需手动调用 /api/start → /generate → /choose 等步骤。
    """
    folder = Path(req.path)
    if not folder.exists():
        raise HTTPException(404, f"路径不存在：{req.path}")
    if not folder.is_dir():
        raise HTTPException(400, f"路径不是文件夹：{req.path}")

    story = load_story(str(folder))
    scenes = story.get("scenes", [])
    if not scenes:
        raise HTTPException(400, "剧本中没有找到场景数据")

    start = req.start_scene or 0
    if start < 0:
        raise HTTPException(400, f"start_scene({start}) 不能为负数")
    if req.max_scenes is not None and req.max_scenes < 1:
        raise HTTPException(400, f"max_scenes({req.max_scenes}) 必须为正整数")
    end = min(req.max_scenes + start, len(scenes)) if req.max_scenes else len(scenes)
    if start >= len(scenes):
        raise HTTPException(400, f"start_scene({start}) 超出范围（共 {len(scenes)} 个场景）")

    h = get_harness()
    results = []
    previous_data = None

    for idx in range(start, end):
        scene = scenes[idx]
        harness_input = _build_scene_harness_input(story, scene, idx, previous_data)

        try:
            result = await asyncio.to_thread(h.run, harness_input)
            data = result.get("data", {})
            script_choices = _extract_script_choices(scene, story.get("key_choices", []))
            results.append({
                "scene_index": idx,
                "scene_name": scene.get("name", f"场景 {idx + 1}"),
                "location": scene.get("location", ""),
                "success": result.get("success", False),
                "narration": data.get("narration", ""),
                "dialogues": data.get("dialogues", []),
                "nextChoices": script_choices if script_choices else data.get("nextChoices", []),
                "validation": result.get("validation", {}),
            })
            previous_data = data
        except Exception as e:
            results.append({
                "scene_index": idx,
                "scene_name": scene.get("name", f"场景 {idx + 1}"),
                "success": False,
                "error": str(e),
            })
            break

    ending_result = None
    if results and results[-1].get("success"):
        last = results[-1]
        endings_data = story.get("endings", [])
        all_endings = []
        if endings_data and isinstance(endings_data, list):
            for e in endings_data:
                if isinstance(e, dict):
                    all_endings.append({
                        "title": e.get("title", ""),
                        "type": e.get("type", ""),
                        "narrative": e.get("narrative", ""),
                        "epilogue": e.get("epilogue", ""),
                        "replay_value": e.get("replay_value", ""),
                    })
        ending_result = {
            "narration": last.get("narration", ""),
            "dialogues": last.get("dialogues", []),
            "all_endings": all_endings,
        }

    return {
        "title": story.get("title", ""),
        "total_scenes": len(scenes),
        "generated_scenes": len(results),
        "scene_range": [start, end - 1],
        "results": results,
        "ending": ending_result,
    }


@router.post("/api/auto-run/stream", summary="流式一键运行：SSE 逐场景推送生成结果")
@limiter.limit("10/minute")
async def auto_run_stream(request: Request, req: AutoRunRequest):
    """
    SSE 流式版本的 auto-run。
    每个场景生成完毕后立刻推送给前端，无需等待全部场景完成。
    """
    folder = Path(req.path)
    if not folder.exists():
        raise HTTPException(404, f"路径不存在：{req.path}")
    if not folder.is_dir():
        raise HTTPException(400, f"路径不是文件夹：{req.path}")

    story = load_story(str(folder))
    scenes = story.get("scenes", [])
    if not scenes:
        raise HTTPException(400, "剧本中没有找到场景数据")

    start = req.start_scene or 0
    if start < 0:
        raise HTTPException(400, f"start_scene({start}) 不能为负数")
    if req.max_scenes is not None and req.max_scenes < 1:
        raise HTTPException(400, f"max_scenes({req.max_scenes}) 必须为正整数")
    end = min(req.max_scenes + start, len(scenes)) if req.max_scenes else len(scenes)
    if start >= len(scenes):
        raise HTTPException(400, f"start_scene({start}) 超出范围（共 {len(scenes)} 个场景）")

    def event_stream():
        h = get_harness()
        previous_data = None
        generated = 0
        t0 = time.time()

        start_payload = json.dumps({
            "title": story.get("title", ""),
            "total_scenes": len(scenes),
            "scene_range": [start, end - 1],
        }, ensure_ascii=False)
        yield f"event: start\ndata: {start_payload}\n\n"

        for idx in range(start, end):
            scene = scenes[idx]
            harness_input = _build_scene_harness_input(story, scene, idx, previous_data)

            try:
                result = h.run(harness_input)
                data = result.get("data", {})
                script_choices = _extract_script_choices(scene, story.get("key_choices", []))

                scene_result = {
                    "scene_index": idx,
                    "scene_name": scene.get("name", f"场景 {idx + 1}"),
                    "location": scene.get("location", ""),
                    "success": result.get("success", False),
                    "narration": data.get("narration", ""),
                    "dialogues": data.get("dialogues", []),
                    "nextChoices": script_choices if script_choices else data.get("nextChoices", []),
                    "validation": result.get("validation", {}),
                    "elapsed_ms": int((time.time() - t0) * 1000),
                }
                previous_data = data
                generated += 1

                scene_json = json.dumps(scene_result, ensure_ascii=False)
                yield f"event: scene\ndata: {scene_json}\n\n"

                if idx == end - 1 and result.get("success"):
                    endings_data = story.get("endings", [])
                    all_endings = []
                    if endings_data and isinstance(endings_data, list):
                        for e in endings_data:
                            if isinstance(e, dict):
                                all_endings.append({
                                    "title": e.get("title", ""),
                                    "type": e.get("type", ""),
                                    "narrative": e.get("narrative", ""),
                                    "epilogue": e.get("epilogue", ""),
                                    "replay_value": e.get("replay_value", ""),
                                })
                    ending_payload = json.dumps({
                        "narration": data.get("narration", ""),
                        "dialogues": data.get("dialogues", []),
                        "all_endings": all_endings,
                    }, ensure_ascii=False)
                    yield f"event: ending\ndata: {ending_payload}\n\n"

            except Exception as e:
                err_payload = json.dumps({
                    "scene_index": idx,
                    "scene_name": scene.get("name", f"场景 {idx + 1}"),
                    "message": str(e),
                }, ensure_ascii=False)
                yield f"event: error\ndata: {err_payload}\n\n"
                break

        done_payload = json.dumps({
            "generated_scenes": generated,
            "total_time_ms": int((time.time() - t0) * 1000),
        }, ensure_ascii=False)
        yield f"event: done\ndata: {done_payload}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
