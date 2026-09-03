import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import express from 'express';

import {
  buildChatCompletionsUrl,
  createAuthorizationHeader,
  type OpenAiCompatibleTaskConfig,
} from '../server/config/openai-compatible';
import { registerChatRoutes } from '../server/routes/chat';
import { registerQuestRoutes } from '../server/routes/quest-generate';

assert.equal(
  buildChatCompletionsUrl('https://provider.example/v1/'),
  'https://provider.example/v1/chat/completions',
);
assert.deepEqual(createAuthorizationHeader('unit-secret'), {
  Authorization: 'Bearer unit-secret',
});
for (const invalidBase of [
  'file:///tmp/provider',
  'https://user:pass@provider.example/v1',
  'https://provider.example/v1?query=1',
  'https://provider.example/v1#fragment',
]) {
  assert.throws(() => buildChatCompletionsUrl(invalidBase));
}

const connection = {
  provider: 'openai-compatible' as const,
  apiKey: 'unit-secret',
  baseUrl: 'https://provider.example/v1/',
};
const chatConfig: OpenAiCompatibleTaskConfig = {
  connection,
  model: 'echo-chat-model',
};
const questConfig: OpenAiCompatibleTaskConfig = {
  connection,
  model: 'echo-quest-model',
};
const providerCalls: Array<{
  url: string;
  authorization: string | null;
  model: unknown;
}> = [];

const providerFetch: typeof fetch = async (input, init) => {
  const body = JSON.parse(String(init?.body)) as { model?: unknown };
  const headers = new Headers(init?.headers);
  providerCalls.push({
    url: String(input),
    authorization: headers.get('Authorization'),
    model: body.model,
  });
  if (body.model === 'echo-chat-model') {
    const content = JSON.stringify({
      lines: [
        {
          speaker: 'vr_researcher_main',
          text: '测试回复',
          emotion: 'idle',
        },
      ],
    });
    const event = JSON.stringify({
      choices: [{ delta: { content } }],
    });
    return new Response(`data: ${event}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            id: 'quest_generated',
            title: '测试任务',
          }),
        },
      },
    ],
  });
};

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());
  registerChatRoutes(app, chatConfig, { fetch: providerFetch });
  registerQuestRoutes(app, questConfig, { fetch: providerFetch });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const chatResponse = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npcId: 'vr_researcher_main',
        npcName: 'VR研究员',
        message: '你好',
        history: [],
        context: {},
      }),
    });
    assert.equal(chatResponse.status, 200);
    assert.match(await chatResponse.text(), /测试回复/u);

    const questResponse = await fetch(`${origin}/api/quest/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '生成任务', catalog: {} }),
    });
    assert.equal(questResponse.status, 200);
    assert.equal(
      (await questResponse.json() as { quest?: { id?: string } }).quest?.id,
      'quest_generated',
    );
  } finally {
    server.close();
    await once(server, 'close');
  }

  assert.deepEqual(providerCalls, [
    {
      url: 'https://provider.example/v1/chat/completions',
      authorization: 'Bearer unit-secret',
      model: 'echo-chat-model',
    },
    {
      url: 'https://provider.example/v1/chat/completions',
      authorization: 'Bearer unit-secret',
      model: 'echo-quest-model',
    },
  ]);

  for (const relativePath of [
    '../server/routes/chat.ts',
    '../server/routes/quest-generate.ts',
  ]) {
    const source = readFileSync(
      fileURLToPath(new URL(relativePath, import.meta.url)),
      'utf8',
    );
    assert.doesNotMatch(source, /process\.env/u);
    assert.doesNotMatch(source, /api\.deepseek\.com/u);
    assert.doesNotMatch(source, /const MODEL\s*=|model:\s*'deepseek-chat'/u);
  }

  console.log('ECHO_LLM_WIRING=PASS');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
