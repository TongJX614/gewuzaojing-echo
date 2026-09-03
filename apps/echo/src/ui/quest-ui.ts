// ============================================================
// 任务追踪 UI — 显示当前追踪任务、顺序步骤与目标计数
// ============================================================

import { QuestManager } from '../systems/quest';

export class QuestUI {
  private container: HTMLDivElement;
  private lastSignature = '';

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'quest-ui';
    this.container.style.cssText =
      'position:absolute;top:10px;right:15px;z-index:10;pointer-events:none;max-width:285px;';
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  update(questManager: QuestManager): void {
    const view = questManager.getTrackedQuest();
    const signature = JSON.stringify(view);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    if (!view) {
      this.container.innerHTML = '';
      return;
    }

    const { definition, runtime, currentStep, currentStepRuntime } = view;
    const categoryLabel = definition.category === 'main'
      ? '主线'
      : definition.category === 'side' ? '支线' : '隐藏';
    const objectiveRows = currentStep?.objectives.map((objective, index) => {
      const progress = currentStepRuntime?.objectives[index];
      const needed = Math.max(1, Math.trunc(objective.count ?? 1));
      const current = Math.min(needed, progress?.current ?? 0);
      const marker = progress?.done ? '✓' : '›';
      const count = needed > 1 ? ` ${current}/${needed}` : '';
      return `<div style="display:flex;gap:6px;color:${progress?.done ? '#33ff88' : 'rgba(224,255,255,0.72)'};font-size:0.75rem;margin-top:3px;">
        <span>${marker}</span><span>${escapeHtml(objectiveLabel(objective.type, objective.target))}${count}</span>
      </div>`;
    }).join('') ?? '';

    this.container.innerHTML = `
      <div class="cyber-panel" style="border-left-color:#ffaa00;min-width:230px;">
        <div style="display:flex;justify-content:space-between;gap:12px;font-family:'ZCOOL QingKe HuangYou',sans-serif;font-size:0.72rem;color:#ffaa00;letter-spacing:2px;margin-bottom:5px;">
          <span>// 当前任务</span><span>${categoryLabel}</span>
        </div>
        <div class="crt-text" style="font-size:0.95rem;color:#e0ffff;">${escapeHtml(definition.title)}</div>
        <div style="font-size:0.75rem;color:rgba(224,255,255,0.45);margin-top:3px;">步骤 ${Math.min(runtime.currentStepIndex + 1, definition.steps.length)}/${definition.steps.length}</div>
        ${currentStep ? `<div style="font-size:0.82rem;color:#fff;margin-top:7px;">${escapeHtml(currentStep.desc)}</div>` : ''}
        ${objectiveRows}
      </div>`;
  }

  get element(): HTMLDivElement {
    return this.container;
  }
}

function objectiveLabel(type: string, target: string): string {
  const labels: Record<string, string> = {
    reach_location: '到达',
    talk_to_npc: '对话',
    collect_item: '收集',
    submit_item: '提交',
    trigger_event: '触发',
    custom_flag: '条件',
  };
  return `${labels[type] ?? type}：${target}`;
}

function escapeHtml(value: string): string {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#039;');
}
