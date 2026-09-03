import type { StageStateData } from '../data/quests/editor-types';
import type { NpcSpriteVariant } from '../types/npc';

/**
 * 剧情阶段权威枚举：字符串 ID 是唯一命名，数字位置（1..N）仅是内部排序。
 * Quest / Dialogue 的 stage 字段、Stage Selector、stage.set 动作全部使用同一套 ID。
 */
export const STAGE_ORDER = ['prep', 'debate1', 'meeting', 'debate2', 'finale'] as const;
export type StageId = (typeof STAGE_ORDER)[number] | '';

export function stageIdToNumber(stage: string): number {
  const idx = (STAGE_ORDER as readonly string[]).indexOf(stage);
  return idx >= 0 ? idx + 1 : 1;
}

export function stageNumberToId(n: number): string {
  return STAGE_ORDER[Math.max(0, Math.min(STAGE_ORDER.length - 1, n - 1))];
}

/** 统一标签：Stage Selector 与 Quest Manager 下拉共用 */
export function stageLabel(n: number): string {
  if (n <= 0) return 'Stage 0 (全局基础)';
  return `Stage ${n} · ${stageNumberToId(n)}`;
}

/** 实体在某个 stage 的有效摆放状态（property-level 合并） */
export interface EffectivePlacement {
  sceneId?: string;
  x?: number;
  y?: number;
  exists?: boolean;
  spriteVariant?: NpcSpriteVariant;
}

type OverrideLayer = Record<string, Partial<EffectivePlacement>>;

/**
 * Stage Manager：全局剧情阶段 + 世界摆放状态解析。
 *
 * 数据模型（持久化在 server/data/stage-state.json）：
 * - stages: number[]     剧情阶段列表（0 为隐含 Global Base，不入列）
 * - base:                Global Base 层（Stage 0 编辑写入这里）
 * - overrides:           每个 stage 的增量覆盖，仅记录被改过的属性
 *
 * 解析规则：effective(stage N) = base 依次叠加 stage 1..N 的 override（property-level merge）。
 * 后面的 stage 默认继承前面；override 只向后继承，不向前传播。
 */
export class StageManager {
  private stages: number[] = STAGE_ORDER.map((_, i) => i + 1);
  private base: OverrideLayer = {};
  private overrides: Record<number, OverrideLayer> = {};
  private transitions: Record<string, { x: number; y: number; targetScene: string; targetX: number; targetY: number }[]> = {};
  private runtimeStage = 1;
  /** -1 = 无预览（runtime 模式）；>=0 = 编辑器预览指定 stage（含 0=Global Base） */
  private previewStage = -1;

  // ─── 数据装载 / 导出 ───

  loadFromState(state: StageStateData | undefined): void {
    if (!state) return;
    this.stages = state.stages.length ? [...state.stages].sort((a, b) => a - b) : STAGE_ORDER.map((_, i) => i + 1);
    this.base = {};
    for (const [id, p] of Object.entries(state.base ?? {})) {
      this.base[id] = { ...(p as EffectivePlacement) };
    }
    this.overrides = {};
    for (const [k, layer] of Object.entries(state.overrides ?? {})) {
      const n = Number(k);
      if (!Number.isFinite(n) || n <= 0) continue;
      const copy: OverrideLayer = {};
      for (const [id, p] of Object.entries(layer ?? {})) copy[id] = { ...(p as Partial<EffectivePlacement>) };
      this.overrides[n] = copy;
    }
    this.transitions = {};
    for (const [sceneId, list] of Object.entries(state.transitions ?? {})) {
      if (Array.isArray(list)) this.transitions[sceneId] = list.map(t => ({ ...t }));
    }
  }

  getTransitions(sceneId: string): { x: number; y: number; targetScene: string; targetX: number; targetY: number }[] | undefined {
    return this.transitions[sceneId];
  }

  setTransitions(sceneId: string, list: { x: number; y: number; targetScene: string; targetX: number; targetY: number }[]): void {
    if (list.length === 0) delete this.transitions[sceneId];
    else this.transitions[sceneId] = list.map(t => ({ ...t }));
  }

  /** 捕获当前所有场景的实体摆放为 base 层（旧项目迁移：无 stageState 时以源码定义为 Base） */
  captureBaseFromScenes(placements: Record<string, { sceneId: string; x: number; y: number }>): void {
    for (const [id, p] of Object.entries(placements)) {
      this.base[id] = { sceneId: p.sceneId, x: p.x, y: p.y, exists: true };
    }
  }

  snapshot(): StageStateData {
    const overrides: StageStateData['overrides'] = {};
    for (const [n, layer] of Object.entries(this.overrides)) {
      overrides[String(n)] = JSON.parse(JSON.stringify(layer));
    }
    return {
      stages: [...this.stages],
      base: JSON.parse(JSON.stringify(this.base)),
      overrides,
      transitions: JSON.parse(JSON.stringify(this.transitions)),
    };
  }

