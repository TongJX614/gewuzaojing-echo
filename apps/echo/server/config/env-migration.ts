import {
  GewuzaojingConfigError,
  parsePortableEnv,
  type PortableEnv,
} from './portable-env';

export type MigratedRootEnv = Readonly<{
  text: string;
  sameConnection: boolean;
  echoSource: 'shared' | 'dedicated';
  quillforgeSource: 'shared' | 'dedicated';
}>;

const PASSTHROUGH_KEYS = [
  'LLM_TEMPERATURE',
  'LLM_MAX_TOKENS',
  'LLM_TIMEOUT',
  'LLM_CONNECT_TIMEOUT',
  'SCRIPT_GEN_TEMPERATURE',
  'SCRIPT_GEN_MAX_TOKENS',
  'SCRIPT_GEN_TIMEOUT',
  'SESSION_TTL_SECONDS',
  'SESSION_TTL_MINUTES',
  'SESSION_MAX_SIZE',
  'QUILLFORGE_API_KEY',
  'RATE_LIMIT_PER_MINUTE',
  'NUMBA_THREADING_LAYER',
  'NUMBA_NUM_THREADS',
  'IMAGE_CONCURRENCY',
  'IMAGE_BG_PRELOAD_COUNT',
  'SCENE_IMAGE_CAP',
  'IMAGE_STAGGER_SEC',
  'IMAGE_REMOVE_BG',
  'IMAGE_API_KEY',
  'IMAGE_BASE_URL',
  'IMAGE_MODEL',
  'IMAGE_QUALITY',
  'IMAGE_WATERMARK',
  'IMAGE_SIZE_BG',
  'IMAGE_SIZE_CHAR',
  'TTS_CONCURRENCY',
  'TTS_API_KEY',
  'TTS_BASE_URL',
  'TTS_MODEL',
  'TTS_FALLBACK_MODEL',
  'TTS_DEFAULT_VOICE',
  'TTS_DEFAULT_VOICE_MALE',
  'TTS_DEFAULT_VOICE_FEMALE',
  'TTS_VOICE_MAP',
  'TTS_VOICE_MALE_BY_AGE',
  'TTS_VOICE_FEMALE_BY_AGE',
  'TTS_AGE_THRESHOLDS',
] as const;

function requireLegacy(values: PortableEnv, key: string): string {
  const value = values[key];
  if (value === undefined || value.length === 0) {
    throw new GewuzaojingConfigError('LEGACY_ENV_VALUE_MISSING', [key]);
  }
  return value;
}

function comparableBaseUrl(rawValue: string, key: string): string {
  try {
    const url = new URL(rawValue);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error('invalid');
    }
    url.pathname = url.pathname.replace(/\/+$/u, '');
    return url.toString().replace(/\/$/u, '');
  } catch {
    throw new GewuzaojingConfigError('LEGACY_BASE_URL_INVALID', [key]);
  }
}

export function buildMigratedRootEnv(
  echoLegacy: PortableEnv,
  quillforgeLegacy: PortableEnv,
): MigratedRootEnv {
  const echoKey = requireLegacy(echoLegacy, 'DEEPSEEK_API_KEY');
  const echoBaseUrl = 'https://api.deepseek.com/v1';
  const quillforgeKey = requireLegacy(
    quillforgeLegacy,
    'DEEPSEEK_API_KEY',
  );
  const quillforgeBaseUrl = requireLegacy(
    quillforgeLegacy,
    'DEEPSEEK_BASE_URL',
  );

  const sameConnection =
    echoKey === quillforgeKey &&
    comparableBaseUrl(echoBaseUrl, 'ECHO_LEGACY_BASE_URL') ===
      comparableBaseUrl(quillforgeBaseUrl, 'DEEPSEEK_BASE_URL');
  const echoSource = sameConnection ? 'shared' : 'dedicated';
  const quillforgeSource = sameConnection ? 'shared' : 'dedicated';
  const lines: string[] = [];

  if (sameConnection) {
    lines.push(
      'SHARED_LLM_PROVIDER=openai-compatible',
      `SHARED_LLM_API_KEY=${echoKey}`,
      `SHARED_LLM_BASE_URL=${echoBaseUrl}`,
    );
  } else {
    lines.push(
      'ECHO_LLM_PROVIDER=openai-compatible',
      `ECHO_LLM_API_KEY=${echoKey}`,
      `ECHO_LLM_BASE_URL=${echoBaseUrl}`,
      'QUILLFORGE_LLM_PROVIDER=openai-compatible',
      `QUILLFORGE_LLM_API_KEY=${quillforgeKey}`,
      `QUILLFORGE_LLM_BASE_URL=${quillforgeBaseUrl}`,
    );
  }

  lines.push(
    `ECHO_LLM_SOURCE=${echoSource}`,
    `QUILLFORGE_LLM_SOURCE=${quillforgeSource}`,
    'ECHO_CHAT_MODEL=deepseek-chat',
    'ECHO_QUEST_MODEL=deepseek-chat',
    'QUILLFORGE_RUNTIME_MODEL=deepseek-v4-flash',
    'QUILLFORGE_SCRIPT_MODEL=deepseek-v4-flash',
    'QUILLFORGE_DEBATE_MODEL=deepseek-v4-flash',
    'QUILLFORGE_MINIGAME_MODEL=deepseek-v4-flash',
    'ECHO_HOST=127.0.0.1',
    'ECHO_PORT=5000',
    'QUILLFORGE_HOST=127.0.0.1',
    'QUILLFORGE_PORT=8050',
    'QUILLFORGE_ECHO_ENTRY_ENABLED=true',
  );

  for (const key of PASSTHROUGH_KEYS) {
    const value = quillforgeLegacy[key];
    if (value !== undefined && value.length > 0) {
      lines.push(`${key}=${value}`);
    }
  }

  const text = `${lines.join('\n')}\n`;
  parsePortableEnv(text);
  return Object.freeze({
    text,
    sameConnection,
    echoSource,
    quillforgeSource,
  });
}
