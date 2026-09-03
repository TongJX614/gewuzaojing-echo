// ============================================================
// 主入口 — 标题画面 + 游戏初始化
// ============================================================

import { GameEngine } from './game/engine';
import { SCRIPT_META } from './data/storyline';
import { ALL_SCENES } from './scenes/scenes';
import {
  LocalSaveGameStore,
  type SaveEnvelope,
  type SaveGameStore,
  type SaveSlotId,
} from './systems/save-game';
import { TitleMenu } from './ui/title-menu';

const PENDING_LOAD_KEY = 'echo.pending-load';

export function initApp(): void {
  const app = document.getElementById('app');
  if (!app) {
    console.error('App element not found');
    return;
  }

  app.innerHTML = '';
  app.style.cssText = 'position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #0d1117;';
  const saveStore = new LocalSaveGameStore(window.localStorage);
  const pendingLoad = consumePendingLoad(saveStore);

  // 标题画面 — Canvas 动画 + 视频背景
  const titleScreen = document.createElement('div');
  titleScreen.style.cssText = `
    position: absolute; inset: 0; z-index: 200;
    background: transparent; cursor: crosshair; overflow: hidden;
    font-family: "Noto Sans SC", sans-serif;
  `;

  // --- 底层：视频背景 ---
  const bgVideo = document.createElement('video');
  bgVideo.src = '/videos/intro.mp4';
  bgVideo.autoplay = true;
  bgVideo.loop = true;
  bgVideo.muted = true;
  bgVideo.playsInline = true;
  bgVideo.style.cssText = `
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; z-index: 0; filter: brightness(0.45);
  `;
  titleScreen.appendChild(bgVideo);
  bgVideo.addEventListener('error', () => { bgVideo.style.display = 'none'; });

  // --- 暗色渐变遮罩 ---
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background: transparent;
  `;
  titleScreen.appendChild(overlay);

  // --- Canvas 层（噪点 + 标题文字 + glitch） ---
  const fxCanvas = document.createElement('canvas');
  fxCanvas.style.cssText = `position: absolute; inset: 0; z-index: 2; pointer-events: none;`;
  titleScreen.appendChild(fxCanvas);
  const fxCtx = fxCanvas.getContext('2d')!;

  // --- UI 层（右侧副标题 + 闪烁提示 + 底部版权） ---
  const uiLayer = document.createElement('div');
  uiLayer.style.cssText = `
    position: absolute; inset: 0; z-index: 3; pointer-events: none;
    display: flex; flex-direction: column; justify-content: center;
    align-items: flex-end; padding-right: 15%;
  `;

  // --- UI 层内容 ---
  // 占位间距（和 Canvas 主标题对齐）
  const spacer = document.createElement('div');
  spacer.style.cssText = 'height: 200px; margin-bottom: 32px;';
  uiLayer.appendChild(spacer);

  // 副标题信息
  const meta = document.createElement('div');
  meta.style.cssText = `
    color: #9ca3af; font-size: 18px; letter-spacing: 0.2em; margin-bottom: 64px;
    font-weight: 300; display: flex; align-items: center; gap: 16px;
  `;
  meta.innerHTML = `
    <span>${SCRIPT_META.genre}</span>
    <span style="color:#4b5563">|</span>
    <span>${SCRIPT_META.estimatedDuration}</span>
    <span style="color:#4b5563">|</span>
    <span>${SCRIPT_META.replayValue}</span>
  `;
  uiLayer.appendChild(meta);

  // 闪烁提示
  const pulseHint = document.createElement('div');
  pulseHint.style.cssText = `
    position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
    color: #ff2a7a; font-size: 20px; letter-spacing: 0.3em; font-weight: 100;
    text-shadow: 0 0 10px rgba(255,42,122,0.8);
    animation: title-pulse 2s infinite ease-in-out;
  `;
  pulseHint.textContent = '— 建立神经连接 —';
  uiLayer.appendChild(pulseHint);

  // 底部版权
  const footer = document.createElement('div');
  footer.style.cssText = `
    position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
    color: #374151; font-size: 14px; letter-spacing: 0.2em; font-weight: 300;
  `;
  footer.textContent = `${SCRIPT_META.version} | ${SCRIPT_META.license}`;
  uiLayer.appendChild(footer);

  titleScreen.appendChild(uiLayer);

  // --- 动画关键帧 ---
  const animStyle = document.createElement('style');
  animStyle.textContent = `
    @keyframes title-pulse { 0%,100% { opacity: 0.2; } 50% { opacity: 1; } }
  `;
  titleScreen.appendChild(animStyle);

  app.appendChild(titleScreen);

  // --- Canvas 动画引擎 ---
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let tw = 0, th = 0;
  const noiseCv = document.createElement('canvas');
  const noiseCtx = noiseCv.getContext('2d')!;

  function resizeFx(): void {
    tw = Math.max(1, window.innerWidth);
    th = Math.max(1, window.innerHeight);
    fxCanvas.width = tw * dpr;
    fxCanvas.height = th * dpr;
    fxCanvas.style.width = tw + 'px';
    fxCanvas.style.height = th + 'px';
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    noiseCv.width = Math.max(1, Math.floor(tw / 2));
    noiseCv.height = Math.max(1, Math.floor(th / 2));
    generateNoise();
  }

  // ===== 状态机 =====
  type FxState = 'IDLE' | 'OVERLOAD' | 'WIPE' | 'TERMINAL';
  let fxState: FxState = 'IDLE';
  let stateTimer = 0;
  let glitchIntensity = 0;
  let selectedSave: SaveEnvelope | undefined;

  // 鼠标移动产生电波干扰
  const onMouseMove = (): void => { glitchIntensity = Math.min(1, glitchIntensity + 0.15); };
  const beginStart = (initialSave?: SaveEnvelope): void => {
    if (fxState === 'IDLE') {
      selectedSave = initialSave;
      fxState = 'OVERLOAD';
      stateTimer = Date.now();
      uiLayer.style.transition = 'opacity 0.2s';
      uiLayer.style.opacity = '0';
      bgVideo.style.transition = 'opacity 0.2s';
      bgVideo.style.opacity = '0';
    }
  };
  window.addEventListener('mousemove', onMouseMove);

  const titleMenu = new TitleMenu(titleScreen, saveStore, {
    onContinue: (envelope) => beginStart(envelope),
    onNewGame: () => beginStart(),
    onLoad: (envelope) => beginStart(envelope),
    canLoad: (envelope) => isLoadableSave(envelope),
  });
  if (pendingLoad.error) titleMenu.showMessage(pendingLoad.error, 'error');
  if (pendingLoad.envelope) {
    requestAnimationFrame(() => beginStart(pendingLoad.envelope));
  }

  // ===== 噪点生成 =====
  function generateNoise(): void {
    if (noiseCv.width <= 0 || noiseCv.height <= 0) return;
    const imgData = noiseCtx.createImageData(noiseCv.width, noiseCv.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const val = Math.random() * 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 15; // 极淡
    }
    noiseCtx.putImageData(imgData, 0, 0);
  }

  // ===== 核心绘制 =====
  function drawFx(): void {
    if (fxState === 'TERMINAL') return;

    // 1. 清屏（带拖影）
    // 仅 WIPE 转场阶段清屏，其他状态完全透明让视频直接显示
    fxCtx.clearRect(0, 0, tw, th);
    if (fxState === 'WIPE') {
      fxCtx.fillStyle = '#03060c';
      fxCtx.fillRect(0, 0, tw, th);

      // 背景暗色光晕
      const gradient = fxCtx.createRadialGradient(tw * 0.2, th * 0.5, 0, tw * 0.2, th * 0.5, 600);
      gradient.addColorStop(0, 'rgba(0, 255, 255, 0.05)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      fxCtx.fillStyle = gradient;
      fxCtx.fillRect(0, 0, tw, th);
    }

    const time = Date.now();

    if (fxState === 'OVERLOAD') {
      drawErrorRain();
    }

    if (fxState === 'IDLE' || fxState === 'OVERLOAD') {
      drawGlitchText();
    }

    if (fxState === 'WIPE') {
      drawLaserWipe();
    }

    if ((fxState as FxState) !== 'TERMINAL') {
      drawCRTModifiers();
    }

    // 状态推进
    glitchIntensity *= 0.92;
    if (fxState === 'OVERLOAD' && time - stateTimer > 800) {
      fxState = 'WIPE';
      stateTimer = time;
    }
    if (fxState === 'WIPE' && time - stateTimer > 600) {
      fxState = 'TERMINAL';
      // 清理标题界面的事件监听器
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resizeFx);
      titleMenu.destroy();
      // 转场完成 → 进入游戏
      titleScreen.remove();
      startGame(app!, selectedSave, saveStore);
      return;
    }

    requestAnimationFrame(drawFx);
  }

  // ===== 故障透骨文本 =====
  function drawGlitchText(): void {
    const text = fxState === 'OVERLOAD' ? (Math.random() > 0.5 ? 'SYS.ERR' : '回 响') : '回 响';
    const fontSize = 140;
    fxCtx.font = `100 ${fontSize}px 'Noto Sans SC'`;
    fxCtx.textAlign = 'right';
    fxCtx.textBaseline = 'middle';

    const baseX = tw * 0.92;
    const baseY = th * 0.45;

    const gIntensity = fxState === 'OVERLOAD' ? 20 : 4;
    let colorCyan = '#00ffff';
    let colorMagenta = '#ff00ff';

    if (fxState === 'OVERLOAD') {
      colorCyan = '#ff0000';
      colorMagenta = '#ffffff';
    }

    const isGlitching = Math.random() < (fxState === 'OVERLOAD' ? 0.9 : 0.12);
    const offset = isGlitching ? Math.random() * 15 * gIntensity : 5;

    // 青色层（左移）
    fxCtx.fillStyle = colorCyan;
    fxCtx.globalCompositeOperation = 'screen';
    fxCtx.fillText(text, baseX - offset, baseY);

    // 品红层（右移）
    fxCtx.fillStyle = colorMagenta;
    fxCtx.fillText(text, baseX + offset, baseY);

    // 白色主层
    fxCtx.fillStyle = '#ffffff';
    fxCtx.fillText(text, baseX, baseY);
    fxCtx.globalCompositeOperation = 'source-over';

    // 像素切片撕裂
    if (isGlitching) {
      const sliceCount = fxState === 'OVERLOAD' ? 15 : 8;
      for (let i = 0; i < sliceCount; i++) {
        const sliceY = baseY - fontSize + Math.random() * fontSize * 1.5;
        const sliceHeight = 2 + Math.random() * 15;
        const sliceOffsetX = (Math.random() - 0.5) * 60 * gIntensity;

        fxCtx.save();
        fxCtx.beginPath();
        fxCtx.rect(0, sliceY, tw, sliceHeight);
        fxCtx.clip();

        fxCtx.clearRect(0, sliceY, tw, sliceHeight);

        fxCtx.globalCompositeOperation = 'screen';
        fxCtx.fillStyle = colorCyan;
        fxCtx.fillText(text, baseX - offset + sliceOffsetX, baseY);
        fxCtx.fillStyle = colorMagenta;
        fxCtx.fillText(text, baseX + offset + sliceOffsetX, baseY);

        fxCtx.globalCompositeOperation = 'source-over';
        fxCtx.fillStyle = '#ffffff';
        fxCtx.fillText(text, baseX + sliceOffsetX, baseY);

        fxCtx.restore();
      }
    }
  }

  // ===== 扫描线 + 噪点 + 暗角 =====
  function drawCRTModifiers(): void {
    const time = Date.now();
    // 噪点
    fxCtx.drawImage(noiseCv, 0, 0, noiseCv.width, noiseCv.height, 0, 0, tw, th);

    // 扫描线
    fxCtx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let y = 0; y < th; y += 4) {
      fxCtx.fillRect(0, y, tw, 2);
    }

    // 缓慢下移的大波纹
    const scanLineY = (time / 10) % th;
    fxCtx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    fxCtx.fillRect(0, scanLineY, tw, th * 0.1);

    // 边缘暗角 Vignette
    const vignette = fxCtx.createRadialGradient(tw / 2, th / 2, Math.min(tw, th) * 0.3, tw / 2, th / 2, Math.max(tw, th) * 0.7);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    fxCtx.fillStyle = vignette;
    fxCtx.fillRect(0, 0, tw, th);
  }

  // ===== OVERLOAD 状态下的错误代码雨 =====
  const ERROR_FRAGMENTS = [
    'ERR:0x', 'SYS.FAIL', '0xDEAD', 'BEEF', 'FATAL', 'CORRUPT',
    'NULL_PTR', 'STACK', 'OVERFLOW', 'SEGFAULT', '0xC0DE',
    'ABORT', 'PANIC', 'GPF', 'IRQ_0F', 'CRC_ERR', 'NMI',
    '0xFF', '0x00', 'CACHE_MISS', 'TLB_FLUSH', 'GURU',
  ];

  function drawErrorRain(): void {
    fxCtx.textBaseline = 'top';

    // 列宽随机化，产生参差错落感
    const cols = Math.ceil(tw / 80);
    for (let c = 0; c < cols; c++) {
      const x = c * 80 + 5 + (Math.random() - 0.5) * 20;
      const colHeight = th;
      const charSize = 10 + Math.floor(Math.random() * 4);
      const rowStep = charSize + 3;
      const rowCount = Math.ceil(colHeight / rowStep);
      const scrollOffset = (Date.now() / (20 + Math.random() * 40)) % (rowStep * 3);
      const baseY = -scrollOffset + Math.random() * th * 0.2;

      for (let r = 0; r < rowCount; r++) {
        const y = baseY + r * rowStep;
        if (y < -20 || y > th) continue;

        // 尾部渐隐 — 列底部越往下越淡
        const depthFade = 1 - (r / rowCount) * 0.7;
        const flicker = 0.4 + Math.random() * 0.6;
        const alpha = depthFade * flicker;
        if (alpha < 0.05) continue;

        // 头部高亮 — 每列最顶部一行特别亮（类似 Matrix 引领字符）
        const isHead = r === Math.floor((Date.now() / 80 + c * 7) % rowCount);
        const headBoost = isHead ? 1.0 : 0;

        // 内容：混合错误码 + 十六进制 + 二进制
        let text: string;
        const dice = Math.random();
        if (dice < 0.3) {
          const frag = ERROR_FRAGMENTS[Math.floor(Math.random() * ERROR_FRAGMENTS.length)];
          text = `${frag}`;
        } else if (dice < 0.6) {
          const hex = Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0');
          text = `0x${hex}`;
        } else if (dice < 0.8) {
          // 随机二进制串
          let bin = '';
          for (let b = 0; b < 8; b++) bin += Math.random() > 0.5 ? '1' : '0';
          text = bin;
        } else {
          // 短错误码 + 数字
          const code = Math.floor(Math.random() * 999).toString().padStart(3, '0');
          text = `E${code}`;
        }

        fxCtx.font = `${charSize}px monospace`;

        // 颜色：红色为主调（OVERLOAD），头部白色高亮，偶尔绿色闪
        if (headBoost > 0) {
          fxCtx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha + 0.3)})`;
          fxCtx.shadowColor = '#ff3333';
          fxCtx.shadowBlur = 8;
        } else if (Math.random() > 0.85) {
          fxCtx.fillStyle = `rgba(0, 255, 100, ${alpha * 0.7})`;
          fxCtx.shadowBlur = 0;
        } else {
          fxCtx.fillStyle = `rgba(255, ${40 + Math.floor(Math.random() * 60)}, ${40 + Math.floor(Math.random() * 40)}, ${alpha})`;
          fxCtx.shadowBlur = 0;
        }

        fxCtx.fillText(text, x, y);
      }
    }
    fxCtx.shadowBlur = 0;

    // 横向故障条 — 随机位置的彩色位移色带
    const barCount = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < barCount; b++) {
      const barY = Math.random() * th;
      const barH = 2 + Math.random() * 6;
      const shiftX = (Math.random() - 0.5) * 40;

      fxCtx.globalCompositeOperation = 'screen';
      fxCtx.fillStyle = `rgba(255, 0, 80, ${0.15 + Math.random() * 0.2})`;
      fxCtx.fillRect(shiftX, barY, tw, barH);
      fxCtx.fillStyle = `rgba(0, 255, 255, ${0.1 + Math.random() * 0.15})`;
      fxCtx.fillRect(-shiftX, barY + barH, tw, barH);
      fxCtx.globalCompositeOperation = 'source-over';
    }
  }

  // ===== 激光擦除转场 =====
  function drawLaserWipe(): void {
    const time = Date.now();
    const elapsed = time - stateTimer;
    const progress = Math.min(1, elapsed / 500);

    // 白色横线从上往下扫
    const lineY = progress * th;
    fxCtx.fillStyle = '#ffffff';
    fxCtx.fillRect(0, lineY - 2, tw, 4);

    // 上半部分逐渐变白
    fxCtx.fillStyle = `rgba(255, 255, 255, ${progress * 0.8})`;
    fxCtx.fillRect(0, 0, tw, lineY);

    // 残留噪点
    if (progress < 0.8) {
      fxCtx.drawImage(noiseCv, 0, 0, noiseCv.width, noiseCv.height, 0, lineY, tw, th - lineY);
    }
  }

  window.addEventListener('resize', resizeFx);
  resizeFx();

  // 启动渲染循环（字体加载后）
  if (document.fonts && !document.fonts.check('100 140px "Noto Sans SC"')) {
    document.fonts.ready.then(() => { requestAnimationFrame(drawFx); });
  } else {
    requestAnimationFrame(drawFx);
  }

}

