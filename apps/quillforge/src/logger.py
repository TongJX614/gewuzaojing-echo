# -*- coding: utf-8 -*-
"""
统一日志模块 — 替代散落在各文件中的裸 print()

使用方式：
    from logger import get_logger
    logger = get_logger(__name__)
    logger.info("Pipeline 完成 | 耗时: %dms", elapsed)

上下文注入（session_id 关联）：
    from logger import bind_context, clear_context
    bind_context(session_id="abc123")
    logger.info("这条日志会带上 session_id")
    clear_context()
"""

from __future__ import annotations

import logging
import sys
import threading

# ═══════════════════════════════════════════════════════
# 线程级上下文存储
# ═══════════════════════════════════════════════════════

_context = threading.local()


def bind_context(*, session_id: str | None = None) -> None:
    """将 session_id 绑定到当前线程的日志上下文。

    在异步入口（如 initialize/choose/后台预生成线程）调用，
    使后续所有 logger 输出自动携带 session_id 字段。
    """
    if session_id is not None:
        _context.session_id = session_id


def clear_context() -> None:
    """清除当前线程的日志上下文。"""
    _context.session_id = None


def get_context_session_id() -> str | None:
    """获取当前线程绑定的 session_id（未绑定返回 None）。"""
    return getattr(_context, "session_id", None)


# ═══════════════════════════════════════════════════════
# Context Filter — 将 session_id 注入 LogRecord
# ═══════════════════════════════════════════════════════

class SessionContextFilter(logging.Filter):
    """logging.Filter：从线程上下文中读取 session_id 并注入 LogRecord。

    注入后日志格式可通过 %(session_id)s 引用。
    未绑定时输出 '-' 占位，保持日志对齐。
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.session_id = getattr(_context, "session_id", None) or "-"  # type: ignore[attr-defined]
        return True


# ═══════════════════════════════════════════════════════
# 全局日志格式与工厂
# ═══════════════════════════════════════════════════════

_LOG_FORMAT = "[%(name)s] [sid:%(session_id)s] %(message)s"
_LOG_LEVEL = logging.INFO

# 全局共享的 filter 实例
_context_filter = SessionContextFilter()


def get_logger(name: str) -> logging.Logger:
    """获取命名 logger，已配置统一格式、级别和 session_id 上下文注入。"""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(_LOG_FORMAT))
        handler.addFilter(_context_filter)
        logger.addHandler(handler)
        logger.setLevel(_LOG_LEVEL)
        logger.propagate = False
    return logger
