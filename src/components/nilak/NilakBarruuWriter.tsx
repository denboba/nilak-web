import {
  memo, useEffect, useRef, useState,
} from '../../lib/teact/teact';
import { getActions, getGlobal } from '../../global';

import type { ApiChat, ApiPeer, ApiSticker, ApiVideo } from '../../api/types';
import type { IconName } from '../../types/icons';
import { MAIN_THREAD_ID } from '../../api/types';

import { getMainUsername, getUserFullName } from '../../global/helpers';
import { getPeerTitle } from '../../global/helpers/peers';
import { selectUser } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildAttachment from '../middle/composer/helpers/buildAttachment';
import { buildBarruuCaption, buildBarruuFile } from './helpers/barruu';
import {
  buildCustomEmojiHtml, buildEmbedHtml, buildFigureHtml, buildQuizHtml, buildTableHtml, editorToMarkdown,
  escapeAttribute, getIsMarkdownLike, markdownToEditorHtml, sanitizePastedHtml,
} from './helpers/barruuHtml';
import {
  decodeNilakDocument, encodeNilakDocument, fetchCustomEmojiUrl, fetchNilakDocumentUrl,
} from './helpers/nilakDocuments';
import useMentionPeers from './helpers/useMentionPeers';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';
import Portal from '../ui/Portal';
import NilakWriterSymbols from './NilakWriterSymbols';

import styles from './NilakCreate.module.scss';
import readerStyles from './NilakReader.module.scss';

type OwnProps = {
  channel: ApiChat;
  onClose: NoneToVoidFunction;
  onPublished: NoneToVoidFunction;
};

type ToolLangKey = 'NilakWriterHeading' | 'NilakWriterSubheading' | 'NilakWriterBold' | 'NilakWriterItalic'
  | 'NilakWriterStrike' | 'NilakWriterHighlight' | 'NilakWriterLink' | 'NilakWriterQuote' | 'NilakWriterList'
  | 'NilakWriterNumbered' | 'NilakWriterTip' | 'NilakWriterPhoto' | 'NilakWriterTable' | 'NilakWriterQuiz'
  | 'NilakWriterDivider' | 'NilakWriterCode' | 'NilakWriterEmoji' | 'NilakWriterMention' | 'NilakWriterEmbed';

type Tool = { id: string; icon: IconName; labelKey: ToolLangKey; command?: string; block?: string };

// Tools come in groups (text, blocks, inserts); `command` tools show whether the selection already has them
const TOOL_GROUPS: Tool[][] = [
  [
    { id: 'h2', icon: 'heading-1', labelKey: 'NilakWriterHeading', block: 'h2' },
    { id: 'h3', icon: 'heading-2', labelKey: 'NilakWriterSubheading', block: 'h3' },
  ],
  [
    { id: 'bold', icon: 'bold', labelKey: 'NilakWriterBold', command: 'bold' },
    { id: 'italic', icon: 'italic', labelKey: 'NilakWriterItalic', command: 'italic' },
    { id: 'strike', icon: 'strikethrough', labelKey: 'NilakWriterStrike', command: 'strikeThrough' },
    { id: 'mark', icon: 'brush', labelKey: 'NilakWriterHighlight' },
    { id: 'link', icon: 'link', labelKey: 'NilakWriterLink' },
  ],
  [
    { id: 'quote', icon: 'quote', labelKey: 'NilakWriterQuote', block: 'blockquote' },
    { id: 'bullets', icon: 'list', labelKey: 'NilakWriterList', command: 'insertUnorderedList' },
    { id: 'numbers', icon: 'numbered-list', labelKey: 'NilakWriterNumbered', command: 'insertOrderedList' },
    { id: 'tip', icon: 'lamp', labelKey: 'NilakWriterTip' },
    { id: 'code', icon: 'code', labelKey: 'NilakWriterCode', block: 'pre' },
  ],
  [
    { id: 'emoji', icon: 'smile', labelKey: 'NilakWriterEmoji' },
    { id: 'mention', icon: 'mention', labelKey: 'NilakWriterMention' },
  ],
  [
    { id: 'photo', icon: 'media', labelKey: 'NilakWriterPhoto' },
    { id: 'table', icon: 'table', labelKey: 'NilakWriterTable' },
    { id: 'quiz', icon: 'poll', labelKey: 'NilakWriterQuiz' },
    { id: 'embed', icon: 'link-badge', labelKey: 'NilakWriterEmbed' },
    { id: 'divider', icon: 'stats', labelKey: 'NilakWriterDivider' },
  ],
];
const DRAFT_STORAGE_KEY = 'nilak-barruu-draft';
const IMAGE_ACCEPT = 'image/*,video/*';
// The round mark before a quiz answer; clicking it marks the answer as the right one
const QUIZ_MARK_WIDTH = 32;
// An `@name` right before the caret, as Nilak for Android looks for it
const MENTION_QUERY = /(?:^|\s)@(\w{0,32})$/;
const URL_PATTERN = /^https?:\/\/\S+$/;