  // ─── Stage 列表 ───

  getStageList(): number[] {
    return [0, ...this.stages.filter(n => n > 0).sort((a, b) => a - b)];
  }

  // ─── Runtime / Preview stage（分离）───

  getCurrentStage(): number {
    return this.runtimeStage;
  }

  /** 正式游戏推进阶段（stage.set action 调用） */
  setCurrentStage(stage: number): void {
    if (stage >= 1) this.runtimeStage = stage;
  }

  getPreviewStage(): number {
    return this.previewStage;
  }

  /** 编辑器预览阶段切换：只影响预览，不动 runtime。exitPreview() 回到 runtime 模式 */
  setPreviewStage(stage: number): void {
    this.previewStage = stage;
  }

  exitPreview(): void {
    this.previewStage = -1;
  }

  isPreviewing(): boolean {
    return this.previewStage >= 0;
  }

  /** runtime 用当前阶段；编辑模式（previewStage >= 0，含 Stage 0）用预览阶段 */
  private activeStage(): number {
    return this.previewStage >= 0 ? this.previewStage : this.runtimeStage;
  }

  // ─── Base 层（Stage 0）───

  /** 显式编辑 Base（Stage 0 拖动等）：覆盖写入 */
  setBasePlacement(entityId: string, p: Partial<EffectivePlacement>): void {
    this.base[entityId] = { ...(this.base[entityId] ?? {}), ...p, exists: p.exists ?? this.base[entityId]?.exists ?? true } as EffectivePlacement;
  }

  /** 自动捕获（引擎启动从静态场景填充）：文件加载的 Base 优先，只补缺失字段 */
  captureBasePlacement(entityId: string, p: Partial<EffectivePlacement>): void {
    const prev = this.base[entityId];
    if (prev) {
      this.base[entityId] = { sceneId: prev.sceneId ?? p.sceneId, x: prev.x ?? p.x, y: prev.y ?? p.y, exists: prev.exists ?? p.exists ?? true, spriteVariant: prev.spriteVariant ?? p.spriteVariant };
    } else {
      this.base[entityId] = { sceneId: p.sceneId, x: p.x, y: p.y, exists: p.exists ?? true, spriteVariant: p.spriteVariant };
    }
  }

  removeBasePlacement(entityId: string): void {
    delete this.base[entityId];
  }

  clearAllOverridesFor(entityId: string, props?: (keyof EffectivePlacement)[]): void {
    for (const layer of Object.values(this.overrides)) {
      const o = layer[entityId];
      if (!o) continue;
      if (!props) { delete layer[entityId]; continue; }
      for (const p of props) delete o[p];
      if (Object.keys(o).length === 0) delete layer[entityId];
    }
  }

  // ─── Stage Override 层 ───

  setOverride(stage: number, entityId: string, p: Partial<EffectivePlacement>): void {
    if (stage <= 0) { this.setBasePlacement(entityId, p); return; }
    const layer = (this.overrides[stage] ?? {});
    layer[entityId] = { ...(layer[entityId] ?? {}), ...p };
    this.overrides[stage] = layer;
    // 无意义 override 自动清理：与上一级有效值完全一致时移除
    this.pruneRedundantOverride(stage, entityId);
  }

  removeOverride(stage: number, entityId: string): void {
    const layer = this.overrides[stage];
    if (layer) delete layer[entityId];
  }

  private pruneRedundantOverride(stage: number, entityId: string): void {
    if (stage <= 0) return;
    const o = this.overrides[stage]?.[entityId];
    if (!o) return;
    const prev = this.resolveUpTo(stage - 1, entityId);
    const redundant = Object.entries(o).every(([k, v]) => prev[k as keyof EffectivePlacement] === v);
    if (redundant) {
      delete this.overrides[stage][entityId];
      if (Object.keys(this.overrides[stage]).length === 0) delete this.overrides[stage];
    }
  }

  // ─── 有效值解析（property-level 继承）───

  private resolveUpTo(stage: number, entityId: string): EffectivePlacement {
    let result: EffectivePlacement = { ...(this.base[entityId] ?? {}) };
    for (const n of this.stages) {
      if (n > stage) break;
      const o = this.overrides[n]?.[entityId];
      if (o) result = { ...result, ...o };
    }
    return result;
  }

  resolve(stage: number, entityId: string): EffectivePlacement {
    return this.resolveUpTo(stage, entityId);
  }

  // ─── 编辑器语义操作（级联向后传播）───

  /**
   * 属性级强制向后覆盖：写当前层后，删除后续 Stage 对同一实体同一属性的 override，
   * 使后续 Stage 重新继承当前值。只清除指定属性，不动 exists/sceneId 等无关字段。
   */
  private clearPropsAfter(stage: number, entityId: string, props: (keyof EffectivePlacement)[]): void {
    for (const later of this.stages) {
      if (later <= stage) continue;
      const o = this.overrides[later]?.[entityId];
      if (!o) continue;
      for (const p of props) delete o[p];
      if (Object.keys(o).length === 0) {
        delete this.overrides[later][entityId];
        if (Object.keys(this.overrides[later]).length === 0) delete this.overrides[later];
      }
    }
  }

