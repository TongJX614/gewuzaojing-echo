import type { Express } from 'express';
import {
  buildChatCompletionsUrl,
  createAuthorizationHeader,
  type OpenAiCompatibleTaskConfig,
} from '../config/openai-compatible.js';
import { charactersData } from '../data/characters-data.js';
import {
  buildNarrativeContext,
  buildContextSummary,
} from '../data/narrative-context.js';

interface ChatRequest {
  npcId: string;
  npcName: string;
  message: string;
  history: { role: string; content: string }[];
  context: {
    sceneId?: string;
    stage?: string;
    questProgress?: string[];
    flags?: string[];
  };
}

function resolveCharacter(npcId: string, npcName: string) {
  if (charactersData[npcId]) return charactersData[npcId];
  const baseId = npcId.replace(/_(back|main|\d+)$/, '');
  if (charactersData[baseId]) return charactersData[baseId];
  const match = Object.values(charactersData).find(
    (c) => c.name === npcName || npcName.includes(c.name),
  );
  return match ?? null;
}

function buildSystemPrompt(req: ChatRequest): string {
  const character = resolveCharacter(req.npcId, req.npcName);
  const npcName = character?.name || req.npcName || '研究员';

  const ctx = req.context;
  const narrativeCtx = buildNarrativeContext();
  const contextSummary = buildContextSummary(ctx);

  return `${narrativeCtx}

## 当前游戏状态
${contextSummary}

## 对话历史
${req.history.length > 0 ? req.history.map(h => `${h.role === 'user' ? '苏然' : npcName}: ${h.content}`).join('\n') : '（无）'}

## 任务
玩家苏然对你说："${req.message}"

请以 ${npcName} 的身份回应。你的回复必须是严格的 JSON，格式如下：

{"lines": [
  {"speaker": "${req.npcId}", "text": "${npcName}的第一句开场", "emotion": "idle"},
  {"speaker": "${req.npcId}", "text": "${npcName}继续展开的补充说明", "emotion": "idle"},
  {"speaker": "su_ran", "text": "苏然的简短回应或追问（15-30字）", "emotion": "idle"},
  {"speaker": "${req.npcId}", "text": "${npcName}针对苏然问题的详细解答", "emotion": "idle"},
  {"speaker": "${req.npcId}", "text": "${npcName}进一步展开或举例说明", "emotion": "idle"},
  {"speaker": "su_ran", "text": "苏然的感叹或追问（15-30字）", "emotion": "idle"},
  {"speaker": "${req.npcId}", "text": "${npcName}的总结或引导", "emotion": "idle"}
]}

## 规则
- 共 7-9 行。${npcName} 说 5-6 句，苏然只说 1-2 句
- ${npcName} 可以连续说 2-3 句再让苏然插话，不要机械交替
- 苏然的台词要简短自然（15-30字），主要是追问、感叹、好奇
- ${npcName} 的台词要有实质内容，体现角色的专业知识和个性（40-100字）
- emotion 从 idle/happy/angry/sad/surprise 中选一个
- speaker 只能是 "${req.npcId}" 或 "su_ran"
- 回复必须符合 ${npcName} 的身份、性格和知识范围
- 不要提及你是在扮演角色，直接进入对话`;
}

interface ParsedLine {
  speaker: string;
  text: string;
  emotion: string;
}

function parseAIResponse(raw: string, npcId: string): {
  node: { id: string; lines: ParsedLine[]; choices: { text: string; next: string }[] };
  replyNodes: never[];
} {
  const strippedId = npcId.replace(/_(back|main|\d+)$/, '');
  const cleaned = raw
    .trim()
    .replace(/\\n/g, '\n')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let lines: ParsedLine[] = [];

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.lines && Array.isArray(parsed.lines)) {
      lines = parsed.lines
        .filter((l: { text?: string }) => l.text && l.text.trim().length > 0)
        .map((l: { speaker?: string; text?: string; emotion?: string }) => ({
          speaker: l.speaker === 'su_ran' ? 'su_ran' : (l.speaker || npcId),
          text: String(l.text).trim(),
          emotion: l.emotion || 'idle',
        }));
    }
  } catch {
    // JSON parse failed — fallback: treat as single NPC line
    console.error('[chat] JSON parse failed, raw:', cleaned.slice(0, 200));
  }

  if (lines.length === 0) {
    lines.push({ speaker: strippedId, text: cleaned.slice(0, 200), emotion: 'idle' });
  }

  const nodeId = `ai_reply_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    node: {
      id: nodeId,
      lines,
      choices: [
        { text: '继续提问', next: '__ai_chat__' },
        { text: '再见', next: '__end__' },
      ],
    },
    replyNodes: [],
  };
}

export function registerChatRoutes(
  app: Express,
  config: OpenAiCompatibleTaskConfig,
  dependencies: Readonly<{ fetch?: typeof fetch }> = {},
): void {
  const providerFetch = dependencies.fetch ?? globalThis.fetch;
  const endpoint = buildChatCompletionsUrl(config.connection.baseUrl);
  const authorization = createAuthorizationHeader(config.connection.apiKey);

  app.post('/api/chat', async (req, res) => {
    const message = req.body.message;
    const npcId = req.body.npcId || '';
    const npcName = req.body.npcName || npcId;
    const history = req.body.history || [];
    const context = req.body.context || {};

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const systemPrompt = buildSystemPrompt({ npcId, npcName, message, history, context });

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6).map((h: { role: string; content: string }) => ({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content,
        })),
        { role: 'user', content: message },
      ];

      const apiResp = await providerFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authorization,
        },
        body: JSON.stringify({
          model: config.model,
          messages: apiMessages,
          stream: true,
          temperature: 0.7,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
        }),
      });

      if (!apiResp.ok) {
        await apiResp.body?.cancel();
        console.error(`[chat] Provider request failed with status ${apiResp.status}`);
        res.write(`data: ${JSON.stringify({ error: `模型服务返回 ${apiResp.status}` })}\n\n`);
        res.end();
        return;
      }

      const reader = apiResp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const sseLines = buffer.split('\n');
        buffer = sseLines.pop() || '';

        for (const sseLine of sseLines) {
          if (!sseLine.startsWith('data: ')) continue;
          const data = sseLine.slice(6);
          if (data === '[DONE]') continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }

      const { node: aiNode, replyNodes: aiReplyNodes } = parseAIResponse(fullContent, npcId);
      res.write(`data: ${JSON.stringify({ node: aiNode, replyNodes: aiReplyNodes })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch {
      console.error('[chat] Provider request failed');
      res.write(`data: ${JSON.stringify({ error: '服务端内部错误' })}\n\n`);
      res.end();
    }
  });
}
