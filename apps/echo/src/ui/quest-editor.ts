// ============================================================
// Quest Editor — 方向左键打开的可视化任务编辑器
// ============================================================

import type { Quest, QuestObjective, QuestReward, QuestRewardItem, QuestRuntime, QuestStartCondition, QuestStep, StartConditionEntry, StartConditionType } from '../data/quests/types';
import type { DialogueTree, DialogueNode, DialogueLine, DialogueChoice, Emotion, EventType } from '../data/dialogues';
import {
  cloneQuestEditorProject,
  createEmptyQuestEditorProject,
  parseQuestEditorProject,
  CURRENT_SCHEMA_VERSION,
  type QuestEditorProject,
  type QuestPlacement,
  type QuestPlacementKind,
  type DialogueData,
} from '../data/quests/editor-types';
import { validateQuestDefinition } from '../systems/quest';

/** 可序列化的对话树（JSON 可直接传输/存储的版本） */
export type SerializedDialogueTree = DialogueTree;


export interface QuestEditorMapMarker {
  id: string;
  kind: QuestPlacementKind;
  label: string;
  x: number;
  y: number;
}

export interface QuestEditorSceneSnapshot {
  id: string;
  name: string;
  bgImage: string;
  worldW: number;
  worldH: number;
  markers: QuestEditorMapMarker[];
}

/** 对话树摘要（供编辑器列表/编辑使用） */
export interface DialogueSummary {
  id: string;
  scene: string;
  trigger: string;
  eventType?: string;
  cgUrl?: string;
  stage?: string;
  /** 起始节点的前几行文本预览 */
  preview: string;
  nodeCount: number;
}

export interface QuestEditorCallbacks {
  listScenes: () => Array<{ id: string; name: string }>;
  getScene: (sceneId: string) => QuestEditorSceneSnapshot | null;
  /** 返回空数组表示工程已成功应用到运行时。 */
  applyProject: (project: QuestEditorProject) => string[];
  activateQuest: (questId: string) => boolean;
  resetQuest: (questId: string) => void;
  getRuntime: (questId: string) => QuestRuntime | null;
  /** 可选项清单：供表单下拉使用，避免用户手填 ID */
  listCatalog: () => QuestEditorCatalog;
  /** 返回所有对话树摘要（供对话面板编辑阶段） */
  listDialogues: () => DialogueSummary[];
  /** 返回完整对话树（含所有节点和对话行），供对话编辑器使用 */
  getDialogueTree: (id: string) => SerializedDialogueTree | null;
}

/** 可选项清单条目：显示名 + ID */
export interface QuestEditorCatalogEntry {
  id: string;
  label: string;
}

/** 各类可选项集合，供表单下拉选择 */
export interface QuestEditorCatalog {
  /** 场景 ID（reach_location / startScene / unlockScenes 用） */
  scenes: QuestEditorCatalogEntry[];
  /** NPC 实体 ID（talk_to_npc / submitTo 用） */
  npcs: QuestEditorCatalogEntry[];
  /** 物品 ID（collect_item / submit_item / 奖励物品用） */
  items: QuestEditorCatalogEntry[];
  /** 事件 ID（trigger_event / unlockDialogues 用） */
  events: QuestEditorCatalogEntry[];
  /** 任务 ID（前置任务 questsCompleted 用） */
  quests: QuestEditorCatalogEntry[];
  /** 可用 flag 枚举（has_flag / onCompleteFlags / rewards.flags 用） */
  flags: QuestEditorCatalogEntry[];
  /** 游戏阶段列表（stage / advanceStageTo / stage_at_least 用） */
  stages: QuestEditorCatalogEntry[];
}

export class QuestEditor {
  private overlayEl!: HTMLDivElement;
  private questListEl!: HTMLDivElement;
  private questFormEl!: HTMLDivElement;
  private mapViewportEl!: HTMLDivElement;
  private mapStageEl!: HTMLDivElement;
  private mapImageEl!: HTMLImageElement;
  private markerLayerEl!: HTMLDivElement;
  private placementListEl!: HTMLDivElement;
  private sceneSelectEl!: HTMLSelectElement;
  private statusEl!: HTMLDivElement;
  private active = false;
  private placementMode = false;
  private selectedQuestId: string | null = null;
  private selectedSceneId = '';
  private project: QuestEditorProject;
  /** 可选项清单（构造时缓存，渲染下拉用） */
  private catalog: QuestEditorCatalog;
  private aiDialogEl: HTMLDivElement | null = null;
  private aiInputEl: HTMLTextAreaElement | null = null;

  private aiResultEl: HTMLDivElement | null = null;
  private questPanelEl!: HTMLDivElement;
  private dialoguePanelEl!: HTMLDivElement;
  private dialogueListEl!: HTMLDivElement;
  private dialogueDetailEl!: HTMLDivElement;
  private selectedDialogueId: string | null = null;

  constructor(
    private readonly callbacks: QuestEditorCallbacks,
    initialProject: QuestEditorProject = createEmptyQuestEditorProject(),
  ) {
    // 清理历史上双轨存储遗留的本地草稿，编辑数据只存在于源文件。
    try { localStorage.removeItem('echo_quest_editor_project_v1'); } catch { /* 忽略 */ }
    this.project = cloneQuestEditorProject(initialProject);
    this.catalog = callbacks.listCatalog();
    this.build();
    this.bind();
    this.populateScenes();
    void this.loadSavedProject();
  }

  // ─── DOM ───

