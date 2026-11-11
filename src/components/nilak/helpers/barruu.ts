import {
  strFromU8, strToU8, unzipSync, zipSync,
} from 'fflate';

import type { ApiFormattedText, ApiMessage } from '../../../api/types';

import { getRichMessagePreviewText, getRichTextPlainText } from '../../../global/helpers/richMessage';

// A Barruu is the Nilak article format shared with Nilak for Android (`TigiArticle.java`): a zip named
// `<slug>.nilak` holding `manifest.json`, `article.md` in Nilak Markdown and a `media/` folder. The caption carries
// the title, the subtitle and a "📖 N min read" line, so lists show them before the file is downloaded.
const BARRUU_EXT = '.nilak';
const BARRUU_MIME = 'application/vnd.nilak.article+zip';
const BARRUU_BODY = 'article.md';
const BARRUU_MANIFEST = 'manifest.json';
const BARRUU_FORMAT = 'nilak-article';
const BARRUU_VERSION = 1;
const MAX_SLUG_LENGTH = 60;
const MINUTES_MARK = '📖';
const READ_TAG = '#NilakRead';
// Long text posts are listed in Read too, like in Nilak for Android
const LONG_POST_LENGTH = 900;
const WORDS_PER_MINUTE = 200;
// A first line up to this length reads as the title of a long post
const MAX_TITLE_LENGTH = 200;
// Titles in lists stay short; the first sentence is kept when it is not too short
const MAX_LIST_TITLE_LENGTH = 110;
const MIN_SENTENCE_TITLE_LENGTH = 30;
const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  '3gp': 'video/3gpp',
};

type BarruuTextBlock = { type: 'paragraph' | 'quote' | 'code'; text: string };

export type BarruuBlock =
  | { type: 'heading'; level: number; text: string }
  | BarruuTextBlock
  | { type: 'callout'; kind: string; text: string }
  | { type: 'bullets' | 'numbers'; items: string[] }
  | { type: 'divider' }
  | { type: 'image' | 'video'; path: string; caption: string }
  | { type: 'link'; url: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'quiz'; question: string; options: string[]; answer: number; explanation?: string };

export type BarruuPackage = {
  body: string;
  mediaUrls: Record<string, string>;
};

export function getIsBarruu(message: ApiMessage) {
  const document = message.content.document;
  if (!document) return false;

  return document.mimeType === BARRUU_MIME || document.fileName.toLowerCase().endsWith(BARRUU_EXT);
}

export function getIsReadPost(message: ApiMessage) {
  // Barruu and Telegram's own articles are always reads
  if (getIsBarruu(message) || message.content.richMessage) return true;
  // Long posts count with or without a photo or video, like in Nilak for Android; other files do not
  const { document, video } = message.content;
  if (document || video?.isRound) return false;

  const text = message.content.text?.text || '';
  return text.length >= LONG_POST_LENGTH || text.includes('telegra.ph/') || text.includes(READ_TAG);
}

const TELEGRAPH_URL = /https?:\/\/telegra\.ph\/[^\s)]+/;

// A short post that only points to a telegra.ph article: the article itself opens in Telegram's Instant View
export function getTelegraphArticleUrl(message: ApiMessage) {
  const text = message.content.text;
  if (!text || getIsBarruu(message) || text.text.length >= LONG_POST_LENGTH) return undefined;

  const linkUrl = text.entities?.map((entity) => ('url' in entity ? entity.url : undefined))
    .find((url) => url && TELEGRAPH_URL.test(url));

  return linkUrl || text.text.match(TELEGRAPH_URL)?.[0];
}

export function getBarruuTitle(message: ApiMessage) {
  const caption = message.content.text?.text.trim();
  const firstLine = caption?.split('\n', 1)[0].trim();
  if (firstLine) return firstLine;

  const fileName = message.content.document?.fileName || '';
  const base = fileName.toLowerCase().endsWith(BARRUU_EXT) ? fileName.slice(0, -BARRUU_EXT.length) : fileName;
  return base.replace(/[-_]/g, ' ');
}

const EXCERPT_LENGTH = 220;

// What lists show of a Barruu or long post: a short title, the next lines and the reading time
export function getReadPreview(message: ApiMessage) {
  const isBarruu = getIsBarruu(message);
  const title = getReadTitle(message);
  const { richMessage } = message.content;
  const text = (richMessage ? getRichMessagePreviewText(richMessage) : message.content.text?.text || '').trim();
  const excerpt = isBarruu
    ? getBarruuSubtitle(message)
    : text.slice(title.replace(/…$/, '').length, title.length + EXCERPT_LENGTH).trim();

  return {
    isBarruu, isArticle: Boolean(richMessage), title, excerpt, minutes: getReadMinutes(message),
  };
}

