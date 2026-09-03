// ============================================================
// 开发者模式 — 按方向右键切换，全景地图编辑器
// 拖拽画碰撞框 / 拖拽移动 NPC·道具·出入口 / 导出 JSON
// ============================================================

import { stageLabel } from '../systems/stage-manager';

export interface DevCollider { x: number; y: number; w: number; h: number; }
export interface DevMarker { type: 'npc' | 'item' | 'transition'; id: string; x: number; y: number; label: string; spriteUrl?: string | null;
  spriteVariant?: string; npcId?: string; }
export interface DevCallbacks {
    getSceneData: () => DevSceneData;
    onColliderAdd: (c: DevCollider) => void;
    onColliderClear: () => void;
    onColliderDelete: (index: number) => void;
    onMarkerMove: (type: DevMarker['type'], id: string, x: number, y: number) => void;
    onMarkerPreview?: (type: DevMarker['type'], id: string, x: number, y: number) => void;
    onPlaceItem?: (itemId: string, tileX: number, tileY: number) => void;
    onPlaceNpc?: (npcId: string, npcName: string, tileX: number, tileY: number) => void;
    onPlaceTransition?: (targetScene: string, tileX: number, tileY: number) => void;
    onDeleteSaved: () => void;
    getSavedColliders: () => DevCollider[] | null;
    getCatalogItems?: () => { id: string; label: string }[];
    getCatalogScenes?: () => { id: string; name: string }[];
    getCurrentSceneId?: () => string;
    onSwitchScene?: (sceneId: string) => void;
    onDeleteEntity?: (type: DevMarker['type'], id: string) => void;
    onRefreshEntities?: () => DevMarker[];
    onPreviewStageChange?: (stage: number) => void;
    getStageList?: () => number[];
    onDevToolsOpen?: () => void;
    onDevToolsClose?: () => void;
    onPersistStageState?: () => Promise<void>;
    onNpcPoseInheritRestore?: (npcId: string, stage: number) => void;
    getPreviewStage?: () => number;
    onNpcPoseChange?: (npcId: string, stage: number, variant: 'front' | 'side' | 'back') => void;
    getNpcVariants?: (npcId: string) => string[];
    getNpcSpriteUrl?: (npcId: string, variant: string) => string | null;
  }

export interface DevSceneData {
  sceneId: string;
  bgImage: string;
  worldW: number; worldH: number;
  colliders: DevCollider[];
  markers: DevMarker[];
  npcs: { id: string; name: string; x: number; y: number; spriteVariant?: string; variants?: string[] }[];
  items: { id: string; name: string; x: number; y: number }[];
  transitions: { x: number; y: number; targetScene: string }[];
}

type Mode = 'idle' | 'create-collider' | 'drag-collider' | 'drag-marker' | 'resize-collider';
type PlaceMode = 'none' | 'item' | 'npc' | 'transition';

interface DragState {
  idx: number;
  dx: number;
  dy: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
}

export class DevTools {
  private overlayEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private itemBarEl!: HTMLElement;
  private imgEl!: HTMLImageElement;
  private markerLayerEl!: HTMLElement;
  private active = false;
  private mode: Mode = 'idle';
  private placeMode: PlaceMode = 'none';
  private dragStartX = 0;
  private dragStartY = 0;
  private currentSceneId = '';
  private stageSelectEl: HTMLSelectElement | null = null;

  /** 引擎查询：当前是否处于放置模式 */
  isPlacing(): boolean {
    return this.active && this.placeMode !== 'none';
  }

  /** 引擎转发：游戏画布点击 → 执行放置 */
  handleGameCanvasClick(tileX: number, tileY: number): void {
    if (!this.isPlacing()) return;
    if (this.placeMode === 'item') {
      if (!this.selectedItem) return;
      this.cb.onPlaceItem?.(this.selectedItem, tileX, tileY);
    } else if (this.placeMode === 'npc') {
      this.promptNpc(tileX, tileY);
    } else if (this.placeMode === 'transition') {
      this.promptTransition(tileX, tileY);
    }
  }
  private dragObj: DragState | null = null;
  private curColliders: DevCollider[] = [];
  private curMarkers: DevMarker[] = [];
  private displayScale = 1;
  private imgNaturalW = 0;
  private imgNaturalH = 0;
  private imgDispW = 0;
  private imgDispH = 0;
  private selectedCollider: number | null = null;
  private selectedMarker: number | null = null;
  private sceneSelectEl!: HTMLSelectElement;
  private cb: DevCallbacks;

  private selectedItem = '';

  constructor(callbacks: DevCallbacks) {
    this.cb = callbacks;
    this.build();
    this.bind();
  }

