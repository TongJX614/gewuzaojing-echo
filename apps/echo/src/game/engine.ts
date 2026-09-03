// ============================================================
// 游戏主引擎 — 组合所有子系统
// ============================================================

import { PixelRenderer, DEFAULT_RENDER_CONFIG } from './renderer';
import { InputManager } from './input';
import { Camera } from './camera';
import { Player } from '../entities/player';
import { NPC } from '../entities/npc';
import { InteractiveItem } from '../entities/item';
import { DialogueSystem } from '../systems/dialogue';
import { DialogueRegistry } from '../systems/dialogue-registry';
import { QuestManager, validateQuestDefinition } from '../systems/quest';
import { ProgressManager } from '../systems/progress';
import { StageManager, STAGE_ORDER, stageIdToNumber as stageToNumber } from '../systems/stage-manager';
import type { StageStateData } from '../data/quests/editor-types';
import { DialogueUI } from '../ui/dialogue-ui';
import { StatusUI } from '../ui/status-ui';
import { QuestUI } from '../ui/quest-ui';
import { NotificationSystem } from '../systems/notifications';
import { NotificationUI } from '../ui/notification-ui';
import { MinigameOverlay } from '../ui/minigame-overlay';
import { playSolvayIntroVideo, setSolvayIntroPaused } from '../ui/solvay-intro';
import { SystemMenu } from '../ui/system-menu';
import { ALL_SCENES } from '../scenes/scenes';
import { SceneDef } from '../scenes/scene';
import type { DialogueTree } from '../data/dialogues';
import { CHARACTERS } from '../data/characters';
import type { StartConditionEntry } from '../data/quests/types';
import type { NarrativeAction, ConditionContext } from '../systems/condition-action';
import { evaluateStartConditionEntry, legacyEffectToActions } from '../systems/condition-action';
import { PathfindingSystem } from '../systems/pathfinding';
import { InventorySystem } from '../systems/inventory';
import { DevTools, DevSceneData, DevMarker, DevCollider } from '../ui/dev-tools';
import { InventoryUI } from '../ui/inventory-ui';
import { QuestEditor, type QuestEditorMapMarker, type QuestEditorSceneSnapshot, type QuestEditorCatalog, type DialogueSummary } from '../ui/quest-editor';
import { TerminalUI } from '../ui/terminal-ui';
import { prepareVrExperience } from '../systems/vr-experience';
import {
  LocalSaveGameStore,
  SaveGameError,
  type GameSnapshot,
  type ManualSaveSlotId,
  type SaveEnvelope,
  type SaveGameStore,
  type SaveSlotId,
} from '../systems/save-game';

import { playerSprites, PLAYER_SPRITE_DRAW_HEIGHT, getWalkFrame } from '../assets/player-sprites';
import type { WalkFrameKey } from '../assets/player-sprites';
import { getNpcImage, preloadNpcImage, getNpcSpriteVariants, getNpcSpriteUrl } from '../assets/npc-images';
import type { NpcSpriteVariant } from '../types/npc';
import { loadBackgroundImage, getBackgroundImage } from '../assets/bg-image';
import { ALL_ITEMS, ITEM_PALETTE } from '../data/items';
import { ALL_QUESTS } from '../data/quests';
import type { QuestEvent } from '../data/quests/types';
import editorProjectData from '../data/quests/editor-project.json';
import {
  createEmptyQuestEditorProject,
  parseQuestEditorProject,
  type QuestEditorProject,
  type QuestPlacement,
  type DialogueData,
} from '../data/quests/editor-types';

type ConditionChecker = (entry: StartConditionEntry) => boolean;


// 小游戏通关配置：set flag（CG 续播条件）+ 启动的后续 CG 树
const MINIGAME_COMPLETIONS: Record<string, { flag: string; nextTreeId: string }> = {
  'slit-rebuttal': { flag: 'slit_rebuttal_done', nextTreeId: 'dlg_cg_solvay_debate' },
  'photon-box': { flag: 'photon_box_done', nextTreeId: 'dlg_cg_solvay_final_debate' },
};

export interface GameEngineOptions {
  initialSave?: SaveEnvelope;
  saveStore?: SaveGameStore;
  onLoadRequested?: (slotId: SaveSlotId) => void;
  onReturnToTitle?: () => void;
}

export class GameEngine {
  private renderer: PixelRenderer;
  private input: InputManager;
  private camera: Camera;
  private player: Player;
  private dialogueSystem: DialogueSystem;
  private dialogueRegistry: DialogueRegistry;
  private progressManager: ProgressManager;
  private questManager: QuestManager;
  private stageManager: StageManager;
  /** 静态场景 NPC/Item 基准摆放（Base 数据源），首次加载时记录。 */
  private readonly baseNpcPlacements = new Map<string, { sceneId: string; x: number; y: number }>();
  private readonly baseItemPlacements = new Map<string, { sceneId: string; x: number; y: number }>();
  /** 完整场景对象快照：sceneId -> 原始 NPC/Item 实体（用于按 Stage 重建世界）。 */
  private readonly originalNpcEntities = new Map<string, NPC>();
  private readonly originalItemEntities = new Map<string, InteractiveItem>();
  private dialogueUI: DialogueUI;
  private statusUI: StatusUI;
  private questUI: QuestUI;
  private notificationSystem: NotificationSystem;
  private notificationUI: NotificationUI;
  private minigameOverlay: MinigameOverlay;
  private systemMenu: SystemMenu;

  private currentScene: SceneDef;
  private currentSceneId: string;
  private gameContainer: HTMLDivElement;

  private lastTime: number = 0;
  private running: boolean = false;
  private paused: boolean = false;
  private playtimeMs: number = 0;
  private pendingAutoSave: boolean = false;
  private restoringSave: boolean = false;
  private booting: boolean = true;
  private stageStateReady: Promise<void>;
  private readonly options: GameEngineOptions;
  private readonly saveStore: SaveGameStore;

  // 场景切换动画
  private transitioning: boolean = false;
  private transitionAlpha: number = 0;
  private transitionTarget: { scene: string } | null = null;
  // 标记场景正在异步加载（背景图等），加载完成前不渲染场景内容
  private sceneLoading: boolean = false;

  // 交互提示
  private interactTarget: NPC | InteractiveItem | null = null;
  // 鼠标悬停的物品/NPC
  private hoveredEntity: NPC | InteractiveItem | null = null;

  // 寻路系统
  private pathfinding: PathfindingSystem;
  // 开发工具
  private devTools: DevTools;
  private questEditor: QuestEditor;
  private transitionCooldown = 0;
  // 索尔维视频转场播放中（冻结更新，视频层独立接管画面）
  private solvayIntroPlaying = false;
  // 点击反馈动画
  private clickRipple: { x: number; y: number; t: number } | null = null;
  // 存档系统
  private terminalUI: TerminalUI;
  // 背包系统
  private inventorySystem: InventorySystem;
  private inventoryUI: InventoryUI;
  // 已对话/已拾取追踪
  private talkedSet: Set<string> = new Set();
  private collectedSet: Set<string> = new Set();
  private activeDialogueSource: { kind: 'npc' | 'event'; entityId: string; questTargetId: string } | null = null;
  private lastQuestLocationKey = '';
  private editorQuestIds = new Set<string>();
  private editorEntityIds = new Set<string>();
  private editorNpcTargets = new Map<string, string>();

