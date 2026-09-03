// 索尔维入场视频转场：全屏视频 + 复古特工档案打字机 HUD（改编自用户提供的 cod.html）

interface MissionLine {
  text: string;
  delay: number;
  sizeClass: 'size-sm' | 'size-md' | 'size-lg';
}

interface SolvayTimer {
  id: number | null;
  dueAt: number;
  remainingMs: number;
  run: () => void;
}

const MISSION_DATA: MissionLine[] = [
  { text: '【 檔 案 年 份：一九二七 】', delay: 600, sizeClass: 'size-sm' },
  { text: '索 爾 維 會 議', delay: 1800, sizeClass: 'size-lg' },
  { text: '目標座標：比利時 · 布魯塞爾', delay: 3400, sizeClass: 'size-md' },
  { text: '核心議題：電 子 與 光 子', delay: 5600, sizeClass: 'size-md' },
  { text: '與會目標：探 尋 量 子 力 學 與 相 對 論 之 爭', delay: 7000, sizeClass: 'size-md' },
];

const SI_CSS = `
.si-layer { position: fixed; inset: 0; background: #080705; overflow: hidden; cursor: pointer; z-index: 400;
  font-family: 'FangSong','STFangsong','KaiTi','STKaiti','SimSun',serif; color: #e3d9c3;
  text-shadow: 0 0 3px rgba(227, 217, 195, 0.4), 1px 1px 2px rgba(0,0,0,0.9);
  background-image:
    radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.8) 100%),
    url('data:image/svg+xml;utf8,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22si-noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23si-noise)%22 opacity=%220.06%22/%3E%3C/svg%3E');
  transition: opacity 1.1s ease; }
.si-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1s ease; }
.si-vignette { position: absolute; inset: 0; background: radial-gradient(circle, rgba(0,0,0,0) 30%, rgba(0,0,0,0.95) 100%); pointer-events: none; }
.si-hud { position: absolute; left: 4%; bottom: 6%; display: flex; flex-direction: column; align-items: flex-start; z-index: 20; transform-origin: bottom left; }
.si-line { line-height: 1.2; margin: 4px 0; white-space: pre; }
.si-line.size-sm { font-size: 16px; opacity: 0.8; letter-spacing: 5px; margin-bottom: 8px; }
.si-line.size-lg { font-size: 48px; font-weight: bold; letter-spacing: 10px; margin: 6px 0 12px 0;
  text-shadow: 0 0 5px rgba(227,217,195,0.6), 2px 2px 3px rgba(0,0,0,0.9); }
.si-line.size-md { font-size: 22px; letter-spacing: 6px; }
.si-cursor { display: inline-block; width: 12px; height: 3px; background: #e3d9c3; vertical-align: bottom;
  margin-bottom: 6px; margin-left: 4px; box-shadow: 0 0 4px rgba(227,217,195,0.5); animation: si-blink 1.2s step-end infinite; }
.si-shake { animation: si-shake 0.08s; }
.si-film-out { animation: si-film-burn 2.5s forwards ease-in; }
.si-hint { position: absolute; right: 24px; bottom: 14px; font-size: 13px; letter-spacing: 3px;
  color: rgba(227,217,195,0.5); transition: opacity 0.8s; z-index: 21; opacity: 0; }
.si-fade-out { opacity: 0; }
@keyframes si-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes si-shake { 0%, 100% { transform: translate(0,0); } 25% { transform: translate(-1px,1px); }
  50% { transform: translate(1px,-1px); } 75% { transform: translate(-1px,-1px); } }
@keyframes si-film-burn {
  0% { opacity: 1; filter: sepia(0) blur(0); transform: scale(1); }
  40% { opacity: 0.9; filter: sepia(0.6) blur(1px) contrast(1.5); transform: scale(1.02); }
  70% { opacity: 0.6; filter: sepia(1) blur(4px) contrast(2); transform: scale(1.05) translateY(-5px); color: #c45b2d; }
  100% { opacity: 0; filter: blur(12px); transform: scale(1.1) translateY(-20px); }
}
@media (max-width: 768px) {
  .si-line.size-sm { font-size: 12px; }
  .si-line.size-md { font-size: 16px; }
  .si-line.size-lg { font-size: 28px; }
  .si-hud { left: 3%; bottom: 8%; }
  .si-cursor { height: 2px; width: 8px; margin-bottom: 3px; }
}
`;

class SolvayIntroLayer {
  readonly done: Promise<void>;
  private layer: HTMLElement;
  private video: HTMLVideoElement;
  private hud: HTMLElement;
  private hint: HTMLElement;
  private timers: SolvayTimer[] = [];
  private finished = false;
  private paused = false;
  private resolveFn: () => void = () => undefined;

