import type {
  ManualSaveSlotId,
  SaveSlotEntry,
  SaveSlotId,
} from '../systems/save-game';
import {
  saveSlotDescription,
  slotLabel,
} from './save-slot-view';

export interface SystemMenuModel {
  slots: readonly SaveSlotEntry[];
  canSave: boolean;
  saveBlockedReason?: string;
}

export interface SystemMenuCallbacks {
  onResume(): void;
  onSave(slotId: ManualSaveSlotId): void;
  onLoad(slotId: SaveSlotId): void;
  onDelete(slotId: SaveSlotId): void;
  onReturnToTitle(): void;
}

type MenuView = 'main' | 'save' | 'load' | 'confirm';

interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  returnView: Exclude<MenuView, 'confirm'>;
  run: () => void;
}

const SYSTEM_MENU_STYLE_ID = 'echo-system-menu-style';

export class SystemMenu {
  private readonly overlay: HTMLDivElement;
  private model: SystemMenuModel = { slots: [], canSave: true };
  private view: MenuView = 'main';
  private confirmation: Confirmation | null = null;
  private openState = false;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: SystemMenuCallbacks,
  ) {
    ensureStyle(parent.ownerDocument);
    this.overlay = parent.ownerDocument.createElement('div');
    this.overlay.id = 'echo-system-menu';
    this.overlay.className = 'esm-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', '系统菜单');
    this.overlay.addEventListener('click', this.handleClick);
    parent.appendChild(this.overlay);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(model: SystemMenuModel): void {
    this.model = model;
    this.view = 'main';
    this.confirmation = null;
    this.openState = true;
    this.overlay.classList.add('esm-open');
    this.render();
  }

  update(model: SystemMenuModel): void {
    this.model = model;
    if (this.openState) this.render();
  }

  close(): void {
    this.openState = false;
    this.view = 'main';
    this.confirmation = null;
    this.overlay.classList.remove('esm-open');
    this.overlay.innerHTML = '';
  }

  handleEscape(): boolean {
    if (!this.openState) return false;
    if (this.view !== 'main') {
      this.view = this.confirmation?.returnView ?? 'main';
      this.confirmation = null;
      this.render();
      return true;
    }
    this.callbacks.onResume();
    return true;
  }

  destroy(): void {
    this.overlay.removeEventListener('click', this.handleClick);
    this.overlay.remove();
  }

  private render(): void {
    if (!this.openState) return;
    switch (this.view) {
      case 'save':
        this.renderSave();
        break;
      case 'load':
        this.renderLoad();
        break;
      case 'confirm':
        this.renderConfirm();
        break;
      default:
        this.renderMain();
        break;
    }
    requestAnimationFrame(() => {
      this.overlay
        .querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    });
  }

  private renderMain(): void {
    const blocked = this.model.canSave
      ? ''
      : `<div class="esm-disabled-reason">保存暂不可用：${escapeHtml(this.model.saveBlockedReason ?? '当前状态不安全')}</div>`;
    this.overlay.innerHTML = `
      <section class="esm-panel esm-main-panel">
        <header class="esm-header">
          <span class="esm-kicker">ECHO // SESSION CONTROL</span>
          <h1>系统菜单</h1>
        </header>
        <div class="esm-actions">
          <button data-action="resume" class="esm-button esm-primary">继续游戏</button>
          <button data-action="show-save" class="esm-button" ${this.model.canSave ? '' : 'disabled'}>保存游戏</button>
          ${blocked}
          <button data-action="show-load" class="esm-button">读取存档</button>
          <button data-action="return-title" class="esm-button esm-danger">返回标题</button>
        </div>
        <footer>ESC // 关闭系统菜单</footer>
      </section>
    `;
  }

  private renderSave(): void {
    const manualEntries = this.model.slots.filter(
      (entry): entry is SaveSlotEntry & { slotId: ManualSaveSlotId } =>
        entry.slotId !== 'auto',
    );
    this.overlay.innerHTML = `
      <section class="esm-panel">
        <header class="esm-header">
          <span class="esm-kicker">WRITE MEMORY</span>
          <h1>保存游戏</h1>
        </header>
        <div class="esm-slot-list">
          ${manualEntries.map((entry) => this.renderSaveSlot(entry)).join('')}
        </div>
        <button data-action="back" class="esm-button esm-secondary">返回</button>
      </section>
    `;
  }

  private renderLoad(): void {
    this.overlay.innerHTML = `
      <section class="esm-panel">
        <header class="esm-header">
          <span class="esm-kicker">RESTORE MEMORY</span>
          <h1>读取存档</h1>
        </header>
        <div class="esm-slot-list">
          ${this.model.slots.map((entry) => this.renderLoadSlot(entry)).join('')}
        </div>
        <button data-action="back" class="esm-button esm-secondary">返回</button>
      </section>
    `;
  }

  private renderConfirm(): void {
    const confirmation = this.confirmation;
    if (!confirmation) {
      this.view = 'main';
      this.renderMain();
      return;
    }
    this.overlay.innerHTML = `
      <section class="esm-panel esm-confirm-panel">
        <header class="esm-header">
          <span class="esm-kicker">CONFIRM OPERATION</span>
          <h1>${escapeHtml(confirmation.title)}</h1>
        </header>
        <p class="esm-confirm-message">${escapeHtml(confirmation.message)}</p>
        <div class="esm-confirm-actions">
          <button data-action="cancel-confirm" class="esm-button esm-secondary">取消</button>
          <button data-action="confirm" class="esm-button esm-danger">${escapeHtml(confirmation.confirmLabel)}</button>
        </div>
      </section>
    `;
  }

  private renderSaveSlot(
    entry: SaveSlotEntry & { slotId: ManualSaveSlotId },
  ): string {
    const actionLabel = entry.status === 'ready' ? '覆盖' : '写入';
    return `
      <button class="esm-slot" data-action="save-slot" data-slot="${entry.slotId}">
        <strong>${escapeHtml(slotLabel(entry.slotId))}</strong>
        <span>${escapeHtml(saveSlotDescription(entry))}</span>
        <em>${actionLabel}</em>
      </button>
    `;
  }

  private renderLoadSlot(entry: SaveSlotEntry): string {
    const canLoad = entry.status === 'ready';
    const canDelete = entry.status !== 'empty';
    return `
      <article class="esm-slot-row">
        <button class="esm-slot" data-action="load-slot" data-slot="${entry.slotId}" ${canLoad ? '' : 'disabled'}>
          <strong>${escapeHtml(slotLabel(entry.slotId))}</strong>
          <span>${escapeHtml(saveSlotDescription(entry))}</span>
          <em>${canLoad ? '读取' : '—'}</em>
        </button>
        <button class="esm-delete" data-action="delete-slot" data-slot="${entry.slotId}" ${canDelete ? '' : 'disabled'} aria-label="删除${escapeHtml(slotLabel(entry.slotId))}">×</button>
      </article>
    `;
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();

    const action = button.dataset.action;
    if (action === 'resume') {
      this.callbacks.onResume();
      return;
    }
    if (action === 'show-save') {
      this.view = 'save';
      this.render();
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
    if (action === 'cancel-confirm') {
      this.view = this.confirmation?.returnView ?? 'main';
      this.confirmation = null;
      this.render();
      return;
    }
    if (action === 'confirm') {
      const pending = this.confirmation;
      this.confirmation = null;
      this.view = pending?.returnView ?? 'main';
      pending?.run();
      if (this.openState) this.render();
      return;
    }
    if (action === 'return-title') {
      this.askForConfirmation(
        '返回标题',
        '未保存的进度将会丢失。确定返回标题画面吗？',
        '返回标题',
        'main',
        () => this.callbacks.onReturnToTitle(),
      );
      return;
    }

    const slotId = parseSlotId(button.dataset.slot);
    if (!slotId) return;
    const entry = this.model.slots.find((item) => item.slotId === slotId);
    if (!entry) return;

    if (action === 'save-slot' && slotId !== 'auto') {
      if (entry.status === 'ready') {
        this.askForConfirmation(
          '覆盖存档',
          '覆盖该存档后，原有记录无法恢复。',
          '确认覆盖',
          'save',
          () => this.callbacks.onSave(slotId),
        );
      } else {
        this.callbacks.onSave(slotId);
      }
      return;
    }
    if (action === 'load-slot' && entry.status === 'ready') {
      this.askForConfirmation(
        '读取存档',
        '当前未保存进度将被替换。确定读取该存档吗？',
        '确认读取',
        'load',
        () => this.callbacks.onLoad(slotId),
      );
      return;
    }
    if (action === 'delete-slot' && entry.status !== 'empty') {
      this.askForConfirmation(
        '删除存档',
        '删除该存档后无法恢复。',
        '确认删除',
        'load',
        () => this.callbacks.onDelete(slotId),
      );
    }
  };

  private askForConfirmation(
    title: string,
    message: string,
    confirmLabel: string,
    returnView: Exclude<MenuView, 'confirm'>,
    run: () => void,
  ): void {
    this.confirmation = {
      title,
      message,
      confirmLabel,
      returnView,
      run,
    };
    this.view = 'confirm';
    this.render();
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
  if (documentRef.getElementById(SYSTEM_MENU_STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = SYSTEM_MENU_STYLE_ID;
  style.textContent = `
    .esm-overlay {
      position: fixed;
      inset: 0;
      z-index: 12000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      background:
        linear-gradient(135deg, rgba(1, 8, 15, .94), rgba(9, 2, 16, .91)),
        repeating-linear-gradient(0deg, transparent 0 3px, rgba(0, 243, 255, .035) 3px 4px);
      backdrop-filter: blur(7px);
      font-family: "Noto Sans SC", sans-serif;
      color: #e6fbff;
      pointer-events: none;
    }
    .esm-overlay.esm-open { display: flex; pointer-events: auto; }
    .esm-panel {
      width: min(720px, 94vw);
      max-height: 88vh;
      overflow: auto;
      box-sizing: border-box;
      padding: 30px;
      border: 1px solid rgba(0, 243, 255, .72);
      border-left: 4px solid #00f3ff;
      background: rgba(3, 13, 23, .96);
      box-shadow: 0 0 38px rgba(0, 243, 255, .18), inset 0 0 26px rgba(255, 42, 122, .05);
      clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
    }
    .esm-main-panel { width: min(560px, 94vw); }
    .esm-header { margin-bottom: 24px; border-bottom: 1px solid rgba(0, 243, 255, .28); }
    .esm-header h1 { margin: 6px 0 14px; font-size: clamp(28px, 5vw, 46px); letter-spacing: .16em; font-weight: 500; }
    .esm-kicker { color: #ff2a7a; font: 12px monospace; letter-spacing: .18em; }
    .esm-actions, .esm-slot-list { display: flex; flex-direction: column; gap: 11px; }
    .esm-button, .esm-slot, .esm-delete {
      border: 1px solid rgba(0, 243, 255, .38);
      background: rgba(0, 243, 255, .055);
      color: #ddfaff;
      font: 500 16px "Noto Sans SC", sans-serif;
      cursor: pointer;
      transition: border-color .15s ease, background .15s ease, transform .15s ease;
    }
    .esm-button { width: 100%; padding: 13px 16px; text-align: left; letter-spacing: .12em; }
    .esm-button:hover:not(:disabled), .esm-button:focus-visible,
    .esm-slot:hover:not(:disabled), .esm-slot:focus-visible {
      border-color: #00f3ff;
      background: rgba(0, 243, 255, .13);
      outline: none;
      transform: translateX(3px);
    }
    .esm-button:disabled, .esm-slot:disabled, .esm-delete:disabled { opacity: .34; cursor: not-allowed; }
    .esm-primary { border-color: #00f3ff; }
    .esm-danger { border-color: rgba(255, 42, 122, .58); color: #ff88b5; }
    .esm-secondary { margin-top: 16px; color: #9db5bc; }
    .esm-disabled-reason { margin: -5px 4px 4px; color: #d8a7b9; font-size: 12px; }
    .esm-slot-row { display: grid; grid-template-columns: 1fr 44px; gap: 8px; }
    .esm-slot {
      min-width: 0;
      padding: 13px 15px;
      display: grid;
      grid-template-columns: minmax(110px, .6fr) minmax(0, 1.8fr) auto;
      align-items: center;
      gap: 14px;
      text-align: left;
    }
    .esm-slot strong { color: #fff; }
    .esm-slot span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8eb1ba; font-size: 13px; }
    .esm-slot em { color: #00f3ff; font-style: normal; font-size: 12px; }
    .esm-delete { padding: 0; color: #ff5c97; font-size: 22px; }
    .esm-confirm-panel { width: min(520px, 94vw); }
    .esm-confirm-message { color: #b9cbd0; line-height: 1.8; }
    .esm-confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
    .esm-panel footer { margin-top: 24px; color: rgba(0, 243, 255, .38); font: 11px monospace; letter-spacing: .14em; }
    @media (max-width: 620px) {
      .esm-panel { padding: 22px 18px; }
      .esm-slot { grid-template-columns: 1fr auto; }
      .esm-slot span { grid-column: 1 / -1; grid-row: 2; }
    }
  `;
  documentRef.head.appendChild(style);
}
