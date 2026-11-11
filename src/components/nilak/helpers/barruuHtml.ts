import type { BarruuInline } from './barruu';

import { parseBarruu, parseBarruuInline } from './barruu';

// The Barruu writer edits HTML directly (what you see is what readers get) and stores Nilak Markdown, the format
// Nilak for Android reads and writes. These helpers convert between the two and clean pasted content.

const QUIZ_PLACEHOLDER = {
  question: 'Question?',
  right: 'Right answer',
  other: 'Other answer',
  explanation: 'Why it is right',
};

export function markdownToEditorHtml(markdown: string, mediaUrls: Record<string, string>) {
  return parseBarruu(markdown).map((block) => {
    switch (block.type) {
      case 'heading':
        return block.level <= 2 ? `<h2>${inlineToHtml(block.text)}</h2>` : `<h3>${inlineToHtml(block.text)}</h3>`;
      case 'paragraph':
        return `<p>${inlineToHtml(block.text).replace(/\n/g, '<br>')}</p>`;
      case 'quote':
        return `<blockquote>${inlineToHtml(block.text).replace(/\n/g, '<br>')}</blockquote>`;
      case 'callout':
        return `<blockquote data-callout="${block.kind}">${inlineToHtml(block.text).replace(/\n/g, '<br>')}`
          + '</blockquote>';
      case 'bullets':
      case 'numbers': {
        const tag = block.type === 'bullets' ? 'ul' : 'ol';
        return `<${tag}>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join('')}</${tag}>`;
      }
      case 'divider':
        return '<hr>';
      case 'code':
        return `<pre>${escapeHtml(block.text)}</pre>`;
      case 'image':
      case 'video': {
        // Media the writer no longer holds (after a reload) cannot be shown or published, so it is left out
        const url = mediaUrls[block.path];
        return url ? buildFigureHtml(block.path, url, block.caption, block.type === 'video') : '';
      }
      case 'link':
        return `<p><a href="${escapeAttribute(block.url)}">${escapeHtml(block.url)}</a></p>`;
      case 'table':
        return buildTableHtml(block.rows.map((row) => row.map(inlineToHtml)));
      case 'quiz':
        return buildQuizHtml(block.question, block.options, block.answer, block.explanation);
    }

    return '';
  }).join('') || '<p><br></p>';
}

export function buildFigureHtml(
  path: string, url: string, caption = '', isVideo?: boolean, captionPlaceholder = '',
) {
  const media = isVideo
    ? `<video src="${escapeAttribute(url)}" data-path="${escapeAttribute(path)}" controls></video>`
    : `<img src="${escapeAttribute(url)}" data-path="${escapeAttribute(path)}" alt="">`;
  return `<figure>${media}<figcaption data-placeholder="${escapeAttribute(captionPlaceholder)}">${escapeHtml(caption)}`
    + '</figcaption></figure><p><br></p>';
}

export function buildTableHtml(rows: string[][] = [['Column', 'Column'], ['Cell', 'Cell']]) {
  const html = rows.map((row, index) => (
    `<tr>${row.map((cell) => (index === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`)).join('')}</tr>`
  ));
  return `<table><tbody>${html.join('')}</tbody></table><p><br></p>`;
}

export function buildQuizHtml(
  question = QUIZ_PLACEHOLDER.question,
  options = [QUIZ_PLACEHOLDER.right, QUIZ_PLACEHOLDER.other],
  answer = 0,
  explanation = QUIZ_PLACEHOLDER.explanation,
) {
  const items = options.map((option, index) => (
    `<li${index === answer ? ' data-correct="true"' : ''}>${escapeHtml(option)}</li>`
  )).join('');
  return `<div data-block="quiz"><p data-role="question">${escapeHtml(question)}</p><ul>${items}</ul>`
    + `<p data-role="explanation">${escapeHtml(explanation)}</p></div><p><br></p>`;
}

function inlineToHtml(text: string) {
  return renderInline(parseBarruuInline(text));
}

function renderInline(parts: BarruuInline[]): string {
  return parts.map((part) => {
    if (typeof part === 'string') return escapeHtml(part);

    switch (part.type) {
      case 'code': return `<code>${escapeHtml(part.text)}</code>`;
      case 'bold': return `<strong>${renderInline(part.children)}</strong>`;
      case 'italic': return `<em>${renderInline(part.children)}</em>`;
      case 'strike': return `<s>${renderInline(part.children)}</s>`;
      case 'highlight': return `<mark>${renderInline(part.children)}</mark>`;
      case 'link': return `<a href="${escapeAttribute(part.url)}">${renderInline(part.children)}</a>`;
      case 'customEmoji': return escapeHtml(part.alt);
    }

    return '';
  }).join('');
}

export function editorToMarkdown(root: HTMLElement) {
  const blocks: string[] = [];
  Array.from(root.childNodes).forEach((node) => appendBlock(node, blocks));

  return blocks.filter((block) => block.trim()).join('\n\n').trim();
}

function appendBlock(node: Node, blocks: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = escapeLineStart(escapeInline(node.textContent || '').trim());
    if (text) blocks.push(text);
    return;
  }
  if (!(node instanceof HTMLElement)) return;

  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'h1':
    case 'h2':
      blocks.push(`## ${inlineFromNode(node).trim()}`);
      return;
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      blocks.push(`### ${inlineFromNode(node).trim()}`);
      return;
    case 'blockquote': {
      const lines = inlineFromNode(node).trim().split('\n');
      const callout = node.dataset.callout;
      blocks.push(lines.map((line, index) => (
        index === 0 && callout ? `> [!${callout}] ${line}` : `> ${line}`
      )).join('\n'));
      return;
    }
    case 'ul':
    case 'ol':
      blocks.push(Array.from(node.children).map((item, index) => (
        `${tag === 'ul' ? '-' : `${index + 1}.`} ${inlineFromNode(item).trim().replace(/\n/g, ' ')}`
      )).join('\n'));
      return;
    case 'hr':
      blocks.push('---');
      return;
    case 'pre':
      blocks.push(`\`\`\`\n${node.textContent || ''}\n\`\`\``);
      return;
    case 'figure': {
      const media = node.querySelector<HTMLElement>('[data-path]');
      if (!media) return;
      const caption = node.querySelector('figcaption')?.textContent?.trim() || '';
      blocks.push(`![${caption.replace(/[[\]]/g, '')}](${media.dataset.path})`);
      return;
    }
    case 'table': {
      const rows = Array.from(node.querySelectorAll('tr')).map((row) => (
        Array.from(row.children).map((cell) => inlineFromNode(cell).trim().replace(/\|/g, '/').replace(/\n/g, ' '))
      ));
      if (!rows.length) return;
      const lines = rows.map((cells) => `| ${cells.join(' | ')} |`);
      lines.splice(1, 0, `|${rows[0].map(() => '---').join('|')}|`);
      blocks.push(lines.join('\n'));
      return;
    }
    case 'div':
      if (node.dataset.block === 'quiz') {
        blocks.push(quizFromNode(node));
        return;
      }
      // A plain container (pasted or created by the browser): its children are blocks of their own
      if (Array.from(node.children).some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()))) {
        Array.from(node.childNodes).forEach((child) => appendBlock(child, blocks));
        return;
      }
      break;
    default:
      break;
  }

  const text = inlineFromNode(node).trim();
  if (text) blocks.push(escapeLineStart(text));
}

