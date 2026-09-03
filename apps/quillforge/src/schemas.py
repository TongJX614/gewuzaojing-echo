# -*- coding: utf-8 -*-
"""
Narrative Generation Harness — 数据模型定义
定义 Pipeline 所有阶段的输入/输出数据结构
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional


# ═══════════════════════════════════════════════════════
# 输入模型 (Input Schema)
# ═══════════════════════════════════════════════════════

@dataclass
class Character:
    """角色卡 — 完整字段"""
    name: str = ""
    role: str = ""
    personality: str = ""
    id: str = ""  # 角色ID（如 su_ran），用于 speaker 归一化
    speaking_style: str = ""
    background: str = ""
    motivation: str = ""
    secrets: str = ""
    relationships: str = ""
    appearance: str = ""
    arc: str = ""
    mood: str = ""

    def to_prompt_str(self) -> str:
        lines = [f"### {self.name}（{self.role}）"]
        lines.append(f"- 性格标签：{self.personality}")
        if self.speaking_style:
            lines.append(f"- 说话风格：{self.speaking_style}")
        if self.background:
            lines.append(f"- 背景故事：{self.background}")
        if self.motivation:
            lines.append(f"- 动机：{self.motivation}")
        if self.secrets:
            lines.append(f"- 秘密：{self.secrets}")
        if self.relationships:
            lines.append(f"- 关系：{self.relationships}")
        if self.appearance:
            lines.append(f"- 外貌：{self.appearance}")
        if self.arc:
            lines.append(f"- 成长弧线：{self.arc}")
        if self.mood:
            lines.append(f"- 当前情绪：{self.mood}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        d = {"name": self.name, "role": self.role, "personality": self.personality}
        if self.speaking_style:
            d["speakingStyle"] = self.speaking_style
        if self.background:
            d["background"] = self.background
        if self.motivation:
            d["motivation"] = self.motivation
        if self.secrets:
            d["secrets"] = self.secrets
        if self.relationships:
            d["relationships"] = self.relationships
        if self.appearance:
            d["appearance"] = self.appearance
        if self.arc:
            d["arc"] = self.arc
        if self.mood:
            d["mood"] = self.mood
        return d


@dataclass
class GenerationOptions:
    """生成选项"""
    dialogue_count_min: int = 3
    dialogue_count_max: int = 15
    narration_length: str = "medium"  # short | medium | long
    tone: str = ""  # 自动推断
    language: str = "zh-CN"
    model: str = ""  # 覆盖配置中的模型


@dataclass
class PreviousContext:
    """上一轮的完整输出（用于续写）"""
    narration: str = ""
    dialogues: list[dict] = field(default_factory=list)
    next_choices: list[dict] = field(default_factory=list)
    worldline_state: dict = field(default_factory=dict)


@dataclass
class HarnessInput:
    """Pipeline 完整输入"""
    current_scene: str = ""
    characters: list[Character] = field(default_factory=list)
    worldline: str = ""
    player_choice: str = ""
    previous_context: Optional[PreviousContext] = None
    options: GenerationOptions = field(default_factory=GenerationOptions)

    @classmethod
    def from_dict(cls, data: dict) -> HarnessInput:
        chars = [
            Character(
                name=c["name"],
                role=c["role"],
                personality=c["personality"],
                id=str(c.get("id", "") or "").strip(),
                speaking_style=c.get("speakingStyle", ""),
                background=c.get("background", ""),
                motivation=c.get("motivation", ""),
                secrets=c.get("secrets", ""),
                relationships=c.get("relationships", ""),
                appearance=c.get("appearance", ""),
                arc=c.get("arc", ""),
            )
            for c in data["characters"]
        ]
        opts = GenerationOptions()
        if "options" in data:
            o = data["options"]
            opts.narration_length = o.get("narrationLength", "medium")
            opts.tone = o.get("tone", "")
            opts.language = o.get("language", "zh-CN")
            opts.model = o.get("model", "")
            if "dialogueCount" in o:
                dc = o["dialogueCount"]
                if isinstance(dc, int):
                    opts.dialogue_count_min = max(3, dc - 1)
                    opts.dialogue_count_max = min(15, dc + 1)

        prev = None
        if "previousContext" in data and data["previousContext"]:
            p = data["previousContext"]
            prev = PreviousContext(
                narration=p.get("narration", ""),
                dialogues=p.get("dialogues", []),
                next_choices=p.get("nextChoices", []),
                worldline_state=p.get("worldlineState", {}),
            )

        return cls(
            current_scene=data["currentScene"],
            characters=chars,
            worldline=data["worldline"],
            player_choice=data.get("playerChoice", ""),
            previous_context=prev,
            options=opts,
        )


# ═══════════════════════════════════════════════════════
# 中间模型 (Stage 1 输出)
# ═══════════════════════════════════════════════════════

@dataclass
class AssembledContext:
    """Stage 1 输出：组装后的场景上下文"""
    current_node: str = ""
    node_index: int = 0
    total_nodes: int = 0
    previous_node: str = ""
    next_node: str = ""
    worldline_progress: float = 0.0
    scene_description: str = ""
    active_characters: list[Character] = field(default_factory=list)
    player_decision: str = ""
    tension: str = "medium"
    narrative_direction: str = ""
    raw_worldline: str = ""
    annotated_worldline: str = ""  # 标注当前位置的世界线（供 prompt 使用）
    nodes: list[str] = field(default_factory=list)

    @classmethod
    def from_input(cls, inp: HarnessInput) -> AssembledContext:
        # 解析世界线，检测【】标记的当前位置
        raw_nodes = [n.strip() for n in inp.worldline.replace("→", "->").split("->")]
        total = len(raw_nodes)
        marked_idx = -1
        nodes = []
        for i, n in enumerate(raw_nodes):
            if n.startswith("【") and n.endswith("】"):
                nodes.append(n[1:-1])
                marked_idx = i
            else:
                nodes.append(n)

        # 优先使用【】标记位置，否则用关键词匹配
        if marked_idx >= 0:
            current_idx = marked_idx
        else:
            current_idx = _find_current_node(nodes, inp.current_scene, inp.previous_context)

        prev_node = nodes[current_idx - 1] if current_idx > 0 else ""
        next_node = nodes[current_idx + 1] if current_idx < total - 1 else ""
        progress = current_idx / max(total - 1, 1)

        # 推断紧张度（通用冲突/危机关键词，不绑定特定题材）
        _tension_keywords = [
            "危机", "危险", "攻击", "爆炸", "追逐", "战斗", "冲突",
            "紧急", "恐惧", "威胁", "对抗", "崩溃", "逃亡", "埋伏",
        ]
        tension = "high" if any(
            kw in inp.current_scene for kw in _tension_keywords
        ) else "medium"

        # 叙事方向
        if current_idx < total - 1:
            direction = f"当前「{nodes[current_idx]}」→ 朝向「{next_node}」推进"
        else:
            direction = f"已到达终局节点「{nodes[current_idx]}」"

        # 标注世界线：用 ✓ 标记已完成、【】标记当前、○ 标记未到
        annotated_parts = []
        for i, n in enumerate(nodes):
            if i < current_idx:
                annotated_parts.append(f"{n} ✓")
            elif i == current_idx:
                annotated_parts.append(f"【{n}】")
            else:
                annotated_parts.append(f"{n} ○")
        annotated_worldline = " → ".join(annotated_parts)

        return cls(
            current_node=nodes[current_idx],
            node_index=current_idx,
            total_nodes=total,
            previous_node=prev_node,
            next_node=next_node,
            worldline_progress=progress,
            scene_description=inp.current_scene,
            active_characters=inp.characters,
            player_decision=inp.player_choice,
            tension=tension,
            narrative_direction=direction,
            raw_worldline=inp.worldline,
            annotated_worldline=annotated_worldline,
            nodes=nodes,
        )


def _find_current_node(nodes: list[str], scene: str, prev_ctx: Optional[PreviousContext]) -> int:
    """根据场景描述和历史上下文判断当前世界线节点"""
    # 优先从 previousContext 的 worldlineState 推断
    if prev_ctx and prev_ctx.worldline_state:
        last_idx = prev_ctx.worldline_state.get("nodeIndex", -1)
        if last_idx >= 0:
            # 续写模式：从上一节点之后开始
            return min(last_idx + 1, len(nodes) - 1)

    # 第一优先：语义关键词匹配（通用紧张/危机/结局等强语义场景）
    crisis_keywords = [
        "危机", "危险", "遭遇", "攻击", "敌人", "灾难",
        "爆炸", "追逐", "战斗", "冲突", "对抗", "威胁",
    ]
    if any(kw in scene for kw in crisis_keywords):
        for i, node in enumerate(nodes):
            if any(kw in node for kw in ["危机", "冲突", "高潮", "对抗"]):
                return i
        # 没有明确的危机节点名，取倒数第二个节点
        return max(0, len(nodes) - 2)

    arrival_keywords = ["到达", "抵达", "终点", "胜利", "结局", "结束", "终章"]
    if any(kw in scene for kw in arrival_keywords):
        return len(nodes) - 1

    departure_keywords = ["出发", "启程", "离开", "开始", "开端", "序章"]
    if any(kw in scene for kw in departure_keywords):
        return 0

    # 第二优先：精确节点名匹配（排除过于宽泛的节点名）
    # 如果节点名在场景中出现，且该节点不是通用词（如"旅行"），则匹配
    broad_nodes = {"旅行", "发展", "过程", "中间"}
    for i, node in enumerate(nodes):
        if node in scene and node not in broad_nodes:
            return i

    # 第三优先：宽泛节点名匹配（仅在无其他匹配时）
    for i, node in enumerate(nodes):
        if node in scene:
            return i

    # 默认取中间节点
    return len(nodes) // 2


# ═══════════════════════════════════════════════════════
# 输出模型 (Final Output)
# ═══════════════════════════════════════════════════════

@dataclass
class Dialogue:
    """单条对话"""
    speaker: str = ""
    text: str = ""
    emotion: str = ""

    def to_dict(self) -> dict:
        d = {"speaker": self.speaker, "text": self.text}
        if self.emotion:
            d["emotion"] = self.emotion
        return d


@dataclass
class Choice:
    """后续选择"""
    text: str = ""
    effect: str = ""
    worldline_impact: str = "advance"

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "effect": self.effect,
            "worldlineImpact": self.worldline_impact,
        }


@dataclass
class MinigameSpec:
    """剧情内嵌小游戏声明（写在剧本选项的 minigame 字段上）。

    type: clue（线索指认）/ cipher（密码解密）/ sequence（时间线排序）/
          match（连线配对）/ classify（证物归类）/ unlock（逐步解锁）/
          voyage（巡航收集）；兼容别名 puzzle → cipher、dossier → sequence
    hint: 给生成器的创作提示（如“解密附件”）
    """
    type: str = ""
    hint: str = ""

    def to_dict(self) -> dict:
        return {"type": self.type, "hint": self.hint}

    @classmethod
    def from_dict(cls, data) -> "MinigameSpec":
        if not isinstance(data, dict):
            return cls()
        return cls(
            type=str(data.get("type", "")).strip(),
            hint=str(data.get("hint", "")).strip(),
        )


@dataclass
class ValidationCheck:
    """单项验证结果"""
    name: str = ""
    passed: bool = False
    severity: str = "high"  # critical | high | medium
    detail: str = ""
    score: float = 0.0


@dataclass
class ValidationResult:
    """完整验证结果"""
    passed: bool = False
    checks: list[ValidationCheck] = field(default_factory=list)
    retry_count: int = 0

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "checks": [
                {
                    "name": c.name,
                    "passed": c.passed,
                    "severity": c.severity,
                    **({"detail": c.detail} if c.detail else {}),
                    **({"score": c.score} if c.score else {}),
                }
                for c in self.checks
            ],
            "retryCount": self.retry_count,
        }


@dataclass
class HarnessOutput:
    """Pipeline 完整输出"""
    success: bool = False
    narration: str = ""
    dialogues: list[Dialogue] = field(default_factory=list)
    next_choices: list[Choice] = field(default_factory=list)
    worldline_state: dict = field(default_factory=dict)
    validation: ValidationResult = field(default_factory=ValidationResult)
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "data": {
                "narration": self.narration,
                "dialogues": [d.to_dict() for d in self.dialogues],
                "nextChoices": [c.to_dict() for c in self.next_choices],
                "worldlineState": self.worldline_state,
            },
            "validation": self.validation.to_dict(),
            "metadata": self.metadata,
        }


# ═══════════════════════════════════════════════════════
# Harness 架构新增模型
# ═══════════════════════════════════════════════════════

@dataclass
class StageResult:
    """单个阶段的执行结果"""
    stage_number: int = 0
    stage_name: str = ""
    success: bool = False
    data: Any = None
    elapsed_ms: int = 0


@dataclass
class HarnessState:
    """Harness 运行时状态（供 Fallback/Observer 查询）"""
    current_stage: int = 0
    attempt: int = 0
    narration: str = ""
    dialogues: list[Dialogue] = field(default_factory=list)
    choices: list[Choice] = field(default_factory=list)
    validation: Optional[ValidationResult] = None
