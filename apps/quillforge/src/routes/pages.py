# -*- coding: utf-8 -*-
"""静态页面路由：/, /game"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(tags=["pages"])

_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@router.get("/")
def index():
    html_path = _STATIC_DIR / "index.html"
    if html_path.exists():
        return FileResponse(html_path, headers={"Cache-Control": "no-cache"})
    return {"message": "QuillForge API v3.0 - Visit /docs"}


@router.get("/game", summary="游戏页面（VN Galgame 引擎）")
def game_page():
    """返回 VN Galgame 游戏页面（打字机/立绘/TTS/结局），从首页跳转进入"""
    html_path = _STATIC_DIR / "game.html"
    if html_path.exists():
        return FileResponse(html_path, headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "game.html 不存在")


@router.get("/debate", summary="辩论小游戏页面（言弹击破玩法）")
def debate_page():
    """返回言弹辩论小游戏页面。

    页面凭 sessionStorage 中小游戏页写入的一次性凭证（debate_ctx）调用
    /api/debate/generate；凭证读后即删，刷新页面将重定向回首页。
    """
    html_path = _STATIC_DIR / "debate.html"
    if html_path.exists():
        return FileResponse(html_path, headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "debate.html 不存在")


@router.get("/minigame", summary="小游戏页（言弹辩驳 + 线索/解密/排序/连线/归类/解锁/巡航）")
def minigame_page():
    """返回小游戏页（言弹辩驳与剧情小游戏选单）。

    页面凭 sessionStorage 中首页写入的一次性凭证（minigame_ctx）调用
    /api/minigame/generate；凭证读后即删，刷新页面将重定向回首页。
    """
    html_path = _STATIC_DIR / "minigame.html"
    if html_path.exists():
        return FileResponse(html_path, headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "minigame.html 不存在")
