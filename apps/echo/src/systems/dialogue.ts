// ============================================================
// Galgame 对话系统
// 逐字显示 + 选项分支 + 打字机效果
// ============================================================

import { DialogueTree, DialogueNode, DialogueChoice, Emotion, EventType } from '../data/dialogues';
import { CHARACTERS } from '../data/characters';
import { PALETTE } from '../assets/palettes';
import type { NarrativeAction } from './condition-action';

export interface DialogueState {
  active: boolean;
  tree: DialogueTree | null;
  currentNode: DialogueNode | null;
  lineIndex: number;
  /** 当前行的已显示字符数 */
  charIndex: number;
  /** 逐字显示完成 */
  lineComplete: boolean;
  /** 所有行已显示完 */
  allLinesComplete: boolean;
  /** 当前说话者名称 */
  speakerName: string;
  /** 当前说话者 ID */
  speakerId: string;
  /** 当前情绪 */
  currentEmotion: Emotion;
  /** 对话中的NPC ID（用于立绘显示） */
  npcId: string;
  /** 当前显示文本 */
  displayText: string;
  /** 当前选项 */
  choices: DialogueChoice[];
  /** 打字速度（ms/字） */
  typeSpeed: number;
  /** 已触发效果列表 */
  triggeredEffects: string[];
  /** 事件类型：type1=立绘+背景, type2=CG全屏 */
  eventType: EventType;
  /** event_type2 时的 CG 图片 URL */
  cgUrl: string;
}

export class DialogueSystem {
  public state: DialogueState;
  private onEffect: ((effect: string) => void) | null;
  private onActions: ((actions: NarrativeAction[]) => void) | null = null;
  private onEnd: ((tree: DialogueTree) => void) | null = null;

  constructor(onEffect?: (effect: string) => void) {
    this.onEffect = onEffect ?? null;
    this.state = this.createInitialState();
  }

  /** 注册 typed actions 回调，用于替代旧的 effect 字符串 */
  setOnActions(callback: ((actions: NarrativeAction[]) => void) | null): void {
    this.onActions = callback;
  }

  /** 注册一次对话完整结束后的通知，用于任务事件上报。 */
  setOnEnd(callback: ((tree: DialogueTree) => void) | null): void {
    this.onEnd = callback;
  }

  private createInitialState(): DialogueState {
    return {
      active: false,
      tree: null,
      currentNode: null,
      lineIndex: 0,
      charIndex: 0,
      lineComplete: false,
      allLinesComplete: false,
      speakerName: '',
      speakerId: '',
      currentEmotion: 'idle' as Emotion,
      npcId: '',
      displayText: '',
      choices: [],
      typeSpeed: 30,
      triggeredEffects: [],
      eventType: 'event_type1',
      cgUrl: '',
    };
  }

  /** 开始对话 */
  start(tree: DialogueTree): void {
    const startNode = tree.nodes[tree.startNode];
    if (!startNode) return;

    // 从 trigger 推断 npcId（trigger 为 NPC id 时）
    const npcId = tree.trigger !== 'auto' && !['su_ran', 'narrator'].includes(tree.trigger) ? tree.trigger : '';

    this.state = {
      ...this.createInitialState(),
      active: true,
      tree,
      currentNode: startNode,
      npcId,
      triggeredEffects: this.state.triggeredEffects,
      eventType: tree.eventType ?? 'event_type1',
      cgUrl: tree.cgUrl ?? '',
    };
    this.loadLine();
  }

  /** 加载当前行 */
  private loadLine(): void {
    const node = this.state.currentNode;
    if (!node) return;

    const line = node.lines[this.state.lineIndex];
    if (!line) {
      this.state.allLinesComplete = true;
      // 检查是否有选项
      if (node.choices && node.choices.length > 0) {
        this.state.choices = node.choices;
      }
      return;
    }

    // 解析说话者名称
    if (line.speaker === 'narrator') {
      this.state.speakerName = '旁白';
      this.state.speakerId = 'narrator';
    } else {
      const charData = CHARACTERS[line.speaker];
      this.state.speakerName = charData?.name ?? line.speaker;
      this.state.speakerId = line.speaker;
    }
    this.state.currentEmotion = line.emotion ?? 'idle';

    this.state.displayText = line.text;
    this.state.charIndex = 0;
    this.typeAccum = 0;
    this.state.lineComplete = false;
    this.state.allLinesComplete = false;
    this.state.choices = [];
  }

