// ============================================================
// QuestManager — 事件驱动任务引擎
// ============================================================

import type {
  ObjectiveProgress,
  Quest,
  QuestEvent,
  QuestManagerState,
  QuestObjective,
  QuestRuntime,
  QuestStep,
  StartConditionEntry,
  StepRuntime,
} from '../data/quests/types';
import { ProgressManager, type ProgressChange } from './progress';
import { evaluateStartConditionEntry, type ConditionContext } from './condition-action';

export type QuestNoticeKind = 'started' | 'step' | 'completed' | 'reward' | 'error';

export interface QuestWorldSnapshot {
  sceneId: string;
  x?: number;
  y?: number;
}

/** QuestManager 通过这些轻量适配器访问背包、玩家和场景。 */
export interface QuestServices {
  getInventoryCount?: (itemId: string) => number;
  grantItem?: (itemId: string, count: number) => boolean;
  grantPlayerExp?: (amount: number) => void;
  getWorldSnapshot?: () => QuestWorldSnapshot;
  unlockScene?: (sceneId: string) => void;
  unlockDialogue?: (dialogueId: string) => void;
  notify?: (message: string, kind: QuestNoticeKind) => void;
  now?: () => number;
  /** 阶段顺序表，用于 stage_at_least 条件比较；不提供时该条件类型不可用 */
  stageOrder?: readonly string[];
}

export interface PendingSubmission {
  questId: string;
  stepId: string;
  itemId: string;
  npcId: string;
  remaining: number;
}

export interface QuestView {
  definition: Quest;
  runtime: QuestRuntime;
  currentStep: QuestStep | null;
  currentStepRuntime: StepRuntime | null;
}

type QuestListener = () => void;

export function validateQuestDefinition(quest: Quest): string[] {
  const errors: string[] = [];
  if (!quest.id.trim()) errors.push('任务 ID 不能为空');
  if (!quest.title.trim()) errors.push(`任务 ${quest.id || '(未命名)'} 缺少标题`);
  if (quest.steps.length === 0) errors.push(`任务 ${quest.id || '(未命名)'} 至少需要一个步骤`);

  const stepIds = new Set<string>();
  for (const step of quest.steps) {
    if (!step.id.trim()) errors.push(`任务 ${quest.id} 存在空步骤 ID`);
    if (stepIds.has(step.id)) errors.push(`任务 ${quest.id} 的步骤 ID 重复：${step.id}`);
    stepIds.add(step.id);
    if (step.objectives.length === 0) errors.push(`步骤 ${step.id} 至少需要一个目标`);
    for (const objective of step.objectives) {
      if (!objective.target.trim()) errors.push(`步骤 ${step.id} 存在空目标 ID`);
      if ((objective.count ?? 1) <= 0) errors.push(`步骤 ${step.id} 的目标数量必须大于 0`);
      if (objective.type === 'submit_item' && !objective.submitTo?.trim()) {
        errors.push(`步骤 ${step.id} 的提交物品目标缺少 submitTo`);
      }
      if (objective.location && (objective.location.radius ?? 1) < 0) {
        errors.push(`步骤 ${step.id} 的地点半径不能为负数`);
      }
    }
  }
  return errors;
}

export class QuestManager {
  private definitions = new Map<string, Quest>();
  private definitionOrder: string[] = [];
  private runtimes = new Map<string, QuestRuntime>();
  private trackedQuestId: string | null = null;
  private listeners = new Set<QuestListener>();
  private eventQueue: QuestEvent[] = [];
  private processingEvents = false;
  private suppressAutoStarts = false;

  constructor(
    private readonly progress: ProgressManager,
    private services: QuestServices = {},
    definitions: readonly Quest[] = [],
  ) {
    this.progress.subscribe((change) => this.onProgressChange(change));
    this.registerQuests(definitions);
  }

