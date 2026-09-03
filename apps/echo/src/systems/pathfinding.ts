// ============================================================
// A* 寻路系统
// 基于网格的 A* 算法，自动绕过矩形碰撞框
// ============================================================

import type { Collider } from '../scenes/scene';

interface GridNode {
  x: number;
  y: number;
  g: number; // 已走代价
  h: number; // 曼哈顿预估
  f: number; // g + h
  parent: GridNode | null;
}

const CELL_SIZE = 0.5; // 网格精度（逻辑坐标 0.5 tile / cell）
const NEIGHBORS = [
  [0, -1], [0, 1], [-1, 0], [1, 0], // 仅水平+竖直，无对角线
];

export class PathfindingSystem {
  private colliders: Collider[] = [];
  private gridCols = 0;
  private gridRows = 0;
  private blocked: boolean[] = [];

  /** 设置当前场景的碰撞数据 */
  setColliders(colliders: Collider[], worldW: number, worldH: number): void {
    this.colliders = colliders;
    this.gridCols = Math.ceil(worldW / CELL_SIZE);
    this.gridRows = Math.ceil(worldH / CELL_SIZE);
    this.rebuildGrid();
  }

  private rebuildGrid(): void {
    this.blocked = new Array(this.gridCols * this.gridRows).fill(false);
    // 玩家碰撞半径（逻辑坐标），路径需留出此间距
    const margin = 0.3;
    for (const c of this.colliders) {
      // 将碰撞框向外扩展 margin，确保玩家不会贴墙走
      const x0 = Math.floor((c.x - margin) / CELL_SIZE);
      const y0 = Math.floor((c.y - margin) / CELL_SIZE);
      const x1 = Math.ceil((c.x + c.w + margin) / CELL_SIZE);
      const y1 = Math.ceil((c.y + c.h + margin) / CELL_SIZE);
      for (let gy = y0; gy < y1; gy++) {
        for (let gx = x0; gx < x1; gx++) {
          if (gx >= 0 && gx < this.gridCols && gy >= 0 && gy < this.gridRows) {
            this.blocked[gy * this.gridCols + gx] = true;
          }
        }
      }
    }
  }

  private isBlocked(gx: number, gy: number): boolean {
    if (gx < 0 || gx >= this.gridCols || gy < 0 || gy >= this.gridRows) return true;
    return this.blocked[gy * this.gridCols + gx];
  }

  /** 检测直线是否被碰撞框阻挡 */
  isLineBlocked(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist / (CELL_SIZE * 0.8));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      const gx = Math.floor(px / CELL_SIZE);
      const gy = Math.floor(py / CELL_SIZE);
      if (this.isBlocked(gx, gy)) return true;
    }
    return false;
  }

  /** 找到目标点附近最近的可行走格子 */
  private findNearestWalkable(gx: number, gy: number): { x: number; y: number } | null {
    if (!this.isBlocked(gx, gy)) return { x: gx, y: gy };
    // 螺旋向外搜索
    for (let r = 1; r < 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = gx + dx;
          const ny = gy + dy;
          if (!this.isBlocked(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  /** A* 寻路，返回路径点列表（逻辑坐标），空数组=无法到达 */
  findPath(startX: number, startY: number, endX: number, endY: number): { x: number; y: number }[] {
    const startGx0 = Math.floor(startX / CELL_SIZE);
    const startGy0 = Math.floor(startY / CELL_SIZE);
    let endGx = Math.floor(endX / CELL_SIZE);
    let endGy = Math.floor(endY / CELL_SIZE);

    // 如果起点在障碍内，找最近的可行走点
    let startGx = startGx0;
    let startGy = startGy0;
    if (this.isBlocked(startGx, startGy)) {
      const alt = this.findNearestWalkable(startGx, startGy);
      if (!alt) return [];
      startGx = alt.x; startGy = alt.y;
    }
    // 如果终点在障碍内，找最近的可行走边缘点
    if (this.isBlocked(endGx, endGy)) {
      const alt = this.findNearestWalkable(endGx, endGy);
      if (!alt) return [];
      endGx = alt.x; endGy = alt.y;
    }

    const open: GridNode[] = [];
    const closed = new Set<number>();
    const startNode: GridNode = { x: startGx, y: startGy, g: 0, h: 0, f: 0, parent: null };
    startNode.h = Math.abs(endGx - startGx) + Math.abs(endGy - startGy);
    startNode.f = startNode.h;
    open.push(startNode);

    let iter = 0;
    const maxIter = 5000;

    while (open.length > 0 && iter < maxIter) {
      iter++;
      // 取 f 最小
      open.sort((a, b) => a.f - b.f);
      const current = open.shift()!;
      const key = current.y * this.gridCols + current.x;
      if (current.x === endGx && current.y === endGy) {
        return this.reconstructPath(current);
      }
      closed.add(key);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (this.isBlocked(nx, ny)) continue;
        const nkey = ny * this.gridCols + nx;
        if (closed.has(nkey)) continue;
        const g = current.g + 1;
        const existing = open.find(n => n.x === nx && n.y === ny);
        if (existing && g >= existing.g) continue;
        const h = Math.abs(endGx - nx) + Math.abs(endGy - ny);
        const node: GridNode = { x: nx, y: ny, g, h, f: g + h, parent: current };
        if (existing) {
          existing.g = g; existing.f = g + h; existing.parent = current;
        } else {
          open.push(node);
        }
      }
    }
    return [];
  }

  private reconstructPath(end: GridNode): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let node: GridNode | null = end;
    while (node) {
      path.unshift({ x: node.x * CELL_SIZE + CELL_SIZE / 2, y: node.y * CELL_SIZE + CELL_SIZE / 2 });
      node = node.parent;
    }
    // 路径简化：去掉共线中间点
    return this.simplifyPath(path);
  }

  private simplifyPath(path: { x: number; y: number }[]): { x: number; y: number }[] {
    if (path.length <= 2) return path;
    const result = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = path[i];
      const next = path[i + 1];
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      // 如果方向相同则跳过中间点
      if (Math.sign(dx1) !== Math.sign(dx2) || Math.sign(dy1) !== Math.sign(dy2)) {
        result.push(curr);
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }
}
