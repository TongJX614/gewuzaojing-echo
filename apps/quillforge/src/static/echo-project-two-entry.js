(function (factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (typeof globalThis === 'object') {
    globalThis.EchoProjectTwo = api;
  }
})(function () {
  'use strict';

  const ACTIVE_KEY = 'qf:echo-project-2:active';
  const ENTRY_ID = 'echo-project-2';
  const VERSION = 1;
  const MAX_QUERY_CODE_POINTS = 256;
  const RECORD_FIELDS = [
    'attempts',
    'canonicalBrief',
    'currentAttemptToken',
    'errorCode',
    'reviewSnapshot',
    'reviewedScriptId',
    'roleId',
    'startIdempotencyKey',
    'status',
    'themeId',
    'version',
  ];
  const REVIEW_FIELDS = [
    'title',
    'worldbookExcerpt',
    'worldbookTruncated',
  ];
  const STATUSES = new Set([
    'claimed',
    'generating',
    'review',
    'error',
    'started',
  ]);
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const SCRIPT_ID = /^[0-9a-f]{32}$/;

  const THEMES = Object.freeze({
    'observation-reality': Object.freeze({
      label: '观测与真实',
      roles: Object.freeze({
        witness:
          '一个观测会改变被观测现实的世界。你追踪互相矛盾的证据，并检验“不干预”是否真的可能。',
        calibrator:
          '一个观测会改变被观测现实的世界。你修复失真的观测链，却必须决定哪一种现实值得保留。',
        participant:
          '一个观测会改变被观测现实的世界。你卷入冲突，并逐渐怀疑自己是否也是一次观测的产物。',
      }),
    }),
    'memory-identity': Object.freeze({
      label: '记忆与身份',
      roles: Object.freeze({
        witness:
          '一个记忆可以复制、删改和重放的世界。你整理彼此冲突的记忆证词，寻找身份连续性的证据。',
        calibrator:
          '一个记忆可以复制、删改和重放的世界。你修复记忆异常，却必须判断哪些遗忘不该被纠正。',
        participant:
          '一个记忆可以复制、删改和重放的世界。你发现自己的过去存在多个版本，必须决定哪一份记忆构成“我”。',
      }),
    }),
    'energy-civilization': Object.freeze({
      label: '能量与文明',
      roles: Object.freeze({
        witness:
          '一个以有限能源维系生存与探索的封闭文明。你记录每次分配的得失，并追问中立是否也是一种选择。',
        calibrator:
          '一个以有限能源维系生存与探索的封闭文明。你重建失衡系统，却必须决定谁先获得能源、谁承担代价。',
        participant:
          '一个以有限能源维系生存与探索的封闭文明。你被置于关键配给之中，而个人生存与文明远行无法同时得到保证。',
      }),
    }),
  });
  const ROLES = Object.freeze({
    witness: '旁证者',
    calibrator: '校准员',
    participant: '当事人',
  });

  function codePointLength(value) {
    return Array.from(value).length;
  }

  function decodeComponent(value) {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  }

  function sortedKeys(value) {
    return Object.keys(value).sort();
  }

  function sameKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const actual = sortedKeys(value);
    return (
      actual.length === expected.length &&
      actual.every((key, index) => key === expected[index])
    );
  }

  function assertPair(themeId, roleId) {
    const theme = THEMES[themeId];
    if (!theme || !Object.prototype.hasOwnProperty.call(theme.roles, roleId)) {
      throw new Error('Unsupported project-two theme and role pair.');
    }
    return theme;
  }

  function buildCanonicalPrompt(selection) {
    if (!selection || typeof selection !== 'object') {
      throw new TypeError('A project-two selection is required.');
    }
    const themeId = selection.themeId;
    const roleId = selection.roleId;
    const theme = assertPair(themeId, roleId);
    const brief = theme.roles[roleId];
    return (
      '项目二·世界编织。母题：' +
      theme.label +
      '。身份：' +
      ROLES[roleId] +
      '。世界书简报：' +
      brief +
      '\n请生成原创科幻科普世界书与互动剧本；科学规律是边界，不冒充真实历史。'
    );
  }

  function parseEntryQuery(search) {
    if (typeof search !== 'string') {
      return { kind: 'ordinary' };
    }
    if (search === '' || search === '?') {
      return { kind: 'ordinary' };
    }
    if (codePointLength(search) > MAX_QUERY_CODE_POINTS) {
      return { kind: 'invalid', errorCode: 'ENTRY_QUERY_TOO_LONG' };
    }

    const query = search.startsWith('?') ? search.slice(1) : search;
    const rawParts = query.split('&').filter((part) => part !== '');
    let hasEntry = false;
    for (const rawPart of rawParts) {
      const separator = rawPart.indexOf('=');
      const rawKey = separator < 0 ? rawPart : rawPart.slice(0, separator);
      try {
        if (decodeComponent(rawKey) === 'entry') hasEntry = true;
      } catch (_error) {
        // An unrelated malformed query remains outside this entry protocol.
      }
    }
    if (!hasEntry) return { kind: 'ordinary' };

    try {
      const pairs = rawParts.map((rawPart) => {
        const separator = rawPart.indexOf('=');
        if (separator < 0) throw new Error('Missing query value.');
        return [
          decodeComponent(rawPart.slice(0, separator)),
          decodeComponent(rawPart.slice(separator + 1)),
        ];
      });
      const allowedKeys = new Set(['entry', 'v', 'theme', 'role']);
      const values = Object.create(null);
      if (pairs.length !== allowedKeys.size) {
        return { kind: 'invalid', errorCode: 'ENTRY_QUERY_SHAPE' };
      }
      for (const [key, value] of pairs) {
        if (!allowedKeys.has(key) || Object.prototype.hasOwnProperty.call(values, key)) {
          return { kind: 'invalid', errorCode: 'ENTRY_QUERY_SHAPE' };
        }
        values[key] = value;
      }
      if (values.entry !== ENTRY_ID || values.v !== String(VERSION)) {
        return { kind: 'invalid', errorCode: 'ENTRY_VERSION_UNSUPPORTED' };
      }
      const theme = THEMES[values.theme];
      if (!theme || !Object.prototype.hasOwnProperty.call(theme.roles, values.role)) {
        return { kind: 'invalid', errorCode: 'ENTRY_SELECTION_INVALID' };
      }
      const parsed = {
        kind: 'project-two',
        themeId: values.theme,
        roleId: values.role,
        themeLabel: theme.label,
        roleLabel: ROLES[values.role],
        canonicalBrief: theme.roles[values.role],
      };
      parsed.prompt = buildCanonicalPrompt(parsed);
      return Object.freeze(parsed);
    } catch (_error) {
      return { kind: 'invalid', errorCode: 'ENTRY_QUERY_MALFORMED' };
    }
  }

  function recordKeyFor(value) {
    if (!value || typeof value !== 'object') {
      throw new TypeError('A project-two record or selection is required.');
    }
    assertPair(value.themeId, value.roleId);
    return (
      'qf:echo-project-2:v1:' + value.themeId + ':' + value.roleId
    );
  }

  function assertStorage(storage) {
    if (
      !storage ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function'
    ) {
      throw new TypeError('A sessionStorage-compatible store is required.');
    }
  }

  function freezeRecord(record) {
    if (record.reviewSnapshot) Object.freeze(record.reviewSnapshot);
    return Object.freeze(record);
  }

  function validateReviewSnapshot(snapshot) {
    return (
      sameKeys(snapshot, REVIEW_FIELDS) &&
      typeof snapshot.title === 'string' &&
      typeof snapshot.worldbookExcerpt === 'string' &&
      typeof snapshot.worldbookTruncated === 'boolean'
    );
  }

  function validateRecord(record, expectedKey) {
    if (!sameKeys(record, RECORD_FIELDS)) {
      throw new Error('Project-two record has an invalid shape.');
    }
    const theme = assertPair(record.themeId, record.roleId);
    if (
      record.version !== VERSION ||
      record.canonicalBrief !== theme.roles[record.roleId] ||
      !STATUSES.has(record.status) ||
      !Number.isInteger(record.attempts) ||
      record.attempts < 0
    ) {
      throw new Error('Project-two record failed validation.');
    }
    if (recordKeyFor(record) !== expectedKey) {
      throw new Error('Project-two record key mismatch.');
    }

    if (record.status === 'generating') {
      if (!UUID_V4.test(record.currentAttemptToken)) {
        throw new Error('Generating record lacks a valid attempt token.');
      }
    } else if (record.currentAttemptToken !== null) {
      throw new Error('Non-generating record contains an attempt token.');
    }

    if (record.status === 'review' || record.status === 'started') {
      if (
        !SCRIPT_ID.test(record.reviewedScriptId) ||
        !validateReviewSnapshot(record.reviewSnapshot) ||
        !UUID_V4.test(record.startIdempotencyKey)
      ) {
        throw new Error('Reviewed record is incomplete.');
      }
    } else if (
      record.reviewedScriptId !== null ||
      record.reviewSnapshot !== null ||
      record.startIdempotencyKey !== null
    ) {
      throw new Error('Pending record contains reviewed output.');
    }

    if (record.status === 'error') {
      if (
        typeof record.errorCode !== 'string' ||
        record.errorCode.length === 0 ||
        record.errorCode.length > 128
      ) {
        throw new Error('Error record lacks an error code.');
      }
    } else if (record.errorCode !== null) {
      throw new Error('Non-error record contains an error code.');
    }
    return freezeRecord(record);
  }

  function readRecord(storage, key) {
    assertStorage(storage);
    const raw = storage.getItem(key);
    if (raw === null) throw new Error('Project-two record is missing.');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      throw new Error('Project-two record is not valid JSON.');
    }
    return validateRecord(parsed, key);
  }

  function persistRecord(storage, key, record) {
    assertStorage(storage);
    validateRecord(record, key);
    const serialized = JSON.stringify(record);
    storage.setItem(key, serialized);
    const reread = readRecord(storage, key);
    if (JSON.stringify(reread) !== serialized) {
      throw new Error('Project-two record write verification failed.');
    }
    return reread;
  }

  function persistActiveKey(storage, key) {
    storage.setItem(ACTIVE_KEY, key);
    if (storage.getItem(ACTIVE_KEY) !== key) {
      throw new Error('Project-two active pointer write verification failed.');
    }
  }

  function makeClaimedRecord(parsed) {
    return {
      version: VERSION,
      themeId: parsed.themeId,
      roleId: parsed.roleId,
      canonicalBrief: parsed.canonicalBrief,
      status: 'claimed',
      attempts: 0,
      currentAttemptToken: null,
      reviewedScriptId: null,
      reviewSnapshot: null,
      startIdempotencyKey: null,
      errorCode: null,
    };
  }

  function claimNewEntry(parsed, storage) {
    assertStorage(storage);
    if (!parsed || parsed.kind !== 'project-two') {
      throw new Error('Only a validated project-two entry can be claimed.');
    }
    const key = recordKeyFor(parsed);
    const activeKey = storage.getItem(ACTIVE_KEY);
    if (activeKey === key) {
      return { created: false, key, record: readRecord(storage, key) };
    }
    const record = persistRecord(storage, key, makeClaimedRecord(parsed));
    persistActiveKey(storage, key);
    return { created: true, key, record };
  }

  function restoreActiveEntry(storage) {
    assertStorage(storage);
    const key = storage.getItem(ACTIVE_KEY);
    if (key === null) return null;
    if (!key.startsWith('qf:echo-project-2:v1:')) {
      throw new Error('Project-two active pointer is invalid.');
    }
    let record = readRecord(storage, key);
    if (record.status === 'claimed' || record.status === 'generating') {
      record = persistRecord(storage, key, {
        ...record,
        status: 'error',
        currentAttemptToken: null,
        reviewedScriptId: null,
        reviewSnapshot: null,
        startIdempotencyKey: null,
        errorCode: 'GENERATION_INTERRUPTED',
      });
    }
    return { key, record };
  }

  function nextUuid(uuidSource) {
    if (typeof uuidSource !== 'function') {
      throw new TypeError('A UUID source is required.');
    }
    const value = uuidSource();
    if (!UUID_V4.test(value)) throw new Error('UUID source returned an invalid UUID.');
    return value;
  }

  function beginGenerationAttempt(storage, key, uuidSource) {
    const current = readRecord(storage, key);
    if (!['claimed', 'error', 'review'].includes(current.status)) {
      throw new Error('Generation cannot begin from the current state.');
    }
    return persistRecord(storage, key, {
      ...current,
      status: 'generating',
      attempts: current.attempts + 1,
      currentAttemptToken: nextUuid(uuidSource),
      reviewedScriptId: null,
      reviewSnapshot: null,
      startIdempotencyKey: null,
      errorCode: null,
    });
  }

  function validateDonePayload(payload) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !SCRIPT_ID.test(payload.script_id) ||
      !payload.summary ||
      typeof payload.summary !== 'object' ||
      typeof payload.summary.title !== 'string' ||
      typeof payload.summary.worldbook_excerpt !== 'string' ||
      typeof payload.summary.worldbook_truncated !== 'boolean'
    ) {
      throw new Error('Generation result failed validation.');
    }
    return {
      title: payload.summary.title,
      worldbookExcerpt: payload.summary.worldbook_excerpt,
      worldbookTruncated: payload.summary.worldbook_truncated,
    };
  }

  function acceptGenerationDone(
    storage,
    key,
    attemptToken,
    payload,
    uuidSource,
  ) {
    const current = readRecord(storage, key);
    if (
      current.status !== 'generating' ||
      current.currentAttemptToken !== attemptToken
    ) {
      return null;
    }
    const snapshot = validateDonePayload(payload);
    return persistRecord(storage, key, {
      ...current,
      status: 'review',
      currentAttemptToken: null,
      reviewedScriptId: payload.script_id,
      reviewSnapshot: snapshot,
      startIdempotencyKey: nextUuid(uuidSource),
      errorCode: null,
    });
  }

  function normalizeErrorCode(errorCode) {
    const value =
      typeof errorCode === 'string' && errorCode.length > 0
        ? errorCode
        : 'GENERATION_FAILED';
    return value.slice(0, 128);
  }

  function failGenerationAttempt(storage, key, attemptToken, errorCode) {
    const current = readRecord(storage, key);
    if (
      current.status !== 'generating' ||
      current.currentAttemptToken !== attemptToken
    ) {
      return null;
    }
    return persistRecord(storage, key, {
      ...current,
      status: 'error',
      currentAttemptToken: null,
      reviewedScriptId: null,
      reviewSnapshot: null,
      startIdempotencyKey: null,
      errorCode: normalizeErrorCode(errorCode),
    });
  }

  function beginReviewedStart(storage, key) {
    const current = readRecord(storage, key);
    if (current.status !== 'review') {
      throw new Error('Only a reviewed script can start.');
    }
    return {
      scriptId: current.reviewedScriptId,
      idempotencyKey: current.startIdempotencyKey,
    };
  }

  function acceptReviewedStart(storage, key, scriptId, idempotencyKey) {
    const current = readRecord(storage, key);
    if (
      current.status !== 'review' ||
      current.reviewedScriptId !== scriptId ||
      current.startIdempotencyKey !== idempotencyKey
    ) {
      throw new Error('Reviewed start response does not match the active review.');
    }
    return persistRecord(storage, key, {
      ...current,
      status: 'started',
    });
  }

  function createEntryController(dependencies) {
    if (!dependencies || typeof dependencies !== 'object') {
      throw new TypeError('Entry controller dependencies are required.');
    }
    const storage = dependencies.storage;
    const history = dependencies.history;
    const location = dependencies.location;
    const uuidSource = dependencies.uuid;
    const transport = dependencies.transport;
    const renderer = dependencies.renderer;
    assertStorage(storage);
    if (
      !history ||
      typeof history.replaceState !== 'function' ||
      !location ||
      typeof location.search !== 'string' ||
      typeof location.pathname !== 'string' ||
      typeof location.hash !== 'string' ||
      !transport ||
      typeof transport.generate !== 'function' ||
      !renderer ||
      typeof renderer.render !== 'function'
    ) {
      throw new TypeError('Entry controller dependencies are incomplete.');
    }

    let activeKey = null;
    let bootstrapped = false;
    let bootstrapOutcome = null;

    function render(view) {
      renderer.render(view);
      return view;
    }

    function renderRecord(record) {
      return render({ kind: 'project-two', record });
    }

    function localError(errorCode) {
      return render({ kind: 'error', errorCode });
    }

    function scrubQuery() {
      history.replaceState(null, '', location.pathname + location.hash);
    }

    function currentRecord() {
      const key = activeKey || storage.getItem(ACTIVE_KEY);
      if (key === null) return null;
      activeKey = key;
      return readRecord(storage, key);
    }

    function dispatchGeneration(record) {
      const token = record.currentAttemptToken;
      const handlers = {
        onProgress(progress) {
          const latest = currentRecord();
          if (
            latest &&
            latest.status === 'generating' &&
            latest.currentAttemptToken === token
          ) {
            render({ kind: 'project-two', record: latest, progress });
          }
        },
        onDone(payload) {
          try {
            const accepted = acceptGenerationDone(
              storage,
              activeKey,
              token,
              payload,
              uuidSource,
            );
            if (accepted) renderRecord(accepted);
          } catch (_error) {
            const failed = failGenerationAttempt(
              storage,
              activeKey,
              token,
              'GENERATION_RESULT_INVALID',
            );
            if (failed) renderRecord(failed);
          }
        },
        onError(errorCode) {
          try {
            const failed = failGenerationAttempt(
              storage,
              activeKey,
              token,
              errorCode,
            );
            if (failed) renderRecord(failed);
          } catch (_error) {
            localError('LOCAL_STATE_ERROR');
          }
        },
      };
      try {
        const pending = transport.generate(buildCanonicalPrompt(record), handlers);
        if (pending && typeof pending.catch === 'function') {
          pending.catch(() => handlers.onError('TRANSPORT_ERROR'));
        }
      } catch (_error) {
        handlers.onError('TRANSPORT_ERROR');
      }
    }

    function startGeneration() {
      const record = beginGenerationAttempt(storage, activeKey, uuidSource);
      renderRecord(record);
      dispatchGeneration(record);
      return record;
    }

    function bootstrap() {
      if (bootstrapped) return bootstrapOutcome;
      bootstrapped = true;
      const parsed = parseEntryQuery(location.search);
      if (parsed.kind === 'invalid') {
        try {
          scrubQuery();
          bootstrapOutcome = localError(parsed.errorCode);
        } catch (_error) {
          bootstrapOutcome = localError('HISTORY_SCRUB_FAILED');
        }
        return bootstrapOutcome;
      }

      if (parsed.kind === 'project-two') {
        let claimed;
        try {
          claimed = claimNewEntry(parsed, storage);
          activeKey = claimed.key;
        } catch (_error) {
          bootstrapOutcome = localError('LOCAL_STATE_ERROR');
          return bootstrapOutcome;
        }
        try {
          scrubQuery();
        } catch (_error) {
          bootstrapOutcome = localError('HISTORY_SCRUB_FAILED');
          return bootstrapOutcome;
        }
        try {
          if (claimed.created) {
            startGeneration();
          } else {
            const restored = restoreActiveEntry(storage);
            activeKey = restored.key;
            renderRecord(restored.record);
          }
          bootstrapOutcome = {
            kind: 'project-two',
            record: currentRecord(),
          };
        } catch (_error) {
          bootstrapOutcome = localError('LOCAL_STATE_ERROR');
        }
        return bootstrapOutcome;
      }

      try {
        const restored = restoreActiveEntry(storage);
        if (restored === null) {
          bootstrapOutcome = render({ kind: 'ordinary' });
        } else {
          activeKey = restored.key;
          bootstrapOutcome = renderRecord(restored.record);
        }
      } catch (_error) {
        bootstrapOutcome = localError('LOCAL_STATE_ERROR');
      }
      return bootstrapOutcome;
    }

    function retryGeneration() {
      const current = currentRecord();
      if (!current || current.status !== 'error') {
        throw new Error('Only an errored generation can be retried.');
      }
      return startGeneration();
    }

    function regenerateWorldbook() {
      const current = currentRecord();
      if (!current || current.status !== 'review') {
        throw new Error('Only a reviewed worldbook can be regenerated.');
      }
      return startGeneration();
    }

    function reviewedStartRequest() {
      return beginReviewedStart(storage, activeKey);
    }

    function markReviewedStartAccepted(scriptId, idempotencyKey) {
      const record = acceptReviewedStart(
        storage,
        activeKey,
        scriptId,
        idempotencyKey,
      );
      renderRecord(record);
      return record;
    }

    return Object.freeze({
      bootstrap,
      getActiveRecord: currentRecord,
      retryGeneration,
      regenerateWorldbook,
      beginReviewedStart: reviewedStartRequest,
      acceptReviewedStart: markReviewedStartAccepted,
    });
  }

  return Object.freeze({
    parseEntryQuery,
    buildCanonicalPrompt,
    recordKeyFor,
    claimNewEntry,
    restoreActiveEntry,
    beginGenerationAttempt,
    acceptGenerationDone,
    failGenerationAttempt,
    beginReviewedStart,
    acceptReviewedStart,
    createEntryController,
  });
});
