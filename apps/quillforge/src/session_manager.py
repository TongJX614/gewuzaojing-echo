# -*- coding: utf-8 -*-
"""
会话管理 — 从 server.py 提取

包含 GameSession 类、SessionState 枚举、ChoiceRequest 模型、PlayerState 状态追踪。
"""

from __future__ import annotations

import re
import threading
import uuid
from collections import defaultdict
from enum import Enum
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel

from generic_adapter import GenericScriptAdapter
from logger import get_logger
from minigame_generator import (
    VALID_KINDS, generate_minigame, judge_minigame, normalize_kind,
    inject_choice_minigames,
)
from quillforge import Harness

logger = get_logger(__name__)


class SessionState(str, Enum):
    IDLE = "idle"
    GENERATED = "generated"
    MINIGAME = "minigame"
    CHOSEN = "chosen"
    FINISHED = "finished"


class ChoiceRequest(BaseModel):
    choice_text: str
    choice_index: int


class PlayerState:
    """玩家状态追踪：累计选择带来的属性/关系/性格变化。

    数据来源：剧本 key_choices.yaml 中每个选项的 consequences 字段：
      - stats_changes: {"courage": +3, "mental_stability": -2}
      - relationship_changes: [{"character": "lin_xiao", "change": +1, "reason": "..."}]
      - personality_impact: "展现你果断、直觉驱动的一面"
    """

    def __init__(self):
        self.stats: dict[str, int] = defaultdict(int)
        self.relationships: dict[str, int] = defaultdict(int)  # char_id → 累计好感
        self.relationship_reasons: dict[str, list[str]] = defaultdict(list)
        self.personality_traits: list[str] = []  # 累积的性格标签

    def apply_consequences(self, cons_data: dict, option_data: dict = None) -> None:
        """从选项的 consequences 字典和选项顶层字段中提取并应用状态变化。

        YAML 结构：
          option:
            consequences:
              immediate: "..."
              delayed: "..."
              stats_changes: {courage: +3}
            personality_impact: "..."       ← 选项级别
            relationship_changes: [...]     ← 选项级别
        """
        if not isinstance(cons_data, dict):
            cons_data = {}
        option_data = option_data or {}

        # 1. 属性变化（在 consequences.stats_changes 中）
        stats_changes = cons_data.get("stats_changes", {})
        if isinstance(stats_changes, dict):
            for stat, delta in stats_changes.items():
                try:
                    self.stats[stat] += int(delta)
                except (ValueError, TypeError) as e:
                    logger.debug("[session] 属性值转换失败 stat=%s delta=%s: %s", stat, delta, e)

        # 2. 关系变化 —— 合并选项顶层和 consequences 内两个来源，而非覆盖
        #    若同一角色在两处都有变更，取总和
        rel_from_option = option_data.get("relationship_changes", []) or []
        rel_from_cons = cons_data.get("relationship_changes", []) or []
        # 按角色汇总两个来源的 change 值
        merged_rel: dict[str, dict] = {}  # char -> {"change": int, "reasons": list[str]}
        for src in (rel_from_cons, rel_from_option):  # cons 先入，option 后叠加
            if not isinstance(src, list):
                continue
            for rc in src:
                if not isinstance(rc, dict):
                    continue
                char = rc.get("character", "")
                change = rc.get("change", 0)
                reason = rc.get("reason", "")
                if not char:
                    continue
                if char not in merged_rel:
                    merged_rel[char] = {"change": 0, "reasons": []}
                try:
                    merged_rel[char]["change"] += int(change)
                except (ValueError, TypeError) as e:
                    logger.debug("[session] 关系值转换失败 char=%s change=%s: %s", char, change, e)
                if reason:
                    merged_rel[char]["reasons"].append(reason)
        # 应用到玩家状态
        for char, info in merged_rel.items():
            self.relationships[char] += info["change"]
            for reason in info["reasons"]:
                self.relationship_reasons[char].append(reason)

        # 3. 性格影响（在选项顶层 personality_impact 中）
        personality = option_data.get("personality_impact", "")
        if not personality:
            personality = cons_data.get("personality_impact", "")
        if personality and personality not in self.personality_traits:
            self.personality_traits.append(personality)

    def format_for_prompt(self) -> str:
        """格式化为 prompt 可用的结构化文本。"""
        parts = []

        # 属性状态
        if self.stats:
            stat_lines = []
            for stat, val in sorted(self.stats.items(), key=lambda x: -abs(x[1])):
                direction = "↑" if val > 0 else "↓"
                stat_lines.append(f"  - {stat}: {val:+d} {direction}")
            parts.append("【玩家属性变化】\n" + "\n".join(stat_lines))

        # 关系状态
        if self.relationships:
            rel_lines = []
            for char, val in sorted(self.relationships.items(), key=lambda x: -abs(x[1])):
                if val > 0:
                    desc = f"好感+{val}"
                elif val < 0:
                    desc = f"疏远{val}"
                else:
                    desc = "中立"
                reasons = self.relationship_reasons.get(char, [])
                reason_str = f"（{'；'.join(reasons[-2:])}）" if reasons else ""
                rel_lines.append(f"  - 对{char}：{desc}{reason_str}")
            parts.append("【角色关系变化】\n" + "\n".join(rel_lines))

        # 性格画像
        if self.personality_traits:
            parts.append("【玩家行为倾向】\n" + "\n".join(
                f"  - {t}" for t in self.personality_traits
            ))

        if not parts:
            return ""

        return (
            "以下是玩家此前选择累积的量化影响，生成内容必须体现这些状态：\n"
            + "\n".join(parts)
        )