function quizFromNode(node: HTMLElement) {
  const question = node.querySelector('[data-role="question"]')?.textContent?.trim() || QUIZ_PLACEHOLDER.question;
  const options = Array.from(node.querySelectorAll('li')).map((item) => (
    `${item.dataset.correct ? '+' : '-'} ${(item.textContent || '').trim()}`
  ));
  const explanation = node.querySelector('[data-role="explanation"]')?.textContent?.trim();

  return ['```quiz', question, ...options, explanation ? `> ${explanation}` : '', '```'].filter(Boolean).join('\n');
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre', 'hr', 'table', 'figure',
]);

function inlineFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeInline(node.textContent || '');
  if (!(node instanceof HTMLElement)) return '';

  const inner = Array.from(node.childNodes).map(inlineFromNode).join('');
  const tag = node.tagName.toLowerCase();
  const wrap = (mark: string) => (inner.trim() ? `${mark}${inner}${mark}` : inner);

  switch (tag) {
    case 'br': return '\n';
    case 'strong':
    case 'b': return wrap('**');
    case 'em':
    case 'i': return wrap('*');
    case 's':
    case 'strike':
    case 'del': return wrap('~~');
    case 'mark': return wrap('==');
    case 'code': return node.textContent ? `\`${node.textContent}\`` : '';
    case 'a': {
      const href = node.getAttribute('href') || '';
      return /^https?:\/\//.test(href) && inner.trim() ? `[${inner}](${href})` : inner;
    }
    default:
      return BLOCK_TAGS.has(tag) ? `${inner}\n` : inner;
  }
}

// Characters that mean formatting in Nilak Markdown are escaped, so the text reads back exactly as written
function escapeInline(text: string) {
  return text.replace(/([\\*_~=`[\]])/g, '\\$1');
}

function escapeLineStart(text: string) {
  return text.replace(/^(#|>|-|\d+[.)])/, '\\$1');
}

const PASTE_TAGS: Record<string, string> = {
  h1: 'h2',
  h2: 'h2',
  h3: 'h3',
  h4: 'h3',
  h5: 'h3',
  h6: 'h3',
  p: 'p',
  div: 'p',
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  s: 's',
  strike: 's',
  del: 's',
  mark: 'mark',
  code: 'code',
  pre: 'pre',
  a: 'a',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  blockquote: 'blockquote',
  br: 'br',
  hr: 'hr',
  table: 'table',
  tbody: 'tbody',
  thead: 'tbody',
  tr: 'tr',
  td: 'td',
  th: 'th',
};

const PASTE_SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'template', 'title', 'head', 'iframe', 'object']);

// Pasted pages keep their structure (headings, lists, bold, links, tables) but none of their styles or scripts
export function sanitizePastedHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(parsed.body.childNodes).map(cleanNode).join('');
}

function cleanNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '');
  if (!(node instanceof HTMLElement)) return '';

  if (PASTE_SKIPPED_TAGS.has(node.tagName.toLowerCase())) return '';

  const tag = PASTE_TAGS[node.tagName.toLowerCase()];
  const inner = Array.from(node.childNodes).map(cleanNode).join('');
  if (!tag) return inner;
  if (tag === 'br' || tag === 'hr') return `<${tag}>`;
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    return /^https?:\/\//.test(href) ? `<a href="${escapeAttribute(href)}">${inner}</a>` : inner;
  }

  return `<${tag}>${inner}</${tag}>`;
}

// Plain text that looks like Markdown (headings, lists, quotes, tables, fences) is pasted as formatted content
export function getIsMarkdownLike(text: string) {
  return /^(#{1,3}\s|[-*•]\s|\d+[.)]\s|>\s|\||```)/m.test(text) || /\*\*[^*]+\*\*/.test(text);
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttribute(text: string) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
