import type { Quest } from './types';
import type { DialogueTree } from '../dialogues';

export interface EntityBasePlacement {
  sceneId: string;
  x: number;
  y: number;
  exists: boolean;
}

export type StageOverrideValue = Partial<EntityBasePlacement>;
export type StageOverrideMap = Record<string, StageOverrideValue>;

export type QuestPlacementKind = 'npc' | 'item' | 'event';

/** 编辑器在地图上创建的任务交互锚点。 */
export interface QuestPlacement {
  id: string;
  kind: QuestPlacementKind;
  sceneId: string;
  x: number;
  y: number;
  label: string;
  /** NPC 的 dialogueTrigger、道具 itemId 或事件 eventId。 */
  targetId: string;
}

/** 对话树编辑数据：dialogueId → 完整 DialogueTree（JSON 可序列化，含 stage/condition）。 */
export type DialogueData = Record<string, DialogueTree>;

/** 可直接导出、版本控制和重新载入的编辑器工程。 */
export interface QuestEditorProject {
  version: 1;
  /** 内容结构代际。源码结构变化（如对话树新增哨兵选项）时递增，旧草稿自动失效。 */
  schemaVersion: number;
  updatedAt: number;
  quests: Quest[];
  placements: QuestPlacement[];
  dialogueData: DialogueData;
}

export type StageStateData = {
  /** 剧情阶段 id 列表，如 [1,2,3,4]。Stage 0 是隐含的 Global Base，不入列 */
  stages: number[];
  /** base 层实体摆放（全部场景实体由 Stage Manager 统一管理） */
  base: Record<string, { sceneId: string; x: number; y: number; exists: boolean; spriteVariant?: string }>;
  /** stage 级覆盖，key 为 stage number 的字符串形式 */
  overrides: Record<string, Record<string, Partial<{ sceneId: string; x: number; y: number; exists: boolean; spriteVariant: string }>>>;
  /** 各场景传送门（Develop Mode 编辑，随 stageState 一并持久化） */
  transitions?: Record<string, { x: number; y: number; targetScene: string; targetX: number; targetY: number }[]>;
};

/** 当前源码对应的结构代际。改动对话树/任务结构后手动递增以废弃浏览器旧草稿。 */
export const CURRENT_SCHEMA_VERSION = 2;

export function createEmptyQuestEditorProject(): QuestEditorProject {
  return { version: 1, schemaVersion: CURRENT_SCHEMA_VERSION, updatedAt: 0, quests: [], placements: [], dialogueData: {} };
}

export function parseQuestEditorProject(value: unknown): QuestEditorProject | null {
  if (
    !isRecord(value)
    || value.version !== 1
    || !Array.isArray(value.quests)
    || !Array.isArray(value.placements)
    // 旧草稿没有 schemaVersion 或代际落后 → 整体废弃，避免过期对话数据覆盖源码
    || value.schemaVersion !== CURRENT_SCHEMA_VERSION
  ) {
    return null;
  }

  const placements: QuestPlacement[] = [];
  for (const item of value.placements) {
    if (!isRecord(item)) return null;
    if (
      typeof item.id !== 'string'
      || !isPlacementKind(item.kind)
      || typeof item.sceneId !== 'string'
      || typeof item.x !== 'number'
      || typeof item.y !== 'number'
      || typeof item.label !== 'string'
      || typeof item.targetId !== 'string'
    ) return null;
    placements.push({
      id: item.id,
      kind: item.kind,
      sceneId: item.sceneId,
      x: item.x,
      y: item.y,
      label: item.label,
      targetId: item.targetId,
    });
  }

  // 对话树编辑数据
  const dialogueData: DialogueData = {};
  if (isRecord(value.dialogueData)) {
    for (const [k, v] of Object.entries(value.dialogueData)) {
      if (typeof k === 'string' && isRecord(v) && typeof (v as Record<string, unknown>).id === 'string') {
        dialogueData[k] = v as unknown as DialogueTree;
      }
    }
  }

  // Quest 的深层校验由 QuestManager.validateQuestDefinition 统一完成。
  return {
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    quests: value.quests as Quest[],
    placements,
    dialogueData,
  };
}

export function cloneQuestEditorProject(project: QuestEditorProject): QuestEditorProject {
  return structuredClone(project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlacementKind(value: unknown): value is QuestPlacementKind {
  return value === 'npc' || value === 'item' || value === 'event';
}