  private build(): void {
    const overlay = document.createElement('div');
    overlay.id = 'quest-editor';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:10000', 'display:none', 'flex-direction:column',
      'background:#05080d', "font-family:'Noto Sans SC',sans-serif", 'color:#e0ffff',
    ].join(';');
    overlay.innerHTML = `
      <div style="height:50px;display:flex;align-items:center;gap:10px;padding:0 16px;background:#09131d;border-bottom:1px solid #00f3ff55;flex:none;">
        <strong style="font-family:'ZCOOL QingKe HuangYou',sans-serif;color:#00f3ff;letter-spacing:3px;font-size:18px;">QUEST MANAGER</strong>
        <div style="display:flex;gap:2px;margin-left:8px;">
          <button data-action="tab-quests" data-tab="quests" class="qe-tab-btn qe-tab-active">任务</button>
          <button data-action="tab-dialogues" data-tab="dialogues" class="qe-tab-btn">对话</button>
        </div>
        <span style="font-size:11px;color:#6d8a97;">定义层 / 运行时 / 地图锚点</span>
        <div data-role="status" style="margin-left:16px;font-size:12px;color:#8aa6b2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
        <button data-action="ai-generate" class="qe-btn" style="margin-left:auto;background:#1a0a2e;color:#e0a0ff;border-color:#5a2a7a;">✨ AI 生成</button>
        <button data-action="export" class="qe-btn">导出 JSON</button>
        <button data-action="write-file" class="qe-btn qe-warn">写入源文件</button>
        <button data-action="close" class="qe-btn">关闭（←）</button>
      </div>
      <div data-role="quest-panel" style="display:flex;flex-direction:column;min-height:0;flex:1;">
        <div style="display:grid;grid-template-columns:230px minmax(360px,1fr) minmax(400px,520px);min-height:0;flex:1;">
        <aside style="display:flex;flex-direction:column;min-height:0;border-right:1px solid #18313d;background:#071018;">
          <div style="display:flex;align-items:center;padding:10px;border-bottom:1px solid #18313d;">
            <span style="font-size:12px;color:#00f3ff;letter-spacing:2px;">任务定义</span>
            <button data-action="new-quest" class="qe-btn" style="margin-left:auto;">＋ 新建</button>
          </div>
          <div data-role="quest-list" style="overflow:auto;flex:1;padding:8px;"></div>
        </aside>
        <main style="display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid #18313d;">
          <div style="display:grid;grid-template-columns:140px 110px minmax(100px,1fr) minmax(100px,1fr) minmax(100px,1fr) auto;gap:6px;padding:8px;background:#071018;border-bottom:1px solid #18313d;align-items:center;">
            <select data-role="scene" class="qe-input"></select>
            <select data-role="placement-kind" class="qe-input">
              <option value="npc">NPC</option><option value="item">道具</option><option value="event">事件</option>
            </select>
            <input data-role="placement-id" class="qe-input" placeholder="锚点 ID">
            <input data-role="placement-target" class="qe-input" placeholder="对话/item/event ID">
            <input data-role="placement-label" class="qe-input" placeholder="显示名称">
            <button data-action="place" class="qe-btn qe-warn">地图放置</button>
          </div>
          <div data-role="map-viewport" style="position:relative;display:flex;align-items:center;justify-content:center;min-height:260px;flex:1;overflow:hidden;background:#02060a;">
            <div data-role="map-stage" style="position:relative;cursor:crosshair;box-shadow:0 0 30px #00f3ff18;">
              <img data-role="map-image" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;user-select:none;">
              <div data-role="marker-layer" style="position:absolute;inset:0;pointer-events:none;"></div>
            </div>
            <div data-role="place-hint" style="display:none;position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:6px 12px;background:#171000;border:1px solid #ffaa00;color:#ffaa00;font-size:12px;pointer-events:none;">点击地图确定位置 · Esc 取消</div>
          </div>
          <div style="height:120px;flex:none;border-top:1px solid #18313d;background:#071018;overflow:auto;padding:8px;">
            <div style="font-size:11px;color:#6d8a97;margin-bottom:5px;">当前场景任务锚点（右侧按钮可删除编辑器锚点）</div>
            <div data-role="placement-list"></div>
          </div>
        </main>
        <div data-role="quest-form" style="overflow:auto;min-height:0;padding:12px;background:#080d13;"></div>
      </div>
      </div>
      <div data-role="dialogue-panel" style="display:none;flex-direction:column;min-height:0;flex:1;">
        <div style="display:grid;grid-template-columns:280px 1fr;min-height:0;flex:1;">
          <aside style="display:flex;flex-direction:column;min-height:0;border-right:1px solid #18313d;background:#071018;">
            <div style="display:flex;align-items:center;padding:10px;border-bottom:1px solid #18313d;">
              <span style="font-size:12px;color:#00f3ff;letter-spacing:2px;">对话列表</span>
            </div>
            <div data-role="dialogue-list" style="overflow:auto;flex:1;padding:8px;"></div>
          </aside>
          <div data-role="dialogue-detail" style="overflow:auto;min-height:0;padding:16px;background:#080d13;"></div>
        </div>
      </div>

      <div data-role="ai-dialog" style="position:absolute;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:100;">
        <div style="background:#0a1118;border:1px solid #00ffff;padding:24px;border-radius:8px;width:440px;max-width:90%;">
          <div style="font-family:VT323,monospace;font-size:1.5rem;color:#00ffff;border-bottom:1px solid #00ffff33;padding-bottom:8px;margin-bottom:16px;">AI 任务生成</div>
          <textarea data-role="ai-prompt" rows="3" placeholder="用自然语言描述你想设计的任务..." style="width:100%;box-sizing:border-box;background:#050a0f;border:1px solid #00ffff44;color:#fff;padding:10px;font-size:14px;font-family:inherit;border-radius:4px;resize:vertical;"></textarea>
          <div data-role="ai-status" style="font-family:VT323,monospace;font-size:0.9rem;color:#eab308;margin:8px 0;min-height:20px;"></div>
          <div data-role="ai-result" style="margin-top:8px;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
            <button data-action="ai-cancel" style="padding:6px 16px;background:transparent;border:1px solid #ffffff44;color:#fff;cursor:pointer;border-radius:4px;">取消</button>
            <button data-action="ai-submit" style="padding:6px 16px;background:#00ffff22;border:1px solid #00ffff;color:#00ffff;cursor:pointer;border-radius:4px;font-weight:bold;">生成任务</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    this.questListEl = requiredElement(overlay, '[data-role="quest-list"]', HTMLDivElement);
    this.questFormEl = requiredElement(overlay, '[data-role="quest-form"]', HTMLDivElement);
    this.mapViewportEl = requiredElement(overlay, '[data-role="map-viewport"]', HTMLDivElement);
    this.mapStageEl = requiredElement(overlay, '[data-role="map-stage"]', HTMLDivElement);
    this.mapImageEl = requiredElement(overlay, '[data-role="map-image"]', HTMLImageElement);
    this.markerLayerEl = requiredElement(overlay, '[data-role="marker-layer"]', HTMLDivElement);
    this.placementListEl = requiredElement(overlay, '[data-role="placement-list"]', HTMLDivElement);
    this.sceneSelectEl = requiredElement(overlay, '[data-role="scene"]', HTMLSelectElement);
    this.statusEl = requiredElement(overlay, '[data-role="status"]', HTMLDivElement);
    this.aiDialogEl = overlay.querySelector('[data-role="ai-dialog"]');
    this.aiInputEl = overlay.querySelector('[data-role="ai-prompt"]');

    this.aiResultEl = overlay.querySelector('[data-role="ai-result"]');
    this.questPanelEl = requiredElement(overlay, '[data-role="quest-panel"]', HTMLDivElement);
    this.dialoguePanelEl = requiredElement(overlay, '[data-role="dialogue-panel"]', HTMLDivElement);
    this.dialogueListEl = requiredElement(overlay, '[data-role="dialogue-list"]', HTMLDivElement);
    this.dialogueDetailEl = requiredElement(overlay, '[data-role="dialogue-detail"]', HTMLDivElement);
  }

  private bind(): void {
    document.addEventListener('keydown', (event) => {
      if (event.code === 'ArrowLeft' && !isEditableTarget(event.target)) {
        event.preventDefault();
        this.toggle();
      } else if (event.code === 'Escape' && this.active) {
        event.preventDefault();
        if (this.aiDialogEl && this.aiDialogEl.style.display !== 'none') {
          this.closeAIDialog();
        } else if (this.placementMode) {
          this.setPlacementMode(false);
        } else {
          this.toggle(false);
        }
      }
    });

    this.overlayEl.addEventListener('click', (event) => this.handleOverlayClick(event));
    this.questFormEl.addEventListener('click', (event) => this.handleQuestFormClick(event));
    // 目标类型切换 → 同步表单到 project 并重渲染（让 target 下拉按新 type 切换可选清单）
    this.questFormEl.addEventListener('change', (event) => {
      const target = event.target as HTMLElement;
      if (target.classList?.contains('qe-type-select') || target.classList?.contains('qe-start-cond-type')) {
        this.syncSelectedQuestFromForm();
        this.renderQuestForm();
      }
    });
    this.mapStageEl.addEventListener('click', (event) => this.handleMapClick(event));
    this.sceneSelectEl.addEventListener('change', () => {
      this.selectedSceneId = this.sceneSelectEl.value;
      this.renderMap();
    });
    this.mapImageEl.addEventListener('load', () => this.layoutMap());
    window.addEventListener('resize', () => {
      if (this.active) this.layoutMap();
    });
  }

  private handleOverlayClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-quest-id], [data-delete-placement], [data-dialogue-id]');
    if (!target) return;

    const dialogueId = target.dataset.dialogueId;
    if (dialogueId) {
      this.selectedDialogueId = dialogueId;
      this.renderDialogueList();
      this.renderDialogueDetail();
      return;
    }

    const questId = target.dataset.questId;
    if (questId) {
      try {
        this.syncSelectedQuestFromForm();
        this.selectedQuestId = questId;
        this.renderQuestList();
        this.renderQuestForm();
      } catch (err) {
        console.error('[QuestEditor] 点击任务出错:', err);
        this.questFormEl.innerHTML = `<pre style="color:#f44;font-size:11px;padding:8px;">点击任务时出错:\n${String(err)}</pre>`;
        this.selectedQuestId = questId;
        this.renderQuestList();
      }
      return;
    }

    const placementId = target.dataset.deletePlacement;
    if (placementId) {
      this.project.placements = this.project.placements.filter((placement) => placement.id !== placementId);
      this.saveDraft('锚点已删除（点击「写入源文件」后生效）');
      return;
    }

    switch (target.dataset.action) {
      case 'close': this.toggle(false); break;
      case 'new-quest': this.createQuest(); break;
      case 'place': this.beginPlacement(); break;
      case 'export': this.exportProject(); break;
      case 'write-file': void this.writeProjectToFile(); break;
      case 'ai-generate': this.openAIDialog(); break;
      case 'ai-submit': void this.generateQuest(); break;
      case 'ai-cancel': this.closeAIDialog(); break;
      case 'ai-accept': this.acceptAIQuest(); break;
      case 'ai-reject': void this.generateQuest(); break;
      case 'tab-quests': this.switchTab('quests'); break;
      case 'tab-dialogues': this.switchTab('dialogues'); break;
      case 'dlg-save': this.saveDialogueEdit(); break;
      case 'dlg-add-node': this.addDialogueNode(); break;
      case 'dlg-add-cond': this.addDialogueCondition(); break;
      case 'dlg-del-cond': {
        const idx = parseInt(target.dataset.idx ?? '-1', 10);
        if (idx >= 0) this.deleteDialogueCondition(idx);
        break;
      }
      case 'dlg-toggle-node': {
        const body = target.closest('[data-role="dlg-node"]')?.querySelector<HTMLElement>('[data-role="dlg-node-body"]');
        const toggle = target;
        if (body) {
          const hidden = body.style.display === 'none';
          body.style.display = hidden ? '' : 'none';
          toggle.textContent = hidden ? '▼' : '▶';
        }
        break;
      }
      case 'dlg-del-node': {
        const nodeEl = target.closest<HTMLElement>('[data-role="dlg-node"]');
        const nodeId = nodeEl?.dataset.nodeId;
        if (nodeId) this.deleteDialogueNode(nodeId);
        break;
      }
      case 'dlg-add-line': {
        const nodeEl = target.closest<HTMLElement>('[data-role="dlg-node"]');
        const nodeId = nodeEl?.dataset.nodeId;
        if (nodeId) this.addDialogueLine(nodeId);
        break;
      }
      case 'dlg-del-line': {
        const lineEl = target.closest<HTMLElement>('[data-role="dlg-line"]');
        const nodeId = lineEl?.dataset.nodeId;
        const lineIdx = lineEl?.dataset.lineIdx ? parseInt(lineEl.dataset.lineIdx) : -1;
        if (nodeId && lineIdx >= 0) this.deleteDialogueLine(nodeId, lineIdx);
        break;
      }
      case 'dlg-add-choice': {
        const nodeEl = target.closest<HTMLElement>('[data-role="dlg-node"]');
        const nodeId = nodeEl?.dataset.nodeId;
        if (nodeId) this.addDialogueChoice(nodeId);
        break;
      }
      case 'dlg-del-choice': {
        const choiceEl = target.closest<HTMLElement>('[data-role="dlg-choice"]');
        const nodeId = choiceEl?.dataset.nodeId;
        const choiceIdx = choiceEl?.dataset.choiceIdx ? parseInt(choiceEl.dataset.choiceIdx) : -1;
        if (nodeId && choiceIdx >= 0) this.deleteDialogueChoice(nodeId, choiceIdx);
        break;
      }
      case 'recover-cancel':
        this.selectedQuestId = null;
        this.renderQuestList();
        this.questFormEl.innerHTML = `<div style="padding:24px;text-align:center;color:#536975;font-size:12px;">已取消选中。请从左侧选择或新建任务。</div>`;
        break;
      case 'recover-reload':
        this.project = normalizeQuestEditorProject(this.project);
        this.selectedQuestId = this.project.quests[0]?.id ?? null;
        this.renderAll();
        this.setStatus('已尝试修复并重载');
        break;
    }
  }

  private handleQuestFormClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || !this.selectedQuestId) return;
    const action = target.dataset.action;
    if (!action) return;

    this.syncSelectedQuestFromForm();
    const quest = this.getSelectedQuest();
    if (!quest) return;

    const stepIndex = Number(target.dataset.stepIndex ?? -1);
    const objectiveIndex = Number(target.dataset.objectiveIndex ?? -1);

    if (action === 'add-start-condition') {
      this.syncSelectedQuestFromForm();
      const q = this.getSelectedQuest();
      if (q) {
        if (!q.startCondition) q.startCondition = { conditions: [] };
        if (!q.startCondition.conditions) q.startCondition.conditions = [];
        q.startCondition.conditions.push({ type: 'quest_completed', target: '' });
        this.renderQuestForm();
      }
    } else if (action === 'remove-start-condition') {
      const condIndex = Number(target.dataset.startCondIndex ?? -1);
      this.syncSelectedQuestFromForm();
      const q = this.getSelectedQuest();
      if (q && q.startCondition?.conditions && condIndex >= 0) {
        q.startCondition.conditions.splice(condIndex, 1);
        this.renderQuestForm();
      }
    } else if (action === 'add-step') {
      quest.steps.push({ id: nextStepId(quest.steps), desc: '', logic: 'AND', objectives: [] });
      this.renderQuestForm();
    } else if (action === 'remove-step' && stepIndex >= 0) {
      quest.steps.splice(stepIndex, 1);
      this.renderQuestForm();
    } else if (action === 'add-objective' && quest.steps[stepIndex]) {
      quest.steps[stepIndex].objectives.push({ type: 'trigger_event', target: '', count: 1 });
      this.renderQuestForm();
    } else if (action === 'remove-objective' && quest.steps[stepIndex]?.objectives[objectiveIndex]) {
      quest.steps[stepIndex].objectives.splice(objectiveIndex, 1);
      this.renderQuestForm();
    } else if (action === 'save-quest') {
      const errors = validateQuestDefinition(quest);
      if (errors.length > 0) {
        this.setStatus(errors.join('；'), true);
        return;
      }
      this.saveDraft('任务定义已保存（点击「写入源文件」后生效）');
    } else if (action === 'delete-quest') {
      this.project.quests = this.project.quests.filter((item) => item.id !== quest.id);
      this.selectedQuestId = this.project.quests[0]?.id ?? null;
      this.saveDraft('任务已删除（点击「写入源文件」后生效）');
    } else if (action === 'activate-quest') {
      const ok = this.callbacks.activateQuest(quest.id);
      this.setStatus(ok ? `已激活 ${quest.id}` : `无法激活 ${quest.id}，请检查条件或运行时状态`, !ok);
      this.renderQuestForm();
    } else if (action === 'reset-quest') {
      this.callbacks.resetQuest(quest.id);
      this.setStatus(`已重置 ${quest.id}`);
      this.renderQuestForm();
    }
  }

  // ─── Tab 切换 ───

  private switchTab(tab: 'quests' | 'dialogues'): void {
    const isQuest = tab === 'quests';
    this.questPanelEl.style.display = isQuest ? 'flex' : 'none';
    this.dialoguePanelEl.style.display = isQuest ? 'none' : 'flex';

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.qe-tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('qe-tab-active', active);
      btn.style.background = active ? '#0d2935' : 'transparent';
      btn.style.color = active ? '#00f3ff' : '#6d8a97';
      btn.style.borderColor = active ? '#00f3ff' : '#18313d';
    });

    if (!isQuest) {
      this.renderDialogueList();
      this.renderDialogueDetail();
      if (this.selectedDialogueId === null) {
        const dialogues = this.callbacks.listDialogues();
        if (dialogues.length > 0) {
          this.selectedDialogueId = dialogues[0].id;
          this.renderDialogueList();
          this.renderDialogueDetail();
        }
      }
    }
  }

  // ─── 对话面板 ───

  private renderDialogueList(): void {
    const dialogues = this.callbacks.listDialogues();
    if (dialogues.length === 0) {
      this.dialogueListEl.innerHTML = '<div style="padding:12px;color:#607783;font-size:12px;">暂无对话树</div>';
      return;
    }

    const sceneNames = new Map(this.callbacks.listScenes().map((s) => [s.id, s.name]));
    this.dialogueListEl.innerHTML = dialogues.map((d) => {
      const selected = d.id === this.selectedDialogueId;
      const sceneLabel = sceneNames.get(d.scene) ?? d.scene;
      const stageLabel = d.stage ? `<span style="color:#ffaa00;">[${escapeHtml(d.stage)}]</span>` : '<span style="color:#4a5a64;">[全局]</span>';
      return `<button data-dialogue-id="${escapeAttr(d.id)}" style="display:block;width:100%;text-align:left;padding:9px;margin-bottom:6px;background:${selected ? '#0d2935' : '#09151e'};border:1px solid ${selected ? '#00f3ff' : '#18313d'};color:#e0ffff;cursor:pointer;">
        <span style="display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.id)}</span>
        <span style="display:flex;justify-content:space-between;margin-top:3px;font:10px monospace;">
          <span style="color:#66838f;">${escapeHtml(sceneLabel)}</span>
          ${stageLabel}
        </span>
      </button>`;
    }).join('');
  }

  private renderDialogueDetail(): void {
    if (!this.selectedDialogueId) {
      this.dialogueDetailEl.innerHTML = '<div style="padding:24px;text-align:center;color:#607783;font-size:13px;">选择左侧对话树查看详情</div>';
      return;
    }

    const tree = this.callbacks.getDialogueTree(this.selectedDialogueId);
    if (!tree) {
      this.dialogueDetailEl.innerHTML = '<div style="padding:24px;text-align:center;color:#607783;font-size:13px;">无法加载对话树数据</div>';
      return;
    }

    this.currentDialogueTree = structuredClone(tree);
    const characters = this.listKnownSpeakers();

    const sceneOptions = this.callbacks.listScenes().map((s) =>
      `<option value="${escapeAttr(s.id)}" ${s.id === tree.scene ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
    ).join('');

