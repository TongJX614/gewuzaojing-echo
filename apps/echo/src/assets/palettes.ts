// ============================================================
// 色彩调色板 — 像素画统一色源
// Mod 友好：替换此文件即可换肤
// ============================================================

export const PALETTE = {
  // 背景 & 建筑
  bgDeep:       '#0d1117',
  bgMid:        '#1a1f2e',
  bgLight:      '#2d333b',
  wallDark:     '#21262d',
  wallMid:      '#30363d',
  wallLight:    '#484f58',
  floorDark:    '#161b22',
  floorMid:     '#1c2128',
  floorLight:   '#272e37',

  // 霓虹 & 强调
  neonCyan:     '#00e5ff',
  neonMagenta:  '#ff2d6f',
  neonGreen:    '#39d353',
  neonAmber:    '#ffb347',
  neonOrange:   '#ff6f3c',

  // 记忆空间专用
  memBg:        '#1a0a2e',
  memPurple:    '#8b5cf6',
  memPink:      '#ec4899',
  memFragment:  '#ffb347',

  // UI
  uiPanel:      '#0d1117',
  uiBorder:     '#30363d',
  uiText:       '#e6edf3',
  uiTextDim:    '#8b949e',
  uiHighlight:  '#58a6ff',

  // 状态
  hpBar:        '#ff4444',
  hpBarBg:      '#3d1f1f',
  expBar:       '#00e5ff',
  expBarBg:     '#1a3d3d',

  // 角色
  playerHair:   '#1a1a2e',
  playerSkin:   '#e8c4a0',
  playerCoat:   '#2d333b',
  playerCoatLt: '#484f58',
  playerPants:  '#1a1a2e',

  npcXiaoHair:  '#c0c0c0',
  npcXiaoSkin:  '#f0e6ff',
  npcXiaoDress: '#e0e0e0',

  npcDuHair:    '#a0a0b0',
  npcDuSkin:    '#e8c4a0',
  npcDuSuit:    '#1a2744',
  npcDuSuitLt:  '#2d4a7a',
  npcDuPants:   '#111827',

  // 物品
  itemGlow:     '#ffb347',
  itemKey:      '#39d353',
  itemDoc:      '#58a6ff',
} as const;

export type PaletteKey = keyof typeof PALETTE;
