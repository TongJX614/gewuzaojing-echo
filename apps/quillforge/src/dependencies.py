# -*- coding: utf-8 -*-
"""
依赖注入 / 单例管理 — 从 server.py 提取

管理 Harness、ImageGenerator、TTSGenerator 的懒加载单例，
以及会话存储（sessions、uploaded_scripts）。
会话使用 TTLCache 自动过期（默认 30 分钟）。
"""

from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
from typing import Optional

from cachetools import TTLCache

from quillforge import Harness, create_default_harness
from image_gen import ImageGenerator, configure_image_settings
from tts_gen import TTSGenerator
from session_manager import GameSession
from logger import get_logger
from config_manager import get_settings
from script_registry import registered_scripts

logger = get_logger("dependencies")

settings = get_settings()
configure_image_settings(settings)
SESSION_TTL = settings.session_ttl_seconds


# ── 会话存储（TTL 自动过期，惰性创建避免导入期时钟残留）──
sessions: TTLCache


def _ensure_session_stores() -> None:
    """首次访问时创建会话缓存，保证 TTL 时钟从服务真正启动时开始。"""
    global sessions
    try:
        if sessions.ttl <= 0:
            raise ValueError
    except (AttributeError, NameError, ValueError):
        sessions = TTLCache(maxsize=settings.session_max_size, ttl=SESSION_TTL)


_ensure_session_stores()
uploaded_scripts = registered_scripts
_loaded_stories: dict[str, dict] = {}  # path -> story data (轻量 API 缓存)


@dataclass(frozen=True)
class StartReceipt:
    idempotency_key: str
    script_id: str
    response: dict[str, object]


start_receipts: dict[str, StartReceipt] = {}
start_receipt_lock = RLock()

# ── 单例 ──
_harness: Optional[Harness] = None
_image_generator: Optional[ImageGenerator] = None
_tts_generator: Optional[TTSGenerator] = None


def get_harness() -> Harness:
    global _harness
    if _harness is None:
        _harness = create_default_harness(settings=settings)
    return _harness


def get_image_generator() -> ImageGenerator:
    """生图器单例（未配置 IMAGE_API_KEY 时 enabled=False，调用方回退占位图）"""
    global _image_generator
    if _image_generator is None:
        _image_generator = ImageGenerator(settings)
    return _image_generator


def get_tts_generator() -> TTSGenerator:
    """TTS 语音合成器单例（未配置 TTS_API_KEY 时 enabled=False，回退纯文字模式）"""
    global _tts_generator
    if _tts_generator is None:
        _tts_generator = TTSGenerator(settings)
    return _tts_generator
