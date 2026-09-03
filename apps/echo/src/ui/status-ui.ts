// ============================================================
// 状态 HUD — 赛博朋克全息玻璃面板 + 网格条形图
// 脏检查：仅数值变化时才更新 DOM
// ============================================================

import { Player } from '../entities/player';

export class StatusUI {
  private container: HTMLDivElement;
  private nameLabel: HTMLSpanElement;
  private levelLabel: HTMLSpanElement;
  private hpLabel: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpGrid: HTMLDivElement;
  private expLabel: HTMLDivElement;
  private expFill: HTMLDivElement;
  private expGrid: HTMLDivElement;
  private sceneLabel: HTMLSpanElement;

  // 上次渲染的值，用于脏检查
  private lastHp = -1;
  private lastMaxHp = -1;
  private lastExp = -1;
  private lastLevel = -1;
  private lastScene = '';

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'status-ui';
    this.container.style.cssText =
      'position:absolute;top:10px;left:15px;z-index:10;pointer-events:none;display:flex;flex-direction:column;gap:6px;';

    // 主状态模块
    const mainPanel = document.createElement('div');
    mainPanel.className = 'cyber-panel';
    mainPanel.style.cssText = 'display:flex;flex-direction:column;gap:5px;';

    // 标题行
    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:baseline;gap:8px;';

    this.nameLabel = document.createElement('span');
    this.nameLabel.className = 'cyber-label crt-text';
    this.nameLabel.style.cssText = 'font-size:1.2rem;';
    this.nameLabel.textContent = '苏然';

    this.levelLabel = document.createElement('span');
    this.levelLabel.style.cssText = "font-family:'ZCOOL QingKe HuangYou',sans-serif;font-size:0.85rem;color:#00f3ff;letter-spacing:1px;";
    this.levelLabel.textContent = 'Lv.1';

    titleRow.appendChild(this.nameLabel);
    titleRow.appendChild(this.levelLabel);

    // HP 条
    const hpSection = document.createElement('div');
    this.hpLabel = document.createElement('div');
    this.hpLabel.className = 'cyber-label';
    this.hpLabel.style.cssText = 'font-size:0.75rem;margin-bottom:3px;';

    const hpBarContainer = document.createElement('div');
    hpBarContainer.className = 'cyber-bar-container';
    this.hpFill = document.createElement('div');
    this.hpFill.className = 'cyber-bar-fill';
    this.hpGrid = document.createElement('div');
    this.hpGrid.className = 'cyber-bar-grid';
    hpBarContainer.appendChild(this.hpFill);
    hpBarContainer.appendChild(this.hpGrid);
    hpSection.appendChild(this.hpLabel);
    hpSection.appendChild(hpBarContainer);

    // EXP 条
    const expSection = document.createElement('div');
    this.expLabel = document.createElement('div');
    this.expLabel.className = 'cyber-label';
    this.expLabel.style.cssText = 'font-size:0.75rem;margin-bottom:3px;';

    const expBarContainer = document.createElement('div');
    expBarContainer.className = 'cyber-bar-container';
    expBarContainer.style.borderColor = 'rgba(255,170,0,0.25)';
    this.expFill = document.createElement('div');
    this.expFill.className = 'cyber-bar-fill';
    this.expFill.style.backgroundColor = '#ffaa00';
    this.expFill.style.boxShadow = '0 0 10px #ffaa00';
    this.expGrid = document.createElement('div');
    this.expGrid.className = 'cyber-bar-grid';
    expBarContainer.appendChild(this.expFill);
    expBarContainer.appendChild(this.expGrid);
    expSection.appendChild(this.expLabel);
    expSection.appendChild(expBarContainer);

    mainPanel.appendChild(titleRow);
    mainPanel.appendChild(hpSection);
    mainPanel.appendChild(expSection);

    // 场景名称模块
    const scenePanel = document.createElement('div');
    scenePanel.className = 'cyber-panel';
    scenePanel.style.cssText = 'padding:6px 12px;';
    this.sceneLabel = document.createElement('span');
    this.sceneLabel.style.cssText = "font-family:'ZCOOL QingKe HuangYou',sans-serif;font-size:0.75rem;color:rgba(0,243,255,0.7);letter-spacing:3px;";
    scenePanel.appendChild(this.sceneLabel);

    this.container.appendChild(mainPanel);
    this.container.appendChild(scenePanel);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  update(player: Player, sceneName: string): void {
    const { hp, maxHp, exp, level } = player.state;

    // 脏检查：数值未变则跳过 DOM 更新
    if (hp === this.lastHp && maxHp === this.lastMaxHp &&
        exp === this.lastExp && level === this.lastLevel &&
        sceneName === this.lastScene) {
      return;
    }

    this.lastHp = hp;
    this.lastMaxHp = maxHp;
    this.lastExp = exp;
    this.lastLevel = level;
    this.lastScene = sceneName;

    const hpPct = Math.round((hp / maxHp) * 100);
    const needed = level * 100;
    const expPct = Math.round((exp / needed) * 100);
    const hpCritical = hpPct <= 25;

    this.levelLabel.textContent = 'Lv.' + level;
    this.hpLabel.textContent = 'HP ' + hp + '/' + maxHp;
    this.hpFill.style.width = hpPct + '%';

    if (hpCritical) {
      this.hpFill.classList.add('critical');
    } else {
      this.hpFill.classList.remove('critical');
    }

    this.expLabel.textContent = 'EXP ' + exp + '/' + needed;
    this.expFill.style.width = expPct + '%';
    this.sceneLabel.textContent = '// ' + sceneName;
  }

  get element(): HTMLDivElement {
    return this.container;
  }
}
