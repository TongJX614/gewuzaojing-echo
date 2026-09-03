import { EMBED_MESSAGE, createEchoMessage, isQuillForgeMessage } from './embed-contract';

const MINIGAMES: Record<string, { title: string; src: string }> = {
  'slit-rebuttal': {
    title: '量子辩驳：让狭缝作证',
    src: '/minigame/slit-rebuttal.html',
  },
  'photon-box': {
    title: '量子辩驳：光子箱',
    src: '/minigame/photon-box.html',
  },
};

const WEB_EXPERIENCE_STYLE_ID = 'echo-web-experience-style';

export interface WebExperienceDefinition {
  id: 'quillforge-webui';
  title: string;
  src: string;
  readyTimeoutMs?: number;
}

export class MinigameOverlay {
  private container: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private frame: HTMLIFrameElement | null = null;
  private handler: ((e: MessageEvent) => void) | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private webExit: (() => void) | null = null;
  private webDefinition: WebExperienceDefinition | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(private readonly onPauseRequest?: () => void) {}

  get isOpen(): boolean {
    return this.container !== null;
  }

  open(id: string, onWin: () => void): void {
    const def = MINIGAMES[id];
    if (!def || this.container) {
      return;
    }

    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.92)',
      zIndex: '9999',
    });

    const frame = document.createElement('iframe');
    this.frame = frame;
    frame.src = def.src;
    frame.title = def.title;
    Object.assign(frame.style, {
      width: '100%',
      height: '100%',
      border: 'none',
      overflow: 'hidden',
    });

    this.container.appendChild(frame);
    document.body.appendChild(this.container);

    this.handler = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const data = e.data as { type?: string; id?: string } | null;
      if (!data) return;
      if (isQuillForgeMessage(data) && data.type === EMBED_MESSAGE.pauseRequest) {
        this.onPauseRequest?.();
        return;
      }
      if (data.type !== 'minigame:complete' || data.id !== id) {
        return;
      }
      this.close();
      onWin();
    };
    window.addEventListener('message', this.handler);
  }

  openWebExperience(
    definition: WebExperienceDefinition,
    onExit: () => void,
  ): void {
    if (this.container) return;

    ensureWebExperienceStyle(document);
    this.webDefinition = definition;
    this.webExit = onExit;
    this.container = document.createElement('div');
    this.container.dataset.overlayKind = 'web-experience';
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      display: 'grid',
      gridTemplateRows: '42px 1fr',
      background: '#010409',
      zIndex: '9999',
    });
    this.container.innerHTML = `
      <header data-role="chrome">
        <span data-role="status">正在接入 ${escapeHtml(definition.title)}…</span>
        <button type="button" data-action="exit">退出体验</button>
      </header>
      <section data-role="viewport">
        <div data-role="loading">正在连接 QuillForge…</div>
      </section>`;

    const viewport =
      this.container.querySelector<HTMLElement>('[data-role="viewport"]');
    this.statusEl =
      this.container.querySelector<HTMLElement>('[data-role="status"]');
    if (!viewport) {
      this.close();
      throw new Error('Web experience viewport was not created.');
    }

    const frame = document.createElement('iframe');
    this.frame = frame;
    frame.src = definition.src;
    frame.title = definition.title;
    frame.allow = 'autoplay; fullscreen';
    Object.assign(frame.style, {
      width: '100%',
      height: '100%',
      border: '0',
    });
    viewport.appendChild(frame);
    this.container.addEventListener('click', this.handleWebAction);
    document.body.appendChild(this.container);
    this.installWebMessageHandler(frame);
    this.armReadyTimeout(definition.readyTimeoutMs ?? 12000);
  }

  private installWebMessageHandler(frame: HTMLIFrameElement): void {
    this.handler = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      if (!isQuillForgeMessage(e.data)) return;
      if (e.data.type === EMBED_MESSAGE.pauseRequest) {
        this.onPauseRequest?.();
        return;
      }
      if (e.data.type === EMBED_MESSAGE.quillforgeReady) {
        this.markWebReady();
      }
    };
    window.addEventListener('message', this.handler);
  }

  private armReadyTimeout(delayMs: number): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = setTimeout(() => this.showWebFailure(), delayMs);
  }

  private markWebReady(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.container?.querySelector('[data-role="loading"]')?.remove();
    this.container?.querySelector('[data-role="failure"]')?.remove();
    if (this.statusEl) this.statusEl.textContent = '项目二 · 世界编织';
  }

  private showWebFailure(): void {
    this.readyTimer = null;
    const viewport =
      this.container?.querySelector<HTMLElement>('[data-role="viewport"]');
    if (!viewport) return;
    viewport.querySelector('[data-role="loading"]')?.remove();
    viewport.querySelector('[data-role="failure"]')?.remove();
    if (this.statusEl) this.statusEl.textContent = '项目二连接未完成';
    viewport.insertAdjacentHTML(
      'beforeend',
      `<div data-role="failure">
        <strong>QuillForge 未响应</strong>
        <span>确认本地 8050 服务已经启动后重试。</span>
        <button type="button" data-action="retry">重试连接</button>
        <button type="button" data-action="exit">返回实验室</button>
      </div>`,
    );
  }

  private readonly handleWebAction = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action =
      target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'retry' && this.frame && this.webDefinition) {
      this.container?.querySelector('[data-role="failure"]')?.remove();
      this.container
        ?.querySelector('[data-role="viewport"]')
        ?.insertAdjacentHTML(
          'beforeend',
          '<div data-role="loading">正在重新连接 QuillForge…</div>',
        );
      if (this.statusEl) this.statusEl.textContent = '正在重新接入项目二…';
      this.frame.src = this.webDefinition.src;
      this.armReadyTimeout(this.webDefinition.readyTimeoutMs ?? 12000);
      return;
    }
    if (action === 'exit') {
      const callback = this.webExit;
      this.close();
      callback?.();
    }
  };

  setPaused(paused: boolean): void {
    this.frame?.contentWindow?.postMessage(
      createEchoMessage(paused ? EMBED_MESSAGE.pause : EMBED_MESSAGE.resume),
      '*',
    );
  }

  close(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.container?.removeEventListener('click', this.handleWebAction);
    if (this.handler) {
      window.removeEventListener('message', this.handler);
      this.handler = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.frame = null;
    this.webExit = null;
    this.webDefinition = null;
    this.statusEl = null;
  }
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return value.replace(
    /[&<>"']/gu,
    (character) => entities[character] ?? character,
  );
}

function ensureWebExperienceStyle(documentRef: Document): void {
  if (documentRef.getElementById(WEB_EXPERIENCE_STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = WEB_EXPERIENCE_STYLE_ID;
  style.textContent = `
    [data-overlay-kind="web-experience"] [data-role="chrome"] {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      color: #dffaff;
      background: rgba(1, 10, 18, .94);
      border-bottom: 1px solid rgba(0, 243, 255, .42);
      font: 12px "Noto Sans SC", sans-serif;
    }
    [data-overlay-kind="web-experience"] [data-role="chrome"] button {
      border: 1px solid rgba(255, 42, 122, .65);
      background: rgba(255, 42, 122, .12);
      color: #ff91b8;
      padding: 5px 12px;
      cursor: pointer;
    }
    [data-overlay-kind="web-experience"] [data-role="viewport"] {
      position: relative;
      min-height: 0;
      overflow: hidden;
    }
    [data-overlay-kind="web-experience"] iframe {
      display: block;
    }
    [data-overlay-kind="web-experience"] [data-role="loading"],
    [data-overlay-kind="web-experience"] [data-role="failure"] {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 12px;
      color: #dffaff;
      background: #010409;
      font-family: "Noto Sans SC", sans-serif;
    }
    [data-overlay-kind="web-experience"] [data-role="failure"] button {
      min-width: 140px;
      padding: 8px 14px;
      border: 1px solid rgba(0, 243, 255, .42);
      color: #dffaff;
      background: rgba(0, 243, 255, .08);
      cursor: pointer;
    }
  `;
  documentRef.head.appendChild(style);
}
