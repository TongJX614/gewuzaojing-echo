'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const EchoProjectTwo = require('../src/static/echo-project-two-entry.js');

const {
  acceptGenerationDone,
  acceptReviewedStart,
  beginGenerationAttempt,
  beginReviewedStart,
  buildCanonicalPrompt,
  claimNewEntry,
  createEntryController,
  failGenerationAttempt,
  parseEntryQuery,
  recordKeyFor,
  restoreActiveEntry,
} = EchoProjectTwo;

const BRIEFS = {
  'observation-reality': {
    witness:
      '一个观测会改变被观测现实的世界。你追踪互相矛盾的证据，并检验“不干预”是否真的可能。',
    calibrator:
      '一个观测会改变被观测现实的世界。你修复失真的观测链，却必须决定哪一种现实值得保留。',
    participant:
      '一个观测会改变被观测现实的世界。你卷入冲突，并逐渐怀疑自己是否也是一次观测的产物。',
  },
  'memory-identity': {
    witness:
      '一个记忆可以复制、删改和重放的世界。你整理彼此冲突的记忆证词，寻找身份连续性的证据。',
    calibrator:
      '一个记忆可以复制、删改和重放的世界。你修复记忆异常，却必须判断哪些遗忘不该被纠正。',
    participant:
      '一个记忆可以复制、删改和重放的世界。你发现自己的过去存在多个版本，必须决定哪一份记忆构成“我”。',
  },
  'energy-civilization': {
    witness:
      '一个以有限能源维系生存与探索的封闭文明。你记录每次分配的得失，并追问中立是否也是一种选择。',
    calibrator:
      '一个以有限能源维系生存与探索的封闭文明。你重建失衡系统，却必须决定谁先获得能源、谁承担代价。',
    participant:
      '一个以有限能源维系生存与探索的封闭文明。你被置于关键配给之中，而个人生存与文明远行无法同时得到保证。',
  },
};
const THEME_LABELS = {
  'observation-reality': '观测与真实',
  'memory-identity': '记忆与身份',
  'energy-civilization': '能量与文明',
};
const ROLE_LABELS = {
  witness: '旁证者',
  calibrator: '校准员',
  participant: '当事人',
};
const EXPECTED_LENGTHS = [108, 107, 107, 108, 107, 114, 111, 112, 116];

function validSearch(
  themeId = 'observation-reality',
  roleId = 'witness',
) {
  return (
    '?entry=echo-project-2&v=1&theme=' +
    encodeURIComponent(themeId) +
    '&role=' +
    encodeURIComponent(roleId)
  );
}

class MemoryStorage {
  constructor(log = []) {
    this.map = new Map();
    this.log = log;
    this.corruptNextRecordRead = false;
    this.throwOnSet = false;
  }

  getItem(key) {
    this.log.push('storage:get:' + key);
    const value = this.map.has(key) ? this.map.get(key) : null;
    if (
      this.corruptNextRecordRead &&
      key.startsWith('qf:echo-project-2:v1:')
    ) {
      this.corruptNextRecordRead = false;
      return value === null ? null : value + 'corrupt';
    }
    return value;
  }

  setItem(key, value) {
    this.log.push('storage:set:' + key);
    if (this.throwOnSet) throw new Error('quota');
    this.map.set(key, String(value));
  }
}

function uuidQueue(...values) {
  let index = 0;
  return () => values[index++] || 'ffffffff-ffff-4fff-8fff-ffffffffffff';
}

function makeControllerHarness({
  search = validSearch(),
  storage = new MemoryStorage(),
  historyFails = false,
  uuid = uuidQueue(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ),
} = {}) {
  const log = storage.log;
  const generationCalls = [];
  const renderCalls = [];
  const history = {
    replaceState(state, title, url) {
      log.push('history:' + url);
      assert.equal(state, null);
      assert.equal(title, '');
      if (historyFails) throw new Error('history failed');
    },
  };
  const transport = {
    generate(prompt, handlers) {
      log.push('transport:generate');
      generationCalls.push({ prompt, handlers });
    },
  };
  const renderer = {
    render(view) {
      renderCalls.push(view);
    },
  };
  const controller = createEntryController({
    storage,
    history,
    location: {
      search,
      pathname: '/forge',
      hash: '#review',
    },
    uuid,
    transport,
    renderer,
  });
  return {
    controller,
    storage,
    log,
    generationCalls,
    renderCalls,
  };
}

