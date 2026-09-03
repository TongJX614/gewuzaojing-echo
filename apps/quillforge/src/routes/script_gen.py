# -*- coding: utf-8 -*-
"""剧本生成路由：/api/generate-script"""

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from generic_adapter import GenericScriptAdapter
from script_generator import SAMPLES_DIR, generate_script
from script_registry import register_generated_script
from logger import get_logger

logger = get_logger("routes.script_gen")

router = APIRouter(tags=["script_gen"])


class GenerateScriptRequest(BaseModel):
    prompt: str


@router.post("/api/generate-script")
async def api_generate_script(body: GenerateScriptRequest):
    """AI 生成剧本（SSE 流式返回进度）"""
    user_prompt = body.prompt.strip()
    if not user_prompt:
        raise HTTPException(400, "请输入剧本描述")
    if len(user_prompt) > 150:
        raise HTTPException(400, f"描述不能超过150字（当前{len(user_prompt)}字）")

    def event_stream():
        for event in generate_script(user_prompt):
            evt_type = event.get("type", "progress")
            if evt_type == "done":
                script_id = event.get("script_id")
                script_path = event.get("path")
                try:
                    record = register_generated_script(
                        script_id,
                        script_path,
                        SAMPLES_DIR,
                    )
                    event = {
                        "type": "done",
                        "script_id": record.script_id,
                        "summary": record.summary,
                    }
                except Exception as error:
                    logger.warning(
                        "[script_gen] registry rejection: %s",
                        type(error).__name__,
                    )
                    err = json.dumps(
                        {
                            "type": "error",
                            "code": "SCRIPT_REGISTRATION_FAILED",
                            "message": "生成结果未通过世界书校验",
                        },
                        ensure_ascii=False,
                    )
                    yield f"event: error\ndata: {err}\n\n"
                    return
            payload = json.dumps(event, ensure_ascii=False)
            yield f"event: {evt_type}\ndata: {payload}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
