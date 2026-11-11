import {
  memo, useEffect, useRef, useState,
} from '../../lib/teact/teact';
import { getActions, getGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import type { IconName } from '../../types/icons';
import { MAIN_THREAD_ID } from '../../api/types';

import { getUserFullName } from '../../global/helpers';
import { selectUser } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildAttachment from '../middle/composer/helpers/buildAttachment';
import { buildBarruuCaption, buildBarruuFile } from './helpers/barruu';
import {
  buildFigureHtml, buildQuizHtml, buildTableHtml, editorToMarkdown, escapeAttribute, getIsMarkdownLike,
  markdownToEditorHtml, sanitizePastedHtml,
} from './helpers/barruuHtml';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Icon from '../common/icons/Icon';

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
  | 'NilakWriterDivider';

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
  ],
  [
    { id: 'photo', icon: 'media', labelKey: 'NilakWriterPhoto' },
    { id: 'table', icon: 'table', labelKey: 'NilakWriterTable' },
    { id: 'quiz', icon: 'poll', labelKey: 'NilakWriterQuiz' },
    { id: 'divider', icon: 'stats', labelKey: 'NilakWriterDivider' },
  ],
];
const DRAFT_STORAGE_KEY = 'nilak-barruu-draft';
const IMAGE_ACCEPT = 'image/*,video/*';
// The round mark before a quiz answer; clicking it marks the answer as the right one
const QUIZ_MARK_WIDTH = 32;

type TextDraft = { title: string; subtitle: string; body: string };

const NilakBarruuWriter = ({ channel, onClose, onPublished }: OwnProps) => {
  const { sendMessage, showNotification } = getActions();
  const lang = useLang();
  const editorRef = useRef<HTMLDivElement>();
  const fileInputRef = useRef<HTMLInputElement>();
  const rangeRef = useRef<Range>();
  const mediaRef = useRef<Record<string, File>>({});
  const [draft, setDraft] = useState<TextDraft>(readSavedDraft);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);

  // The editor's content belongs to the browser while writing; it is filled once from the saved draft
  useEffect(() => {
    const editor = editorRef.current!;
    // Media files stay in memory only, so a reloaded draft drops the pictures it can no longer show
    editor.innerHTML = markdownToEditorHtml(draft.body, {});
    document.execCommand('defaultParagraphSeparator', false, 'p');
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
    editorRef.current?.querySelectorAll<HTMLImageElement | HTMLVideoElement>('[data-path]').forEach((media) => {
      if (media.src.startsWith('blob:')) URL.revokeObjectURL(media.src);
    });
  }, []);

  const canPublish = Boolean(draft.title.trim() && draft.body.trim()) && !isPublishing;

  function syncBody() {
    const body = editorToMarkdown(editorRef.current!);
    setDraft((current) => (current.body === body ? current : { ...current, body }));
  }

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
      if (url && /^https?:\/\/\S+$/.test(url)) {
        restoreSelection();
        if (selectedText) {
          document.execCommand('createLink', false, url);
        } else {
          document.execCommand('insertHTML', false, `<a href="${escapeAttribute(url)}">${escapeAttribute(url)}</a>`);
        }
      }
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
      mediaRef.current[path] = file;
      return buildFigureHtml(
        path, URL.createObjectURL(file), '', file.type.startsWith('video/'), lang('NilakWriterCaption'),
      );
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
          onInput={syncBody}
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
