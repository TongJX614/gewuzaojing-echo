// ============================================================
// 场景背景贴图加载器
// ============================================================

const cache = new Map<string, HTMLImageElement>();

/** 预加载背景贴图，返回 Promise */
export function loadBackgroundImage(path: string): Promise<HTMLImageElement> {
  const cached = cache.get(path);
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);

  return new Promise<HTMLImageElement>((resolve) => {
    const img = new Image();
    img.onload = () => {
      cache.set(path, img);
      resolve(img);
    };
    img.onerror = () => {
      console.warn(`[BgImage] Failed to load: ${path}`);
      resolve(img); // resolve anyway — renderer will skip incomplete images
    };
    img.src = path;
  });
}

/** 同步获取已加载的背景贴图（可能未完成） */
export function getBackgroundImage(path: string): HTMLImageElement | undefined {
  const img = cache.get(path);
  if (img && img.complete && img.naturalWidth > 0) return img;
  return undefined;
}