// The title shown in lists: a Barruu's title, else the first line of a long post
export function getReadTitle(message: ApiMessage) {
  if (getIsBarruu(message)) return getBarruuTitle(message);

  const { richMessage } = message.content;
  if (richMessage) {
    const titleBlock = richMessage.blocks.find((block) => block.type === 'title' || block.type === 'header');
    const title = titleBlock && 'text' in titleBlock ? getRichTextPlainText(titleBlock.text) : '';
    return shortenTitle((title || getRichMessagePreviewText(richMessage, MAX_LIST_TITLE_LENGTH)).trim());
  }

  return shortenTitle((message.content.text?.text || '').trim().split('\n', 1)[0]);
}

// A first line that is a whole paragraph is cut at its first sentence, or at a word
function shortenTitle(line: string) {
  if (line.length <= MAX_LIST_TITLE_LENGTH) return line;

  const sentenceEnd = line.slice(0, MAX_LIST_TITLE_LENGTH).search(/[.!?:](\s|$)(?![\s\S]*[.!?:](\s|$))/);
  if (sentenceEnd >= MIN_SENTENCE_TITLE_LENGTH) return line.slice(0, sentenceEnd + 1);

  const wordEnd = line.lastIndexOf(' ', MAX_LIST_TITLE_LENGTH);
  return `${line.slice(0, wordEnd > 0 ? wordEnd : MAX_LIST_TITLE_LENGTH)}…`;
}

export function getBarruuSubtitle(message: ApiMessage) {
  const caption = message.content.text?.text.trim() || '';
  const newLineIndex = caption.indexOf('\n');
  if (newLineIndex < 0) return '';

  return caption.slice(newLineIndex + 1)
    .split('\n')
    .filter((line) => !line.trim().startsWith(MINUTES_MARK))
    .join('\n')
    .replace(READ_TAG, '')
    .trim();
}

export function getReadMinutes(message: ApiMessage) {
  const { richMessage } = message.content;
  const text = richMessage ? getRichMessagePreviewText(richMessage) : message.content.text?.text || '';
  if (getIsBarruu(message)) {
    const markIndex = text.lastIndexOf(MINUTES_MARK);
    const match = markIndex >= 0 ? text.slice(markIndex).match(/\d+/) : undefined;
    return match ? Number(match[0]) : 0;
  }

  return Math.max(1, Math.round(text.split(/\s+/).length / WORDS_PER_MINUTE));
}

// A long post's first line becomes its title in the reader; entities move with the rest of the text
export function splitLongPost(text: ApiFormattedText): { title?: string; body: ApiFormattedText } {
  const newLineIndex = text.text.indexOf('\n');
  const title = newLineIndex > 0 ? text.text.slice(0, newLineIndex).trim() : '';
  if (!title || title.length > MAX_TITLE_LENGTH) return { body: text };

  const rest = text.text.slice(newLineIndex + 1);
  const body = rest.trimStart();
  const cut = text.text.length - body.length;

  return {
    title,
    body: {
      text: body,
      entities: text.entities
        ?.filter((entity) => entity.offset >= cut)
        .map((entity) => ({ ...entity, offset: entity.offset - cut })),
    },
  };
}

export function readBarruuPackage(data: ArrayBuffer): BarruuPackage {
  const files = unzipSync(new Uint8Array(data));
  const body = files[BARRUU_BODY] ? strFromU8(files[BARRUU_BODY]) : '';
  const mediaUrls: Record<string, string> = {};

  Object.entries(files).forEach(([path, bytes]) => {
    const extension = path.split('.').pop()?.toLowerCase() || '';
    const type = MEDIA_TYPES[extension];
    if (!type) return;

    mediaUrls[path] = URL.createObjectURL(new Blob([bytes], { type }));
  });

  return { body, mediaUrls };
}

export type BarruuDraft = {
  title: string;
  subtitle: string;
  author: string;
  body: string;
  // Media added in the writer, by its path in the package (`media/…`)
  media: Record<string, File>;
};