    const stageVal = this.project.dialogueData[tree.id]?.stage ?? tree.stage ?? '';
    const stageOptions = `<option value="">所有阶段（全局）</option>` +
      this.catalog.stages.map((s) =>
        `<option value="${escapeAttr(s.id)}" ${s.id === stageVal ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
      ).join('');

    const nodeIds = Object.keys(tree.nodes);

    const condTypeOptions = [
      { val: '', label: '选择类型' },
      { val: 'quest_completed', label: '已完成任务' },
      { val: 'has_item', label: '拥有物品' },
      { val: 'talked_to_npc', label: '已对话 NPC' },
      { val: 'visited_scene', label: '已访问场景' },
      { val: 'has_flag', label: '拥有 Flag' },
    ];

    this.dialogueDetailEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <strong style="color:#00f3ff;letter-spacing:2px;">对话编辑器</strong>
        <span style="margin-left:auto;font:11px monospace;color:#6d8a97;">${escapeHtml(tree.id)}</span>
      </div>

      <div class="qe-grid2">
        ${field('对话 ID', `<input data-dlg-prop="id" class="qe-input" value="${escapeAttr(tree.id)}">`)}
        ${field('触发者', `<input data-dlg-prop="trigger" class="qe-input" value="${escapeAttr(tree.trigger)}">`)}
      </div>
      <div class="qe-grid2">
        ${field('场景', `<select data-dlg-prop="scene" class="qe-input">${sceneOptions}</select>`)}
        ${field('起始节点', `<select data-dlg-prop="startNode" class="qe-input">${nodeIds.map((nid) => `<option value="${escapeAttr(nid)}" ${nid === tree.startNode ? 'selected' : ''}>${escapeHtml(nid)}</option>`).join('')}</select>`)}
      </div>
      <div class="qe-grid2">
        ${field('事件类型', `<select data-dlg-prop="eventType" class="qe-input">
          <option value="" ${!tree.eventType ? 'selected' : ''}>event_type1（立绘+对话框）</option>
          <option value="event_type2" ${tree.eventType === 'event_type2' ? 'selected' : ''}>event_type2（CG+对话框）</option>
        </select>`)}
        ${field('CG 图片路径', `<input data-dlg-prop="cgUrl" class="qe-input" value="${escapeAttr(tree.cgUrl ?? '')}" placeholder="留空=无 CG">`)}
      </div>
      <div style="margin:10px 0;padding:10px;background:#07131b;border:1px solid #18313d;border-radius:4px;">
        <label style="display:block;font-size:10px;color:#6d8a97;margin-bottom:6px;">所属阶段</label>
        <select data-role="dialogue-stage" class="qe-input">${stageOptions}</select>
      </div>
      <div style="margin:10px 0;padding:10px;background:#07131b;border:1px solid #18313d;border-radius:4px;">
        <div style="display:flex;align-items:center;margin-bottom:6px;">
          <span style="font-size:10px;color:#6d8a97;">触发条件（全部满足时才出现此对话；留空=无条件，作为默认对话）</span>
          <button data-action="dlg-add-cond" class="qe-btn" style="font-size:10px;padding:1px 6px;margin-left:auto;">+ 条件</button>
        </div>
        <div data-role="dlg-conds-container">${this.renderDialogueConditions(tree.condition ?? [], condTypeOptions, this.catalog)}</div>
      </div>

      <div style="margin:16px 0 8px;display:flex;align-items:center;gap:8px;">
        <strong style="color:#a0c0cc;font-size:12px;">对话节点（${nodeIds.length}）</strong>
        <button data-action="dlg-add-node" class="qe-btn" style="font-size:10px;padding:2px 8px;">+ 添加节点</button>
        <button data-action="dlg-save" class="qe-btn qe-primary" style="margin-left:auto;font-size:10px;padding:2px 12px;">保存对话</button>
      </div>
      <div data-role="dlg-nodes-container">${this.renderDialogueNodes(tree.nodes, characters)}</div>`;
  }

  private currentDialogueTree: DialogueTree | null = null;

  /** 收集已知的说话人列表（角色 ID） */
  private listKnownSpeakers(): string[] {
    const speakers = new Set<string>(['narrator']);
    const dialogues = this.callbacks.listDialogues();
    const tree = this.currentDialogueTree;
    if (tree) {
      for (const node of Object.values(tree.nodes)) {
        for (const line of node.lines) speakers.add(line.speaker);
      }
    }
    for (const d of dialogues) {
      if (d.trigger && d.trigger !== 'auto') speakers.add(d.trigger);
    }
    return [...speakers].sort();
  }

  private renderDialogueConditions(
    conditions: StartConditionEntry[],
    typeOptions: { val: string; label: string }[],
    catalog: QuestEditorCatalog,
  ): string {
    if (conditions.length === 0) {
      return '<div style="font-size:11px;color:#5a7a87;padding:4px 0;">无触发条件（始终作为默认对话）</div>';
    }
    return conditions.map((cond, idx) => {
      const types = typeOptions.map(o =>
        `<option value="${o.val}" ${o.val === cond.type ? 'selected' : ''}>${o.label}</option>`
      ).join('');
      let entries: readonly QuestEditorCatalogEntry[];
      switch (cond.type) {
        case 'quest_completed': entries = catalog.quests; break;
        case 'has_item': entries = catalog.items; break;
        case 'talked_to_npc': entries = catalog.npcs; break;
        case 'visited_scene': entries = catalog.scenes; break;
        case 'has_flag': entries = catalog.flags; break;
        default: entries = catalog.flags; break;
      }
      const targets = `<option value="">— 选择 —</option>` + entries.map(e =>
        `<option value="${escapeAttr(e.id)}" ${e.id === cond.target ? 'selected' : ''}>${escapeHtml(e.label)} (${escapeHtml(e.id)})</option>`
      ).join('');
      return `<div data-role="dlg-cond-row" style="display:flex;gap:4px;margin-bottom:4px;align-items:center;" data-cond-idx="${idx}">
        <select data-dlg-cond="type" class="qe-input" style="width:120px;">${types}</select>
        <select data-dlg-cond="target" class="qe-input" style="flex:1;">${targets}</select>
        <button data-action="dlg-del-cond" data-idx="${idx}" class="qe-btn" style="font-size:10px;padding:1px 6px;color:#ff6060;">删除</button>
      </div>`;
    }).join('');
  }

  private renderDialogueNodes(
    nodes: Record<string, DialogueNode>,
    speakers: string[],
  ): string {
    return Object.values(nodes).map((node) => this.renderDialogueNode(node, speakers)).join('');
  }

