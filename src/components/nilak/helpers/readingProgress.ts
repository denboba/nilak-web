// Reading progress stays in this browser only, like in Nilak for Android; storage can be unavailable (private mode)
const STORAGE_KEY = 'nilak-reading-progress';
const MAX_ENTRIES = 200;

type ProgressByKey = Record<string, number>;

export function getReadingProgress(chatId: string, messageId: number) {
  return readAll()[buildKey(chatId, messageId)] || 0;
}

export function saveReadingProgress(chatId: string, messageId: number, percent: number) {
  const all = readAll();
  const key = buildKey(chatId, messageId);
  delete all[key];
  all[key] = Math.round(percent);

  const keys = Object.keys(all);
  keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).forEach((oldKey) => delete all[oldKey]);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    // Progress is a convenience: nothing to do when storage is full or blocked
  }
}

function readAll(): ProgressByKey {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (err) {
    return {};
  }
}

function buildKey(chatId: string, messageId: number) {
  return `${chatId}:${messageId}`;
}
