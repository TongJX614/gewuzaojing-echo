import type { SaveSlotEntry, SaveSlotId } from '../systems/save-game';

export function slotLabel(slotId: SaveSlotId): string {
  if (slotId === 'auto') return '自动存档';
  return '手动存档 ' + slotId.slice(-1);
}

export function formatPlaytime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minuteText = String(minutes).padStart(2, '0');
  const secondText = String(seconds).padStart(2, '0');
  if (hours === 0) return minuteText + ':' + secondText;
  return String(hours).padStart(2, '0') + ':' + minuteText + ':' + secondText;
}

export function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function saveSlotDescription(entry: SaveSlotEntry): string {
  if (entry.status === 'empty') return '空存档';
  if (entry.status === 'invalid') return '存档不可用';
  const { summary, savedAt } = entry.envelope;
  return [
    summary.sceneId,
    summary.stage,
    formatPlaytime(summary.playtimeMs),
    formatSavedAt(savedAt),
  ].join(' · ');
}