  setServices(services: QuestServices): void {
    this.services = services;
    this.refreshAutoStarts();
    this.reconcileAllActiveQuests();
  }

  // ─── 定义注册 ───

  registerQuest(quest: Quest, replace = false): void {
    const errors = validateQuestDefinition(quest);
    if (errors.length > 0) throw new Error(errors.join('；'));
    const exists = this.definitions.has(quest.id);
    if (exists && !replace) throw new Error(`任务 ID 已注册：${quest.id}`);

    this.definitions.set(quest.id, cloneQuest(quest));
    if (!exists) this.definitionOrder.push(quest.id);

    if (replace && this.runtimes.has(quest.id)) {
      // 编辑器修改步骤结构后，旧进度不再可靠，重建该任务运行时。
      const old = this.runtimes.get(quest.id);
      if (old?.status === 'active') {
        const rebuilt = this.createRuntime(quest);
        this.runtimes.set(quest.id, rebuilt);
        this.reconcileRuntime(quest, rebuilt);
      }
    }
    this.refreshAutoStarts();
    this.emitChange();
  }

  registerQuests(quests: readonly Quest[], replace = false): void {
    for (const quest of quests) {
      if (!replace && this.definitions.has(quest.id)) {
        console.warn(`[QuestManager] 跳过重复任务 ID：${quest.id}`);
        continue;
      }
      this.registerQuest(quest, replace);
    }
  }

  unregisterQuest(questId: string): void {
    if (!this.definitions.delete(questId)) return;
    this.definitionOrder = this.definitionOrder.filter((id) => id !== questId);
    this.runtimes.delete(questId);
    if (this.trackedQuestId === questId) this.trackFirstActiveQuest();
    this.emitChange();
  }

  getDefinitions(): Quest[] {
    return this.definitionOrder
      .map((id) => this.definitions.get(id))
      .filter((quest): quest is Quest => Boolean(quest))
      .map(cloneQuest);
  }

  getDefinition(questId: string): Quest | null {
    const quest = this.definitions.get(questId);
    return quest ? cloneQuest(quest) : null;
  }

  // ─── 生命周期 ───

  activateQuest(questId: string, force = false): boolean {
    const quest = this.definitions.get(questId);
    if (!quest || this.progress.isQuestCompleted(questId)) return false;
    const existing = this.runtimes.get(questId);
    if (existing?.status === 'active') {
      this.trackedQuestId = questId;
      this.emitChange();
      return true;
    }
    if (!force && !this.startConditionsMet(quest)) return false;

    const runtime = this.createRuntime(quest);
    this.runtimes.set(questId, runtime);
    this.trackedQuestId = questId;
    this.services.notify?.(`任务已激活：${quest.title}`, 'started');
    this.reconcileRuntime(quest, runtime);
    this.emitChange();
    return true;
  }

  failQuest(questId: string): boolean {
    const runtime = this.runtimes.get(questId);
    if (!runtime || runtime.status !== 'active') return false;
    runtime.status = 'failed';
    if (this.trackedQuestId === questId) this.trackFirstActiveQuest();
    this.emitChange();
    return true;
  }

  /** 编辑器/测试使用：清除运行时和完成记录。 */
  resetQuest(questId: string): void {
    this.runtimes.delete(questId);
    this.suppressAutoStarts = true;
    try {
      this.progress.forgetQuestCompleted(questId);
    } finally {
      this.suppressAutoStarts = false;
    }
    if (this.trackedQuestId === questId) this.trackFirstActiveQuest();
    this.emitChange();
  }

  trackQuest(questId: string | null): boolean {
    if (questId === null) {
      this.trackedQuestId = null;
      this.emitChange();
      return true;
    }
    const runtime = this.runtimes.get(questId);
    if (!runtime || runtime.status !== 'active') return false;
    this.trackedQuestId = questId;
    this.emitChange();
    return true;
  }

