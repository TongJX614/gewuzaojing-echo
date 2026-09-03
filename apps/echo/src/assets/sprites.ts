// ============================================================
// 程序化像素精灵定义
// 每个精灵为二维颜色索引数组（引用 PALETTE key 或 hex）
// Mod 友好：替换或新增精灵定义即可换装
// ============================================================

import { PALETTE } from './palettes';

type Color = string; // hex or PALETTE key

// 通用透明色标记
const _ = '';

// ---- 苏然（主角）16×16 ----
const SU_RAN_IDLE: Color[][] = [
  [_,_,_,_,_, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, _,_,_,_,_],
  [_,_,_, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, _,_,_,_],
  [_,_, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, _,_,_],
  [_,_, PALETTE.playerHair, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerHair, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerHair, PALETTE.playerHair, _,_,_],
  [_,_, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, _,_,_],
  [_,_, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.neonCyan, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.neonCyan, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, _,_,_],
  [_,_, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, _,_,_],
  [_,_,_, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, PALETTE.playerSkin, _,_,_,_],
  [_,_,_,_, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, _,_,_,_],
  [_,_,_, PALETTE.playerCoat, PALETTE.playerCoatLt, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoatLt, PALETTE.playerCoat, PALETTE.playerCoat, _,_,_,_],
  [_,_,_, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, _,_,_,_],
  [_,_,_, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, PALETTE.playerCoat, _,_,_,_],
  [_,_,_,_, PALETTE.playerPants, PALETTE.playerPants, PALETTE.playerPants, _,_, PALETTE.playerPants, PALETTE.playerPants, PALETTE.playerPants, _,_,_,_],
  [_,_,_,_, PALETTE.playerPants, PALETTE.playerPants, PALETTE.playerPants, _,_, PALETTE.playerPants, PALETTE.playerPants, PALETTE.playerPants, _,_,_,_],
  [_,_,_,_, PALETTE.playerPants, PALETTE.playerPants, _,_,_,_, PALETTE.playerPants, PALETTE.playerPants, _,_,_,_],
  [_,_,_,_, PALETTE.playerPants, PALETTE.playerPants, _,_,_,_, PALETTE.playerPants, PALETTE.playerPants, _,_,_,_],
];

// 行走帧（简单左右脚交替）
const SU_RAN_WALK1 = SU_RAN_IDLE.map((row, y) =>
  y === 14 ? row.map((c, x) => (x === 4 || x === 5) ? _ : c) : y === 15 ? row.map((c, x) => (x === 10 || x === 11) ? _ : c) : row
);
const SU_RAN_WALK2 = SU_RAN_IDLE.map((row, y) =>
  y === 14 ? row.map((c, x) => (x === 10 || x === 11) ? _ : c) : y === 15 ? row.map((c, x) => (x === 4 || x === 5) ? _ : c) : row
);

// ---- 林晓（AI全息投影）16×16 ----
const LIN_XIAO_IDLE: Color[][] = [
  [_,_,_,_,_,_, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, _,_,_,_,_,_],
  [_,_,_,_, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, _,_,_,_,_],
  [_,_,_, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, _,_,_,_],
  [_,_,_, PALETTE.npcXiaoHair, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoHair, PALETTE.npcXiaoHair, _,_,_,_],
  [_,_,_, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, _,_,_,_],
  [_,_,_, PALETTE.npcXiaoSkin, PALETTE.neonCyan, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.neonCyan, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, _,_,_,_],
  [_,_,_, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, _,_,_,_],
  [_,_,_,_, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, PALETTE.npcXiaoSkin, _,_,_,_],
  [_,_,_,_,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_,_,_,_],
  [_,_,_,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_,_,_,_],
  [_,_,_,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_,_,_,_],
  [_,_,_,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_,_,_,_],
  [_,_,_,_,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_,_,_,_],
  [_,_,_,_,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_,_,_,_],
  [_,_,_,_,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_, PALETTE.npcXiaoDress, PALETTE.npcXiaoDress, _,_,_,_,_],
  [_,_,_,_,_, PALETTE.npcXiaoDress, _,_,_,_, _, PALETTE.npcXiaoDress, _,_,_,_,_],
];

