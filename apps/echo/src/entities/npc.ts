// ============================================================
// NPC 实体
// ============================================================

import { Entity, createEntity, distance } from './entity';
import { Player } from './player';

export class NPC {
  public entity: Entity;
  public dialogueTrigger: string;
  public bobOffset: number;
  public bobSpeed: number;
  /** 当前 Stage 的有效贴图视角（由 StageManager 解析后写入） */
  public spriteVariant: 'front' | 'side' | 'back' = 'front';
  private talked: boolean;

  constructor(
    id: string,
    x: number,
    y: number,
    spriteKey: string,
    name: string,
    dialogueTrigger: string,
  ) {
    this.entity = createEntity(id, x, y, spriteKey, name, {
      width: 1,
      height: 1,
      interactable: true,
      interactRadius: 2.5,
    });
    this.dialogueTrigger = dialogueTrigger;
    this.bobOffset = 0;
    this.bobSpeed = 0.003;
    this.talked = false;
  }

  update(dt: number): void {
    void dt;
    this.bobOffset = 0;
  }

  /** 是否在玩家交互范围内 */
  isInRange(player: Player): boolean {
    return distance(this.entity, player.entity) <= this.entity.interactRadius;
  }

  get hasTalked(): boolean {
    return this.talked;
  }

  setHasTalked(v: boolean): void {
    this.talked = v;
  }
}
