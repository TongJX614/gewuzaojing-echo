import type { OpenAiCompatibleConnection } from './llm-config';

export type OpenAiCompatibleTaskConfig = Readonly<{
  connection: OpenAiCompatibleConnection;
  model: string;
}>;

export function buildChatCompletionsUrl(baseUrl: string): string {
  if (baseUrl.length === 0 || baseUrl !== baseUrl.trim()) {
    throw new Error('INVALID_OPENAI_COMPATIBLE_BASE_URL');
  }

  try {
    const url = new URL(baseUrl);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error('invalid');
    }
    url.pathname = `${url.pathname.replace(/\/+$/u, '')}/chat/completions`;
    return url.toString();
  } catch {
    throw new Error('INVALID_OPENAI_COMPATIBLE_BASE_URL');
  }
}

export function createAuthorizationHeader(
  apiKey: string,
): Readonly<Record<'Authorization', string>> {
  return Object.freeze({ Authorization: `Bearer ${apiKey}` });
}
