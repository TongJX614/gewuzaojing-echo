// ============================================================
// CG 场景图片加载器（event_type2 使用）
// ============================================================

const cache = new Map<string, HTMLImageElement>();

/** 加载 CG 图片，返回 Promise<HTMLImageElement> */
export function loadCG(url: string): Promise<HTMLImageElement> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(url, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`CG load failed: ${url}`));
    img.src = url;
  });
}

/** 同步获取已缓存的 CG，未缓存返回 null */
export function getCG(url: string): HTMLImageElement | null {
  return cache.get(url) ?? null;
}
