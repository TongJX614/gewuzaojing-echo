import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type PortableEnv = Readonly<Record<string, string>>;

export class GewuzaojingConfigError extends Error {
  readonly code: string;
  readonly keys: readonly string[];

  constructor(code: string, keys: readonly string[] = []) {
    super(keys.length > 0 ? `${code}: ${keys.join(',')}` : code);
    this.name = 'GewuzaojingConfigError';
    this.code = code;
    this.keys = Object.freeze([...keys]);
  }
}

export interface ResolveEnvPathOptions {
  processEnv?: NodeJS.ProcessEnv;
  startPath?: string;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function defaultStartPath(): string {
  if (typeof __filename === 'string') {
    return __filename;
  }
  const entryPath = process.argv[1];
  if (entryPath !== undefined && entryPath.length > 0) {
    return resolve(entryPath);
  }
  throw new GewuzaojingConfigError('AGGREGATION_ROOT_NOT_FOUND', [
    'GEWUZAOJING_ENV_FILE',
  ]);
}

export function resolveGewuzaojingEnvPath(
  options: ResolveEnvPathOptions = {},
): string {
  const processEnv = options.processEnv ?? process.env;
  const override = processEnv.GEWUZAOJING_ENV_FILE;
  if (override !== undefined) {
    if (!isAbsolute(override)) {
      throw new GewuzaojingConfigError('ENV_PATH_NOT_ABSOLUTE', [
        'GEWUZAOJING_ENV_FILE',
      ]);
    }
    return resolve(override);
  }

  return join(findRepositoryRoot(options.startPath ?? defaultStartPath()), '.env');
}

export function findRepositoryRoot(startPath: string): string {
  let current = isDirectory(startPath) ? resolve(startPath) : dirname(resolve(startPath));
  for (;;) {
    if (
      existsSync(join(current, 'package.json')) &&
      existsSync(join(current, 'shared', 'contracts', 'environment.json'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new GewuzaojingConfigError('AGGREGATION_ROOT_NOT_FOUND', ['GEWUZAOJING_ENV_FILE']);
}

export function parsePortableEnv(text: string): PortableEnv {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const result: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/u)) {
    if (rawLine.includes('\r')) {
      throw new GewuzaojingConfigError('ENV_SYNTAX');
    }
    if (rawLine.trim().length === 0 || rawLine.trimStart().startsWith('#')) {
      continue;
    }

    const separator = rawLine.indexOf('=');
    if (separator <= 0) {
      throw new GewuzaojingConfigError('ENV_SYNTAX');
    }

    const key = rawLine.slice(0, separator);
    const value = rawLine.slice(separator + 1);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) {
      throw new GewuzaojingConfigError('ENV_SYNTAX');
    }
    if (
      value !== value.trim() ||
      /["'#$]/u.test(value) ||
      value.includes('\n')
    ) {
      throw new GewuzaojingConfigError('ENV_SYNTAX', [key]);
    }
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      throw new GewuzaojingConfigError('ENV_SYNTAX', [key]);
    }
    result[key] = value;
  }

  return Object.freeze(result);
}

export function readPortableEnvFile(path: string): PortableEnv {
  if (!existsSync(path)) {
    throw new GewuzaojingConfigError('ENV_FILE_MISSING');
  }
  try {
    return parsePortableEnv(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error instanceof GewuzaojingConfigError) {
      throw error;
    }
    throw new GewuzaojingConfigError('ENV_FILE_READ_FAILED');
  }
}

export function applyAtomicConnectionOverride(
  fileValues: PortableEnv,
  processEnv: NodeJS.ProcessEnv,
  prefix: 'SHARED_LLM' | 'ECHO_LLM' | 'QUILLFORGE_LLM',
): PortableEnv {
  const keys = [
    `${prefix}_PROVIDER`,
    `${prefix}_API_KEY`,
    `${prefix}_BASE_URL`,
  ] as const;
  const presentKeys = keys.filter((key) => processEnv[key] !== undefined);
  if (presentKeys.length === 0) {
    return fileValues;
  }
  if (presentKeys.length !== keys.length) {
    throw new GewuzaojingConfigError(
      'ATOMIC_CONNECTION_OVERRIDE',
      presentKeys,
    );
  }

  return Object.freeze({
    ...fileValues,
    [keys[0]]: processEnv[keys[0]] ?? '',
    [keys[1]]: processEnv[keys[1]] ?? '',
    [keys[2]]: processEnv[keys[2]] ?? '',
  });
}
