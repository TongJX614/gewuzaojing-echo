# -*- coding: utf-8 -*-
"""
Harness Core — 薄编排器

这是整个 Harness 架构的核心。Harness 类只负责：
  1. 组装组件（SUT、Stages、Validator、Fallback、Observers）
  2. 驱动执行流程（Fixture setup → Stage 1-5 → Fallback → Fixture teardown）
  3. 重试循环编排
  4. 通知观察者

Harness 不包含任何业务逻辑：
  - 不调用 LLM（委托给 SUT）
  - 不渲染 Prompt（委托给 SUT）
  - 不验证内容（委托给 Validator）
  - 不生成保底对话（委托给 Fallback）
  - 不直接推送 SSE（委托给 Observer）
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Optional, Generator

_SRC_DIR = str(Path(__file__).resolve().parent.parent)
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from logger import get_logger
from config_manager import QuillForgeSettings
from schemas import (
    HarnessInput, HarnessOutput, AssembledContext,
    Dialogue, Choice, ValidationResult,
    HarnessState,
)
from validator import NarrativeValidator
from .sut import NarrativeSUT, load_config

logger = get_logger("harness.core")
from .stages.base import StageBase
from .stages.context_assembly import ContextAssemblyStage
from .stages.narrative import NarrativeStage
from .stages.dialogue import DialogueStage
from .stages.choices import ChoicesStage
from .stages.validation import ValidationStage
from .observer import HarnessObserver, LoggingObserver, SSEObserver, MetricsObserver
from .fixtures import PreparedContext, ContextFixture, PromptFixture
from .fallback import FallbackStrategy, DialogueFallback


class Harness:
    """
    Harness 编排器：只负责组装和驱动，不含业务逻辑。

    流程：
      1. Fixture setup → 准备 PreparedContext
      2. Stage 1: Context Assembly（无重试，无 SUT 调用）
      3. 重试循环 (max_retries):
         a. Stage 2: Narrative Anchoring → narration
         b. Stage 3: Dialogue Generation → dialogues
         c. Stage 4: Choice Branching → choices
         d. Stage 5: Validation Gate → validation result
         e. 验证通过 → break；失败 → on_retry
      4. Fallback 检查（对话不足时触发三层保底）
      5. 构建 HarnessOutput
      6. Fixture teardown
    """

    def __init__(
        self,
        config: dict,
        sut: NarrativeSUT,
        stages: dict[str, StageBase],
        fallback: FallbackStrategy,
        observers: list[HarnessObserver] | None = None,
    ):
        self.config = config
        self.sut = sut
        self.stages = stages
        self.fallback = fallback
        self.observers = observers or []

    def _notify(self, method_name: str, *args, **kwargs) -> None:
        """通知所有观察者"""
        for obs in self.observers:
            method = getattr(obs, method_name, None)
            if method:
                method(*args, **kwargs)

    @staticmethod
    def _prepare_input(input_data: dict | HarnessInput) -> tuple[HarnessInput, "ExtraContext"]:
        """提取额外上下文并构建 HarnessInput，返回类型化的 ExtraContext"""
        from extra_context import ExtraContext

        if isinstance(input_data, dict):
            extra = {k: v for k, v in input_data.items() if k.startswith("_")}
            harness_input = HarnessInput.from_dict(input_data)
        else:
            extra = {}
            harness_input = input_data

        # 覆盖模型配置
        if harness_input.options.model:
            sut = None  # 由调用方处理
        return harness_input, ExtraContext.from_dict(extra)

    def _build_prepared_context(
        self,
        harness_input: HarnessInput,
        extra: dict,
    ) -> PreparedContext:
        """Fixture: 准备上下文"""
        # ContextFixture: 构建 AssembledContext
        assembled = AssembledContext.from_input(harness_input)
        # PromptFixture: 渲染系统提示词
        rendered_sys_prompt = self.sut.render_system_prompt(extra, harness_input)
        return PreparedContext(
            assembled=assembled,
            rendered_system_prompt=rendered_sys_prompt,
            extra=extra,
        )

    def _apply_fallback(
        self,
        ctx: PreparedContext,
        harness_input: HarnessInput,
        narration: str,
        dialogues: list[Dialogue],
        choices: list[Choice],
        validation: Optional[ValidationResult],
        max_retries: int,
    ) -> tuple[list[Dialogue], ValidationResult]:
        """公共 Fallback 逻辑：对话不足时启用三层保底，返回修正后的 (dialogues, validation)。"""
        min_req = harness_input.options.dialogue_count_min
        if len(dialogues) >= min_req:
            return dialogues, validation

        logger.info("  [FALLBACK] 对话不足 (%d/%d)，启用保底生成...", len(dialogues), min_req)
        self._notify("on_fallback", {"reason": "dialogue_insufficient", "count": len(dialogues), "min": min_req})

        state = HarnessState(
            narration=narration,
            dialogues=dialogues,
            choices=choices,
            validation=validation,
        )
        fallback_dialogues = self.fallback.execute(ctx.assembled, self.sut, state, min_required=min_req)
        if len(fallback_dialogues) < min_req:
            fallback_dialogues = self.fallback.hardcode_fallback(ctx.assembled, min_req)
        if fallback_dialogues:
            dialogues = fallback_dialogues
            logger.info("  [FALLBACK] 保底生成 %d 轮对话", len(fallback_dialogues))

        validator = NarrativeValidator(
            ctx.assembled,
            min_dialogues=min_req,
            max_dialogues=harness_input.options.dialogue_count_max,
        )
        validation = validator.validate_all(narration, dialogues, choices, retry_count=max_retries + 1)
        return dialogues, validation

    def _build_output(
        self,
        ctx: PreparedContext,
        narration: str,
        dialogues: list[Dialogue],
        choices: list[Choice],
        validation: Optional[ValidationResult],
        start_time: float,
    ) -> HarnessOutput:
        """公共输出构建：组装 HarnessOutput。"""
        elapsed = int((time.time() - start_time) * 1000)
        worldline_state = {
            "currentNode": ctx.assembled.current_node,
            "nodeIndex": ctx.assembled.node_index,
            "totalNodes": ctx.assembled.total_nodes,
            "progress": round(ctx.assembled.worldline_progress, 2),
        }
        return HarnessOutput(
            success=validation.passed if validation else False,
            narration=narration,
            dialogues=dialogues,
            next_choices=choices,
            worldline_state=worldline_state,
            validation=validation or ValidationResult(passed=False, checks=[]),
            metadata={"generationTime": elapsed, "model": self.sut.llm.model},
        )

    def run(self, input_data: dict | HarnessInput) -> dict:
        """
        执行完整 Harness 流程（非流式），返回结果字典。
        返回格式与旧版兼容。
        """
        start_time = time.time()

        # ── 0. 准备输入 ──
        harness_input, extra = self._prepare_input(input_data)
        if harness_input.options.model:
            self.sut.llm.model = harness_input.options.model

        # ── 通知 observers: run start ──
        self._notify("on_run_start", harness_input)

        # ── 1. Fixture: 准备上下文 ──
        ctx = self._build_prepared_context(harness_input, extra)

        # ── 2. Stage 1: Context Assembly（已在 Fixture 中完成）──
        self._notify("on_stage_start", 1, "context_assembly")
        logger.info("[Stage 1/5] 上下文组装...")

        # ── 3. 重试循环: Stage 2-5 ──
        max_retries = (
            self.config.get("quillforge", {})
            .get("stages", {})
            .get("validationGate", {})
            .get("maxRetries", 2)
        )

        narration = ""
        dialogues: list[Dialogue] = []
        choices: list[Choice] = []
        validation: Optional[ValidationResult] = None

        narrative_stage: NarrativeStage = self.stages["narrative"]
        dialogue_stage: DialogueStage = self.stages["dialogue"]
        choices_stage: ChoicesStage = self.stages["choices"]
        validation_stage: ValidationStage = self.stages["validation"]

        for attempt in range(max_retries + 1):
            if attempt > 0:
                self._notify("on_retry", attempt)
                logger.info("  [RETRY] 重试第 %d 次...", attempt)

            # ── Stage 2: Narrative Anchoring ──
            self._notify("on_stage_start", 2, "narrative_anchoring")
            logger.info("[Stage 2/5] 叙事锚定 (attempt %d)...", attempt + 1)
            narration = narrative_stage.execute(ctx, self.sut, harness_input, extra)
            narration = NarrativeStage.truncate(narration, 250)
            self._notify("on_narration_complete", narration)
            self._notify("on_stage_complete", 2, narration)

            # ── Stage 3: Dialogue Generation ──
            self._notify("on_stage_start", 3, "dialogue_generation")
            logger.info("[Stage 3/5] 对话生成 (attempt %d)...", attempt + 1)
            dialogues = dialogue_stage.execute(ctx, self.sut, harness_input, extra, narration=narration)
            dialogues = dialogues[:15]  # 硬上限15轮
            self._notify("on_stage_complete", 3, dialogues)

            # ── Stage 4: Choice Branching ──
            self._notify("on_stage_start", 4, "choice_branching")
            choices = choices_stage.execute(ctx, self.sut, harness_input, extra, narration=narration, dialogues=dialogues)
            self._notify("on_choices", choices)
            self._notify("on_stage_complete", 4, choices)

            # ── Stage 5: Validation Gate ──
            self._notify("on_stage_start", 5, "validation_gate")
            logger.info("[Stage 5/5] 验证门控 (attempt %d)...", attempt + 1)
            validator = NarrativeValidator(
                ctx.assembled,
                min_dialogues=harness_input.options.dialogue_count_min,
                max_dialogues=harness_input.options.dialogue_count_max,
            )
            validation = validator.validate_all(narration, dialogues, choices, retry_count=attempt)
            self._notify("on_validation", validation)
            self._notify("on_stage_complete", 5, validation)

            if validation.passed:
                logger.info("  [OK] 验证通过")
                break
            else:
                failed = [c.name for c in validation.checks if not c.passed]
                logger.info("  [FAIL] 验证未通过: %s", failed)

        # ── 4. Fallback 检查 ──
        dialogues, validation = self._apply_fallback(
            ctx, harness_input, narration, dialogues, choices, validation, max_retries
        )

        # ── 5. 构建 HarnessOutput ──
        output = self._build_output(ctx, narration, dialogues, choices, validation, start_time)
        result = output.to_dict()
        self._notify("on_run_complete", result)
        elapsed = output.metadata["generationTime"]
        logger.info("Pipeline 完成 | 耗时: %dms | 验证: %s", elapsed, '通过' if output.success else '未通过')
        return result

    def run_stream(self, input_data: dict | HarnessInput) -> Generator[dict, None, None]:
        """
        流式 Harness 流程：逐阶段 yield 事件字典，供 SSE 推送。

        事件类型与旧版完全一致：
        stage / narration_delta / narration / dialogue / action / choices / retry / done / error
        """
        start_time = time.time()

        try:
            # ── 0. 准备输入 ──
            harness_input, extra = self._prepare_input(input_data)
            if harness_input.options.model:
                self.sut.llm.model = harness_input.options.model

            # ── 1. Fixture: 准备上下文 ──
            ctx = self._build_prepared_context(harness_input, extra)

            # ── 2. Stage 1: Context Assembly ──
            yield {"event": "stage", "stage": 1, "message": "正在组装上下文..."}
            logger.info("[Stream Stage 1/5] 上下文组装...")

            # ── 3. 重试循环: Stage 2-5 ──
            max_retries = (
                self.config.get("quillforge", {})
                .get("stages", {})
                .get("validationGate", {})
                .get("maxRetries", 2)
            )

            narration = ""
            dialogues: list[Dialogue] = []
            choices: list[Choice] = []
            validation: Optional[ValidationResult] = None

            narrative_stage: NarrativeStage = self.stages["narrative"]
            dialogue_stage: DialogueStage = self.stages["dialogue"]
            choices_stage: ChoicesStage = self.stages["choices"]

            for attempt in range(max_retries + 1):
                if attempt > 0:
                    yield {"event": "retry", "attempt": attempt, "max_retries": max_retries}
                    logger.info("  [Stream RETRY] 重试第 %d 次...", attempt)

                # ── Stage 2: Narrative Anchoring（逐字流式推送，硬截断≤250字）──
                yield {"event": "stage", "stage": 2, "message": "正在生成旁白..."}
                logger.info("[Stream Stage 2/5] 叙事锚定 (attempt %d)...", attempt + 1)
                yield {"event": "narration_start"}
                narration = ""
                _narr_stream = narrative_stage.execute_stream(ctx, self.sut, harness_input, extra)
                for evt in _narr_stream:
                    if evt.get("event") == "narration_delta":
                        narration += evt["delta"]
                        if len(narration) <= 250:
                            yield evt
                        else:
                            # 已达上限，立即终止 LLM 流，节省 tokens 和时间
                            _narr_stream.close()
                            break
                narration = NarrativeStage.truncate(narration, 250)
                yield {"event": "narration", "text": narration}

                # ── Stage 3: Dialogue Generation（流式：逐条推送）──
                yield {"event": "stage", "stage": 3, "message": "正在生成对话..."}
                logger.info("[Stream Stage 3/5] 对话生成 (attempt %d)...", attempt + 1)
                dialogues = []
                _action_count = 0
                _dlg_since_last_action = 0
                for item in dialogue_stage.execute_stream(ctx, self.sut, harness_input, extra, narration=narration):
                    if item["kind"] == "dialogue":
                        if len(dialogues) >= 15:
                            continue
                        d = item["dialogue"]
                        dialogues.append(d)
                        _dlg_since_last_action += 1
                        yield {"event": "dialogue", "speaker": d.speaker, "text": d.text, "emotion": d.emotion}
                    else:  # action 动作/心理旁白穿插
                        if _dlg_since_last_action >= 3:
                            _action_count += 1
                            _dlg_since_last_action = 0
                            yield {"event": "action", "subject": item["subject"], "text": item["text"]}

                # ── Stage 4: Choice Branching ──
                yield {"event": "stage", "stage": 4, "message": "正在生成选项..."}
                choices = choices_stage.execute(ctx, self.sut, harness_input, extra, narration=narration, dialogues=dialogues)
                yield {"event": "choices", "choices": [c.to_dict() for c in choices]}

                # ── Stage 5: Validation Gate ──
                yield {"event": "stage", "stage": 5, "message": "正在验证..."}
                logger.info("[Stream Stage 5/5] 验证门控 (attempt %d)...", attempt + 1)
                validator = NarrativeValidator(
                    ctx.assembled,
                    min_dialogues=harness_input.options.dialogue_count_min,
                    max_dialogues=harness_input.options.dialogue_count_max,
                )
                validation = validator.validate_all(narration, dialogues, choices, retry_count=attempt)

                if validation.passed:
                    logger.info("  [OK] 验证通过")
                    break
                else:
                    failed = [c.name for c in validation.checks if not c.passed]
                    logger.info("  [FAIL] 验证未通过: %s", failed)

            # ── 4. Fallback 检查 ──
            min_req = harness_input.options.dialogue_count_min
            if len(dialogues) < min_req:
                old_dialogues = dialogues
                dialogues, validation = self._apply_fallback(
                    ctx, harness_input, narration, dialogues, choices, validation, max_retries
                )
                # 流式下保底触发时重新推送全部内容
                if dialogues is not old_dialogues:
                    yield {"event": "retry", "attempt": max_retries + 1, "max_retries": max_retries}
                    yield {"event": "narration", "text": narration}
                    for d in dialogues:
                        yield {"event": "dialogue", "speaker": d.speaker, "text": d.text, "emotion": d.emotion}
                    yield {"event": "choices", "choices": [c.to_dict() for c in choices]}

            # ── 5. 构建 HarnessOutput ──
            output = self._build_output(ctx, narration, dialogues, choices, validation, start_time)
            result = output.to_dict()
            elapsed = output.metadata["generationTime"]
            logger.info("Stream Pipeline 完成 | 耗时: %dms | 验证: %s", elapsed, '通过' if output.success else '未通过')

            yield {
                "event": "done",
                "success": output.success,
                "validation": result.get("validation", {}),
                "elapsed_ms": elapsed,
                "result": result,
            }

        except Exception as e:
            yield {"event": "error", "message": str(e)}


# ═══════════════════════════════════════════════════════
# 工厂函数
# ═══════════════════════════════════════════════════════

def create_default_harness(
    config_path: Optional[str] = None,
    settings: Optional[QuillForgeSettings] = None,
) -> Harness:
    """
    工厂函数：用默认组件组装一个标准 Harness。

    Args:
        config_path: 配置文件路径（可选，默认加载 quillforge_config.yaml）

    Returns:
        组装好的 Harness 实例
    """
    if config_path:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
    else:
        config = load_config()

    # 1. 创建 SUT
    sut = NarrativeSUT(config, settings=settings)

    # 2. 创建 5 个 Stage
    stages = {
        "context_assembly": ContextAssemblyStage(),
        "narrative": NarrativeStage(),
        "dialogue": DialogueStage(),
        "choices": ChoicesStage(),
        "validation": ValidationStage(),
    }

    # 3. 创建 Fallback
    fallback = DialogueFallback()

    # 4. 创建默认 Observers（LoggingObserver + MetricsObserver）
    observers: list[HarnessObserver] = [
        LoggingObserver(),
        MetricsObserver(),
    ]

    # 5. 组装 Harness
    return Harness(
        config=config,
        sut=sut,
        stages=stages,
        fallback=fallback,
        observers=observers,
    )
