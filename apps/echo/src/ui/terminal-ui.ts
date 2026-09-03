/**
 * Omni-Terminal — 按 Tab 呼出的综合战术终端面板。
 *
 * 三栏布局：
 *  1. BIOMETRICS — 角色属性（等级/HP/EXP）+ 肖像占位
 *  2. MISSION LOG — 追踪任务详情 + 其他进行中/已完成任务列表
 *  3. CARGO MANIFEST — 背包网格 + 全局 flag 控制台
 *
 * 数据来源：Player / QuestSystem / InventorySystem / ProgressManager
 */
import { ALL_ITEMS, renderPixelArt } from '../data/items/index';
import type { InventorySystem } from '../systems/inventory';
import type { Player } from '../entities/player';
import type { QuestManager, QuestView } from '../systems/quest';
import type { ProgressManager } from '../systems/progress';

const STYLES = `
.tm-scanlines {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none; z-index: 9999;
}
/* 重度：扫描线 + RGB 偏移 */
.tm-scanlines.tm-crt-heavy {
  background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%),
              linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06));
  background-size: 100% 2px, 3px 100%;
}
/* 轻度：仅淡扫描线，无 RGB 偏移 */
.tm-scanlines.tm-crt-light {
  background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.1) 50%);
  background-size: 100% 2px;
}
/* 关闭：完全透明 */
.tm-scanlines.tm-crt-off { background: transparent; }

/* 重度模式标题色差 */
.omni-terminal.tm-aberration .tm-title {
  text-shadow: 1px 0 1px rgba(255,0,0,.5), -1px 0 1px rgba(0,255,255,.5);
}
#terminal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex; justify-content: center; align-items: center;
  padding: 2vw;
  opacity: 0; pointer-events: none; visibility: hidden;
  transition: visibility 0s linear 0.4s, opacity 0.4s;
}
#terminal-overlay.active {
  opacity: 1; pointer-events: auto; visibility: visible;
  transition: opacity 0.1s;
}
.omni-terminal {
  width: 100%; max-width: 1400px; height: 90vh;
  background: rgba(2,5,10,0.85);
  border: 1px solid #00F3FF;
  box-shadow: 0 0 50px rgba(0,243,255,0.15) inset, 0 0 20px rgba(0,0,0,0.8);
  clip-path: polygon(0 20px,20px 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%);
  display: flex; flex-direction: column;
  transform: scaleY(0.01) scaleX(0);
}
#terminal-overlay.active .omni-terminal {
  animation: tm-crt-on 0.6s cubic-bezier(0.23,1,0.32,1) forwards;
}
@keyframes tm-crt-on {
  0%{transform:scaleY(.01) scaleX(0);filter:brightness(10)}
  40%{transform:scaleY(.01) scaleX(1);filter:brightness(10)}
  80%{transform:scaleY(1.1) scaleX(1);filter:brightness(2)}
  100%{transform:scaleY(1) scaleX(1);filter:brightness(1)}
}
.tm-header{padding:15px 30px;border-bottom:2px dashed rgba(0,243,255,.2);display:flex;justify-content:space-between;align-items:center;background:repeating-linear-gradient(45deg,transparent,transparent 10px,rgba(0,243,255,.05) 10px,rgba(0,243,255,.05) 20px)}
.tm-title{font-family:'ZCOOL QingKe HuangYou',sans-serif;font-size:2.2rem;letter-spacing:4px;display:flex;align-items:center;gap:15px}
.tm-status{font-family:'VT323',monospace;font-size:1.2rem;color:#EAB308;border:1px solid #EAB308;padding:2px 10px;animation:tm-blink 2s infinite}
.tm-body{flex-grow:1;display:grid;grid-template-columns:25% 45% 30%;overflow:hidden}
.tm-col{padding:20px;border-right:1px solid rgba(0,243,255,.2);display:flex;flex-direction:column;gap:20px;overflow-y:auto}
.tm-col:last-child{border-right:none}
.tm-ptitle{font-family:'VT323',monospace;font-size:1.5rem;color:#fff;border-bottom:1px solid #00F3FF;padding-bottom:5px;text-transform:uppercase;letter-spacing:2px}
.tm-ptitle::before{content:'>';color:#00F3FF;margin-right:8px}
.tm-stat-block{display:flex;flex-direction:column;gap:5px}
.tm-stat-label{font-family:'VT323',monospace;color:rgba(0,243,255,.4);font-size:1.1rem;display:flex;justify-content:space-between}
.tm-hp-bar{display:flex;gap:2px;height:20px;width:100%}
.tm-hp-seg{flex-grow:1;background:rgba(0,243,255,.2);transform:skewX(-15deg)}
.tm-hp-seg.filled{background:#00F3FF;box-shadow:0 0 10px #00F3FF}
.tm-exp-bar{width:100%;height:10px;background:rgba(0,0,0,.5);border:1px solid rgba(0,243,255,.2);position:relative}
.tm-exp-fill{height:100%;background:#EAB308;box-shadow:0 0 10px #EAB308}
.tm-portrait{display:flex;justify-content:center;margin:10px 0}
.tm-portrait img{width:180px;height:180px;object-fit:cover;image-rendering:pixelated;border:1px solid rgba(0,243,255,.3);clip-path:polygon(0 10px,10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)}
.tm-portrait-placeholder{width:180px;height:180px;border:1px dashed rgba(0,243,255,.3);display:flex;justify-content:center;align-items:center;clip-path:polygon(0 10px,10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%)}
.tm-name-input{background:rgba(0,0,0,.5);border:1px solid rgba(0,243,255,.3);color:#fff;font-family:'VT323',monospace;font-size:1.4rem;text-align:center;padding:6px 10px;outline:none;letter-spacing:2px;transition:border-color .15s}
.tm-name-input:focus{border-color:#00F3FF;box-shadow:0 0 8px rgba(0,243,255,.3)}
.tm-tracked{background:rgba(0,243,255,.05);border:1px solid #00F3FF;padding:15px;border-left:4px solid #00F3FF}
.tm-q-title{font-family:'ZCOOL QingKe HuangYou',sans-serif;font-size:1.8rem;color:#fff;margin-bottom:5px}
.tm-q-desc{font-size:.9rem;color:#9ca3af;line-height:1.5;margin-bottom:15px}
.tm-obj-list{display:flex;flex-direction:column;gap:8px}
.tm-obj-item{display:flex;align-items:flex-start;gap:10px;font-family:'VT323',monospace;font-size:1.1rem}
.tm-checkbox{width:16px;height:16px;border:1px solid #00F3FF;display:inline-block;margin-top:2px;position:relative}
.tm-obj-item.done .tm-checkbox::after{content:'x';position:absolute;top:-5px;left:2px;color:#EAB308;font-size:1.2rem}
.tm-obj-item.done{color:rgba(0,243,255,.3);text-decoration:line-through}
.tm-sub-list{border-top:1px dashed rgba(0,243,255,.2);padding-top:15px;display:flex;flex-direction:column;gap:10px}
.tm-sub-item{font-family:'VT323',monospace;font-size:1.1rem;color:#9ca3af;cursor:pointer;padding:4px 6px;border-left:2px solid transparent;transition:all .15s}
.tm-sub-item:hover{color:#fff;background:rgba(0,243,255,.08);border-left-color:#00F3FF}
.tm-sub-item.tracked{color:#EAB308;border-left-color:#EAB308;background:rgba(234,179,8,.05)}
.tm-sub-item.tracked::after{content:' [TRACKING]';font-size:.85rem;opacity:.7}
.tm-sub-item.completed{color:rgba(0,243,255,.3);cursor:default}
.tm-sub-item.completed:hover{background:none;border-left-color:transparent}
.tm-sub-item.completed::before{content:'[COMPLETED] '}
.tm-sub-item.active::before{content:'[ ] '}
.tm-track-hint{font-family:'VT323',monospace;font-size:.85rem;color:rgba(0,243,255,.3);margin-top:6px}
.tm-inv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tm-inv-slot{aspect-ratio:1;background:rgba(0,0,0,.6);border:1px solid rgba(0,243,255,.2);display:flex;justify-content:center;align-items:center;position:relative}
.tm-inv-slot canvas{width:70%;height:70%;image-rendering:pixelated}
.tm-inv-qty{position:absolute;bottom:2px;right:4px;font-family:'VT323',monospace;font-size:.9rem;color:#fff}
.tm-flags-console{flex-grow:1;background:#000;border:1px solid rgba(0,243,255,.2);padding:10px;font-family:'VT323',monospace;font-size:.9rem;color:#10b981;overflow-y:auto;max-height:200px}
.tm-flags-console p{margin:0 0 4px 0}
.tm-flags-console p::before{content:'> '}
.tm-settings-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tm-settings-label{font-family:'VT323',monospace;font-size:1rem;color:rgba(0,243,255,.5);text-transform:uppercase;letter-spacing:1px}
.tm-crt-btn{font-family:'VT323',monospace;font-size:1rem;color:rgba(0,243,255,.4);background:transparent;border:1px solid rgba(0,243,255,.2);padding:2px 10px;cursor:pointer;transition:all .15s}
.tm-crt-btn:hover{color:#fff;border-color:#00F3FF}
.tm-crt-btn.tm-crt-btn-active{color:#EAB308;border-color:#EAB308;background:rgba(234,179,8,.1)}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(0,243,255,.2)}
::-webkit-scrollbar-thumb:hover{background:#00F3FF}
@keyframes tm-blink{0%,100%{opacity:1}50%{opacity:0}}
`;