// Packs a Barruu the way Nilak for Android does, so both apps open what the other writes
export async function buildBarruuFile(draft: BarruuDraft): Promise<File> {
  const words = countWords(draft.body);
  const manifest = {
    format: BARRUU_FORMAT,
    version: BARRUU_VERSION,
    title: draft.title,
    subtitle: draft.subtitle,
    author: draft.author,
    lang: navigator.language,
    words,
    minutes: getMinutesForWords(words),
    created: Date.now(),
  };

  const files: Record<string, Uint8Array> = {
    [BARRUU_MANIFEST]: strToU8(JSON.stringify(manifest)),
    [BARRUU_BODY]: strToU8(draft.body),
  };
  const usedMedia = Object.entries(draft.media).filter(([path]) => draft.body.includes(path));
  const mediaBytes = await Promise.all(usedMedia.map(([, file]) => file.arrayBuffer()));
  usedMedia.forEach(([path], index) => {
    files[path] = new Uint8Array(mediaBytes[index]);
  });

  const zip = zipSync(files);
  return new File([zip], `${buildSlug(draft.title)}${BARRUU_EXT}`, { type: BARRUU_MIME });
}

// The caption carries the title, the subtitle and the reading time, so lists show them before the download
export function buildBarruuCaption(draft: BarruuDraft) {
  const minutes = getMinutesForWords(countWords(draft.body));
  return [draft.title, draft.subtitle, `${MINUTES_MARK} ${minutes} min read`].filter(Boolean).join('\n');
}

function countWords(markdown: string) {
  return markdown.split(/\s+/).filter(Boolean).length;
}

function getMinutesForWords(words: number) {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function buildSlug(title: string) {
  const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, MAX_SLUG_LENGTH);
  return slug || 'barruu';
}

export function getIsVideoPath(path: string) {
  return /\.(mp4|webm|mov|3gp|m4v)$/i.test(path);
}

const HEADING = /^(#{1,3})\s+(.+)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.+)$/;
const MEDIA = /^!\[([^\]]*)]\(\s*([^)\s]+)\s*\)$/;
const TABLE_RULE = /^[\s|:-]*-{3,}[\s|:-]*$/;
const BARE_URL = /^https?:\/\/\S+$/;
const CALLOUT = /^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT)]\s*(.*)$/i;
const BULLET_PREFIXES = ['- ', '* ', '• '];

// A line-by-line port of `TigiArticle.parse`: anything unknown is plain text, so an article always opens
export function parseBarruu(markdown: string): BarruuBlock[] {
  const blocks: BarruuBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] | undefined;
  let list: Extract<BarruuBlock, { items: string[] }> | undefined;
  let quote: BarruuTextBlock | undefined;

  function flushParagraph() {
    if (paragraph?.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = undefined;
  }

  function resetGroups() {
    flushParagraph();
    list = undefined;
    quote = undefined;
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('```quiz')) {
      resetGroups();
      const quiz: Extract<BarruuBlock, { type: 'quiz' }> = { type: 'quiz', question: '', options: [], answer: -1 };
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        const row = lines[i].trim();
        if (row && !quiz.question) {
          quiz.question = row;
        } else if (row.startsWith('+ ')) {
          quiz.answer = quiz.options.length;
          quiz.options.push(row.slice(2).trim());
        } else if (row.startsWith('- ')) {
          quiz.options.push(row.slice(2).trim());
        } else if (row.startsWith('> ')) {
          quiz.explanation = row.slice(2).trim();
        }
        i++;
      }
      if (quiz.question && quiz.options.length >= 2) blocks.push(quiz);
      i++;
      continue;
    }

    if (line.startsWith('```')) {
      resetGroups();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      i++;
      continue;
    }

    if (!line) {
      resetGroups();
      i++;
      continue;
    }

    if (line.startsWith('|') && line.length > 1) {
      resetGroups();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        let row = lines[i].trim().slice(1);
        if (row.endsWith('|')) row = row.slice(0, -1);
        if (!TABLE_RULE.test(row)) rows.push(row.split('|').map((cell) => cell.trim()));
        i++;
      }
      if (rows.length) blocks.push({ type: 'table', rows });
      continue;
    }

    const heading = line.match(HEADING);
    const callout = line.match(CALLOUT);
    const numbered = line.match(NUMBERED);
    const media = line.match(MEDIA);

    if (line === '---' || line === '***' || line === '___') {
      resetGroups();
      blocks.push({ type: 'divider' });
    } else if (heading) {
      resetGroups();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
    } else if (callout) {
      resetGroups();
      const text = [callout[2]].filter(Boolean);
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
        i++;
        text.push(lines[i].trim().slice(1).trim());
      }
      blocks.push({ type: 'callout', kind: callout[1].toUpperCase(), text: text.join('\n') });
    } else if (line.startsWith('>')) {
      flushParagraph();
      list = undefined;
      const text = line.slice(1).trim();
      if (quote) {
        quote.text += `\n${text}`;
      } else {
        quote = { type: 'quote', text };
        blocks.push(quote);
      }
    } else if (BULLET_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      flushParagraph();
      quote = undefined;
      if (list?.type !== 'bullets') {
        list = { type: 'bullets', items: [] };
        blocks.push(list);
      }
      list.items.push(line.slice(2).trim());
    } else if (numbered) {
      flushParagraph();
      quote = undefined;
      if (list?.type !== 'numbers') {
        list = { type: 'numbers', items: [] };
        blocks.push(list);
      }
      list.items.push(numbered[1]);
    } else if (media) {
      resetGroups();
      blocks.push({ type: getIsVideoPath(media[2]) ? 'video' : 'image', path: media[2], caption: media[1].trim() });
    } else if (BARE_URL.test(line) && !paragraph) {
      list = undefined;
      quote = undefined;
      blocks.push({ type: 'link', url: line });
    } else {
      list = undefined;
      quote = undefined;
      paragraph = paragraph || [];
      paragraph.push(line);
    }
    i++;
  }
  flushParagraph();

  return blocks;
}