  private renderDialogueNode(node: DialogueNode, speakers: string[]): string {
    const linesHtml = node.lines.map((line, li) => this.renderDialogueLine(node.id, li, line, speakers)).join('');
    const choicesHtml = (node.choices ?? []).map((choice, ci) => this.renderDialogueChoice(node.id, ci, choice)).join('');

    return `
      <div data-role="dlg-node" data-node-id="${escapeAttr(node.id)}" style="margin:8px 0;border:1px solid #18313d;border-radius:4px;background:#091821;">
        <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:#0d1f2a;border-radius:4px 4px 0 0;">
          <span data-action="dlg-toggle-node" style="cursor:pointer;color:#00f3ff;font-size:14px;">▼</span>
          <input data-role="dlg-node-id" class="qe-input" value="${escapeAttr(node.id)}" style="width:120px;font-size:11px;">
          <span style="font-size:10px;color:#6d8a97;">${node.lines.length} 行${node.choices ? ` / ${node.choices.length} 选项` : ''}</span>
          <button data-action="dlg-del-node" class="qe-btn qe-danger" style="margin-left:auto;font-size:9px;padding:1px 6px;">删除节点</button>
        </div>
        <div data-role="dlg-node-body" style="padding:8px;">
          <div style="font-size:9px;color:#6d8a97;margin-bottom:4px;">对话行</div>
          ${linesHtml}
          <button data-action="dlg-add-line" class="qe-btn" style="font-size:9px;padding:2px 8px;margin-top:4px;">+ 添加行</button>
          ${node.choices && node.choices.length > 0 ? `
            <div style="font-size:9px;color:#6d8a97;margin:8px 0 4px;">选项</div>
            ${choicesHtml}
          ` : ''}
          <button data-action="dlg-add-choice" class="qe-btn" style="font-size:9px;padding:2px 8px;margin-top:4px;">+ 添加选项</button>
          <div style="margin-top:6px;">
            <label style="font-size:9px;color:#6d8a97;">无选项时自动跳转到：</label>
            <select data-role="dlg-node-next" class="qe-input" style="font-size:10px;width:140px;">
              <option value="" ${!node.next ? 'selected' : ''}>（无）</option>
              ${Object.keys(this.currentDialogueTree?.nodes ?? {}).map((nid) =>
                `<option value="${escapeAttr(nid)}" ${nid === node.next ? 'selected' : ''}>${escapeHtml(nid)}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      </div>`;
  }

  private renderDialogueLine(nodeId: string, index: number, line: DialogueLine, speakers: string[]): string {
    const speakerOptions = speakers.map((s) =>
      `<option value="${escapeAttr(s)}" ${s === line.speaker ? 'selected' : ''}>${escapeHtml(s)}</option>`
    ).join('');
    const emotions: Emotion[] = ['idle', 'happy', 'angry', 'sad', 'surprise'];
    const emotionOptions = emotions.map((e) =>
      `<option value="${e}" ${e === (line.emotion ?? 'idle') ? 'selected' : ''}>${e}</option>`
    ).join('');

    return `
      <div data-role="dlg-line" data-node-id="${escapeAttr(nodeId)}" data-line-idx="${index}" style="display:flex;gap:4px;align-items:flex-start;margin:3px 0;">
        <select data-role="dlg-line-speaker" class="qe-input" style="width:100px;font-size:10px;flex-shrink:0;">${speakerOptions}</select>
        <select data-role="dlg-line-emotion" class="qe-input" style="width:70px;font-size:10px;flex-shrink:0;">${emotionOptions}</select>
        <input data-role="dlg-line-text" class="qe-input" value="${escapeAttr(line.text)}" style="flex:1;font-size:11px;">
        <button data-action="dlg-del-line" class="qe-btn qe-danger" style="font-size:9px;padding:1px 4px;flex-shrink:0;">✕</button>
      </div>`;
  }

  private renderDialogueChoice(nodeId: string, index: number, choice: DialogueChoice): string {
    const nextVal = choice.next ?? '';
    const nodeIds = Object.keys(this.currentDialogueTree?.nodes ?? {});
    const nextSelect = nodeIds.map((nid) =>
      `<option value="${escapeAttr(nid)}" ${nid === nextVal ? 'selected' : ''}>${escapeHtml(nid)}</option>`
    ).join('');

    return `
      <div data-role="dlg-choice" data-node-id="${escapeAttr(nodeId)}" data-choice-idx="${index}" style="display:flex;gap:4px;align-items:center;margin:3px 0;padding:4px;background:#0a1820;border-radius:3px;">
        <span style="color:#66838f;font-size:10px;">▶</span>
        <input data-role="dlg-choice-text" class="qe-input" value="${escapeAttr(choice.text)}" style="flex:1;font-size:11px;" placeholder="选项文本">
        <span style="font-size:9px;color:#6d8a97;">→</span>
        <select data-role="dlg-choice-next" class="qe-input" style="width:100px;font-size:10px;">${nextSelect}</select>
        <input data-role="dlg-choice-effect" class="qe-input" value="${escapeAttr(choice.effect ?? '')}" style="width:90px;font-size:10px;" placeholder="效果（可选）">
        <button data-action="dlg-del-choice" class="qe-btn qe-danger" style="font-size:9px;padding:1px 4px;">✕</button>
      </div>`;
  }

  /** 从 DOM 收集当前编辑的对话树数据 */
  private collectDialogueFromDOM(): DialogueTree | null {
    const tree = this.currentDialogueTree;
    if (!tree) return null;

    const root = this.dialogueDetailEl;
    const getProp = (name: string): string => {
      const el = root.querySelector<HTMLInputElement>(`[data-dlg-prop="${name}"]`);
      return el ? el.value.trim() : '';
    };

    const updated: DialogueTree = {
      ...tree,
      id: getProp('id') || tree.id,
      trigger: getProp('trigger') || tree.trigger,
      scene: getProp('scene') || tree.scene,
      startNode: getProp('startNode') || tree.startNode,
      eventType: (getProp('eventType') || undefined) as EventType | undefined,
      cgUrl: getProp('cgUrl') || undefined,
      condition: [],
      nodes: {},
    };

    // 收集触发条件
    const condRows = root.querySelectorAll<HTMLElement>('[data-role="dlg-cond-row"]');
    for (const row of condRows) {
      const type = row.querySelector<HTMLSelectElement>('[data-dlg-cond="type"]')?.value ?? '';
      const target = row.querySelector<HTMLSelectElement>('[data-dlg-cond="target"]')?.value ?? '';
      if (type && target) {
        updated.condition!.push({ type: type as StartConditionEntry['type'], target });
      }
    }
    if (updated.condition!.length === 0) delete updated.condition;

    // 收集节点
    const nodeEls = root.querySelectorAll<HTMLElement>('[data-role="dlg-node"]');
    for (const nodeEl of nodeEls) {
      const oldNodeId = nodeEl.dataset.nodeId ?? '';
      const idInput = nodeEl.querySelector<HTMLInputElement>('[data-role="dlg-node-id"]');
      const nodeId = idInput ? idInput.value.trim() : oldNodeId;
      const nextSelect = nodeEl.querySelector<HTMLSelectElement>('[data-role="dlg-node-next"]');

      const lines: DialogueLine[] = [];
      const lineEls = nodeEl.querySelectorAll<HTMLElement>('[data-role="dlg-line"]');
      for (const lineEl of lineEls) {
        const speaker = lineEl.querySelector<HTMLSelectElement>('[data-role="dlg-line-speaker"]')?.value ?? 'narrator';
        const emotion = lineEl.querySelector<HTMLSelectElement>('[data-role="dlg-line-emotion"]')?.value as Emotion ?? 'idle';
        const text = lineEl.querySelector<HTMLInputElement>('[data-role="dlg-line-text"]')?.value ?? '';
        const line: DialogueLine = { speaker, text };
        if (emotion && emotion !== 'idle') line.emotion = emotion;
        lines.push(line);
      }

      const choices: DialogueChoice[] = [];
      const choiceEls = nodeEl.querySelectorAll<HTMLElement>('[data-role="dlg-choice"]');
      let choiceIdx = 0;
      for (const choiceEl of choiceEls) {
        const text = choiceEl.querySelector<HTMLInputElement>('[data-role="dlg-choice-text"]')?.value ?? '';
        const next = choiceEl.querySelector<HTMLSelectElement>('[data-role="dlg-choice-next"]')?.value ?? '';
        const effect = choiceEl.querySelector<HTMLInputElement>('[data-role="dlg-choice-effect"]')?.value ?? '';
        const origChoice = tree.nodes[oldNodeId]?.choices?.[choiceIdx];
        const choice: DialogueChoice = { text, next };
        if (effect) choice.effect = effect;
        if (origChoice?.actions) choice.actions = origChoice.actions;
        choices.push(choice);
        choiceIdx++;
      }

      const node: DialogueNode = { id: nodeId, lines };
      if (choices.length > 0) node.choices = choices;
      if (nextSelect && nextSelect.value) node.next = nextSelect.value;
      updated.nodes[nodeId] = node;
    }

    return updated;
  }

  private saveDialogueEdit(): void {
    const tree = this.collectDialogueFromDOM();
    if (!tree || !this.selectedDialogueId) return;

    // 存入 project.dialogueData（stage/condition 已在 tree 中）
    this.project.dialogueData[tree.id] = tree;
    // 如果 ID 变了，清理旧条目
    if (tree.id !== this.selectedDialogueId) {
      delete this.project.dialogueData[this.selectedDialogueId];
      this.selectedDialogueId = tree.id;
    }

    // 保存阶段设置
    const stageSelect = this.dialogueDetailEl.querySelector<HTMLSelectElement>('[data-role="dialogue-stage"]');
    if (stageSelect) {
      const stage = stageSelect.value.trim();
      if (stage) {
        tree.stage = stage;
      } else {
        tree.stage = undefined;
      }
    }

    this.currentDialogueTree = tree;
    this.commitProject(`对话 ${tree.id} 已保存并生效`);
    this.renderDialogueList();
  }

  private addDialogueNode(): void {
    if (!this.currentDialogueTree) return;
    const tree = this.currentDialogueTree;
    let idx = Object.keys(tree.nodes).length + 1;
    let nodeId = `node_${idx}`;
    while (tree.nodes[nodeId]) nodeId = `node_${++idx}`;
    tree.nodes[nodeId] = { id: nodeId, lines: [{ speaker: 'narrator', text: '新对话行' }] };
    this.rerenderNodes();
  }

  private deleteDialogueNode(nodeId: string): void {
    if (!this.currentDialogueTree) return;
    delete this.currentDialogueTree.nodes[nodeId];
    this.rerenderNodes();
  }

  private addDialogueCondition(): void {
    if (!this.currentDialogueTree) return;
    if (!this.currentDialogueTree.condition) this.currentDialogueTree.condition = [];
    this.currentDialogueTree.condition.push({ type: 'has_flag', target: '' });
    this.rerenderDialogueDetail();
  }

  private deleteDialogueCondition(idx: number): void {
    if (!this.currentDialogueTree?.condition) return;
    this.currentDialogueTree.condition.splice(idx, 1);
    this.rerenderDialogueDetail();
  }

  private rerenderDialogueDetail(): void {
    if (!this.currentDialogueTree) return;
    this.renderDialogueDetailFromLocal();
  }

  private renderDialogueDetailFromLocal(): void {
    const tree = this.currentDialogueTree!;
    const characters = this.listKnownSpeakers();

    const sceneOptions = this.callbacks.listScenes().map((s) =>
      `<option value="${escapeAttr(s.id)}" ${s.id === tree.scene ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
    ).join('');

    const stageVal = tree.stage ?? '';
    const stageOptions = `<option value="">所有阶段（全局）</option>` +
      this.catalog.stages.map((s) =>
        `<option value="${escapeAttr(s.id)}" ${s.id === stageVal ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
      ).join('');

    const nodeIds = Object.keys(tree.nodes);
    const nodeOptionsForSelect = nodeIds.map((nid) =>
      `<option value="${escapeAttr(nid)}"${nid === tree.startNode ? ' selected' : ''}>${escapeHtml(nid)}</option>`
    ).join('');

    const condTypeOpts = [
      { val: '', label: '选择类型' },
      { val: 'quest_completed', label: '已完成任务' },
      { val: 'has_item', label: '拥有物品' },
      { val: 'talked_to_npc', label: '已对话 NPC' },
      { val: 'visited_scene', label: '已访问场景' },
      { val: 'has_flag', label: '拥有 Flag' },
      { val: 'stage_at_least', label: '阶段至少达到' },
    ];

    const condHtml = this.renderDialogueConditions(tree.condition ?? [], condTypeOpts, this.catalog);
    const nodesHtml = this.renderDialogueNodes(tree.nodes, characters);

    this.dialogueDetailEl.innerHTML = `
      <div class="qe-dlg-detail">
        <div class="qe-dlg-section">
          <div class="qe-form-row">
            <label class="qe-form-label">对话 ID</label>
            <input class="qe-input" data-dlg-field="id" value="${escapeAttr(tree.id)}" readonly style="opacity:.6">
          </div>
          <div class="qe-form-row">
            <label class="qe-form-label">触发者</label>
            <input class="qe-input" data-dlg-field="trigger" value="${escapeAttr(tree.trigger)}">
          </div>
          <div class="qe-form-row">
            <label class="qe-form-label">场景</label>
            <select class="qe-input" data-dlg-field="scene">${sceneOptions}</select>
          </div>
          <div class="qe-form-row">
            <label class="qe-form-label">起始节点</label>
            <select class="qe-input" data-dlg-field="startNode">${nodeOptionsForSelect}</select>
          </div>
          <div class="qe-form-row">
            <label class="qe-form-label">事件类型</label>
            <select class="qe-input" data-dlg-field="eventType">
              <option value="" ${!tree.eventType ? 'selected' : ''}>无</option>
              <option value="event_type1" ${tree.eventType === 'event_type1' ? 'selected' : ''}>立绘事件</option>
              <option value="event_type2" ${tree.eventType === 'event_type2' ? 'selected' : ''}>CG 事件</option>
            </select>
          </div>
          <div class="qe-form-row">
            <label class="qe-form-label">CG 图片路径</label>
            <input class="qe-input" data-dlg-field="cgUrl" value="${escapeAttr(tree.cgUrl ?? '')}" placeholder="/CG_Scene/...">
          </div>
          <div class="qe-form-row">
            <label class="qe-form-label">所属阶段</label>
            <select class="qe-input" data-dlg-field="stage">${stageOptions}</select>
          </div>
        </div>

        <div class="qe-dlg-section">
          <div class="qe-section-title" style="display:flex;justify-content:space-between;align-items:center;">
            <span>触发条件</span>
            <button class="qe-btn qe-btn-sm" data-action="dlg-add-cond">+ 添加条件</button>
          </div>
          ${condHtml}
        </div>

        <div class="qe-dlg-section">
          <div class="qe-section-title" style="display:flex;justify-content:space-between;align-items:center;">
            <span>对话节点 (${nodeIds.length})</span>
            <button class="qe-btn qe-btn-sm" data-action="dlg-add-node">+ 添加节点</button>
          </div>
          ${nodesHtml}
        </div>

        <div class="qe-dlg-section" style="position:sticky;bottom:0;background:var(--qe-bg,#1a2333);padding:8px 0;border-top:1px solid #2a3548;">
          <button class="qe-btn qe-primary" data-action="dlg-save" style="width:100%;">保存对话</button>
        </div>
      </div>
    `;

    this.dialogueDetailEl.querySelectorAll('select[data-dlg-field="startNode"]').forEach(el => {
      (el as HTMLSelectElement).value = tree.startNode;
    });
  }

  private addDialogueLine(nodeId: string): void {
    if (!this.currentDialogueTree) return;
    const node = this.currentDialogueTree.nodes[nodeId];
    if (!node) return;
    node.lines.push({ speaker: 'narrator', text: '' });
    this.rerenderNodes();
  }

  private deleteDialogueLine(nodeId: string, lineIdx: number): void {
    if (!this.currentDialogueTree) return;
    const node = this.currentDialogueTree.nodes[nodeId];
    if (!node) return;
    node.lines.splice(lineIdx, 1);
    this.rerenderNodes();
  }

  private addDialogueChoice(nodeId: string): void {
    if (!this.currentDialogueTree) return;
    const node = this.currentDialogueTree.nodes[nodeId];
    if (!node) return;
    if (!node.choices) node.choices = [];
    const nodeIds = Object.keys(this.currentDialogueTree.nodes);
    node.choices.push({ text: '新选项', next: nodeIds[0] ?? '' });
    this.rerenderNodes();
  }

  private deleteDialogueChoice(nodeId: string, choiceIdx: number): void {
    if (!this.currentDialogueTree) return;
    const node = this.currentDialogueTree.nodes[nodeId];
    if (!node || !node.choices) return;
    node.choices.splice(choiceIdx, 1);
    if (node.choices.length === 0) delete node.choices;
    this.rerenderNodes();
  }

  /** 重新渲染节点区域（保留 currentDialogueTree 状态） */
  private rerenderNodes(): void {
    if (!this.currentDialogueTree) return;
    const container = this.dialogueDetailEl.querySelector<HTMLElement>('[data-role="dlg-nodes-container"]');
    if (!container) return;
    const speakers = this.listKnownSpeakers();
    container.innerHTML = this.renderDialogueNodes(this.currentDialogueTree.nodes, speakers);
  }

  // ─── 任务表单 ───

  private createQuest(): void {
    this.syncSelectedQuestFromForm();
    let index = this.project.quests.length + 1;
    let id = `quest_${index}`;
    while (this.project.quests.some((quest) => quest.id === id)) id = `quest_${++index}`;
    const quest: Quest = {
      id,
      title: '新任务',
      desc: '',
      category: 'main',
      steps: [{
        id: 'step_1',
        desc: '',
        logic: 'AND',
        objectives: [{ type: 'trigger_event', target: '', count: 1 }],
      }],
    };
    this.project.quests.push(quest);
    this.selectedQuestId = id;
    this.renderQuestList();
    this.renderQuestForm();
    this.setStatus('已创建未保存的空任务模板');
  }

  private renderQuestList(): void {
    if (this.project.quests.length === 0) {
      this.questListEl.innerHTML = '<div style="padding:12px;color:#607783;font-size:12px;line-height:1.7;">暂无任务定义。点击“新建”创建纯框架任务。</div>';
      return;
    }
    this.questListEl.innerHTML = this.project.quests.map((quest) => {
      const runtime = this.callbacks.getRuntime(quest.id);
      const selected = quest.id === this.selectedQuestId;
      return `<button data-quest-id="${escapeAttr(quest.id)}" style="display:block;width:100%;text-align:left;padding:9px;margin-bottom:6px;background:${selected ? '#0d2935' : '#09151e'};border:1px solid ${selected ? '#00f3ff' : '#18313d'};color:#e0ffff;cursor:pointer;">
        <span style="display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(quest.title)}</span>
        <span style="display:flex;justify-content:space-between;margin-top:3px;color:#66838f;font:10px monospace;"><span>${escapeHtml(quest.id)}</span><span>${runtime?.status ?? '未激活'}</span></span>
      </button>`;
    }).join('');
  }

  private renderQuestForm(): void {
    try {
    const quest = this.getSelectedQuest();
    if (!quest) {
      console.warn('[QuestEditor] renderQuestForm: getSelectedQuest 返回 null', { selectedQuestId: this.selectedQuestId, projectQuestIds: this.project.quests.map(q => q.id) });
      this.questFormEl.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#607783;font-size:13px;">选择或新建任务后编辑</div>';
      return;
    }
    const runtime = this.callbacks.getRuntime(quest.id);
    const start = quest.startCondition;
    const rewards = quest.rewards;

    this.questFormEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <strong style="color:#00f3ff;letter-spacing:2px;">任务属性</strong>
        <span style="margin-left:auto;font:11px monospace;color:${runtime?.status === 'active' ? '#33ff88' : '#6d8a97'};">${runtime ? `${runtime.status} · step ${runtime.currentStepIndex + 1}` : '无运行时'}</span>
      </div>
      <div class="qe-grid2">
        ${field('ID', `<input data-q-field="id" class="qe-input" value="${escapeAttr(quest.id)}">`)}
        ${field('分类', `<select data-q-field="category" class="qe-input">${options(['main', 'side', 'hidden'], quest.category)}</select>`)}
      </div>
      ${field('标题', `<input data-q-field="title" class="qe-input" value="${escapeAttr(quest.title)}">`)}
      ${field('描述', `<textarea data-q-field="desc" class="qe-input" rows="2">${escapeHtml(quest.desc)}</textarea>`)}
      <div class="qe-grid2">
        ${field('所属阶段', stageSelect(this.catalog.stages, quest.stage ?? ''))}
        ${field('完成后推进到阶段', stageSelect(this.catalog.stages, quest.advanceStageTo ?? '', true))}
      </div>
      <label style="display:flex;align-items:center;gap:7px;font-size:12px;margin:8px 0;"><input data-q-field="autoStart" type="checkbox" ${quest.autoStart ? 'checked' : ''}> 条件满足时自动激活</label>

      <div style="display:flex;align-items:center;margin-top:12px;" class="qe-section-title"><span>开启条件</span><button data-action="add-start-condition" class="qe-btn" style="margin-left:auto;">＋ 条件</button></div>
      <div style="margin-bottom:6px;font-size:12px;color:#6d8a97;">满足以下${field('逻辑', `<select data-q-field="startLogic" class="qe-input" style="width:80px;">${options(['AND', 'OR'], start?.logic ?? 'AND')}</select>`).replace(/<label[^>]*>|<\/label>/g,'')}条件时自动激活（或手动测试激活）</div>
      <div data-role="start-conditions">${(start?.conditions ?? []).map((entry, i) => this.renderStartCondition(entry, i)).join('') || '<div style="font-size:12px;color:#6d8a97;padding:8px;">无条件（始终可激活）</div>'}</div>

      <div style="display:flex;align-items:center;margin-top:12px;" class="qe-section-title"><span>顺序步骤链</span><button data-action="add-step" class="qe-btn" style="margin-left:auto;">＋ 步骤</button></div>
      <div data-role="steps">${quest.steps.map((step, index) => this.renderStep(step, index)).join('')}</div>

      <div class="qe-section-title">奖励与完成</div>
      <div class="qe-grid2">
        ${field('经验', `<input data-q-field="rewardExp" type="number" min="0" class="qe-input" value="${rewards?.exp ?? 0}">`)}
        ${field('奖励 flags', questMultiSelect(this.catalog.flags, rewards?.flags ?? [], 'rewardFlags'))}
        ${field('解锁场景（可多选）', questMultiSelect(this.catalog.scenes, rewards?.unlockScenes ?? [], 'unlockScenes'))}
        ${field('解锁对话/事件（可多选）', questMultiSelect(this.catalog.events, rewards?.unlockDialogues ?? [], 'unlockDialogues'))}
      </div>
      ${field('物品奖励', rewardItemsSelect(this.catalog.items, rewards?.items ?? []))}
      ${field('完成提示', `<input data-q-field="completionText" class="qe-input" value="${escapeAttr(quest.completionText ?? '')}">`)}
      ${field('完成后 flags', questMultiSelect(this.catalog.flags, quest.onCompleteFlags ?? [], 'completeFlags'))}

      <div style="display:flex;gap:7px;position:sticky;bottom:-12px;margin:14px -12px -12px;padding:10px 12px;background:#09131df2;border-top:1px solid #18313d;">
        <button data-action="save-quest" class="qe-btn qe-primary">保存任务</button>
        <button data-action="activate-quest" class="qe-btn">测试激活</button>
        <button data-action="reset-quest" class="qe-btn qe-warn">重置进度</button>
        <button data-action="delete-quest" class="qe-btn qe-danger" style="margin-left:auto;">删除任务</button>
      </div>`;
    } catch (err) {
      console.error('[QuestEditor] renderQuestForm 渲染出错:', err, { selectedQuestId: this.selectedQuestId });
      this.questFormEl.innerHTML = `
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div style="color:#f87171;font-size:13px;font-weight:600;">渲染任务表单时出错</div>
          <pre style="color:#c0d0d8;font-size:11px;padding:10px;background:#0a1118;border:1px solid #2a1a1a;border-radius:6px;white-space:pre-wrap;word-break:break-all;margin:0;">${String(err)}</pre>
          <div style="display:flex;gap:8px;">
            <button data-action="recover-cancel" class="qe-btn">返回（取消选中）</button>
            <button data-action="recover-reload" class="qe-btn qe-primary">尝试修复并重载</button>
          </div>
          <div style="color:#5a7a88;font-size:10px;">"返回"取消当前选中回到任务列表；"修复并重载"会清理损坏数据后重新加载。</div>
        </div>`;
    }
  }

