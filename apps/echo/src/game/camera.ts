// ============================================================
// 摄像机 — 跟随玩家，clamp 到地图边界
// ============================================================

export class Camera {
  public x: number = 0;
  public y: number = 0;

  private viewWidth: number;
  private viewHeight: number;
  private mapWidth: number;
  private mapHeight: number;

  constructor(viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
  }

  /** 跟随目标，保持居中（平滑，不用 floor） */
  follow(targetX: number, targetY: number): void {
    this.x = targetX - this.viewWidth / 2;
    this.y = targetY - this.viewHeight / 2;
    this.clamp();
  }

  /** 限制在地图范围内 */
  private clamp(): void {
    const maxX = this.mapWidth - this.viewWidth;
    const maxY = this.mapHeight - this.viewHeight;
    this.x = Math.max(0, Math.min(this.x, maxX));
    this.y = Math.max(0, Math.min(this.y, maxY));
  }

  /** 更新地图尺寸（场景切换时） */
  setMapSize(w: number, h: number): void {
    this.mapWidth = w;
    this.mapHeight = h;
  }

  setViewSize(w: number, h: number): void {
    this.viewWidth = w;
    this.viewHeight = h;
  }
}
