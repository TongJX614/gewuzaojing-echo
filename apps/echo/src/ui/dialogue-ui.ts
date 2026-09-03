// ============================================================
// 对话框 UI — 赛博朋克全息对话系统 + DLG 肖像
// 严格执行硬科幻悬疑 UI 协议（逐行对照参考 HTML）
// + 对话历史回看 + Auto 模式
// ============================================================

import { DialogueSystem, DialogueState } from '../systems/dialogue';
import { Emotion, DialogueChoice, DialogueNode } from '../data/dialogues';
import { getDlgPortrait } from '../assets/dlg-portraits';
import { getCG, loadCG } from '../assets/cg-images';

const PLAYER_IDS = new Set(['su_ran']);

/** 对话历史条目 */
export interface DialogueLogEntry {
  speakerId: string;
  speakerName: string;
  text: string;
  emotion: Emotion;
  eventType: string;
}

export class DialogueUI {
  private dialogue: DialogueSystem;
  /** 全屏容器：激活时覆盖全屏可点击 */
  private overlay: HTMLDivElement;
  /** #dialogue-container — 居中底部面板容器 */
  private dlgContainer: HTMLDivElement;
  /** #speaker-name-box — 说话者彩色标签 */
  private speakerBox: HTMLDivElement;
  /** #dialogue-box — 对话面板 */
  private dlgBox: HTMLDivElement;
  /** #dialogue-text — 对话正文 */
  private textEl: HTMLDivElement;
  /** 打字光标 .cursor */
  private cursorEl: HTMLSpanElement;
  /** ▼ 继续提示 #continue-indicator */
  private continueEl: HTMLDivElement;
  /** #options-container — 选项容器（浮在面板上方） */
  private choicesEl: HTMLDivElement;
  /** AI 自由提问输入区 */
  private aiInputWrap: HTMLDivElement | null = null;
  private aiTextInput: HTMLInputElement | null = null;
  private aiSendBtn: HTMLButtonElement | null = null;
  private aiStatusEl: HTMLSpanElement | null = null;
  private aiThinking: boolean = false;
  private aiChatHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  /** 已选过的选项文本，用于重新显示时标记「已读」 */
  private usedChoices: Set<string> = new Set();
  /** 左侧立绘 (NPC) */
  private portraitLeftEl: HTMLDivElement;
  /** 右侧立绘 (主角) */
  private portraitRightEl: HTMLDivElement;
  /** CG 全屏图片 (event_type2) */
  private cgEl: HTMLImageElement;

  // ---- 控制按钮 ----
  private controlsEl: HTMLDivElement;
  private autoBtn: HTMLButtonElement;
  private historyBtn: HTMLButtonElement;

  // ---- 对话历史回看 ----
  private logEntries: DialogueLogEntry[] = [];
  private logPanel: HTMLDivElement;
  private logVisible: boolean = false;
  private lastLoggedLine: string = ''; // 防止重复记录

  // ---- Auto 模式 ----
  private autoMode: boolean = false;
  private autoTimeout: number = 0;
  private autoScheduled: boolean = false; // 防止每帧重复调度

  // 脏检查
  private lastChoiceTexts: string = '';
  private lastSpeakerText: string = '';
  private lastDisplayText: string = '';
  private leftImgEl: HTMLImageElement | null = null;
  private rightImgEl: HTMLImageElement | null = null;
  private currentCgUrl: string = '';
  private lastShakeEmotion: string = ''; // 防止连续两次shake
  private onAdvance: (() => void) | null = null;
  private onChoice: ((idx: number) => void) | null = null;
  private visible: boolean = false;
  private paused: boolean = false;