// ---- 杜维明 16×16 ----
const DU_WEIMING_IDLE: Color[][] = [
  [_,_,_,_,_, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, _,_,_,_,_],
  [_,_,_, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, _,_,_,_],
  [_,_, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, _,_,_],
  [_,_, PALETTE.npcDuHair, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuHair, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuHair, PALETTE.npcDuHair, _,_,_],
  [_,_, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, _,_,_],
  [_,_, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, _,_,_],
  [_,_,_, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, PALETTE.npcDuSkin, _,_,_,_],
  [_,_,_,_, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, _,_,_,_],
  [_,_,_, PALETTE.npcDuSuit, PALETTE.npcDuSuitLt, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuitLt, PALETTE.npcDuSuit, PALETTE.npcDuSuit, _,_,_,_],
  [_,_,_, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, _,_,_,_],
  [_,_,_, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, PALETTE.npcDuSuit, _,_,_,_],
  [_,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_, PALETTE.npcDuPants, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_],
  [_,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_, PALETTE.npcDuPants, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_],
  [_,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_],
  [_,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_],
  [_,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_, PALETTE.npcDuPants, PALETTE.npcDuPants, _,_,_,_],
];

// ---- 小道具精灵 8×8 ----
const ITEM_GLOW: Color[][] = [
  [_,_,_, PALETTE.itemGlow, PALETTE.itemGlow, _,_,_,_],
  [_,_, PALETTE.itemGlow, PALETTE.neonAmber, PALETTE.neonAmber, PALETTE.itemGlow, _,_,_],
  [_, PALETTE.itemGlow, PALETTE.neonAmber, '#ffffff', '#ffffff', PALETTE.neonAmber, PALETTE.itemGlow, _,_],
  [ PALETTE.itemGlow, PALETTE.neonAmber, '#ffffff', '#ffffff', '#ffffff', '#ffffff', PALETTE.neonAmber, PALETTE.itemGlow],
  [ PALETTE.itemGlow, PALETTE.neonAmber, '#ffffff', '#ffffff', '#ffffff', '#ffffff', PALETTE.neonAmber, PALETTE.itemGlow],
  [_, PALETTE.itemGlow, PALETTE.neonAmber, '#ffffff', '#ffffff', PALETTE.neonAmber, PALETTE.itemGlow, _,_],
  [_,_, PALETTE.itemGlow, PALETTE.neonAmber, PALETTE.neonAmber, PALETTE.itemGlow, _,_,_],
  [_,_,_, PALETTE.itemGlow, PALETTE.itemGlow, _,_,_,_],
];

const ITEM_KEY: Color[][] = [
  [_,_,_,_, PALETTE.itemKey, PALETTE.itemKey, _,_,_],
  [_,_,_, PALETTE.itemKey, PALETTE.neonGreen, PALETTE.itemKey, _,_,_],
  [_,_,_,_, PALETTE.itemKey, PALETTE.itemKey, _,_,_],
  [_,_,_,_,_, PALETTE.itemKey, _,_,_],
  [_,_,_,_,_, PALETTE.itemKey, PALETTE.itemKey, _,_],
  [_,_,_,_,_, PALETTE.itemKey, _,_,_],
  [_,_,_,_, PALETTE.itemKey, PALETTE.itemKey, _,_,_],
  [_,_,_, PALETTE.itemKey, PALETTE.itemKey, _,_,_,_],
];

const ITEM_DOC: Color[][] = [
  [_, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, _,],
  [ PALETTE.itemDoc, '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', PALETTE.itemDoc, PALETTE.itemDoc,],
  [ PALETTE.itemDoc, '#ffffff', PALETTE.uiTextDim, '#ffffff', PALETTE.uiTextDim, '#ffffff', PALETTE.itemDoc, PALETTE.itemDoc,],
  [ PALETTE.itemDoc, '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', PALETTE.itemDoc, PALETTE.itemDoc,],
  [ PALETTE.itemDoc, '#ffffff', PALETTE.uiTextDim, '#ffffff', PALETTE.uiTextDim, '#ffffff', PALETTE.itemDoc, PALETTE.itemDoc,],
  [ PALETTE.itemDoc, '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', PALETTE.itemDoc, PALETTE.itemDoc,],
  [ PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc,],
  [_, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, PALETTE.itemDoc, _,],
];