  private renderStep(step: QuestStep, stepIndex: number): string {
    return `<div class="qe-step" data-step-index="${stepIndex}" style="border:1px solid #1a3946;background:#07131b;padding:9px;margin-bottom:8px;">
      <div style="display:flex;gap:6px;align-items:end;">
        <label style="flex:1;font-size:10px;color:#6d8a97;">步骤 ID<input data-step-field="id" class="qe-input" value="${escapeAttr(step.id)}"></label>
        <label style="width:82px;font-size:10px;color:#6d8a97;">逻辑<select data-step-field="logic" class="qe-input">${options(['AND', 'OR'], step.logic ?? 'AND')}</select></label>
        <button data-action="remove-step" data-step-index="${stepIndex}" class="qe-btn qe-danger">删除</button>
      </div>
      ${field('步骤描述', `<input data-step-field="desc" class="qe-input" value="${escapeAttr(step.desc)}">`)}
      ${field('完成提示', `<input data-step-field="onCompleteText" class="qe-input" value="${escapeAttr(step.onCompleteText ?? '')}">`)}
      <div style="font-size:10px;color:#6d8a97;margin:7px 0 4px;">目标</div>
      ${step.objectives.map((objective, objectiveIndex) => this.renderObjective(objective, stepIndex, objectiveIndex)).join('')}
      <button data-action="add-objective" data-step-index="${stepIndex}" class="qe-btn" style="width:100%;margin-top:5px;">＋ 添加目标</button>
    </div>`;
  }