  constructor(dialogue: DialogueSystem, parent: HTMLElement) {
    this.dialogue = dialogue;

    // ===== 全屏覆盖层 =====
    this.overlay = document.createElement('div');
    this.overlay.style.cssText =
      'position:absolute;inset:0;z-index:100;pointer-events:none;display:none;cursor:pointer;';

    // 全屏点击 → 推进对话
    this.overlay.addEventListener('click', (e: Event) => {
      if (this.paused) return;
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if (this.logVisible) { this.hideLog(); return; }
      if (this.dialogue.isActive && this.onAdvance) {
        this.onAdvance();
      }
    });

    // 空格键 → 推进对话
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.paused) return;
      if (e.code === 'Space' && this.dialogue.isActive) {
        if (this.logVisible) { this.hideLog(); return; }
        e.preventDefault();
        if (this.onAdvance) this.onAdvance();
      }
      // A 键 → 切换 Auto 模式
      if (e.code === 'KeyA' && this.dialogue.isActive) {
        e.preventDefault();
        this.toggleAuto();
      }
      // L 键 → 打开回看（对话中/外均可）
      if (e.code === 'KeyL') {
        e.preventDefault();
        this.toggleLog();
      }
    });

    // 鼠标滚轮向上 → 打开回看
    this.overlay.addEventListener('wheel', (e: WheelEvent) => {
      if (!this.paused && this.dialogue.isActive && e.deltaY < 0) {
        e.preventDefault();
        this.showLog();
      }
    }, { passive: false });

    // --- 左侧立绘 (NPC) ---
    this.portraitLeftEl = document.createElement('div');
    this.portraitLeftEl.style.cssText =
      'position:absolute;left:0;top:0;bottom:0;width:30%;' +
      'display:flex;justify-content:center;align-items:flex-end;' +
      'pointer-events:none;overflow:hidden;z-index:1;';
    this.overlay.appendChild(this.portraitLeftEl);

    // --- 右侧立绘 (主角) ---
    this.portraitRightEl = document.createElement('div');
    this.portraitRightEl.style.cssText =
      'position:absolute;right:0;top:0;bottom:0;width:30%;' +
      'display:flex;justify-content:center;align-items:flex-end;' +
      'pointer-events:none;overflow:hidden;z-index:1;';
    this.overlay.appendChild(this.portraitRightEl);

    // --- CG 全屏图 (event_type2) ---
    this.cgEl = document.createElement('img');
    this.cgEl.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'object-fit:cover;pointer-events:none;z-index:0;display:none;';
    this.overlay.appendChild(this.cgEl);

    // ===== #options-container — 浮在面板上方 bottom:200px =====
    this.choicesEl = document.createElement('div');
    this.choicesEl.style.cssText =
      'position:absolute;bottom:200px;left:50%;transform:translateX(-50%);' +
      'width:75%;display:none;flex-direction:column;gap:10px;z-index:30;pointer-events:auto;';
    this.overlay.appendChild(this.choicesEl);

    // ===== #ai-chat-input — AI 自由对话输入框 =====
    this.aiInputWrap = document.createElement('div');
    this.aiInputWrap.style.cssText =
      'position:absolute;bottom:120px;left:50%;transform:translateX(-50%);' +
      'width:70%;display:none;flex-direction:row;gap:8px;z-index:35;pointer-events:auto;' +
      'align-items:center;background:rgba(0,0,0,0.7);border:1px solid rgba(0,243,255,0.4);' +
      'border-radius:4px;padding:6px 10px;';

    const aiLabel = document.createElement('span');
    aiLabel.textContent = '🤖';
    aiLabel.style.cssText = 'font-size:1.2rem;flex-shrink:0;';
    this.aiInputWrap.appendChild(aiLabel);

    this.aiTextInput = document.createElement('input');
    this.aiTextInput.type = 'text';
    this.aiTextInput.placeholder = '问点什么... (Enter 发送)';
    this.aiTextInput.style.cssText =
      'flex-grow:1;background:transparent;border:none;color:#e0f7fa;font-size:0.95rem;' +
      'outline:none;font-family:inherit;padding:4px 6px;';
    this.aiInputWrap.appendChild(this.aiTextInput);

    this.aiSendBtn = document.createElement('button');
    this.aiSendBtn.textContent = '发送';
    this.aiSendBtn.style.cssText =
      'flex-shrink:0;background:rgba(0,243,255,0.15);border:1px solid rgba(0,243,255,0.5);' +
      'color:#00F3FF;padding:4px 14px;border-radius:3px;cursor:pointer;font-size:0.85rem;font-family:inherit;';
    this.aiInputWrap.appendChild(this.aiSendBtn);

    this.overlay.appendChild(this.aiInputWrap);

    // ===== #dialogue-container — 居中底部 =====
    this.dlgContainer = document.createElement('div');
    this.dlgContainer.style.cssText =
      'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);' +
      'width:85%;max-width:1000px;z-index:20;display:flex;flex-direction:column;gap:0;';

    // ===== 控制按钮容器 .dialogue-controls =====
    this.controlsEl = document.createElement('div');
    this.controlsEl.style.cssText =
      'position:absolute;bottom:100%;right:0;display:flex;gap:10px;' +
      'margin-bottom:5px;z-index:25;';

    // 自动播放按钮
    this.autoBtn = document.createElement('button');
    this.autoBtn.className = 'control-btn';
    this.autoBtn.innerHTML = '自动播放 [OFF]';
    this.autoBtn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.toggleAuto();
    });
    this.controlsEl.appendChild(this.autoBtn);

    // 历史记录按钮
    this.historyBtn = document.createElement('button');
    this.historyBtn.className = 'control-btn';
    this.historyBtn.textContent = '历史记录';
    this.historyBtn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.toggleLog();
    });
    this.controlsEl.appendChild(this.historyBtn);

    this.dlgContainer.appendChild(this.controlsEl);

    // ===== #speaker-name-box =====
    this.speakerBox = document.createElement('div');
    this.speakerBox.style.cssText =
      'align-self:flex-start;' +
      'background-color:#00f3ff;color:#000;' +
      'font-family:"ZCOOL QingKe HuangYou",sans-serif;font-size:1.3rem;font-weight:400;' +
      'padding:4px 20px;letter-spacing:2px;display:inline-block;' +
      'clip-path:polygon(0 0,calc(100% - 15px) 0,100% 100%,0 100%);' +
      'margin-bottom:-1px;z-index:2;' +
      'box-shadow:0 0 10px #00f3ff;transition:all 0.3s;';
    this.dlgContainer.appendChild(this.speakerBox);

    // ===== #dialogue-box =====
    this.dlgBox = document.createElement('div');
    this.dlgBox.style.cssText =
      'background:rgba(2,10,18,0.6);backdrop-filter:blur(8px);' +
      'border:1px solid rgba(0,243,255,0.25);border-top:2px solid #00f3ff;' +
      'padding:25px 35px;min-height:140px;position:relative;' +
      'box-shadow:0 10px 30px rgba(0,0,0,0.5),inset 0 0 20px rgba(0,243,255,0.05);' +
      'clip-path:polygon(0 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%);';
    this.dlgContainer.appendChild(this.dlgBox);

    // ===== #dialogue-text =====
    this.textEl = document.createElement('div');
    this.textEl.style.cssText =
      'font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;' +
      'font-weight:700;font-size:1.5rem;line-height:1.4;' +
      'color:#e0ffff;letter-spacing:2px;' +
      'text-shadow:2px 0px 1px rgba(255,0,85,0.5),-2px 0px 1px rgba(0,243,255,0.5);';
    this.dlgBox.appendChild(this.textEl);

    // 打字光标
    this.cursorEl = document.createElement('span');
    this.cursorEl.className = 'cursor';
    this.cursorEl.style.cssText =
      'display:inline-block;width:14px;height:1.1em;' +
      'background-color:#00f3ff;vertical-align:text-bottom;' +
      'margin-left:6px;box-shadow:0 0 8px #00f3ff;' +
      'animation:dlg-blink 1s step-end infinite;';

    // ▼ 继续提示
    this.continueEl = document.createElement('div');
    this.continueEl.id = 'continue-indicator';
    this.continueEl.style.cssText =
      'position:absolute;bottom:15px;right:20px;color:#00f3ff;' +
      'font-size:1.2rem;cursor:pointer;display:none;' +
      'animation:dlg-blink 1s step-end infinite;';
    this.continueEl.textContent = '▼';
    this.dlgBox.appendChild(this.continueEl);

    this.overlay.appendChild(this.dlgContainer);

    // ===== 历史记录面板 #history-modal (与 dialogue-container 同级) =====
    this.logPanel = document.createElement('div');
    this.logPanel.id = 'history-modal';
    this.logPanel.style.cssText =
      'position:absolute;inset:40px;z-index:200;display:none;' +
      'background:rgba(2,10,18,0.95);backdrop-filter:blur(10px);' +
      'border:1px solid #00f3ff;flex-direction:column;padding:20px;' +
      'box-shadow:0 0 30px rgba(0,243,255,0.1) inset;pointer-events:auto;';

    // 标题栏
    const logHeader = document.createElement('div');
    logHeader.className = 'history-header';
    logHeader.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;' +
      'border-bottom:1px solid rgba(0,243,255,0.2);padding-bottom:10px;margin-bottom:15px;';

    const logTitle = document.createElement('div');
    logTitle.className = 'history-title';
    logTitle.style.cssText =
      'font-family:"ZCOOL QingKe HuangYou",sans-serif;font-size:1.5rem;' +
      'color:#00f3ff;letter-spacing:2px;';
    logTitle.textContent = '通信记录归档';
    logHeader.appendChild(logTitle);

    const logCloseBtn = document.createElement('button');
    logCloseBtn.className = 'control-btn';
    logCloseBtn.textContent = '关闭 [X]';
    logCloseBtn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.hideLog();
    });
    logHeader.appendChild(logCloseBtn);
    this.logPanel.appendChild(logHeader);

    // 滚动内容区
    const logContent = document.createElement('div');
    logContent.id = 'history-content';
    logContent.style.cssText =
      'flex:1;overflow-y:auto;overflow-x:hidden;padding-right:10px;' +
      'display:flex;flex-direction:column;gap:15px;';
    this.logPanel.appendChild(logContent);

    parent.appendChild(this.logPanel);

    // ESC 关闭回看
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape' && this.logVisible) {
        e.preventDefault();
        this.hideLog();
      }
    });

    parent.appendChild(this.overlay);
  }

  mount(): void { /* already mounted in constructor */ }

  setCallbacks(onAdvance: () => void, onChoice: (idx: number) => void): void {
    this.onAdvance = onAdvance;
    this.onChoice = onChoice;
  }

  /** 系统菜单打开时冻结对话输入与自动播放。 */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      clearTimeout(this.autoTimeout);
      this.autoScheduled = false;
    }
  }

  /** 获取对话历史（供存档系统使用） */
  getLogEntries(): DialogueLogEntry[] {
    return this.logEntries;
  }

  /** 恢复对话历史（供读档系统使用） */
  setLogEntries(entries: DialogueLogEntry[]): void {
    this.logEntries = entries;
  }

  /** 切换 Auto 模式 */
  toggleAuto(): void {
    if (this.paused) return;
    this.autoMode = !this.autoMode;
    if (this.autoMode) {
      this.autoBtn.innerHTML = '自动播放 [ON]';
      this.autoBtn.classList.add('active');
      // 如果当前对话已完成，立刻启动倒计时
      const state = this.dialogue.state;
      if (state.active && state.lineComplete && !state.allLinesComplete && this.onAdvance) {
        const delay = Math.max(1500, state.displayText.length * 60);
        this.scheduleNext(delay);
      }
    } else {
      this.autoBtn.innerHTML = '自动播放 [OFF]';
      this.autoBtn.classList.remove('active');
      clearTimeout(this.autoTimeout);
    }
  }

  /** 获取 Auto 模式状态 */
  isAutoMode(): boolean {
    return this.autoMode;
  }

  /** 调度下一次自动推进（带延迟） */
  private scheduleNext(delayMs: number): void {
    clearTimeout(this.autoTimeout);
    this.autoTimeout = window.setTimeout(() => {
      if (!this.paused && this.autoMode && this.onAdvance) {
        this.onAdvance();
      }
    }, delayMs);
  }

  /** 切换回看面板 */
  toggleLog(): void {
    if (this.logVisible) this.hideLog();
    else this.showLog();
  }

  private showLog(): void {
    if (this.logEntries.length === 0) return;
    this.logVisible = true;
    this.logPanel.style.display = 'flex';
    this.renderLog();
    requestAnimationFrame(() => {
      const content = this.logPanel.querySelector('#history-content') as HTMLDivElement;
      if (content) content.scrollTop = content.scrollHeight;
    });
  }

  private hideLog(): void {
    this.logVisible = false;
    this.logPanel.style.display = 'none';
  }

  private renderLog(): void {
    const content = this.logPanel.querySelector('#history-content') as HTMLDivElement;
    if (!content) return;
    content.innerHTML = '';
    const nameMap: Record<string, string> = {
      su_ran: '苏然', lin_xiao: '林晓', du_weiming: '杜维明', astro_scientist: '研究员', researcher: 'VR研究员', narrator: '系统通知',
      solvay_einstein: '爱因斯坦', solvay_bohr: '玻尔', solvay_curie: '玛丽·居里',
      solvay_heisenberg: '海森堡', solvay_schrodinger: '薛定谔', solvay_pauli: '泡利',
      solvay_born: '玻恩', solvay_lorentz: '洛伦兹', solvay_debroglie: '德布罗意',
    };
    for (const entry of this.logEntries) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:10px;';
      const isNarration = !entry.speakerId || entry.speakerId === 'narrator';
      const isPlayerChoice = entry.speakerName === '指令输入';
      const displayName = nameMap[entry.speakerId] || entry.speakerName || '???';
      const speakerColor = isPlayerChoice
        ? '#ffaa00'
        : isNarration
          ? '#ff0055'
          : PLAYER_IDS.has(entry.speakerId)
            ? '#00f3ff'
            : '#ff2d6f';

      const speakerEl = document.createElement('div');
      speakerEl.style.cssText = 'color:' + speakerColor + ';font-weight:bold;margin-bottom:4px;';
      speakerEl.textContent = displayName;
      row.appendChild(speakerEl);

      const textEl = document.createElement('div');
      textEl.className = isNarration ? 'history-item-text danger' : 'history-item-text';
      textEl.style.cssText =
        'font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;' +
        'font-weight:700;font-size:1.1rem;line-height:1.5;' +
        'color:#e0ffff;letter-spacing:1px;' +
        'text-shadow:1px 0px 0.5px rgba(255,0,85,0.3),-1px 0px 0.5px rgba(0,243,255,0.3);';
      textEl.textContent = entry.text;
      row.appendChild(textEl);

      content.appendChild(row);
    }
    content.scrollTop = content.scrollHeight;
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.overlay.style.display = 'block';
    this.overlay.style.pointerEvents = 'auto';
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.overlay.style.display = 'none';
    this.overlay.style.pointerEvents = 'none';
    clearTimeout(this.autoTimeout);
    this.portraitLeftEl.innerHTML = '';
    this.portraitRightEl.innerHTML = '';
    this.leftImgEl = null;
    this.rightImgEl = null;
    this.lastChoiceTexts = '';
    this.lastSpeakerText = '';
    this.lastDisplayText = '';
    this.lastLoggedLine = '';
    this.usedChoices.clear();
    this.choicesEl.style.display = 'none';
    this.continueEl.style.display = 'none';
    this.cgEl.style.display = 'none';
    this.currentCgUrl = '';
    this.portraitLeftEl.style.display = 'flex';
    this.portraitRightEl.style.display = 'flex';
    this.autoMode = false;
    this.autoBtn.innerHTML = '自动播放 [OFF]';
    this.autoBtn.classList.remove('active');
    this.hideLog();
    if (this.textEl.contains(this.cursorEl)) {
      this.textEl.removeChild(this.cursorEl);
    }
  }

  update(): void {
    const state = this.dialogue.state;
    if (!state.active) {
      this.hide();
      return;
    }
    this.show();

    // --- 记录对话历史（行完成时记录，防重复）---
    if (state.lineComplete || state.allLinesComplete) {
      const lineKey = `${state.speakerId}|${state.displayText}|${state.lineIndex}`;
      if (lineKey !== this.lastLoggedLine && state.displayText) {
        this.lastLoggedLine = lineKey;
        const nameMap: Record<string, string> = {
          su_ran: '苏然', lin_xiao: '林晓', du_weiming: '杜维明', astro_scientist: '研究员', researcher: 'VR研究员', narrator: '系统通知',
        };
        this.logEntries.push({
          speakerId: state.speakerId,
          speakerName: nameMap[state.speakerId] || state.speakerName,
          text: state.displayText,
          emotion: state.currentEmotion,
          eventType: state.eventType,
        });
      }
    }

    // --- Auto 模式计时（基于文本长度的延迟）---
    if (!this.paused && this.autoMode && state.lineComplete && !state.allLinesComplete && this.onAdvance && !this.autoScheduled) {
      const delay = Math.max(1500, state.displayText.length * 60);
      this.autoScheduled = true;
      this.scheduleNext(delay);
    }
    // 行未完成或对话未激活时重置调度标记
    if (!state.lineComplete || !state.active) {
      this.autoScheduled = false;
    }
    // 有选项时暂停 Auto
    if (this.autoMode && state.allLinesComplete && state.choices && state.choices.length > 0) {
      clearTimeout(this.autoTimeout);
      this.autoScheduled = false;
    }

    // --- event_type2: CG 全屏模式 ---
    if (state.eventType === 'event_type2') {
      this.portraitLeftEl.style.display = 'none';
      this.portraitRightEl.style.display = 'none';
      this.cgEl.style.display = 'block';
      if (state.cgUrl && state.cgUrl !== this.currentCgUrl) {
        this.currentCgUrl = state.cgUrl;
        const cached = getCG(state.cgUrl);
        if (cached) {
          this.cgEl.src = cached.src;
        } else {
          loadCG(state.cgUrl).then(img => { this.cgEl.src = img.src; });
        }
      }
    } else {
      this.portraitLeftEl.style.display = 'flex';
      this.portraitRightEl.style.display = 'flex';
      this.cgEl.style.display = 'none';
    }

    // --- 说话者名称 ---
    const charId = state.speakerId;
    const nameMap: Record<string, string> = {
      su_ran: '苏然', lin_xiao: '林晓', du_weiming: '杜维明', astro_scientist: '研究员', researcher: 'VR研究员', narrator: '系统通知',
      solvay_einstein: '爱因斯坦', solvay_bohr: '玻尔', solvay_curie: '玛丽·居里',
      solvay_heisenberg: '海森堡', solvay_schrodinger: '薛定谔', solvay_pauli: '泡利',
      solvay_born: '玻恩', solvay_lorentz: '洛伦兹', solvay_debroglie: '德布罗意',
    };
    const isNarration = !charId || charId === '' || charId === 'narrator';
    const speakerText = isNarration ? '系统通知' : (nameMap[charId] || charId);

    if (speakerText !== this.lastSpeakerText) {
      this.lastSpeakerText = speakerText;
      this.speakerBox.textContent = speakerText;
      if (isNarration) {
        this.speakerBox.style.color = '#fff';
        this.speakerBox.style.backgroundColor = '#ff0055';
        this.speakerBox.style.boxShadow = '0 0 10px #ff0055';
      } else if (PLAYER_IDS.has(charId)) {
        this.speakerBox.style.color = '#003344';
        this.speakerBox.style.backgroundColor = '#00f3ff';
        this.speakerBox.style.boxShadow = '0 0 10px #00f3ff';
      } else {
        this.speakerBox.style.color = '#fff';
        this.speakerBox.style.backgroundColor = '#ff0055';
        this.speakerBox.style.boxShadow = '0 0 10px #ff0055';
      }
    }

    // --- 对话文本（逐字显示 + 光标 + ▼继续提示）---
    const fullText = state.displayText;
    const shown = fullText.substring(0, state.charIndex);
    const typing = !state.lineComplete && !state.allLinesComplete;
    const showKey = shown + '|' + (typing ? '1' : '0');

    if (showKey !== this.lastDisplayText) {
      this.lastDisplayText = showKey;
      if (typing) {
        this.textEl.textContent = shown;
        if (!this.textEl.contains(this.cursorEl)) {
          this.textEl.appendChild(this.cursorEl);
        }
        this.continueEl.style.display = 'none';
      } else {
        this.textEl.textContent = fullText;
        if (this.textEl.contains(this.cursorEl)) {
          this.textEl.removeChild(this.cursorEl);
        }
        const hasChoices = state.allLinesComplete && state.choices && state.choices.length > 0;
        this.continueEl.style.display = hasChoices ? 'none' : 'block';
      }
    }

    // --- event_type2 angry 震动 ---
    if (state.eventType === 'event_type2' && state.currentEmotion === 'angry' && this.lastShakeEmotion !== 'angry') {
      this.cgEl.classList.remove('cg-shake');
      void this.cgEl.offsetWidth;
      this.cgEl.classList.add('cg-shake');
    } else if (state.currentEmotion !== 'angry') {
      this.cgEl.classList.remove('cg-shake');
    }
    this.lastShakeEmotion = state.currentEmotion;

    // --- DLG 立绘 ---
    this.updatePortrait(state);

    // --- 选项按钮 ---
    if (state.allLinesComplete && state.choices && state.choices.length > 0) {
      const choiceTexts = state.choices.map((c: DialogueChoice) => c.text).join('|');
      this.choicesEl.style.display = 'flex';
      if (choiceTexts !== this.lastChoiceTexts) {
        this.lastChoiceTexts = choiceTexts;
        this.choicesEl.innerHTML = '';
        state.choices.forEach((choice: DialogueChoice, idx: number) => {
          const btn = document.createElement('button');
          const isUsed = this.usedChoices.has(choice.text);
          btn.textContent = isUsed ? `[已读] ${choice.text}` : choice.text;
          btn.style.cssText =
            'background:rgba(2,10,18,0.8);backdrop-filter:blur(4px);' +
            'border:1px solid rgba(0,243,255,0.25);border-left:4px solid rgba(0,243,255,0.25);' +
            (isUsed ? 'opacity:0.5;' : 'color:#e0ffff;') +
            'font-family:"Noto Sans SC",sans-serif;font-weight:700;font-size:1rem;' +
            'letter-spacing:1px;padding:12px 20px;text-align:left;cursor:pointer;' +
            'transition:all 0.2s cubic-bezier(0.4,0,0.2,1);' +
            'clip-path:polygon(0 0,calc(100% - 15px) 0,100% 15px,100% 100%,0 100%);';
          btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(0,243,255,0.15)';
            btn.style.borderLeft = '4px solid #00f3ff';
            btn.style.paddingLeft = '30px';
            btn.style.color = '#fff';
            btn.style.textShadow = '0 0 5px #00f3ff';
            btn.style.boxShadow = 'inset 0 0 15px rgba(0,243,255,0.25)';
          });
          btn.addEventListener('mouseleave', () => {
            btn.style.background = 'rgba(2,10,18,0.8)';
            btn.style.borderLeft = '4px solid rgba(0,243,255,0.25)';
            btn.style.paddingLeft = '20px';
            btn.style.color = isUsed ? '' : '#e0ffff';
            btn.style.textShadow = 'none';
            btn.style.boxShadow = 'none';
          });
          btn.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            if (this.paused) return;
            if (this.onChoice) {
              this.onChoice(idx);
              this.usedChoices.add(choice.text);
              // 记录选择到历史
              this.logEntries.push({
                speakerId: 'narrator',
                speakerName: '指令输入',
                text: choice.text,
                emotion: 'idle' as Emotion,
                eventType: state.eventType,
              });
            }
          });
          this.choicesEl.appendChild(btn);
        });
        this.renderAIInput(state);
      }
    } else {
      // 正在播放对话文本或无选项节点：隐藏选项面板
      if (this.lastChoiceTexts !== '') {
        this.choicesEl.innerHTML = '';
        this.lastChoiceTexts = '';
        this.choicesEl.style.display = 'none';
      }
      this.aiInputWrap = null;
      this.aiTextInput = null;
      this.aiSendBtn = null;
    }
  }

  /** 渲染 AI 自由提问输入框 */
  private renderAIInput(state: DialogueState): void {
    if (this.aiInputWrap) return;
    const trigger = state.tree?.trigger ?? '';
    if (!trigger) return;

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'margin-top:12px;padding:10px;background:rgba(0,0,0,0.5);' +
      'border:1px dashed rgba(168,85,247,0.4);display:flex;gap:8px;align-items:center;';

    const label = document.createElement('span');
    label.textContent = 'AI';
    label.style.cssText = 'color:#a855f7;font-family:VT323,monospace;font-size:1rem;flex-shrink:0;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '自由提问...';
    input.style.cssText =
      'flex:1;background:rgba(0,0,0,0.6);border:1px solid rgba(168,85,247,0.3);' +
      'color:#e0ffff;padding:6px 10px;font-family:"Noto Sans SC",sans-serif;font-size:0.9rem;';

    const btn = document.createElement('button');
    btn.textContent = '发送';
    btn.style.cssText =
      'background:rgba(168,85,247,0.2);border:1px solid rgba(168,85,247,0.5);' +
      'color:#c084fc;padding:6px 16px;cursor:pointer;font-family:"Noto Sans SC",sans-serif;' +
      'font-size:0.85rem;flex-shrink:0;';

    const status = document.createElement('span');
    status.style.cssText = 'color:#ef4444;font-size:0.8rem;flex-shrink:0;display:none;';

    const sendAction = (): void => {
      if (this.paused) return;
      const text = input.value.trim();
      if (!text || this.aiThinking) return;
      status.style.display = 'none';
      void this.sendAIQuery(trigger, text);
      input.value = '';
    };

    btn.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      sendAction();
    });
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        sendAction();
      }
    });

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(btn);
    wrap.appendChild(status);
    this.choicesEl.appendChild(wrap);

    this.aiInputWrap = wrap;
    this.aiTextInput = input;
    this.aiSendBtn = btn;
    this.aiStatusEl = status;
  }

  /** 发送 AI 查询到服务端，流式接收并渲染对话 */
  private async sendAIQuery(trigger: string, query: string): Promise<void> {
    this.aiThinking = true;
    if (this.aiSendBtn) {
      this.aiSendBtn.textContent = '...';
      this.aiSendBtn.style.opacity = '0.5';
    }
    if (this.aiTextInput) this.aiTextInput.disabled = true;

    const npcName = this.onGetNpcName?.(trigger) ?? trigger;
    const context = this.onGetAIContext?.() ?? {};

    try {
      if (this.aiStatusEl) { this.aiStatusEl.textContent = ''; this.aiStatusEl.style.color = ''; }
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npcId: trigger, npcName, message: query, history: this.aiChatHistory, context }),
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        let errMsg = `HTTP ${resp.status}`;
        try { errMsg = JSON.parse(errBody).error ?? errMsg; } catch { /* not JSON */ }
        throw new Error(errMsg);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            // 流式分片（可选显示进度）
            if (parsed.chunk && this.aiSendBtn) {
              this.aiSendBtn.textContent = '生成中…';
            }
            // 完整节点：注入对话流
            if (parsed.node && this.onAIDialogue) {
              this.onAIDialogue(parsed.node as DialogueNode, parsed.replyNodes as DialogueNode[] | undefined);
              const replyText = (parsed.node as DialogueNode).lines
                ?.map((l: { text?: string }) => l.text || '')
                .join(' ') || '';
              this.aiChatHistory.push(
                { role: 'user', content: query },
                { role: 'assistant', content: replyText },
              );
            }
            // 错误
            if (parsed.error) {
              if (this.aiStatusEl) {
                this.aiStatusEl.textContent = `AI 错误: ${parsed.error}`;
                this.aiStatusEl.style.color = '#f87171';
              }
            }
          } catch {
            // 流式分片可能不完整，跳过
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AI Chat] 请求失败:', err);
      if (this.aiStatusEl) {
        this.aiStatusEl.textContent = msg.includes('DEEPSEEK') || msg.includes('API')
          ? 'AI 服务未配置，请联系管理员设置 API Key'
          : `请求失败: ${msg}`;
        this.aiStatusEl.style.color = '#f87171';
      }
    } finally {
      this.aiThinking = false;
      if (this.aiSendBtn) {
        this.aiSendBtn.textContent = '发送';
        this.aiSendBtn.style.opacity = '1';
      }
      if (this.aiTextInput) this.aiTextInput.disabled = false;
    }
  }

  /** 回调：AI 生成的对话节点需要注入到当前对话流 */
  public onAIDialogue: ((node: DialogueNode, replyNodes?: DialogueNode[]) => void) | null = null;

  /** 回调：获取 AI 对话上下文（场景、阶段、任务进度、flags） */
  public onGetAIContext: (() => Record<string, unknown>) | null = null;

  /** 回调：获取 NPC 显示名称 */
  public onGetNpcName: ((trigger: string) => string) | null = null;

  /** 重新显示 AI 自由提问输入框（继续追问） */
  public showAIInput(): void {
    if (this.aiInputWrap) {
      this.aiInputWrap.style.display = 'flex';
      if (this.aiTextInput) {
        this.aiTextInput.value = '';
        this.aiTextInput.focus();
      }
      if (this.aiStatusEl) this.aiStatusEl.textContent = '';
    }
  }

  /** 回调：获取玩家显示名称 */
  public onGetPlayerName: (() => string) | null = null;

  private updatePortrait(state: DialogueState): void {
    if (state.eventType === 'event_type2') return;

    const speakerId = state.speakerId;
    const emotion = state.currentEmotion;
    const npcId = state.npcId;
    const isNarration = !speakerId || speakerId === '' || speakerId === 'narrator';

    // 检查 NPC 是否有立绘
    const npcHasPortrait = !isNarration && !!npcId && !PLAYER_IDS.has(npcId) && getDlgPortrait(npcId, emotion) !== null;

    // NPC立绘（左侧）— 仅当 NPC 有立绘时才处理
    if (npcHasPortrait && npcId) {
      const npcImg = getDlgPortrait(npcId, emotion);
      if (npcImg && npcImg !== this.leftImgEl) {
        this.portraitLeftEl.innerHTML = '';
        npcImg.style.height = '82.5%';
        npcImg.style.objectFit = 'contain';
        npcImg.style.filter = 'drop-shadow(0 0 15px #00f3ff) drop-shadow(0 0 30px rgba(0,243,255,0.3))';
        npcImg.style.opacity = speakerId === npcId ? '1' : '0.5';
        this.portraitLeftEl.appendChild(npcImg);
        this.leftImgEl = npcImg;
      } else if (npcImg && npcImg === this.leftImgEl) {
        npcImg.style.opacity = speakerId === npcId ? '1' : '0.5';
      }
    } else {
      // NPC 无立绘：清空左侧
      if (this.leftImgEl) {
        this.portraitLeftEl.innerHTML = '';
        this.leftImgEl = null;
      }
    }

    // 主角立绘（右侧）
    if (!isNarration && PLAYER_IDS.has(speakerId)) {
      const playerImg = getDlgPortrait('su_ran', emotion);
      if (playerImg && playerImg !== this.rightImgEl) {
        this.portraitRightEl.innerHTML = '';
        playerImg.style.height = '82.5%';
        playerImg.style.objectFit = 'contain';
        playerImg.style.filter = 'drop-shadow(0 0 15px #ff2d6f) drop-shadow(0 0 30px rgba(255,45,111,0.3))';
        playerImg.style.opacity = '1';
        this.portraitRightEl.appendChild(playerImg);
        this.rightImgEl = playerImg;
      } else if (this.rightImgEl) {
        this.rightImgEl.style.opacity = '1';
      }
    } else if (!isNarration && PLAYER_IDS.has(npcId || '')) {
      // NPC 实际是主角（理论上不会走到这里）
      if (this.rightImgEl) this.rightImgEl.style.opacity = npcHasPortrait ? '0.4' : '1';
    } else if (!isNarration && npcId && !PLAYER_IDS.has(npcId)) {
      // NPC 在说话 — 主角立绘保持上次说话时的情绪，不切换
      // 仅调整透明度，不重新渲染立绘（保留当前状态）
      if (this.rightImgEl) {
        this.rightImgEl.style.opacity = npcHasPortrait ? '0.5' : '1';
      }
    } else {
      if (this.rightImgEl) this.rightImgEl.style.opacity = '0.4';
    }

    if (isNarration) {
      if (this.leftImgEl) this.leftImgEl.style.opacity = '0.4';
      if (this.rightImgEl) this.rightImgEl.style.opacity = '0.4';
    }
  }
}
