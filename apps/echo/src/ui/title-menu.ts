import type {
  SaveEnvelope,
  SaveGameStore,
  SaveSlotEntry,
  SaveSlotId,
} from '../systems/save-game';
import {
  saveSlotDescription,
  slotLabel,
} from './save-slot-view';

export interface TitleMenuCallbacks {
  onContinue(envelope: SaveEnvelope): void;
  onNewGame(): void;
  onLoad(envelope: SaveEnvelope): void;
  canLoad?(envelope: SaveEnvelope): boolean;
}

type TitleView = 'main' | 'load' | 'delete-confirm';
type MessageTone = 'info' | 'error';

const TITLE_MENU_STYLE_ID = 'echo-title-menu-style';

export class TitleMenu {
  private readonly root: HTMLDivElement;
  private view: TitleView = 'main';
  private pendingDelete: SaveSlotId | null = null;
  private message = '';
  private messageTone: MessageTone = 'info';
  private disabled = false;

  constructor(
    parent: HTMLElement,
    private readonly store: SaveGameStore,
    private readonly callbacks: TitleMenuCallbacks,
  ) {
    ensureStyle(parent.ownerDocument);
    this.root = parent.ownerDocument.createElement('div');
    this.root.id = 'echo-title-menu';
    this.root.className = 'etm-root';
    this.root.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeydown);
    parent.appendChild(this.root);
    this.render();
  }

  showMessage(message: string, tone: MessageTone = 'info'): void {
    this.message = message;
    this.messageTone = tone;
    this.render();
  }

  destroy(): void {
    this.root.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeydown);
    this.root.remove();
  }

  private render(): void {
    if (this.view === 'load') {
      this.renderLoad();
      return;
    }
    if (this.view === 'delete-confirm') {
      this.renderDeleteConfirm();
      return;
    }
    this.renderMain();
  }

  private renderMain(): void {
    const latest = this.latestLoadable();
    const continueDescription = latest
      ? saveSlotDescription({ slotId: latest.slotId, status: 'ready', envelope: latest })
      : '尚未检测到可继续的记录';
    this.root.innerHTML = `
      <section class="etm-panel etm-main-panel" aria-label="标题菜单">
        <div class="etm-kicker">ECHO // MEMORY ACCESS</div>
        <div class="etm-actions">
          <button data-action="continue" class="etm-button etm-primary" ${latest ? '' : 'disabled'}>
            <strong>继续游戏</strong>
            <span>${escapeHtml(continueDescription)}</span>
          </button>
          <button data-action="new" class="etm-button">
            <strong>新游戏</strong>
            <span>从回响研究院重新开始</span>
          </button>
          <button data-action="show-load" class="etm-button">
            <strong>读取存档</strong>
            <span>选择自动存档或手动存档</span>
          </button>
        </div>
        ${this.renderMessage()}
      </section>
    `;
    this.applyDisabledState();
  }

  private renderLoad(): void {
    const slots = this.store.list();
    this.root.innerHTML = `
      <section class="etm-panel etm-load-panel" aria-label="读取存档">
        <header class="etm-header">
          <div class="etm-kicker">RESTORE MEMORY</div>
          <h2>读取存档</h2>
        </header>
        <div class="etm-slots">
          ${slots.map((entry) => this.renderSlot(entry)).join('')}
        </div>
        <button data-action="back" class="etm-back">返回</button>
        ${this.renderMessage()}
      </section>
    `;
    this.applyDisabledState();
  }

  private renderDeleteConfirm(): void {
    const slotId = this.pendingDelete;
    this.root.innerHTML = `
      <section class="etm-panel etm-confirm" role="alertdialog" aria-label="删除存档">
        <div class="etm-kicker">CONFIRM OPERATION</div>
        <h2>删除存档</h2>
        <p>确定删除${slotId ? escapeHtml(slotLabel(slotId)) : '这份记录'}吗？删除后无法恢复。</p>
        <div class="etm-confirm-actions">
          <button data-action="cancel-delete" class="etm-back">取消</button>
          <button data-action="confirm-delete" class="etm-back etm-danger">确认删除</button>
        </div>
      </section>
    `;
    this.applyDisabledState();
  }

  private renderSlot(entry: SaveSlotEntry): string {
    const canLoad = entry.status === 'ready' && this.isLoadable(entry.envelope);
    const canDelete = entry.status !== 'empty';
    const description = entry.status === 'ready' && !canLoad
      ? '存档场景不可用'
      : saveSlotDescription(entry);
    return `
      <article class="etm-slot-row">
        <button data-action="load" data-slot="${entry.slotId}" class="etm-slot" ${canLoad ? '' : 'disabled'}>
          <strong>${escapeHtml(slotLabel(entry.slotId))}</strong>
          <span>${escapeHtml(description)}</span>
          <em>${canLoad ? '读取' : '—'}</em>
        </button>
        <button data-action="ask-delete" data-slot="${entry.slotId}" class="etm-delete" ${canDelete ? '' : 'disabled'} aria-label="删除${escapeHtml(slotLabel(entry.slotId))}">×</button>
      </article>
    `;
  }

  private renderMessage(): string {
    if (!this.message) return '';
    return `<p class="etm-message etm-${this.messageTone}" role="status">${escapeHtml(this.message)}</p>`;
  }

  private applyDisabledState(): void {
    if (!this.disabled) return;
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = true;
    });
  }

  private start(action: () => void): void {
    if (this.disabled) return;
    this.disabled = true;
    this.applyDisabledState();
    action();
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this.disabled || this.view === 'main') return;
    event.preventDefault();
    this.pendingDelete = null;
    this.view = this.view === 'delete-confirm' ? 'load' : 'main';
    this.render();
  };

  private readonly handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled || this.disabled) return;
    event.preventDefault();
    event.stopPropagation();

    const action = button.dataset.action;
    if (action === 'continue') {
      const latest = this.latestLoadable();
      if (latest) this.start(() => this.callbacks.onContinue(latest));
      return;
    }
    if (action === 'new') {
      this.start(() => this.callbacks.onNewGame());
      return;
    }
    if (action === 'show-load') {
      this.view = 'load';
      this.render();
      return;
    }
    if (action === 'back') {
      this.view = 'main';
      this.render();
      return;
    }
    if (action === 'cancel-delete') {
      this.pendingDelete = null;
      this.view = 'load';
      this.render();
      return;
    }
    if (action === 'confirm-delete') {
      this.deletePendingSlot();
      return;
    }

    const slotId = parseSlotId(button.dataset.slot);
    if (!slotId) return;
    const entry = this.store.list().find((candidate) => candidate.slotId === slotId);
    if (!entry) return;

    if (
      action === 'load'
      && entry.status === 'ready'
      && this.isLoadable(entry.envelope)
    ) {
      this.start(() => this.callbacks.onLoad(entry.envelope));
      return;
    }
    if (action === 'ask-delete' && entry.status !== 'empty') {
      this.pendingDelete = slotId;
      this.view = 'delete-confirm';
      this.render();
    }
  };

  private deletePendingSlot(): void {
    const slotId = this.pendingDelete;
    this.pendingDelete = null;
    this.view = 'load';
    if (!slotId) {
      this.render();
      return;
    }
    try {
      this.store.remove(slotId);
      this.message = `${slotLabel(slotId)}已删除。`;
      this.messageTone = 'info';
    } catch {
      this.message = '存档删除失败，请检查浏览器存储权限。';
      this.messageTone = 'error';
    }
    this.render();
  }

  private latestLoadable(): SaveEnvelope | null {
    const latest = this.store.latest();
    if (latest && this.isLoadable(latest)) return latest;
    const candidates = this.store.list()
      .filter(
        (entry): entry is Extract<SaveSlotEntry, { status: 'ready' }> =>
          entry.status === 'ready' && this.isLoadable(entry.envelope),
      )
      .map((entry) => entry.envelope)
      .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
    return candidates[0] ?? null;
  }

  private isLoadable(envelope: SaveEnvelope): boolean {
    return this.callbacks.canLoad?.(envelope) ?? true;
  }
}

