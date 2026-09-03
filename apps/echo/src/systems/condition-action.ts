/**
 * 统一 Condition / Action 系统。
 * Quest 开启条件、Dialogue 显示条件、Choice 可见条件全部使用 ConditionExpression。
 * Quest 奖励、Dialogue 效果、Step 完成效果全部使用 Action[]。
 */

import type { ProjectTwoSelection } from '../types/vr-experience';

// ─── Condition ──────────────────────────────────────────

export type Condition =
  | { type: 'quest.completed'; questId: string }
  | { type: 'inventory.has'; itemId: string; count?: number }
  | { type: 'scene.visited'; sceneId: string }
  | { type: 'dialogue.completed'; dialogueId: string }
  | { type: 'npc.talked'; npcId: string }
  | { type: 'flag.is'; flag: string; value?: boolean }
  | { type: 'stage.atLeast'; stage: string };

/** 逻辑表达式：支持 all / any / not 嵌套，单个 Condition 也是合法表达式。 */
export type ConditionExpression =
  | Condition
  | { all: ConditionExpression[] }
  | { any: ConditionExpression[] }
  | { not: ConditionExpression };

export function isLogicExpr(expr: ConditionExpression): expr is
  | { all: ConditionExpression[] }
  | { any: ConditionExpression[] }
  | { not: ConditionExpression } {
  return 'all' in expr || 'any' in expr || 'not' in expr;
}

// ─── Action ─────────────────────────────────────────────

export type NarrativeAction =
  | { type: 'quest.activate'; questId: string }
  | { type: 'quest.complete'; questId: string }
  | { type: 'flag.set'; flag: string }
  | { type: 'flag.unset'; flag: string }
  | { type: 'inventory.add'; itemId: string; count?: number }
  | { type: 'inventory.remove'; itemId: string; count?: number }
  | { type: 'inventory.submit'; itemId: string; npcId: string; count?: number }
  | { type: 'scene.unlock'; sceneId: string }
  | { type: 'dialogue.unlock'; dialogueId: string }
  | { type: 'stage.set'; stage: string }
  | { type: 'worldline.set'; value: string }
  | { type: 'exp.add'; amount: number }
  | { type: 'event.emit'; eventId: string }
  | { type: 'minigame.open'; minigameId: string }
  | {
      type: 'launch_vr_experience';
      experienceId: 'quillforge-webui';
      projectTwo: ProjectTwoSelection;
    };

// ─── 运行时条件评估（单一事实来源）──────────────────────

/** 评估条件所需的游戏状态读取接口。Quest 与 Dialogue 共用，避免两套评估器。 */
export interface ConditionContext {
  isQuestCompleted(questId: string): boolean;
  hasItem(itemId: string): boolean;
  hasFlag(flag: string): boolean;
  isStageAtLeast(stage: string): boolean;
}

/** 评估单个旧版 StartConditionEntry。Quest 开启条件与 Dialogue 显示条件共用。
 *  value 可选：填 false 时对布尔结果取反（用于"任务未完成""未拥有 flag"类条件）。 */
export function evaluateStartConditionEntry(
  entry: { type: string; target: string; count?: number; value?: boolean },
  ctx: ConditionContext
): boolean {
  const bool = (v: boolean): boolean => (entry.value === false ? !v : v);
  switch (entry.type) {
    case 'quest_completed': return bool(ctx.isQuestCompleted(entry.target));
    case 'has_item': return bool(ctx.hasItem(entry.target));
    case 'talked_to_npc': return bool(ctx.hasFlag(`talked:${entry.target}`));
    case 'visited_scene': return bool(ctx.hasFlag(`visited:${entry.target}`));
    case 'has_flag': return bool(ctx.hasFlag(entry.target));
    case 'stage_at_least': return bool(ctx.isStageAtLeast(entry.target));
    default: return false;
  }
}

/** 评估一组旧版条件（AND / OR）。 */
export function evaluateStartConditionEntries(
  entries: { type: string; target: string; count?: number }[],
  logic: 'AND' | 'OR',
  ctx: ConditionContext
): boolean {
  if (!entries.length) return true;
  return logic === 'OR'
    ? entries.some((e) => evaluateStartConditionEntry(e, ctx))
    : entries.every((e) => evaluateStartConditionEntry(e, ctx));
}

/** 评估类型化 ConditionExpression（all / any / not 嵌套）。 */
export function evaluateCondition(expr: ConditionExpression, ctx: ConditionContext): boolean {
  if (isLogicExpr(expr)) {
    if ('all' in expr) return expr.all.every((e) => evaluateCondition(e, ctx));
    if ('any' in expr) return expr.any.some((e) => evaluateCondition(e, ctx));
    return !evaluateCondition(expr.not, ctx);
  }
  switch (expr.type) {
    case 'quest.completed': return ctx.isQuestCompleted(expr.questId);
    case 'inventory.has': return ctx.hasItem(expr.itemId);
    case 'npc.talked': return ctx.hasFlag(`talked:${expr.npcId}`);
    case 'scene.visited': return ctx.hasFlag(`visited:${expr.sceneId}`);
    case 'flag.is': return ctx.hasFlag(expr.flag) === (expr.value ?? true);
    case 'stage.atLeast': return ctx.isStageAtLeast(expr.stage);
    default: return true;
  }
}