  /** 累积器：处理dt小于typeSpeed时每帧charsToAdd=0的问题 */
  private typeAccum = 0;

  /** 每帧更新打字效果 */
  update(dt: number): void {
    if (!this.state.active || this.state.lineComplete || this.state.allLinesComplete) return;

    this.typeAccum += dt;
    const charsToAdd = Math.floor(this.typeAccum / this.state.typeSpeed);
    if (charsToAdd > 0) {
      this.typeAccum -= charsToAdd * this.state.typeSpeed;
      this.state.charIndex = Math.min(
        this.state.charIndex + charsToAdd,
        this.state.displayText.length,
      );
      if (this.state.charIndex >= this.state.displayText.length) {
        this.state.lineComplete = true;
      }
    }
  }

  /** 点击推进：完成当前行 / 下一行 / 下一节点 */
  advance(): void {
    if (!this.state.active) return;

    // 如果行未打完，立即打完
    if (!this.state.lineComplete && !this.state.allLinesComplete) {
      this.state.charIndex = this.state.displayText.length;
      this.state.lineComplete = true;
      return;
    }

    const node = this.state.currentNode;
    if (!node) return;

    // 下一行
    const nextLineIdx = this.state.lineIndex + 1;
    if (nextLineIdx < node.lines.length) {
      this.state.lineIndex = nextLineIdx;
      this.loadLine();
      return;
    }

    // 所有行已完，如有选项等玩家选择
    if (node.choices && node.choices.length > 0) {
      this.state.allLinesComplete = true;
      this.state.choices = node.choices;
      return;
    }

    // 无选项，自动跳转
    if (node.next) {
      this.jumpToNode(node.next);
      return;
    }

    // 对话结束
    this.end();
  }

  /** 选择一个选项 */
  choose(choice: DialogueChoice): void {
    // typed actions（新格式）
    if (choice.actions?.length && this.onActions) {
      this.onActions(choice.actions);
    }
    // 旧格式 effect 字符串（向后兼容）
    if (choice.effect && this.onEffect) {
      this.onEffect(choice.effect);
      this.state.triggeredEffects.push(choice.effect);
    }

    if (choice.next) {
      this.jumpToNode(choice.next);
    } else {
      this.end();
    }
  }

  /** 跳转到指定节点 */
  private jumpToNode(nodeId: string): void {
    const tree = this.state.tree;
    if (!tree) return;
    const node = tree.nodes[nodeId];
    if (!node) {
      this.end();
      return;
    }
    this.state.currentNode = node;
    this.state.lineIndex = 0;
    this.state.allLinesComplete = false;
    this.state.choices = [];
    if (node.cgUrl) this.state.cgUrl = node.cgUrl;
    this.loadLine();
  }

  /** 结束对话 */
  end(): void {
    const completedTree = this.state.tree;
    this.state.active = false;
    this.state.choices = [];
    this.state.allLinesComplete = true;
    if (completedTree) this.onEnd?.(completedTree);
  }

  /** 获取当前行已打出的文本 */
  get visibleText(): string {
    return this.state.displayText.slice(0, this.state.charIndex);
  }

  /** 注入 AI 生成的对话节点，正确加载并渲染 */
  injectNode(node: DialogueNode, replyNodes?: DialogueNode[]): void {
    // 注册 AI 生成的 reply 节点到当前 tree 的 nodes map
    if (replyNodes && this.state.tree) {
      const treeNodes = this.state.tree.nodes as Record<string, DialogueNode>;
      for (const rn of replyNodes) {
        if (rn.id && !treeNodes[rn.id]) treeNodes[rn.id] = rn;
      }
    }
    this.state.currentNode = node;
    this.state.lineIndex = 0;
    this.state.charIndex = 0;
    this.state.lineComplete = false;
    this.state.allLinesComplete = false;
    this.loadLine();
  }

  get isActive(): boolean {
    return this.state.active;
  }

  private static readonly SPEAKER_COLORS: Record<string, string> = {
    su_ran: PALETTE.neonCyan,
    lin_xiao: PALETTE.neonAmber,
    du_weiming: PALETTE.neonMagenta,
  };

  get speakerColor(): string {
    if (!this.state.currentNode) return PALETTE.uiText;
    const line = this.state.currentNode.lines[this.state.lineIndex];
    if (!line) return PALETTE.uiText;
    if (line.speaker === 'narrator') return PALETTE.uiTextDim;
    return DialogueSystem.SPEAKER_COLORS[line.speaker] ?? PALETTE.uiText;
  }
}
