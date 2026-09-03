/**
 * 背包 UI — 严格参考硬科幻战术背包设计
 * 左侧网格 + 右侧详情面板 + 像素 Canvas 图标
 */
import { InventorySystem } from '../systems/inventory';
import { ALL_ITEMS, renderPixelArt } from '../data/items';
import type { ItemDef } from '../data/items';

// 背包图标像素数据（严格按模板）
const BAG_PALETTE: Record<string, string | null> = {
  ' ': null, 'K': '#0f172a', 'M': '#64748b', 'D': '#334155', 'C': '#00f3ff', 'Y': '#eab308',
};
const BAG_PIXELS = [
  "                ",
  "     KKKKKK     ",
  "    KMMMMMMK    ",
  "  KKKDDDDDDKKK  ",
  " KMMKMMMMMMKMMK ",
  " KYMKMMMMMMKMYK ",
  " KYMKKKKKKKKMYK ",
  " KMMKMMMMMMKMMK ",
  " KMMKKKCCKKKMMK ",
  " KDMKKKCCKKKMDK ",
  " KDMKKKKKKKKMDK ",
  " KMMKMMMMMMKMMK ",
  " KMMKDDDDDDKMMK ",
  "  KKKMMMMMMKKK  ",
  "    KKKKKKKK    ",
  "                ",
];

export class InventoryUI {
  private inventory: InventorySystem;
  private container: HTMLElement | null = null;
  private gridPanel: HTMLElement | null = null;
  private detailsPanel: HTMLElement | null = null;
  private emptyDetails: HTMLElement | null = null;
  private itemInfo: HTMLElement | null = null;
  private infoName: HTMLElement | null = null;
  private infoType: HTMLElement | null = null;
  private infoDesc: HTMLElement | null = null;
  private infoLore: HTMLElement | null = null;
  private infoCanvas: HTMLCanvasElement | null = null;
  private btnUse: HTMLElement | null = null;
  private btnDrop: HTMLElement | null = null;
  private selectedItemId: string | null = null;
  private visible = false;
  public onDropItem: ((itemId: string) => void) | null = null;

  // 拾取提示
  private toastContainer: HTMLElement | null = null;

  // 左下角快捷图标（背包）
  private quickIcon: HTMLElement | null = null;
  private badge: HTMLElement | null = null;
  private glitchWave: HTMLElement | null = null;

  constructor(inventory: InventorySystem) {
    this.inventory = inventory;
    this.build();
  }

  private build(): void {
    const parent = document.getElementById('game-container');
    if (!parent) return;

    // === 主面板 ===
    this.container = document.createElement('div');
    this.container.id = 'inventory-container';
    Object.assign(this.container.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      zIndex: '150',
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      // 圆形展开动画 — 从右下角(背包按钮位置)展开
      opacity: '0',
      pointerEvents: 'none',
      clipPath: 'circle(0% at 100% 100%)',
      transition: 'opacity 0.4s ease, clip-path 0.6s cubic-bezier(0.77, 0, 0.175, 1)',
    });

    // 内框
    const inner = document.createElement('div');
    Object.assign(inner.style, {
      width: '700px',
      maxWidth: '80vw',
      height: '420px',
      maxHeight: '60vh',
      display: 'flex',
      gap: '16px',
      background: 'rgba(2, 10, 18, 0.9)',
      border: '1px solid #00f3ff',
      padding: '24px',
      boxShadow: '0 0 40px rgba(0, 243, 255, 0.15) inset, 0 0 30px rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      position: 'relative',
      // 切角设计 — 严格按模板
      clipPath: 'polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 30px 100%, 0 calc(100% - 30px))',
      // 居中在 Canvas 区域
      marginBottom: '140px',
      // 动画原点在右下角
      transformOrigin: '100% 100%',
    });

    // 装饰角
    const corner = document.createElement('div');
    Object.assign(corner.style, {
      position: 'absolute', top: '0', left: '0',
      width: '20px', height: '20px',
      borderTop: '2px solid #00f3ff', borderLeft: '2px solid #00f3ff',
    });
    inner.appendChild(corner);