test('builds all nine byte-stable prompts with the approved lengths', () => {
  const lengths = [];
  for (const [themeId, roles] of Object.entries(BRIEFS)) {
    for (const [roleId, brief] of Object.entries(roles)) {
      const prompt = buildCanonicalPrompt({ themeId, roleId });
      assert.equal(
        prompt,
        '项目二·世界编织。母题：' +
          THEME_LABELS[themeId] +
          '。身份：' +
          ROLE_LABELS[roleId] +
          '。世界书简报：' +
          brief +
          '\n请生成原创科幻科普世界书与互动剧本；科学规律是边界，不冒充真实历史。',
      );
      assert.equal(prompt.includes('。。'), false);
      assert.equal(prompt.split('\n').length, 2);
      assert.equal(prompt.includes(brief), true);
      lengths.push(Array.from(prompt).length);
    }
  }
  assert.deepEqual(lengths, EXPECTED_LENGTHS);
});

test('strictly parses valid pairs and rejects malformed or extra entry queries', () => {
  for (const [themeId, roles] of Object.entries(BRIEFS)) {
    for (const [roleId, brief] of Object.entries(roles)) {
      const parsed = parseEntryQuery(validSearch(themeId, roleId));
      assert.equal(parsed.kind, 'project-two');
      assert.equal(parsed.themeId, themeId);
      assert.equal(parsed.roleId, roleId);
      assert.equal(parsed.themeLabel, THEME_LABELS[themeId]);
      assert.equal(parsed.roleLabel, ROLE_LABELS[roleId]);
      assert.equal(parsed.canonicalBrief, brief);
      assert.equal(parsed.prompt, buildCanonicalPrompt({ themeId, roleId }));
    }
  }

  for (const ordinary of ['', '?', '?foo=bar']) {
    assert.equal(parseEntryQuery(ordinary).kind, 'ordinary');
  }
  for (const invalid of [
    '?entry=echo-project-2&v=1&theme=memory-identity',
    '?entry=echo-project-2&entry=echo-project-2&v=1&theme=memory-identity&role=witness',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=witness&extra=1',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=%ZZ',
    '?entry=wrong&v=1&theme=memory-identity&role=witness',
    '?entry=echo-project-2&v=2&theme=memory-identity&role=witness',
    '?entry=echo-project-2&v=1&theme=unknown&role=witness',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=unknown',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=witness&prompt=x',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=witness&url=x',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=witness&path=x',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=witness&key=x',
    '?entry=echo-project-2&v=1&theme=memory-identity&role=witness&script_id=x',
  ]) {
    assert.equal(parseEntryQuery(invalid).kind, 'invalid', invalid);
  }

  const base = validSearch('memory-identity', 'calibrator');
  const length256 = base + '&'.repeat(256 - Array.from(base).length);
  assert.equal(Array.from(length256).length, 256);
  assert.equal(parseEntryQuery(length256).kind, 'project-two');
  assert.equal(parseEntryQuery(length256 + '&').kind, 'invalid');
});

test('claim writes and rereads a complete v1 record and active pointer', () => {
  const storage = new MemoryStorage();
  const parsed = parseEntryQuery(validSearch());
  const claimed = claimNewEntry(parsed, storage);
  const key =
    'qf:echo-project-2:v1:observation-reality:witness';
  assert.equal(claimed.created, true);
  assert.equal(claimed.key, key);
  assert.equal(recordKeyFor(claimed.record), key);
  assert.deepEqual(claimed.record, {
    version: 1,
    themeId: 'observation-reality',
    roleId: 'witness',
    canonicalBrief: BRIEFS['observation-reality'].witness,
    status: 'claimed',
    attempts: 0,
    currentAttemptToken: null,
    reviewedScriptId: null,
    reviewSnapshot: null,
    startIdempotencyKey: null,
    errorCode: null,
  });
  assert.equal(
    storage.map.get('qf:echo-project-2:active'),
    key,
  );
  assert.deepEqual(JSON.parse(storage.map.get(key)), claimed.record);
});

