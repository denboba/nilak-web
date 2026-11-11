// Posts the person marked "Not interested", kept in this browser like in Nilak for Android
const STORAGE_KEY = 'nilak-not-interested';
const MAX_ENTRIES = 500;

export function getNotInterestedKeys(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch (err) {
    return new Set();
  }
}

export function markNotInterested(chatId: string, messageId: number) {
  const keys = Array.from(getNotInterestedKeys());
  keys.push(buildPostKey(chatId, messageId));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-MAX_ENTRIES)));
  } catch (err) {
    // Nothing to do when storage is unavailable; the post is still hidden until reload
  }
}

export function buildPostKey(chatId: string, messageId: number) {
  return `${chatId}:${messageId}`;
}
