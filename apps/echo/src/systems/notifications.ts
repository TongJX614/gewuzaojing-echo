/**
 * 统一通知系统
 * 替代 QuestSystem.addNotification 和 InventoryUI.showPickupToast
 *
 * 通知类型：
 * - info: 青色普通通知（任务/存档/系统）
 * - pickup: 琥珀色拾取通知（获得道具）
 * - quest: 绿色任务通知
 * - danger: 红色危险通知
 */

export type NotificationType = 'info' | 'pickup' | 'quest' | 'danger';

export interface GameNotification {
  id: number;
  type: NotificationType;
  text: string;
  icon?: string;
  timer: number;
  maxTimer: number;
}

export class NotificationSystem {
  private notifications: GameNotification[] = [];
  private nextId = 0;

  /** 添加通知 */
  show(text: string, type: NotificationType = 'info', duration = 3000, icon?: string): void {
    this.notifications.push({
      id: this.nextId++,
      type,
      text,
      icon,
      timer: duration,
      maxTimer: duration,
    });
  }

  /** 拾取道具通知 */
  showPickup(itemName: string, icon = '◆'): void {
    this.show(`获得道具：${itemName}`, 'pickup', 2500, icon);
  }

  /** 任务通知 */
  showQuest(text: string): void {
    this.show(text, 'quest');
  }

  /** 存档通知 */
  showSave(text: string): void {
    this.show(text, 'info', 2000);
  }

  /** 更新所有通知计时器 */
  update(dt: number): void {
    for (const n of this.notifications) {
      n.timer -= dt;
    }
    this.notifications = this.notifications.filter(n => n.timer > 0);
  }

  /** 获取所有活跃通知 */
  getAll(): GameNotification[] {
    return this.notifications;
  }

  /** 清空 */
  clear(): void {
    this.notifications = [];
  }
}
