/**
 * 物品类型定义
 * Mod 友好：增删 ItemDef 即可扩展物品
 */
import { ITEM_PALETTE } from './palette';

export type ItemType = 'consumable' | 'key_item' | 'material' | 'equipment' | 'unknown';

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  typeLabel: string;          // 显示用类型标签，如 "消耗品 | 生存物资"
  desc: string;               // 功能描述
  lore: string;               // 世界观背景故事
  pixels: string[];           // 16×16 ASCII 像素图
  stackable: boolean;         // 是否可堆叠
  maxStack: number;           // 最大堆叠数
}

/** 将像素 ASCII 数据渲染到 Canvas */
export function renderPixelArt(ctx: CanvasRenderingContext2D, pixels: string[], palette: Record<string, string | null> = ITEM_PALETTE): void {
  ctx.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    const row = pixels[y];
    if (!row) continue;
    for (let x = 0; x < 16; x++) {
      const char = row[x];
      const color = palette[char];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}