  refreshAutoStarts(): void {
    for (const quest of this.definitions.values()) {
      if (!quest.autoStart || this.runtimes.has(quest.id) || this.progress.isQuestCompleted(quest.id)) continue;
      if (this.startConditionsMet(quest)) this.activateQuest(quest.id);
    }
  }

  // ─── 统一事件入口 ───

  reportEvent(event: QuestEvent): void {
    this.eventQueue.push(event);
    if (this.processingEvents) return;

    this.processingEvents = true;
    try {
      while (this.eventQueue.length > 0) {
        const next = this.eventQueue.shift();
        if (next) this.processEvent(next);
      }
    } finally {
      this.processingEvents = false;
    }
  }

  private processEvent(event: QuestEvent): void {
    let changed = false;
    const activeIds = [...this.runtimes.values()]
      .filter((runtime) => runtime.status === 'active')
      .map((runtime) => runtime.questId);

    for (const questId of activeIds) {
      const quest = this.definitions.get(questId);
      const runtime = this.runtimes.get(questId);
      if (!quest || !runtime || runtime.status !== 'active') continue;
      const stepIdx = this.resolveStepIndex(quest, runtime);
      const step = quest.steps[stepIdx];
      const stepRuntime = runtime.steps[stepIdx];
      if (!step || !stepRuntime) continue;

      for (let index = 0; index < step.objectives.length; index++) {
        const objective = step.objectives[index];
        const objectiveRuntime = stepRuntime.objectives[index];
        if (!objectiveRuntime || objectiveRuntime.done) continue;
        if (this.applyEventToObjective(event, objective, objectiveRuntime)) changed = true;
      }

      if (this.isStepComplete(step, stepRuntime)) {
        stepRuntime.done = true;
        changed = true;
        if (step.onCompleteText) this.services.notify?.(step.onCompleteText, 'step');
        runtime.currentStepIndex += 1;
        if (runtime.currentStepIndex < quest.steps.length) {
          runtime.currentStepId = quest.steps[runtime.currentStepIndex].id;
        }
        this.advanceOrComplete(quest, runtime);
      }
    }

    this.refreshAutoStarts();
    if (changed) this.emitChange();
  }

  private applyEventToObjective(
    event: QuestEvent,
    objective: QuestObjective,
    runtime: ObjectiveProgress,
  ): boolean {
    const needed = requiredCount(objective);
    let increment = 0;

    switch (objective.type) {
      case 'reach_location': {
        if (event.type === 'scene_entered' && !objective.location && event.sceneId === objective.target) increment = 1;
        if (event.type === 'location_reached' && event.sceneId === objective.target) {
          if (!objective.location) {
            increment = 1;
          } else {
            const radius = objective.location.radius ?? 1;
            const distance = Math.hypot(event.x - objective.location.x, event.y - objective.location.y);
            if (distance <= radius) increment = 1;
          }
        }
        break;
      }
      case 'talk_to_npc':
        if (event.type === 'dialogue_completed' && event.npcId === objective.target) {
          if (objective.dialogueId) {
            if (event.dialogueId === objective.dialogueId) increment = 1;
          } else {
            increment = 1;
          }
        }
        break;
      case 'collect_item':
        if (event.type === 'item_collected' && event.itemId === objective.target) {
          if (objective.source === 'world' && event.sourceId && event.sourceId.startsWith('reward:')) break;
          increment = positiveCount(event.count);
        }
        break;
      case 'submit_item':
        if (
          event.type === 'item_submitted'
          && event.itemId === objective.target
          && event.npcId === objective.submitTo
        ) increment = positiveCount(event.count);
        break;
      case 'trigger_event':
        if (event.type === 'event_triggered' && event.eventId === objective.target) increment = 1;
        break;
      case 'custom_flag':
        if (event.type === 'flag_changed' && event.flag === objective.target && event.value) increment = needed;
        break;
    }

    if (increment <= 0) return false;
    runtime.current = Math.min(needed, runtime.current + increment);
    runtime.done = runtime.current >= needed;
    return true;
  }

