// ============================================================
// 场景定义基类
// ============================================================

import { NPC } from '../entities/npc';
import { InteractiveItem } from '../entities/item';

/** 矩形碰撞框（逻辑坐标） */
export interface Collider {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneDef {
  id: string;
  name: string;
  mapStr: string;
  mapData: string[][];
  npcs: NPC[];
  items: InteractiveItem[];
  playerStart: { x: number; y: number };
  /** 场景过渡点（边缘 tile → 目标场景） */
  transitions: { x: number; y: number; targetScene: string; targetX: number; targetY: number }[];
  /** 场景背景贴图路径（优先于 tile 渲染） */
  backgroundImage?: string;
  /** 背景图缩放因子（越大地图越小），默认 2.5 */
  bgScale?: number;
  /** 地图宽高（tile 单位） */
  worldW?: number;
  worldH?: number;
  /** 矩形碰撞框列表（逻辑坐标，可由开发工具生成） */
  colliders?: Collider[];
}

export function createSceneDef(
  id: string,
  name: string,
  mapStr: string,
  playerStart: { x: number; y: number },
  npcs: NPC[] = [],
  items: InteractiveItem[] = [],
  transitions: SceneDef['transitions'] = [],
  backgroundImage?: string,
  bgScale?: number,
  worldW?: number,
  worldH?: number,
): SceneDef {
  const mapData = mapStr.trim().split('\n').map(line => line.split(''));
  return { id, name, mapStr, mapData, npcs, items, playerStart, transitions, backgroundImage, bgScale, worldW, worldH, colliders: [] };
}
