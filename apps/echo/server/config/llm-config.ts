import { isAbsolute, resolve } from 'node:path';

import {
  GewuzaojingConfigError,
  applyAtomicConnectionOverride,
  readPortableEnvFile,
  resolveGewuzaojingEnvPath,
  type PortableEnv,
} from './portable-env';

export type OpenAiCompatibleConnection = Readonly<{
  provider: 'openai-compatible';
  apiKey: string;
  baseUrl: string;
}>;

export type EchoLlmConfig = Readonly<{
  source: 'shared' | 'dedicated';
  connection: OpenAiCompatibleConnection;
  chatModel: string;
  questModel: string;
  host: string;
  port: number;
}>;

export interface LoadEchoLlmConfigOptions {
  envFile?: string;
  processEnv?: NodeJS.ProcessEnv;
  startPath?: string;
}

function requireValue(values: PortableEnv, key: string): string {
  const value = values[key];
  if (value === undefined || value.length === 0) {
    throw new GewuzaojingConfigError('REQUIRED_ENV_VALUE', [key]);
  }
  return value;
}

function scalarValue(
  values: PortableEnv,
  processEnv: NodeJS.ProcessEnv,
  key: string,
): string {
  const processValue = processEnv[key];
  if (processValue !== undefined) {
    if (processValue.length === 0) {
      throw new GewuzaojingConfigError('REQUIRED_ENV_VALUE', [key]);
    }
    return processValue;
  }
  return requireValue(values, key);
}

function normalizeBaseUrl(rawValue: string, key: string): string {
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
    if (!url.pathname.endsWith('/')) {
      url.pathname = `${url.pathname}/`;
    }
    return url.toString();
  } catch {
    throw new GewuzaojingConfigError('INVALID_BASE_URL', [key]);
  }
}

function validateApiKey(value: string, key: string): string {
  if (/(?:placeholder|replace-|change-?me|example-secret)/iu.test(value)) {
    throw new GewuzaojingConfigError('PLACEHOLDER_SECRET', [key]);
  }
  return value;
}

export function loadEchoLlmConfig(
  options: LoadEchoLlmConfigOptions = {},
): EchoLlmConfig {
  const processEnv = options.processEnv ?? process.env;
  let envFile: string;
  if (options.envFile !== undefined) {
    if (!isAbsolute(options.envFile)) {
      throw new GewuzaojingConfigError('ENV_PATH_NOT_ABSOLUTE', ['envFile']);
    }
    envFile = resolve(options.envFile);
  } else {
    envFile = resolveGewuzaojingEnvPath({
      processEnv,
      startPath: options.startPath,
    });
  }

  let values = readPortableEnvFile(envFile);
  values = applyAtomicConnectionOverride(values, processEnv, 'SHARED_LLM');
  values = applyAtomicConnectionOverride(values, processEnv, 'ECHO_LLM');
  values = applyAtomicConnectionOverride(values, processEnv, 'QUILLFORGE_LLM');

  const source = scalarValue(values, processEnv, 'ECHO_LLM_SOURCE');
  if (source !== 'shared' && source !== 'dedicated') {
    throw new GewuzaojingConfigError('INVALID_CONNECTION_SOURCE', [
      'ECHO_LLM_SOURCE',
    ]);
  }
  const prefix = source === 'shared' ? 'SHARED_LLM' : 'ECHO_LLM';
  const providerKey = `${prefix}_PROVIDER`;
  const apiKeyName = `${prefix}_API_KEY`;
  const baseUrlKey = `${prefix}_BASE_URL`;
  const provider = requireValue(values, providerKey);
  if (provider !== 'openai-compatible') {
    throw new GewuzaojingConfigError('UNSUPPORTED_PROVIDER', [providerKey]);
  }

  const portText = scalarValue(values, processEnv, 'ECHO_PORT');
  if (!/^\d+$/u.test(portText)) {
    throw new GewuzaojingConfigError('INVALID_PORT', ['ECHO_PORT']);
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new GewuzaojingConfigError('INVALID_PORT', ['ECHO_PORT']);
  }

  return Object.freeze({
    source,
    connection: Object.freeze({
      provider,
      apiKey: validateApiKey(requireValue(values, apiKeyName), apiKeyName),
      baseUrl: normalizeBaseUrl(requireValue(values, baseUrlKey), baseUrlKey),
    }),
    chatModel: scalarValue(values, processEnv, 'ECHO_CHAT_MODEL'),
    questModel: scalarValue(values, processEnv, 'ECHO_QUEST_MODEL'),
    host: scalarValue(values, processEnv, 'ECHO_HOST'),
    port,
  });
}