  // ─── 查询 ───

  getRuntime(questId: string): QuestRuntime | null {
    const runtime = this.runtimes.get(questId);
    return runtime ? cloneRuntime(runtime) : null;
  }

  getAllRuntimes(): QuestRuntime[] {
    return [...this.runtimes.values()].map(cloneRuntime);
  }

  getActiveQuests(): QuestView[] {
    return [...this.runtimes.values()]
      .filter((runtime) => runtime.status === 'active')
      .map((runtime) => this.createView(runtime))
      .filter((view): view is QuestView => Boolean(view));
  }

  getTrackedQuest(): QuestView | null {
    if (!this.trackedQuestId) return null;
    const runtime = this.runtimes.get(this.trackedQuestId);
    return runtime ? this.createView(runtime) : null;
  }

  get trackedQuest(): string | null {
    return this.trackedQuestId;
  }

  get completedQuests(): string[] {
    return this.progress.getCompletedQuests();
  }

  getPendingSubmissions(npcId: string): PendingSubmission[] {
    const result: PendingSubmission[] = [];
    for (const view of this.getActiveQuests()) {
      if (!view.currentStep || !view.currentStepRuntime) continue;
      for (let index = 0; index < view.currentStep.objectives.length; index++) {
        const objective = view.currentStep.objectives[index];
        const objectiveRuntime = view.currentStepRuntime.objectives[index];
        if (
          objective.type !== 'submit_item'
          || objective.submitTo !== npcId
          || !objectiveRuntime
          || objectiveRuntime.done
        ) continue;
        result.push({
          questId: view.definition.id,
          stepId: view.currentStep.id,
          itemId: objective.target,
          npcId,
          remaining: Math.max(0, requiredCount(objective) - objectiveRuntime.current),
        });
      }
    }
    return result;
  }

  // ─── 存档 ───

  serialize(): QuestManagerState {
    return {
      questRuntimes: this.getAllRuntimes(),
      trackedQuestId: this.trackedQuestId,
    };
  }

  restore(saved?: Partial<QuestManagerState>): void {
    this.runtimes.clear();
    for (const candidate of saved?.questRuntimes ?? []) {
      const quest = this.definitions.get(candidate.questId);
      if (!quest) continue;
      const restored = this.sanitizeRuntime(quest, candidate);
      this.runtimes.set(restored.questId, restored);
    }

    const requestedTracked = saved?.trackedQuestId ?? null;
    this.trackedQuestId = requestedTracked && this.runtimes.get(requestedTracked)?.status === 'active'
      ? requestedTracked
      : null;
    if (!this.trackedQuestId) this.trackFirstActiveQuest(false);
    this.refreshAutoStarts();
    this.reconcileAllActiveQuests();
    this.emitChange();
  }

