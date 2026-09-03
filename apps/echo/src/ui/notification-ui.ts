import { NotificationSystem, GameNotification } from '../systems/notifications';

/**
 * 统一通知 UI 渲染器
 * 统一渲染所有类型的通知（info/pickup/quest/danger）
 * 右上角毛玻璃面板，从上到下排列，淡入淡出动画
 */
export class NotificationUI {
  private container: HTMLElement | null = null;
  private notificationEls: Map<number, HTMLElement> = new Map();
  private lastHash = '';

  constructor(parent: HTMLElement, _system: NotificationSystem) {
    void _system;
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '160px',
      right: '40px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: '200',
      maxWidth: '340px',
      pointerEvents: 'none',
    });
    parent.appendChild(this.container);
  }

  /**
   * 渲染通知列表（增量更新，只增删变化的通知）
   */
  update(system: NotificationSystem): void {
    if (!this.container) return;

    const notifications = system.getAll();

    // 计算hash判断是否有变化
    const currentIds = new Set(notifications.map(n => n.id));
    const hash = notifications.map(n => `${n.id}:${Math.round(n.timer)}`).join(',');
    if (hash === this.lastHash) {
      // 只更新进度条（如果有的话）
      for (const n of notifications) {
        const el = this.notificationEls.get(n.id);
        if (el) this.updateElProgress(el, n);
      }
      return;
    }
    this.lastHash = hash;

    // 移除不在列表中的通知元素
    for (const [id, el] of this.notificationEls) {
      if (!currentIds.has(id)) {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(40px)';
        setTimeout(() => el.remove(), 300);
        this.notificationEls.delete(id);
      }
    }

    // 添加新通知元素
    for (const n of notifications) {
      if (!this.notificationEls.has(n.id)) {
        const el = this.createNotificationEl(n);
        this.container.appendChild(el);
        this.notificationEls.set(n.id, el);
      }
    }
  }

  private createNotificationEl(n: GameNotification): HTMLElement {
    const el = document.createElement('div');
    el.dataset.type = n.type;

    // 颜色配置
    const colors: Record<string, { accent: string; icon: string }> = {
      info: { accent: '#00f3ff', icon: n.icon || 'ℹ' },
      pickup: { accent: '#eab308', icon: n.icon || '◆' },
      quest: { accent: '#33ff33', icon: n.icon || '✦' },
      danger: { accent: '#ff0055', icon: n.icon || '⚠' },
    };
    const c = colors[n.type] || colors.info;

    Object.assign(el.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 14px',
      background: 'rgba(2, 10, 18, 0.85)',
      border: `1px solid ${c.accent}`,
      borderLeft: `3px solid ${c.accent}`,
      color: '#e0ffff',
      fontFamily: "'Noto Sans SC', sans-serif",
      fontSize: '0.85rem',
      letterSpacing: '0.5px',
      backdropFilter: 'blur(8px)',
      boxShadow: `0 0 12px ${c.accent}33`,
      clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 100%, 0 100%)',
      transition: 'opacity 0.3s, transform 0.3s',
      opacity: '0',
      transform: 'translateX(40px)',
    });

    // 图标
    const iconEl = document.createElement('span');
    iconEl.textContent = c.icon;
    iconEl.style.cssText = `color: ${c.accent}; font-size: 0.9rem; text-shadow: 0 0 6px ${c.accent};`;
    el.appendChild(iconEl);

    // 文本
    const textEl = document.createElement('span');
    textEl.textContent = n.text;
    textEl.style.cssText = 'flex: 1;';
    el.appendChild(textEl);

    // 进度条（底部细线）
    const barEl = document.createElement('div');
    barEl.dataset.role = 'progress';
    barEl.style.cssText = `position: absolute; bottom: 0; left: 0; height: 1px; background: ${c.accent}; transition: width 0.1s linear; width: 100%;`;
    el.style.position = 'relative';
    el.appendChild(barEl);

    // 触发淡入动画
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });

    return el;
  }

  private updateElProgress(el: HTMLElement, n: GameNotification): void {
    const bar = el.querySelector('[data-role="progress"]') as HTMLElement | null;
    if (bar) {
      bar.style.width = `${(n.timer / n.maxTimer) * 100}%`;
    }
  }
}
