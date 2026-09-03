# -*- coding: utf-8 -*-
"""
QuillForge — 通用 FastAPI 后端
支持上传任意剧本文件，通用解析，交互式生成

状态机：
  IDLE → (generate) → GENERATED → (choose) → CHOSEN → (generate) → ...
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, 'buffer') and hasattr(sys.stdout.buffer, 'raw'):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    except Exception as e:
        # 此时 logger 尚未定义，不能用 logger.warning，否则 NameError 直接崩溃
        print(f"[server] stdout/stderr UTF-8 重编码失败: {e}", file=sys.__stderr__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parent))

from logger import get_logger
from config_manager import QuillForgeSettings, get_settings, validate_final_bind

logger = get_logger("server")
_STATIC_DIR = Path(__file__).resolve().parent / "static"


# ═══════════════════════════════════════════════════════
# FastAPI App factory
# ═══════════════════════════════════════════════════════

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded


def _configure_numba(settings: QuillForgeSettings) -> None:
    """Apply validated Numba options before any route imports rembg."""
    try:
        from numba import config as numba_config
    except ImportError:
        return
    numba_config.THREADING_LAYER = settings.numba_threading_layer
    numba_config.NUMBA_NUM_THREADS = settings.numba_num_threads


def create_app(settings: QuillForgeSettings) -> FastAPI:
    """Construct one application from one already validated settings object."""
    _configure_numba(settings)
    app = FastAPI(title="QuillForge API", version="3.0.0")
    app.state.settings = settings
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    api_key = settings.quillforge_api_key
    if api_key:
        from starlette.middleware.base import BaseHTTPMiddleware
        from starlette.requests import Request as StarletteRequest

        class APIKeyMiddleware(BaseHTTPMiddleware):
            """Authenticate API routes when a service key is configured."""

            async def dispatch(self, request: StarletteRequest, call_next):
                if (
                    request.url.path.startswith("/api/")
                    and request.headers.get("X-API-Key") != api_key
                ):
                    return JSONResponse(
                        status_code=401, content={"detail": "无效的 API Key"}
                    )
                return await call_next(request)

        app.add_middleware(APIKeyMiddleware)

    from routes import (
        assets_router,
        auto_run_router,
        debate_router,
        minigame_router,
        pages_router,
        script_gen_router,
        session_router,
        story_router,
        upload_router,
    )

    for router in (
        pages_router,
        script_gen_router,
        story_router,
        upload_router,
        auto_run_router,
        session_router,
        assets_router,
        debate_router,
        minigame_router,
    ):
        app.include_router(router)
    return app


_legacy_app: FastAPI | None = None


def __getattr__(name: str) -> object:
    """Lazily preserve the legacy server.app import."""

    global _legacy_app
    if name != "app":
        raise AttributeError(name)
    if _legacy_app is None:
        _legacy_app = create_app(get_settings())
    return _legacy_app


# ═══════════════════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════════════════

def main() -> None:
    import argparse
    import uvicorn

    settings = get_settings()

    parser = argparse.ArgumentParser(description="QuillForge Server")
    parser.add_argument("--host", default=settings.host)
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument("--api-key", nargs="?", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.api_key is not None:
        parser.error("--api-key 已停用；请在聚合根 .env 中配置连接")
    host, port = validate_final_bind(settings, args.host, args.port)
    app = create_app(settings)

    logger.info("服务地址: http://%s:%d", host, port)
    logger.info("API 文档: http://%s:%d/docs", host, port)

    # 后台预热 rembg 模型（避免首次生成立绘时卡顿）
    def _warmup_rembg():
        try:
            from image_gen import _get_rembg_session, _REMOVE_BG_ENABLED
            if _REMOVE_BG_ENABLED:
                logger.info("[warmup] 正在预加载 rembg (isnet-anime) 模型...")
                _get_rembg_session()
                logger.info("[warmup] rembg 模型预加载完成")
        except Exception as e:
            logger.info("[warmup] rembg 预加载跳过: %s", e)

    import threading
    threading.Thread(target=_warmup_rembg, daemon=True).start()

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
