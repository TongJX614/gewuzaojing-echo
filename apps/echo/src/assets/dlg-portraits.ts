/**
 * DLG 肖像加载器
 * 根据角色ID + 情绪加载对话立绘
 * 情绪类型: idle(正常) | happy(开心) | angry(生气) | sad(伤心) | surprise(惊讶)
 */

export type Emotion = 'idle' | 'happy' | 'angry' | 'sad' | 'surprise';

export interface DlgPortrait {
  img: HTMLImageElement;
  loaded: boolean;
}

/** 角色 → 贴图目录（仅有贴图的角色才注册） */
const DLG_DIRS: Record<string, string> = {
  su_ran: '/dlg/player',
  lin_xiao: '/dlg/linxiao',
  // du_weiming 无 DLG 贴图，不注册 → 对话时不显示立绘
};

/** 缓存: `${charId}_${emotion}` → Image */
const cache = new Map<string, HTMLImageElement>();

/** 尝试加载一张贴图，失败时 fallback 到 idle */
function loadOrFallback(charId: string, emotion: Emotion): HTMLImageElement {
  const dir = DLG_DIRS[charId];
  const key = `${charId}_${emotion}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const img = new Image();
  if (emotion !== 'idle') {
    // 非 idle 情绪：先尝试加载具体文件，加载失败时回退 idle
    img.src = `${dir}/${emotion}.png`;
    img.onerror = () => {
      // 回退到 idle
      const idleKey = `${charId}_idle`;
      const idleImg = cache.get(idleKey);
      if (idleImg) {
        cache.set(key, idleImg);
      }
    };
  } else {
    img.src = `${dir}/idle.png`;
  }
  img.onload = () => { /* loaded */ };
  cache.set(key, img);
  return img;
}

/** 预加载某角色立绘（idle 必先加载，其余情绪按需 fallback） */
export function preloadCharDlg(charId: string): void {
  if (!DLG_DIRS[charId]) return;
  // idle 先加载
  loadOrFallback(charId, 'idle');
}

/** 获取角色情绪立绘（已加载或 null） */
export function getDlgPortrait(charId: string, emotion: Emotion): HTMLImageElement | null {
  if (!DLG_DIRS[charId]) return null;
  const key = `${charId}_${emotion}`;
  let img = cache.get(key);
  // 如果该情绪未缓存，尝试加载（会自动 fallback 到 idle）
  if (!img) {
    img = loadOrFallback(charId, emotion);
  }
  // 如果加载失败且非 idle，回退到 idle
  if (emotion !== 'idle' && (!img.complete || img.naturalWidth === 0)) {
    const idleImg = cache.get(`${charId}_idle`);
    if (idleImg && idleImg.complete && idleImg.naturalWidth > 0) return idleImg;
  }
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}

/** 预加载全部角色立绘 */
export function preloadAllDlg(): void {
  for (const charId of Object.keys(DLG_DIRS)) {
    preloadCharDlg(charId);
  }
}