  constructor(container: HTMLElement, src: string) {
    ensureStyle();
    this.done = new Promise<void>(r => { this.resolve = r; });

    const layer = document.createElement('div');
    this.layer = layer;
    layer.className = 'si-layer';
    layer.innerHTML = `
      <video class="si-video" src="${src}" playsinline preload="auto"></video>
      <div class="si-vignette"></div>
      <div class="si-hud"></div>
      <div class="si-hint">—— 點擊跳過 ——</div>
    `;
    container.appendChild(layer);
    this.video = layer.querySelector<HTMLVideoElement>('.si-video')!;
    this.hud = layer.querySelector<HTMLElement>('.si-hud')!;
    this.hint = layer.querySelector<HTMLElement>('.si-hint')!;

    this.video.addEventListener('ended', () => this.closeOut(), { once: true });
    this.schedule(() => this.closeOut(), 18200); // 兜底：视频元数据异常时保证收尾

    requestAnimationFrame(() => requestAnimationFrame(() => { this.video.style.opacity = '1'; }));
    void this.video.play().catch(() => {
      this.video.muted = true;
      void this.video.play().catch(() => undefined);
    });

    this.schedule(() => this.startHud(), 300);
    this.schedule(() => this.hud.classList.add('si-film-out'), 11500);
    this.schedule(() => { this.hud.innerHTML = ''; }, 14200);
    this.schedule(() => { this.hint.style.opacity = '1'; }, 1000);
    this.schedule(() => { this.hint.style.opacity = '0'; }, 13600);
  }

  private resolve = (): void => undefined;

  skip(): void {
    if (this.finished) return;
    this.hud.classList.add('si-film-out');
    this.video.style.transition = 'opacity 0.7s ease';
    this.video.style.opacity = '0';
    this.schedule(() => this.closeOut(), 700);
  }

  setPaused(paused: boolean): void {
    if (this.finished || paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.video.pause();
      const now = performance.now();
      for (const timer of this.timers) {
        if (timer.id !== null) clearTimeout(timer.id);
        timer.id = null;
        timer.remainingMs = Math.max(0, timer.dueAt - now);
      }
      return;
    }
    void this.video.play().catch(() => undefined);
    for (const timer of this.timers) this.armTimer(timer);
  }

  private closeOut(): void {
    if (this.finished) return;
    this.finished = true;
    this.clearTimers();
    this.hint.style.opacity = '0';
    this.video.style.transition = 'opacity 1.1s ease';
    this.video.style.opacity = '0';
    this.layer.classList.add('si-fade-out');
    this.layer.style.pointerEvents = 'none';
    this.clearTimers();
    setTimeout(() => this.resolve(), 950);
    setTimeout(() => this.layer.remove(), 1300);
    if (activeInstance === this) activeInstance = null;
  }

  private startHud(): void {
    MISSION_DATA.forEach(line => {
      this.schedule(() => this.typeLine(line), line.delay);
    });
  }

  private typeLine(line: MissionLine): void {
    const lineDiv = document.createElement('div');
    lineDiv.className = `si-line ${line.sizeClass}`;
    this.hud.appendChild(lineDiv);

    this.hud.querySelectorAll('.si-cursor').forEach(el => el.remove());
    const cursor = document.createElement('span');
    cursor.className = 'si-cursor';

    let charIndex = 0;
    const typeNextChar = (): void => {
      if (this.finished) return;
      if (charIndex < line.text.length) {
        const nextChar = line.text[charIndex];
        lineDiv.innerText = line.text.substring(0, charIndex) + nextChar;
        lineDiv.appendChild(cursor);

        this.hud.classList.remove('si-shake');
        void this.hud.offsetWidth;
        this.hud.classList.add('si-shake');

        charIndex++;
        let delay = 30 + Math.random() * 40;
        if (nextChar === ' ' || nextChar === '：' || nextChar === '【') delay += 50;
        this.schedule(typeNextChar, delay);
      } else {
        this.hud.classList.remove('si-shake');
      }
    };
    typeNextChar();
  }

  private clearTimers(): void {
    this.timers.forEach((timer) => {
      if (timer.id !== null) clearTimeout(timer.id);
    });
    this.timers = [];
  }

  private schedule(fn: () => void, ms: number): void {
    if (this.finished) return;
    const timer: SolvayTimer = {
      id: null,
      dueAt: 0,
      remainingMs: ms,
      run: fn,
    };
    this.timers.push(timer);
    if (!this.paused) this.armTimer(timer);
  }

  private armTimer(timer: SolvayTimer): void {
    if (this.finished || this.paused || timer.id !== null) return;
    timer.dueAt = performance.now() + timer.remainingMs;
    timer.id = window.setTimeout(() => {
      timer.id = null;
      this.timers = this.timers.filter((candidate) => candidate !== timer);
      if (!this.finished && !this.paused) timer.run();
    }, timer.remainingMs);
  }
}

let activeInstance: SolvayIntroLayer | null = null;

export function setSolvayIntroPaused(paused: boolean): void {
  activeInstance?.setPaused(paused);
}

export function playSolvayIntroVideo(container: HTMLElement, src: string = '/videos/solvay-enter.mp4'): Promise<void> {
  if (activeInstance) return activeInstance.done;
  const inst = new SolvayIntroLayer(container, src);
  activeInstance = inst;
  return inst.done.then(() => {
    if (activeInstance === inst) activeInstance = null;
  });
}

function ensureStyle(): void {
  if (!document.getElementById('si-hud-css')) {
    const st = document.createElement('style');
    st.id = 'si-hud-css';
    st.textContent = SI_CSS;
    document.head.appendChild(st);
  }
}
