import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';

const router = Router();

const OVERLAYS_FILE = join(process.cwd(), 'src', 'data', 'dev-overrides.json');
const QUEST_EDITOR_FILE = join(process.cwd(), 'src', 'data', 'quests', 'editor-project.json');
// stageState 独立文件：editor-project.json 被 Vite 静态 import，写它会触发全页 HMR reload（拖动即"崩溃重启"的根因）
const STAGE_STATE_FILE = join(process.cwd(), 'server', 'data', 'stage-state.json');

// 保存开发工具编辑的碰撞框和事件位置到 JSON 文件
router.post('/api/dev/save', (req, res) => {
  try {
    const data = req.body;
    // 读取已有数据，合并
    let existing: Record<string, unknown> = {};
    if (existsSync(OVERLAYS_FILE)) {
      existing = JSON.parse(readFileSync(OVERLAYS_FILE, 'utf-8'));
    }
    // 按 sceneId 合并（markers 通路已废弃，只写 colliders）
    existing[data.sceneId] = {
      colliders: data.colliders || [],
    };
    // 确保目录存在
    mkdirSync(dirname(OVERLAYS_FILE), { recursive: true });
    writeFileSync(OVERLAYS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
    res.json({ success: true, saved: data.sceneId, file: OVERLAYS_FILE });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// 读取所有场景的覆盖数据
router.get('/api/dev/load', (_req, res) => {
  try {
    if (!existsSync(OVERLAYS_FILE)) {
      res.json({});
      return;
    }
    const data = JSON.parse(readFileSync(OVERLAYS_FILE, 'utf-8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// 删除指定场景的覆盖数据
router.post('/api/dev/clear', (req, res) => {
  try {
    const { sceneId } = req.body;
    if (!existsSync(OVERLAYS_FILE)) {
      res.json({ success: true });
      return;
    }
    const data = JSON.parse(readFileSync(OVERLAYS_FILE, 'utf-8'));
    if (sceneId && data[sceneId]) {
      delete data[sceneId];
      writeFileSync(OVERLAYS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    res.json({ success: true, cleared: sceneId });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// 保存任务编辑器工程。只接受固定顶层结构，避免把任意请求写入源码目录。
router.post('/api/dev/quests/save', (req, res) => {
  try {
    const data: unknown = req.body;
    if (!isQuestEditorProject(data)) {
      res.status(400).json({ error: 'Invalid quest editor project' });
      return;
    }
    mkdirSync(dirname(QUEST_EDITOR_FILE), { recursive: true });
    writeFileSync(QUEST_EDITOR_FILE, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, file: QUEST_EDITOR_FILE });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Stage 编辑数据合并写入：只更新 stageState 字段，不触碰 quests/placements 等其它数据
// stageState 深层 schema 校验：stages/base/overrides 全部字段级检查
function validateStageState(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  if (!Array.isArray(d.stages) || !d.stages.every(n => typeof n === 'number' && Number.isInteger(n) && n > 0)) return false;
  const checkPlacement = (p: unknown): boolean => {
    if (typeof p !== 'object' || p === null) return false;
    const q = p as Record<string, unknown>;
    return (q.sceneId === undefined || typeof q.sceneId === 'string')
      && (q.x === undefined || (typeof q.x === 'number' && Number.isFinite(q.x)))
      && (q.y === undefined || (typeof q.y === 'number' && Number.isFinite(q.y)))
      && (q.exists === undefined || typeof q.exists === 'boolean');
  };
  if (d.base !== undefined && (typeof d.base !== 'object' || d.base === null || !Object.values(d.base).every(checkPlacement))) return false;
  if (d.overrides !== undefined) {
    if (typeof d.overrides !== 'object' || d.overrides === null) return false;
    for (const layer of Object.values(d.overrides)) {
      if (typeof layer !== 'object' || layer === null) return false;
      if (!Object.values(layer).every(checkPlacement)) return false;
    }
  }
  if (d.transitions !== undefined) {
    if (typeof d.transitions !== 'object' || d.transitions === null) return false;
    const checkTransition = (t: unknown): boolean => {
      if (typeof t !== 'object' || t === null) return false;
      const q = t as Record<string, unknown>;
      return typeof q.targetScene === 'string'
        && typeof q.x === 'number' && Number.isFinite(q.x)
        && typeof q.y === 'number' && Number.isFinite(q.y)
        && typeof q.targetX === 'number' && Number.isFinite(q.targetX)
        && typeof q.targetY === 'number' && Number.isFinite(q.targetY);
    };
    for (const list of Object.values(d.transitions)) {
      if (!Array.isArray(list) || !list.every(checkTransition)) return false;
    }
  }
  return true;
}

// 保存串行化：避免并发写交错
let stageSaveChain: Promise<unknown> = Promise.resolve();

router.post('/api/dev/stage-state/save', (req, res) => {
  const stageState = req.body; // body 即 stageState 本体
  if (!validateStageState(stageState)) {
    res.status(400).json({ error: 'Invalid stageState' });
    return;
  }
  stageSaveChain = stageSaveChain.then(() => {
    try {
      mkdirSync(dirname(STAGE_STATE_FILE), { recursive: true });
      // 临时文件 + atomic rename，避免半写状态被读到
      const tmp = `${STAGE_STATE_FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(stageState, null, 2), 'utf-8');
      renameSync(tmp, STAGE_STATE_FILE);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }).catch(() => { res.status(500).json({ error: 'save chain failure' }); });
});

router.get('/api/dev/stage-state/load', (_req, res) => {
  try {
    if (!existsSync(STAGE_STATE_FILE)) { res.json({}); return; }
    res.json(JSON.parse(readFileSync(STAGE_STATE_FILE, 'utf-8')));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/api/dev/quests/load', (_req, res) => {
  try {
    if (!existsSync(QUEST_EDITOR_FILE)) {
      res.json({ version: 1, updatedAt: 0, quests: [], placements: [] });
      return;
    }
    res.json(JSON.parse(readFileSync(QUEST_EDITOR_FILE, 'utf-8')));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// API 路由示例
router.get('/api/hello', (_req, res) => {
  res.json({
    message: 'Hello from Express + Vite!',
    timestamp: new Date().toISOString(),
  });
});

router.post('/api/data', (req, res) => {
  const requestData = req.body;
  res.json({
    success: true,
    data: requestData,
    receivedAt: new Date().toISOString(),
  });
});

// 健康检查接口
router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    env: process.env.COZE_PROJECT_ENV,
    timestamp: new Date().toISOString(),
  });
});

export default router;

function isQuestEditorProject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.version === 1
    && typeof record.updatedAt === 'number'
    && Array.isArray(record.quests)
    && Array.isArray(record.placements);
}
