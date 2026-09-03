// ============================================================
// 玩家角色 — 寻路移动 + 碰撞 + 方向贴图
// ============================================================

import { Entity, createEntity } from './entity';
import type { PlayerFacing } from '../assets/player-sprites';
import type { Collider } from '../scenes/scene';

export interface PlayerState {
  hp: number;
  maxHp: number;
  exp: number;
  level: number;
}

export class Player {
  public entity: Entity;
  public state: PlayerState;
  public targetX: number;
  public targetY: number;
  public moving: boolean;
  public speed: number;           // tiles per second
  public facing: PlayerFacing;    // 当前朝向
  public isDead: boolean;         // 死亡状态
  public walkFrame: 0 | 1;        // 行走动画当前帧 (0 or 1)
  public renderKey: string;       // 当前渲染用的贴图key（供引擎读取）

  /** 行走动画计时器 */
  private walkTimer: number = 0;
  /** 行走动画切换间隔 (ms) */
  private readonly WALK_INTERVAL = 180;

  /** 世界边界（背景图尺寸，tile 单位） */
  private worldW: number;
  private worldH: number;

  /** 寻路路径点列表 */
  private waypoints: { x: number; y: number }[] = [];
  /** 碰撞框列表 */
  private colliders: Collider[] = [];

  constructor(x: number, y: number, worldW: number = 60, worldH: number = 48) {
    this.entity = createEntity('player', x, y, 'player_idle', '苏然', {
      width: 1,
      height: 1,
      interactable: false,
    });
    this.state = { hp: 100, maxHp: 100, exp: 0, level: 1 };
    this.targetX = x;
    this.targetY = y;
    this.moving = false;
    this.speed = 9.45; // tiles/second (6.75 * 1.4)
    this.facing = 'idle';
    this.isDead = false;
    this.walkFrame = 0;
    this.renderKey = 'idle';
    this.worldW = worldW;
    this.worldH = worldH;
  }

  /** 设置世界边界 */
  setWorldBounds(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
  }

  /** 清除所有寻路路径（用于场景切换时重置移动状态） */
  clearWaypoints(): void {
    this.waypoints = [];
    this.moving = false;
  }

  /** 设置碰撞框 */
  setColliders(colliders: Collider[]): void {
    this.colliders = colliders;
  }

  /** 设置移动目标（直接，无寻路） */
  setTarget(tx: number, ty: number): void {
    if (this.isDead) return;
    this.waypoints = [];
    this.targetX = Math.max(0, Math.min(tx, this.worldW - 1));
    this.targetY = Math.max(0, Math.min(ty, this.worldH - 1));
    this.moving = true;
  }

  /** 设置寻路路径（按 waypoint 依次行走） */
  setWaypoints(path: { x: number; y: number }[]): void {
    if (this.isDead || path.length === 0) return;
    this.waypoints = path;
    // 第一个点是当前位置，跳过
    if (this.waypoints.length > 1) this.waypoints.shift();
    const next = this.waypoints[0];
    if (next) {
      this.targetX = next.x;
      this.targetY = next.y;
      this.moving = true;
    }
  }

