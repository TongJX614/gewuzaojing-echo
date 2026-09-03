# -*- coding: utf-8 -*-
"""
统一 LLM 客户端 — 消除重复实现

将 sut.py、script_generator.py 等模块中各自独立的
OpenAI 客户端构建、LLM 调用、JSON 解析重试、流式 JSON 状态机统一为一个模块。

各模块通过不同参数实例化 LLMClient，保留各自的模型/温度/超时配置，
但共享底层的客户端构建、调用、解析逻辑。
"""

from __future__ import annotations

import json
import re
from typing import Generator

import httpx
from openai import OpenAI

from config_manager import OpenAICompatibleConnection

import logging
logger = logging.getLogger(__name__)

class LLMRequestError(RuntimeError):
    """Provider failure whose message never includes headers or response bodies."""


class LLMClient:
    """统一的 LLM 调用接口

    各模块按需配置参数实例化：
      - Harness 管线 (sut.py): model=配置文件模型, temperature=0.8, max_tokens=3000,
        timeout=90, extra_body={"thinking": {"type": "disabled"}}
      - 剧本生成 (script_generator.py): model=flash, temperature=0.85, max_tokens=8000, timeout=120
    """

    def __init__(
        self,
        connection: OpenAICompatibleConnection,
        model: str,
        *,
        temperature: float = 0.8,
        max_tokens: int = 3000,
        timeout: float = 90.0,
        connect_timeout: float = 10.0,
        extra_body: dict | None = None,
    ) -> None:
        self._connection = connection
        self._model = model
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.extra_body = extra_body

        self.client = OpenAI(
            api_key=connection.api_key,
            base_url=connection.base_url,
            timeout=httpx.Timeout(timeout, connect=connect_timeout),
        )

    def generate(self, system_prompt: str, user_prompt: str, model: str = "",
                 max_tokens: int | None = None, temperature: float | None = None) -> str:
        """调用 LLM 生成文本"""
        kwargs = {
            "model": model or self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature if temperature is not None else self.temperature,
            "max_tokens": max_tokens if max_tokens is not None else self.max_tokens,
        }
        if self.extra_body:
            kwargs["extra_body"] = {**self.extra_body}

        try:
            response = self.client.chat.completions.create(**kwargs)
        except Exception:
            raise LLMRequestError("LLM request failed") from None
        return response.choices[0].message.content or ""

    def generate_stream(self, system_prompt: str, user_prompt: str, model: str = "",
                        max_tokens: int | None = None, temperature: float | None = None):
        """调用 LLM 并以流式逐块 yield 输出文本"""
        kwargs = {
            "model": model or self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature if temperature is not None else self.temperature,
            "max_tokens": max_tokens if max_tokens is not None else self.max_tokens,
            "stream": True,
        }
        if self.extra_body:
            kwargs["extra_body"] = {**self.extra_body}

        try:
            stream = self.client.chat.completions.create(**kwargs)
            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta is not None and delta.content:
                    yield delta.content
        except Exception:
            raise LLMRequestError("LLM request failed") from None

    def generate_json(self, system_prompt: str, user_prompt: str, model: str = "",
                      retries: int = 2, max_tokens: int | None = None,
                      temperature: float | None = None,
                      expect_type: type = dict) -> dict | list:
        """调用 LLM 并解析 JSON 输出，失败自动重试。

        Args:
            expect_type: 期望的返回类型（dict 或 list），解析结果不匹配时抛 ValueError。
        """
        last_err = None
        for attempt in range(retries + 1):
            raw = self.generate(system_prompt, user_prompt, model,
                                max_tokens=max_tokens, temperature=temperature)
            # 尝试提取 JSON 块
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', raw)
            json_str = json_match.group(1).strip() if json_match else raw.strip()

            # 如果整体是数组或对象，直接解析
            try:
                result = json.loads(json_str)
                if isinstance(result, expect_type):
                    return result
                # 类型不匹配但可接受（dict/list 互转）
                if expect_type in (dict, list) and isinstance(result, (dict, list)):
                    return result
            except json.JSONDecodeError as e:
                logger.debug("[llm_client] JSON 整体解析失败，尝试括号截取: %s", e)
                # 尝试找第一个 [ 或 { 到最后一个 ] 或 }
                for start_char, end_char in [('[', ']'), ('{', '}')]:
                    start = json_str.find(start_char)
                    end = json_str.rfind(end_char)
                    if start != -1 and end != -1 and end > start:
                        try:
                            result = json.loads(json_str[start:end + 1])
                            if isinstance(result, expect_type):
                                return result
                        except json.JSONDecodeError:
                            logger.debug("[llm_client] 括号截取解析失败 [%d:%d]", start, end + 1)
                            continue
                last_err = raw[:500]
                if attempt < retries:
                    continue
        raise ValueError(f"无法解析 LLM 输出为 JSON (重试 {retries} 次):\n{last_err}")

    def generate_json_stream(self, system_prompt: str, user_prompt: str, model: str = "",
                             max_tokens: int | None = None, temperature: float | None = None):
        """流式调用 LLM，增量解析 JSON 数组并逐个 yield 其中的顶层对象。

        采用括号深度 + 字符串状态机扫描（游标只前进，整体 O(n)），
        兼容 ```json 代码块包裹、数组括号以及对象内嵌套/转义引号。
        优化：text 字段关闭后立即 yield（提前推送），无需等待 emotion 和 } 。
        """
        buf = ""
        pos = 0
        depth = 0
        in_string = False
        escape = False
        obj_start = -1
        early_sent = False

        for chunk in self.generate_stream(system_prompt, user_prompt, model,
                                          max_tokens=max_tokens, temperature=temperature):
            buf += chunk
            while pos < len(buf):
                ch = buf[pos]
                if in_string:
                    if escape:
                        escape = False
                    elif ch == "\\":
                        escape = True
                    elif ch == '"':
                        in_string = False
                        # 提前推送：text 字段值关闭时尝试提取
                        if depth == 1 and obj_start >= 0 and not early_sent:
                            partial = buf[obj_start:pos + 1]
                            if '"text"' in partial:
                                obj = self._extract_dialogue_early(partial)
                                if obj:
                                    yield obj
                                    early_sent = True
                else:
                    if ch == '"':
                        in_string = True
                    elif ch == "{":
                        if depth == 0:
                            obj_start = pos
                            early_sent = False
                        depth += 1
                    elif ch == "}":
                        if depth > 0:
                            depth -= 1
                            if depth == 0 and obj_start != -1:
                                if not early_sent:
                                    obj_str = buf[obj_start:pos + 1]
                                    try:
                                        yield json.loads(obj_str)
                                    except json.JSONDecodeError as e:
                                        logger.debug("[llm_client] 流式 JSON 对象解析失败 (pos=%d): %s", obj_start, e)
                                obj_start = -1
                                early_sent = False
                pos += 1

    @staticmethod
    def _json_unescape(s: str) -> str:
        r"""还原 JSON 字符串转义序列（\" \\ \n \uXXXX 等）"""
        if '\\' not in s:
            return s
        try:
            return json.loads(f'"{s}"')
        except (json.JSONDecodeError, ValueError):
            return s  # 转义解码失败时返回原文

    @staticmethod
    def _extract_dialogue_early(partial: str) -> dict | None:
        """从部分 JSON 对象中提前提取 speaker/text（text 字段完成即可返回）。
        支持对话 {"speaker":..., "emotion":..., "text":...}
        和动作 {"type":"action", "subject":..., "text":...}。"""
        _unesc = LLMClient._json_unescape
        # 动作旁白
        if re.search(r'"type"\s*:\s*"action"', partial):
            m_sub = re.search(r'"subject"\s*:\s*"((?:[^"\\]|\\.)*)"', partial)
            m_txt = re.search(r'"text"\s*:\s*"((?:[^"\\]|\\.)*)"', partial)
            if m_txt:
                return {
                    "type": "action",
                    "subject": _unesc(m_sub.group(1)) if m_sub else "",
                    "text": _unesc(m_txt.group(1)),
                }
            return None
        # 对话对象
        m_spk = re.search(r'"speaker"\s*:\s*"((?:[^"\\]|\\.)*)"', partial)
        m_txt = re.search(r'"text"\s*:\s*"((?:[^"\\]|\\.)*)"', partial)
        if m_spk and m_txt:
            m_emo = re.search(r'"emotion"\s*:\s*"((?:[^"\\]|\\.)*)"', partial)
            return {
                "speaker": _unesc(m_spk.group(1)),
                "text": _unesc(m_txt.group(1)),
                "emotion": _unesc(m_emo.group(1)) if m_emo else "",
            }
        return None

    @staticmethod
    def _build_speaker_map(characters):
        return [(c.get("name") or c.get("id")) for c in characters if isinstance(c, dict)]
