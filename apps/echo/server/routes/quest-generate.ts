import type { Express } from 'express';
import {
  buildChatCompletionsUrl,
  createAuthorizationHeader,
  type OpenAiCompatibleTaskConfig,
} from '../config/openai-compatible.js';

export function registerQuestRoutes(
  app: Express,
  config: OpenAiCompatibleTaskConfig,
  dependencies: Readonly<{ fetch?: typeof fetch }> = {},
): void {
  const providerFetch = dependencies.fetch ?? globalThis.fetch;
  const endpoint = buildChatCompletionsUrl(config.connection.baseUrl);
  const authorization = createAuthorizationHeader(config.connection.apiKey);

  app.post('/api/quest/generate', async (req, res) => {
    const { prompt, catalog } = req.body as {
      prompt?: string;
      catalog?: {
        scenes?: { id: string; name?: string }[];
        npcs?: { id: string; name?: string }[];
        items?: { id: string; name?: string }[];
        events?: { id: string; name?: string }[];
        stages?: string[];
        flags?: { id: string; label?: string }[];
      };
    };
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    const sceneList = (catalog?.scenes ?? []).map(s => `${s.id}${s.name ? `（${s.name}）` : ''}`).join(', ') || '无';
    const npcList = (catalog?.npcs ?? []).map(n => `${n.id}${n.name ? `（${n.name}）` : ''}`).join(', ') || '无';
    const itemList = (catalog?.items ?? []).map(i => `${i.id}${i.name ? `（${i.name}）` : ''}`).join(', ') || '无';
    const eventList = (catalog?.events ?? []).map(e => `${e.id}${e.name ? `（${e.name}）` : ''}`).join(', ') || '无';
    const stageList = (catalog?.stages ?? []).join(', ') || 'prep';
    const flagList = (catalog?.flags ?? []).map(f => f.id).join(', ') || '无';

    const dynamicPrompt = `你是游戏"回响"的任务设计器。根据用户的剧情描述，生成合法的 Quest JSON。

可用 ID 参考表（target 字段只能使用以下真实存在的 ID）：

场景: ${sceneList}
NPC: ${npcList}
物品: ${itemList}
事件: ${eventList}
阶段: ${stageList}
可用Flag: ${flagList}

JSON 结构规范：
{
  "id": "quest_开头_英文下划线",
  "title": "5-15字中文标题",
  "desc": "1-3句中文描述",
  "category": "main | side | hidden",
  "autoStart": true,
  "stage": "prep（可选，任务所属阶段）",
  "advanceStageTo": "debate1（可选，主线完成后推进到该阶段）",
  "completionText": "完成时显示的文字",
  "startCondition": {
    "logic": "AND",
    "conditions": [
      { "type": "visited_scene | quest_completed | talked_to_npc | has_item | has_flag | stage_at_least", "target": "对应ID" }
    ]
  },
  "steps": [
    {
      "id": "step_1",
      "desc": "步骤说明",
      "onCompleteText": "步骤完成提示（可选）",
      "objectives": [
        {
          "id": "obj_1（可选稳定ID）",
          "type": "talk_to_npc | collect_item | submit_item | reach_location | trigger_event | custom_flag",
          "target": "对应ID",
          "count": 1,
          "submitTo": "NPC ID（仅submit_item需要）",
          "dialogueId": "对话ID（可选，精确匹配某段对话）",
          "source": "world（可选，collect_item时表示只算地图拾取不算奖励获得）"
        }
      ]
    }
  ],
  "rewards": {
    "exp": 100,
    "items": [{ "itemId": "item_xxx", "count": 1 }],
    "flags": ["quest_xxx_done"]
  }
}

规则：
1. id 必须以 quest_ 开头
2. 只使用上面列出的真实 ID，不要编造不存在的 NPC/物品/场景
3. flag 以 quest_开头_done 结尾
4. 每个步骤的 objectives 可以有多个（AND 关系，全部完成才推进下一步）
5. submit_item 的 target 是物品 ID，submitTo 是 NPC ID
6. startCondition 的 conditions 如果是 stage_at_least，target 填阶段名
7. 返回纯 JSON，不要 Markdown 代码块，不要任何解释文字`;

    try {
      const apiRes = await providerFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authorization,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: dynamicPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2000,
          temperature: 0.7,
          stream: false,
        }),
      });

      if (!apiRes.ok) {
        await apiRes.body?.cancel();
        console.error(`[quest] Provider request failed with status ${apiRes.status}`);
        res.status(502).json({ error: `Model provider returned ${apiRes.status}` });
        return;
      }

      const data = await apiRes.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '';

      let questJson: unknown = null;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          questJson = JSON.parse(jsonMatch[0]);
        } catch {
          res.status(422).json({ error: 'LLM returned invalid JSON' });
          return;
        }
      }

      res.json({ quest: questJson, raw: content });
    } catch {
      console.error('[quest] Provider request failed');
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