  private renderObjective(objective: QuestObjective, stepIndex: number, objectiveIndex: number): string {
    const location = objective.location;
    const showSubmitTo = objective.type === 'submit_item';
    return `<div class="qe-objective" data-objective-index="${objectiveIndex}" style="border-left:2px solid #ffaa00;padding:6px;margin:5px 0;background:#0b151b;">
      <div style="display:grid;grid-template-columns:128px 1fr 58px auto;gap:5px;">
        <select data-objective-field="type" class="qe-input qe-type-select" data-step-index="${stepIndex}" data-objective-index="${objectiveIndex}">${options(['reach_location', 'talk_to_npc', 'collect_item', 'submit_item', 'trigger_event', 'custom_flag'], objective.type)}</select>
        ${targetSelectByType(objective.type, this.catalog, objective.target)}
        <input data-objective-field="count" type="number" min="1" class="qe-input" value="${objective.count ?? 1}">
        <button data-action="remove-objective" data-step-index="${stepIndex}" data-objective-index="${objectiveIndex}" class="qe-btn qe-danger">×</button>
      </div>
      ${showSubmitTo ? `<div style="margin-top:5px;">${field('提交给 NPC', npcSelect(this.catalog, objective.submitTo ?? ''))}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 58px 58px 58px;gap:5px;margin-top:5px;">
        <input data-objective-field="x" type="number" step="0.1" class="qe-input" placeholder="X" value="${location?.x ?? ''}">
        <input data-objective-field="y" type="number" step="0.1" class="qe-input" placeholder="Y" value="${location?.y ?? ''}">
        <input data-objective-field="radius" type="number" min="0" step="0.1" class="qe-input" placeholder="半径" value="${location?.radius ?? ''}">
      </div>
    </div>`;
  }

  private renderStartCondition(entry: StartConditionEntry, index: number): string {
    const typeOptions: Array<{ value: StartConditionType; label: string }> = [
      { value: 'quest_completed', label: '已完成任务' },
      { value: 'has_item', label: '拥有物品' },
      { value: 'talked_to_npc', label: '已与 NPC 对话' },
      { value: 'visited_scene', label: '已进入场景' },
      { value: 'has_flag', label: '拥有 flag' },
      { value: 'stage_at_least', label: '阶段至少达到' },
    ];
    const currentType = entry.type;
    const targetSelectHtml = (() => {
      switch (currentType) {
        case 'quest_completed':
          return catalogSelect(this.catalog.quests, entry.target);
        case 'has_item':
          return catalogSelect(this.catalog.items, entry.target);
        case 'talked_to_npc':
          return catalogSelect(this.catalog.npcs, entry.target);
        case 'visited_scene':
          return catalogSelect(this.catalog.scenes, entry.target);
        case 'has_flag':
          return catalogSelect(this.catalog.flags, entry.target);
        case 'stage_at_least':
          return catalogSelect(this.catalog.stages, entry.target);
        default:
          return '';
      }
    })();
    return `<div class="qe-start-cond" data-start-cond-index="${index}" style="display:grid;grid-template-columns:140px 1fr 38px;gap:5px;margin:5px 0;">
      <select data-start-cond-field="type" class="qe-input qe-start-cond-type">${typeOptions.map((o) => `<option value="${o.value}" ${o.value === currentType ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
      ${targetSelectHtml}
      <button data-action="remove-start-condition" data-start-cond-index="${index}" class="qe-btn qe-danger">×</button>
    </div>`;
  }

  private syncSelectedQuestFromForm(): void {
    const quest = this.getSelectedQuest();
    if (!quest || !this.questFormEl.querySelector('[data-q-field="id"]')) return;
    const oldId = quest.id;
    const requestedId = this.qValue('id').trim();
    if (requestedId && (requestedId === oldId || !this.project.quests.some((item) => item.id === requestedId))) {
      quest.id = requestedId;
      this.selectedQuestId = requestedId;
    }
    quest.title = this.qValue('title');
    quest.desc = this.qValue('desc');
    quest.category = asCategory(this.qValue('category'));
    quest.autoStart = this.qChecked('autoStart') || undefined;

    quest.stage = this.qValue('stage').trim() || undefined;
    quest.advanceStageTo = this.qValue('advanceStageTo').trim() || undefined;

    // 开启条件：从 conditions 列表读取
    const conditions: StartConditionEntry[] = [...this.questFormEl.querySelectorAll<HTMLElement>('.qe-start-cond')].map((el) => {
      const type = (el.querySelector('[data-start-cond-field="type"]') as HTMLSelectElement)?.value as StartConditionType;
      const target = (el.querySelector('[data-start-cond-field="target"]') as HTMLInputElement | HTMLSelectElement)?.value.trim() ?? '';
      return { type, target };
    });

    const startLogic = this.qValue('startLogic') === 'OR' ? 'OR' : 'AND';
    quest.startCondition = conditions.length
      ? { conditions, logic: startLogic }
      : undefined;

    quest.steps = [...this.questFormEl.querySelectorAll<HTMLElement>('.qe-step')].map((stepEl) => {
      const step: QuestStep = {
        id: nestedValue(stepEl, 'step', 'id'),
        desc: nestedValue(stepEl, 'step', 'desc'),
        logic: nestedValue(stepEl, 'step', 'logic') === 'OR' ? 'OR' : 'AND',
        objectives: [],
      };
      const completeText = nestedValue(stepEl, 'step', 'onCompleteText').trim();
      if (completeText) step.onCompleteText = completeText;
      step.objectives = [...stepEl.querySelectorAll<HTMLElement>('.qe-objective')].map((objectiveEl) => {
        const objective: QuestObjective = {
          type: asObjectiveType(nestedValue(objectiveEl, 'objective', 'type')),
          target: nestedValue(objectiveEl, 'objective', 'target').trim(),
          count: positiveNumber(nestedValue(objectiveEl, 'objective', 'count'), 1),
        };
        const submitTo = nestedValue(objectiveEl, 'objective', 'submitTo').trim();
        if (submitTo) objective.submitTo = submitTo;
        const x = optionalNumber(nestedValue(objectiveEl, 'objective', 'x'));
        const y = optionalNumber(nestedValue(objectiveEl, 'objective', 'y'));
        const radius = optionalNumber(nestedValue(objectiveEl, 'objective', 'radius'));
        if (x !== undefined && y !== undefined) objective.location = { x, y, radius };
        return objective;
      });
      return step;
    });

    const rewardItems = this.qRewardItems();
    const rewardExp = positiveNumber(this.qValue('rewardExp'), 0);
    const rewardFlags = this.qMulti('rewardFlags');
    const unlockScenes = this.qMulti('unlockScenes');
    const unlockDialogues = this.qMulti('unlockDialogues');
    quest.rewards = rewardItems.length || rewardExp || rewardFlags.length || unlockScenes.length || unlockDialogues.length
      ? {
          items: rewardItems.length ? rewardItems : undefined,
          exp: rewardExp || undefined,
          flags: rewardFlags.length ? rewardFlags : undefined,
          unlockScenes: unlockScenes.length ? unlockScenes : undefined,
          unlockDialogues: unlockDialogues.length ? unlockDialogues : undefined,
        }
      : undefined;
    quest.completionText = this.qValue('completionText').trim() || undefined;
    const completeFlags = this.qMulti('completeFlags');
    quest.onCompleteFlags = completeFlags.length ? completeFlags : undefined;

    if (oldId !== quest.id) this.renderQuestList();
  }

  // ─── 地图锚点 ───

  private populateScenes(): void {
    const scenes = this.callbacks.listScenes();
    this.sceneSelectEl.innerHTML = scenes.map((scene) => `<option value="${escapeAttr(scene.id)}">${escapeHtml(scene.name)} · ${escapeHtml(scene.id)}</option>`).join('');
    this.selectedSceneId = scenes[0]?.id ?? '';
    this.sceneSelectEl.value = this.selectedSceneId;
  }

  private beginPlacement(): void {
    const id = this.roleValue('placement-id').trim();
    const targetId = this.roleValue('placement-target').trim();
    if (!id || !targetId) {
      this.setStatus('放置锚点需要填写锚点 ID 和目标 ID', true);
      return;
    }
    if (this.project.placements.some((placement) => placement.id === id)) {
      this.setStatus(`锚点 ID 已存在：${id}`, true);
      return;
    }
    this.setPlacementMode(true);
  }

  private handleMapClick(event: MouseEvent): void {
    if (!this.placementMode) return;
    const scene = this.callbacks.getScene(this.selectedSceneId);
    if (!scene) return;
    const rect = this.mapStageEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const placement: QuestPlacement = {
      id: this.roleValue('placement-id').trim(),
      kind: asPlacementKind(this.roleValue('placement-kind')),
      targetId: this.roleValue('placement-target').trim(),
      label: this.roleValue('placement-label').trim() || this.roleValue('placement-id').trim(),
      sceneId: scene.id,
      x: round1(((event.clientX - rect.left) / rect.width) * scene.worldW),
      y: round1(((event.clientY - rect.top) / rect.height) * scene.worldH),
    };
    this.project.placements.push(placement);
    this.setPlacementMode(false);
    this.saveDraft(`已放置 ${placement.kind}：${placement.id}（点击「写入源文件」后生效）`);
  }

  private renderMap(): void {
    const scene = this.callbacks.getScene(this.selectedSceneId);
    if (!scene) return;
    if (this.mapImageEl.getAttribute('src') !== scene.bgImage) this.mapImageEl.src = scene.bgImage;
    this.layoutMap();
  }

  private layoutMap(): void {
    const scene = this.callbacks.getScene(this.selectedSceneId);
    if (!scene) return;
    const viewport = this.mapViewportEl.getBoundingClientRect();
    if (viewport.width < 40 || viewport.height < 40) return;
    const imageW = this.mapImageEl.naturalWidth || scene.worldW;
    const imageH = this.mapImageEl.naturalHeight || scene.worldH;
    const scale = Math.min((viewport.width - 20) / imageW, (viewport.height - 20) / imageH);
    this.mapStageEl.style.width = `${Math.max(1, imageW * scale)}px`;
    this.mapStageEl.style.height = `${Math.max(1, imageH * scale)}px`;
    this.renderMarkers();
  }

  private renderMarkers(): void {
    const scene = this.callbacks.getScene(this.selectedSceneId);
    if (!scene) return;
    const authored = this.project.placements.filter((placement) => placement.sceneId === scene.id);
    const markers = [
      ...scene.markers.map((marker) => ({ ...marker, authored: false })),
      ...authored.map((marker) => ({ ...marker, authored: true })),
    ];
    this.markerLayerEl.innerHTML = markers.map((marker) => {
      const color = marker.kind === 'npc' ? '#00f3ff' : marker.kind === 'item' ? '#ffaa00' : '#ff2d6f';
      const x = (marker.x / scene.worldW) * 100;
      const y = (marker.y / scene.worldH) * 100;
      return `<div title="${escapeAttr(`${marker.label} (${round1(marker.x)}, ${round1(marker.y)})`)}" style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);color:${color};font-size:${marker.authored ? 17 : 12}px;text-shadow:0 0 5px ${color};pointer-events:none;">${marker.authored ? '◆' : '●'}</div>`;
    }).join('');

    this.placementListEl.innerHTML = authored.length
      ? authored.map((placement) => `<div style="display:grid;grid-template-columns:60px 1fr 90px auto;gap:7px;align-items:center;padding:3px 5px;border-bottom:1px solid #122833;font:11px monospace;">
          <span style="color:${placement.kind === 'npc' ? '#00f3ff' : placement.kind === 'item' ? '#ffaa00' : '#ff2d6f'}">${placement.kind}</span>
          <span>${escapeHtml(placement.id)} → ${escapeHtml(placement.targetId)}</span>
          <span style="color:#66838f">${round1(placement.x)}, ${round1(placement.y)}</span>
          <button data-delete-placement="${escapeAttr(placement.id)}" class="qe-btn qe-danger">删除</button>
        </div>`).join('')
      : '<span style="color:#536975;font-size:11px;">当前场景没有编辑器锚点</span>';
  }

  private setPlacementMode(enabled: boolean): void {
    this.placementMode = enabled;
    const hint = requiredElement(this.overlayEl, '[data-role="place-hint"]', HTMLDivElement);
    hint.style.display = enabled ? 'block' : 'none';
    this.mapStageEl.style.cursor = enabled ? 'crosshair' : 'default';
  }

  // ─── 工程持久化 ───

  /** 编辑/删除操作：立即应用到引擎并异步写入源文件。 */
  private saveDraft(message: string): void {
    this.project.updatedAt = Date.now();
    const errors = this.callbacks.applyProject(cloneQuestEditorProject(this.project));
    if (errors.length > 0) this.setStatus(errors.join('；'), true);
    else this.setStatus(message);
    this.renderAll();
    void this.writeProjectToFile();
  }

  /** 将当前 project 原子地应用到引擎运行时（不写文件）。仅初始化加载和写入源文件时调用。 */
  private commitProject(message: string): boolean {
    const candidate = cloneQuestEditorProject(this.project);
    candidate.updatedAt = Date.now();
    const errors = this.callbacks.applyProject(candidate);
    if (errors.length > 0) {
      this.setStatus(errors.join('；'), true);
      return false;
    }
    this.project = candidate;
    this.setStatus(message);
    this.renderAll();
    return true;
  }

  private async loadSavedProject(): Promise<void> {
    // 唯一读取来源：服务器源文件（内置数据仅为服务器不可用时的兜底）。
    try {
      const response = await fetch('/api/dev/quests/load');
      if (!response.ok) return;
      const fromFile = parseQuestEditorProject(await response.json() as unknown);
      if (fromFile) this.applyLoadedProject(fromFile);
    } catch {
      // 静态托管没有开发 API 时使用内置数据。
    }
  }

  private applyLoadedProject(project: QuestEditorProject): void {
    const safe = normalizeQuestEditorProject(project);
    const errors = this.callbacks.applyProject(safe);
    if (errors.length > 0) {
      this.setStatus(errors.join('；'), true);
      return;
    }
    this.project = cloneQuestEditorProject(safe);
    this.selectedQuestId = this.project.quests[0]?.id ?? null;
    this.renderAll();
  }

  private async writeProjectToFile(): Promise<void> {
    this.syncSelectedQuestFromForm();
    const errors = this.project.quests.flatMap(validateQuestDefinition);
    if (errors.length > 0) {
      this.setStatus(errors.join('；'), true);
      return;
    }
    const candidate = cloneQuestEditorProject(this.project);
    candidate.updatedAt = Date.now();
    // 先应用到引擎运行时
    const applyErrors = this.callbacks.applyProject(candidate);
    if (applyErrors.length > 0) {
      this.setStatus(applyErrors.join('；'), true);
      return;
    }
    this.project = candidate;
    try {
      const response = await fetch('/api/dev/quests/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.setStatus('已写入源文件并应用到引擎');
    } catch (error) {
      this.setStatus(`写入文件失败（已应用到引擎，下次保存重试）：${error instanceof Error ? error.message : '未知错误'}`, true);
    }
  }

  private exportProject(): void {
    this.syncSelectedQuestFromForm();
    const json = JSON.stringify(this.project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'quest-editor-project.json';
    anchor.click();
    URL.revokeObjectURL(url);
    this.setStatus('已导出 quest-editor-project.json');
  }

  // ─── 公共控制 ───

  toggle(force?: boolean): void {
    this.active = force ?? !this.active;
    this.overlayEl.style.display = this.active ? 'flex' : 'none';
    if (this.active) {
      // 每次打开时刷新 catalog，确保最新添加的 NPC/物品/任务（含 project 内 quest）都能选到
      this.catalog = this.callbacks.listCatalog();
      this.renderAll();
      this.renderDialogueList();
      this.renderDialogueDetail();
      requestAnimationFrame(() => this.layoutMap());
    } else {
      this.setPlacementMode(false);
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  private renderAll(): void {
    this.renderQuestList();
    this.renderQuestForm();
    this.renderMap();
  }

  private getSelectedQuest(): Quest | null {
    return this.project.quests.find((quest) => quest.id === this.selectedQuestId) ?? null;
  }

  private qValue(fieldName: string): string {
    const field = this.questFormEl.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-q-field="${fieldName}"]`);
    return field?.value ?? '';
  }

  private qChecked(fieldName: string): boolean {
    return this.questFormEl.querySelector<HTMLInputElement>(`[data-q-field="${fieldName}"]`)?.checked ?? false;
  }

  /** 收集某 multi 字段所有勾选的 id */
  private qMulti(fieldName: string): string[] {
    return [...this.questFormEl.querySelectorAll<HTMLInputElement>(`[data-q-multi="${fieldName}"]:checked`)]
      .map((el) => el.value)
      .filter(Boolean);
  }

  /** 收集物品奖励：勾选的物品 id + 对应数量 */
  private qRewardItems(): Array<string | QuestRewardItem> {
    const result: Array<string | QuestRewardItem> = [];
    const checked = this.questFormEl.querySelectorAll<HTMLInputElement>('[data-q-reward-item]:checked');
    for (const cb of checked) {
      const itemId = cb.dataset.qRewardItem!;
      const countEl = this.questFormEl.querySelector<HTMLInputElement>(`[data-q-reward-count="${itemId}"]`);
      const count = positiveNumber(countEl?.value ?? '1', 1);
      result.push(count === 1 ? itemId : { itemId, count });
    }
    return result;
  }

  private roleValue(role: string): string {
    return this.overlayEl.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-role="${role}"]`)?.value ?? '';
  }

  private setStatus(message: string, error = false): void {
    this.statusEl.textContent = message;
    this.statusEl.style.color = error ? '#ff5577' : '#8aa6b2';
  }

  private aiGeneratedQuest: Quest | null = null;

  private openAIDialog(): void {
    if (!this.aiDialogEl) return;
    this.aiDialogEl.style.display = 'flex';
    if (this.aiInputEl) this.aiInputEl.value = '';
    if (this.aiResultEl) this.aiResultEl.innerHTML = '';
    this.aiGeneratedQuest = null;
    this.bindAIDialogButtons();
  }

  private bindAIDialogButtons(): void {
    if (!this.aiDialogEl) return;
    const submitBtn = this.aiDialogEl.querySelector<HTMLButtonElement>('[data-action="ai-submit"]');
    const cancelBtn = this.aiDialogEl.querySelector<HTMLButtonElement>('[data-action="ai-cancel"]');
    if (submitBtn) {
      submitBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.generateQuest();
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeAIDialog();
      };
    }
  }

  private closeAIDialog(): void {
    if (this.aiDialogEl) this.aiDialogEl.style.display = 'none';
  }

  private async generateQuest(): Promise<void> {
    const prompt = this.aiInputEl?.value.trim();
    if (!prompt) {
      if (this.aiResultEl) this.aiResultEl.innerHTML = '<div style="color:#ff5577;padding:12px;">请输入任务描述</div>';
      return;
    }
    if (!this.aiResultEl) return;
    this.aiResultEl.innerHTML = '<div style="color:#8aa6b2;padding:20px;">正在生成任务…</div>';
    if (this.aiInputEl) this.aiInputEl.disabled = true;
    try {
      const resp = await fetch('/api/quest/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, catalog: this.catalog }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      this.aiGeneratedQuest = data.quest as Quest;
      this.aiResultEl.innerHTML = `<div style="color:#5ada8f;padding:12px;">✓ 生成成功</div><pre style="color:#c8d8e0;font-size:11px;white-space:pre-wrap;max-height:300px;overflow-y:auto;">${JSON.stringify(data.quest, null, 2)}</pre><div style="margin-top:12px;display:flex;gap:8px;"><button data-action="ai-accept" style="padding:6px 16px;background:#1a3a2a;color:#5ada8f;border:1px solid #5ada8f;cursor:pointer;font-family:inherit;">导入任务</button><button data-action="ai-reject" style="padding:6px 16px;background:#3a1a1a;color:#ff5577;border:1px solid #ff5577;cursor:pointer;font-family:inherit;">重新生成</button></div>`;
      const acceptBtn = this.aiResultEl.querySelector<HTMLButtonElement>('[data-action="ai-accept"]');
      const rejectBtn = this.aiResultEl.querySelector<HTMLButtonElement>('[data-action="ai-reject"]');
      if (acceptBtn) acceptBtn.onclick = () => this.acceptAIQuest();
      if (rejectBtn) rejectBtn.onclick = () => void this.generateQuest();
    } catch (e) {
      this.aiResultEl.innerHTML = `<div style="color:#ff5577;padding:20px;">生成失败: ${e instanceof Error ? e.message : String(e)}</div>`;
    } finally {
      if (this.aiInputEl) this.aiInputEl.disabled = false;
    }
  }

  private acceptAIQuest(): void {
    if (!this.aiGeneratedQuest) return;
    const normalized = normalizeQuest(this.aiGeneratedQuest);
    const existingIds = new Set(this.project.quests.map((q) => q.id));
    if (existingIds.has(normalized.id)) {
      let i = 2;
      while (existingIds.has(`${normalized.id}_${i}`)) i++;
      normalized.id = `${normalized.id}_${i}`;
    }
    this.project.quests.push(normalized);
    this.selectedQuestId = normalized.id;
    this.closeAIDialog();
    this.renderAll();
    this.setStatus('AI 任务已导入，记得保存并应用');
  }

}

// ─── 小型 DOM / 数据辅助函数 ───

function requiredElement<T extends Element>(root: ParentNode, selector: string, ctor: { new(): T }): T {
  const element = root.querySelector(selector);
  if (!(element instanceof ctor)) throw new Error(`QuestEditor 缺少元素：${selector}`);
  return element;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function nestedValue(root: HTMLElement, group: 'step' | 'objective', name: string): string {
  return root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-${group}-field="${name}"]`)?.value ?? '';
}

function field(label: string, control: string): string {
  return `<label style="display:block;font-size:10px;color:#6d8a97;margin:6px 0;">${escapeHtml(label)}${control}</label>`;
}

/** 阶段下拉；allowNone=true 时第一个选项为"不推进"。 */
function stageSelect(stages: readonly QuestEditorCatalogEntry[], current: string, allowNone = false): string {
  const noneLabel = allowNone ? '不推进' : '所有阶段';
  const opts = `<option value="">${noneLabel}</option>` + stages.map((s) =>
    `<option value="${escapeAttr(s.id)}" ${s.id === current ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
  ).join('');
  return `<select data-q-field="${allowNone ? 'advanceStageTo' : 'stage'}" class="qe-input">${opts}</select>`;
}

function options(values: readonly string[], selected: string): string {
  return values.map((value) => `<option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

/**
 * 根据 catalog 条目生成 <select> 的 <option> 列表。
 * 显示格式：`中文名 (id)`；空 selected 值会插入一个占位空选项。
 */
function catalogOptions(entries: readonly QuestEditorCatalogEntry[], selected: string): string {
  const placeholder = '<option value="">— 请选择 —</option>';
  const opts = entries.map((entry) =>
    `<option value="${escapeAttr(entry.id)}" ${entry.id === selected ? 'selected' : ''}>${escapeHtml(entry.label)} (${escapeHtml(entry.id)})</option>`,
  ).join('');
  return placeholder + opts;
}

/**
 * 生成一个基于 catalog 的 <select> 控件，自动根据 objective 类型选对应清单。
 * 用于目标 target 字段。
 */
function targetSelectByType(type: QuestObjective['type'], catalog: QuestEditorCatalog, selected: string): string {
  let entries: readonly QuestEditorCatalogEntry[];
  switch (type) {
    case 'reach_location': entries = catalog.scenes; break;
    case 'talk_to_npc': entries = catalog.npcs; break;
    case 'collect_item':
    case 'submit_item': entries = catalog.items; break;
    case 'trigger_event': entries = catalog.events; break;
    case 'custom_flag': entries = catalog.flags; break;
    default: entries = [];
  }
  if (entries.length === 0 && type !== 'custom_flag') {
    return `<input data-objective-field="target" class="qe-input" placeholder="ID" value="${escapeAttr(selected)}">`;
  }
  return `<select data-objective-field="target" class="qe-input">${catalogOptions(entries, selected)}</select>`;
}

/** 根据 catalog 生成 NPC 下拉（submitTo / 前置对话等用） */
function npcSelect(catalog: QuestEditorCatalog, selected: string): string {
  return `<select class="qe-input" ${'data-objective-field="submitTo"'}>${catalogOptions(catalog.npcs, selected)}</select>`;
}

/**
 * 单选下拉：从 catalog 条目生成 select，选中当前值。
 */
function catalogSelect(entries: readonly QuestEditorCatalogEntry[], current: string): string {
  const opts = entries.length === 0
    ? '<option value="">（无可选项）</option>'
    : `<option value="">— 选择 —</option>` + entries.map((entry) =>
      `<option value="${escapeAttr(entry.id)}" ${entry.id === current ? 'selected' : ''}>${escapeHtml(entry.label)} (${escapeHtml(entry.id)})</option>`
    ).join('');
  return `<select data-start-cond-field="target" class="qe-input">${opts}</select>`;
}

/**
 * 多值字段：用 checkbox 列表呈现，每个 catalog 条目一个复选框。
 * 读取时通过 querySelectorAll<HTMLInputElement>('[data-q-multi="field"]:checked') 收集。
 */
function questMultiSelect(entries: readonly QuestEditorCatalogEntry[], selected: readonly string[], dataField: string): string {
  if (entries.length === 0) {
    return `<div class="qe-input" style="color:#536975;font-size:11px;padding:6px;">暂无可选项</div>`;
  }
  const selectedSet = new Set(selected);
  const checkboxes = entries.map((entry) => {
    const checked = selectedSet.has(entry.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:5px;padding:3px 0;font-size:11px;color:#a0c0cc;cursor:pointer;">
      <input type="checkbox" data-q-multi="${escapeAttr(dataField)}" value="${escapeAttr(entry.id)}" ${checked}>
      <span>${escapeHtml(entry.label)} <span style="color:#566;">(${escapeHtml(entry.id)})</span></span>
    </label>`;
  }).join('');
  return `<div style="background:#07131b;border:1px solid #18313d;padding:6px 8px;max-height:90px;overflow:auto;border-radius:3px;">${checkboxes}</div>`;
}

/**
 * 物品奖励：每个可选物品一行，带数量输入框。
 * 读取时通过 querySelectorAll('[data-q-reward-item]:checked') + 对应 [data-q-reward-count] 收集。
 */
function rewardItemsSelect(entries: readonly QuestEditorCatalogEntry[], current: Array<string | QuestRewardItem>): string {
  if (entries.length === 0) {
    return `<div class="qe-input" style="color:#536975;font-size:11px;padding:6px;">暂无可选物品</div>`;
  }
  const countMap = new Map<string, number>();
  for (const item of current) {
    if (typeof item === 'string') { if (item) countMap.set(item, 1); continue; }
    if (item && typeof item === 'object') {
      const obj = item as unknown as Record<string, unknown>;
      const id = typeof obj.itemId === 'string' ? obj.itemId : typeof obj.id === 'string' ? obj.id : '';
      if (id) countMap.set(id, typeof obj.count === 'number' ? obj.count : 1);
    }
  }
  const rows = entries.map((entry) => {
    const count = countMap.get(entry.id);
    const checked = count !== undefined ? 'checked' : '';
    const countVal = count ?? 1;
    return `<label style="display:grid;grid-template-columns:1fr 60px;gap:6px;align-items:center;padding:3px 0;font-size:11px;color:#a0c0cc;cursor:pointer;">
      <span style="display:flex;align-items:center;gap:5px;">
        <input type="checkbox" data-q-reward-item="${escapeAttr(entry.id)}" ${checked}>
        <span>${escapeHtml(entry.label)} <span style="color:#566;">(${escapeHtml(entry.id)})</span></span>
      </span>
      <input type="number" min="1" value="${countVal}" data-q-reward-count="${escapeAttr(entry.id)}" class="qe-input" style="font-size:11px;padding:2px 4px;">
    </label>`;
  }).join('');
  return `<div style="background:#07131b;border:1px solid #18313d;padding:6px 8px;max-height:140px;overflow:auto;border-radius:3px;">${rows}</div>`;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function nextStepId(steps: readonly QuestStep[]): string {
  let index = steps.length + 1;
  let id = `step_${index}`;
  while (steps.some((step) => step.id === id)) id = `step_${++index}`;
  return id;
}

function asCategory(value: string): Quest['category'] {
  return value === 'side' || value === 'hidden' ? value : 'main';
}

function asObjectiveType(value: string): QuestObjective['type'] {
  const valid: QuestObjective['type'][] = ['reach_location', 'talk_to_npc', 'collect_item', 'submit_item', 'trigger_event', 'custom_flag'];
  return valid.includes(value as QuestObjective['type']) ? value as QuestObjective['type'] : 'trigger_event';
}

function asPlacementKind(value: string): QuestPlacementKind {
  return value === 'item' || value === 'event' ? value : 'npc';
}

/**
 * 修复从 JSON 加载的 quest 对象，确保所有嵌套字段
 * 都有完整的结构和合法默认值。防止旧版数据或缺字段导致渲染崩溃。
 */
function normalizeQuest(raw: unknown): Quest {
  const q = (raw ?? {}) as Record<string, unknown>;
  const steps = Array.isArray(q.steps) ? q.steps : [];
  return {
    id: typeof q.id === 'string' && q.id ? q.id : `quest_${Date.now()}`,
    title: typeof q.title === 'string' ? q.title : '',
    desc: typeof q.desc === 'string' ? q.desc : '',
    category: q.category === 'side' || q.category === 'hidden' ? q.category : 'main',
    autoStart: typeof q.autoStart === 'boolean' ? q.autoStart : false,
    startCondition: normalizeStartCondition(q.startCondition),
    steps: steps.length > 0 ? steps.map(normalizeStep) : [{
      id: 'step_1',
      desc: '新步骤',
      objectives: [{ type: 'trigger_event' as const, target: '' }],
    }],
    rewards: normalizeReward(q.rewards),
    completionText: typeof q.completionText === 'string' ? q.completionText : undefined,
    onCompleteFlags: Array.isArray(q.onCompleteFlags) ? q.onCompleteFlags.filter((f): f is string => typeof f === 'string') : undefined,
    stage: typeof q.stage === 'string' && q.stage.trim() ? q.stage.trim() : undefined,
    advanceStageTo: typeof q.advanceStageTo === 'string' && q.advanceStageTo.trim() ? q.advanceStageTo.trim() : undefined,
  };
}

function normalizeStartCondition(raw: unknown): QuestStartCondition | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const logic = c.logic === 'OR' ? 'OR' : 'AND';

  // 新格式：conditions 数组
  const rawConditions = Array.isArray(c.conditions) ? c.conditions : [];
  const validTypes: readonly StartConditionType[] = ['quest_completed', 'has_item', 'talked_to_npc', 'visited_scene', 'has_flag', 'stage_at_least'];
  const conditions: StartConditionEntry[] = rawConditions
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const type = (typeof e.type === 'string' && validTypes.includes(e.type as StartConditionType))
        ? e.type as StartConditionType : 'quest_completed';
      const target = typeof e.target === 'string' ? e.target.trim() : '';
      return target ? { type, target } : null;
    })
    .filter((entry): entry is StartConditionEntry => entry !== null);

  // 旧格式迁移
  const oldQuests = Array.isArray(c.questsCompleted) ? c.questsCompleted.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
  const oldFlags = Array.isArray(c.flags) ? c.flags.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
  const oldScene = typeof c.sceneId === 'string' && c.sceneId ? c.sceneId : '';

  for (const q of oldQuests) conditions.push({ type: 'quest_completed', target: q });
  for (const f of oldFlags) conditions.push({ type: 'has_flag', target: f });
  if (oldScene) conditions.push({ type: 'visited_scene', target: oldScene });

  if (conditions.length === 0) return undefined;
  return { conditions, logic };
}

function normalizeStep(raw: unknown): QuestStep {
  const s = (raw ?? {}) as Record<string, unknown>;
  const objectives = Array.isArray(s.objectives) ? s.objectives : [];
  return {
    id: typeof s.id === 'string' && s.id ? s.id : `step_${Math.random().toString(36).slice(2, 6)}`,
    desc: typeof s.desc === 'string' ? s.desc : '',
    objectives: objectives.length > 0 ? objectives.map(normalizeObjective) : [{ type: 'trigger_event' as const, target: '' }],
    logic: s.logic === 'OR' ? 'OR' : 'AND',
    onCompleteText: typeof s.onCompleteText === 'string' && s.onCompleteText ? s.onCompleteText : undefined,
  };
}

function normalizeObjective(raw: unknown): QuestObjective {
  const o = (raw ?? {}) as Record<string, unknown>;
  const type = asObjectiveType(typeof o.type === 'string' ? o.type : 'trigger_event');
  const target = typeof o.target === 'string' ? o.target : '';
  const obj: QuestObjective = { type, target };
  if (typeof o.count === 'number' && o.count > 0) obj.count = o.count;
  if (typeof o.submitTo === 'string' && o.submitTo) obj.submitTo = o.submitTo;
  if (o.location && typeof o.location === 'object') {
    const loc = o.location as Record<string, unknown>;
    if (typeof loc.x === 'number' && typeof loc.y === 'number') {
      obj.location = { x: loc.x, y: loc.y };
      if (typeof loc.radius === 'number') obj.location.radius = loc.radius;
    }
  }
  return obj;
}

function normalizeReward(raw: unknown): QuestReward | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const has = (k: string) => r[k] !== undefined;
  if (!has('items') && !has('exp') && !has('flags') && !has('unlockScenes') && !has('unlockDialogues')) return undefined;
  const items = Array.isArray(r.items)
    ? r.items.map((v): string | QuestRewardItem => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          const obj = v as Record<string, unknown>;
          const itemId = typeof obj.itemId === 'string' ? obj.itemId : typeof obj.id === 'string' ? obj.id : '';
          if (itemId) return { itemId, count: typeof obj.count === 'number' ? obj.count : 1 };
        }
        return '';
      }).filter((v) => v !== '')
    : undefined;
  return {
    items: items && items.length > 0 ? items : undefined,
    exp: typeof r.exp === 'number' ? r.exp : undefined,
    flags: Array.isArray(r.flags) ? r.flags.filter((v): v is string => typeof v === 'string') : undefined,
    unlockScenes: Array.isArray(r.unlockScenes) ? r.unlockScenes.filter((v): v is string => typeof v === 'string') : undefined,
    unlockDialogues: Array.isArray(r.unlockDialogues) ? r.unlockDialogues.filter((v): v is string => typeof v === 'string') : undefined,
  };
}