  /** 从指定 Stage 拖动位置：写入该层并强制向后传播 x/y */
  setPositionFromStage(stage: number, entityId: string, x: number, y: number): void {
    if (stage === 0) {
      this.setBasePlacement(entityId, { x, y });
    } else {
      this.setOverride(stage, entityId, { x, y });
    }
    this.clearPropsAfter(stage, entityId, ['x', 'y']);
  }

  /** 从指定 Stage 设置存在性：写入该层并强制向后传播 exists */
  setExistsFromStage(stage: number, entityId: string, exists: boolean): void {
    if (stage === 0) {
      this.setBasePlacement(entityId, { exists });
    } else {
      this.setOverride(stage, entityId, { exists });
    }
    this.clearPropsAfter(stage, entityId, ['exists']);
  }

  /** 从指定 Stage 跨场景移动：写入该层并强制向后传播 sceneId（可同时带坐标） */
  moveToSceneFromStage(stage: number, entityId: string, sceneId: string, x?: number, y?: number): void {
    const patch: Partial<EffectivePlacement> = x !== undefined && y !== undefined ? { sceneId, x, y } : { sceneId };
    if (stage === 0) {
      this.setBasePlacement(entityId, patch);
    } else {
      this.setOverride(stage, entityId, patch);
    }
    this.clearPropsAfter(stage, entityId, patch.x !== undefined ? ['sceneId', 'x', 'y'] : ['sceneId']);
  }

  /**
   * 从指定 Stage 设置贴图视角：写入该层并强制向后传播 spriteVariant。
   * 只清除后续 Stage 的 spriteVariant，不影响 x/y/exists/sceneId。
   */
  setSpriteVariantFromStage(stage: number, entityId: string, variant: NpcSpriteVariant): void {
    if (stage === 0) {
      this.setBasePlacement(entityId, { spriteVariant: variant });
    } else {
      this.setOverride(stage, entityId, { spriteVariant: variant });
    }
    this.clearPropsAfter(stage, entityId, ['spriteVariant']);
  }

  /**
   * 恢复继承：删除当前 Stage 对 spriteVariant 的显式 override，
   * 使其回退采用前一个 Stage（或 base）的贴图。不影响其它 Stage、不动位置。
   */
  restoreSpriteVariantInheritance(stage: number, entityId: string): void {
    if (stage <= 0) {
      const b = this.base[entityId];
      if (b) delete b.spriteVariant;
      return;
    }
    const o = this.overrides[stage]?.[entityId];
    if (!o) return;
    delete o.spriteVariant;
    if (Object.keys(o).length === 0) {
      delete this.overrides[stage][entityId];
      if (Object.keys(this.overrides[stage]).length === 0) delete this.overrides[stage];
    }
  }

  // ─── 兼容入口（内部转为显式 stage 语义）───

  /** 拖动实体：按 activeStage 派发到显式方法 */
  setPosition(kind: 'npc' | 'item', entityId: string, x: number, y: number): void {
    void kind;
    this.setPositionFromStage(this.activeStage(), entityId, x, y);
  }

  /**
   * 编辑器新增实体。
   * - Stage 0：写入 base（所有 stage 都存在）
   * - Stage 1+：base 无定义 + 从该 stage 起存在（之前 stage 不存在）
   */
  addEntity(kind: 'npc' | 'item', entityId: string, name: string, sceneId: string, x: number, y: number): void {
    void name; void kind;
    const stage = this.activeStage();
    if (stage <= 0) {
      this.setBasePlacement(entityId, { sceneId, x, y, exists: true });
    } else {
      this.setOverride(stage, entityId, { sceneId, x, y, exists: true });
      this.clearPropsAfter(stage, entityId, ['sceneId', 'x', 'y', 'exists']);
    }
  }

  /**
   * 编辑器删除实体。
   * - Stage 0：全局删除（base 移除 + 清全部 override），返回 true 供调用方删 definition
   * - Stage 1+：从该 stage 起 exists=false，返回 false
   */
  removeEntity(kind: 'npc' | 'item', entityId: string): boolean {
    void kind;
    const stage = this.activeStage();
    if (stage <= 0) {
      this.removeBasePlacement(entityId);
      this.clearAllOverridesFor(entityId);
      return true;
    }
    this.setExistsFromStage(stage, entityId, false);
    return false;
  }

  // ─── Runtime 世界状态查询 ───

  /** NPC/Item 在指定 stage 的有效状态（供引擎构建场景实体） */
  getEffectiveNpcState(entityId: string, stage: number): EffectivePlacement {
    return this.resolve(stage, entityId);
  }

  getEffectiveItemState(entityId: string, stage: number): EffectivePlacement {
    return this.resolve(stage, entityId);
  }
}
