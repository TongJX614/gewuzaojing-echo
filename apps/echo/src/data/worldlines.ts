// ============================================================
// 世界线分支逻辑 — Mod 友好
// ============================================================

export interface WorldLineStep {
  sceneId: string;
  sequence: number;
  description: string;
}

export interface WorldLine {
  id: string;
  name: string;
  description: string;
  path: WorldLineStep[];
  ending: string;
}

export const WORLD_LINES: Record<string, WorldLine> = {
  main_line: {
    id: 'main_line',
    name: '主线',
    description: '苏然发现真相并前往对峙的基础路线',
    path: [
      { sceneId: 'scene_01', sequence: 1, description: '苏然收到委托，开始修复' },
      { sceneId: 'scene_02', sequence: 2, description: '进入记忆空间，发现异常' },
      { sceneId: 'scene_03', sequence: 3, description: '与杜维明对峙' },
      { sceneId: 'scene_04', sequence: 4, description: '走向结局' },
    ],
    ending: 'ending_02',
  },
  branch_truth: {
    id: 'branch_truth',
    name: '真相线',
    description: '苏然选择深入真相，不惜一切代价',
    path: [
      { sceneId: 'scene_02', sequence: 2, description: '苏然选择继续深入修复' },
      { sceneId: 'scene_03', sequence: 3, description: '苏然携带完整证据对峙' },
      { sceneId: 'scene_04', sequence: 4, description: '走向结局' },
    ],
    ending: 'ending_03',
  },
  branch_safety: {
    id: 'branch_safety',
    name: '安全线',
    description: '苏然选择停止修复，保护自己',
    path: [
      { sceneId: 'scene_02', sequence: 2, description: '苏然选择停止修复' },
      { sceneId: 'scene_03', sequence: 3, description: '苏然在不完全了解真相的情况下对峙' },
      { sceneId: 'scene_04', sequence: 4, description: '走向结局' },
    ],
    ending: 'ending_01',
  },
};

export const CONVERGENCE_POINTS = [
  { sceneId: 'scene_03', description: '无论选择哪条线，苏然都会前往对峙' },
  { sceneId: 'scene_04', description: '所有路线最终走向结局' },
];
