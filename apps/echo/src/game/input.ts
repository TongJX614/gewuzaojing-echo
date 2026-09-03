// ============================================================
// 输入处理 — 鼠标点击移动 + 交互
// ============================================================

export interface InputState {
  /** 鼠标点击的逻辑坐标（未经 ctx.scale 放大的坐标） */
  clickX: number | null;
  clickY: number | null;
  /** 本帧是否有点击事件 */
  clicked: boolean;
  /** 鼠标当前逻辑坐标 */
  mouseX: number;
  mouseY: number;
}

export class InputManager {
  private state: InputState = {
    clickX: null,
    clickY: null,
    clicked: false,
    mouseX: 0,
    mouseY: 0,
  };

  private canvas: HTMLCanvasElement;
  /** 画布渲染缩放倍率（ctx.scale 使用） */
  private renderScale: number = 1;
  /** 逻辑画布尺寸（未缩放） */
  private logicalW: number;
  private logicalH: number;
  /** 世界坐标（由引擎每帧更新） */
  public mouseWorldX: number = -999;
  public mouseWorldY: number = -999;

  constructor(canvas: HTMLCanvasElement, logicalW: number, logicalH: number) {
    this.canvas = canvas;
    this.logicalW = logicalW;
    this.logicalH = logicalH;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.canvas.addEventListener('click', (e: MouseEvent) => this.handleClick(e));
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => this.handleMove(e));
    // 触摸支持
    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        this.handleClick(touch as unknown as MouseEvent);
      }
    }, { passive: false });
  }

  /** 计算当前渲染缩放倍率 */
  private computeScale(): number {
    // canvas.width = logicalW * scale, 所以 scale = canvas.width / logicalW
    return this.canvas.width / this.logicalW;
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    this.renderScale = this.computeScale();

    // CSS 坐标 → 逻辑坐标（除以渲染缩放倍率）
    const logicalX = cssX / this.renderScale;
    const logicalY = cssY / this.renderScale;

    this.state.clickX = logicalX;
    this.state.clickY = logicalY;
    this.state.clicked = true;
  }

  private handleMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    this.renderScale = this.computeScale();
    this.state.mouseX = cssX / this.renderScale;
    this.state.mouseY = cssY / this.renderScale;
  }

  /** 消费点击事件，返回逻辑坐标 */
  consumeClick(): { x: number; y: number } | null {
    if (!this.state.clicked || this.state.clickX === null || this.state.clickY === null) {
      return null;
    }
    const x = this.state.clickX;
    const y = this.state.clickY;
    this.state.clicked = false;
    this.state.clickX = null;
    this.state.clickY = null;
    return { x, y };
  }

  get mouseX(): number { return this.state.mouseX; }
  get mouseY(): number { return this.state.mouseY; }
  get clicked(): boolean { return this.state.clicked; }

  /** 当逻辑尺寸变化时更新（resize 后调用） */
  setLogicalSize(w: number, h: number): void {
    this.logicalW = w;
    this.logicalH = h;
  }
}