    // === 左侧网格 ===
    this.gridPanel = document.createElement('div');
    this.gridPanel.id = 'grid-panel';
    Object.assign(this.gridPanel.style, {
      flex: '2',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
      gridAutoRows: '56px',
      gap: '10px',
      alignContent: 'start',
      overflowY: 'auto',
      paddingRight: '10px',
    });
    inner.appendChild(this.gridPanel);

    // === 右侧详情 ===
    this.detailsPanel = document.createElement('div');
    Object.assign(this.detailsPanel.style, {
      flex: '1',
      borderLeft: '1px dashed rgba(0, 243, 255, 0.3)',
      paddingLeft: '20px',
      display: 'flex',
      flexDirection: 'column',
    });

    // 空状态
    this.emptyDetails = document.createElement('div');
    this.emptyDetails.className = 'empty-state';
    this.emptyDetails.textContent = '未选择数据对象';
    Object.assign(this.emptyDetails.style, {
      textAlign: 'center',
      color: 'rgba(0, 243, 255, 0.3)',
      marginTop: '50%',
      fontFamily: "'ZCOOL QingKe HuangYou', sans-serif",
      fontSize: '1.5rem',
    });
    this.detailsPanel.appendChild(this.emptyDetails);

    // 物品信息
    this.itemInfo = document.createElement('div');
    Object.assign(this.itemInfo.style, {
      display: 'none',
      overflowY: 'auto',
      flex: '1',
      minHeight: '0',
    });
    // 自定义滚动条
    this.itemInfo.className = 'inv-details-scroll';

    this.infoName = document.createElement('div');
    Object.assign(this.infoName.style, {
      fontFamily: "'ZCOOL QingKe HuangYou', sans-serif",
      fontSize: '1.5rem',
      letterSpacing: '2px',
      marginBottom: '10px',
      textShadow: '1px 0px 1px rgba(255,0,0,0.6), -1px 0px 1px rgba(0,255,255,0.6)',
      borderBottom: '1px solid #00f3ff',
      paddingBottom: '5px',
      color: '#00f3ff',
    });
    this.itemInfo.appendChild(this.infoName);

    this.infoType = document.createElement('div');
    Object.assign(this.infoType.style, {
      fontSize: '0.8rem',
      color: '#aaa',
      marginBottom: '20px',
      textTransform: 'uppercase',
    });
    this.itemInfo.appendChild(this.infoType);

    // 大图标预览
    const iconBox = document.createElement('div');
    Object.assign(iconBox.style, {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: '20px',
      padding: '10px',
      background: 'rgba(0,0,0,0.5)',
      border: '1px solid rgba(0, 243, 255, 0.3)',
    });
    this.infoCanvas = document.createElement('canvas');
    this.infoCanvas.width = 16;
    this.infoCanvas.height = 16;
    Object.assign(this.infoCanvas.style, {
      width: '72px',
      height: '72px',
      imageRendering: 'pixelated',
      filter: 'drop-shadow(0 0 4px rgba(0, 243, 255, 0.5))',
    });
    iconBox.appendChild(this.infoCanvas);
    this.itemInfo.appendChild(iconBox);

    this.infoDesc = document.createElement('div');
    Object.assign(this.infoDesc.style, {
      fontSize: '0.95rem',
      lineHeight: '1.6',
      color: '#ddd',
      flexGrow: '1',
    });
    this.itemInfo.appendChild(this.infoDesc);

    this.infoLore = document.createElement('div');
    Object.assign(this.infoLore.style, {
      fontSize: '0.85rem',
      color: '#ffaa00',
      fontStyle: 'italic',
      marginTop: '15px',
      padding: '10px',
      background: 'rgba(255, 170, 0, 0.1)',
      borderLeft: '2px solid #ffaa00',
    });
    this.itemInfo.appendChild(this.infoLore);

    // USE 按钮
    this.btnUse = document.createElement('button');
    this.btnUse.textContent = '执行 [ USE ]';
    Object.assign(this.btnUse.style, {
      background: 'transparent',
      border: '1px solid #00f3ff',
      color: '#00f3ff',
      padding: '10px',
      marginTop: '10px',
      cursor: 'pointer',
      textAlign: 'center',
      fontWeight: 'bold',
      transition: 'all 0.2s',
      width: '100%',
    });
    this.btnUse.onmouseenter = () => {
      this.btnUse!.style.background = '#00f3ff';
      this.btnUse!.style.color = '#000';
      this.btnUse!.style.boxShadow = '0 0 15px #00f3ff';
    };
    this.btnUse.onmouseleave = () => {
      this.btnUse!.style.background = 'transparent';
      this.btnUse!.style.color = '#00f3ff';
      this.btnUse!.style.boxShadow = 'none';
    };
    this.btnUse.onclick = () => this.onUse();
    this.itemInfo.appendChild(this.btnUse);

