// ============================================================
// 任务注册表 — editor-project.json 为唯一真相源
// 所有任务的增删改统一通过 Quest Manager（← 键打开）操作
// ============================================================

import type { Quest } from './types';
import editorProject from './editor-project.json';

export const ALL_QUESTS: readonly Quest[] = (editorProject.quests ?? []) as unknown as Quest[];