function startGame(
  app: HTMLElement,
  initialSave: SaveEnvelope | undefined,
  saveStore: SaveGameStore,
): void {
  const container = document.createElement('div');
  container.id = 'game-container';
  container.style.cssText = `
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  `;

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.style.cssText = `
    image-rendering: pixelated; image-rendering: crisp-edges;
    cursor: crosshair;
  `;

  container.appendChild(canvas);
  app.appendChild(container);

  // ---- CRT Overlay Effects ----
  // Vignette
  const vignette = document.createElement('div');
  vignette.className = 'crt-vignette';
  container.appendChild(vignette);

  // Scanlines
  const scanOverlay = document.createElement('div');
  scanOverlay.className = 'crt-scanlines';
  container.appendChild(scanOverlay);

  // CRT flicker
  const flicker = document.createElement('div');
  flicker.className = 'crt-flicker';
  container.appendChild(flicker);

  // Corner reticles
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  for (const c of corners) {
    const r = document.createElement('div');
    r.className = 'crt-reticle ' + c;
    container.appendChild(r);
  }

  // 底部操作提示
  const hint = document.createElement('div');
  hint.style.cssText = `
    position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
    color: #8b949e; font-size: 11px; font-family: "Noto Sans SC", sans-serif;
    pointer-events: none; z-index: 10;
  `;
  hint.textContent = '点击地面移动 | 靠近目标互动 | I 背包 | Tab 战术终端 | Esc 系统菜单';
  app.appendChild(hint);

  const engine = new GameEngine(canvas, container, {
    initialSave,
    saveStore,
    onLoadRequested: (slotId) => {
      if (!queuePendingLoad(slotId)) {
        window.alert('浏览器拒绝了临时读档请求，请检查站点存储权限。');
        return;
      }
      engine.dispose();
      window.location.reload();
    },
    onReturnToTitle: () => {
      clearPendingLoad();
      engine.dispose();
      window.location.reload();
    },
  });
  void engine.start();
}

