// ============================================================
// Tile 地图数据
// 每个 tile 用单字符表示，渲染时映射到颜色
// Mod 友好：修改地图字符串即可改变场景布局
// ============================================================

import { PALETTE } from './palettes';

// Tile 类型 → 颜色映射
export const TILE_COLORS: Record<string, string> = {
  '.': PALETTE.floorMid,      // 普通地面
  '=': PALETTE.floorLight,    // 浅色地面（路径）
  '#': PALETTE.wallDark,      // 墙壁
  'W': PALETTE.wallMid,       // 浅墙
  'D': PALETTE.floorDark,     // 深色地面
  '~': PALETTE.neonCyan,      // 水/能量流
  'N': PALETTE.neonMagenta,   // 霓虹灯
  'G': PALETTE.neonGreen,     // 草/植物
  'B': PALETTE.bgDeep,        // 空/不可达
  'M': PALETTE.memPurple,     // 记忆碎片色
  'P': PALETTE.memPink,       // 记忆粉色
  'A': PALETTE.neonAmber,     // 琥珀灯
  'S': PALETTE.wallLight,     // 储物柜/架
  'C': PALETTE.npcDuSuit,     // 椅子/家具
};

// 可通行 tile
export const WALKABLE_TILES = new Set(['.', '=', 'D', '~', 'G', 'M', 'P', 'A']);

// ============================================================
// 场景 1：苏然的办公室
// ============================================================
export const MAP_OFFICE = [
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  'B##############..##############B',
  'B#SSSSSSSSSSSS#..#SSSSSSSSSSSS#B',
  'B#............#..#............#B',
  'B#............#..#............#B',
  'B#....C.......#..#............#B',
  'B#............#..#............#B',
  'B#............#..#............#B',
  'B#............====............#B',
  'B#............====............#B',
  'B#SSSSSSSSSSSS#..#SSSSSSSSSSSS#B',
  'B##############..##############B',
  'BBBBBBBBBBBB..DDDD..BBBBBBBBBBB',
  'BBBBBBBBBBBB..DDDD..BBBBBBBBBBB',
  'BBBBBBBBBBBB..DDDD..BBBBBBBBBBB',
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
].join('\n');

// ============================================================
// 场景 2：新深圳街道
// ============================================================
export const MAP_STREET = [
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  'B########B########B########B###########B',
  'B#......#B#......#B#......#B#.........#B',
  'B#......#B#......#B#......#B#.........#B',
  'B#......#B#......#B#......#B#.........#B',
  'B#......#B#......#B#......#B#.........#B',
  'B###.####B###.####B###.####B####.######B',
  'B.......................................B',
  'B=~=~=~=~=~=~=~=~=~=~=~=~=~=~=~=~=~=~=~=B',
  'B.......................................B',
  'B###.####B###.####B###.####B####.######B',
  'B#......#B#......#B#......#B#.........#B',
  'B#......#B#......#B#......#B#.........#B',
  'B#......#B#......#B#......#B#.........#B',
  'B#......#B#......#B#......#B#.........#B',
  'B########B########B########B###########B',
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
].join('\n');

// ============================================================
// 场景 3：织星科技大厅
// ============================================================
export const MAP_STARWEAVE = [
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  'B######################################B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#............NNNNNNNNNN.............#B',
  'B#............N========N.............#B',
  'B#............N========N.............#B',
  'B#............N========N.............#B',
  'B#............NNNNNNNNNN.............#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B#....................................#B',
  'B######################################B',
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
].join('\n');

// ============================================================
// 场景 4：记忆空间
// ============================================================
export const MAP_MEMORY = [
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  'BMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMB',
  'BMMPPMMMMPMMMMPMMMMMPMMMMMPPMMMMMMMMMMMB',
  'BMPPMMMPMMMPMMMPMMMMPMMMMPMMMPMMMMMMMMMB',
  'BMPPMMMP..MPMMMP...MP..MPMMMPMMMMMMMMMB',
  'BMPPPMP...MP..MP...MP..MP..MPMMMMMMMMMMB',
  'BMPPPMP...MP..MP...MP..MP..MPMMMMMMMMMMB',
  'BMPPPPP...MP..MP...MP..MP..MPPMMMMMMMMMB',
  'BMPPPPP===MP==MP===MP==MP==MPPPMMMMMMMMB',
  'BMPPPPP===MP==MP===MP==MP==MPPPPMMMMMMMB',
  'BMPPPPP...MP..MP...MP..MP..MPPPPMMMMMMMB',
  'BMPPPPP...MP..MP...MP..MP..MPPPPMMMMMMMB',
  'BMPPPPMP..MP..MP..MP...MP..MPPPMMMMMMMB',
  'BMPPPMMP..MP..MP..MP...MP..MPPMMMMMMMMMB',
  'BMPPMMMP..MP..MP..MP...MP..MPMMMMMMMMMMB',
  'BMMMPPMP..MP..MP..MP...MP..MPMMMMMMMMMMB',
  'BMMMMPPMPPMPPPMPPPMPPPPMPPPMPPMMMMMMMMMB',
  'BMMMMMPPPPMPPPPMPPPMPPPPPMPPPPMMMMMMMMMB',
  'BMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMB',
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
].join('\n');

// ============================================================
// 解析地图字符串为二维数组
// ============================================================
export function parseMap(mapStr: string): string[][] {
  return mapStr.trim().split('\n').map(line => line.split(''));
}

export function getMapSize(mapData: string[][]): { width: number; height: number } {
  return { width: mapData[0].length, height: mapData.length };
}