  // ---- DOM 构建 ----
  private build(): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;flex-direction:column;background:#0a0a0a;font-family:monospace;';
    this.overlayEl = overlay;

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 16px;background:#111;border-bottom:1px solid #333;z-index:10;';
    toolbar.innerHTML = `
      <span style="color:#00f3ff;font-weight:bold;font-size:14px;">DEV MODE</span>
      <span style="color:#666;font-size:12px;">点击选中 | 拖拽=移动 | 右键=删除 | Delete=删除选中 | Ctrl+Z=撤销</span>
      <label style="color:#aaa;font-size:12px;">地图:</label>
      <select id="dev-scene-select" style="padding:3px 8px;background:#1a1a2e;color:#00f3ff;border:1px solid #444;font-size:12px;max-width:160px;"></select>
      <label style="color:#ff0;font-size:12px;">Stage:</label>
      <select id="dev-stage-select" style="padding:3px 8px;background:#1a1a2e;color:#ff0;border:1px solid #666;font-size:12px;max-width:120px;"></select>
      <button id="dev-undo" style="padding:4px 12px;background:#1a1a2e;color:#88ccff;border:1px solid #88ccff;cursor:pointer;font-size:12px;">⤺ 撤销</button>
      <button id="dev-delete-selected" style="padding:4px 12px;background:#1a1a2e;color:#ff4488;border:1px solid #ff4488;cursor:pointer;font-size:12px;">🗑 删除选中</button>
      <button id="dev-save" style="display:none;"></button>
      <button id="dev-write-file" style="margin-left:auto;padding:4px 12px;background:#1a1a2e;color:#ffaa00;border:1px solid #ffaa00;cursor:pointer;font-size:12px;">💾 保存全部</button>
      <button id="dev-export" style="padding:4px 12px;background:#1a1a2e;color:#00f3ff;border:1px solid #00f3ff;cursor:pointer;font-size:12px;">导出JSON</button>
      <button id="dev-clear" style="padding:4px 12px;background:#1a1a2e;color:#ff4444;border:1px solid #ff4444;cursor:pointer;font-size:12px;">清空碰撞</button>
      <button id="dev-close" style="padding:4px 12px;background:#1a1a2e;color:#aaa;border:1px solid #444;cursor:pointer;font-size:12px;">关闭(→)</button>
    `;
    this.toolbarEl = toolbar;

    // 物品放置子栏
    const itemBar = document.createElement('div');
    itemBar.style.cssText = 'display:none;align-items:center;gap:8px;padding:6px 16px;background:#0d0d1a;border-bottom:1px solid #222;flex-wrap:wrap;';
    itemBar.innerHTML = `
      <span style="color:#00f3ff;font-size:12px;font-weight:bold;">放置模式:</span>
      <button id="dev-mode-item" style="padding:3px 10px;background:#1a1a2e;color:#ffaa00;border:1px solid #444;cursor:pointer;font-size:11px;">物品</button>
      <button id="dev-mode-npc" style="padding:3px 10px;background:#1a1a2e;color:#00f3ff;border:1px solid #444;cursor:pointer;font-size:11px;">NPC</button>
      <button id="dev-mode-transition" style="padding:3px 10px;background:#1a1a2e;color:#00ff88;border:1px solid #444;cursor:pointer;font-size:11px;">传送门</button>
      <span style="color:#666;font-size:11px;" id="dev-place-hint">选择模式后点击地图放置</span>
    `;
    this.itemBarEl = itemBar;

    // 地图容器（全屏，flex居中）
    const mapArea = document.createElement('div');
    mapArea.style.cssText = 'flex:1;position:relative;display:flex;justify-content:center;align-items:center;overflow:auto;';

    // 地图图片
    const img = document.createElement('img');
    img.style.cssText = 'display:block;pointer-events:none;image-rendering:pixelated;max-width:100%;max-height:100%;';
    img.draggable = false;
    this.imgEl = img;

    // 标记层（与图片重叠）
    const markerLayer = document.createElement('div');
    markerLayer.style.cssText = 'position:absolute;pointer-events:none;';
    this.markerLayerEl = markerLayer;

    mapArea.appendChild(img);
    mapArea.appendChild(markerLayer);

    overlay.appendChild(toolbar);
    overlay.appendChild(this.itemBarEl);
    overlay.appendChild(mapArea);

