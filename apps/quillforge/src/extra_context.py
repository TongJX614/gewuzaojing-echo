# -*- coding: utf-8 -*-
"""
ExtraContext — 类型化的额外上下文

替代散落在各处的 extra.get("_xxx", "") 字典访问，
提供 IDE 自动补全和类型检查支持。
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExtraContext:
    """剧本额外上下文（原 extra 字典的类型化版本）。

    所有字段对应原 extra["_xxx"] 键，去掉前导下划线。
    """

    worldbook: str = ""
    narrative_style: str = ""
    plot_summary: str = ""
    core_conflict: str = ""
    themes: str = ""
    relationship_network: str = ""
    stages_overview: str = ""
    events: str = ""
    key_choices: str = ""
    endings: str = ""
    scene_details: str = ""
    worldlines: str = ""
    current_stage_context: str = ""
    scene_beats: str = ""
    scene_hooks: str = ""
    choice_history: str = ""
    player_state: str = ""
    character_voice_tones: str = ""
    active_branch_context: str = ""
    scene_atmosphere: str = ""
    narrative_notes: str = ""
    emotional_arc: str = ""
    has_script_choices: bool = False
    script_choices: list = field(default_factory=list)
    extra_visual_assets: list = field(default_factory=list)
    audio_assets: list = field(default_factory=list)

    @classmethod
    def from_dict(cls, extra: dict) -> "ExtraContext":
        """从原始 extra 字典（键以 _ 开头）构建 ExtraContext。"""
        return cls(
            worldbook=extra.get("_worldbook", ""),
            narrative_style=extra.get("_narrativeStyle", ""),
            plot_summary=extra.get("_plotSummary", ""),
            core_conflict=extra.get("_coreConflict", ""),
            themes=extra.get("_themes", ""),
            relationship_network=extra.get("_relationshipNetwork", ""),
            stages_overview=extra.get("_stagesOverview", ""),
            events=extra.get("_events", ""),
            key_choices=extra.get("_keyChoices", ""),
            endings=extra.get("_endings", ""),
            scene_details=extra.get("_sceneDetails", ""),
            worldlines=extra.get("_worldlines", ""),
            current_stage_context=extra.get("_currentStageContext", ""),
            scene_beats=extra.get("_sceneBeats", ""),
            scene_hooks=extra.get("_sceneHooks", ""),
            choice_history=extra.get("_choiceHistory", ""),
            player_state=extra.get("_playerState", ""),
            character_voice_tones=extra.get("_characterVoiceTones", ""),
            active_branch_context=extra.get("_activeBranchContext", ""),
            scene_atmosphere=extra.get("_sceneAtmosphere", ""),
            narrative_notes=extra.get("_narrativeNotes", ""),
            emotional_arc=extra.get("_emotionalArc", ""),
            has_script_choices=extra.get("_hasScriptChoices", False),
            script_choices=extra.get("_scriptChoices", []),
            extra_visual_assets=extra.get("_extraVisualAssets", []),
            audio_assets=extra.get("_audioAssets", []),
        )

    def to_prompt_variables(self) -> dict:
        """转换为 prompt 模板变量字典（与 StageBase._common_variables 输出一致）。"""
        return {
            "worldbookRules": self.worldbook,
            "stagesOverview": self.stages_overview,
            "coreConflict": self.core_conflict,
            "plotSummary": self.plot_summary,
            "relationshipNetwork": self.relationship_network,
            "sceneDetails": self.scene_details,
            "worldlines": self.worldlines,
            "endings": self.endings,
            "keyChoices": self.key_choices,
            "themes": self.themes,
            "events": self.events,
            "choiceHistory": self.choice_history,
            "playerState": self.player_state,
            "currentStageContext": self.current_stage_context,
            "sceneBeats": self.scene_beats,
            "sceneHooks": self.scene_hooks,
            "characterVoiceTones": self.character_voice_tones,
            "activeBranchContext": self.active_branch_context,
            "sceneAtmosphere": self.scene_atmosphere,
            "narrativeNotes": self.narrative_notes,
            "emotionalArc": self.emotional_arc,
            "extraVisualAssets": self.extra_visual_assets,
            "audioAssets": self.audio_assets,
        }
