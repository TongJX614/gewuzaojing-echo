// ============================================================
// 像素渲染引擎
// 低分辨率画布 + 整数倍放大，关闭平滑
// ============================================================

import { PALETTE } from '../assets/palettes';
import { TILE_COLORS } from '../assets/tilesets';
import { getSpriteCanvas } from '../assets/sprites';

export interface RenderConfig {
  /** 逻辑分辨率宽（tile 数） */
  viewWidth: number;
  /** 逻辑分辨率高（tile 数） */
  viewHeight: number;
  /** 每个 tile 的像素尺寸 */
  tileSize: number;
  /** 精灵缩放倍率 */
  spriteScale: number;
}

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  viewWidth: 20,
  viewHeight: 12,
  tileSize: 16,
  spriteScale: 2,
};

export class PixelRenderer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public scale: number = 1;
  public config: RenderConfig;

  constructor(canvas: HTMLCanvasElement, config: RenderConfig = DEFAULT_RENDER_CONFIG) {
    this.canvas = canvas;
    this.config = config;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 调整画布尺寸以适配窗口 */
  resize(containerW: number, containerH: number): void {
    const { viewWidth, viewHeight, tileSize } = this.config;
    const logicalW = viewWidth * tileSize;
    const logicalH = viewHeight * tileSize;

    const scaleX = Math.max(1, containerW / logicalW);
    const scaleY = Math.max(1, containerH / logicalH);
    const scale = Math.min(scaleX, scaleY);
    this.scale = scale;

    const cssW = Math.round(logicalW * scale);
    const cssH = Math.round(logicalH * scale);

    this.canvas.width = cssW;
    this.canvas.height = cssH;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.style.imageRendering = 'pixelated';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.scale(scale, scale);
  }

  /** 清屏 */
  clear(color: string = PALETTE.bgDeep): void {
    this.ctx.fillStyle = color;
    const { viewWidth, viewHeight, tileSize } = this.config;
    this.ctx.fillRect(0, 0, viewWidth * tileSize, viewHeight * tileSize);
  }

  /** 渲染 tile 地图（仅可视区域） */
  renderMap(
    mapData: string[][],
    cameraX: number,
    cameraY: number,
  ): void {
    const { viewWidth, viewHeight, tileSize } = this.config;
    const mapH = mapData.length;
    const mapW = mapData[0].length;

    for (let vy = 0; vy < viewHeight; vy++) {
      for (let vx = 0; vx < viewWidth; vx++) {
        const mx = cameraX + vx;
        const my = cameraY + vy;

        if (mx < 0 || mx >= mapW || my < 0 || my >= mapH) {
          this.ctx.fillStyle = PALETTE.bgDeep;
          this.ctx.fillRect(vx * tileSize, vy * tileSize, tileSize, tileSize);
          continue;
        }

        const tile = mapData[my][mx];
        const color = TILE_COLORS[tile] ?? PALETTE.bgDeep;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(vx * tileSize, vy * tileSize, tileSize, tileSize);
      }
    }
  }

  /** 渲染背景贴图（替代 tile 地图作为场景背景） */
  renderBackgroundImage(
    img: HTMLImageElement,
    mapWidth: number,
    mapHeight: number,
    cameraX: number,
    cameraY: number,
  ): void {
    const { tileSize, viewWidth, viewHeight } = this.config;
    const logicalW = viewWidth * tileSize;
    const logicalH = viewHeight * tileSize;

    // Scale image to cover the full map area in logical coordinates
    const mapPixelW = mapWidth * tileSize;
    const mapPixelH = mapHeight * tileSize;

    // Calculate source rect (camera offset) and dest rect
    const srcX = (cameraX * tileSize * img.naturalWidth) / mapPixelW;
    const srcY = (cameraY * tileSize * img.naturalHeight) / mapPixelH;
    const srcW = (logicalW * img.naturalWidth) / mapPixelW;
    const srcH = (logicalH * img.naturalHeight) / mapPixelH;

    this.ctx.drawImage(
      img,
      srcX, srcY, srcW, srcH,
      0, 0, logicalW, logicalH,
    );
  }

  /** 渲染精灵（像素画） */
  renderSprite(
    spriteKey: string,
    worldX: number,
    worldY: number,
    cameraX: number,
    cameraY: number,
    scale?: number,
    alpha?: number,
  ): void {
    const spriteCvs = getSpriteCanvas(spriteKey);
    const { tileSize } = this.config;
    const s = scale ?? this.config.spriteScale;

    const screenX = (worldX - cameraX) * tileSize;
    const screenY = (worldY - cameraY) * tileSize;

    if (alpha !== undefined && alpha < 1) {
      this.ctx.globalAlpha = alpha;
    }

    this.ctx.drawImage(
      spriteCvs,
      0, 0, spriteCvs.width, spriteCvs.height,
      screenX, screenY, spriteCvs.width * s, spriteCvs.height * s,
    );

    if (alpha !== undefined && alpha < 1) {
      this.ctx.globalAlpha = 1;
    }
  }

  /** 渲染浮动文字 */
  renderText(
    text: string,
    screenX: number,
    screenY: number,
    color: string = PALETTE.uiText,
    fontSize: number = 8,
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    this.ctx.fillText(text, screenX, screenY);
  }

  /** 渲染矩形 */
  renderRect(
    screenX: number,
    screenY: number,
    w: number,
    h: number,
    color: string,
    alpha?: number,
  ): void {
    if (alpha !== undefined) this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(screenX, screenY, w, h);
    if (alpha !== undefined) this.ctx.globalAlpha = 1;
  }

  /** 渲染边框矩形 */
  renderRectBorder(
    screenX: number,
    screenY: number,
    w: number,
    h: number,
    color: string,
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(screenX, screenY, w, h);
  }

  /** 渲染图片精灵（用于玩家贴图等外部图片资源） */
  renderImage(
    image: HTMLImageElement,
    worldX: number,
    worldY: number,
    cameraX: number,
    cameraY: number,
    drawWidth: number,
    drawHeight: number,
    alpha?: number,
  ): void {
    const { tileSize } = this.config;

    // 世界坐标转屏幕逻辑坐标，图片底部对齐 tile 底部
    const screenX = (worldX - cameraX) * tileSize + (tileSize - drawWidth) / 2;
    const screenY = (worldY - cameraY) * tileSize + tileSize - drawHeight;

    if (alpha !== undefined && alpha < 1) {
      this.ctx.globalAlpha = alpha;
    }

    this.ctx.drawImage(
      image,
      0, 0, image.naturalWidth, image.naturalHeight,
      screenX, screenY, drawWidth, drawHeight,
    );

    if (alpha !== undefined && alpha < 1) {
      this.ctx.globalAlpha = 1;
    }
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