  constructor(
    canvas: HTMLCanvasElement,
    container: HTMLDivElement,
    options: GameEngineOptions = {},
  ) {
    this.gameContainer = container;
    this.options = options;
    this.saveStore = options.saveStore ?? new LocalSaveGameStore(window.localStorage);

    // 初始化渲染器
    this.renderer = new PixelRenderer(canvas, DEFAULT_RENDER_CONFIG);

    // 初始化输入 — 传入逻辑画布尺寸
    const logicalW = DEFAULT_RENDER_CONFIG.viewWidth * DEFAULT_RENDER_CONFIG.tileSize;
    const logicalH = DEFAULT_RENDER_CONFIG.viewHeight * DEFAULT_RENDER_CONFIG.tileSize;
    this.input = new InputManager(canvas, logicalW, logicalH);

    // 初始场景
    this.currentSceneId = 'office';
    this.currentScene = ALL_SCENES[this.currentSceneId];

    // 预加载初始场景背景贴图
    if (this.currentScene.backgroundImage) {
      loadBackgroundImage(this.currentScene.backgroundImage);
    }

    // 预加载所有场景的背景贴图（避免首次传送时等待加载）
    for (const sceneId of Object.keys(ALL_SCENES)) {
      const sc = ALL_SCENES[sceneId];
      if (sc.backgroundImage && sc.backgroundImage !== this.currentScene.backgroundImage) {
        loadBackgroundImage(sc.backgroundImage);
      }
    }

    // 初始化玩家
    this.player = new Player(this.currentScene.playerStart.x, this.currentScene.playerStart.y);

    // 初始化摄像机
    const { width: mapW, height: mapH } = this.getMapSize();
    this.camera = new Camera(
      DEFAULT_RENDER_CONFIG.viewWidth,
      DEFAULT_RENDER_CONFIG.viewHeight,
      mapW, mapH,
    );
    this.player.setWorldBounds(mapW, mapH);

    // 寻路系统需要在任何异步背景加载回调之前就绪。
    this.pathfinding = new PathfindingSystem();
    this.updatePathfinding();
    this.loadDevColliders();

    // 通知与背包先于任务系统创建，供奖励适配器使用。
    this.notificationSystem = new NotificationSystem();
    this.inventorySystem = new InventorySystem();
    this.inventoryUI = new InventoryUI(this.inventorySystem);
    this.inventorySystem.setOnChange(() => this.inventoryUI.render());
    this.inventoryUI.onDropItem = (itemId: string) => this.dropItemOnMap(itemId);

    // 全局进度 + 事件驱动任务引擎。
    this.progressManager = new ProgressManager();
    this.stageManager = new StageManager();
    this.progressManager.subscribe((change) => {
      if (change.type === 'stage' && this.stageManager) {
        this.stageManager.setCurrentStage(stageToNumber(change.stage));
        // runtime stage 变化统一在此 reconcile（advanceStageTo / stage.set / 恢复全部汇合于此）
        if (!this.devTools?.isActive) this.refreshStageWorldState();
        this.requestAutoSave();
      }
      if (change.type === 'quest_completed' && change.completed) {
        this.requestAutoSave();
      }
    });
    this.stageManager.setCurrentStage(stageToNumber(this.progressManager.getStage()));

    // 独立 stage-state 文件的唯一加载入口（此前定义了但从未调用，刷新即丢 override）
    this.stageStateReady = this.bootStageState();

    this.questManager = new QuestManager(this.progressManager, {
      getInventoryCount: (itemId) => this.inventorySystem.getItemQty(itemId),
      grantItem: (itemId, count) => {
        const granted = this.inventorySystem.addItem(itemId, count);
        if (granted) this.notificationSystem.showPickup(ALL_ITEMS[itemId]?.name ?? itemId);
        return granted;
      },
      grantPlayerExp: (amount) => this.player.addExp(amount),
      getWorldSnapshot: () => ({ sceneId: this.currentSceneId, x: this.player.x, y: this.player.y }),
      unlockScene: (sceneId) => this.progressManager.setFlag(`scene_unlocked:${sceneId}`),
      unlockDialogue: (dialogueId) => this.progressManager.setFlag(`dialogue_unlocked:${dialogueId}`),
      notify: (message, kind) => this.notificationSystem.show(
        message,
        kind === 'error' ? 'danger' : 'quest',
      ),
      stageOrder: STAGE_ORDER,
    }, []);  // 初始为空，Quest Editor 构造后通过 applyQuestEditorProject 注册

    // 初始化对话系统
    this.dialogueRegistry = new DialogueRegistry();
    this.dialogueSystem = new DialogueSystem((effect: string) => this.handleEffect(effect));
    this.dialogueSystem.setOnActions((actions: NarrativeAction[]) => this.executeActions(actions));
    this.dialogueSystem.setOnEnd((tree) => this.handleDialogueCompleted(tree));

    // 初始化 UI
    this.dialogueUI = new DialogueUI(this.dialogueSystem, container);
    this.dialogueUI.setCallbacks(
      () => this.dialogueSystem.advance(),
      (idx: number) => {
        const choices = this.dialogueSystem.state.choices;
        if (choices && choices[idx]) {
          const choice = choices[idx];
          if (choice.next === '__ai_continue__' || choice.next === '__end__') {
            this.dialogueSystem.end();
            return;
          }
          if (choice.next === '__ai_chat__') {
            this.dialogueUI.showAIInput();
            return;
          }
          if (choice.next === '__enter_solvay__') {
            void this.enterSolvayCinematic();
            return;
          }
          this.dialogueSystem.choose(choice);
        }
      },
    );
    this.dialogueUI.onAIDialogue = (node: import('../data/dialogues').DialogueNode, replyNodes?: import('../data/dialogues').DialogueNode[]) => {
      if (!this.dialogueSystem.isActive) return;
      this.dialogueSystem.injectNode(node, replyNodes);
    };
    this.dialogueUI.onGetPlayerName = () => '苏然';
    this.dialogueUI.onGetNpcName = (entityId: string) => {
      const npc = this.currentScene.npcs.find(n => n.entity.id === entityId);
      const key = npc?.entity.id ?? entityId;
      const ch = CHARACTERS[key];
      return ch?.name ?? key;
    };
    this.dialogueUI.onGetAIContext = () => ({
      playerName: '苏然',
      sceneId: this.currentSceneId,
      stage: this.progressManager.getStage(),
      questProgress: this.questManager.getActiveQuests().map(q => ({ id: q.definition.id, title: q.definition.title, stepIndex: q.runtime.currentStepIndex })),
      flags: Array.from(this.progressManager['flags'] as Set<string>),
    });
    this.statusUI = new StatusUI();
    this.questUI = new QuestUI();
    this.notificationUI = new NotificationUI(container, this.notificationSystem);
    this.minigameOverlay = new MinigameOverlay(() => this.openSystemMenu());

    // 挂载 UI
    this.statusUI.mount(container);
    this.questUI.mount(container);

    // 加载玩家贴图
    playerSprites.load();
    // 预加载 DLG 肖像
    import('../assets/dlg-portraits').then(m => m.preloadAllDlg());
    // 预加载当前场景 NPC 贴图
    for (const npc of this.currentScene.npcs) {
      preloadNpcImage(npc.entity.id);
    }

    // 加载背景贴图 — 加载完成后同步世界边界
    if (this.currentScene.backgroundImage) {
      loadBackgroundImage(this.currentScene.backgroundImage).then(() => {
        const { width: mw, height: mh } = this.getMapSize();
        this.player.setWorldBounds(mw, mh);
        this.camera.setMapSize(mw, mh);
        this.updatePathfinding();
      });
    }

    // 窗口自适应
    this.handleResize();
    window.addEventListener('resize', this.handleWindowResize);

    // 开发工具
    this.devTools = new DevTools({
      getSceneData: (): DevSceneData => {
        const { width: mw, height: mh } = this.getMapSize();
        const markers: DevMarker[] = [];
        for (const n of this.currentScene.npcs) {
          markers.push({
            type: 'npc', id: n.entity.id, label: n.entity.name, x: n.entity.x, y: n.entity.y,
            npcId: n.entity.id,
            spriteVariant: n.spriteVariant,
            spriteUrl: getNpcSpriteUrl(n.entity.id, n.spriteVariant ?? 'front'),
          });
        }
        for (const it of this.currentScene.items) {
          markers.push({ type: 'item', id: it.entity.id, label: it.entity.name, x: it.entity.x, y: it.entity.y });
        }
        for (let i = 0; i < this.currentScene.transitions.length; i++) {
          const t = this.currentScene.transitions[i];
          markers.push({ type: 'transition', id: `transition_${i}`, label: t.targetScene, x: t.x, y: t.y });
        }
        return {
          sceneId: this.currentSceneId,
          bgImage: this.currentScene.backgroundImage ?? '',
          worldW: mw,
          worldH: mh,
          colliders: this.currentScene.colliders ?? [],
          markers,
          npcs: this.currentScene.npcs.map(n => ({ id: n.entity.id, name: n.entity.name, x: n.entity.x, y: n.entity.y, spriteVariant: n.spriteVariant })),
          items: this.currentScene.items.map(i => ({ id: i.entity.id, name: i.entity.name, x: i.entity.x, y: i.entity.y })),
          transitions: this.currentScene.transitions.map(t => ({ x: t.x, y: t.y, targetScene: t.targetScene })),
        };
      },
      onColliderAdd: (c: DevCollider) => {
        if (!this.currentScene.colliders) this.currentScene.colliders = [];
        this.currentScene.colliders.push(c);
        this.updatePathfinding();
        this.devTools.refresh();
      },
      onColliderDelete: (index: number) => {
        if (this.currentScene.colliders) {
          this.currentScene.colliders.splice(index, 1);
          this.updatePathfinding();
          this.devTools.refresh();
        }
      },
      onColliderClear: () => {
        this.currentScene.colliders = [];
        this.updatePathfinding();
        this.devTools.refresh();
      },
      getStageList: (): number[] => this.stageManager.getStageList(),
      onPreviewStageChange: (stage: number) => {
        this.stageManager.setPreviewStage(stage);
        // 原子操作：重算世界 → 重取快照 → 替换全部 markers → 重绘
        this.refreshStageWorldState(stage);
        this.devTools.syncMarkers();
      },
      onDevToolsOpen: () => {
        // populate 后同步选中到 runtime stage，进入预览态
        const runtime = stageToNumber(this.progressManager.getStage());
        this.stageManager.setPreviewStage(runtime);
        this.syncStageSelectValue(runtime);
        this.refreshStageWorldState(runtime);
        this.devTools.syncMarkers();
      },
      onPersistStageState: async () => {
        this.stageManager.setTransitions(this.currentSceneId, [...this.currentScene.transitions]);
        await this.persistStageState();
      },
      getPreviewStage: () => this.stageManager.getPreviewStage(),
      onNpcPoseChange: (npcId, stage, variant) => {
        this.stageManager.setSpriteVariantFromStage(stage, npcId, variant);
        void this.persistStageState();
        this.refreshStageWorldState(this.stageManager.getPreviewStage());
        this.devTools.syncMarkers();
      },
      onNpcPoseInheritRestore: (npcId, stage) => {
        this.stageManager.restoreSpriteVariantInheritance(stage, npcId);
        void this.persistStageState();
        this.refreshStageWorldState(this.stageManager.getPreviewStage());
        this.devTools.syncMarkers();
      },
      getNpcVariants: (npcId) => getNpcSpriteVariants(npcId),
      getNpcSpriteUrl: (npcId: string, variant: string) => getNpcSpriteUrl(npcId, variant as NpcSpriteVariant),
      onDevToolsClose: () => {
        // 退出预览：世界按 runtime stage 重算，不残留在 preview stage
        this.stageManager.exitPreview();
        this.refreshStageWorldState();
      },
      onMarkerPreview: (type: string, id: string, x: number, y: number) => {
        // 拖动中的纯视觉预览：只动实体坐标，不写 stageState、不持久化
        if (type === 'npc') {
          for (const sc of Object.values(ALL_SCENES)) {
            const n = sc.npcs.find(n => n.entity.id === id);
            if (n) { n.entity.x = x; n.entity.y = y; break; }
          }
        } else if (type === 'item') {
          for (const sc of Object.values(ALL_SCENES)) {
            const it = sc.items.find(i => i.entity.id === id);
            if (it) { it.entity.x = x; it.entity.y = y; break; }
          }
        }
      },
      onMarkerMove: (type: string, id: string, x: number, y: number) => {
        // 提交显式携带当前编辑的 stage（禁止隐式 activeStage 猜测错层）
        const stage = this.stageManager.getPreviewStage();
        if (type === 'npc') {
          this.stageManager.setPositionFromStage(stage, id, x, y);
          void this.persistStageState();
          this.refreshStageWorldState(stage);
        } else if (type === 'item') {
          this.stageManager.setPositionFromStage(stage, id, x, y);
          void this.persistStageState();
          this.refreshStageWorldState(stage);
        } else if (type === 'transition') {
          const idx = parseInt(id.replace('transition_', ''), 10);
          const t = this.currentScene.transitions[idx];
          if (t) { t.x = x; t.y = y; }
        }
        this.devTools.refresh();
      },
      onPlaceItem: (itemId: string, tileX: number, tileY: number) => {
        const def = ALL_ITEMS[itemId];
        if (!def) return;
        const eid = `${itemId}_dev_${Date.now().toString(36)}`;
        // 创建 InteractiveItem 实例并加入当前场景
        const item = new InteractiveItem(
          eid, tileX, tileY,
          def.id, def.name,
          '', 'doc', false, def.id,
        );
        this.currentScene.items.push(item);
        // 同时写入 Stage 数据
        this.stageManager.addEntity('item', eid, def.name, this.currentSceneId, tileX, tileY);
        void this.persistStageState();
        this.devTools.syncMarkers();
      },
      onDeleteSaved: () => {
        fetch('/api/dev/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneId: this.currentSceneId, colliders: [], markers: [] }),
        }).then(() => this.devTools.refresh()).catch(() => {});
      },
      getSavedColliders: () => this.currentScene.colliders ?? null,
      onPlaceNpc: (npcId: string, npcName: string, tileX: number, tileY: number) => {
        this.stageManager.addEntity('npc', npcId, npcName, this.currentSceneId, tileX, tileY);
        void this.persistStageState();
        this.refreshStageWorldState();
        this.devTools.syncMarkers();
      },
      onPlaceTransition: (targetScene: string, tileX: number, tileY: number) => {
        const reverse = ALL_SCENES[targetScene];
        const rtX = reverse && reverse.worldW != null ? Math.floor(reverse.worldW / 2) : tileX;
        const rtY = reverse && reverse.worldH != null ? Math.floor(reverse.worldH / 2) : tileY;
        this.currentScene.transitions.push({ x: tileX, y: tileY, targetScene, targetX: rtX, targetY: rtY });
        if (reverse) {
          reverse.transitions.push({ x: rtX, y: rtY, targetScene: this.currentSceneId, targetX: tileX, targetY: tileY });
        }
        this.stageManager.setTransitions(this.currentSceneId, [...this.currentScene.transitions]);
        if (reverse) this.stageManager.setTransitions(reverse.id, [...reverse.transitions]);
        void this.persistStageState();
        this.devTools.syncMarkers();
      },
      getCatalogScenes: () => Object.values(ALL_SCENES).map(s => ({ id: s.id, name: s.name })),
      getCurrentSceneId: () => this.currentSceneId,
      getCatalogItems: () => Object.entries(ALL_ITEMS).map(([id, item]) => ({ id, label: `${item.name} (${id})` })),
      onDeleteEntity: (kind: string, id: string) => {
        if (kind === 'item' || kind === 'npc') {
          // Stage 内删除 = 从当前预览 Stage 开始 exists=false（不删 Definition）
          this.stageManager.removeEntity(kind as 'npc' | 'item', id);
          void this.persistStageState();
        } else if (kind === 'transition') {
          const tIdx = parseInt(id.replace('transition_', ''), 10);
          if (!isNaN(tIdx)) this.currentScene.transitions.splice(tIdx, 1);
          this.stageManager.setTransitions(this.currentSceneId, [...this.currentScene.transitions]);
          void this.persistStageState();
        }
        this.refreshStageWorldState();
        this.devTools.syncMarkers();
      },
      onSwitchScene: (sceneId: string) => {
        // Develop Mode 场景选择只切编辑预览：不触发 scene_entered 事件、不写存档状态
        if (ALL_SCENES[sceneId] && sceneId !== this.currentSceneId) {
          this.currentSceneId = sceneId;
          this.currentScene = ALL_SCENES[sceneId];
          this.player.x = 2; this.player.y = 2;
          this.updatePathfinding();
          this.devTools.refreshScene();
        }
      },
    });