// ─── Schema 元数据（供编辑器 / AI 生成校验）──────────────

/** 旧版 StartConditionEntry 的 schema：参数、必填、ID 引用类型。 */
export const START_CONDITION_SCHEMA = {
  quest_completed: { params: ['target'], required: ['target'], ref: 'quest' },
  has_item: { params: ['target', 'count'], required: ['target'], ref: 'item' },
  talked_to_npc: { params: ['target'], required: ['target'], ref: 'npc' },
  visited_scene: { params: ['target'], required: ['target'], ref: 'scene' },
  has_flag: { params: ['target'], required: ['target'], ref: 'flag' },
  stage_at_least: { params: ['target'], required: ['target'], ref: 'stage' },
} as const;

/** NarrativeAction 的 schema：参数、必填、ID 引用类型。 */
export const ACTION_SCHEMA = {
  'quest.activate': { params: ['questId'], required: ['questId'], ref: 'quest' },
  'quest.complete': { params: ['questId'], required: ['questId'], ref: 'quest' },
  'flag.set': { params: ['flag'], required: ['flag'], ref: 'flag' },
  'flag.unset': { params: ['flag'], required: ['flag'], ref: 'flag' },
  'inventory.add': { params: ['itemId', 'count'], required: ['itemId'], ref: 'item' },
  'inventory.remove': { params: ['itemId', 'count'], required: ['itemId'], ref: 'item' },
  'inventory.submit': { params: ['itemId', 'npcId', 'count'], required: ['itemId', 'npcId'], ref: 'item' },
  'scene.unlock': { params: ['sceneId'], required: ['sceneId'], ref: 'scene' },
  'dialogue.unlock': { params: ['dialogueId'], required: ['dialogueId'], ref: 'dialogue' },
  'stage.set': { params: ['stage'], required: ['stage'], ref: 'stage' },
  'worldline.set': { params: ['value'], required: ['value'], ref: null },
  'exp.add': { params: ['amount'], required: ['amount'], ref: null },
  'event.emit': { params: ['eventId'], required: ['eventId'], ref: null },
  launch_vr_experience: {
    params: ['experienceId', 'projectTwo'],
    required: ['experienceId', 'projectTwo'],
    ref: null,
  },
} as const;

/** 运行时上报的游戏事件类型（Quest objective 可监听）。 */
export const GAME_EVENT_TYPES = [
  'npc_interact',
  'dialogue_completed',
  'item_collected',
  'scene_entered',
  'flag_set',
  'quest_completed',
  'event_triggered',
] as const;

// ─── Legacy adapters ────────────────────────────────────

/** 将旧的 StartConditionEntry[] 转成 ConditionExpression（AND）。 */
export function legacyConditionsToExpr(
  entries: { type: string; target: string; count?: number }[]
): ConditionExpression | undefined {
  if (!entries.length) return undefined;
  const conditions: Condition[] = entries.map(e => {
    switch (e.type) {
      case 'quest_completed': return { type: 'quest.completed', questId: e.target };
      case 'has_item': return { type: 'inventory.has', itemId: e.target, count: e.count };
      case 'talked_to_npc': return { type: 'npc.talked', npcId: e.target };
      case 'visited_scene': return { type: 'scene.visited', sceneId: e.target };
      case 'has_flag': return { type: 'flag.is', flag: e.target, value: true };
      case 'stage_at_least': return { type: 'stage.atLeast', stage: e.target };
      default: return { type: 'flag.is', flag: e.target, value: true };
    }
  });
  return conditions.length === 1 ? conditions[0] : { all: conditions };
}

/** 将旧的 effect 字符串转成 Action[]。 */
export function legacyEffectToActions(effect: string): NarrativeAction[] {
  if (!effect) return [];
  const parts = effect.split(':');
  const prefix = parts[0];
  const rest = parts.slice(1).join(':');

  switch (prefix) {
    case 'flag': {
      const op = parts[1];
      const flagName = parts[2];
      if (op === 'set' && flagName) return [{ type: 'flag.set', flag: flagName }];
      if (op === 'remove' && flagName) return [{ type: 'flag.unset', flag: flagName }];
      return [];
    }
    case 'quest': {
      const op = parts[1];
      const questId = parts[2];
      if (op === 'start' && questId) return [{ type: 'quest.activate', questId }];
      return [];
    }
    case 'worldline':
      if (rest) return [{ type: 'worldline.set', value: rest }];
      return [];
    case 'exp': {
      const n = parseInt(rest, 10);
      if (!isNaN(n)) return [{ type: 'exp.add', amount: n }];
      return [];
    }
    default:
      return [{ type: 'event.emit', eventId: effect }];
  }
}
