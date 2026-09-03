# -*- coding: utf-8 -*-
"""辩论小游戏路由：/api/debate/generate"""

from fastapi import APIRouter, HTTPException

from debate_generator import generate_debate
from dependencies import uploaded_scripts
from logger import get_logger

logger = get_logger("routes.debate")

router = APIRouter(tags=["debate"])


@router.post("/api/debate/generate", summary="生成言弹辩论小游戏数据")
def api_generate_debate(script_id: str = "") -> dict:
    """基于已上传剧本的主题描述生成辩论数据（GAME_DATA），前端直接渲染。

    同步阻塞调用（LLM 耗时 10~60s），FastAPI 自动放入线程池执行。
    """
    if not script_id or script_id not in uploaded_scripts:
        raise HTTPException(400, "请先上传或选择剧本")

    adapter = uploaded_scripts[script_id]["adapter"]
    try:
        game_data = generate_debate(adapter)
    except ValueError as e:
        logger.warning("[debate] 生成失败: %s", e)
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("[debate] 生成异常")
        raise HTTPException(500, f"辩论生成失败: {e}")

    return {"success": True, "data": game_data}
