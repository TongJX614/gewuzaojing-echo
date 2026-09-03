// ============================================================
// 任务系统公共类型
//
// 本文件只声明纯数据结构，不包含运行时副作用。任务定义可以由 TypeScript、
// JSON 或任务编辑器提供；运行时状态由 QuestManager 独立维护。
// ============================================================

/** 任务状态 */
export type QuestStatus = 'locked' | 'active' | 'completed' | 'failed';

/** 任务分类 */
export type QuestCategory = 'main' | 'side' | 'hidden';

/** 多条件组合逻辑 */
export type QuestConditionLogic = 'AND' | 'OR';

/** 步骤目标类型 */
export type ObjectiveType =
  | 'reach_location'
  | 'talk_to_npc'
  | 'dialogue_complete'
  | 'collect_item'
  | 'submit_item'
  | 'trigger_event'
  | 'custom_flag';

/** 单个目标条件 */
export interface QuestObjective {
  /** 目标内唯一 ID（推荐填写，用于 AI 编辑时稳定引用） */
  id?: string;
  /** 目标类型 */
  type: ObjectiveType;
  /** sceneId / npcId / itemId / eventId / flagName */
  target: string;
  /** 需要达成的次数或数量，默认 1 */
  count?: number;
  /** 提交目标 NPC，仅 submit_item 使用 */
  submitTo?: string;
  /** 到达坐标，仅 reach_location 使用；省略时进入目标场景即完成 */
  location?: { x: number; y: number; radius?: number };
  /** 精确匹配特定对话树（talk_to_npc 时，不填则匹配该 NPC 的任意对话） */
  dialogueId?: string;
  /** collect_item 来源过滤：'world' = 只计地图拾取，'any' = 包含任务奖励等（默认 'any'） */
  source?: 'world' | 'any';
}

/** 任务步骤；任务按 steps 数组顺序推进 */
export interface QuestStep {
  /** 任务内唯一的步骤 ID */
  id: string;
  /** UI 显示文字 */
  desc: string;
  /** 本步骤的目标 */
  objectives: QuestObjective[];
  /** 多目标组合逻辑，默认 AND */
  logic?: QuestConditionLogic;
  /** 步骤完成提示 */
  onCompleteText?: string;
}

/** 带数量的物品奖励 */
export interface QuestRewardItem {
  itemId: string;
  count?: number;
}

/** 任务奖励。字符串物品 ID 作为 count=1 的简写保留。 */
export interface QuestReward {
  items?: Array<string | QuestRewardItem>;
  exp?: number;
  flags?: string[];
  unlockScenes?: string[];
  unlockDialogues?: string[];
}

/** 开启条件类型 */
export type StartConditionType =
  | 'quest_completed'
  | 'has_item'
  | 'talked_to_npc'
  | 'visited_scene'
  | 'has_flag'
  | 'stage_at_least';

/** 单个开启条件项 */
export interface StartConditionEntry {
  /** 条件类型 */
  type: StartConditionType;
  /** 目标 ID（questId / itemId / npcId / sceneId / flagName） */
  target: string;
  /** 布尔条件取反标记：填 false 表示"不满足"（如任务未完成、未拥有 flag） */
  value?: boolean;
}

/** 任务开启条件 */
export interface QuestStartCondition {
  /** 新格式：条件项列表，每项可独立选择类型和目标 */
  conditions?: StartConditionEntry[];
  /** 条件组组合逻辑，默认 AND */
  logic?: QuestConditionLogic;
  /** @deprecated 旧字段，由 normalize 迁移到 conditions */
  questsCompleted?: string[];
  /** @deprecated 旧字段，由 normalize 迁移到 conditions */
  flags?: string[];
  /** @deprecated 旧字段，由 normalize 迁移到 conditions */
  sceneId?: string;
}

/** 静态任务定义 */
export interface Quest {
  id: string;
  title: string;
  desc: string;
  category: QuestCategory;
  autoStart?: boolean;
  startCondition?: QuestStartCondition;
  steps: QuestStep[];
  rewards?: QuestReward;
  completionText?: string;
  onCompleteFlags?: string[];
  /** 该任务属于哪个阶段；不填 = 所有阶段可见 */
  stage?: string;
  /** 主线任务完成时，把进度推进到这个阶段 */
  advanceStageTo?: string;
}

// ============================================================
// 统一事件上报协议
// ============================================================

export type QuestEvent =
  | { type: 'scene_entered'; sceneId: string }
  | { type: 'location_reached'; sceneId: string; x: number; y: number }
  | { type: 'dialogue_completed'; npcId: string; dialogueId?: string }
  | { type: 'item_collected'; itemId: string; count?: number; sourceId?: string }
  | { type: 'item_submitted'; itemId: string; npcId: string; count?: number }
  | { type: 'event_triggered'; eventId: string }
  | { type: 'flag_changed'; flag: string; value: boolean };

// ============================================================
// 动态运行时状态
// ============================================================

export interface ObjectiveProgress {
  index: number;
  objectiveId?: string;
  current: number;
  done: boolean;
}

export interface StepRuntime {
  stepId: string;
  objectives: ObjectiveProgress[];
  done: boolean;
}

export interface QuestRuntime {
  questId: string;
  status: QuestStatus;
  currentStepIndex: number;
  currentStepId?: string;
  steps: StepRuntime[];
  startedAt: number;
  completedAt?: number;
}

/** ProgressManager 自己持有的全局状态。 */
export interface GlobalProgressState {
  chapter: number;
  stage: string;
  flags: string[];
  completedQuests: string[];
  totalExp: number;
}

/** QuestManager 的可存档状态。 */
export interface QuestManagerState {
  questRuntimes: QuestRuntime[];
  trackedQuestId: string | null;
}

/** 游戏存档中的完整任务/进度快照。 */
export interface GameProgress extends GlobalProgressState, QuestManagerState {}
