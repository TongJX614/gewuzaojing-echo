// ============================================================
// 可交互道具
// ============================================================

import { Entity, createEntity, distance } from './entity';
import { Player } from './player';

export class InteractiveItem {
  public entity: Entity;
  public dialogueTrigger: string;
  public collected: boolean;
  public itemType: 'glow' | 'key' | 'doc';
  public bobOffset: number;
  /** 若为 true，点击时触发对话而非拾取 */
  public triggersDialogue: boolean;
  /** 物品定义 ID（用于背包显示和地图上绘制图标） */
  public itemId: string;

  constructor(
    id: string,
    x: number,
    y: number,
    spriteKey: string,
    name: string,
    dialogueTrigger: string,
    itemType: 'glow' | 'key' | 'doc' = 'glow',
    triggersDialogue: boolean = false,
    itemId: string = id,
  ) {
    this.entity = createEntity(id, x, y, spriteKey, name, {
      width: 1,
      height: 1,
      interactable: true,
      interactRadius: triggersDialogue ? 1.5 : 1.2,
    });
    this.dialogueTrigger = dialogueTrigger;
    this.collected = false;
    this.itemType = itemType;
    this.bobOffset = 0;
    this.triggersDialogue = triggersDialogue;
    this.itemId = itemId;
  }

  update(_dt: number): void {
    void _dt;
    if (!this.collected) {
      this.bobOffset = 0;
    }
  }

  isInRange(player: Player): boolean {
    if (this.collected) return false;
    return distance(this.entity, player.entity) <= this.entity.interactRadius;
  }

  collect(): void {
    this.collected = true;
  }
}