function normalizeQuestEditorProject(raw: unknown): QuestEditorProject {
  const p = (raw ?? {}) as Record<string, unknown>;
  const quests = Array.isArray(p.quests) ? p.quests.map(normalizeQuest) : [];
  const placements = Array.isArray(p.placements) ? (p.placements as unknown[]).map((raw) => {
    const pl = (raw ?? {}) as Record<string, unknown>;
    return {
      id: typeof pl.id === 'string' ? pl.id : '',
      kind: asPlacementKind(typeof pl.kind === 'string' ? pl.kind : 'npc'),
      targetId: typeof pl.targetId === 'string' ? pl.targetId : typeof pl.target === 'string' ? pl.target : '',
      label: typeof pl.label === 'string' ? pl.label : '',
      sceneId: typeof pl.sceneId === 'string' ? pl.sceneId : '',
      x: typeof pl.x === 'number' ? pl.x : 0,
      y: typeof pl.y === 'number' ? pl.y : 0,
    } as QuestPlacement;
  }).filter((pl) => pl.id) : [];

  // 对话树编辑数据（直接透传，不做深层校验）
  const dialogueData: DialogueData = {};
  if (p.dialogueData && typeof p.dialogueData === 'object') {
    for (const [k, v] of Object.entries(p.dialogueData as Record<string, unknown>)) {
      if (typeof k === 'string' && v && typeof v === 'object') dialogueData[k] = v as DialogueTree;
    }
  }

  return {
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    quests,
    placements,
    dialogueData,
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value: string): string {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#039;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
