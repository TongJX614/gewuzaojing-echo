# -*- coding: utf-8 -*-
"""
System Under Test (SUT) — 被测系统的隔离封装

SUT = LLM 客户端 + Prompt 模板加载/渲染
Harness 编排器通过 SUT 接口调用 LLM，不直接接触 LLM 客户端或 Prompt 模板。
这样可以替换 SUT（如换 LLM 服务商、换 Prompt 策略）而不影响 Harness 编排逻辑。

LLM 客户端已统一至 llm_client.py，本模块仅保留：
  - load_config / load_prompt / render_template 函数
  - NarrativeSUT 类（Prompt 渲染 + LLM 调用委托）
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Generator

import yaml

# 确保 src/ 在 sys.path 中
_SRC_DIR = str(Path(__file__).resolve().parent.parent)
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from llm_client import LLMClient  # noqa: E402
from config_manager import QuillForgeSettings, get_settings  # noqa: E402

# 项目路径
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # quillforge/
PROMPTS_DIR = PROJECT_ROOT / "prompts"
CONFIG_DIR = PROJECT_ROOT / "config"


# ═══════════════════════════════════════════════════════
# 配置与 Prompt 加载（模块级函数）
# ═══════════════════════════════════════════════════════

def load_config() -> dict:
    """加载 quillforge_config.yaml"""
    config_path = CONFIG_DIR / "quillforge_config.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    return {}


def load_prompt(filename: str) -> str:
    """加载 Prompt 模板文件"""
    path = PROMPTS_DIR / filename
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def render_template(template: str, variables: dict) -> str:
    """
    简单的模板变量替换
    支持 {{variable}} 和 {{#if var}}...{{/if}} 和 {{#each arr}}...{{/each}}
    """
    result = template

    # 处理 {{#if var}}...{{#else}}...{{/if}}
    def replace_if(match):
        var_name = match.group(1).strip()
        then_block = match.group(2)
        else_block = match.group(3) if match.group(3) is not None else ""
        if variables.get(var_name):
            return then_block
        return else_block

    result = re.sub(
        r'\{\{#if\s+(\w+)\}\}(.*?)(?:\{\{#else\}\}(.*?))?\{\{/if\}\}',
        replace_if,
        result,
        flags=re.DOTALL,
    )

    # 处理 {{#each arr}}...{{/each}}
    def replace_each(match):
        var_name = match.group(1).strip()
        block = match.group(2)
        items = variables.get(var_name, [])
        parts = []
        for item in items:
            rendered = block
            # 统一转为 dict 处理，支持 dict / dataclass / 普通对象
            if isinstance(item, dict):
                item_dict = item
            elif hasattr(item, 'to_dict'):
                item_dict = item.to_dict()
            elif hasattr(item, '__dataclass_fields__'):
                item_dict = {k: getattr(item, k, '') for k in item.__dataclass_fields__}
            else:
                rendered = rendered.replace("{{this}}", str(item))
                parts.append(rendered)
                continue
            # 用 dict 的键值替换模板变量
            for k, v in item_dict.items():
                rendered = rendered.replace(f"{{{{this.{k}}}}}", str(v))
            # 清理空值行：删除只包含标签但值为空的行
            rendered = re.sub(r'(?m)^[\s]*[^{]*\{\{this\.\w+\}\}.*$', '', rendered)
            # 清理标签已替换但值为空的行（如 "  动机：\n" 或 "- 秘密：\n"）
            rendered = re.sub(r'(?m)^[\s]*[-•]?\s*[^：:\n]+[：:]\s*$', '', rendered)
            # 清理连续空行
            rendered = re.sub(r'\n{3,}', '\n\n', rendered)
            parts.append(rendered)
        return "\n".join(parts)

    result = re.sub(
        r'\{\{#each\s+(\w+)\}\}(.*?)\{\{/each\}\}',
        replace_each,
        result,
        flags=re.DOTALL,
    )

    # 处理简单变量 {{variable}}
    for key, value in variables.items():
        if isinstance(value, (str, int, float, bool)):
            result = result.replace(f"{{{{{key}}}}}", str(value))

    return result


# ═══════════════════════════════════════════════════════
# LLM 客户端（已迁移至 llm_client.py，此处保留向后兼容导入）
# ═══════════════════════════════════════════════════════
# from llm_client import LLMClient  — 已在文件顶部导入


# ═══════════════════════════════════════════════════════
# SUT — System Under Test
# ═══════════════════════════════════════════════════════

class NarrativeSUT:
    """
    System Under Test：封装 LLM 客户端 + Prompt 模板加载/渲染。

    Harness 编排器通过 SUT 接口调用 LLM，实现：
    - SUT 可替换（换 LLM 服务商、换 Prompt 策略）
    - Prompt 模板统一管理
    - 系统提示词渲染逻辑集中
    """

    def __init__(
        self,
        config: dict | None = None,
        settings: QuillForgeSettings | None = None,
    ):
        self.config = config or load_config()
        self.settings = settings or get_settings()
        llm_cfg = self.config.get("quillforge", {}).get("llm", {})
        # 超时优先读行为配置（llm.timeout，支持毫秒或秒），未配置时使用进程设置。
        cfg_timeout = llm_cfg.get("timeout")
        timeout_sec = self.settings.llm_timeout
        if cfg_timeout is not None:
            try:
                timeout_sec = float(cfg_timeout)
                if timeout_sec > 1000:  # 毫秒写法换算
                    timeout_sec /= 1000.0
            except (TypeError, ValueError):
                timeout_sec = self.settings.llm_timeout
        # 连接与模型只由进程级 Settings 拥有；YAML 仅保留行为参数。
        self.llm = LLMClient(
            connection=self.settings.connection,
            model=self.settings.runtime_model,
            temperature=llm_cfg.get("temperature", self.settings.llm_temperature),
            max_tokens=llm_cfg.get("maxTokens", self.settings.llm_max_tokens),
            timeout=timeout_sec,
            connect_timeout=self.settings.llm_connect_timeout,
            extra_body={"thinking": {"type": "disabled"}},
        )
        # 加载所有 Prompt 模板
        self.prompts = {
            "system": load_prompt("system_prompt_v2.md"),
            "system_dynamic": load_prompt("system_prompt_v2.md"),
            "narration": load_prompt("narration_v2.md"),
            "dialogue": load_prompt("dialogue_v2.md"),
            "choices": load_prompt("choices_v2.md"),
        }

    def render_template(self, template: str, variables: dict) -> str:
        """渲染 Prompt 模板"""
        return render_template(template, variables)

    def render_system_prompt(self, extra, harness_input) -> str:
        """构建系统提示词（融合世界书约束和叙事风格）
        
        extra 支持 dict（向后兼容）和 ExtraContext（类型安全）两种输入。
        """
        # 兼容 ExtraContext 对象
        if hasattr(extra, "to_prompt_variables"):
            sys_prompt_vars = {
                "narrativeStyle": extra.narrative_style or "第三人称叙事",
                "worldbookRules": extra.worldbook,
                "plotSummary": extra.plot_summary,
                "coreConflict": extra.core_conflict,
                "themes": extra.themes,
                "relationshipNetwork": extra.relationship_network,
                "sceneAtmosphere": (
                    extra.scene_atmosphere
                    or (extra.scene_details[:200] if extra.scene_details else "")
                ),
                "narrativeNotes": extra.narrative_notes,
                "emotionalArc": extra.emotional_arc,
                "minDialogues": harness_input.options.dialogue_count_min,
                "maxDialogues": harness_input.options.dialogue_count_max,
            }
        else:
            sys_prompt_vars = {
                "narrativeStyle": extra.get("_narrativeStyle", "第三人称叙事"),
                "worldbookRules": extra.get("_worldbook", ""),
                "plotSummary": extra.get("_plotSummary", ""),
                "coreConflict": extra.get("_coreConflict", ""),
                "themes": extra.get("_themes", ""),
                "relationshipNetwork": extra.get("_relationshipNetwork", ""),
                "sceneAtmosphere": (
                    extra.get("_sceneAtmosphere", "")
                    or extra.get("_sceneDetails", "")[:200]
                ),
                "narrativeNotes": extra.get("_narrativeNotes", ""),
                "emotionalArc": extra.get("_emotionalArc", ""),
                "minDialogues": harness_input.options.dialogue_count_min,
                "maxDialogues": harness_input.options.dialogue_count_max,
            }
        return render_template(self.prompts["system_dynamic"], sys_prompt_vars)

    # ── LLM 调用委托 ──

    def call(self, system: str, user: str, model: str = "") -> str:
        """调用 LLM 生成文本"""
        return self.llm.generate(system, user, model)

    def call_stream(self, system: str, user: str, model: str = "") -> Generator[str, None, None]:
        """调用 LLM 流式生成"""
        yield from self.llm.generate_stream(system, user, model)

    def call_json(self, system: str, user: str, model: str = "", _retries: int = 2) -> dict | list:
        """调用 LLM 并解析 JSON 输出"""
        return self.llm.generate_json(system, user, model, retries=_retries)

    def call_json_stream(self, system: str, user: str, model: str = ""):
        """调用 LLM 流式生成并增量解析 JSON 数组"""
        yield from self.llm.generate_json_stream(system, user, model)
