import type {
  ApiDocument, ApiPageBlock, ApiPageCaption, ApiPhoto, ApiRichText, ApiVideo,
} from '../../../api/types';
import type { BarruuBlock, BarruuInline } from './barruu';

import { parseBarruu, parseBarruuInline } from './barruu';

// A Barruu is published as a Telegram rich message, so every Telegram app shows it as an article, with the
// `.nilak` package attached at the end for Nilak's interactive quizzes and offline reading

export type BarruuRichMedia = Record<string, ApiPhoto | ApiVideo | undefined>;

export type BarruuRichTexts = {
  quiz: string;
  showAnswer: string;
  footer: string;
};

// Telegram's limits for one rich message
const MAX_BLOCKS = 500;
const MAX_TEXT_LENGTH = 32768;
const MAX_MEDIA = 50;

const CALLOUT_ICONS: Record<string, string> = {
  NOTE: 'ℹ️',
  TIP: '💡',
  WARNING: '⚠️',
  IMPORTANT: '❗',
};

const EMPTY_CAPTION: ApiPageCaption = { text: { type: 'empty' }, credit: { type: 'empty' } };

export function buildBarruuRichBlocks({
  title, subtitle, body, media, gifs, packageDocument, texts,
}: {
  title: string;
  subtitle?: string;
  body: string;
  // Uploaded photos and videos by their path in the package (`media/…`)
  media: BarruuRichMedia;
  // GIFs kept in the Barruu as `tgdoc:` references
  gifs: Record<string, ApiVideo | undefined>;
  packageDocument?: ApiDocument;
  texts: BarruuRichTexts;
}): ApiPageBlock[] {
  const blocks: ApiPageBlock[] = [{ type: 'heading1', text: plain(title) }];
  if (subtitle) blocks.push({ type: 'paragraph', text: { type: 'italic', text: plain(subtitle) } });

  parseBarruu(body).forEach((block) => {
    const richBlock = buildBlock(block, media, gifs, texts);
    if (richBlock) blocks.push(...richBlock);
  });

  if (packageDocument) blocks.push({ type: 'document', document: packageDocument, caption: EMPTY_CAPTION });
  blocks.push({ type: 'paragraph', text: { type: 'italic', text: plain(texts.footer) } });

  return blocks;
}

// Too long or too many pictures for one rich message: the Barruu is then published as its package only
export function getAreRichBlocksWithinLimits(blocks: ApiPageBlock[]) {
  const json = JSON.stringify(blocks);
  const mediaCount = (json.match(/"type":"(photo|video|document)"/g) || []).length;
  const textLength = (json.match(/"text":"((?:[^"\\]|\\.)*)"/g) || []).reduce((sum, part) => sum + part.length, 0);
  return blocks.length <= MAX_BLOCKS && mediaCount <= MAX_MEDIA && textLength <= MAX_TEXT_LENGTH;
}

function buildBlock(
  block: BarruuBlock, media: BarruuRichMedia, gifs: Record<string, ApiVideo | undefined>, texts: BarruuRichTexts,
): ApiPageBlock[] | undefined {
  switch (block.type) {
    case 'heading':
      return [{ type: block.level <= 2 ? 'heading2' : 'heading3', text: inline(block.text) }];
    case 'paragraph':
      return [{ type: 'paragraph', text: inline(block.text) }];
    case 'quote':
      return [{ type: 'blockquote', text: inline(block.text), caption: { type: 'empty' } }];
    case 'callout':
      return [{
        type: 'blockquote',
        text: concat([plain(`${CALLOUT_ICONS[block.kind] || CALLOUT_ICONS.NOTE} `), inline(block.text)]),
        caption: { type: 'empty' },
      }];
    case 'bullets':
      return [{ type: 'list', items: block.items.map((item) => ({ type: 'text', text: inline(item) })) }];
    case 'numbers':
      return [{ type: 'orderedList', items: block.items.map((item) => ({ type: 'text', text: inline(item) })) }];
    case 'divider':
      return [{ type: 'divider' }];
    case 'code':
      return [{ type: 'preformatted', text: plain(block.text), language: '' }];
    case 'image':
    case 'video':
      return buildMediaBlock(block.path, block.caption, media, gifs);
    case 'link':
      return [{ type: 'paragraph', text: { type: 'url', text: plain(block.url), url: block.url } }];
    case 'table':
      return [{
        type: 'table',
        title: { type: 'empty' },
        isBordered: true,
        rows: block.rows.map((row, rowIndex) => ({
          cells: row.map((cell) => ({ text: inline(cell), isHeader: rowIndex === 0 ? true : undefined })),
        })),
      }];
    case 'quiz': {
      // Readers on any Telegram app answer in their head, then open the answer
      const right = block.options[block.answer];
      const answerBlocks: ApiPageBlock[] = right
        ? [{ type: 'paragraph', text: { type: 'bold', text: plain(`✅ ${right}`) } }]
        : [];
      if (block.explanation) answerBlocks.push({ type: 'paragraph', text: inline(block.explanation) });
      return [
        {
          type: 'paragraph',
          text: concat([{ type: 'bold', text: plain(`${texts.quiz}: `) }, inline(block.question)]),
        },
        {
          type: 'orderedList',
          items: block.options.map((option) => ({ type: 'text', text: inline(option) })),
        },
        ...(answerBlocks.length ? [{
          type: 'details' as const, title: plain(texts.showAnswer), blocks: answerBlocks,
        }] : []),
      ];
    }
  }

  return undefined;
}

function buildMediaBlock(
  path: string, caption: string, media: BarruuRichMedia, gifs: Record<string, ApiVideo | undefined>,
): ApiPageBlock[] | undefined {
  const pageCaption: ApiPageCaption = {
    text: caption ? inline(caption) : { type: 'empty' },
    credit: { type: 'empty' },
  };
  const gif = gifs[path];
  if (gif) return [{ type: 'video', video: gif, caption: pageCaption, isAutoplay: true, isLoop: true }];

  const uploaded = media[path];
  if (!uploaded) return undefined;

  return uploaded.mediaType === 'photo'
    ? [{ type: 'photo', photo: uploaded, caption: pageCaption }]
    : [{ type: 'video', video: uploaded, caption: pageCaption }];
}

function inline(text: string): ApiRichText {
  return concat(parseBarruuInline(text).map(buildRichText));
}

function buildRichText(part: BarruuInline): ApiRichText {
  if (typeof part === 'string') return plain(part);

  switch (part.type) {
    case 'code': return { type: 'fixed', text: plain(part.text) };
    case 'bold': return { type: 'bold', text: concat(part.children.map(buildRichText)) };
    case 'italic': return { type: 'italic', text: concat(part.children.map(buildRichText)) };
    case 'strike': return { type: 'strike', text: concat(part.children.map(buildRichText)) };
    case 'highlight': return { type: 'marked', text: concat(part.children.map(buildRichText)) };
    case 'link': return { type: 'url', text: concat(part.children.map(buildRichText)), url: part.url };
    case 'customEmoji': return { type: 'customEmoji', documentId: part.documentId, alt: part.alt };
  }

  return { type: 'empty' };
}

function plain(text: string): ApiRichText {
  return text ? { type: 'plain', text } : { type: 'empty' };
}

function concat(texts: ApiRichText[]): ApiRichText {
  const parts = texts.filter((text) => text.type !== 'empty');
  if (!parts.length) return { type: 'empty' };
  return parts.length === 1 ? parts[0] : { type: 'concat', texts: parts };
}