    // DROP 按钮
    this.btnDrop = document.createElement('button');
    this.btnDrop.textContent = '丢弃 [ DISCARD ]';
    Object.assign(this.btnDrop.style, {
      background: 'transparent',
      border: '1px solid #ff0055',
      color: '#ff0055',
      padding: '10px',
      marginTop: '10px',
      cursor: 'pointer',
      textAlign: 'center',
      fontWeight: 'bold',
      transition: 'all 0.2s',
      width: '100%',
    });
    this.btnDrop.onmouseenter = () => {
      this.btnDrop!.style.background = '#ff0055';
      this.btnDrop!.style.color = '#000';
      this.btnDrop!.style.boxShadow = '0 0 15px #ff0055';
    };
    this.btnDrop.onmouseleave = () => {
      this.btnDrop!.style.background = 'transparent';
      this.btnDrop!.style.color = '#ff0055';
      this.btnDrop!.style.boxShadow = 'none';
    };
    this.btnDrop.onclick = () => this.onDrop();
    this.itemInfo.appendChild(this.btnDrop);

    // === 关闭按钮 ===
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      position: 'absolute', top: '8px', right: '12px',
      background: 'transparent', border: '1px solid rgba(0,243,255,0.3)',
      color: '#00f3ff', fontSize: '1.2rem', cursor: 'pointer',
      padding: '4px 10px', zIndex: '10',
      transition: 'all 0.2s',
    });
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = 'rgba(0,243,255,0.2)';
      closeBtn.style.borderColor = '#00f3ff';
      closeBtn.style.boxShadow = '0 0 10px rgba(0,243,255,0.3)';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.borderColor = 'rgba(0,243,255,0.3)';
      closeBtn.style.boxShadow = 'none';
    };
    closeBtn.onclick = () => this.hide();
    inner.appendChild(closeBtn);

    this.detailsPanel.appendChild(this.itemInfo);
    inner.appendChild(this.detailsPanel);
    this.container.appendChild(inner);
    // 点击空白区域关闭
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.hide();
    });
    parent.appendChild(this.container);

    // === 左下角快捷图标（严格按模板） ===
    this.quickIcon = document.createElement('div');
    this.quickIcon.className = 'hud-backpack-btn';
    Object.assign(this.quickIcon.style, {
      position: 'absolute',
      bottom: '20px',
      right: '40px',
      width: '40px',
      height: '40px',
      background: 'rgba(0, 0, 0, 0.6)',
      border: '2px solid rgba(0, 243, 255, 0.3)',
      borderRadius: '8px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      cursor: 'pointer',
      zIndex: '100',
      transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      boxShadow: '0 0 15px rgba(0, 243, 255, 0.1)',
      backdropFilter: 'blur(5px)',
      // 呼吸浮动动画
      animation: 'hud-float 4s ease-in-out infinite',
    });
    // ::before 伪元素用真实DOM替代（INVENTORY [I] 标签）
    const quickLabel = document.createElement('div');
    Object.assign(quickLabel.style, {
      position: 'absolute',
      bottom: '100%',
      marginBottom: '4px',
      fontFamily: "'VT323', 'Noto Sans SC', monospace",
      fontSize: '0.7rem',
      color: 'rgba(0, 243, 255, 0.4)',
      letterSpacing: '1px',
      whiteSpace: 'nowrap',
      transition: 'color 0.3s',
    });
    quickLabel.textContent = 'INVENTORY [I]';
    this.quickIcon.appendChild(quickLabel);
    // 绘制背包像素图标
    const qCanvas = document.createElement('canvas');
    qCanvas.width = 16; qCanvas.height = 16;
    Object.assign(qCanvas.style, { width: '28px', height: '28px', imageRendering: 'pixelated' });
    const qCtx = qCanvas.getContext('2d')!;
    // 使用 BAG_PIXELS + BAG_PALETTE 渲染
    for (let y = 0; y < 16; y++) {
      const row = BAG_PIXELS[y] || '';
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        const c = BAG_PALETTE[ch];
        if (c) { qCtx.fillStyle = c; qCtx.fillRect(x, y, 1, 1); }
      }
    }
    qCanvas.style.filter = 'drop-shadow(0 0 6px rgba(0, 243, 255, 0.5))';
    this.quickIcon.appendChild(qCanvas);
    // glitch波纹层
    const glitchWave = document.createElement('div');
    glitchWave.className = 'hud-glitch-wave';
    this.quickIcon.appendChild(glitchWave);
    this.glitchWave = glitchWave;
    // 通知徽章
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      position: 'absolute', top: '-4px', right: '-4px',
      background: '#ff0055', color: 'white',
      fontFamily: "'VT323', monospace", fontSize: '0.7rem',
      padding: '1px 5px', borderRadius: '4px',
      boxShadow: '0 0 8px rgba(255, 0, 85, 0.6)',
      animation: 'pulse-danger 2s infinite',
      display: 'none',
    });
    badge.textContent = '0';
    this.badge = badge;
    this.quickIcon.appendChild(badge);
    // hover 效果
    this.quickIcon.onmouseenter = () => {
      this.quickIcon!.style.borderColor = '#00f3ff';
      this.quickIcon!.style.background = 'rgba(0, 243, 255, 0.1)';
      this.quickIcon!.style.boxShadow = '0 0 25px rgba(0, 243, 255, 0.3) inset, 0 0 20px rgba(0, 243, 255, 0.2)';
      this.quickIcon!.style.transform = 'scale(1.08) translateY(-3px)';
      quickLabel.style.color = '#00f3ff';
    };
    this.quickIcon.onmouseleave = () => {
      this.quickIcon!.style.borderColor = 'rgba(0, 243, 255, 0.3)';
      this.quickIcon!.style.background = 'rgba(0, 0, 0, 0.6)';
      this.quickIcon!.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.1)';
      this.quickIcon!.style.transform = '';
      quickLabel.style.color = 'rgba(0, 243, 255, 0.4)';
    };
    this.quickIcon.onclick = () => this.toggle();
    parent.appendChild(this.quickIcon);

    // === 拾取提示容器 ===
    this.toastContainer = document.createElement('div');
    Object.assign(this.toastContainer.style, {
      position: 'absolute',
      top: '80px',
      right: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: '160',
      pointerEvents: 'none',
    });
    parent.appendChild(this.toastContainer);
  }

  /** 切换显示（圆形展开动画） */
  toggle(): void {
    this.visible = !this.visible;
    if (this.visible) this.show();
    else this.hide();
  }

  /** 显示（从右下角圆形展开 + glitch波纹 + grid交错加载） */
  show(): void {
    this.visible = true;
    this.render();
    if (this.container) {
      this.container.style.opacity = '1';
      this.container.style.pointerEvents = 'auto';
      this.container.style.clipPath = 'circle(150% at 100% 100%)';
    }
    // glitch 波纹
    if (this.glitchWave) {
      this.glitchWave.style.animation = 'none';
      void this.glitchWave.offsetWidth; // 强制重绘
      this.glitchWave.style.animation = 'waveExpand 0.6s ease-out forwards';
    }
    // 隐藏通知徽章
    if (this.badge) this.badge.style.display = 'none';
    // grid 交错加载
    setTimeout(() => {
      if (this.gridPanel) {
        const slots = this.gridPanel.querySelectorAll('.inventory-slot');
        slots.forEach((slot, i) => {
          const el = slot as HTMLElement;
          el.style.animation = 'none';
          el.style.opacity = '0';
          void el.offsetWidth;
          el.style.animation = `gridSlotStagger 0.3s ease-out forwards`;
          el.style.animationDelay = `${i * 0.03 + 0.2}s`;
        });
      }
    }, 100);
  }

  /** 隐藏（收缩回右下角） */
  hide(): void {
    this.visible = false;
    if (this.container) {
      this.container.style.opacity = '0';
      this.container.style.pointerEvents = 'none';
      this.container.style.clipPath = 'circle(0% at 100% 100%)';
    }
  }

  /** 是否可见 */
  isVisible(): boolean {
    return this.visible;
  }

  /** 渲染网格 */
  render(): void {
    if (!this.gridPanel) return;
    this.gridPanel.innerHTML = '';

    const slots = this.inventory.getSlots();
    const maxSlots = this.inventory.getMaxSlots();

    for (let i = 0; i < maxSlots; i++) {
      const slotEl = document.createElement('div');
      slotEl.className = 'inventory-slot';
      Object.assign(slotEl.style, {
        background: 'rgba(0, 30, 40, 0.6)',
        border: '1px solid rgba(0, 243, 255, 0.3)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
      });

      const slot = slots[i];
      if (slot) {
        const def = ALL_ITEMS[slot.itemId];
        if (def) {
          // Canvas 图标
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          Object.assign(canvas.style, {
            width: '48px',
            height: '48px',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 0 4px rgba(0, 243, 255, 0.5))',
          });
          const ctx = canvas.getContext('2d');
          if (ctx) renderPixelArt(ctx, def.pixels);
          slotEl.appendChild(canvas);

          // 数量
          if (slot.qty > 1) {
            const qtyEl = document.createElement('div');
            qtyEl.textContent = `x${slot.qty}`;
            Object.assign(qtyEl.style, {
              position: 'absolute',
              bottom: '2px',
              right: '4px',
              fontSize: '0.7rem',
              color: '#fff',
              textShadow: '1px 1px 0 #000',
              fontWeight: 'bold',
            });
            slotEl.appendChild(qtyEl);
          }

          // 选中状态
          if (this.selectedItemId === slot.itemId) {
            slotEl.style.background = 'rgba(0, 243, 255, 0.15)';
            slotEl.style.borderColor = '#00f3ff';
            slotEl.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.3) inset';
          }

          // 点击
          slotEl.onclick = () => {
            this.selectedItemId = slot.itemId;
            this.showItemDetails(def);
            this.render();
          };
        }
      }

      // hover
      slotEl.onmouseenter = () => {
        if (!slot || this.selectedItemId !== slot?.itemId) {
          slotEl.style.background = 'rgba(0, 243, 255, 0.15)';
          slotEl.style.borderColor = '#00f3ff';
          slotEl.style.boxShadow = '0 0 15px rgba(0, 243, 255, 0.3) inset';
        }
      };
      slotEl.onmouseleave = () => {
        if (!slot || this.selectedItemId !== slot.itemId) {
          slotEl.style.background = 'rgba(0, 30, 40, 0.6)';
          slotEl.style.borderColor = 'rgba(0, 243, 255, 0.3)';
          slotEl.style.boxShadow = 'none';
        }
      };

      this.gridPanel.appendChild(slotEl);
    }
  }

  /** 显示物品详情 */
  private showItemDetails(def: ItemDef): void {
    if (!this.emptyDetails || !this.itemInfo) return;
    this.emptyDetails.style.display = 'none';
    this.itemInfo.style.display = 'block';

    if (this.infoName) this.infoName.textContent = def.name;
    if (this.infoType) this.infoType.textContent = def.typeLabel;
    if (this.infoDesc) this.infoDesc.textContent = def.desc;
    if (this.infoLore) this.infoLore.textContent = `"${def.lore}"`;

    if (this.infoCanvas) {
      const ctx = this.infoCanvas.getContext('2d');
      if (ctx) renderPixelArt(ctx, def.pixels);
    }
  }

  /** 使用物品 */
  private onUse(): void {
    if (!this.selectedItemId) return;
    const def = ALL_ITEMS[this.selectedItemId];
    if (!def) return;
    this.inventory.useItem(this.selectedItemId);
    this.selectedItemId = null;
    this.clearDetails();
    this.render();
  }

  /** 丢弃物品 */
  private onDrop(): void {
    if (!this.selectedItemId) return;
    const droppedId = this.selectedItemId;
    this.inventory.dropItem(droppedId);
    this.selectedItemId = null;
    this.clearDetails();
    this.render();
    if (this.onDropItem) this.onDropItem(droppedId);
  }

  /** 清空详情面板 */
  private clearDetails(): void {
    if (this.emptyDetails) this.emptyDetails.style.display = 'block';
    if (this.itemInfo) this.itemInfo.style.display = 'none';
  }

}