export interface TerminalServices {
  player: Player;
  quests: QuestManager;
  inventory: InventorySystem;
  progress: ProgressManager;
}

export class TerminalUI {
  private overlay: HTMLDivElement;
  private scanlines: HTMLDivElement;
  private terminalEl: HTMLDivElement;
  private isOpen = false;
  private enabled = true;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private crtMode: 'heavy' | 'light' | 'off' = 'heavy';
  private static readonly CRT_KEY = 'echo_terminal_crt';

  /** 缓存渲染引用 */
  private hpBarEl!: HTMLDivElement;
  private hpLabelEl!: HTMLSpanElement;
  private levelEl!: HTMLSpanElement;
  private expLabelEl!: HTMLSpanElement;
  private expFillEl!: HTMLDivElement;
  private trackedQuestEl!: HTMLDivElement;
  private subQuestListEl!: HTMLDivElement;
  private invGridEl!: HTMLDivElement;
  private flagsConsoleEl!: HTMLDivElement;
  private statusTimeEl!: HTMLDivElement;

  constructor(private services: TerminalServices) {
    // 注入样式（只注入一次）
    if (!document.getElementById('terminal-ui-styles')) {
      const style = document.createElement('style');
      style.id = 'terminal-ui-styles';
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    // scanlines 层（永驻，叠加在整个页面上）
    this.scanlines = document.createElement('div');
    this.scanlines.className = 'tm-scanlines';
    document.body.appendChild(this.scanlines);

    // overlay 容器
    this.overlay = document.createElement('div');
    this.overlay.id = 'terminal-overlay';
    this.overlay.innerHTML = this.buildHTML();
    document.body.appendChild(this.overlay);

    this.cacheRefs();
    this.terminalEl = this.overlay.querySelector('.omni-terminal') as HTMLDivElement;
    this.loadCrtMode();
    this.applyCrtMode();
    this.attachListeners();
  }

  // ── HTML 结构 ──────────────────────────────────────────

  private buildHTML(): string {
    return `
      <div class="omni-terminal">
        <div class="tm-header">
          <div class="tm-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            SYS.TERMINAL.M7 // OVERRIDE
          </div>
          <div class="tm-status" id="tm-sys-time">ONLINE // VER: 4.2.1</div>
        </div>
        <div class="tm-body">

          <!-- 1. BIOMETRICS -->
          <div class="tm-col">
            <div class="tm-ptitle">BIOMETRICS</div>
            <div class="tm-portrait" id="tm-portrait"></div>
            <div class="tm-stat-block">
              <div class="tm-stat-label"><span>DESIGNATION</span></div>
              <input type="text" class="tm-name-input" id="tm-name-input" placeholder="ENTER NAME" maxlength="16" value="M-7" />
            </div>
            <div class="tm-stat-block">
              <div class="tm-stat-label"><span>LEVEL</span><span style="color:#fff" id="tm-level">01</span></div>
            </div>
            <div class="tm-stat-block">
              <div class="tm-stat-label"><span>HP (INTEGRITY)</span><span style="color:#fff" id="tm-hp-label">100 / 100</span></div>
              <div class="tm-hp-bar" id="tm-hp-bar"></div>
            </div>
            <div class="tm-stat-block">
              <div class="tm-stat-label"><span>EXP LINK</span><span style="color:#fff" id="tm-exp-label">0 / 100</span></div>
              <div class="tm-exp-bar"><div class="tm-exp-fill" id="tm-exp-fill" style="width:0%"></div></div>
            </div>
          </div>

          <!-- 2. MISSION LOG -->
          <div class="tm-col" style="background:rgba(0,0,0,0.3)">
            <div class="tm-ptitle">MISSION LOG</div>
            <div class="tm-tracked" id="tm-tracked-quest"></div>
            <div class="tm-sub-list" id="tm-sub-list"></div>
          </div>

          <!-- 3. CARGO MANIFEST -->
          <div class="tm-col">
            <div class="tm-ptitle">CARGO MANIFEST</div>
            <div class="tm-inv-grid" id="tm-inv-grid"></div>
            <div class="tm-ptitle" style="margin-top:10px">SYSTEM FLAGS</div>
            <div class="tm-flags-console" id="tm-flags-console"></div>
            <div class="tm-ptitle" style="margin-top:10px">DISPLAY SETTINGS</div>
            <div class="tm-settings-row" id="tm-crt-settings">
              <span class="tm-settings-label">CRT FILTER</span>
              <button class="tm-crt-btn tm-crt-btn-active" data-crt="heavy">HEAVY</button>
              <button class="tm-crt-btn" data-crt="light">LIGHT</button>
              <button class="tm-crt-btn" data-crt="off">OFF</button>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  private cacheRefs(): void {
    this.hpBarEl = required(this.overlay, '#tm-hp-bar');
    this.hpLabelEl = required(this.overlay, '#tm-hp-label');
    this.levelEl = required(this.overlay, '#tm-level');
    this.expLabelEl = required(this.overlay, '#tm-exp-label');
    this.expFillEl = required(this.overlay, '#tm-exp-fill');
    this.trackedQuestEl = required(this.overlay, '#tm-tracked-quest');
    this.subQuestListEl = required(this.overlay, '#tm-sub-list');
    this.invGridEl = required(this.overlay, '#tm-inv-grid');
    this.flagsConsoleEl = required(this.overlay, '#tm-flags-console');
    this.statusTimeEl = required(this.overlay, '#tm-sys-time');
  }

  // ── 事件 ────────────────────────────────────────────────

  private attachListeners(): void {
    document.addEventListener('keydown', this.boundKeydown);
    this.overlay.querySelectorAll<HTMLButtonElement>('.tm-crt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setCrtMode(btn.dataset.crt as 'heavy' | 'light' | 'off');
      });
    });
    const nameInput = this.overlay.querySelector<HTMLInputElement>('#tm-name-input');
    if (nameInput) {
      nameInput.value = localStorage.getItem('echo_player_name') || 'M-7';
      nameInput.addEventListener('input', () => {
        localStorage.setItem('echo_player_name', nameInput.value);
      });
      nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    }
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.render();
      this.overlay.classList.add('active');
      this.startClock();
    } else {
      this.overlay.classList.remove('active');
      this.stopClock();
    }
  }

  get opened(): boolean {
    return this.isOpen;
  }

  close(): void {
    if (this.isOpen) this.toggle();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.close();
  }

  // ── 实时数据渲染 ────────────────────────────────────────

  private render(): void {
    this.renderBiometrics();
    this.renderMissionLog();
    this.renderInventory();
    this.renderFlags();
  }

  // ── 1. BIOMETRICS ───────────────────────────────────────

  private renderBiometrics(): void {
    const { hp, maxHp, exp, level } = this.services.player.state;

    // 肖像占位 —— 仅首次创建，避免每次打开 Tab 闪烁
    const portraitEl = this.overlay.querySelector('#tm-portrait') as HTMLDivElement;
    if (!portraitEl.querySelector('img')) {
      const portraitImg = document.createElement('img');
      portraitImg.src = '/portraits/player.png';
      portraitImg.alt = 'PLAYER';
      portraitImg.className = 'tm-portrait-img';
      portraitImg.onerror = () => {
        portraitEl.innerHTML = this.portraitPlaceholder();
      };
      portraitEl.appendChild(portraitImg);
    }

    // Level
    this.levelEl.textContent = String(level).padStart(2, '0');

    // HP 分段条
    this.hpLabelEl.textContent = `${hp} / ${maxHp}`;
    this.hpBarEl.innerHTML = '';
    const segments = 10;
    const filled = Math.ceil((hp / maxHp) * segments);
    for (let i = 0; i < segments; i++) {
      const seg = document.createElement('div');
      seg.className = `tm-hp-seg${i < filled ? ' filled' : ''}`;
      this.hpBarEl.appendChild(seg);
    }

    // EXP
    const expNeeded = level * 100;
    this.expLabelEl.textContent = `${exp} / ${expNeeded}`;
    this.expFillEl.style.width = `${Math.min(100, (exp / expNeeded) * 100)}%`;
  }

  private portraitPlaceholder(): string {
    return `<div class="tm-portrait-placeholder">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(0,243,255,0.3)" stroke-width="1" stroke-dasharray="2 2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <line x1="12" y1="11" x2="12" y2="15" stroke="rgba(0,243,255,0.5)" />
      </svg>
    </div>`;
  }

  // ── 2. MISSION LOG ──────────────────────────────────────

  private renderMissionLog(): void {
    const tracked = this.services.quests.getTrackedQuest();
    const activeQuests = this.services.quests.getActiveQuests();
    const completedIds = this.services.quests.completedQuests;
    const trackedId = this.services.quests.trackedQuest;

    // 追踪任务详情
    if (tracked) {
      this.trackedQuestEl.innerHTML = this.renderTrackedQuest(tracked);
      this.trackedQuestEl.style.display = '';
    } else {
      this.trackedQuestEl.innerHTML = '<div style="color:#9ca3af;font-size:.9rem;padding:10px">暂无追踪任务</div>';
    }

    // 其他任务列表
    this.subQuestListEl.innerHTML = '';
    const subTitle = document.createElement('div');
    subTitle.className = 'tm-ptitle';
    subTitle.style.fontSize = '1rem';
    subTitle.style.borderColor = 'rgba(255,255,255,0.1)';
    subTitle.textContent = 'ACTIVE LOGS';
    this.subQuestListEl.appendChild(subTitle);

    // 所有进行中的任务（包含追踪中的，标记高亮）
    for (const view of activeQuests) {
      const qid = view.definition.id;
      const isTracked = qid === trackedId;
      const item = document.createElement('div');
      item.className = `tm-sub-item active${isTracked ? ' tracked' : ''}`;
      const prefix = view.definition.category === 'main' ? 'M' : view.definition.category === 'side' ? 'S' : '?';
      item.textContent = `${prefix}-${view.definition.id}: ${view.definition.title}`;
      item.dataset.questId = qid;
      item.addEventListener('click', () => {
        this.services.quests.trackQuest(isTracked ? null : qid);
        this.renderMissionLog();
      });
      this.subQuestListEl.appendChild(item);
    }

    // 已完成任务
    for (const id of completedIds) {
      const item = document.createElement('div');
      item.className = 'tm-sub-item completed';
      item.textContent = id;
      this.subQuestListEl.appendChild(item);
    }

    if (activeQuests.length === 0 && completedIds.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = '#9ca3af';
      empty.style.fontSize = '.9rem';
      empty.textContent = '无任务记录';
      this.subQuestListEl.appendChild(empty);
    } else if (activeQuests.length > 1) {
      const hint = document.createElement('div');
      hint.className = 'tm-track-hint';
      hint.textContent = '> 点击任务可切换追踪目标';
      this.subQuestListEl.appendChild(hint);
    }
  }

  private renderTrackedQuest(view: QuestView): string {
    const def = view.definition;
    const step = view.currentStep;
    const stepRt = view.currentStepRuntime;

    let objectivesHTML = '';
    if (step && stepRt) {
      objectivesHTML = step.objectives.map((obj, i) => {
        const rt = stepRt.objectives[i];
        const done = rt?.done ?? false;
        const current = rt?.current ?? 0;
        const required = obj.count ?? 1;
        const text = this.objectiveText(obj.type, obj.target, current, required);
        return `<div class="tm-obj-item${done ? ' done' : ''}">
          <span class="tm-checkbox"></span>
          <span${!done ? ' style="color:#fff"' : ''}>${escapeHtml(text)}</span>
        </div>`;
      }).join('');
    }

    const prefix = def.category === 'main' ? 'M' : def.category === 'side' ? 'S' : '?';

    return `
      <div class="tm-q-title">${prefix}-${def.id}: ${escapeHtml(def.title)}</div>
      <div class="tm-q-desc">${escapeHtml(def.desc || '')}</div>
      ${step ? `<div style="color:rgba(0,243,255,.4);font-family:'VT323',monospace;font-size:1rem;margin-bottom:8px">${escapeHtml(step.desc)}</div>` : ''}
      <div class="tm-obj-list">${objectivesHTML}</div>
    `;
  }

  private objectiveText(type: string, target: string, current: number, required: number): string {
    const label = ((): string => {
      switch (type) {
        case 'talk_to_npc': return `与 ${target} 对话`;
        case 'collect_item': return `获取 ${ALL_ITEMS[target]?.name ?? target}`;
        case 'submit_item': return `提交 ${ALL_ITEMS[target]?.name ?? target}`;
        case 'reach_location': return `抵达 ${target}`;
        case 'trigger_event': return `触发 ${target}`;
        case 'custom_flag': return `设置 ${target}`;
        default: return target;
      }
    })();
    return `${label} (${current}/${required})`;
  }

  // ── 3. CARGO MANIFEST ───────────────────────────────────

  private renderInventory(): void {
    this.invGridEl.innerHTML = '';
    const slots = this.services.inventory.getSlots();
    const displaySlots = Math.max(8, slots.length);

    for (let i = 0; i < displaySlots; i++) {
      const slotEl = document.createElement('div');
      slotEl.className = 'tm-inv-slot';
      const slot = slots[i];
      if (slot) {
        const def = ALL_ITEMS[slot.itemId];
        if (def?.pixels) {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');
          if (ctx) renderPixelArt(ctx, def.pixels);
          slotEl.appendChild(canvas);
        }
        if (slot.qty > 1) {
          const qty = document.createElement('span');
          qty.className = 'tm-inv-qty';
          qty.textContent = `x${slot.qty}`;
          slotEl.appendChild(qty);
        }
      }
      this.invGridEl.appendChild(slotEl);
    }
  }

  // ── SYSTEM FLAGS ────────────────────────────────────────

  private renderFlags(): void {
    const flags = this.services.progress.getAllFlags();
    this.flagsConsoleEl.innerHTML = '';

    if (flags.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'NO FLAGS SET';
      this.flagsConsoleEl.appendChild(p);
      return;
    }

    for (const flag of flags.sort()) {
      const p = document.createElement('p');
      p.textContent = `${flag} : TRUE`;
      this.flagsConsoleEl.appendChild(p);
    }

    // 闪烁光标
    const cursor = document.createElement('p');
    cursor.style.color = '#EAB308';
    cursor.textContent = '_';
    cursor.style.animation = 'tm-blink 1s infinite';
    this.flagsConsoleEl.appendChild(cursor);
  }

  // ── 时钟 ────────────────────────────────────────────────

  private startClock(): void {
    const update = (): void => {
      const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
      this.statusTimeEl.textContent = `ONLINE // ${time}`;
    };
    update();
    this.clockTimer = setInterval(update, 1000);
  }

