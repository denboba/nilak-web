// Temporary test: does Telegram keep invisible characters in a chat description?
// An admin sends `/tagtest@NilakAppBot` in a test group or channel where the bot may change the chat info.
// The bot writes test tags in several invisible encodings and positions, reads each back, restores the
// description with the best surviving tag in it, and reports. `/tagcheck@NilakAppBot` reports which tags are
// still there (after editing the description in a Telegram app), `/tagclear@NilakAppBot` removes them.

type TelegramRequest = <T = unknown>(method: string, body: Record<string, unknown>) =>
Promise<{ ok: boolean; description?: string; result?: T }>;

type Variant = { name: string; alphabet: string[] };

// Each encoding writes the payload's bits with a few invisible characters
const VARIANTS: Variant[] = [
  { name: 'zero-width space / non-joiner', alphabet: ['\u200B', '\u200C'] },
  { name: 'zero-width 4 chars', alphabet: ['\u200B', '\u200C', '\u200D', '\u2060'] },
  { name: 'invisible math operators', alphabet: ['\u2061', '\u2062', '\u2063', '\u2064'] },
  { name: 'BOM / word joiner', alphabet: ['\uFEFF', '\u2060'] },
  { name: 'Unicode tag letters', alphabet: [] },
];
const PAYLOAD = 'n1';
const TEST_TEXT = 'Nilak tag test';
const POSITIONS = ['start', 'middle', 'end'] as const;
const PAUSE_MS = 400;
const TAG_BASE = 0xE0000;
const INVISIBLE = /[\u200B-\u200D\u2060-\u2064\uFEFF]|\uDB40[\uDC00-\uDC7F]/g;

export const TAG_COMMANDS = new Set(['/tagtest', '/tagcheck', '/tagclear']);

export async function runTagCommand(request: TelegramRequest, chatId: number, command: string) {
  const original = (await request<{ description?: string }>('getChat', { chat_id: chatId })).result?.description
    || '';

  if (command === '/tagcheck') return reportPresentTags(original);
  if (command === '/tagclear') {
    const cleaned = original.replace(INVISIBLE, '');
    const answer = await request('setChatDescription', { chat_id: chatId, description: cleaned });
    return answer.ok || cleaned === original ? 'Invisible tags removed.' : `Could not clear: ${answer.description}`;
  }

  return testTags(request, chatId, original);
}

async function testTags(request: TelegramRequest, chatId: number, original: string) {
  const lines: string[] = [];
  let best: Variant | undefined;

  for (const variant of VARIANTS) {
    const tag = encodeTag(variant, PAYLOAD);
    const results: string[] = [];
    for (const position of POSITIONS) {
      const written = placeTag(TEST_TEXT, tag, position);
      const answer = await request('setChatDescription', { chat_id: chatId, description: written });
      if (!answer.ok) {
        results.push(`${position} ⚠️ ${answer.description}`);
        if (answer.description?.includes('rights')) return 'I need the “Change info” admin right here first.';
        continue;
      }
      const read = (await request<{ description?: string }>('getChat', { chat_id: chatId })).result?.description
        || '';
      const isKept = read.includes(tag);
      if (isKept && position === 'middle' && !best) best = variant;
      results.push(`${position} ${isKept ? '✅' : `❌ (${describeLoss(written, read)})`}`);
      await pause();
    }
    lines.push(`${variant.name}: ${results.join(', ')}`);
  }

  // Leave the best tag inside the real description, so it can be checked in Telegram apps
  const restored = best ? placeTag(original || TEST_TEXT, encodeTag(best, PAYLOAD), 'middle') : original;
  const restoredAnswer = await request('setChatDescription', { chat_id: chatId, description: restored });

  return [
    'Invisible tag test (written by the bot, read back from Telegram):',
    ...lines,
    '',
    best
      ? `The description now holds a “${best.name}” tag. Check that it looks unchanged in Telegram and Nilak, `
      + 'edit the description in a Telegram app, then send /tagcheck@NilakAppBot. /tagclear@NilakAppBot removes it.'
      : 'No tag survived; the description is restored.',
    restoredAnswer.ok ? '' : `Restoring the description failed: ${restoredAnswer.description}`,
  ].join('\n').trim();
}

function reportPresentTags(description: string) {
  const found = VARIANTS.filter((variant) => description.includes(encodeTag(variant, PAYLOAD)));
  const invisibleCount = description.match(INVISIBLE)?.length || 0;
  return found.length
    ? `Still there: ${found.map((variant) => variant.name).join(', ')}.`
    : `No complete tag found (${invisibleCount} invisible characters left).`;
}

function encodeTag(variant: Variant, payload: string) {
  if (!variant.alphabet.length) {
    return Array.from(payload, (char) => String.fromCodePoint(TAG_BASE + char.charCodeAt(0))).join('');
  }

  const bitsPerChar = Math.log2(variant.alphabet.length);
  const bits = Array.from(payload, (char) => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
  let tag = '';
  for (let i = 0; i < bits.length; i += bitsPerChar) {
    tag += variant.alphabet[parseInt(bits.slice(i, i + bitsPerChar), 2)];
  }
  return tag;
}

function placeTag(text: string, tag: string, position: typeof POSITIONS[number]) {
  if (position === 'start') return tag + text;
  if (position === 'end') return text + tag;
  const index = Math.max(1, text.indexOf(' '));
  return text.slice(0, index) + tag + text.slice(index);
}

function describeLoss(written: string, read: string) {
  const writtenCount = written.match(INVISIBLE)?.length || 0;
  const readCount = read.match(INVISIBLE)?.length || 0;
  return `${readCount}/${writtenCount} invisible chars kept`;
}

function pause() {
  return new Promise((resolve) => {
    setTimeout(resolve, PAUSE_MS);
  });
}