// ---- 方向箭头指示器（场景过渡） 8×8 ----
const P = PALETTE.neonCyan;
const ARROW_RIGHT: Color[][] = [
  [_,_,_,P, P,P,_,_],
  [_,_,_,_, P,P,P,_],
  [_,_,_,_, P,P,P,_],
  [P,P,P,P, P,P,P,P],
  [P,P,P,P, P,P,P,P],
  [_,_,_,_, P,P,P,_],
  [_,_,_,_, P,P,P,_],
  [_,_,_,P, P,P,_,_],
];
const ARROW_LEFT: Color[][] = ARROW_RIGHT.map(row => [...row].reverse());
const ARROW_DOWN: Color[][] = [
  [_,_,P,P, P,P,_,_],
  [_,_,P,P, P,P,_,_],
  [_,_,_,P, P,_,_,_],
  [_,_,_,P, P,_,_,_],
  [_,_,_,P, P,_,_,_],
  [_,_,P,P, P,P,_,_],
  [_,P,P,P, P,P,P,_],
  [P,P,P,P, P,P,P,P],
];
const ARROW_UP: Color[][] = ARROW_DOWN.slice().reverse();

// ---- 交互提示图标 8×8 ----
const INTERACT_ICON: Color[][] = [
  [_,_,_, PALETTE.neonCyan, PALETTE.neonCyan, _,_,_,_],
  [_,_, PALETTE.neonCyan, PALETTE.neonCyan, PALETTE.neonCyan, PALETTE.neonCyan, _,_,_],
  [_, PALETTE.neonCyan, PALETTE.neonCyan, _,_, PALETTE.neonCyan, PALETTE.neonCyan, _,_],
  [ PALETTE.neonCyan, PALETTE.neonCyan, _,_,_,_, PALETTE.neonCyan, PALETTE.neonCyan],
  [ PALETTE.neonCyan, PALETTE.neonCyan, _,_,_,_, PALETTE.neonCyan, PALETTE.neonCyan],
  [_, PALETTE.neonCyan, PALETTE.neonCyan, _,_, PALETTE.neonCyan, PALETTE.neonCyan, _,_],
  [_,_, PALETTE.neonCyan, PALETTE.neonCyan, PALETTE.neonCyan, PALETTE.neonCyan, _,_,_],
  [_,_,_, PALETTE.neonCyan, PALETTE.neonCyan, _,_,_,_],
];

// ============================================================
// 精灵注册表
// ============================================================
export const SPRITES: Record<string, Color[][]> = {
  player_idle:  SU_RAN_IDLE,
  player_walk1: SU_RAN_WALK1,
  player_walk2: SU_RAN_WALK2,
  npc_xiao:     LIN_XIAO_IDLE,
  npc_du:       DU_WEIMING_IDLE,
  item_glow:    ITEM_GLOW,
  item_key:     ITEM_KEY,
  item_doc:     ITEM_DOC,
  interact_icon: INTERACT_ICON,
  arrow_right:  ARROW_RIGHT,
  arrow_left:   ARROW_LEFT,
  arrow_down:   ARROW_DOWN,
  arrow_up:     ARROW_UP,
};

// ============================================================
// 精灵缓存：预渲染到小 Canvas，绘制时 drawImage 缩放
// ============================================================
const spriteCache = new Map<string, HTMLCanvasElement>();

export function getSpriteCanvas(key: string): HTMLCanvasElement {
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const data = SPRITES[key];
  if (!data) throw new Error(`Sprite not found: ${key}`);

  const h = data.length;
  const w = data[0].length;
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d')!;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = data[y][x];
      if (c && c !== '') {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  spriteCache.set(key, cvs);
  return cvs;
}
