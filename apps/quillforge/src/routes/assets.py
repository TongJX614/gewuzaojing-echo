# -*- coding: utf-8 -*-
"""静态资源路由：/generated_images/*, /generated_audio/*"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from image_gen import IMAGES_DIR
from tts_gen import AUDIO_DIR

router = APIRouter(tags=["assets"])


@router.get("/generated_images/{path:path}", summary="读取生成的美术素材图片")
def serve_generated_image(path: str):
    base = IMAGES_DIR.resolve()
    file_path = (IMAGES_DIR / path).resolve()
    if base not in file_path.parents or not file_path.is_file():
        raise HTTPException(404, "图片不存在")
    return FileResponse(file_path, media_type="image/png",
                        headers={"Cache-Control": "no-cache"})


@router.get("/generated_audio/{path:path}", summary="读取生成的 TTS 语音音频")
def serve_generated_audio(path: str):
    """读取磁盘缓存中的 TTS 语音音频文件"""
    base = AUDIO_DIR.resolve()
    file_path = (AUDIO_DIR / path).resolve()
    if base not in file_path.parents or not file_path.is_file():
        raise HTTPException(404, "音频不存在")
    media_type = "audio/wav" if path.lower().endswith(".wav") else "audio/mpeg"
    return FileResponse(file_path, media_type=media_type,
                        headers={"Cache-Control": "no-cache"})