export type BarruuInline =
  | string
  | { type: 'code'; text: string }
  | { type: 'bold' | 'strike' | 'highlight' | 'italic'; children: BarruuInline[] }
  | { type: 'link'; url: string; children: BarruuInline[]; isMention?: boolean }
  | { type: 'customEmoji'; alt: string; documentId: string };

// The inline syntax of `TigiArticle.inline`. Italics need no word character before them, which is checked in code
// instead of a lookbehind, for older Safari.
const INLINE = new RegExp([
  '`([^`]+)`',
  '\\*\\*(.+?)\\*\\*',
  '~~(.+?)~~',
  '==(.+?)==',
  '\\[([^\\]]+)]\\(emoji:(\\d{1,20})\\)',
  '\\[([^\\]]+)]\\((https?://[^)\\s]+)\\)',
  '\\*(?!\\s)(.*?\\S)\\*(?!\\*)',
  '_(?!\\s)(.*?\\S)_(?!\\w)',
  '(https?://[^\\s<>()]+[^\\s<>().,;:!?\'"])',
  '\\\\([\\\\*_~=`\\[\\]#>!.\\-0-9])',
].join('|'), 'g');
const WORD_CHAR = /\w/;

export function parseBarruuInline(text: string): BarruuInline[] {
  // Matches are collected first because the nested calls reuse the shared regular expression
  const matches: RegExpExecArray[] = [];
  const regex = new RegExp(INLINE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const previous = text[match.index - 1];
    const isStarItalic = match[9] !== undefined;
    const isUnderscoreItalic = match[10] !== undefined;
    if (previous && ((isStarItalic && (WORD_CHAR.test(previous) || previous === '*'))
      || (isUnderscoreItalic && WORD_CHAR.test(previous)))) {
      regex.lastIndex = match.index + 1;
      continue;
    }
    matches.push(match);
  }

  const result: BarruuInline[] = [];
  let last = 0;
  matches.forEach((m) => {
    if (m.index > last) result.push(text.slice(last, m.index));

    const [
      , code, bold, strike, highlight, emojiAlt, emojiId, linkText, linkUrl, starText, underscoreText, bareUrl, escaped,
    ] = m;
    const italic = starText ?? underscoreText;
    if (code !== undefined) {
      result.push({ type: 'code', text: code });
    } else if (bold !== undefined) {
      result.push({ type: 'bold', children: parseBarruuInline(bold) });
    } else if (strike !== undefined) {
      result.push({ type: 'strike', children: parseBarruuInline(strike) });
    } else if (highlight !== undefined) {
      result.push({ type: 'highlight', children: parseBarruuInline(highlight) });
    } else if (emojiAlt !== undefined) {
      result.push({ type: 'customEmoji', alt: emojiAlt, documentId: emojiId });
    } else if (linkText !== undefined) {
      result.push({
        type: 'link',
        url: linkUrl,
        children: parseBarruuInline(linkText),
        isMention: linkText.startsWith('@') && linkUrl.startsWith('https://t.me/'),
      });
    } else if (italic !== undefined) {
      result.push({ type: 'italic', children: parseBarruuInline(italic) });
    } else if (bareUrl !== undefined) {
      result.push({ type: 'link', url: bareUrl, children: [bareUrl] });
    } else if (escaped !== undefined) {
      result.push(escaped);
    }
    last = m.index + m[0].length;
  });

  if (last < text.length) result.push(text.slice(last));

  return result;
}
