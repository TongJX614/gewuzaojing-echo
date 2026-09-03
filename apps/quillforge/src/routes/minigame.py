# -*- coding: utf-8 -*-
"""剧情小游戏路由

独立试玩：/api/minigame/generate、/api/minigame/answer
剧情内嵌：/api/session/{sid}/minigame/start | result | cancel
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from dependencies import sessions, uploaded_scripts
from logger import get_logger
from minigame_generator import VALID_KINDS, generate_minigame, judge_minigame, normalize_kind

logger = get_logger("routes.minigame")

router = APIRouter(tags=["minigame"])


class MinigameAnswerRequest(BaseModel):
    game_id: str
    # clue: 线索 id；cipher: 字符串；sequence/shuffle: id 顺序数组；
    # match/classify: {左/条目 id: 右/类别 id} 映射；voyage: 得分整数；
    # radio: 锁定频率浮点数；search: 圈选的物品 id 数组；
    # dial: 试拨密码字符串（按 A/B 反馈重试）；maze: {"reached": bool} 抵达上报；
    # unlock: 逐层 {"partial": True, "selection": 选项 id} 或完整选项 id 列表
    answer: object = None


class SessionMinigameStartRequest(BaseModel):
    choice_index: int


class SessionMinigameAnswerRequest(BaseModel):
    answer: object = None


@router.post("/api/minigame/generate", summary="生成剧情小游戏数据（独立试玩）")
def api_generate_minigame(script_id: str = "", kind: str = "clue") -> dict:
    """基于已上传剧本素材生成指定玩法的小游戏数据（GAME_DATA），前端直接渲染。

    kind 可选：clue（线索指认）/ cipher（密码解密）/ sequence（时间线排序）/
    match（连线配对）/ classify（证物归类）/ unlock（逐步解锁）/ voyage（巡航收集）/
    shuffle（碎纸复原）/ radio（频段截听）/ search（现场搜证）/
    dial（密码转盘）/ maze（档案室迷宫）。
    同步阻塞调用（LLM 耗时 10~60s），FastAPI 自动放入线程池执行。
    """
    if not script_id or script_id not in uploaded_scripts:
        raise HTTPException(400, "请先上传或选择剧本")
    if normalize_kind(kind) not in VALID_KINDS:
        raise HTTPException(400, f"未知玩法类型: {kind}（可选：{'/'.join(VALID_KINDS)}）")

    adapter = uploaded_scripts[script_id]["adapter"]
    try:
        game_data = generate_minigame(adapter, kind)
    except ValueError as e:
        logger.warning("[minigame] 生成失败: %s", e)
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("[minigame] 生成异常")
        raise HTTPException(500, f"小游戏生成失败: {e}")

    return {"success": True, "data": game_data}


@router.post("/api/minigame/answer", summary="判定小游戏作答结果（独立试玩）")
def api_answer_minigame(req: MinigameAnswerRequest) -> dict:
    """判定玩家作答（后端持有答案，不信前端）。一次性结算，game_id 用后即废。"""
    try:
        result = judge_minigame(req.game_id, req.answer)
    except KeyError as e:
        raise HTTPException(400, str(e))
    return {"success": True, **result}


# ═══════════════════════════════════════════════
# 剧情内嵌：会话级触发/结算/取消
# ═══════════════════════════════════════════════

@router.post("/api/session/{session_id}/minigame/start", summary="触发内嵌小游戏（GENERATED → MINIGAME）")
def api_session_minigame_start(session_id: str, req: SessionMinigameStartRequest) -> dict:
    """玩家点击带 minigame 声明的选项时调用；基于当前场景上下文生成小游戏内容。"""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    try:
        return session.start_minigame(req.choice_index)
    except Exception as e:
        logger.exception("[minigame] start 异常")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(500, f"小游戏生成失败: {e}")


@router.post("/api/session/{session_id}/minigame/result", summary="小游戏结算（MINIGAME → CHOSEN）")
def api_session_minigame_result(session_id: str, req: SessionMinigameAnswerRequest) -> dict:
    """后端判定成败，结果作为选择写入历史并推进场景；后续生成可感知成败。"""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    try:
        return session.resolve_minigame(req.answer)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.exception("[minigame] result 异常")
        raise HTTPException(500, f"小游戏结算失败: {e}")


@router.post("/api/session/{session_id}/minigame/cancel", summary="放弃小游戏（MINIGAME → GENERATED）")
def api_session_minigame_cancel(session_id: str) -> dict:
    """放弃当前小游戏，回到选项界面重新选择。"""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    return session.cancel_minigame()
