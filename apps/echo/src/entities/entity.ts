// ============================================================
// 基础实体
// ============================================================

export interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteKey: string;
  interactable: boolean;
  interactRadius: number;
  name: string;
}

export function createEntity(
  id: string,
  x: number,
  y: number,
  spriteKey: string,
  name: string,
  options: Partial<{ width: number; height: number; interactable: boolean; interactRadius: number }> = {},
): Entity {
  return {
    id,
    x,
    y,
    width: options.width ?? 1,
    height: options.height ?? 1,
    spriteKey,
    interactable: options.interactable ?? false,
    interactRadius: options.interactRadius ?? 1.2,
    name,
  };
}

/** 两实体中心距离 */
export function distance(a: Entity, b: Entity): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/** AABB 碰撞 */
export function aabbCollision(a: Entity, b: Entity): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
