/**
 * 背包系统 — 管理玩家持有的物品
 */
import { ALL_ITEMS } from '../data/items';
import type { ItemDef } from '../data/items';

export interface InventorySlot {
  itemId: string;
  qty: number;
}

export class InventorySystem {
  private slots: InventorySlot[] = [];
  private maxSlots = 24;
  private onChange?: () => void;

  constructor(onChange?: () => void) {
    this.onChange = onChange;
  }

  setOnChange(onChange?: () => void): void {
    this.onChange = onChange;
  }

  /** 获取所有槽位 */
  getSlots(): readonly InventorySlot[] {
    return this.slots;
  }

  /** 获取最大槽位数 */
  getMaxSlots(): number {
    return this.maxSlots;
  }

  /** 获取物品定义 */
  getItemDef(itemId: string): ItemDef | undefined {
    return ALL_ITEMS[itemId];
  }

  /** 添加物品，返回是否成功 */
  addItem(itemId: string, qty: number = 1): boolean {
    const def = ALL_ITEMS[itemId];
    const requested = Math.max(0, Math.trunc(qty));
    if (!def || requested <= 0) return false;

    const existingCapacity = def.stackable
      ? this.slots
          .filter((slot) => slot.itemId === itemId)
          .reduce((sum, slot) => sum + Math.max(0, def.maxStack - slot.qty), 0)
      : 0;
    const emptySlots = this.maxSlots - this.slots.length;
    const newSlotCapacity = emptySlots * (def.stackable ? def.maxStack : 1);
    // 先做容量预检查，保证成功时全量加入，失败时背包完全不变。
    if (existingCapacity + newSlotCapacity < requested) return false;

    let remaining = requested;
    if (def.stackable) {
      for (const slot of this.slots) {
        if (slot.itemId !== itemId || slot.qty >= def.maxStack) continue;
        const added = Math.min(remaining, def.maxStack - slot.qty);
        slot.qty += added;
        remaining -= added;
        if (remaining === 0) break;
      }
    }
    while (remaining > 0) {
      const added = def.stackable ? Math.min(remaining, def.maxStack) : 1;
      this.slots.push({ itemId, qty: added });
      remaining -= added;
    }
    this.onChange?.();
    return true;
  }

  /** 移除物品，返回实际移除数量 */
  removeItem(itemId: string, qty: number = 1): number {
    let remaining = Math.max(0, Math.trunc(qty));
    let removed = 0;
    for (let index = this.slots.length - 1; index >= 0 && remaining > 0; index--) {
      const slot = this.slots[index];
      if (slot.itemId !== itemId) continue;
      const amount = Math.min(remaining, slot.qty);
      slot.qty -= amount;
      remaining -= amount;
      removed += amount;
      if (slot.qty <= 0) this.slots.splice(index, 1);
    }
    if (removed > 0) this.onChange?.();
    return removed;
  }

  /** 使用物品（消耗品扣1，装备不扣） */
  useItem(itemId: string): boolean {
    const def = ALL_ITEMS[itemId];
    if (!def) return false;

    const slot = this.slots.find(s => s.itemId === itemId);
    if (!slot) return false;

    if (def.type === 'consumable') {
      slot.qty -= 1;
      if (slot.qty <= 0) {
        const idx = this.slots.indexOf(slot);
        this.slots.splice(idx, 1);
      }
    }

    this.onChange?.();
    return true;
  }

  /** 丢弃物品 */
  dropItem(itemId: string): boolean {
    return this.removeItem(itemId, 1) > 0;
  }

  /** 是否持有某物品 */
  hasItem(itemId: string): boolean {
    return this.slots.some(s => s.itemId === itemId);
  }

  /** 获取某物品数量 */
  getItemQty(itemId: string): number {
    return this.slots
      .filter((slot) => slot.itemId === itemId)
      .reduce((sum, slot) => sum + slot.qty, 0);
  }

  /** 序列化 */
  serialize(): InventorySlot[] {
    return this.slots.map(s => ({ ...s }));
  }

  /** 反序列化 */
  deserialize(data: InventorySlot[]): void {
    this.slots = data
      .filter((slot) => ALL_ITEMS[slot.itemId] && slot.qty > 0)
      .slice(0, this.maxSlots)
      .map((slot) => ({
        itemId: slot.itemId,
        qty: Math.min(Math.max(1, Math.trunc(slot.qty)), ALL_ITEMS[slot.itemId].maxStack),
      }));
    this.onChange?.();
  }
}