class GameSession:
    """游戏会话"""

    def __init__(self, adapter: GenericScriptAdapter, worldline_id: str = "main"):
        self.session_id = str(uuid.uuid4())[:8]
        self.adapter = adapter
        self.state = SessionState.IDLE
        self.current_scene_index = 0
        self.history: list[dict] = []
        self.previous_result: Optional[dict] = None
        self.current_result: Optional[dict] = None
        self.player_state = PlayerState()
        # 内嵌小游戏待定数据：{choice_index, chosen, game_id, kind}，仅 MINIGAME 状态非空
        self.pending_minigame: Optional[dict] = None
        # 当前场景随机注入的小游戏声明 {选项下标: minigame dict}；场景推进时重置
        self._injected_minigames: Optional[dict] = None
        # 上一场景实际玩过的玩法 kind（注入时避免连续重复）
        self.last_minigame_kind: str = ""
        # 会话级互斥锁：FastAPI 同步路由在线程池中并发执行，
        # 防止同一会话的 generate/choose 并发交错破坏状态
        self._lock = threading.RLock()

    @property
    def total_scenes(self) -> int:
        # 严格以场景列表为准；空剧本返回 0，
        # 避免回退到 worldline_nodes 导致越界场景生成引发 500
        return len(self.adapter.scenes) if self.adapter.scenes else 0

    @property
    def progress(self) -> float:
        total = self.total_scenes
        return self.current_scene_index / total if total > 0 else 1.0

    def generate(self, harness: Harness) -> dict:
        with self._lock:
            return self._generate_locked(harness)

    def _generate_locked(self, harness: Harness) -> dict:
        if self.state == SessionState.GENERATED:
            raise HTTPException(400, "当前场景已生成，请先做出选择后才能继续")
        if self.state == SessionState.MINIGAME:
            raise HTTPException(400, "小游戏进行中，请先完成或取消小游戏")
        if self.state == SessionState.FINISHED:
            raise HTTPException(400, "故事已结束")

        if self.current_scene_index >= self.total_scenes:
            raise HTTPException(400, "没有更多场景")

        # 新场景生成：重置上一场景的随机注入记录
        self._injected_minigames = None

        player_choice = ""
        if self.history:
            player_choice = self.history[-1].get("player_choice", "")

        harness_input = self.adapter.build_harness_input(
            self.current_scene_index,
            player_choice=player_choice,
            previous_context=self.previous_result.get("data") if self.previous_result else None,
            choice_history=self.history or None,
            player_state=self.player_state.format_for_prompt() or None,
        )

        result = harness.run(harness_input)
        self.current_result = result
        self.state = SessionState.GENERATED

        scene = self.adapter.scenes[self.current_scene_index] if self.current_scene_index < len(self.adapter.scenes) else {}
        script_choices = self.adapter.get_scene_choices(self.current_scene_index, choice_history=self.history or None)

        # 空选项兜底：剧本与 LLM 都无选项时插入默认推进项，
        # 避免玩家卡在无选项场景（终局场景点击即直达结局）
        if not script_choices and not result.get("data", {}).get("nextChoices"):
            result["data"]["nextChoices"] = self._fallback_choices()

        return {
            **result,
            "scene_meta": {
                "scene_id": scene.get("id", ""),
                "scene_name": scene.get("name", f"场景 {self.current_scene_index + 1}"),
                "location": scene.get("location", ""),
                "scene_index": self.current_scene_index + 1,
                "total_scenes": self.total_scenes,
            },
            "available_choices": self._prepare_scene_choices(script_choices),
            "scene_assets": {
                "audio": getattr(self.adapter, "audio_assets", []),
                "visual_extra": getattr(self.adapter, "extra_visual_assets", []),
            },
            "session_state": self.state.value,
            "progress": round(self.progress, 2),
        }

    def generate_stream(self, harness: Harness):
        """流式生成：逐阶段 yield SSE 事件，完成后更新会话状态"""
        self._lock.acquire()
        try:
            yield from self._generate_stream_locked(harness)
        finally:
            # 客户端中途断开时生成器在任意线程被关闭，防御重复/跨线程释放
            try:
                self._lock.release()
            except RuntimeError:
                pass

    def _generate_stream_locked(self, harness: Harness):
        if self.state == SessionState.GENERATED:
            yield {"event": "error", "message": "当前场景已生成，请先做出选择后才能继续"}
            return
        if self.state == SessionState.MINIGAME:
            yield {"event": "error", "message": "小游戏进行中，请先完成或取消小游戏"}
            return
        if self.state == SessionState.FINISHED:
            yield {"event": "error", "message": "故事已结束"}
            return
        if self.current_scene_index >= self.total_scenes:
            yield {"event": "error", "message": "没有更多场景"}
            return

        # 新场景生成：重置上一场景的随机注入记录
        self._injected_minigames = None

        player_choice = ""
        if self.history:
            player_choice = self.history[-1].get("player_choice", "")

        harness_input = self.adapter.build_harness_input(
            self.current_scene_index,
            player_choice=player_choice,
            previous_context=self.previous_result.get("data") if self.previous_result else None,
            choice_history=self.history or None,
            player_state=self.player_state.format_for_prompt() or None,
        )

        scene = self.adapter.scenes[self.current_scene_index] if self.current_scene_index < len(self.adapter.scenes) else {}
        script_choices = self.adapter.get_scene_choices(self.current_scene_index, choice_history=self.history or None)

        def _meta_event() -> dict:
            return {
                "event": "meta",
                "scene_meta": {
                    "scene_id": scene.get("id", ""),
                    "scene_name": scene.get("name", f"场景 {self.current_scene_index + 1}"),
                    "location": scene.get("location", ""),
                    "scene_index": self.current_scene_index + 1,
                    "total_scenes": self.total_scenes,
                },
                "available_choices": self._prepare_scene_choices(script_choices),
                "session_state": self.state.value,
                "progress": round(self.progress, 2),
            }

        yield _meta_event()

        result = None
        for evt in harness.run_stream(harness_input):
            if evt.get("event") == "done":
                result = evt.get("result")
            elif (evt.get("event") == "choices" and not evt.get("choices")
                    and not script_choices):
                # 空选项兜底（流式）：同上，终局场景点击即直达结局
                evt = {**evt, "choices": self._fallback_choices()}
            yield evt

        if result:
            self.current_result = result
            self.state = SessionState.GENERATED

        yield _meta_event()

    def choose(self, choice_index: int, choice_text: str) -> dict:
        with self._lock:
            return self._choose_locked(choice_index, choice_text)

    def _fallback_choices(self) -> list[dict]:
        """无选项场景的默认推进项（终局场景直达结局，其余线性推进）"""
        if self.current_scene_index >= self.total_scenes - 1:
            return [{"id": "__finish__", "text": "读完最终章", "description": "查看结局",
                     "effect": "查看结局", "consequences": {}}]
        return [{"id": "__advance__", "text": "继续", "description": "推进剧情",
                 "effect": "推进剧情", "consequences": {}}]

    def _choose_locked(self, choice_index: int, choice_text: str) -> dict:
        if self.state != SessionState.GENERATED:
            raise HTTPException(400, f"当前状态为 {self.state.value}，无法做出选择")

        script_choices = self.adapter.get_scene_choices(self.current_scene_index, choice_history=self.history or None)

        chosen = {"text": choice_text, "id": str(choice_index), "description": ""}
        if 0 <= choice_index < len(script_choices):
            chosen = script_choices[choice_index]

        return self._apply_choice_locked(chosen)

    def _prepare_scene_choices(self, script_choices: list[dict]) -> list[dict]:
        """为当前场景的剧本选项随机注入小游戏声明（同一场景只掷一次骰子）。

        注入结果记录在 _injected_minigames，start_minigame 据此触发；
        返回带 minigame 标记的新列表供前端渲染徽章，不修改 adapter 原始数据。
        """
        if self._injected_minigames is None:
            prepared, injected = inject_choice_minigames(
                script_choices, last_kind=self.last_minigame_kind or None,
                scene_index=self.current_scene_index)
            self._injected_minigames = injected
            if injected:
                kinds = [injected[i].get("type") for i in sorted(injected)]
                logger.info("[session] 场景 %s 随机注入小游戏: %s",
                            self.current_scene_index, kinds)
            return prepared
        merged = []
        for i, c in enumerate(script_choices):
            decl = self._injected_minigames.get(i)
            if decl and not c.get("minigame"):
                c = {**c, "minigame": decl}
            merged.append(c)
        return merged

    def _apply_choice_locked(self, chosen: dict, consequences_override: str | None = None) -> dict:
        """已确认选项的公共后处理：应用后果、写入历史、推进场景。

        choose 与 resolve_minigame 共用；小游戏结算时通过
        consequences_override 用成败描述覆盖默认后果文本。
        调用前须已持有 self._lock。
        """
        scene = self.adapter.scenes[self.current_scene_index] if self.current_scene_index < len(self.adapter.scenes) else {}

        consequences = ""
        cons_data = chosen.get("consequences", {})
        if isinstance(cons_data, dict):
            consequences = cons_data.get("immediate", "") or cons_data.get("delayed", "")
            # 应用完整后果到玩家状态（含选项顶层的 relationship_changes/personality_impact）
            self.player_state.apply_consequences(cons_data, option_data=chosen)
        elif cons_data:
            consequences = str(cons_data)
        if consequences_override:
            consequences = consequences_override

        self.history.append({
            "scene_index": self.current_scene_index,
            "scene_id": scene.get("id", scene.get("scene_id", "")),
            "scene_name": scene.get("name", ""),
            "narration": self.current_result.get("data", {}).get("narration", "") if self.current_result else "",
            "dialogues": self.current_result.get("data", {}).get("dialogues", []) if self.current_result else [],
            "player_choice": chosen.get("text", ""),
            "option_id": chosen.get("id", ""),
            "consequences": consequences,
        })

        self.previous_result = self.current_result
        # 根据 trigger_conditions 确定下一场景索引，而非简单线性递增
        next_index = self._resolve_next_scene_index()
        logger.info(f"场景跳转: {self.current_scene_index} -> {next_index} (trigger_conditions)")
        self.current_scene_index = next_index
        # 场景已推进：作废上一场景的随机注入记录
        self._injected_minigames = None

        return self._finish_response(chosen)

    def _finish_response(self, chosen: dict) -> dict:
        """场景推进后的统一出口：越界即 FINISHED 并附带结局匹配。

        _apply_choice_locked 与 finish 共用；调用前须已持有 self._lock。
        """
        if self.current_scene_index >= self.total_scenes:
            self.state = SessionState.FINISHED
            last_result = self.current_result
            endings_data = self.adapter.raw_data.get("endings", [])
            matched_ending = self._match_ending(endings_data, self.history)
            self.current_result = None
            return {
                "chosen": chosen,
                "session_state": self.state.value,
                "progress": round(self.progress, 2),
                "message": "故事已结束",
                "ending": {
                    "narration": last_result.get("data", {}).get("narration", "") if last_result else "",
                    "dialogues": last_result.get("data", {}).get("dialogues", []) if last_result else [],
                    "matched_ending": matched_ending,
                },
            }
        else:
            self.state = SessionState.CHOSEN
            self.current_result = None

        return {
            "chosen": chosen,
            "session_state": self.state.value,
            "progress": round(self.progress, 2),
            "message": "选择已确认",
        }

    def finish(self) -> dict:
        """终局场景无选项时直接完稿：记录本场景并进入结局。

        终局场景（如结局演出场景）通常没有剧本选项，LLM 也可能返回空选项，
        此时前端无法调 choose，提供本接口保证故事总能走到结局。
        Raises:
            HTTPException: 状态非法或非终局场景（仍有后续场景时不允许跳过）
        """
        with self._lock:
            if self.state == SessionState.FINISHED:
                raise HTTPException(400, "故事已结束")
            if self.state != SessionState.GENERATED:
                raise HTTPException(400, f"当前状态为 {self.state.value}，无法完稿")
            if self.current_scene_index < self.total_scenes - 1:
                raise HTTPException(400, "尚有未完成的场景，请继续选择")

            scene = self.adapter.scenes[self.current_scene_index] if self.current_scene_index < len(self.adapter.scenes) else {}
            self.history.append({
                "scene_index": self.current_scene_index,
                "scene_id": scene.get("id", scene.get("scene_id", "")),
                "scene_name": scene.get("name", ""),
                "narration": self.current_result.get("data", {}).get("narration", "") if self.current_result else "",
                "dialogues": self.current_result.get("data", {}).get("dialogues", []) if self.current_result else [],
                "player_choice": "",
                "option_id": "",
                "consequences": "",
            })
            self.previous_result = self.current_result
            self.current_scene_index = self.total_scenes
            logger.info("终局场景无选项，直接完稿进入结局")
            return self._finish_response({"text": "", "id": "", "description": ""})

    # ═══════════════════════════════════════════════
    # 内嵌小游戏：选项声明 minigame 时触发，结果回写历史影响后续剧情
    # ═══════════════════════════════════════════════

    def start_minigame(self, choice_index: int) -> dict:
        """玩家点击带 minigame 声明的选项：生成小游戏内容，GENERATED → MINIGAME。

        Returns:
            前端可直接渲染的 GAME_DATA dict
        Raises:
            HTTPException: 状态非法、选项越界、选项未声明小游戏或生成失败
        """
        with self._lock:
            if self.state != SessionState.GENERATED:
                raise HTTPException(400, f"当前状态为 {self.state.value}，无法开始小游戏")

            script_choices = self.adapter.get_scene_choices(
                self.current_scene_index, choice_history=self.history or None)
            if not 0 <= choice_index < len(script_choices):
                raise HTTPException(400, "无效的选项")
            chosen = script_choices[choice_index]

            mg_decl = chosen.get("minigame") or {}
            kind = normalize_kind(mg_decl.get("type", "")) if isinstance(mg_decl, dict) else ""
            if kind not in VALID_KINDS:
                # 剧本未声明时回退到后端随机注入的声明
                injected_decl = (self._injected_minigames or {}).get(choice_index)
                if injected_decl:
                    chosen = {**chosen, "minigame": injected_decl}
                    mg_decl = injected_decl
                    kind = normalize_kind(mg_decl.get("type", ""))
            if kind not in VALID_KINDS:
                raise HTTPException(400, "该选项未配置小游戏（minigame 字段缺失或类型非法）")

            scene_context = self._build_minigame_context(chosen, mg_decl)
            try:
                game_data = generate_minigame(self.adapter, kind, scene_context=scene_context)
            except ValueError as e:
                raise HTTPException(400, str(e))

            self.pending_minigame = {
                "choice_index": choice_index,
                "chosen": chosen,
                "game_id": game_data.get("gameId", ""),
                "kind": kind,
            }
            self.state = SessionState.MINIGAME
            logger.info("[session] 小游戏开始: kind=%s game_id=%s", kind, self.pending_minigame["game_id"])
            return game_data

    def resolve_minigame(self, answer) -> dict:
        """玩家作答：后端判定成败。

        支持有限次重试：非终局结果（仍有重试机会）不推进剧情，保持 MINIGAME；
        终局成功/重试耗尽才作为选择写入历史并推进场景，MINIGAME → CHOSEN。

        Returns:
            终局：{success, successText, failureText, correctAnswer, final,
                  chosen, session_state, progress, message, [ending]}
            非终局：{success: False, final: False, attemptsLeft, revealHint,
                    failureText, session_state: "minigame"}
        """
        with self._lock:
            if self.state != SessionState.MINIGAME or not self.pending_minigame:
                raise HTTPException(400, f"当前状态为 {self.state.value}，无待结算的小游戏")

            try:
                result = judge_minigame(self.pending_minigame["game_id"], answer)
            except KeyError as e:
                raise HTTPException(400, str(e))

            # 非终局：仍有重试机会，不应用选择，继续小游戏
            if not result.get("final", True):
                logger.info("[session] 小游戏答错，剩余 %s 次机会", result.get("attemptsLeft"))
                return {**result, "session_state": self.state.value}

            chosen = dict(self.pending_minigame["chosen"])
            self.last_minigame_kind = self.pending_minigame.get("kind", "")
            self.pending_minigame = None

            suffix = "_mg_success" if result["success"] else "_mg_failure"
            chosen["id"] = f"{chosen.get('id', '')}{suffix}"
            consequences_text = result["successText"] if result["success"] else result["failureText"]

            apply_result = self._apply_choice_locked(chosen, consequences_override=consequences_text)
            logger.info("[session] 小游戏结算: success=%s -> state=%s",
                        result["success"], self.state.value)
            return {**result, **apply_result}

    def cancel_minigame(self) -> dict:
        """放弃小游戏，回到 GENERATED 状态重新选择（答案键留存服务端直至淘汰）"""
        with self._lock:
            if self.state != SessionState.MINIGAME:
                raise HTTPException(400, f"当前状态为 {self.state.value}，无进行中的小游戏")
            self.pending_minigame = None
            self.state = SessionState.GENERATED
            return {"ok": True, "session_state": self.state.value, "message": "已返回选项"}

    def _build_minigame_context(self, chosen: dict, mg_decl: dict) -> dict:
        """组装剧情内嵌模式的“已揭示视野”上下文（选项/旁白/对话/历史/登场角色/走过场景）。

        生成器据此只使用已揭示内容创作，不透出整本剧本的梗概与后续场景。
        """
        data = self.current_result.get("data", {}) if self.current_result else {}

        # 已登场角色：历史与本场景对话的说话人去重（按出现顺序）
        appeared: list[str] = []
        seen: set[str] = set()
        for dlg_source in ([h.get("dialogues") or [] for h in self.history]
                           + [data.get("dialogues") or []]):
            for d in dlg_source:
                if not isinstance(d, dict):
                    continue
                sp = str(d.get("speaker", "")).strip()
                if sp and sp not in seen:
                    seen.add(sp)
                    appeared.append(sp)

        # 走过的场景：按推进顺序去重 + 当前场景
        visited: list[str] = []
        for h in self.history:
            name = str(h.get("scene_name", "")).strip()
            if name and name not in visited:
                visited.append(name)
        scene = (self.adapter.scenes[self.current_scene_index]
                 if self.current_scene_index < len(self.adapter.scenes) else {})
        cur_name = str(scene.get("name", "")).strip()
        if cur_name and cur_name not in visited:
            visited.append(cur_name)

        return {
            "choice_text": chosen.get("text", ""),
            "hint": mg_decl.get("hint", "") if isinstance(mg_decl, dict) else "",
            "narration": data.get("narration", ""),
            "dialogues": data.get("dialogues", []),
            "appeared_characters": appeared,
            "visited_scenes": visited,
            "history": [
                {"scene_name": h.get("scene_name", ""), "player_choice": h.get("player_choice", "")}
                for h in self.history
            ],
        }

    def _resolve_next_scene_index(self) -> int:
        """根据当前场景的 trigger_conditions 和用户选择历史确定下一场景索引。

        支持的 trigger_conditions 格式：
          - {type: "game_start"}           → 仅首场景使用，不参与跳转
          - {type: "scene_completed", value: "scene_01"}  → 当 scene_01 已完成时触发
          - {type: "choice_made", value: "在scene_02选择调查"}  → 当玩家做过该选择时触发
          - {type: "scene_visited", value: "scene_03"}    → 当玩家访问过该场景时触发
          - {} / [] / 无条件               → 默认线性进入下一场景
        """
        current_idx = self.current_scene_index
        default_next = current_idx + 1
        scenes = self.adapter.scenes
        if not scenes:
            return default_next

        # 已访问过的场景 ID 集合
        visited_scene_ids = {h.get("scene_id", "") for h in self.history}
        # 玩家选择历史: {scene_id: choice_text}
        choice_map: dict[str, str] = {}
        # 玩家选择 ID 历史: {scene_id: option_id}
        choice_id_map: dict[str, str] = {}
        for h in self.history:
            sid = h.get("scene_id", "")
            choice = h.get("player_choice", "")
            option_id = h.get("option_id", "")
            if sid and choice:
                choice_map[sid] = choice
            if sid and option_id:
                choice_id_map[sid] = option_id

        def _match_choice(target_scene: str, target_choice: str) -> bool:
            """检查玩家在 target_scene 的选择是否匹配 target_choice。

            同时匹配选项文本（player_choice）和选项 ID（option_id），
            兼容脚本中使用选项 ID 或选项文本作为条件值的两种写法。
            """
            if not target_choice:
                return False
            if target_scene not in choice_map and target_scene not in choice_id_map:
                return False
            player_text = choice_map.get(target_scene, "")
            player_id = choice_id_map.get(target_scene, "")
            # 精确匹配优先（选项 ID 或选项文本）
            if player_id and target_choice == player_id:
                return True
            if player_text and target_choice == player_text:
                return True
            # 子串匹配作为兜底（双方均非空，避免空串恒真）
            if player_text and (target_choice in player_text or player_text in target_choice):
                return True
            if player_id and (target_choice in player_id or player_id in target_choice):
                return True
            return False

        def _check_condition(tc: dict) -> bool:
            """检查单个 trigger_condition 是否满足"""
            tc_type = str(tc.get("type", "")).strip().lower()
            tc_value = str(tc.get("value", "")).strip()

            if tc_type == "game_start":
                # 仅用于标记初始场景，不作为跳转条件
                return False
            elif tc_type == "scene_completed":
                # 检查指定场景是否已在历史中完成
                return tc_value in visited_scene_ids
            elif tc_type == "scene_visited":
                # 检查指定场景是否被访问过（与 scene_completed 等价）
                return tc_value in visited_scene_ids
            elif tc_type == "choice_made":
                # 格式 1："在scene_XX选择YY" — 指定场景 + 选择
                m = re.match(
                    r'(?:在)?\s*(scene_\d+).{0,6}(?:选择|选|select|choose)\s*(.+)',
                    tc_value, re.IGNORECASE
                )
                if m:
                    target_scene = m.group(1).strip()
                    target_choice = m.group(2).strip()
                    # 去掉括号注释（如 "调查发件人（解锁隐藏路径）" → "调查发件人"）
                    target_choice = re.sub(r'[（(].*?[）)]', '', target_choice).strip()
                    return _match_choice(target_scene, target_choice)

                # 格式 2：简单值（选项 ID 或选项文本，如 "continue"、"继续深入"）
                # 检查最近一个场景的选择是否匹配
                if self.history:
                    last_h = self.history[-1]
                    last_scene = last_h.get("scene_id", "")
                    if last_scene:
                        return _match_choice(last_scene, tc_value)
                return False
            else:
                # 未知类型，忽略
                return False

        # 从当前场景之后查找第一个满足 trigger_conditions 的场景
        condition_failed_indices: set[int] = set()
        for i in range(current_idx + 1, len(scenes)):
            scene = scenes[i]
            tc_raw = scene.get("trigger_conditions", {})

            # 设计意图：带 trigger_conditions 的场景仅在条件满足时才能进入，
            # 条件不满足时跳过该场景，继续搜索后续可匹配的场景。
            # 如果所有条件场景都不匹配，回退到线性递增 (current + 1)。
            if isinstance(tc_raw, dict):
                if not tc_raw:
                    continue  # 空字典 = 无条件，跳过
                conditions = [tc_raw]
            elif isinstance(tc_raw, list):
                conditions = [c for c in tc_raw if isinstance(c, dict) and c]
            else:
                continue

            if not conditions:
                continue

            # 所有条件都满足时触发（AND 逻辑）
            if all(_check_condition(c) for c in conditions):
                logger.info(f"trigger_conditions 命中场景 {i}: {scene.get('id', '')} ({scene.get('name', '')})")
                return i
            else:
                condition_failed_indices.add(i)

        # 没有匹配的条件跳转，默认线性进入下一场景
        # 但如果 default_next 的场景条件检查失败，则跳过它寻找后续可用场景
        if default_next in condition_failed_indices:
            for i in range(default_next + 1, len(scenes)):
                if i not in condition_failed_indices:
                    logger.info(f"trigger_conditions 回退跳过条件失败场景，跳转到 {i}: {scenes[i].get('id', '')}")
                    return i
            # 所有后续场景都条件失败，仍返回 default_next 避免卡死
            logger.warning("trigger_conditions 所有后续场景条件均失败，回退到线性递增")
        return default_next

    def _match_ending(self, endings: list, history: list) -> dict | None:
        """根据玩家历史选择匹配最合适的结局"""
        if not endings:
            return None

        keyword_synonyms = {
            "stop": ["停止", "放弃", "拒绝", "算了", "退出", "删除", "不去"],
            "continue": ["继续", "深入", "坚持", "前进", "探索", "接受"],
            "negotiate": ["谈判", "协议", "妥协", "交易", "达成", "协商", "合作"],
            "reveal": ["公开", "揭露", "真相", "曝光", "公布", "揭发", "展示", "广播"],
            "investigate": ["调查", "追查", "查明", "探究", "追踪"],
            "hidden": ["隐藏", "秘密", "暗中", "悄悄", "潜伏", "偷偷", "假装", "布局", "备份", "伏笔"],
            "accept": ["接受", "同意", "答应", "确认"],
            "reject": ["拒绝", "否决", "不接受", "回绝"],
            "trust": ["信任", "相信", "信赖"],
            "distrust": ["不信任", "怀疑", "质疑"],
        }

        player_choices = {}
        for h in history:
            sid = h.get("scene_id", "")
            choice = h.get("player_choice", "").lower()
            if sid and choice:
                player_choices[sid] = choice

        def parse_condition(cond_value: str) -> list[tuple[str, str]]:
            """解析条件字符串，支持"且"连接的复合条件，返回 [(scene_id, keyword), ...]"""
            cond_value = cond_value.strip()
            # 按"且"/"并且"/"而且"拆分复合条件
            parts = re.split(r'[且并]且?|而且', cond_value)
            results = []
            for part in parts:
                part = part.strip()
                if not part:
                    continue
                m = re.search(r'(?:在)?(scene_\d+).{0,6}(?:选择|选|select|choose)\s*([\w\u4e00-\u9fff]+)', part, re.IGNORECASE)
                if m:
                    results.append((m.group(1), m.group(2).lower()))
            return results

        def choice_matches_keyword(choice_text: str, keyword: str) -> bool:
            keyword = keyword.lower()
            if keyword in choice_text:
                return True
            synonyms = keyword_synonyms.get(keyword, [])
            for syn in synonyms:
                if syn in choice_text:
                    return True
            return False

        best_match = None
        best_score = -1

        for ending in endings:
            if not isinstance(ending, dict):
                continue
            score = 0
            total_conditions = 0

            for cond in ending.get("trigger_conditions", []):
                if not isinstance(cond, dict):
                    continue
                cond_val = str(cond.get("value", ""))
                parsed = parse_condition(cond_val)
                # 复合条件（hidden_choices 等）：每个子条件独立计分
                for scene_id, keyword in parsed:
                    total_conditions += 1
                    if scene_id in player_choices:
                        if choice_matches_keyword(player_choices[scene_id], keyword):
                            score += 2
                # 如果正则完全无法解析，仍计为 1 个条件（避免除零）
                if not parsed:
                    total_conditions += 1

            for uc in ending.get("unlock_conditions", []):
                if not isinstance(uc, str):
                    continue
                parsed = parse_condition(uc)
                for scene_id, keyword in parsed:
                    total_conditions += 1
                    if scene_id in player_choices:
                        if choice_matches_keyword(player_choices[scene_id], keyword):
                            score += 1
                if not parsed:
                    total_conditions += 1

            normalized = score / max(total_conditions, 1)
            if normalized > best_score or (normalized == best_score and score > best_match.get("_raw_score", 0) if best_match else True):
                best_score = normalized
                best_match = {**ending, "_raw_score": score, "_normalized_score": normalized}

        if best_match and best_score > 0:
            best_match.pop("_raw_score", None)
            best_match.pop("_normalized_score", None)
            return {
                "title": best_match.get("title", ""),
                "type": best_match.get("type", ""),
                "narrative": best_match.get("narrative", ""),
                "epilogue": best_match.get("epilogue", ""),
                "replay_value": best_match.get("replay_value", ""),
            }
        return None

    def get_state(self) -> dict:
        scene = self.adapter.scenes[self.current_scene_index] if self.current_scene_index < len(self.adapter.scenes) else {}
        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "progress": round(self.progress, 2),
            "current_scene": {
                "id": scene.get("id", ""),
                "name": scene.get("name", ""),
            } if scene else None,
            "total_scenes": self.total_scenes,
            "completed_scenes": self.current_scene_index,
        }