    document.body.appendChild(overlay);
  }

  // ---- 事件绑定 ----
  private bind(): void {
    // 方向右键切换
    document.addEventListener('keydown', (e) => {
      // 输入控件内的按键不触发面板切换
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.toggle();
      }
      if (e.key === 'Escape' && this.active) {
        this.toggle();
      }
    });

    // 工具栏按钮
    this.toolbarEl.querySelector('#dev-close')!.addEventListener('click', () => this.toggle());
    this.toolbarEl.querySelector('#dev-clear')!.addEventListener('click', () => {
      this.cb.onColliderClear();
      this.curColliders = [];
      this.refresh();
    });
    this.toolbarEl.querySelector('#dev-export')!.addEventListener('click', () => this.exportJSON());
    this.toolbarEl.querySelector('#dev-write-file')!.addEventListener('click', () => this.saveToFile());

    // Stage 选择器：切换 Preview Stage（只影响编辑器预览，不改运行时存档）
    this.stageSelectEl = this.toolbarEl.querySelector('#dev-stage-select') as HTMLSelectElement | null;
    this.stageSelectEl?.addEventListener('change', () => {
      const stage = parseInt((this.stageSelectEl as HTMLSelectElement).value, 10);
      if (!isNaN(stage)) this.cb.onPreviewStageChange?.(stage);
    });

    // 撤销 / 删除选中
    this.toolbarEl.querySelector('#dev-undo')!.addEventListener('click', () => this.undo());
    this.toolbarEl.querySelector('#dev-delete-selected')!.addEventListener('click', () => this.deleteSelected());

    // 地图选择器
    this.sceneSelectEl = this.toolbarEl.querySelector('#dev-scene-select') as HTMLSelectElement;
    this.sceneSelectEl.addEventListener('change', () => {
      const sceneId = this.sceneSelectEl.value;
      if (sceneId && sceneId !== this.currentSceneId) {
        this.cb.onSwitchScene?.(sceneId);
      }
    });

    // 鼠标事件在 markerLayer 上（覆盖整个地图显示区域）
    this.markerLayerEl.style.pointerEvents = 'auto';

    this.markerLayerEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.markerLayerEl.addEventListener('contextmenu', (e) => this.onContextMenu(e));
    document.addEventListener('mousemove', (e) => { if (this.active) this.onMouseMove(e); });
    document.addEventListener('mouseup', (e) => { if (this.active) this.onMouseUp(e); });
    document.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedCollider !== null || this.selectedMarker !== null) {
          e.preventDefault();
          this.deleteSelected();
        }
      }
      if (e.key === 'Escape') this.clearSelection();
    });

    // 窗口 resize
    window.addEventListener('resize', () => { if (this.active) this.fitAndRefresh(); });

    // 放置模式按钮
    const updatePlaceButtons = () => {
      const btns = ['dev-mode-item', 'dev-mode-npc', 'dev-mode-transition'];
      for (const id of btns) {
        const b = this.itemBarEl.querySelector(`#${id}`) as HTMLElement;
        if (b) b.style.opacity = '0.5';
      }
      const activeId = this.placeMode === 'item' ? 'dev-mode-item' : this.placeMode === 'npc' ? 'dev-mode-npc' : this.placeMode === 'transition' ? 'dev-mode-transition' : '';
      if (activeId) {
        const b = this.itemBarEl.querySelector(`#${activeId}`) as HTMLElement;
        if (b) b.style.opacity = '1';
      }
      this.markerLayerEl.style.cursor = this.placeMode !== 'none' ? 'crosshair' : '';
      const hint = this.itemBarEl.querySelector('#dev-place-hint');
      if (hint) {
        const hints: Record<PlaceMode, string> = {
          'none': '选择模式后点击地图放置',
          'item': '选择物品后点击地图放置',
          'npc': '点击地图 → 输入代号和名称',
          'transition': '点击地图 → 选择目标场景（自动创建回传门）',
        };
        hint.textContent = hints[this.placeMode];
      }
    };

    // 清除所有放置相关的 popup 和状态
    const clearPlacePopups = () => {
      this.itemBarEl.querySelector('#dev-item-popup')?.remove();
      this.selectedItem = '';
    };

    this.itemBarEl.querySelector('#dev-mode-item')!.addEventListener('click', () => {
      clearPlacePopups();
      if (this.placeMode === 'item') { this.placeMode = 'none'; this.selectedItem = ''; }
      else { this.placeMode = 'item'; this.showItemSelect(); }
      updatePlaceButtons();
    });
    this.itemBarEl.querySelector('#dev-mode-npc')!.addEventListener('click', () => {
      clearPlacePopups();
      this.placeMode = this.placeMode === 'npc' ? 'none' : 'npc';
      this.selectedItem = '';
      updatePlaceButtons();
    });
    this.itemBarEl.querySelector('#dev-mode-transition')!.addEventListener('click', () => {
      clearPlacePopups();
      this.placeMode = this.placeMode === 'transition' ? 'none' : 'transition';
      this.selectedItem = '';
      updatePlaceButtons();
    });

    // Delete 键删除选中
    window.addEventListener('keydown', (e) => {
      if (this.overlayEl.style.display === 'none') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedCollider !== null || this.selectedMarker !== null) {
          e.preventDefault();
          this.deleteSelected();
        }
      }
    });
  }

  // ---- 坐标转换 ----
  // 屏幕坐标 → 世界坐标
  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.markerLayerEl.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return { x: px / this.displayScale, y: py / this.displayScale };
  }

  // 世界坐标 → 屏幕像素（相对markerLayer）
  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.displayScale, y: wy * this.displayScale };
  }

  // ---- 加载地图 ----
  private loadMap(): void {
    const data = this.cb.getSceneData();
    this.curColliders = [...data.colliders];
    this.curMarkers = [...data.markers];

    const onReady = () => {
      this.imgNaturalW = this.imgEl.naturalWidth || 960;
      this.imgNaturalH = this.imgEl.naturalHeight || 773;
      // overlay 刚从 display:none 恢复，浏览器可能还没 reflow
      // 延迟到下一帧确保 getBoundingClientRect/clientWidth 有值
      requestAnimationFrame(() => this.fitAndRefresh());
    };

    // 设置 src（用 endsWith 避免完整 URL 对比问题）
    const wantSrc = data.bgImage;
    if (!this.imgEl.src.endsWith(wantSrc)) {
      this.imgEl.onload = onReady;
      this.imgEl.src = wantSrc;
    } else if (this.imgEl.complete && this.imgEl.naturalWidth > 0) {
      onReady();
    } else {
      this.imgEl.onload = onReady;
    }
  }

  // ---- 适配 + 刷新 ----
  private fitAndRefresh(): void {
    if (!this.imgNaturalW) return;

    // 计算图片显示尺寸：contain 填满窗口
    const areaEl = this.markerLayerEl.parentElement!;
    const maxW = areaEl.clientWidth;
    const maxH = areaEl.clientHeight;
    // overlay 刚从 display:none 恢复时，clientWidth/Height 可能为 0
    if (!maxW || !maxH) {
      requestAnimationFrame(() => this.fitAndRefresh());
      return;
    }
    const fitScale = Math.min(maxW / this.imgNaturalW, maxH / this.imgNaturalH);
    this.imgDispW = Math.round(this.imgNaturalW * fitScale);
    this.imgDispH = Math.round(this.imgNaturalH * fitScale);

    // 设置图片和标记层尺寸
    this.imgEl.style.width = `${this.imgDispW}px`;
    this.imgEl.style.height = `${this.imgDispH}px`;
    this.markerLayerEl.style.width = `${this.imgDispW}px`;
    this.markerLayerEl.style.height = `${this.imgDispH}px`;

    // 居中标记层（flex居中的图片可能不在正中心，用绝对定位对齐）
    const imgRect = this.imgEl.getBoundingClientRect();
    const areaRect = areaEl.getBoundingClientRect();
    this.markerLayerEl.style.left = `${imgRect.left - areaRect.left}px`;
    this.markerLayerEl.style.top = `${imgRect.top - areaRect.top}px`;

    // displayScale = 显示像素 / 世界单位
    const data = this.cb.getSceneData();
    this.displayScale = this.imgDispW / data.worldW;

    this.refresh();
  }

  // ---- 刷新渲染 ----
  refresh(): void {
    if (!this.displayScale) {
      requestAnimationFrame(() => this.refresh());
      return;
    }
    let html = '';

    // 碰撞框
    for (let i = 0; i < this.curColliders.length; i++) {
      const c = this.curColliders[i];
      const sx = this.worldToScreen(c.x, c.y);
      const sw = c.w * this.displayScale;
      const sh = c.h * this.displayScale;
      const isSel = this.selectedCollider === i;
      const bg = isSel ? 'rgba(255,255,0,0.3)' : 'rgba(255,0,85,0.15)';
      const bd = isSel ? '#ffff00' : 'rgba(255,0,85,0.6)';
      html += `<div data-collider="${i}" style="position:absolute;left:${sx.x}px;top:${sx.y}px;width:${sw}px;height:${sh}px;background:${bg};border:2px solid ${bd};cursor:pointer;box-sizing:border-box;"></div>`;
      // 四角缩放手柄
      const handles = [
        { dx: 0, dy: 0, cursor: 'nwse-resize' },
        { dx: sw, dy: 0, cursor: 'nesw-resize' },
        { dx: 0, dy: sh, cursor: 'nesw-resize' },
        { dx: sw, dy: sh, cursor: 'nwse-resize' },
      ];
      for (const h of handles) {
        html += `<div data-resize="${i}" data-dx="${h.dx}" data-dy="${h.dy}" style="position:absolute;left:${sx.x + h.dx - 4}px;top:${sx.y + h.dy - 4}px;width:8px;height:8px;background:#ff0055;cursor:${h.cursor};pointer-events:auto;z-index:5;"></div>`;
      }
    }

    // 标记
    for (let i = 0; i < this.curMarkers.length; i++) {
      const m = this.curMarkers[i];
      const sx = this.worldToScreen(m.x, m.y);
      const color = m.type === 'npc' ? '#00f3ff' : m.type === 'item' ? '#ffaa00' : '#00ff88';
      const shape = m.type === 'transition' ? '◆' : '●';
      const isSel = this.selectedMarker === i;
      const ringStyle = isSel ? 'box-shadow:0 0 8px #ffff00;' : '';
      const extraAttrs = m.type === 'npc' && m.npcId ? ` data-npc-id="${m.npcId}"` : '';
      html += `<div data-marker="${i}"${extraAttrs} style="position:absolute;left:${sx.x - 10}px;top:${sx.y - 10}px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:16px;color:${isSel ? '#ffff00' : color};cursor:pointer;pointer-events:auto;text-shadow:0 0 4px ${isSel ? '#ffff00' : color};${ringStyle}">${shape}</div>`;
      html += `<div style="position:absolute;left:${sx.x + 12}px;top:${sx.y - 6}px;font-size:10px;color:${color};white-space:nowrap;pointer-events:none;">${m.label}</div>`;
    }

    this.markerLayerEl.innerHTML = html;
  }

  syncMarkers(): void {
    const sd = this.cb.getSceneData?.();
    if (!sd) return;
    const mk: DevMarker[] = [
      ...(sd.npcs || []).map(n => ({
        type: 'npc' as const, x: n.x, y: n.y,
        label: `NPC:${n.id}`, id: n.id, npcId: n.id,
        spriteVariant: n.spriteVariant ?? 'front',
        spriteUrl: this.cb.getNpcSpriteUrl?.(n.id, n.spriteVariant ?? 'front') ?? null,
      })),
      ...(sd.items || []).map(it => ({ type: 'item' as const, x: it.x, y: it.y, label: `物品:${it.id}`, id: it.id })),
      ...(sd.transitions || []).map(t => ({ type: 'transition' as const, x: t.x, y: t.y, label: `→${t.targetScene}`, id: `${t.targetScene}` })),
    ];
    this.curMarkers = mk;
    this.refresh();
  }

  // ---- 鼠标事件 ----
  private onMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;

    // 放置模式：放在地图中心，用户可自行拖动
    if (this.placeMode !== 'none') {
      const data = this.cb.getSceneData();
      const cx = Math.floor((data.worldW || 640) / 2);
      const cy = Math.floor((data.worldH || 400) / 2);

      if (this.placeMode === 'item') {
        if (!this.selectedItem) return;
        this.cb.onPlaceItem?.(this.selectedItem, cx, cy);
      } else if (this.placeMode === 'npc') {
        this.promptNpc(cx, cy);
      } else if (this.placeMode === 'transition') {
        this.promptTransition(cx, cy);
      }
      this.syncMarkers();
      return;
    }

    const world = this.screenToWorld(e.clientX, e.clientY);
    this.dragStartX = world.x;
    this.dragStartY = world.y;

    if (target.hasAttribute('data-resize')) {
      const idx = parseInt(target.getAttribute('data-resize')!);
      const c = this.curColliders[idx];
      this.selectedCollider = idx;
      this.selectedMarker = null;
      this.pushHistory();
      this.mode = 'resize-collider';
      this.dragObj = { idx, dx: parseFloat(target.dataset.dx!), dy: parseFloat(target.dataset.dy!), origX: c.x, origY: c.y, origW: c.w, origH: c.h };
    } else if (target.hasAttribute('data-collider')) {
      const idx = parseInt(target.getAttribute('data-collider')!);
      this.selectedCollider = idx;
      this.selectedMarker = null;
      this.pushHistory();
      this.mode = 'drag-collider';
      const c = this.curColliders[idx];
      this.dragObj = { idx, dx: 0, dy: 0, origX: c.x, origY: c.y, origW: c.w, origH: c.h };
    } else if (target.hasAttribute('data-marker')) {
      const idx = parseInt(target.getAttribute('data-marker')!);
      this.selectedMarker = idx;
      this.selectedCollider = null;
      this.pushHistory();
      this.mode = 'drag-marker';
      if (this.curMarkers[idx].type === 'npc') {
        this.showNpcInspector(idx);
      }
      this.dragObj = { idx, dx: 0, dy: 0, origX: 0, origY: 0, origW: 0, origH: 0 };
    } else {
      this.selectedCollider = null;
      this.selectedMarker = null;
      this.mode = 'create-collider';
      this.dragObj = null;
    }
    this.refresh();
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.mode === 'idle') return;
    const world = this.screenToWorld(e.clientX, e.clientY);
    const drag = this.dragObj;

    if (this.mode === 'create-collider') {
      // 预览框
      const sx = this.worldToScreen(this.dragStartX, this.dragStartY);
      const ex = world.x * this.displayScale;
      const ey = world.y * this.displayScale;
      const px = Math.min(sx.x, ex);
      const py = Math.min(sx.y, ey);
      const pw = Math.abs(ex - sx.x);
      const ph = Math.abs(ey - sx.y);
      let preview = this.markerLayerEl.querySelector('#dev-preview') as HTMLElement | null;
      if (!preview) {
        preview = document.createElement('div');
        preview.id = 'dev-preview';
        preview.style.cssText = 'position:absolute;border:2px dashed #ff0055;background:rgba(255,0,85,0.1);pointer-events:none;box-sizing:border-box;';
        this.markerLayerEl.appendChild(preview);
      }
      preview.style.left = `${px}px`;
      preview.style.top = `${py}px`;
      preview.style.width = `${pw}px`;
      preview.style.height = `${ph}px`;
    } else if (this.mode === 'drag-collider' && drag) {
      const c = this.curColliders[drag.idx];
      c.x = drag.origX + (world.x - this.dragStartX);
      c.y = drag.origY + (world.y - this.dragStartY);
      this.refresh();
    } else if (this.mode === 'resize-collider' && drag) {
      const c = this.curColliders[drag.idx];
      const dx = world.x - this.dragStartX;
      const dy = world.y - this.dragStartY;
      if (drag.dx === 0) { c.x = drag.origX + dx; c.w = drag.origW - dx; }
      else { c.w = drag.origW + dx; }
      if (drag.dy === 0) { c.y = drag.origY + dy; c.h = drag.origH - dy; }
      else { c.h = drag.origH + dy; }
      this.refresh();
    } else if (this.mode === 'drag-marker' && drag) {
      const m = this.curMarkers[drag.idx];
      m.x = world.x;
      m.y = world.y;
      this.cb.onMarkerPreview?.(m.type, m.id, m.x, m.y);
      this.refresh();
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.mode === 'create-collider') {
      const world = this.screenToWorld(e.clientX, e.clientY);
      const x = Math.min(this.dragStartX, world.x);
      const y = Math.min(this.dragStartY, world.y);
      const w = Math.abs(world.x - this.dragStartX);
      const h = Math.abs(world.y - this.dragStartY);
      if (w > 0.3 && h > 0.3) {
        const collider = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 };
        this.pushHistory();
        this.curColliders.push(collider);
        this.cb.onColliderAdd(collider);
      }
      const preview = this.markerLayerEl.querySelector('#dev-preview');
      if (preview) preview.remove();
    } else if (this.mode === 'resize-collider' && this.dragObj) {
      // 更新原始尺寸记录
      const c = this.curColliders[this.dragObj.idx];
      this.dragObj.origX = c.x;
      this.dragObj.origY = c.y;
      this.dragObj.origW = c.w;
      this.dragObj.origH = c.h;
    } else if (this.mode === 'drag-marker' && this.dragObj) {
      // 拖动结束才提交一次：写 stageState + 单次持久化
      const m = this.curMarkers[this.dragObj.idx];
      if (m) this.cb.onMarkerMove(m.type, m.id, m.x, m.y);
    }
    this.mode = 'idle';
    this.dragObj = null;
  }

  // ---- 右键删除碰撞框 ----
  private onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-collider')) {
      e.preventDefault();
      const idx = parseInt(target.getAttribute('data-collider')!);
      this.pushHistory();
      this.curColliders.splice(idx, 1);
      this.refresh();
    }
  }

  // ---- 撤销 ----
  private history: { colliders: DevCollider[]; markers: DevMarker[] }[] = [];
  private pushHistory(): void {
    this.history.push({
      colliders: this.curColliders.map(c => ({ ...c })),
      markers: this.curMarkers.map(m => ({ ...m })),
    });
    if (this.history.length > 50) this.history.shift();
  }

  private undo(): void {
    const state = this.history.pop();
    if (!state) return;
    this.curColliders = state.colliders;
    this.curMarkers = state.markers;
    // 同步到引擎
    this.cb.onColliderClear();
    for (const c of this.curColliders) this.cb.onColliderAdd(c);
    for (const m of this.curMarkers) this.cb.onMarkerMove(m.type, m.id, m.x, m.y);
    this.refresh();
  }

  // ---- 选中 / 删除 ----
  private clearSelection(): void {
    this.selectedCollider = null;
    this.selectedMarker = null;
    this.refresh();
  }

  private deleteSelected(): void {
    if (this.selectedCollider !== null) {
      this.pushHistory();
      this.curColliders.splice(this.selectedCollider, 1);
      this.cb.onColliderClear();
      for (const c of this.curColliders) this.cb.onColliderAdd(c);
      this.selectedCollider = null;
      this.refresh();
    } else if (this.selectedMarker !== null) {
      const idx = this.selectedMarker;
      const marker = this.curMarkers[idx];
      if (marker) {
        this.pushHistory();
        this.curMarkers.splice(idx, 1);
        this.cb.onDeleteEntity?.(marker.type, marker.id);
        this.selectedMarker = null;
        this.refresh();
      }
    }
  }

  // ---- 导出JSON到剪贴板 ----
  private exportJSON(): void {
    const exportData = {
      colliders: this.curColliders.map(c => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, w: Math.round(c.w * 10) / 10, h: Math.round(c.h * 10) / 10 })),
      markers: this.curMarkers.map(m => ({ type: m.type, id: m.id, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, label: m.label })),
    };
    const json = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      const btn = this.toolbarEl.querySelector('#dev-export') as HTMLElement;
      const orig = btn.textContent;
      btn.textContent = '已复制!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {
      console.log('[DevTools] Export:\n' + json);
    });
  }

  // ---- 写入源文件 ----
  // 统一保存：碰撞框（dev-overrides.json）+ Stage 布局与传送门（stage-state.json）
  private async saveToFile(): Promise<void> {
    const data = this.cb.getSceneData();
    const btn = this.toolbarEl.querySelector('#dev-write-file') as HTMLElement;
    btn.textContent = '写入中...';
    btn.style.color = '#ffaa00';
    // 先提交引擎侧的 Stage 布局快照（NPC/道具位置 + 传送门），与碰撞框一并落盘
    await this.cb.onPersistStageState?.();
    try {
      const resp = await fetch('/api/dev/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId: data.sceneId,
          colliders: this.curColliders.map(c => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, w: Math.round(c.w * 10) / 10, h: Math.round(c.h * 10) / 10 })),
        }),
      });
      const result = await resp.json();
      if (result.success) {
        btn.textContent = '已写入源文件!';
        btn.style.color = '#00ff88';
      } else {
        btn.textContent = '保存失败!';
        btn.style.color = '#ff0055';
        console.error('[DevTools] Save failed:', result.error);
      }
    } catch (e) {
      btn.textContent = '保存失败!';
      btn.style.color = '#ff0055';
      console.error('[DevTools] Save error:', e);
    }
    setTimeout(() => { btn.textContent = '保存全部'; btn.style.color = ''; }, 2000);
  }

  // ---- NPC 姿态编辑面板 ----
  private closeNpcInspector(): void {
    document.querySelector('#dev-npc-inspector')?.remove();
  }

  private showNpcInspector(idx: number): void {
    this.closeNpcInspector();
    const m = this.curMarkers[idx];
    if (m.type !== 'npc' || !m.npcId) return;
    const stage = Math.max(0, this.cb.getPreviewStage?.() ?? 1);  // -1 无预览时 fallback 到 Stage 0
    const variants = this.cb.getNpcVariants?.(m.npcId) ?? ['front'];
    const url = (v: string) => this.cb.getNpcSpriteUrl?.(m.npcId!, v) ?? null;
    const curVariant = m.spriteVariant ?? 'front';

    let panel = document.getElementById('dev-npc-inspector') as HTMLDivElement | null;
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'dev-npc-inspector';
    panel.style.cssText = 'position:fixed;left:12px;top:120px;background:#0d1117;border:1px solid #1e3a5f;padding:14px 16px;z-index:10001;font-family:monospace;color:#c0c8d0;font-size:12px;min-width:260px;max-width:320px;';
    const labelMap: Record<string,string> = { front:'正面', side:'侧面', back:'背面' };

    const btns = variants.map(v => {
      const u = url(v);
      const img = u ? `<img src="${u}" style="width:48px;height:48px;object-fit:contain;display:block;margin:0 auto 4px;">` : `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:#161b22;color:#6b7280;font-size:11px;margin:0 auto 4px;">无图</div>`;
      const active = v === curVariant;
      return `<button data-variant="${v}" style="display:flex;flex-direction:column;align-items:center;padding:4px 6px;background:${active?'#1a3a5f':'#161b22'};color:${active?'#00f3ff':'#c0c8d0'};border:1px solid ${active?'#1e90ff':'#30363d'};cursor:pointer;font-size:11px;min-width:62px;">${img}${labelMap[v] ?? v}</button>`;
    }).join('');

    panel.innerHTML = `
      <div style="color:#00f3ff;font-size:13px;letter-spacing:1px;margin-bottom:4px;">${m.label}</div>
      <div style="color:#6b7280;margin-bottom:8px;">ID: ${m.npcId}</div>
      <div style="color:#6b7280;margin-bottom:8px;">编辑层: ${stage === 0 ? '默认 (Base)' : 'Stage '+stage}</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;">${btns}</div>
      <div style="color:#6b7280;margin-bottom:8px;">当前：${labelMap[curVariant] ?? curVariant}</div>
      <button id="npc-inh-restore" style="background:#161b22;color:#f59e0b;border:1px solid #444;cursor:pointer;padding:4px 10px;width:100%;font-family:monospace;font-size:11px;">恢复继承</button>
      <button id="npc-inh-close" style="margin-top:6px;background:transparent;color:#6b7280;border:none;cursor:pointer;font-family:monospace;font-size:11px;width:100%;">关闭</button>
    `;

    panel.querySelectorAll('button[data-variant]').forEach(b => {
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = (b as HTMLElement).dataset.variant!;
        console.log('[DEV-INSPECTOR] variant clicked:', v, 'stage:', stage, 'npcId:', m.npcId);
        this.cb.onNpcPoseChange?.(m.npcId!, stage, v as 'front' | 'side' | 'back');
        panel!.remove();
      });
    });
    panel.querySelector('#npc-inh-restore')!.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    panel.querySelector('#npc-inh-restore')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onNpcPoseInheritRestore?.(m.npcId!, stage);
      panel!.remove();
    });
    panel.querySelector('#npc-inh-close')!.addEventListener('click', () => panel!.remove());
    document.body.appendChild(panel);
  }

  // ---- 物品选择浮层 ----
  private showItemSelect(): void {
    const items = this.cb.getCatalogItems?.() ?? [];
    if (items.length === 0) { this.placeMode = 'none'; return; }

    const popup = document.createElement('select');
    popup.id = 'dev-item-popup';
    popup.style.cssText = 'background:#111;color:#fff;border:1px solid #444;padding:2px 6px;font-size:12px;max-width:200px;margin-left:8px;';
    popup.innerHTML = '<option value="">-- 选择物品 --</option>' +
      items.map(i => `<option value="${i.id}">${i.label}</option>`).join('');
    popup.addEventListener('change', (e) => {
      this.selectedItem = (e.target as HTMLSelectElement).value;
    });
    this.itemBarEl.appendChild(popup);
  }

  // ---- NPC 放置对话框 ----
  private promptNpc(tx: number, ty: number): void {
    const existing = document.getElementById('dev-npc-dialog');
    if (existing) existing.remove();

    const dlg = document.createElement('div');
    dlg.id = 'dev-npc-dialog';
    dlg.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:#0d1117;border:1px solid #1e3a5f;padding:20px;z-index:10001;font-family:monospace;color:#c0c8d0;font-size:13px;min-width:300px;';
    dlg.innerHTML = `
      <div style="color:#00f3ff;margin-bottom:12px;letter-spacing:1px;">放置 NPC 占位符</div>
      <label style="display:block;margin-bottom:8px;">代号 (英文 snake_case):<br>
        <input id="npc-id-input" type="text" placeholder="如 astro_scientist" style="width:100%;background:#161b22;color:#fff;border:1px solid #30363d;padding:4px;margin-top:4px;font-family:monospace;">
      </label>
      <label style="display:block;margin-bottom:12px;">名称:<br>
        <input id="npc-name-input" type="text" placeholder="如 天体物理研究员" style="width:100%;background:#161b22;color:#fff;border:1px solid #30363d;padding:4px;margin-top:4px;font-family:monospace;">
      </label>
      <div style="color:#6b7280;font-size:11px;margin-bottom:12px;">
        放置后使用通用占位符。上传 <code style="color:#00ff88;">public/npc/{代号}.png</code> 后自动替换。
      </div>
      <div style="display:flex;gap:8px;">
        <button id="npc-confirm" style="flex:1;background:#1a3a2a;color:#4ade80;border:1px solid #22c55e;padding:6px;cursor:pointer;">确认放置</button>
        <button id="npc-cancel" style="flex:1;background:#3a1a1a;color:#f87171;border:1px solid #ef4444;padding:6px;cursor:pointer;">取消</button>
      </div>
    `;
    document.body.appendChild(dlg);
    (dlg.querySelector('#npc-id-input') as HTMLInputElement).focus();

    const close = () => dlg.remove();
    dlg.querySelector('#npc-cancel')!.addEventListener('click', close);
    dlg.querySelector('#npc-confirm')!.addEventListener('click', () => {
      const id = (dlg.querySelector('#npc-id-input') as HTMLInputElement).value.trim();
      const name = (dlg.querySelector('#npc-name-input') as HTMLInputElement).value.trim();
      if (!id || !name) return;
      this.cb.onPlaceNpc?.(id, name, tx, ty);
      close();
    });
  }

  // ---- 传送门放置对话框 ----
  private promptTransition(tx: number, ty: number): void {
    const scenes = this.cb.getCatalogScenes?.() ?? [];
    const curScene = this.cb.getCurrentSceneId?.() ?? '';
    if (scenes.length === 0) return;

    const existing = document.getElementById('dev-trans-dialog');
    if (existing) existing.remove();

    const dlg = document.createElement('div');
    dlg.id = 'dev-trans-dialog';
    dlg.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:#0d1117;border:1px solid #1e3a5f;padding:20px;z-index:10001;font-family:monospace;color:#c0c8d0;font-size:13px;min-width:300px;';
    dlg.innerHTML = `
      <div style="color:#00ff88;margin-bottom:12px;letter-spacing:1px;">放置传送门</div>
      <div style="margin-bottom:8px;color:#6b7280;font-size:11px;">当前场景: ${curScene} → 位置 (${tx}, ${ty})</div>
      <label style="display:block;margin-bottom:12px;">传送到:<br>
        <select id="trans-target" style="width:100%;background:#161b22;color:#fff;border:1px solid #30363d;padding:4px;margin-top:4px;">
          ${scenes.map(s => `<option value="${s.id}">${s.name} (${s.id})</option>`).join('')}
        </select>
      </label>
      <div style="color:#6b7280;font-size:11px;margin-bottom:12px;">
        将在目标场景自动放置回传门到当前场景。
      </div>
      <div style="display:flex;gap:8px;">
        <button id="trans-confirm" style="flex:1;background:#1a3a2a;color:#4ade80;border:1px solid #22c55e;padding:6px;cursor:pointer;">确认放置</button>
        <button id="trans-cancel" style="flex:1;background:#3a1a1a;color:#f87171;border:1px solid #ef4444;padding:6px;cursor:pointer;">取消</button>
      </div>
    `;
    document.body.appendChild(dlg);

    const close = () => dlg.remove();
    dlg.querySelector('#trans-cancel')!.addEventListener('click', close);
    dlg.querySelector('#trans-confirm')!.addEventListener('click', () => {
      const target = (dlg.querySelector('#trans-target') as HTMLSelectElement).value;
      if (!target) return;
      this.cb.onPlaceTransition?.(target, tx, ty);
      close();
    });
  }

  // ---- 切换 ----
  toggle(): void {
    this.active = !this.active;
    if (this.active) {
      this.overlayEl.style.display = 'flex';
      this.itemBarEl.style.display = 'flex';
      this.markerLayerEl.style.pointerEvents = 'auto';
      this.populateSceneSelect();
      // 打开即进入预览：下拉填充后同步选中到 runtime stage，再触发一次 reconcile
      this.cb.onDevToolsOpen?.();
      this.loadMap();
    } else {
      this.overlayEl.style.display = 'none';
      this.itemBarEl.style.display = 'none';
      this.placeMode = 'none';
      this.selectedItem = '';
      this.markerLayerEl.style.pointerEvents = 'none';
      this.itemBarEl.querySelector('#dev-item-popup')?.remove();
      // 关闭即退出预览：世界按 runtime stage 重算，不残留在 preview stage
      this.cb.onDevToolsClose?.();
    }
  }

  private populateSceneSelect(): void {
    const scenes = this.cb.getCatalogScenes?.() ?? [];
    const current = this.cb.getCurrentSceneId?.() ?? '';
    this.currentSceneId = current;
    this.sceneSelectEl.innerHTML = scenes.map(s =>
      `<option value="${s.id}"${s.id === current ? ' selected' : ''}>${s.name}</option>`
    ).join('');
    this.populateStageSelect();
  }

  private populateStageSelect(): void {
    this.stageSelectEl = this.toolbarEl.querySelector('#dev-stage-select') as HTMLSelectElement;
    if (!this.stageSelectEl) return;
    const stages = this.cb.getStageList?.() ?? [];
    if (stages.length === 0) {
      this.stageSelectEl.innerHTML = `<option value="0">${stageLabel(0)}</option>`;
      return;
    }
    this.stageSelectEl.innerHTML = stages.map((s: number) =>
      `<option value="${s}">${stageLabel(s)}</option>`
    ).join('');
  }

  refreshScene(): void {
    if (!this.active) return;
    this.populateSceneSelect();
    this.loadMap();
  }

  get isActive(): boolean { return this.active; }
}