    // 任务编辑器：方向左键打开。内置工程为空，不写入任何具体剧情。
    const initialEditorProject = parseQuestEditorProject(editorProjectData)
      ?? createEmptyQuestEditorProject();
    this.questEditor = new QuestEditor({
      listScenes: () => Object.values(ALL_SCENES).map((scene) => ({ id: scene.id, name: scene.name })),
      getScene: (sceneId) => this.getQuestEditorScene(sceneId),
      applyProject: (project) => this.applyQuestEditorProject(project),
      activateQuest: (questId) => this.questManager.activateQuest(questId, true),
      resetQuest: (questId) => this.questManager.resetQuest(questId),
      getRuntime: (questId) => this.questManager.getRuntime(questId),
      listCatalog: () => this.buildQuestEditorCatalog(),
      listDialogues: () => this.listDialogueSummaries(),
      getDialogueTree: (id: string) => this.getDialogueTree(id),
    }, initialEditorProject);

    // Tab 键综合战术终端
    this.terminalUI = new TerminalUI({
      player: this.player,
      quests: this.questManager,
      inventory: this.inventorySystem,
      progress: this.progressManager,
    });

    this.systemMenu = new SystemMenu(container, {
      onResume: () => this.resumeFromSystemMenu(),
      onSave: (slotId) => this.saveManual(slotId),
      onLoad: (slotId) => this.loadFromSlot(slotId),
      onDelete: (slotId) => this.deleteSlot(slotId),
      onReturnToTitle: () => this.returnToTitle(),
    });
    document.addEventListener('keydown', this.handleGlobalKeydown);

  }

  private readonly handleWindowResize = (): void => this.handleResize();

  private readonly handleGlobalKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;

    if (e.code === 'KeyI') {
      if (this.paused) return;
      e.preventDefault();
      this.inventoryUI.toggle();
      return;
    }

    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.terminalUI.opened) {
        this.terminalUI.close();
        return;
      }
      if (this.inventoryUI.isVisible()) {
        this.inventoryUI.hide();
        return;
      }
      if (this.systemMenu.isOpen) {
        this.systemMenu.handleEscape();
        return;
      }
      this.openSystemMenu();
    }
  };

  private openSystemMenu(): void {
    if (this.systemMenu.isOpen) return;
    this.inventoryUI.hide();
    this.terminalUI.close();
    this.paused = true;
    this.dialogueUI.setPaused(true);
    this.terminalUI.setEnabled(false);
    this.minigameOverlay.setPaused(true);
    setSolvayIntroPaused(true);
    this.systemMenu.open(this.buildSystemMenuModel());
  }

  private resumeFromSystemMenu(): void {
    this.systemMenu.close();
    this.paused = false;
    this.dialogueUI.setPaused(false);
    this.terminalUI.setEnabled(true);
    this.minigameOverlay.setPaused(false);
    setSolvayIntroPaused(false);
    this.flushPendingAutoSave();
  }

  private buildSystemMenuModel(): {
    slots: ReturnType<SaveGameStore['list']>;
    canSave: boolean;
    saveBlockedReason?: string;
  } {
    const safety = this.canSaveNow();
    return {
      slots: this.saveStore.list(),
      canSave: safety.allowed,
      ...(safety.reason ? { saveBlockedReason: safety.reason } : {}),
    };
  }

  private canSaveNow(): { allowed: boolean; reason?: string } {
    if (this.booting) return { allowed: false, reason: '游戏仍在初始化' };
    if (this.restoringSave) return { allowed: false, reason: '正在恢复存档' };
    if (this.sceneLoading || this.transitioning) {
      return { allowed: false, reason: '场景切换尚未完成' };
    }
    if (this.solvayIntroPlaying) return { allowed: false, reason: '演示影像正在播放' };
    if (this.minigameOverlay.isOpen) return { allowed: false, reason: '小游戏进行中' };
    if (this.dialogueSystem.isActive) return { allowed: false, reason: '对话进行中' };
    if (this.questEditor.isActive) return { allowed: false, reason: '任务编辑器已打开' };
    if (this.devTools.isActive) return { allowed: false, reason: '开发工具已打开' };
    return { allowed: true };
  }

  private saveManual(slotId: ManualSaveSlotId): void {
    const safety = this.canSaveNow();
    if (!safety.allowed) {
      this.notificationSystem.show(`无法保存：${safety.reason ?? '当前状态不安全'}`, 'danger');
      this.systemMenu.update(this.buildSystemMenuModel());
      return;
    }
    try {
      this.saveStore.write(slotId, this.captureSnapshot());
      this.notificationSystem.show('存档已写入。', 'info');
    } catch {
      this.notificationSystem.show('存档写入失败，请检查浏览器存储空间。', 'danger');
    }
    this.systemMenu.update(this.buildSystemMenuModel());
  }

  private deleteSlot(slotId: SaveSlotId): void {
    try {
      this.saveStore.remove(slotId);
      this.notificationSystem.show('存档已删除。', 'info');
    } catch {
      this.notificationSystem.show('存档删除失败。', 'danger');
    }
    this.systemMenu.update(this.buildSystemMenuModel());
  }

  private loadFromSlot(slotId: SaveSlotId): void {
    const envelope = this.saveStore.read(slotId);
    if (!envelope) {
      this.notificationSystem.show('该存档不存在或已损坏。', 'danger');
      this.systemMenu.update(this.buildSystemMenuModel());
      return;
    }
    if (this.options.onLoadRequested) {
      this.options.onLoadRequested(slotId);
      return;
    }
    void this.restoreSnapshot(envelope.snapshot)
      .then(() => {
        this.resumeFromSystemMenu();
        this.notificationSystem.show('存档已读取。', 'info');
      })
      .catch(() => {
        this.notificationSystem.show('存档无法恢复。', 'danger');
        this.systemMenu.update(this.buildSystemMenuModel());
      });
  }

  private returnToTitle(): void {
    if (this.options.onReturnToTitle) {
      this.options.onReturnToTitle();
      return;
    }
    window.location.reload();
  }

  public captureSnapshot(): GameSnapshot {
    const droppedItems: GameSnapshot['world']['droppedItems'] = [];
    for (const scene of Object.values(ALL_SCENES)) {
      for (const item of scene.items) {
        if (!item.entity.id.startsWith('dropped_') || item.collected) continue;
        droppedItems.push({
          id: item.entity.id,
          itemId: item.itemId,
          sceneId: scene.id,
          x: item.entity.x,
          y: item.entity.y,
        });
      }
    }

    return {
      playtimeMs: Math.max(0, this.playtimeMs),
      scene: {
        id: this.currentSceneId,
        playerX: this.player.x,
        playerY: this.player.y,
      },
      player: {
        hp: this.player.hp,
        exp: this.player.exp,
        level: this.player.level,
      },
      inventory: this.inventorySystem.serialize(),
      progress: this.progressManager.serialize(),
      quests: this.questManager.serialize(),
      world: {
        talkedEntityIds: [...this.talkedSet].sort(),
        collectedEntityIds: [...this.collectedSet].sort(),
        droppedItems,
      },
    };
  }

  public async restoreSnapshot(snapshot: GameSnapshot): Promise<void> {
    if (!ALL_SCENES[snapshot.scene.id]) {
      throw new SaveGameError('SAVE_SCENE_INVALID');
    }
    await this.stageStateReady;
    this.restoringSave = true;
    this.pendingAutoSave = false;
    try {
      this.progressManager.restore(snapshot.progress);
      this.stageManager.setCurrentStage(stageToNumber(this.progressManager.getStage()));
      this.inventorySystem.deserialize(snapshot.inventory);
      this.playtimeMs = snapshot.playtimeMs;
      this.player.level = snapshot.player.level;
      this.player.state.maxHp = 100 + Math.max(0, snapshot.player.level - 1) * 10;
      this.player.exp = snapshot.player.exp;
      this.player.setHp(snapshot.player.hp);
      this.player.isDead = snapshot.player.hp <= 0;
      this.player.facing = this.player.isDead ? 'death' : 'idle';

      await this.activateSavedScene(snapshot);
      this.restoreWorldEntities(snapshot.world);
      this.questManager.restore(snapshot.quests);
      this.refreshRuntimeViews();
    } finally {
      this.restoringSave = false;
    }
  }

  private async activateSavedScene(snapshot: GameSnapshot): Promise<void> {
    const scene = ALL_SCENES[snapshot.scene.id];
    if (!scene) throw new SaveGameError('SAVE_SCENE_INVALID');

    this.currentSceneId = scene.id;
    this.currentScene = scene;
    this.transitioning = false;
    this.transitionAlpha = 0;
    this.transitionTarget = null;
    this.sceneLoading = Boolean(scene.backgroundImage);
    this.loadDevColliders();
    if (scene.backgroundImage) await loadBackgroundImage(scene.backgroundImage);

    const { width, height } = this.getMapSize();
    this.camera.setMapSize(width, height);
    this.player.setWorldBounds(width, height);
    const x = Math.max(0.5, Math.min(snapshot.scene.playerX, width - 0.5));
    const y = Math.max(0.5, Math.min(snapshot.scene.playerY, height - 0.5));
    this.player.x = x;
    this.player.y = y;
    this.player.targetX = x;
    this.player.targetY = y;
    this.player.clearWaypoints();
    this.camera.follow(x, y);
    this.transitionCooldown = 1200;
    this.lastQuestLocationKey = '';
    this.sceneLoading = false;
    this.updatePathfinding();
    for (const npc of scene.npcs) preloadNpcImage(npc.entity.id);
  }

  private restoreWorldEntities(world: GameSnapshot['world']): void {
    this.talkedSet = new Set(world.talkedEntityIds);
    this.collectedSet = new Set(world.collectedEntityIds);

    for (const scene of Object.values(ALL_SCENES)) {
      scene.items = scene.items.filter((item) => !item.entity.id.startsWith('dropped_'));
    }
    this.refreshStageWorldState();

    for (const scene of Object.values(ALL_SCENES)) {
      for (const npc of scene.npcs) {
        npc.setHasTalked(this.talkedSet.has(npc.entity.id));
      }
      for (const item of scene.items) {
        item.collected = this.collectedSet.has(item.entity.id);
      }
    }

    for (const dropped of world.droppedItems) {
      const scene = ALL_SCENES[dropped.sceneId];
      const definition = ALL_ITEMS[dropped.itemId];
      if (!scene || !definition || !dropped.id.startsWith('dropped_')) continue;
      const item = new InteractiveItem(
        dropped.id,
        dropped.x,
        dropped.y,
        'item',
        definition.name,
        '',
        'glow',
        false,
        definition.id,
      );
      if (this.collectedSet.has(dropped.id)) item.collect();
      scene.items.push(item);
    }
    this.updatePathfinding();
  }

  private refreshRuntimeViews(): void {
    this.activeDialogueSource = null;
    this.dialogueSystem.end();
    this.inventoryUI.hide();
    this.inventoryUI.render();
    this.questUI.update(this.questManager);
    this.statusUI.update(this.player, this.currentScene.name);
    this.lastQuestLocationKey = '';
    this.devTools.refresh();
  }

  private requestAutoSave(): void {
    if (this.booting || this.restoringSave) return;
    this.pendingAutoSave = true;
  }

  private flushPendingAutoSave(): void {
    if (!this.pendingAutoSave || !this.canSaveNow().allowed) return;
    this.pendingAutoSave = false;
    try {
      this.saveStore.write('auto', this.captureSnapshot());
    } catch {
      this.notificationSystem.show('自动存档失败，请检查浏览器存储空间。', 'danger');
    }
  }

  /** 丢弃物品到地图上 */
  private dropItemOnMap(itemId: string): void {
    const scene = this.currentScene;
    if (!scene) return;
    const itemDef = ALL_ITEMS[itemId];
    const px = this.player.x;
    const py = this.player.y;
    // 在玩家附近随机偏移一点，避免重叠
    const ox = (Math.random() - 0.5) * 1.5;
    const oy = (Math.random() - 0.5) * 1.5;
    const droppedItem = new InteractiveItem(
      `dropped_${itemId}_${Date.now()}`,
      px + ox, py + oy,
      'item', // spriteKey (unused, pixel art from itemId)
      itemDef ? itemDef.name : itemId, // name
      '', // no dialogue trigger
      'glow',
      false, // not triggersDialogue
      itemId, // itemId for pixel art lookup
    );
    scene.items.push(droppedItem);
  }

  /** 将任务编辑器工程原子地同步到任务注册表和场景锚点。 */
  private applyQuestEditorProject(project: QuestEditorProject): string[] {
    const errors = project.quests.flatMap(validateQuestDefinition);
    const questIds = new Set<string>();
    for (const quest of project.quests) {
      if (questIds.has(quest.id)) errors.push(`任务 ID 重复：${quest.id}`);
      questIds.add(quest.id);
    }

    const placementIds = new Set<string>();
    for (const placement of project.placements) {
      if (!placement.id.trim() || !placement.targetId.trim()) errors.push('任务锚点 ID 和 targetId 不能为空');
      if (placementIds.has(placement.id)) errors.push(`任务锚点 ID 重复：${placement.id}`);
      if (!ALL_SCENES[placement.sceneId]) errors.push(`任务锚点引用未知场景：${placement.sceneId}`);
      if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) errors.push(`任务锚点坐标无效：${placement.id}`);
      if (placement.kind === 'item' && !ALL_ITEMS[placement.targetId]) {
        errors.push(`道具锚点引用未注册物品：${placement.targetId}`);
      }
      placementIds.add(placement.id);
    }
    if (errors.length > 0) return errors;

    for (const oldId of this.editorQuestIds) {
      if (!questIds.has(oldId)) this.questManager.unregisterQuest(oldId);
    }
    for (const quest of project.quests) {
      const current = this.questManager.getDefinition(quest.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(quest)) {
        this.questManager.registerQuest(quest, Boolean(current));
      }
    }
    this.editorQuestIds = questIds;

    // 先移除上一次生成的实体，再按最新工程重建。
    for (const scene of Object.values(ALL_SCENES)) {
      scene.npcs = scene.npcs.filter((npc) => !this.editorEntityIds.has(npc.entity.id));
      scene.items = scene.items.filter((item) => !this.editorEntityIds.has(item.entity.id));
    }
    this.editorEntityIds.clear();
    this.editorNpcTargets.clear();

    for (const placement of project.placements) this.addQuestEditorPlacement(placement);
    this.questManager.refreshAutoStarts();
    this.applyDialogueData(project.dialogueData);
    // base 唯一捕获时机：启动时从静态场景定义建立，此后不再重复捕获
    for (const scene of Object.values(ALL_SCENES)) {
      for (const npc of scene.npcs) this.stageManager.captureBasePlacement(npc.entity.id, { sceneId: scene.id, x: npc.entity.x, y: npc.entity.y, exists: true });
      for (const item of scene.items) this.stageManager.captureBasePlacement(item.entity.id, { sceneId: scene.id, x: item.entity.x, y: item.entity.y, exists: true });
    }
    this.refreshStageWorldState();
    this.devTools.refresh();
    return [];
  }

  /**
   * 按当前 Runtime Stage 重算所有场景中 NPC/道具的有效摆放：
   * 应用 StageManager 的 exists/position/scene 解析结果到静态场景定义。
   * 不重载游戏、不动存档。
   */
  private async bootStageState(): Promise<void> {
    try {
      const r = await fetch('/api/dev/stage-state/load');
      if (r.ok) {
        const data = await r.json() as { stages?: unknown };
        if (Array.isArray(data.stages)) this.stageManager.loadFromState(data as StageStateData);
        // 应用文件中的传送门（Develop Mode 编辑的出入口持久化）
        for (const scene of Object.values(ALL_SCENES)) {
          const saved = this.stageManager.getTransitions(scene.id);
          if (saved) scene.transitions = saved.map(t => ({ ...t }));
        }
      }
    } catch { /* 静态托管环境无开发 API */ }
    for (const scene of Object.values(ALL_SCENES)) {
      for (const npc of scene.npcs) this.stageManager.captureBasePlacement(npc.entity.id, { sceneId: scene.id, x: npc.entity.x, y: npc.entity.y, exists: true });
      for (const item of scene.items) this.stageManager.captureBasePlacement(item.entity.id, { sceneId: scene.id, x: item.entity.x, y: item.entity.y, exists: true });
    }
    this.refreshStageWorldState();
  }

  refreshStageWorldState(previewStage?: number): void {
    const stage = previewStage ?? stageToNumber(this.progressManager.getStage());
    // 记录原始定义位置（首次调用时建立，避免重复 resolve 时引用被覆盖的自己）
    for (const scene of Object.values(ALL_SCENES)) {
      for (const npc of scene.npcs) {
        if (!this.baseNpcPlacements.has(npc.entity.id)) {
          this.baseNpcPlacements.set(npc.entity.id, { sceneId: scene.id, x: npc.entity.x, y: npc.entity.y });
          this.originalNpcEntities.set(npc.entity.id, npc);
        }
      }
      for (const item of scene.items) {
        if (!this.baseItemPlacements.has(item.entity.id)) {
          this.baseItemPlacements.set(item.entity.id, { sceneId: scene.id, x: item.entity.x, y: item.entity.y });
          this.originalItemEntities.set(item.entity.id, item);
        }
      }
    }

    // 非破坏性全量重建：所有场景的 npcs/items 从 originalNpcEntities 完整快照重算，
    // 不存在 filter 删除导致的实体永久丢失，也不依赖增量 push 恢复。
    // 编辑器临时实体（无 base 记录）保留在当前场景原位。
    for (const scene of Object.values(ALL_SCENES)) {
      const transientNpcs = scene.npcs.filter((n) => !this.baseNpcPlacements.has(n.entity.id));
      const transientItems = scene.items.filter((i) => !this.baseItemPlacements.has(i.entity.id));
      const rebuiltNpcs: typeof scene.npcs = [...transientNpcs];
      const rebuiltItems: typeof scene.items = [...transientItems];
      for (const [id, original] of this.originalNpcEntities) {
        const base = this.baseNpcPlacements.get(id)!;
        const eff = this.stageManager.getEffectiveNpcState(id, stage);
        const targetScene = eff.sceneId ?? base.sceneId;
        if (eff.exists === false || targetScene !== scene.id) continue;
        original.entity.x = Number.isFinite(eff.x) ? eff.x! : base.x;
        original.entity.y = Number.isFinite(eff.y) ? eff.y! : base.y;
        original.spriteVariant = eff.spriteVariant ?? 'front';
      preloadNpcImage(original.entity.id, original.spriteVariant);
        rebuiltNpcs.push(original);
      }
      for (const [id, original] of this.originalItemEntities) {
        const base = this.baseItemPlacements.get(id)!;
        const eff = this.stageManager.getEffectiveItemState(id, stage);
        const targetScene = eff.sceneId ?? base.sceneId;
        if (eff.exists === false || targetScene !== scene.id) continue;
        original.entity.x = Number.isFinite(eff.x) ? eff.x! : base.x;
        original.entity.y = Number.isFinite(eff.y) ? eff.y! : base.y;
        rebuiltItems.push(original);
      }
      scene.npcs = rebuiltNpcs;
      scene.items = rebuiltItems;
    }
  }

  private async persistStageState(): Promise<void> {
    const snapshot = this.stageManager.snapshot();
    if (!snapshot) return;
    try {
      const r = await fetch('/api/dev/stage-state/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!r.ok) this.notificationSystem.show(`Stage 布局保存失败（HTTP ${r.status}）`, 'danger');
    } catch {
      this.notificationSystem.show('Stage 布局保存失败（网络错误）', 'danger');
    }
  }

  /** 同步 Develop Mode Stage 下拉选中值（不触发 change 事件） */
  private syncStageSelectValue(stage: number): void {
    const sel = document.querySelector('#dev-stage-select') as HTMLSelectElement | null;
    if (sel) sel.value = String(stage);
  }

  private addQuestEditorPlacement(placement: QuestPlacement): void {
    const scene = ALL_SCENES[placement.sceneId];
    if (!scene) return;
    const runtimeId = `quest_editor:${placement.id}`;
    this.editorEntityIds.add(runtimeId);

    if (placement.kind === 'npc') {
      const npc = new NPC(
        runtimeId,
        placement.x,
        placement.y,
        'npc_default',
        placement.label,
        placement.targetId,
      );
      scene.npcs.push(npc);
      this.editorNpcTargets.set(runtimeId, placement.id);
    } else {
      const item = new InteractiveItem(
        runtimeId,
        placement.x,
        placement.y,
        placement.kind === 'event' ? 'event_orb' : 'item_glow',
        placement.label,
        placement.targetId,
        'glow',
        placement.kind === 'event',
        placement.kind === 'item' ? placement.targetId : runtimeId,
      );
      if (this.collectedSet.has(runtimeId)) item.collect();
      scene.items.push(item);
    }
  }

  private getQuestEditorScene(sceneId: string): QuestEditorSceneSnapshot | null {
    const scene = ALL_SCENES[sceneId];
    if (!scene) return null;
    const size = this.getSceneMapSize(scene);
    const markers: QuestEditorMapMarker[] = [];
    for (const npc of scene.npcs) {
      if (this.editorEntityIds.has(npc.entity.id)) continue;
      markers.push({ id: npc.entity.id, kind: 'npc', label: npc.entity.name, x: npc.entity.x, y: npc.entity.y });
    }
    for (const item of scene.items) {
      if (this.editorEntityIds.has(item.entity.id)) continue;
      markers.push({
        id: item.entity.id,
        kind: item.triggersDialogue ? 'event' : 'item',
        label: item.entity.name,
        x: item.entity.x,
        y: item.entity.y,
      });
    }
    return {
      id: scene.id,
      name: scene.name,
      bgImage: scene.backgroundImage ?? '',
      worldW: size.width,
      worldH: size.height,
      markers,
    };
  }

  /**
   * 构建 Quest Editor 可选项清单（catalog）。
   * 汇总所有场景/NPC/物品/事件/任务的真实 ID + 中文名，供编辑器下拉选择。
   */
  private buildQuestEditorCatalog(): QuestEditorCatalog {
    // 场景
    const scenes = Object.values(ALL_SCENES).map((scene) => ({
      id: scene.id,
      label: scene.name,
    }));

    // NPC：遍历所有场景的 npcs，按 entity.id 去重
    const npcMap = new Map<string, string>();
    for (const scene of Object.values(ALL_SCENES)) {
      for (const npc of scene.npcs) {
        if (!npcMap.has(npc.entity.id)) npcMap.set(npc.entity.id, npc.entity.name);
      }
    }
    const npcs = [...npcMap.entries()].map(([id, label]) => ({ id, label }));

    // 物品：ALL_ITEMS 注册表
    const items = Object.values(ALL_ITEMS).map((item) => ({
      id: item.id,
      label: item.name,
    }));

    // 事件：场景里 triggersDialogue=true 的实体（dialogueTrigger 即事件 ID）
    const eventMap = new Map<string, string>();
    for (const scene of Object.values(ALL_SCENES)) {
      for (const item of scene.items) {
        if (item.triggersDialogue && !eventMap.has(item.dialogueTrigger)) {
          eventMap.set(item.dialogueTrigger, item.entity.name);
        }
      }
    }
    const events = [...eventMap.entries()].map(([id, label]) => ({ id, label }));

    // 任务：以编辑器 project 为准（ALL_QUESTS 已与之同源）
    const questMap = new Map<string, string>();
    const editorQuests = this.questEditor?.['project']?.quests ?? [];
    for (const q of editorQuests) questMap.set(q.id, q.title);
    for (const q of ALL_QUESTS) {
      if (!questMap.has(q.id)) questMap.set(q.id, q.title);
    }
    const quests = [...questMap.entries()].map(([id, label]) => ({ id, label }));

    // Flags：从引擎硬编码的 flag 前缀 + 任务定义中的自定义 flags 汇总
    const flagSet = new Map<string, string>();
    const flagLabel = (raw: string): string => {
      if (raw.startsWith('visited:')) return `已进入场景：${raw.slice(8)}`;
      if (raw.startsWith('talked:')) return `已对话 NPC：${raw.slice(7)}`;
      if (raw.startsWith('scene_unlocked:')) return `已解锁场景：${raw.slice(15)}`;
      if (raw.startsWith('dialogue_unlocked:')) return `已解锁对话：${raw.slice(18)}`;
      if (raw.startsWith('stage_')) return `阶段标记：${raw.slice(6)}`;
      if (raw.startsWith('chapter_')) return `章节标记：${raw.slice(8)}`;
      if (raw.startsWith('worldline:')) return `世界线：${raw.slice(10)}`;
      return raw;
    };
    for (const scene of Object.values(ALL_SCENES)) {
      const vf = `visited:${scene.id}`;
      flagSet.set(vf, flagLabel(vf));
      const suf = `scene_unlocked:${scene.id}`;
      flagSet.set(suf, flagLabel(suf));
      for (const npc of scene.npcs) {
        const tf = `talked:${npc.entity.id}`;
        flagSet.set(tf, flagLabel(tf));
      }
    }
    for (const q of editorQuests) {
      for (const f of q.onCompleteFlags ?? []) flagSet.set(f, flagLabel(f));
      for (const f of q.rewards?.flags ?? []) flagSet.set(f, flagLabel(f));
    }
    const flags = [...flagSet.entries()].map(([id, label]) => ({ id, label }));

    // 阶段
    const stages = STAGE_ORDER.map((s, i) => ({ id: s, label: `Stage ${i + 1} · ${s}` }));

    return { scenes, npcs, items, events, quests, flags, stages };
  }

  /** 构建统一的条件求值上下文（Quest 与 Dialogue 共用同一套语义）。 */
  private conditionContext(): ConditionContext {
    const pm = this.progressManager;
    return {
      isQuestCompleted: (id) => pm.isQuestCompleted(id),
      hasItem: (id) => this.inventorySystem.getItemQty(id) > 0,
      hasFlag: (flag) => pm.hasFlag(flag),
      isStageAtLeast: (stage) => pm.isStageAtLeast(stage, STAGE_ORDER),
    };
  }

  /** 创建对话条件检查器：委托共享评估器，与 Quest 条件语义完全一致。 */
  private makeDialogueConditionChecker(): ConditionChecker {
    const ctx = this.conditionContext();
    return (entry: StartConditionEntry): boolean => evaluateStartConditionEntry(entry, ctx);
  }

  /** 包装：把基于 tree 的条件检查器适配成 registry 需要的签名 */
  private makeTreeConditionChecker(): (tree: DialogueTree) => boolean {
    const checker = this.makeDialogueConditionChecker();
    return (tree: DialogueTree): boolean => {
      if (!tree.condition || tree.condition.length === 0) return true;
      return tree.condition.every((entry) => checker(entry));
    };
  }

  /** 应用编辑器编辑的完整对话树数据：通过 DialogueRegistry 安全增改。 */
  private applyDialogueData(data: DialogueData): void {
    for (const tree of Object.values(data)) {
      this.dialogueRegistry.register(tree);
    }
  }

  /** 返回指定对话树的完整数据（深拷贝）。 */
  private getDialogueTree(id: string): DialogueTree | null {
    const tree = this.dialogueRegistry.get(id);
    if (!tree) return null;
    return structuredClone(tree);
  }

  private listDialogueSummaries(): DialogueSummary[] {
    return this.dialogueRegistry.getAll().map((tree) => {
      const startNode = tree.nodes[tree.startNode];
      const firstLine = startNode?.lines?.[0];
      return {
        id: tree.id,
        scene: tree.scene,
        trigger: tree.trigger,
        eventType: tree.eventType,
        cgUrl: tree.cgUrl,
        stage: tree.stage,
        preview: firstLine ? firstLine.text.slice(0, 60) : '(空)',
        nodeCount: Object.keys(tree.nodes).length,
      };
    });
  }

  /** 更新寻路系统碰撞数据 */
  private updatePathfinding(): void {
    const { width: mw, height: mh } = this.getMapSize();
    this.pathfinding.setColliders(this.currentScene.colliders ?? [], mw, mh);
    this.player.setColliders(this.currentScene.colliders ?? []);
  }

  private loadDevColliders(): void {
    // 唯一来源：服务器 dev-overrides 的 colliders。
    // NPC/道具/传送门坐标一律由 stageState 管理，markers 不再写实体坐标。
    fetch('/api/dev/load')
      .then(r => r.json())
      .then(data => {
        const sceneData = data[this.currentSceneId];
        if (sceneData?.colliders?.length) {
          this.currentScene.colliders = sceneData.colliders;
          this.updatePathfinding();
        }
      })
      .catch(() => { /* API not available (production) - ignore */ });

    // 清理历史遗留的浏览器编辑缓存
    try { localStorage.removeItem(`dev_colliders_${this.currentSceneId}`); } catch { /* ignore */ }
  }

  private getMapSize(): { width: number; height: number } {
    return this.getSceneMapSize(this.currentScene);
  }

  private getSceneMapSize(scene: SceneDef): { width: number; height: number } {
    // 使用背景图尺寸计算世界大小，按场景 bgScale 缩小（默认 2.5）
    const bgImg = getBackgroundImage(scene.backgroundImage ?? '');
    const scale = scene.bgScale ?? 2.5;
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      const { tileSize } = this.renderer.config;
      return {
        width: Math.ceil((bgImg.naturalWidth / scale) / tileSize),
        height: Math.ceil((bgImg.naturalHeight / scale) / tileSize),
      };
    }
    return {
      width: scene.worldW ?? Math.ceil(scene.mapData[0].length / scale),
      height: scene.worldH ?? Math.ceil(scene.mapData.length / scale),
    };
  }

  private handleResize(): void {
    const rect = this.gameContainer.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
    // 同步逻辑尺寸到 InputManager
    const logicalW = DEFAULT_RENDER_CONFIG.viewWidth * DEFAULT_RENDER_CONFIG.tileSize;
    const logicalH = DEFAULT_RENDER_CONFIG.viewHeight * DEFAULT_RENDER_CONFIG.tileSize;
    this.input.setLogicalSize(logicalW, logicalH);
  }

  /** 执行 typed Action 数组，统一处理 Quest reward / Dialogue actions / Scene events */
  public executeActions(actions: NarrativeAction[]): void {
    for (const action of actions) {
      this.executeAction(action);
    }
  }

  private executeAction(action: NarrativeAction): void {
    switch (action.type) {
      case 'flag.set':
        this.progressManager.setFlag(action.flag);
        break;
      case 'flag.unset':
        this.progressManager.removeFlag(action.flag);
        break;
      case 'quest.activate':
        this.questManager.activateQuest(action.questId);
        break;
      case 'quest.complete':
        this.questManager.forceCompleteQuest(action.questId);
        break;
      case 'inventory.add':
        this.inventorySystem.addItem(action.itemId, action.count ?? 1);
        this.notificationSystem.show(`获得：${ALL_ITEMS[action.itemId]?.name ?? action.itemId} ×${action.count ?? 1}`, 'pickup');
        break;
      case 'inventory.remove':
        this.inventorySystem.removeItem(action.itemId, action.count ?? 1);
        break;
      case 'inventory.submit': {
        const npcId = (action as { npcId?: string }).npcId;
        if (npcId) {
          this.inventorySystem.removeItem(action.itemId, action.count ?? 1);
          this.reportQuestEvent({
            type: 'item_submitted',
            npcId,
            itemId: action.itemId,
            count: action.count ?? 1,
          });
        }
        break;
      }
      case 'scene.unlock':
        this.progressManager.setFlag(`scene_unlocked:${action.sceneId}`);
        break;
      case 'dialogue.unlock':
        this.progressManager.setFlag(`dialogue_unlocked:${action.dialogueId}`);
        break;
      case 'stage.set':
        this.progressManager.setStage(action.stage);
        this.refreshStageWorldState();
        break;
      case 'worldline.set':
        this.progressManager.setFlag(`worldline:${action.value}`);
        break;
      case 'exp.add':
        if (Number.isFinite(action.amount) && action.amount > 0) {
          this.progressManager.addExp(action.amount);
          this.player.addExp(action.amount);
        }
        break;
      case 'event.emit':
        this.reportQuestEvent({ type: 'event_triggered', eventId: action.eventId });
        break;
      case 'launch_vr_experience': {
        const prepared = prepareVrExperience({
          experienceId: action.experienceId,
          projectTwo: action.projectTwo,
        });
        if (prepared.status === 'invalid') {
          this.notificationSystem.show(
            '入口参数没有通过校验，我没有接入这份简报。请重新选择。',
            'danger',
          );
          break;
        }
        this.minigameOverlay.openWebExperience(
          {
            id: 'quillforge-webui',
            title: '项目二 · 世界编织',
            src: prepared.url,
          },
          () => {
            this.notificationSystem.show(
              '已退出项目二，返回 VR 实验室。',
              'info',
            );
          },
        );
        this.notificationSystem.show(
          '项目二链路正在舱内载入；世界书仍需由你审阅确认。',
          'info',
        );
        break;
      }
      case 'minigame.open': {
        const completion = MINIGAME_COMPLETIONS[action.minigameId];
        if (!completion) {
          console.warn('[Engine] unknown minigame:', action.minigameId);
          break;
        }
        this.minigameOverlay.open(action.minigameId, () => {
          this.progressManager.setFlag(completion.flag);
          const nextTree = this.dialogueRegistry.get(completion.nextTreeId);
          if (nextTree) {
            this.dialogueSystem.start(nextTree);
          } else {
            console.warn('[Engine] next dialogue tree not found:', completion.nextTreeId);
          }
        });
        break;
      }
    }
  }

  private handleEffect(effect: string): void {
    // 所有对话 effect 同时也是可由 trigger_event 目标监听的统一事件。
    this.reportQuestEvent({ type: 'event_triggered', eventId: effect });

    // 字符串协议仅作为遗留适配层：转换为类型化 action 后统一走 executeActions。
    // 过滤 event:emit，避免与上面的原始事件上报重复。
    const actions = legacyEffectToActions(effect).filter((a) => a.type !== 'event.emit');
    this.executeActions(actions);
  }

  /** 对话系统结束回调：在真正读完对话后再推进 talk_to_npc。 */
  private handleDialogueCompleted(tree: DialogueTree): void {
    const source = this.activeDialogueSource;
    this.activeDialogueSource = null;
    if (!source) return;
    if (source.kind === 'npc') {
      this.talkedSet.add(source.entityId);
      this.progressManager.setFlag(`talked:${source.questTargetId}`);
      const npc = this.currentScene.npcs.find((candidate) => candidate.entity.id === source.entityId);
      npc?.setHasTalked(true);
      this.reportQuestEvent({
        type: 'dialogue_completed',
        npcId: source.questTargetId,
        dialogueId: tree.id,
      });
    }
  }

  /** 游戏其他模块统一从这里向任务引擎上报事件。 */
  public reportQuestEvent(event: QuestEvent): void {
    this.questManager.reportEvent(event);
  }

  /** 与 NPC 交互时自动提交当前步骤所需且背包中已有的物品。 */
  private submitQuestItemsToNpc(npcId: string): void {
    for (const request of this.questManager.getPendingSubmissions(npcId)) {
      const available = this.inventorySystem.getItemQty(request.itemId);
      const amount = Math.min(available, request.remaining);
      if (amount <= 0) continue;
      const removed = this.inventorySystem.removeItem(request.itemId, amount);
      if (removed <= 0) continue;
      this.reportQuestEvent({
        type: 'item_submitted',
        itemId: request.itemId,
        npcId,
        count: removed,
      });
      this.notificationSystem.show(`已提交：${ALL_ITEMS[request.itemId]?.name ?? request.itemId} ×${removed}`, 'quest');
    }
  }

  /** 玩家跨入新 tile 时发出一次位置事件，而不是由任务系统轮询。 */
  private reportPlayerLocationIfChanged(): void {
    const x = Math.floor(this.player.x * 2) / 2;
    const y = Math.floor(this.player.y * 2) / 2;
    const key = `${this.currentSceneId}:${x}:${y}`;
    if (key === this.lastQuestLocationKey) return;
    this.lastQuestLocationKey = key;
    this.reportQuestEvent({ type: 'location_reached', sceneId: this.currentSceneId, x, y });
  }

  /** 启动游戏循环 */
  async start(): Promise<void> {
    if (this.running) return;
    let restored = false;
    try {
      await this.stageStateReady;
      if (this.options.initialSave) {
        await this.restoreSnapshot(this.options.initialSave.snapshot);
        restored = true;
      }
    } catch (error) {
      console.error('[Engine] 存档恢复失败：', error);
      this.notificationSystem.show('存档无法恢复，已进入新游戏。', 'danger');
    }
    this.booting = false;
    if (!restored) {
      this.reportQuestEvent({ type: 'scene_entered', sceneId: this.currentSceneId });
      this.progressManager.setFlag(`visited:${this.currentSceneId}`);
      this.reportPlayerLocationIfChanged();
    }
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** 主循环 */
  private loop(time: number): void {
    if (!this.running) return;

    const dt = Math.min(time - this.lastTime, 50); // cap delta
    this.lastTime = time;

    try {
      this.update(dt);

      // 场景异步加载期间只渲染黑屏过渡，不渲染场景内容
      if (this.sceneLoading) {
        const ctx = this.renderer.ctx;
        ctx.clearRect(0, 0, this.renderer.canvas.width, this.renderer.canvas.height);
        this.renderer.clear('#0d1117');
      } else {
        this.render();
      }
    } catch (err) {
      console.error('[Engine] 渲染循环异常（已恢复）:', err);
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  /** 逻辑更新 */
  private update(dt: number): void {
    if (this.paused) return;
    this.playtimeMs += dt;
    this.flushPendingAutoSave();
    // 场景正在异步加载（等背景图），暂停一切更新
    if (this.sceneLoading) return;
    // 视频转场期间冻结游戏更新（视频层自身接管画面与输入）
    if (this.solvayIntroPlaying) return;

    // 场景切换动画
    if (this.transitioning) {
      this.transitionAlpha += dt * 0.003;
      // 淡入到全黑时触发场景加载（只触发一次）
      if (this.transitionAlpha >= 1 && this.transitionTarget) {
        const targetScene = this.transitionTarget.scene;
        this.transitionTarget = null;
        this.sceneLoading = true;
        // 异步加载完成后才解除暂停
        this.switchScene(targetScene).then(() => {
          this.sceneLoading = false;
        });
      }
      // 淡出逻辑：只在场景加载完成且淡入已到位时才开始淡出
      if (this.transitionAlpha >= 2 && !this.sceneLoading) {
        this.transitioning = false;
        this.transitionAlpha = 0;
      }
      return;
    }

    // 对话中：只更新对话
    if (this.dialogueSystem.isActive) {
      this.dialogueSystem.update(dt);
      return;
    }

    // DevTools 放置模式优先：拦截点击，不走游戏逻辑
    const click = this.input.consumeClick();
    if (click) {
      const { tileSize } = this.renderer.config;
      const tileX = Math.floor(click.x / tileSize) + this.camera.x;
      const tileY = Math.floor(click.y / tileSize) + this.camera.y;

      if (this.devTools.isPlacing()) {
        this.devTools.handleGameCanvasClick(tileX, tileY);
        return;
      }

      // 检查是否点击了 NPC/Item
      let clickedEntity = false;
      for (const npc of this.currentScene.npcs) {
        const dist = Math.sqrt((tileX - npc.entity.x) ** 2 + (tileY - npc.entity.y) ** 2);
        if (dist < 0.9 && npc.isInRange(this.player)) {
          const questNpcId = this.editorNpcTargets.get(npc.entity.id) ?? npc.entity.id;
          this.submitQuestItemsToNpc(questNpcId);
          // ★ 检查该 NPC 是否有对话数据
          const tree = this.dialogueRegistry.resolve(this.currentSceneId, npc.dialogueTrigger, { currentStage: this.progressManager.getStage(), checkCondition: this.makeTreeConditionChecker() });
          if (tree) {
            // 有对话 → 触发对话
            this.triggerDialogue(npc.dialogueTrigger, {
              kind: 'npc',
              entityId: npc.entity.id,
              questTargetId: questNpcId,
            });
          } else if (this.editorNpcTargets.has(npc.entity.id)) {
            // 编辑器占位 NPC 没有对话树时，仍允许测试 talk_to_npc 链路。
            npc.setHasTalked(true);
            this.talkedSet.add(npc.entity.id);
            this.reportQuestEvent({ type: 'dialogue_completed', npcId: questNpcId });
            this.notificationSystem.show(`已触发 NPC 占位交互：${npc.entity.name}`, 'info');
          }
          clickedEntity = true;
          break;
        }
      }
      if (!clickedEntity) {
        for (const item of this.currentScene.items) {
          if (item.collected) continue;
          const dist = Math.sqrt((tileX - item.entity.x) ** 2 + (tileY - item.entity.y) ** 2);
          if (dist < 0.9 && item.isInRange(this.player)) {
            if (item.triggersDialogue) {
              this.reportQuestEvent({ type: 'event_triggered', eventId: item.dialogueTrigger || item.entity.id });
              this.triggerDialogue(item.dialogueTrigger, {
                kind: 'event',
                entityId: item.entity.id,
                questTargetId: item.dialogueTrigger || item.entity.id,
              });
            } else {
              // 加入背包（优先用itemId匹配物品数据库，否则用entity.id）
              const invId = item.itemId || item.entity.id;
              if (this.inventorySystem.addItem(invId)) {
                this.player.addExp(5);
                item.collect();
                this.collectedSet.add(item.entity.id);
                this.reportQuestEvent({ type: 'item_collected', itemId: invId, count: 1, sourceId: item.entity.id });
                this.notificationSystem.show(`获得道具：${ALL_ITEMS[invId]?.name || invId}`, 'pickup', 2500, '◆');
              } else {
                this.notificationSystem.show('背包已满或物品未注册，无法拾取', 'danger');
              }
            }
            clickedEntity = true;
            break;
          }
        }
      }

      // 设置移动目标（A* 寻路绕障）
      if (!clickedEntity) {
        const path = this.pathfinding.findPath(this.player.entity.x, this.player.entity.y, tileX, tileY);
        if (path.length > 1) {
          this.player.setWaypoints(path);
        } else {
          // 无路径：检查目标点是否可达（不在障碍内），直接走
          if (!this.pathfinding.isLineBlocked(this.player.entity.x, this.player.entity.y, tileX, tileY)) {
            this.player.setTarget(tileX, tileY);
          }
          // 目标被障碍完全包围则不移动，只显示涟漪
        }
        // 点击反馈涟漪
        this.clickRipple = { x: tileX, y: tileY, t: 0 };
      }
    }

    // 更新玩家
    this.player.update(dt);
    this.reportPlayerLocationIfChanged();

    // 摄像机跟随
    this.camera.follow(
      this.player.entity.x + this.player.entity.width / 2,
      this.player.entity.y + this.player.entity.height / 2,
    );

    // 更新 NPC
    for (const npc of this.currentScene.npcs) {
      npc.update(dt);
    }

    // 更新道具
    for (const item of this.currentScene.items) {
      item.update(dt);
    }

    // 检查交互范围（只有有对话数据的 NPC 才显示交互提示）
    this.interactTarget = null;
    for (const npc of this.currentScene.npcs) {
      // ★ 没有对话数据的 NPC 不显示交互提示
      const tree = this.dialogueRegistry.resolve(this.currentSceneId, npc.dialogueTrigger, { currentStage: this.progressManager.getStage(), checkCondition: this.makeTreeConditionChecker() });
      if (!tree) continue;
      if (npc.isInRange(this.player)) {
        this.interactTarget = npc;
        break;
      }
    }
    if (!this.interactTarget) {
      for (const item of this.currentScene.items) {
        if (!item.collected && item.isInRange(this.player)) {
          this.interactTarget = item;
          break;
        }
      }
    }

    // 鼠标悬停检测
    // input.mouseX/mouseY 已经是逻辑坐标（InputManager 内部已做 cssX/renderScale 转换）
    // 物体逻辑坐标 = (entity.x - cam.x) * tileSize + tileSize/2（与 render() 中 ix/iy 公式一致）
    this.hoveredEntity = null;
    if (this.input && this.currentScene) {
      const { tileSize } = this.renderer.config;
      const mx = this.input.mouseX;
      const my = this.input.mouseY;
      const hoverR = tileSize; // 1 tile 检测半径
      // 检查 NPC
      for (const npc of this.currentScene.npcs) {
        const nx = (npc.entity.x - this.camera.x) * tileSize + tileSize / 2;
        const ny = (npc.entity.y - this.camera.y) * tileSize + tileSize / 2;
        if (Math.abs(mx - nx) < hoverR && Math.abs(my - ny) < hoverR) {
          this.hoveredEntity = npc;
          break;
        }
      }
      // 检查 InteractiveItem
      if (!this.hoveredEntity) {
        for (const item of this.currentScene.items) {
          if (item.collected) continue;
          const nx = (item.entity.x - this.camera.x) * tileSize + tileSize / 2;
          const ny = (item.entity.y - this.camera.y) * tileSize + tileSize / 2;
          if (Math.abs(mx - nx) < hoverR && Math.abs(my - ny) < hoverR) {
            this.hoveredEntity = item;
            break;
          }
        }
      }
    }

    // 检查场景过渡（cooldown 在循环外递减一次）
    if (this.transitionCooldown > 0) this.transitionCooldown -= dt;
    if (this.transitionCooldown <= 0) {
      const px = Math.floor(this.player.entity.x + 0.5);
      const py = Math.floor(this.player.entity.y + 0.5);
      for (const t of this.currentScene.transitions) {
        if (Math.abs(px - t.x) <= 0.5 && Math.abs(py - t.y) <= 0.5) {
          this.startTransition(t.targetScene);
          break;
        }
      }
    }

    // 点击反馈涟漪
    if (this.clickRipple) {
      this.clickRipple.t += dt;
      if (this.clickRipple.t >= 600) this.clickRipple = null;
    }

    // 更新任务通知
    this.notificationSystem.update(dt);
    // 更新背包拾取提示
  }

  /** 开始场景过渡 */
  /** VR 对话进入索尔维：全屏视频转场（首次），之后走常规黑屏过渡 */
  private async enterSolvayCinematic(): Promise<void> {
    this.dialogueSystem.end();
    if (this.progressManager.hasFlag('solvay_intro_seen')) {
      this.startTransition('solvay');
      return;
    }
    this.progressManager.setFlag('solvay_intro_seen');
    this.solvayIntroPlaying = true;
    // 视频层全屏遮盖期间后台切换场景，淡出时正好露出已加载好的索尔维
    void this.switchScene('solvay');
    try {
      await playSolvayIntroVideo(this.gameContainer, '/videos/solvay-enter.mp4');
    } finally {
      this.solvayIntroPlaying = false;
    }
  }

  private startTransition(sceneId: string): void {
    this.transitioning = true;
    this.transitionAlpha = 0;
    this.sceneLoading = false;
    this.transitionTarget = { scene: sceneId };
  }

  /** 执行场景切换 — 先确保背景图加载完成，再放置玩家 */
  private async switchScene(sceneId: string): Promise<void> {
    const newScene = ALL_SCENES[sceneId];
    if (!newScene) return;

    const fromSceneId = this.currentSceneId;
    this.currentSceneId = sceneId;
    this.currentScene = newScene;
    this.loadDevColliders();

    // ★ 关键：先等背景图加载完成，才能拿到正确的世界尺寸
    if (newScene.backgroundImage) {
      await loadBackgroundImage(newScene.backgroundImage);
    }

    // 现在背景图已就绪，getMapSize() 能返回准确的世界尺寸
    const { width: mapW, height: mapH } = this.getMapSize();
    this.camera.setMapSize(mapW, mapH);
    this.player.setWorldBounds(mapW, mapH);
    this.updatePathfinding();

    // 在目标场景中找到指向来源场景的传送点（返回门）
    const returnTransition = newScene.transitions.find(t => t.targetScene === fromSceneId);

    let spawnX: number;
    let spawnY: number;

    if (returnTransition) {
      spawnX = returnTransition.x;
      if (returnTransition.y < mapH / 2) {
        spawnY = returnTransition.y + 1.5;
      } else {
        spawnY = returnTransition.y - 1.5;
      }
    } else {
      spawnX = newScene.playerStart.x;
      spawnY = newScene.playerStart.y;
    }

    // 钳制到世界范围内
    spawnX = Math.max(0.5, Math.min(spawnX, mapW - 0.5));
    spawnY = Math.max(0.5, Math.min(spawnY, mapH - 0.5));

    this.player.entity.x = spawnX;
    this.player.entity.y = spawnY;
    this.player.targetX = spawnX;
    this.player.targetY = spawnY;
    this.player.moving = false;
    this.player.clearWaypoints();
    this.transitionCooldown = 2000;

    this.camera.follow(spawnX, spawnY);

    for (const npc of newScene.npcs) {
      preloadNpcImage(npc.entity.id);
    }

    this.lastQuestLocationKey = '';
    this.reportQuestEvent({ type: 'scene_entered', sceneId });
    this.progressManager.setFlag(`visited:${sceneId}`);
    this.reportPlayerLocationIfChanged();
    this.devTools.refresh();
    this.requestAutoSave();
  }

  /** 触发对话 */
  private triggerDialogue(
    trigger: string,
    source: { kind: 'npc' | 'event'; entityId: string; questTargetId: string },
  ): boolean {
    const tree = this.dialogueRegistry.resolve(this.currentSceneId, trigger, { currentStage: this.progressManager.getStage(), checkCondition: this.makeTreeConditionChecker() });
    if (tree) {
      this.activeDialogueSource = source;
      this.dialogueSystem.start(tree);
      return true;
    }
    return false;
  }

  /** 渲染 */
  private render(): void {
    const cam = this.camera;
    const { tileSize } = this.renderer.config;

    // 清屏（整画布）
    const ctx = this.renderer.ctx;
    ctx.clearRect(0, 0, this.renderer.canvas.width, this.renderer.canvas.height);
    this.renderer.clear('#0d1117');

    // 渲染背景贴图（唯一的地板渲染方式）
    const bgPath = this.currentScene.backgroundImage;
    const bgImg = bgPath ? getBackgroundImage(bgPath) : undefined;
    const worldSize = this.getMapSize();
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      this.renderer.renderBackgroundImage(
        bgImg,
        worldSize.width,
        worldSize.height,
        cam.x, cam.y,
      );
    }

    // 渲染 NPC 和玩家（Y-sort 遮挡）
    const renderables: { x: number; y: number; draw: () => void }[] = [];

    for (const npc of this.currentScene.npcs) {
      const npcImg = getNpcImage(npc.entity.id, npc.spriteVariant);
      if (npcImg && (npcImg.complete ? npcImg.naturalWidth > 0 : true)) {
        const aspect = npcImg.naturalWidth / npcImg.naturalHeight;
        const npcDrawH = npc.entity.id === 'lin_xiao' ? 28 : npc.entity.id.startsWith('solvay_') ? 31 : 33;
        const npcDrawW = Math.round(npcDrawH * aspect);
        renderables.push({
          x: npc.entity.x,
          y: npc.entity.y,
          draw: () => {
            const sx = (npc.entity.x - cam.x) * tileSize + tileSize / 2;
            const sy = (npc.entity.y - cam.y) * tileSize + tileSize;
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.ellipse(sx, sy - 2, 7, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            this.renderer.renderImage(npcImg, npc.entity.x, npc.entity.y, cam.x, cam.y, npcDrawW, npcDrawH);
          },
        });
      } else if (this.editorEntityIds.has(npc.entity.id)) {
        // 编辑器占位 NPC 尚未绑定美术资源时使用纯框架标记。
        renderables.push({
          x: npc.entity.x,
          y: npc.entity.y,
          draw: () => {
            const px = (npc.entity.x - cam.x) * tileSize + tileSize / 2;
            const py = (npc.entity.y - cam.y) * tileSize + tileSize / 2;
            ctx.save();
            ctx.fillStyle = '#00f3ff';
            ctx.shadowColor = '#00f3ff';
            ctx.shadowBlur = 7;
            ctx.fillRect(px - 3, py - 12, 6, 9);
            ctx.fillRect(px - 2, py - 16, 4, 4);
            ctx.restore();
          },
        });
      }
    }

    // 玩家贴图：移动中用 walk 帧，停止用站立贴图
    let playerImg: HTMLImageElement | null = null;
    let playerW = 0;
    let playerH = 0;
    if (this.player.moving && this.player.facing !== 'death' && this.player.facing !== 'idle') {
      const wk = getWalkFrame(this.player.facing, this.player.walkFrame);
      if (wk) {
        const wf = playerSprites.getWalk(wk as WalkFrameKey);
        if (wf && wf.image.complete && wf.image.naturalWidth > 0) {
          playerImg = wf.image;
          playerW = wf.width;
          playerH = wf.height;
        }
      }
    }
    if (!playerImg) {
      const spriteInfo = playerSprites.get(this.player.facing);
      if (spriteInfo && spriteInfo.image.complete && spriteInfo.image.naturalWidth > 0) {
        playerImg = spriteInfo.image;
        playerW = spriteInfo.width;
        playerH = spriteInfo.height;
      }
    }
    if (playerImg) {
      const aspect = playerW / playerH;
      const drawH = PLAYER_SPRITE_DRAW_HEIGHT;
      const drawW = Math.round(drawH * aspect);
      renderables.push({
        x: this.player.entity.x,
        y: this.player.entity.y,
        draw: () => {
          const sx = (this.player.entity.x - cam.x) * tileSize + tileSize / 2;
          const sy = (this.player.entity.y - cam.y) * tileSize + tileSize;
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.beginPath();
          ctx.ellipse(sx, sy - 2, 7, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          this.renderer.renderImage(playerImg!, this.player.entity.x, this.player.entity.y, cam.x, cam.y, drawW, drawH);
        },
      });
    }

    // 按 Y 坐标排序，Y 大的（屏幕下方）后画 = 覆盖在上
    renderables.sort((a, b) => a.y - b.y);
    renderables.forEach(r => r.draw());

    // 渲染可交互道具（像素图标）
    const itemTime = performance.now() * 0.004;
    const itemCtx = this.renderer.ctx;
    for (const item of this.currentScene.items) {
      if (item.collected) continue;
      const ix = (item.entity.x - cam.x) * tileSize + tileSize / 2;
      const iy = (item.entity.y - cam.y) * tileSize + tileSize / 2;
      const itemDef = item.itemId ? ALL_ITEMS[item.itemId] : null;
      const isHovered = this.hoveredEntity === item;
      itemCtx.save();

      if (item.triggersDialogue) {
          // ── 事件交互特效：全息呼吸球体 + 轨道环 ──
          // 参考 breatheGlow: scale(1→1.3) + box-shadow强度变化
          const pulse = 0.5 + 0.5 * Math.sin(itemTime * 1.047); // 6s周期 2π/6≈1.047
          const scale = 1 + 0.3 * pulse; // 呼吸缩放 1→1.3
          const cy = iy;

          // 外层光晕 (6s呼吸, 缩小1/3)
          const haloR = 12 * scale;
          const haloGrad = itemCtx.createRadialGradient(ix, cy, 0, ix, cy, haloR);
          haloGrad.addColorStop(0, `rgba(0, 243, 255, ${0.15 + 0.15 * pulse})`);
          haloGrad.addColorStop(0.5, `rgba(0, 243, 255, ${0.05 + 0.05 * pulse})`);
          haloGrad.addColorStop(1, 'rgba(0, 243, 255, 0)');
          itemCtx.globalAlpha = 1;
          itemCtx.fillStyle = haloGrad;
          itemCtx.shadowBlur = 0;
          itemCtx.beginPath();
          itemCtx.arc(ix, cy, haloR, 0, Math.PI * 2);
          itemCtx.fill();

          // 核心白点 (6s呼吸缩放, 缩小1/3)
          const coreR = Math.max(1, (2 + 1 * pulse) * scale);
          itemCtx.globalAlpha = isHovered ? 1 : 0.9;
          itemCtx.fillStyle = '#ffffff';
          itemCtx.shadowColor = '#00f3ff';
          itemCtx.shadowBlur = isHovered ? (16 + 16 * pulse) * scale : (8 + 8 * pulse) * scale;
          itemCtx.beginPath();
          itemCtx.arc(ix, cy, coreR, 0, Math.PI * 2);
          itemCtx.fill();



        } else if (itemDef) {
          // ── 可拾取道具：像素图标 + 悬浮 + 地面投影 + 环境光晕 ──
          // floatLoot: 幅度1/2(±4px), 周期10s
          const bob = Math.sin(itemTime * 0.628) * 4; // 10s周期
          const iconSize = tileSize * 0.9;
          const pixelScale = iconSize / 16;
          const ox = ix - iconSize / 2;
          const oy = iy - iconSize / 2 + bob;

          // 地面投影 (椭圆暗影)
          itemCtx.globalAlpha = 0.3;
          itemCtx.fillStyle = '#000';
          itemCtx.shadowBlur = 0;
          itemCtx.beginPath();
          itemCtx.ellipse(ix, iy + iconSize / 2 + 8, iconSize / 3, 4, 0, 0, Math.PI * 2);
          itemCtx.fill();

          // 背景大范围环境光晕 (参考 .loot-halo: radialGradient + haloPulse 5s)
          const haloPulse = 0.5 + 0.5 * Math.sin(itemTime * 0.314); // 20s周期
          const haloR = iconSize * 1.5;
          const haloGrad = itemCtx.createRadialGradient(ix, iy + bob, 0, ix, iy + bob, haloR);
          haloGrad.addColorStop(0, `rgba(234, 179, 8, ${0.25 + 0.1 * haloPulse})`);
          haloGrad.addColorStop(0.4, `rgba(234, 179, 8, ${0.1 + 0.05 * haloPulse})`);
          haloGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
          itemCtx.globalAlpha = 1;
          itemCtx.fillStyle = haloGrad;
          itemCtx.shadowBlur = 0;
          itemCtx.beginPath();
          itemCtx.arc(ix, iy + bob, haloR, 0, Math.PI * 2);
          itemCtx.fill();

          // 像素图标绘制 (image-rendering: pixelated)
          itemCtx.imageSmoothingEnabled = false;
          itemCtx.globalAlpha = 1;
          itemCtx.shadowBlur = 0;
          for (let py = 0; py < 16; py++) {
            const row = itemDef.pixels[py];
            if (!row) continue;
            for (let px = 0; px < 16; px++) {
              const ch = row[px];
              const color = ITEM_PALETTE[ch as keyof typeof ITEM_PALETTE];
              if (color) {
                itemCtx.fillStyle = color;
                itemCtx.fillRect(ox + px * pixelScale, oy + py * pixelScale, Math.ceil(pixelScale), Math.ceil(pixelScale));
              }
            }
          }

          // 图标外发光 (参考 filter: drop-shadow(0 0 10px rgba(234,179,8,0.8)))
          itemCtx.globalAlpha = isHovered ? 0.9 : (0.5 + 0.15 * haloPulse);
          itemCtx.shadowColor = '#eab308';
          itemCtx.shadowBlur = isHovered ? 20 : 10;
          itemCtx.fillStyle = 'rgba(234, 179, 8, 0.01)';
          itemCtx.beginPath();
          itemCtx.arc(ix, iy + bob, iconSize / 2, 0, Math.PI * 2);
          itemCtx.fill();
      } else {
        // ── 无像素数据的可拾取道具：琥珀色发光点 + 悬浮 + 地面投影 + 光晕 ──
        const bob = Math.sin(itemTime * 0.628) * 4; // 10s周期
        const pulse = 0.5 + 0.5 * Math.sin(itemTime * 0.314); // 20s周期

        // 地面投影
        itemCtx.globalAlpha = 0.3;
        itemCtx.fillStyle = '#000';
        itemCtx.shadowBlur = 0;
        itemCtx.beginPath();
        itemCtx.ellipse(ix, iy + 12, 8, 3, 0, 0, Math.PI * 2);
        itemCtx.fill();

        // 环境光晕
        const haloGrad = itemCtx.createRadialGradient(ix, iy + bob, 0, ix, iy + bob, 30);
        haloGrad.addColorStop(0, `rgba(234, 179, 8, ${0.2 + 0.1 * pulse})`);
        haloGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
        itemCtx.globalAlpha = 1;
        itemCtx.fillStyle = haloGrad;
        itemCtx.beginPath();
        itemCtx.arc(ix, iy + bob, 30, 0, Math.PI * 2);
        itemCtx.fill();

        // 核心发光点
        itemCtx.globalAlpha = 0.9;
        itemCtx.fillStyle = '#ffebb3';
        itemCtx.shadowColor = '#eab308';
        itemCtx.shadowBlur = 12 + 6 * pulse;
        itemCtx.beginPath();
        itemCtx.arc(ix, iy + bob, 4, 0, Math.PI * 2);
        itemCtx.fill();
      }
      itemCtx.restore();
    }

    // 悬停物品名称提示 (low-profile)
    if (this.hoveredEntity && 'entity' in this.hoveredEntity) {
      const hi = this.hoveredEntity as NPC | InteractiveItem;
      const hx = (hi.entity.x - cam.x) * tileSize + tileSize / 2;
      const hy = (hi.entity.y - cam.y) * tileSize - 8;
      ctx.save();
      ctx.font = '5px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const isEvent = 'triggersDialogue' in hi && (hi as InteractiveItem).triggersDialogue;
      const isNpcWithoutDialogue = !('triggersDialogue' in hi) && 'dialogueTrigger' in hi &&
        !(this.currentScene && this.dialogueRegistry.resolve(this.currentSceneId, (hi as NPC).dialogueTrigger, { currentStage: this.progressManager.getStage(), checkCondition: this.makeTreeConditionChecker() }));
      const color = isEvent ? '#00f3ff' : isNpcWithoutDialogue ? '#ffffff' : '#eab308';
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 0;
      const tw = ctx.measureText(hi.entity.name).width;
      ctx.fillRect(hx - tw / 2 - 2, hy - 4, tw + 4, 8);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.3;
      ctx.globalAlpha = 0.3;
      ctx.strokeRect(hx - tw / 2 - 2, hy - 4, tw + 4, 8);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 2;
      ctx.fillText(hi.entity.name, hx, hy);
      ctx.restore();
    }

    // 渲染场景过渡发光箭头
    const time = performance.now() * 0.003;
    for (const t of this.currentScene.transitions) {
      const sx = (t.x - cam.x) * tileSize;
      const sy = (t.y - cam.y) * tileSize;
      const pulse = 0.5 + 0.5 * Math.sin(time);
      // 判断箭头方向：y接近0→向上，y接近世界底部→向下
      const { height: worldH } = this.getMapSize();
      const isUp = t.y <= 0.5;
      const isDown = t.y >= worldH - 1.5;
      const arrowSize = 5;
      const ctx = this.renderer.ctx;
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.fillStyle = '#00f3ff';
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 8 + 6 * pulse;
      if (isUp) {
        // 向上箭头 ▲
        ctx.beginPath();
        ctx.moveTo(sx + tileSize / 2, sy - 2);
        ctx.lineTo(sx + tileSize / 2 - arrowSize, sy + arrowSize);
        ctx.lineTo(sx + tileSize / 2 + arrowSize, sy + arrowSize);
        ctx.closePath();
        ctx.fill();
      } else if (isDown) {
        // 向下箭头 ▼
        ctx.beginPath();
        ctx.moveTo(sx + tileSize / 2, sy + tileSize + 2);
        ctx.lineTo(sx + tileSize / 2 - arrowSize, sy + tileSize - arrowSize);
        ctx.lineTo(sx + tileSize / 2 + arrowSize, sy + tileSize - arrowSize);
        ctx.closePath();
        ctx.fill();
      } else {
        // 通用发光点
        ctx.beginPath();
        ctx.arc(sx + tileSize / 2, sy + tileSize / 2, 3 + 2 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 点击反馈涟漪
    if (this.clickRipple) {
      const rctx = this.renderer.ctx;
      const rx = (this.clickRipple.x - cam.x) * tileSize + tileSize / 2;
      const ry = (this.clickRipple.y - cam.y) * tileSize + tileSize / 2;
      const progress = this.clickRipple.t / 600; // 600ms 动画
      const radius = progress * tileSize * 1.5;
      const alpha = 1 - progress;
      rctx.save();
      rctx.globalAlpha = alpha * 0.8;
      rctx.strokeStyle = '#00f3ff';
      rctx.lineWidth = 2;
      rctx.shadowColor = '#00f3ff';
      rctx.shadowBlur = 10;
      rctx.beginPath();
      rctx.arc(rx, ry, radius, 0, Math.PI * 2);
      rctx.stroke();
      // 中心点
      rctx.globalAlpha = alpha;
      rctx.fillStyle = '#00f3ff';
      rctx.beginPath();
      rctx.arc(rx, ry, 3, 0, Math.PI * 2);
      rctx.fill();
      rctx.restore();
    }

    // 场景过渡遮罩
    if (this.transitioning) {
      const alpha = this.transitionAlpha <= 1 ? this.transitionAlpha : 2 - this.transitionAlpha;
      const { viewWidth, viewHeight } = this.renderer.config;
      this.renderer.renderRect(
        0, 0, viewWidth * tileSize, viewHeight * tileSize,
        '#0d1117', alpha,
      );
    }

    // 更新 UI（不在每帧重建 DOM）
    this.dialogueUI.update();
    this.statusUI.update(this.player, this.currentScene.name);
    this.questUI.update(this.questManager);
    this.notificationUI.update(this.notificationSystem);


  }

  get isDialogueActive(): boolean {
    return this.dialogueSystem.isActive;
  }

  dispose(): void {
    this.running = false;
    this.minigameOverlay.close();
    this.terminalUI.dispose();
    this.systemMenu.destroy();
    document.removeEventListener('keydown', this.handleGlobalKeydown);
    window.removeEventListener('resize', this.handleWindowResize);
  }

}
