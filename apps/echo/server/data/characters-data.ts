// ABOUTME: 服务端角色数据（供 AI 对话构建 system prompt 使用）
// 直接从客户端 characters.ts 映射，避免数据重复

import { CHARACTERS } from '../../src/data/characters';

export interface ServerCharacterData {
  name: string;
  role?: string;
  personality?: string;
  background?: string;
  appearance?: string;
}

export const charactersData: Record<string, ServerCharacterData> = Object.fromEntries(
  Object.entries(CHARACTERS).map(([id, c]) => [
    id,
    {
      name: c.name,
      role: c.occupation,
      personality: c.personality,
      background: `${c.motivation}；${c.arc}`,
      appearance: c.appearance,
    } satisfies ServerCharacterData,
  ]),
);
