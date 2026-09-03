// ============================================================
// 玩家贴图加载器 — 从 public/player/ 加载方向贴图 + 行走动画帧
// ============================================================

export type PlayerFacing = 'idle' | 'down' | 'left' | 'right' | 'up' | 'death';

interface LoadedSprite {
  image: HTMLImageElement;
  width: number;   // 原始宽度
  height: number;  // 原始高度
}

/** 行走动画帧 key */
export type WalkFrameKey = 'walk_down1' | 'walk_down2' | 'walk_left1' | 'walk_left2' | 'walk_right1' | 'walk_right2' | 'walk_up1' | 'walk_up2';

/** 玩家贴图管理器，负责加载和缓存方向贴图 + 行走帧 */
class PlayerSpriteManager {
  private sprites: Map<PlayerFacing, LoadedSprite> = new Map();
  private walkFrames: Map<WalkFrameKey, LoadedSprite> = new Map();
  private loadPromise: Promise<void> | null = null;

  /** 加载所有玩家贴图（返回 Promise，可 await） */
  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = Promise.all([
      // 站立贴图
      this.loadOne('idle', '/player/idle.png'),
      this.loadOne('down', '/player/idle.png'),       // 朝下用 idle
      this.loadOne('left', '/player/left.png'),
      this.loadOne('right', '/player/right.png'),
      this.loadOne('up', '/player/upwards.png'),
      this.loadOne('death', '/player/death.png'),
      // 行走动画帧
      this.loadWalk('walk_down1', '/player/walk_down1.png'),
      this.loadWalk('walk_down2', '/player/walk_down2.png'),
      this.loadWalk('walk_left1', '/player/walk_left1.png'),
      this.loadWalk('walk_left2', '/player/walk_left2.png'),
      this.loadWalk('walk_right1', '/player/walk_right1.png'),
      this.loadWalk('walk_right2', '/player/walk_right2.png'),
      this.loadWalk('walk_up1', '/player/walk_up1.png'),
      this.loadWalk('walk_up2', '/player/walk_up2.png'),
    ]).then(() => { /* all loaded */ });

    return this.loadPromise;
  }

  private loadOne(facing: PlayerFacing, src: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.sprites.set(facing, { image: img, width: img.naturalWidth, height: img.naturalHeight });
        resolve();
      };
      img.onerror = () => {
        console.warn(`[PlayerSprite] Failed to load: ${src}`);
        resolve();
      };
      img.src = src;
    });
  }

  private loadWalk(key: WalkFrameKey, src: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.walkFrames.set(key, { image: img, width: img.naturalWidth, height: img.naturalHeight });
        resolve();
      };
      img.onerror = () => {
        console.warn(`[PlayerSprite] Failed to load walk frame: ${src}`);
        resolve();
      };
      img.src = src;
    });
  }

  /** 获取指定方向的站立贴图 */
  get(facing: PlayerFacing): LoadedSprite | undefined {
    return this.sprites.get(facing);
  }

  /** 获取行走动画帧 */
  getWalk(key: WalkFrameKey): LoadedSprite | undefined {
    return this.walkFrames.get(key);
  }

  /** 是否所有贴图已加载完成 */
  get isLoaded(): boolean {
    return this.sprites.size >= 5;
  }
}

/** 全局玩家贴图管理器实例 */
export const playerSprites = new PlayerSpriteManager();

/** 在逻辑坐标系中绘制玩家贴图的推荐高度（像素） */
export const PLAYER_SPRITE_DRAW_HEIGHT = 28;

/** 根据 facing + frame 获取行走动画帧 */
export function getWalkFrame(facing: PlayerFacing, frame: 0 | 1): WalkFrameKey | null {
  switch (facing) {
    case 'down':  return frame === 0 ? 'walk_down1' : 'walk_down2';
    case 'left':  return frame === 0 ? 'walk_left1' : 'walk_left2';
    case 'right': return frame === 0 ? 'walk_right1' : 'walk_right2';
    case 'up':    return frame === 0 ? 'walk_up1' : 'walk_up2';
    default:      return null;
  }
}
