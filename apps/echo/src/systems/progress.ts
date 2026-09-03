// ============================================================
// ProgressManager — 全局进度唯一真相源
// ============================================================

import type { GlobalProgressState } from '../data/quests/types';

export type ProgressChange =
  | { type: 'flag'; flag: string; value: boolean }
  | { type: 'chapter'; chapter: number }
  | { type: 'stage'; stage: string }
  | { type: 'exp'; totalExp: number; delta: number }
  | { type: 'quest_completed'; questId: string; completed: boolean }
  | { type: 'restore' };

type ProgressListener = (change: ProgressChange) => void;

export class ProgressManager {
  private flags = new Set<string>();
  private chapter = 1;
  private stage = 'prep';
  private totalExp = 0;
  private completedQuestIds = new Set<string>();
  private listeners = new Set<ProgressListener>();
  private legacyOnChange: (() => void) | null = null;

  constructor(saved?: Partial<GlobalProgressState>) {
    if (saved) this.restore(saved, false);
  }

  // ─── 标志管理 ───

  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  setFlag(flag: string, value = true): void {
    const normalized = flag.trim();
    if (!normalized) return;
    if (!value) {
      this.removeFlag(normalized);
      return;
    }
    if (this.flags.has(normalized)) return;
    this.flags.add(normalized);
    this.emit({ type: 'flag', flag: normalized, value: true });
  }

  removeFlag(flag: string): void {
    if (!this.flags.delete(flag)) return;
    this.emit({ type: 'flag', flag, value: false });
  }

  hasAllFlags(flags: readonly string[]): boolean {
    return flags.every((flag) => this.flags.has(flag));
  }

  hasAnyFlag(flags: readonly string[]): boolean {
    return flags.some((flag) => this.flags.has(flag));
  }

  getAllFlags(): string[] {
    return [...this.flags];
  }

  // ─── 章节管理 ───

  getChapter(): number {
    return this.chapter;
  }

  setChapter(chapter: number): void {
    const next = Math.max(1, Math.floor(chapter));
    if (this.chapter === next) return;
    this.chapter = next;
    this.setFlag(`chapter_${next}_started`);
    this.emit({ type: 'chapter', chapter: next });
  }

  advanceChapter(): void {
    this.setChapter(this.chapter + 1);
  }

  // ─── 阶段管理 ───

  getStage(): string {
    return this.stage;
  }

  setStage(stage: string): void {
    const next = stage.trim();
    if (!next || this.stage === next) return;
    this.stage = next;
    this.setFlag(`stage_${next}`);
    this.emit({ type: 'stage', stage: next });
  }

  /** stage 列表中的索引比较；未知 stage 视为 -1（永远不满足）。 */
  isStageAtLeast(target: string, order: readonly string[]): boolean {
    const currentIdx = order.indexOf(this.stage);
    const targetIdx = order.indexOf(target);
    if (targetIdx < 0) return false;
    return currentIdx >= targetIdx;
  }

  // ─── 累计经验 ───

  getExp(): number {
    return this.totalExp;
  }

  addExp(amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) return;
    const delta = Math.trunc(amount);
    const next = Math.max(0, this.totalExp + delta);
    const applied = next - this.totalExp;
    if (applied === 0) return;
    this.totalExp = next;
    this.emit({ type: 'exp', totalExp: next, delta: applied });
  }

  // ─── 已完成任务 ───

  isQuestCompleted(questId: string): boolean {
    return this.completedQuestIds.has(questId);
  }

  recordQuestCompleted(questId: string): void {
    if (this.completedQuestIds.has(questId)) return;
    this.completedQuestIds.add(questId);
    this.emit({ type: 'quest_completed', questId, completed: true });
  }

  /** 主要供任务编辑器重置测试状态使用。 */
  forgetQuestCompleted(questId: string): void {
    if (!this.completedQuestIds.delete(questId)) return;
    this.emit({ type: 'quest_completed', questId, completed: false });
  }

  getCompletedQuests(): string[] {
    return [...this.completedQuestIds];
  }

  // ─── 持久化 ───

  serialize(): GlobalProgressState {
    return {
      chapter: this.chapter,
      stage: this.stage,
      flags: [...this.flags],
      completedQuests: [...this.completedQuestIds],
      totalExp: this.totalExp,
    };
  }

  restore(saved: Partial<GlobalProgressState>, notify = true): void {
    this.chapter = Math.max(1, Math.floor(saved.chapter ?? 1));
    this.stage = typeof saved.stage === 'string' && saved.stage.trim() ? saved.stage.trim() : 'prep';
    this.flags = new Set((saved.flags ?? []).filter(Boolean));
    this.completedQuestIds = new Set((saved.completedQuests ?? []).filter(Boolean));
    this.totalExp = Math.max(0, Math.trunc(saved.totalExp ?? 0));
    if (notify) this.emit({ type: 'restore' });
  }

  // ─── 订阅 ───

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 兼容旧调用；新代码优先使用 subscribe。 */
  setOnChange(callback: (() => void) | null): void {
    this.legacyOnChange = callback;
  }

  private emit(change: ProgressChange): void {
    for (const listener of this.listeners) listener(change);
    this.legacyOnChange?.();
  }
}