function parseSlotId(value: string | undefined): SaveSlotId | null {
  switch (value) {
    case 'auto':
    case 'manual-1':
    case 'manual-2':
    case 'manual-3':
      return value;
    default:
      return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[character] ?? character;
  });
}

function ensureStyle(documentRef: Document): void {
  if (documentRef.getElementById(TITLE_MENU_STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = TITLE_MENU_STYLE_ID;
  style.textContent = `
    .etm-root {
      position: absolute;
      left: clamp(28px, 8vw, 140px);
      bottom: clamp(100px, 14vh, 170px);
      z-index: 4;
      width: min(308px, calc(100vw - 40px));
      color: #e8fbff;
      pointer-events: auto;
      font-family: "Noto Sans SC", sans-serif;
    }
    .etm-panel {
      box-sizing: border-box;
      padding: 18px;
      border: 1px solid rgba(0, 243, 255, .42);
      border-left: 3px solid #00f3ff;
      background: linear-gradient(110deg, rgba(1, 10, 18, .60), rgba(7, 9, 19, .60));
      box-shadow: 0 0 32px rgba(0, 243, 255, .12);
      backdrop-filter: blur(8px);
      clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
    }
    .etm-kicker { color: #ff2a7a; font: 11px "Space Mono", monospace; letter-spacing: .18em; margin-bottom: 10px; }
    .etm-actions, .etm-slots { display: flex; flex-direction: column; gap: 8px; }
    .etm-button, .etm-slot, .etm-back, .etm-delete {
      border: 1px solid rgba(0, 243, 255, .28);
      background: rgba(0, 243, 255, .045);
      color: #dffaff;
      cursor: pointer;
      font-family: inherit;
      transition: .16s ease;
    }
    .etm-button { display: grid; gap: 3px; padding: 11px 14px; text-align: left; }
    .etm-button strong { font-size: 17px; letter-spacing: .18em; font-weight: 500; }
    .etm-button span { color: #7397a0; font-size: 11px; letter-spacing: .05em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .etm-main-panel { padding: 13px; }
    .etm-main-panel .etm-kicker { margin-bottom: 7px; }
    .etm-main-panel .etm-actions { gap: 6px; }
    .etm-main-panel .etm-button { padding: 8px 10px; }
    .etm-main-panel .etm-button strong { font-size: 15px; letter-spacing: .14em; }
    .etm-main-panel .etm-button span { font-size: 10px; line-height: 1.35; white-space: normal; }
    .etm-primary { border-color: rgba(0, 243, 255, .72); }
    .etm-button:hover:not(:disabled), .etm-button:focus-visible,
    .etm-slot:hover:not(:disabled), .etm-slot:focus-visible,
    .etm-back:hover:not(:disabled), .etm-back:focus-visible {
      outline: none;
      border-color: #00f3ff;
      background: rgba(0, 243, 255, .14);
      transform: translateX(3px);
    }
    .etm-button:disabled, .etm-slot:disabled, .etm-delete:disabled { cursor: not-allowed; opacity: .38; }
    .etm-load-panel { width: min(620px, calc(100vw - 56px)); }
    .etm-confirm { width: min(440px, calc(100vw - 56px)); }
    .etm-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(0, 243, 255, .2); margin-bottom: 12px; }
    .etm-header h2, .etm-confirm h2 { margin: 0 0 10px; font-size: 24px; font-weight: 400; letter-spacing: .16em; }
    .etm-slot-row { display: grid; grid-template-columns: 1fr 38px; gap: 7px; }
    .etm-slot { min-width: 0; display: grid; grid-template-columns: 105px 1fr auto; gap: 10px; align-items: center; padding: 10px 12px; text-align: left; }
    .etm-slot span { overflow: hidden; color: #789ba3; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .etm-slot em { color: #00f3ff; font-size: 11px; font-style: normal; }
    .etm-delete { color: #ff629e; font-size: 20px; }
    .etm-back { margin-top: 12px; padding: 9px 14px; min-width: 110px; }
    .etm-danger { border-color: rgba(255, 42, 122, .58); color: #ff8ab7; }
    .etm-confirm p { color: #adc2c7; line-height: 1.8; }
    .etm-confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    .etm-confirm-actions .etm-back { width: 100%; }
    .etm-message { margin: 11px 2px 0; font-size: 12px; line-height: 1.6; }
    .etm-info { color: #80dce7; }
    .etm-error { color: #ff82ad; }
    @media (max-width: 700px) {
      .etm-root { left: 50%; bottom: 90px; transform: translateX(-50%); }
      .etm-slot { grid-template-columns: 92px 1fr auto; }
    }
  `;
  documentRef.head.appendChild(style);
}