  /** 根据移动方向更新朝向 */
  private updateFacing(dx: number, dy: number): void {
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > 0.01) {
      this.facing = dy > 0 ? 'down' : 'up';
    }
  }

  /** 检查玩家矩形是否与碰撞框重叠（玩家占 0.6×0.6，中心在 x,y） */
  private isBlocked(x: number, y: number): boolean {
    // 玩家碰撞盒：中心 (x, y)，半宽 0.3
    const halfW = 0.3;
    const halfH = 0.3;
    const px1 = x - halfW;
    const py1 = y - halfH;
    const px2 = x + halfW;
    const py2 = y + halfH;
    for (const c of this.colliders) {
      // AABB 重叠检测
      if (px2 > c.x && px1 < c.x + c.w && py2 > c.y && py1 < c.y + c.h) return true;
    }
    return false;
  }

  /** 每帧更新位置 */
  update(dt: number): void {
    if (this.isDead) {
      this.facing = 'death';
      this.renderKey = 'death';
      return;
    }

    if (!this.moving) {
      // 停止时回到站立贴图
      if (this.facing !== 'death') {
        this.renderKey = this.facing;
      }
      this.walkTimer = 0;
      if (this.facing === 'down' || this.facing === 'idle') {
        this.facing = 'idle';
        this.renderKey = 'idle';
      }
      return;
    }

    const dx = this.targetX - this.entity.x;
    const dy = this.targetY - this.entity.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 到达当前 waypoint
    if (dist < 0.12) {
      this.entity.x = this.targetX;
      this.entity.y = this.targetY;
      // 还有下一个 waypoint？
      this.waypoints.shift();
      if (this.waypoints.length > 0) {
        const next = this.waypoints[0];
        this.targetX = next.x;
        this.targetY = next.y;
      } else {
        this.moving = false;
      }
      return;
    }

    // 更新朝向
    this.updateFacing(dx, dy);

    // 行走动画帧切换
    this.walkTimer += dt;
    if (this.walkTimer >= this.WALK_INTERVAL) {
      this.walkTimer -= this.WALK_INTERVAL;
      this.walkFrame = this.walkFrame === 0 ? 1 : 0;
    }
    // 设置渲染key: walk_{direction}{frame+1}
    this.renderKey = `walk_${this.facing}${this.walkFrame + 1}`;

    // 计算本帧步长
    const step = Math.min(this.speed * (dt / 1000), dist);
    const dirX = dx / dist;
    const dirY = dy / dist;

    let newX = this.entity.x + dirX * step;
    let newY = this.entity.y + dirY * step;

    // 分轴碰撞检测：X 轴先走
    const xBlocked = this.isBlocked(newX, this.entity.y);
    if (xBlocked) {
      newX = this.entity.x; // X 被挡，停在原 X
    }
    // Y 轴后走
    const yBlocked = this.isBlocked(newX, newY);
    if (yBlocked) {
      newY = this.entity.y; // Y 被挡，停在原 Y
    }

    // 如果两轴都被挡，尝试沿墙滑动（只走 X 或只走 Y 的分量）
    if (xBlocked && yBlocked) {
      // 尝试只走 X 分量（沿墙滑行）
      const slideX = this.entity.x + dirX * step;
      if (!this.isBlocked(slideX, this.entity.y)) {
        newX = slideX;
        newY = this.entity.y;
      } else {
        // 尝试只走 Y 分量
        const slideY = this.entity.y + dirY * step;
        if (!this.isBlocked(this.entity.x, slideY)) {
          newX = this.entity.x;
          newY = slideY;
        } else {
          // 完全卡住：停止移动，清空路径
          newX = this.entity.x;
          newY = this.entity.y;
          this.waypoints = [];
          this.moving = false;
          return;
        }
      }
    }

    // 世界边界 clamp
    newX = Math.max(0.3, Math.min(newX, this.worldW - 0.3));
    newY = Math.max(0.3, Math.min(newY, this.worldH - 0.3));

    this.entity.x = newX;
    this.entity.y = newY;
  }

  /** 增加经验值 */
  addExp(amount: number): void {
    this.state.exp += amount;
    const needed = this.state.level * 100;
    if (this.state.exp >= needed) {
      this.state.level++;
      this.state.exp -= needed;
      this.state.maxHp += 10;
      this.state.hp = this.state.maxHp;
    }
  }

  /** 受伤 */
  takeDamage(amount: number): void {
    this.state.hp = Math.max(0, this.state.hp - amount);
    if (this.state.hp <= 0) {
      this.isDead = true;
      this.facing = 'death';
      this.moving = false;
    }
  }

  /** 治疗 */
  heal(amount: number): void {
    this.state.hp = Math.min(this.state.maxHp, this.state.hp + amount);
  }

  get x(): number { return this.entity.x; }
  set x(val: number) { this.entity.x = val; }
  get y(): number { return this.entity.y; }
  set y(val: number) { this.entity.y = val; }

  /** 存档用：直接设置 HP */
  setHp(val: number): void {
    this.state.hp = Math.max(0, Math.min(this.state.maxHp, val));
  }

  get hp(): number { return this.state.hp; }
  get maxHp(): number { return this.state.maxHp; }
  get exp(): number { return this.state.exp; }
  set exp(val: number) { this.state.exp = val; }
  get level(): number { return this.state.level; }
  set level(val: number) { this.state.level = val; }
}