// The list opens under the caret, or above it near the bottom of the window
type MentionState = { query: string; position: string };
// Matches the largest height of `.mentions`
const MENTION_LIST_HEIGHT = 272;

type TextDraft = { title: string; subtitle: string; body: string };

const NilakBarruuWriter = ({ channel, onClose, onPublished }: OwnProps) => {
  const { sendMessage, showNotification } = getActions();
  const lang = useLang();
  const editorRef = useRef<HTMLDivElement>();
  const fileInputRef = useRef<HTMLInputElement>();
  const rangeRef = useRef<Range>();
  const mediaRef = useRef<Record<string, File>>({});
  const createdUrlsRef = useRef<string[]>([]);
  const [draft, setDraft] = useState<TextDraft>(readSavedDraft);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSymbolsOpen, setIsSymbolsOpen] = useState(false);
  const [mention, setMention] = useState<MentionState | undefined>();
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionPeers = useMentionPeers(mention?.query);

  // The editor's content belongs to the browser while writing; it is filled once from the saved draft
  useEffect(() => {
    const editor = editorRef.current!;
    // Media files stay in memory only, so a reloaded draft drops the pictures it can no longer show
    editor.innerHTML = markdownToEditorHtml(draft.body, {});
    document.execCommand('defaultParagraphSeparator', false, 'p');
    loadEditorMedia(editor);
    // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
  }, []);

  // The text is kept in this browser while writing, so a reload does not lose it
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (err) {
      // Nothing to do when storage is unavailable
    }
  }, [draft]);

  // The toolbar follows the selection, lighting up the formatting under the caret
  useEffect(() => {
    function handleSelectionChange() {
      const selection = document.getSelection();
      const editor = editorRef.current;
      if (!selection?.rangeCount || !editor?.contains(selection.anchorNode)) return;

      rangeRef.current = selection.getRangeAt(0).cloneRange();
      const block = String(document.queryCommandValue('formatBlock')).toLowerCase();
      const active = TOOL_GROUPS.flat().filter(({ command, block: toolBlock }) => (
        (command && document.queryCommandState(command)) || (toolBlock && toolBlock === block)
      )).map(({ id }) => id);
      setActiveTools((current) => (current.join() === active.join() ? current : active));
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  useEffect(() => () => {
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const canPublish = Boolean(draft.title.trim() && draft.body.trim()) && !isPublishing;

  function syncBody() {
    const body = editorToMarkdown(editorRef.current!);
    setDraft((current) => (current.body === body ? current : { ...current, body }));
  }

  // Stickers, GIFs and animated emoji of a reloaded draft are read from Telegram again
  function loadEditorMedia(editor: HTMLElement) {
    editor.querySelectorAll<HTMLElement>('figure[data-kind="document"]').forEach(async (figure) => {
      const media = figure.querySelector<HTMLImageElement>('[data-path]')!;
      const document = await decodeNilakDocument(media.dataset.path!);
      const url = document && await fetchNilakDocumentUrl(document);
      if (!document || !url) return;

      const template = window.document.createElement('template');
      template.innerHTML = buildFigureHtml(media.dataset.path!, url, {
        caption: figure.querySelector('figcaption')?.textContent || '',
        kind: document.sticker ? 'sticker' : 'gif',
        captionPlaceholder: lang('NilakWriterCaption'),
      });
      figure.replaceWith(template.content.firstChild!);
    });

    const { customEmojis } = getGlobal();
    editor.querySelectorAll<HTMLImageElement>('img[data-emoji-id]').forEach(async (image) => {
      const sticker = customEmojis.byId[image.dataset.emojiId!];
      const url = sticker && await fetchCustomEmojiUrl(sticker);
      if (url) image.src = url;
    });
  }

  function insertInline(html: string) {
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    syncBody();
  }

  const handleEmojiSelect = useLastCallback((emoji: string) => {
    restoreSelection();
    document.execCommand('insertText', false, emoji);
    syncBody();
  });

  // Animated emoji show as their picture while writing and are kept as `[😀](emoji:id)`, like on Android
  const handleCustomEmojiSelect = useLastCallback(async (sticker: ApiSticker) => {
    const alt = sticker.emoji || '🙂';
    insertInline(buildCustomEmojiHtml(sticker.id, alt, sticker.thumbnail?.dataUri));
    const url = await fetchCustomEmojiUrl(sticker);
    if (!url) return;

    editorRef.current!.querySelectorAll<HTMLImageElement>(`img[data-emoji-id="${sticker.id}"]`).forEach((image) => {
      image.src = url;
    });
  });

  async function insertDocument(documentId: string, document: { sticker?: ApiSticker; gif?: ApiVideo }) {
    const ref = await encodeNilakDocument(documentId);
    if (!ref) return;

    const url = await fetchNilakDocumentUrl(document) || '';
    insertBlock(buildFigureHtml(ref, url, {
      kind: document.sticker ? 'sticker' : 'gif',
      captionPlaceholder: lang('NilakWriterCaption'),
    }));
  }

  const handleStickerSelect = useLastCallback((sticker: ApiSticker) => {
    setIsSymbolsOpen(false);
    void insertDocument(sticker.id, { sticker });
  });

  const handleGifSelect = useLastCallback((gif: ApiVideo) => {
    setIsSymbolsOpen(false);
    void insertDocument(gif.id, { gif });
  });

  // Looks for an `@name` being typed and places the suggestions under it
  function updateMention() {
    const selection = document.getSelection();
    const node = selection?.anchorNode;
    if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || node.parentElement?.closest('a, pre')) {
      setMention(undefined);
      return;
    }

    const match = (node.textContent || '').slice(0, selection.anchorOffset).match(MENTION_QUERY);
    if (!match) {
      setMention(undefined);
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const query = match[1];
    const position = rect.bottom + MENTION_LIST_HEIGHT > window.innerHeight
      ? `left: ${rect.left}px; bottom: ${window.innerHeight - rect.top}px`
      : `left: ${rect.left}px; top: ${rect.bottom}px`;
    setMention((current) => (current?.query === query ? current : { query, position }));
    setMentionIndex(0);
  }

  // "@que" becomes "@username" linked to the profile, so readers on both apps can open it
  function insertMention(peer: ApiPeer) {
    const username = getMainUsername(peer)!;
    const selection = document.getSelection()!;
    const node = selection.anchorNode!;
    const offset = selection.anchorOffset;
    const start = (node.textContent || '').lastIndexOf('@', offset);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, offset);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('insertHTML', false, `<a href="https://t.me/${username}">@${username}</a>&nbsp;`);
    setMention(undefined);
    syncBody();
  }

  const handleEditorInput = useLastCallback(() => {
    syncBody();
    updateMention();
  });

  const handleEditorKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!mention || !mentionPeers.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setMentionIndex((mentionIndex + step + mentionPeers.length) % mentionPeers.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(mentionPeers[mentionIndex] || mentionPeers[0]);
    } else if (e.key === 'Escape') {
      setMention(undefined);
    }
  });

  // Toolbar buttons and the file picker take the focus, so the caret is put back before each change
  function restoreSelection() {
    const editor = editorRef.current!;
    editor.focus();
    const selection = document.getSelection()!;
    const range = rangeRef.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    const end = document.createRange();
    end.selectNodeContents(editor);
    end.collapse(false);
    selection.removeAllRanges();
    selection.addRange(end);
  }

  // Blocks (pictures, tables, quizzes) go after the paragraph with the caret, or replace it when it is empty,
  // so they never split the text in the middle of a line
  function insertBlock(html: string) {
    restoreSelection();
    const editor = editorRef.current!;
    const selection = document.getSelection()!;
    let current: Node | null = selection.anchorNode;
    while (current && current.parentNode !== editor) current = current.parentNode;

    const template = document.createElement('template');
    template.innerHTML = html;
    const last = template.content.lastChild;
    if (!current) {
      editor.append(template.content);
    } else if (!current.textContent?.trim() && !(current instanceof Element && current.querySelector('img,video'))) {
      editor.replaceChild(template.content, current);
    } else {
      editor.insertBefore(template.content, current.nextSibling);
    }

    if (last) {
      const range = document.createRange();
      range.selectNodeContents(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    syncBody();
  }

  function applyTool({ id, command, block }: Tool) {
    restoreSelection();
    const selectedText = document.getSelection()?.toString() || '';

    if (block) {
      const isActive = String(document.queryCommandValue('formatBlock')).toLowerCase() === block;
      document.execCommand('formatBlock', false, isActive ? 'p' : block);
    } else if (command) {
      document.execCommand(command);
    } else if (id === 'mark') {
      if (selectedText) document.execCommand('insertHTML', false, `<mark>${escapeAttribute(selectedText)}</mark>`);
    } else if (id === 'link') {
      const url = window.prompt(lang('NilakWriterLinkPrompt'), 'https://');
      if (url && URL_PATTERN.test(url)) {
        restoreSelection();
        if (selectedText) {
          document.execCommand('createLink', false, url);
        } else {
          document.execCommand('insertHTML', false, `<a href="${escapeAttribute(url)}">${escapeAttribute(url)}</a>`);
        }
      }
    } else if (id === 'emoji') {
      setIsSymbolsOpen(!isSymbolsOpen);
      return;
    } else if (id === 'mention') {
      document.execCommand('insertText', false, selectedText ? `@${selectedText}` : '@');
      updateMention();
    } else if (id === 'embed') {
      const url = window.prompt(lang('NilakWriterLinkPrompt'), 'https://');
      if (url && URL_PATTERN.test(url)) insertBlock(buildEmbedHtml(url));
      return;
    } else if (id === 'tip') {
      insertBlock(`<blockquote data-callout="TIP">${escapeAttribute(selectedText) || '<br>'}</blockquote><p><br></p>`);
    } else if (id === 'photo') {
      fileInputRef.current!.click();
      return;
    } else if (id === 'table') {
      insertBlock(buildTableHtml());
    } else if (id === 'quiz') {
      insertBlock(buildQuizHtml());
    } else if (id === 'divider') {
      insertBlock('<hr><p><br></p>');
    }

    syncBody();
  }

  const handleTitleChange = useLastCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.currentTarget;
    setDraft((current) => ({ ...current, title: value.replace(/\n/g, ' ') }));
  });

  const handleSubtitleChange = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.currentTarget;
    setDraft((current) => ({ ...current, subtitle: value }));
  });

  const handleTitleKeyDown = useLastCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return;

    e.preventDefault();
    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
    (next?.tagName === 'INPUT' ? next : editorRef.current)?.focus();
  });

  // Pasted pages keep their headings, lists, bold text and links; Markdown text arrives formatted
  const handlePaste = useLastCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (!html && !text) return;

    e.preventDefault();
    if (html) {
      document.execCommand('insertHTML', false, sanitizePastedHtml(html));
    } else if (getIsMarkdownLike(text)) {
      document.execCommand('insertHTML', false, markdownToEditorHtml(text, {}));
    } else {
      document.execCommand('insertText', false, text);
    }
    syncBody();
  });

  const handleEditorClick = useLastCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const option = target.closest<HTMLElement>('[data-block="quiz"] li');
    if (option && e.clientX - option.getBoundingClientRect().left < QUIZ_MARK_WIDTH) {
      option.parentElement!.querySelectorAll('li').forEach((item) => item.removeAttribute('data-correct'));
      option.dataset.correct = 'true';
      syncBody();
      return;
    }

    // Links open on Ctrl or Cmd click, like in other editors; a plain click places the caret
    const link = target.closest('a');
    if (link && (e.ctrlKey || e.metaKey)) window.open(link.href, '_blank', 'noopener');
  });

  const handleMediaSelect = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    if (!files.length) return;

    const html = files.map((file, index) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `media/${Date.now()}-${index}.${extension}`;
      const url = URL.createObjectURL(file);
      mediaRef.current[path] = file;
      createdUrlsRef.current.push(url);
      return buildFigureHtml(path, url, {
        kind: file.type.startsWith('video/') ? 'video' : 'photo',
        captionPlaceholder: lang('NilakWriterCaption'),
      });
    });
    insertBlock(html.join(''));
  });

  const handlePublish = useLastCallback(async () => {
    if (!canPublish) return;

    setIsPublishing(true);
    const currentUser = selectUser(getGlobal(), getGlobal().currentUserId!);
    const barruuDraft = {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      author: getUserFullName(lang, currentUser) || channel.title,
      body: editorToMarkdown(editorRef.current!),
      media: mediaRef.current,
    };
    const file = await buildBarruuFile(barruuDraft);

    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      // Nothing to do when storage is unavailable
    }
    // Published straight to the channel, like any file sent from the composer
    const attachment = await buildAttachment(file.name, file);
    sendMessage({
      messageList: { chatId: channel.id, threadId: MAIN_THREAD_ID, type: 'thread' },
      text: buildBarruuCaption(barruuDraft),
      attachments: [attachment],
    });
    showNotification({ message: { key: 'NilakBarruuPublished' } });
    onPublished();
  });

  return (
    <div className={styles.writer}>
      <div className={styles.writerBar}>
        <button type="button" className={styles.iconButton} aria-label={lang('Back')} onClick={onClose}>
          <Icon name="arrow-left" />
        </button>
        <span className={styles.writerTitle}>
          {lang('NilakCreateBarruu')}
          <span className={styles.writerChannel}>{channel.title}</span>
        </span>
        <button type="button" className={styles.primary} disabled={!canPublish} onClick={handlePublish}>
          {lang('NilakWriterPublish')}
        </button>
      </div>

      {/* Buttons keep the caret in the text: they act on mouse down, before the editor would lose focus */}
      <div className={styles.toolbar} role="toolbar">
        {TOOL_GROUPS.map((group) => (
          <div key={group[0].id} className={styles.toolGroup}>
            {group.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={buildClassName(styles.tool, activeTools.includes(tool.id) && styles.toolActive)}
                title={lang(tool.labelKey)}
                aria-label={lang(tool.labelKey)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyTool(tool);
                }}
              >
                <Icon name={tool.icon} />
              </button>
            ))}
          </div>
        ))}
      </div>

      <article className={buildClassName(readerStyles.article, styles.page)} dir="auto">
        <span className={readerStyles.tag}>BARRUU</span>
        <textarea
          className={buildClassName(readerStyles.title, styles.titleInput)}
          value={draft.title}
          placeholder={lang('NilakWriterTitle')}
          rows={1}
          dir="auto"
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
        />
        <input
          className={buildClassName(readerStyles.subtitle, styles.subtitleInput)}
          value={draft.subtitle}
          placeholder={lang('NilakWriterSubtitle')}
          dir="auto"
          onChange={handleSubtitleChange}
          onKeyDown={handleTitleKeyDown}
        />
        <div
          ref={editorRef}
          className={buildClassName(styles.editable, !draft.body && styles.editableEmpty)}
          contentEditable
          role="textbox"
          aria-multiline
          data-placeholder={lang('NilakWriterBody')}
          onInput={handleEditorInput}
          onKeyDown={handleEditorKeyDown}
          onPaste={handlePaste}
          onClick={handleEditorClick}
        />
      </article>
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        onChange={handleMediaSelect}
      />
      {mention && Boolean(mentionPeers.length) && (
        <Portal>
          <div
            className={styles.mentions}
            style={mention.position}
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
          >
            {mentionPeers.map((peer, index) => (
              <button
                key={peer.id}
                type="button"
                role="option"
                aria-selected={index === mentionIndex}
                className={buildClassName(styles.mention, index === mentionIndex && styles.mentionActive)}
                onClick={() => insertMention(peer)}
              >
                <Avatar peer={peer} size="small" />
                <span className={styles.mentionText}>
                  <span className={styles.mentionName}>{getPeerTitle(lang, peer)}</span>
                  <span className={styles.mentionUsername}>
                    @
                    {getMainUsername(peer)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Portal>
      )}
      {isSymbolsOpen && (
        <Portal>
          <NilakWriterSymbols
            chatId={channel.id}
            onClose={() => setIsSymbolsOpen(false)}
            onEmojiSelect={handleEmojiSelect}
            onCustomEmojiSelect={handleCustomEmojiSelect}
            onStickerSelect={handleStickerSelect}
            onGifSelect={handleGifSelect}
          />
        </Portal>
      )}
    </div>
  );
};

function readSavedDraft(): TextDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (saved) return saved;
  } catch (err) {
    // A missing or broken draft starts empty
  }

  return { title: '', subtitle: '', body: '' };
}

export default memo(NilakBarruuWriter);