  subscribe(listener: QuestListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── 内部推进与奖励 ───

  private createRuntime(quest: Quest): QuestRuntime {
    return {
      questId: quest.id,
      status: 'active',
      currentStepIndex: 0,
      currentStepId: quest.steps[0]?.id,
      steps: quest.steps.map((step) => ({
        stepId: step.id,
        objectives: step.objectives.map((obj, index) => ({
          index,
          objectiveId: obj.id,
          current: 0,
          done: false,
        })),
        done: false,
      })),
      startedAt: this.now(),
    };
  }

  private reconcileAllActiveQuests(): void {
    for (const runtime of this.runtimes.values()) {
      const quest = this.definitions.get(runtime.questId);
      if (quest && runtime.status === 'active') this.reconcileRuntime(quest, runtime);
    }
  }

  /**
   * Resolve current step index from currentStepId when available,
   * falling back to currentStepIndex for legacy saves.
   */
  private resolveStepIndex(quest: Quest, runtime: QuestRuntime): number {
    if (runtime.currentStepId) {
      const idx = quest.steps.findIndex(s => s.id === runtime.currentStepId);
      if (idx >= 0) {
        runtime.currentStepIndex = idx;
        return idx;
      }
    }
    return runtime.currentStepIndex;
  }

  /** 激活/读档时只对可从当前世界状态直接判定的目标做一次对齐。 */
  private reconcileRuntime(quest: Quest, runtime: QuestRuntime): void {
    while (runtime.status === 'active') {
      const stepIdx = this.resolveStepIndex(quest, runtime);
      const step = quest.steps[stepIdx];
      const stepRuntime = runtime.steps[stepIdx];
      if (!step || !stepRuntime) {
        this.completeQuest(quest, runtime);
        break;
      }

      let changed = false;
      for (let index = 0; index < step.objectives.length; index++) {
        const objective = step.objectives[index];
        const objectiveRuntime = stepRuntime.objectives[index];
        if (!objectiveRuntime || objectiveRuntime.done) continue;
        const current = this.getStatefulObjectiveValue(objective);
        if (current <= objectiveRuntime.current) continue;
        objectiveRuntime.current = Math.min(requiredCount(objective), current);
        objectiveRuntime.done = objectiveRuntime.current >= requiredCount(objective);
        changed = true;
      }

      if (!this.isStepComplete(step, stepRuntime)) {
        if (changed) this.emitChange();
        break;
      }
      stepRuntime.done = true;
      if (step.onCompleteText) this.services.notify?.(step.onCompleteText, 'step');
      runtime.currentStepIndex += 1;
      if (runtime.currentStepIndex < quest.steps.length) {
        runtime.currentStepId = quest.steps[runtime.currentStepIndex].id;
      }
      this.advanceOrComplete(quest, runtime);
    }
  }

  private getStatefulObjectiveValue(objective: QuestObjective): number {
    const needed = requiredCount(objective);
    if (objective.type === 'custom_flag') return this.progress.hasFlag(objective.target) ? needed : 0;
    if (objective.type === 'collect_item') {
      return Math.min(needed, Math.max(0, this.services.getInventoryCount?.(objective.target) ?? 0));
    }
    if (objective.type === 'reach_location') {
      const world = this.services.getWorldSnapshot?.();
      if (!world || world.sceneId !== objective.target) return 0;
      if (!objective.location) return 1;
      if (world.x === undefined || world.y === undefined) return 0;
      const radius = objective.location.radius ?? 1;
      return Math.hypot(world.x - objective.location.x, world.y - objective.location.y) <= radius ? 1 : 0;
    }
    return 0;
  }

  private advanceOrComplete(quest: Quest, runtime: QuestRuntime): void {
    if (runtime.currentStepIndex >= quest.steps.length) {
      this.completeQuest(quest, runtime);
      return;
    }
    this.reconcileRuntime(quest, runtime);
  }

  private completeQuest(quest: Quest, runtime: QuestRuntime): void {
    if (runtime.status === 'completed') return;
    runtime.status = 'completed';
    runtime.completedAt = this.now();
    this.progress.recordQuestCompleted(quest.id);
    this.grantRewards(quest);
    for (const flag of quest.onCompleteFlags ?? []) this.progress.setFlag(flag);
    if (quest.advanceStageTo) this.progress.setStage(quest.advanceStageTo);
    this.services.notify?.(quest.completionText || `任务完成：${quest.title}`, 'completed');
    if (this.trackedQuestId === quest.id) this.trackFirstActiveQuest(false);
  }

  forceCompleteQuest(questId: string): boolean {
    const def = this.definitions.get(questId);
    if (!def) return false;
    let runtime = this.runtimes.get(questId);
    if (!runtime) {
      this.activateQuest(questId, true);
      runtime = this.runtimes.get(questId);
      if (!runtime) return false;
    }
    this.completeQuest(def, runtime);
    return true;
  }

  private grantRewards(quest: Quest): void {
    const rewards = quest.rewards;
    if (!rewards) return;

    for (const item of rewards.items ?? []) {
      if (item == null) continue;
      const itemId = typeof item === 'string' ? item : item.itemId;
      if (!itemId) continue;
      const count = typeof item === 'string' ? 1 : positiveCount(item.count);
      const granted = this.services.grantItem?.(itemId, count) ?? false;
      if (granted) {
        this.reportEvent({ type: 'item_collected', itemId, count, sourceId: `reward:${quest.id}` });
      } else {
        this.services.notify?.(`物品奖励发放失败：${itemId} ×${count}`, 'error');
      }
    }

    const exp = Math.max(0, Math.trunc(rewards.exp ?? 0));
    if (exp > 0) {
      this.progress.addExp(exp);
      this.services.grantPlayerExp?.(exp);
    }

    for (const flag of rewards.flags ?? []) this.progress.setFlag(flag);
    for (const sceneId of rewards.unlockScenes ?? []) {
      this.progress.setFlag(`scene_unlocked:${sceneId}`);
      this.services.unlockScene?.(sceneId);
    }
    for (const dialogueId of rewards.unlockDialogues ?? []) {
      this.progress.setFlag(`dialogue_unlocked:${dialogueId}`);
      this.services.unlockDialogue?.(dialogueId);
    }
  }

  private isStepComplete(step: QuestStep, runtime: StepRuntime): boolean {
    if (runtime.objectives.length === 0) return false;
    return (step.logic ?? 'AND') === 'OR'
      ? runtime.objectives.some((objective) => objective.done)
      : runtime.objectives.every((objective) => objective.done);
  }

  private startConditionsMet(quest: Quest): boolean {
    // 阶段过滤：任务标了 stage 且与当前阶段不符时直接拦截
    if (quest.stage && quest.stage !== this.progress.getStage()) return false;

    const condition = quest.startCondition;
    if (!condition) return true;

    // 新格式：conditions 数组
    const entries = condition.conditions;
    if (entries && entries.length > 0) {
      const logic = condition.logic ?? 'AND';
      const results = entries.map((entry) => this.evaluateStartCondition(entry));
      return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
    }

    // 旧格式兼容（normalize 未迁移的遗留数据）
    const checks: boolean[] = [];
    if (condition.questsCompleted?.length) {
      checks.push(condition.questsCompleted.every((id) => this.progress.isQuestCompleted(id)));
    }
    if (condition.flags?.length) checks.push(this.progress.hasAllFlags(condition.flags));
    if (condition.sceneId) checks.push(this.services.getWorldSnapshot?.().sceneId === condition.sceneId);
    if (checks.length === 0) return true;
    return (condition.logic ?? 'AND') === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
  }

  private evaluateStartCondition(entry: StartConditionEntry): boolean {
    return evaluateStartConditionEntry(entry, this.conditionContext());
  }

  private conditionContext(): ConditionContext {
    return {
      isQuestCompleted: (id) => this.progress.isQuestCompleted(id),
      hasItem: (id) => (this.services.getInventoryCount?.(id) ?? 0) > 0,
      hasFlag: (f) => this.progress.hasFlag(f),
      isStageAtLeast: (s) => this.progress.isStageAtLeast(s, this.services.stageOrder ?? []),
    };
  }

  private createView(runtime: QuestRuntime): QuestView | null {
    const definition = this.definitions.get(runtime.questId);
    if (!definition) return null;
    return {
      definition: cloneQuest(definition),
      runtime: cloneRuntime(runtime),
      currentStep: definition.steps[runtime.currentStepIndex] ? cloneStep(definition.steps[runtime.currentStepIndex]) : null,
      currentStepRuntime: runtime.steps[runtime.currentStepIndex]
        ? cloneStepRuntime(runtime.steps[runtime.currentStepIndex])
        : null,
    };
  }

  private sanitizeRuntime(quest: Quest, saved: QuestRuntime): QuestRuntime {
    const base = this.createRuntime(quest);
    base.status = saved.status;
    base.startedAt = Number.isFinite(saved.startedAt) ? saved.startedAt : this.now();
    base.completedAt = saved.completedAt;
    base.currentStepIndex = Math.max(0, Math.min(saved.currentStepIndex, quest.steps.length));
    base.steps = base.steps.map((step, stepIndex) => {
      const candidate = saved.steps.find((savedStep) => savedStep.stepId === step.stepId) ?? saved.steps[stepIndex];
      if (!candidate) return step;
      return {
        stepId: step.stepId,
        done: Boolean(candidate.done),
        objectives: step.objectives.map((_objectiveRuntime, index) => {
          const objective = quest.steps[stepIndex].objectives[index];
          const savedObjective = candidate.objectives.find((item) => item.index === index);
          const current = Math.max(0, Math.min(requiredCount(objective), savedObjective?.current ?? 0));
          return { index, current, done: current >= requiredCount(objective) || Boolean(savedObjective?.done) };
        }),
      };
    });
    return base;
  }

  private onProgressChange(change: ProgressChange): void {
    if (this.suppressAutoStarts) return;
    if (change.type === 'flag') {
      this.reportEvent({ type: 'flag_changed', flag: change.flag, value: change.value });
    } else {
      this.refreshAutoStarts();
    }
  }

  private trackFirstActiveQuest(emit = true): void {
    this.trackedQuestId = [...this.runtimes.values()].find((runtime) => runtime.status === 'active')?.questId ?? null;
    if (emit) this.emitChange();
  }

  private now(): number {
    return this.services.now?.() ?? Date.now();
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }
}

function positiveCount(value?: number): number {
  return Math.max(1, Math.trunc(value ?? 1));
}

function requiredCount(objective: QuestObjective): number {
  return positiveCount(objective.count);
}

function cloneQuest(quest: Quest): Quest {
  return {
    ...quest,
    startCondition: quest.startCondition
      ? {
          ...quest.startCondition,
          conditions: quest.startCondition.conditions
            ? quest.startCondition.conditions.map((entry) => ({ ...entry }))
            : undefined,
          questsCompleted: quest.startCondition.questsCompleted ? [...quest.startCondition.questsCompleted] : undefined,
          flags: quest.startCondition.flags ? [...quest.startCondition.flags] : undefined,
        }
      : undefined,
    steps: quest.steps.map(cloneStep),
    rewards: quest.rewards
      ? {
          ...quest.rewards,
          items: quest.rewards.items?.map((item) => typeof item === 'string' ? item : { ...item }),
          flags: quest.rewards.flags ? [...quest.rewards.flags] : undefined,
          unlockScenes: quest.rewards.unlockScenes ? [...quest.rewards.unlockScenes] : undefined,
          unlockDialogues: quest.rewards.unlockDialogues ? [...quest.rewards.unlockDialogues] : undefined,
        }
      : undefined,
    onCompleteFlags: quest.onCompleteFlags ? [...quest.onCompleteFlags] : undefined,
  };
}

function cloneStep(step: QuestStep): QuestStep {
  return {
    ...step,
    objectives: step.objectives.map((objective) => ({
      ...objective,
      location: objective.location ? { ...objective.location } : undefined,
    })),
  };
}

function cloneStepRuntime(step: StepRuntime): StepRuntime {
  return {
    ...step,
    objectives: step.objectives.map((objective) => ({ ...objective })),
  };
}

function cloneRuntime(runtime: QuestRuntime): QuestRuntime {
  return {
    ...runtime,
    steps: runtime.steps.map(cloneStepRuntime),
  };
}

/** 旧代码若仍引用 QuestSystem，可在迁移期继续编译。 */
export { QuestManager as QuestSystem };