  private stopClock(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  // ── CRT 滤镜模式 ──────────────────────────────────────────

  private loadCrtMode(): void {
    try {
      const saved = localStorage.getItem(TerminalUI.CRT_KEY);
      if (saved === 'heavy' || saved === 'light' || saved === 'off') {
        this.crtMode = saved;
      }
    } catch { /* localStorage 不可用时默认 heavy */ }
  }

  private setCrtMode(mode: 'heavy' | 'light' | 'off'): void {
    this.crtMode = mode;
    this.applyCrtMode();
    try { localStorage.setItem(TerminalUI.CRT_KEY, mode); } catch { /* 忽略写入失败 */ }
  }

  private applyCrtMode(): void {
    this.scanlines.classList.remove('tm-crt-heavy', 'tm-crt-light', 'tm-crt-off');
    this.scanlines.classList.add(`tm-crt-${this.crtMode}`);
    this.terminalEl.classList.toggle('tm-aberration', this.crtMode === 'heavy');
    this.overlay.querySelectorAll<HTMLButtonElement>('.tm-crt-btn').forEach((btn) => {
      btn.classList.toggle('tm-crt-btn-active', btn.dataset.crt === this.crtMode);
    });
  }

  dispose(): void {
    this.stopClock();
    document.removeEventListener('keydown', this.boundKeydown);
  }

  private boundKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Tab' && this.enabled) {
      e.preventDefault();
      this.toggle();
    }
    if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      this.toggle();
    }
  };
}

// ── 辅助 ──────────────────────────────────────────────────

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const el = root.querySelector(selector) as T | null;
  if (!el) throw new Error(`TerminalUI 缺少元素: ${selector}`);
  return el;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