test('new controller claim scrubs query before exactly one generation call', () => {
  const harness = makeControllerHarness();
  const outcome = harness.controller.bootstrap();
  assert.equal(outcome.kind, 'project-two');
  assert.equal(harness.generationCalls.length, 1);
  const historyIndex = harness.log.indexOf('history:/forge#review');
  const transportIndex = harness.log.indexOf('transport:generate');
  assert.ok(historyIndex >= 0);
  assert.ok(transportIndex > historyIndex);
  const record = harness.controller.getActiveRecord();
  assert.equal(record.status, 'generating');
  assert.equal(record.attempts, 1);
  assert.equal(
    record.currentAttemptToken,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.equal(
    harness.generationCalls[0].prompt,
    buildCanonicalPrompt(record),
  );
});

test('storage mismatch or history failure renders local error with zero transport calls', () => {
  const badStorage = new MemoryStorage();
  badStorage.corruptNextRecordRead = true;
  const storageHarness = makeControllerHarness({ storage: badStorage });
  assert.equal(storageHarness.controller.bootstrap().kind, 'error');
  assert.equal(storageHarness.generationCalls.length, 0);

  const historyHarness = makeControllerHarness({ historyFails: true });
  assert.equal(historyHarness.controller.bootstrap().kind, 'error');
  assert.equal(historyHarness.generationCalls.length, 0);
});

test('recognized invalid entry is scrubbed before error and never generates', () => {
  const harness = makeControllerHarness({
    search:
      '?entry=echo-project-2&v=1&theme=memory-identity&role=intruder',
  });
  const outcome = harness.controller.bootstrap();
  assert.equal(outcome.kind, 'error');
  assert.equal(harness.log.includes('history:/forge#review'), true);
  assert.equal(harness.generationCalls.length, 0);
});

test('query-free absent pointer is ordinary', () => {
  const harness = makeControllerHarness({ search: '' });
  assert.equal(harness.controller.bootstrap().kind, 'ordinary');
  assert.equal(harness.generationCalls.length, 0);
});

test('refresh interrupts claimed or generating records without auto retry', () => {
  for (const pendingStatus of ['claimed', 'generating']) {
    const storage = new MemoryStorage();
    const parsed = parseEntryQuery(validSearch());
    const claimed = claimNewEntry(parsed, storage);
    if (pendingStatus === 'generating') {
      beginGenerationAttempt(
        storage,
        claimed.key,
        () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
    }
    const harness = makeControllerHarness({ search: '', storage });
    assert.equal(harness.controller.bootstrap().kind, 'project-two');
    assert.equal(harness.controller.getActiveRecord().status, 'error');
    assert.equal(
      harness.controller.getActiveRecord().errorCode,
      'GENERATION_INTERRUPTED',
    );
    assert.equal(harness.generationCalls.length, 0);
  }
});

test('explicit retry creates a fresh attempt and ignores late prior events', () => {
  const harness = makeControllerHarness();
  harness.controller.bootstrap();
  const firstCall = harness.generationCalls[0];
  firstCall.handlers.onError('HTTP_ERROR');
  assert.equal(harness.controller.getActiveRecord().status, 'error');
  harness.controller.retryGeneration();
  assert.equal(harness.generationCalls.length, 2);
  const secondRecord = harness.controller.getActiveRecord();
  assert.equal(secondRecord.attempts, 2);
  assert.equal(
    secondRecord.currentAttemptToken,
    '22222222-2222-4222-8222-222222222222',
  );
  firstCall.handlers.onDone({
    script_id: 'a'.repeat(32),
    summary: {
      title: '迟到结果',
      worldbook_excerpt: '旧',
      worldbook_truncated: false,
    },
  });
  assert.equal(harness.controller.getActiveRecord().status, 'generating');
  assert.equal(harness.controller.getActiveRecord().reviewedScriptId, null);
});

test('current done atomically records immutable review snapshot and start UUID', () => {
  const harness = makeControllerHarness();
  harness.controller.bootstrap();
  harness.generationCalls[0].handlers.onDone({
    script_id: 'b'.repeat(32),
    summary: {
      title: '磁盘标题',
      worldbook_excerpt:
        '<img src=x onerror=window.__projectTwoXss=1>',
      worldbook_truncated: true,
      path: 'must-not-persist',
    },
  });
  const record = harness.controller.getActiveRecord();
  assert.equal(record.status, 'review');
  assert.equal(record.reviewedScriptId, 'b'.repeat(32));
  assert.deepEqual(record.reviewSnapshot, {
    title: '磁盘标题',
    worldbookExcerpt:
      '<img src=x onerror=window.__projectTwoXss=1>',
    worldbookTruncated: true,
  });
  assert.equal(Object.isFrozen(record.reviewSnapshot), true);
  assert.equal(
    record.startIdempotencyKey,
    '22222222-2222-4222-8222-222222222222',
  );
  assert.equal(JSON.stringify(record).includes('path'), false);
});

test('review restores without generation and explicit regeneration clears review atomically', () => {
  const storage = new MemoryStorage();
  const parsed = parseEntryQuery(validSearch('memory-identity', 'participant'));
  const claimed = claimNewEntry(parsed, storage);
  const generating = beginGenerationAttempt(
    storage,
    claimed.key,
    () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  acceptGenerationDone(
    storage,
    claimed.key,
    generating.currentAttemptToken,
    {
      script_id: 'c'.repeat(32),
      summary: {
        title: '审阅标题',
        worldbook_excerpt: '审阅正文',
        worldbook_truncated: false,
      },
    },
    () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );

  const harness = makeControllerHarness({
    search: '',
    storage,
    uuid: uuidQueue('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  });
  assert.equal(harness.controller.bootstrap().kind, 'project-two');
  assert.equal(harness.generationCalls.length, 0);
  harness.controller.regenerateWorldbook();
  const retry = harness.controller.getActiveRecord();
  assert.equal(retry.status, 'generating');
  assert.equal(retry.attempts, 2);
  assert.equal(retry.reviewedScriptId, null);
  assert.equal(retry.reviewSnapshot, null);
  assert.equal(retry.startIdempotencyKey, null);
  assert.equal(harness.generationCalls.length, 1);
});

test('reviewed start request binds current script and stable idempotency key', () => {
  const storage = new MemoryStorage();
  const claimed = claimNewEntry(parseEntryQuery(validSearch()), storage);
  const generating = beginGenerationAttempt(
    storage,
    claimed.key,
    () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  const review = acceptGenerationDone(
    storage,
    claimed.key,
    generating.currentAttemptToken,
    {
      script_id: 'd'.repeat(32),
      summary: {
        title: '标题',
        worldbook_excerpt: '正文',
        worldbook_truncated: false,
      },
    },
    () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );
  const request = beginReviewedStart(storage, claimed.key);
  assert.deepEqual(request, {
    scriptId: 'd'.repeat(32),
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
  const started = acceptReviewedStart(
    storage,
    claimed.key,
    request.scriptId,
    request.idempotencyKey,
  );
  assert.equal(started.status, 'started');
  assert.deepEqual(started.reviewSnapshot, review.reviewSnapshot);
});

test('failed reviewed starts retain the same snapshot and idempotency key for retry', () => {
  const storage = new MemoryStorage();
  const claimed = claimNewEntry(parseEntryQuery(validSearch()), storage);
  const generating = beginGenerationAttempt(
    storage,
    claimed.key,
    () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  const review = acceptGenerationDone(
    storage,
    claimed.key,
    generating.currentAttemptToken,
    {
      script_id: 'e'.repeat(32),
      summary: {
        title: '重试标题',
        worldbook_excerpt: '仍在审阅中的正文',
        worldbook_truncated: false,
      },
    },
    () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );

  const firstRequest = beginReviewedStart(storage, claimed.key);
  // A failed HTTP request performs no state transition.
  const afterFailure = JSON.parse(storage.getItem(claimed.key));
  const retryRequest = beginReviewedStart(storage, claimed.key);

  assert.deepEqual(afterFailure, review);
  assert.deepEqual(retryRequest, firstRequest);
  assert.equal(
    retryRequest.idempotencyKey,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );
});

test('two tab-local storages never overwrite each other', () => {
  const firstStorage = new MemoryStorage();
  const secondStorage = new MemoryStorage();
  const parsed = parseEntryQuery(validSearch('energy-civilization', 'witness'));
  claimNewEntry(parsed, firstStorage);
  claimNewEntry(parsed, secondStorage);
  const key = recordKeyFor(parsed);
  const first = JSON.parse(firstStorage.getItem(key));
  first.attempts = 9;
  firstStorage.setItem(key, JSON.stringify(first));
  assert.equal(JSON.parse(secondStorage.getItem(key)).attempts, 0);
});

test('pure stale token operations do not alter the current persisted record', () => {
  const storage = new MemoryStorage();
  const claimed = claimNewEntry(parseEntryQuery(validSearch()), storage);
  const current = beginGenerationAttempt(
    storage,
    claimed.key,
    () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  assert.equal(
    acceptGenerationDone(
      storage,
      claimed.key,
      'stale-token',
      {
        script_id: 'e'.repeat(32),
        summary: {
          title: 'stale',
          worldbook_excerpt: 'stale',
          worldbook_truncated: false,
        },
      },
      () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ),
    null,
  );
  assert.equal(
    failGenerationAttempt(
      storage,
      claimed.key,
      'stale-token',
      'STALE_ERROR',
    ),
    null,
  );
  assert.deepEqual(JSON.parse(storage.getItem(claimed.key)), current);
});