function consumePendingLoad(
  saveStore: SaveGameStore,
): { envelope?: SaveEnvelope; error?: string } {
  let pending: string | null = null;
  try {
    pending = window.sessionStorage.getItem(PENDING_LOAD_KEY);
    window.sessionStorage.removeItem(PENDING_LOAD_KEY);
  } catch {
    return { error: '无法读取临时存档指令，请检查站点存储权限。' };
  }
  if (pending === null) return {};
  const slotId = parseSaveSlotId(pending);
  if (!slotId) return { error: '读档指令无效，已返回标题画面。' };
  const envelope = saveStore.read(slotId);
  return envelope && isLoadableSave(envelope)
    ? { envelope }
    : { error: '目标存档不存在、已损坏或场景不可用，已返回标题画面。' };
}

function queuePendingLoad(slotId: SaveSlotId): boolean {
  try {
    window.sessionStorage.setItem(PENDING_LOAD_KEY, slotId);
    return true;
  } catch {
    return false;
  }
}

function clearPendingLoad(): void {
  try {
    window.sessionStorage.removeItem(PENDING_LOAD_KEY);
  } catch {
    // 页面仍会返回标题；这里只避免存储受限时阻断导航。
  }
}

function parseSaveSlotId(value: string): SaveSlotId | null {
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

function isLoadableSave(envelope: SaveEnvelope): boolean {
  return Boolean(ALL_SCENES[envelope.snapshot.scene.id]);
}
