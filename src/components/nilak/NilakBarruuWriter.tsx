import {
  memo, useEffect, useMemo, useRef, useState,
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

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Icon from '../common/icons/Icon';
import NilakBarruuBody from './NilakBarruuBody';

import styles from './NilakCreate.module.scss';
import readerStyles from './NilakReader.module.scss';

type OwnProps = {
  channel: ApiChat;
  onClose: NoneToVoidFunction;
  onPublished: NoneToVoidFunction;
};

type Snippet = { icon: IconName; labelKey: 'NilakWriterHeading' | 'NilakWriterBold' | 'NilakWriterItalic'
  | 'NilakWriterQuote' | 'NilakWriterList' | 'NilakWriterTip' | 'NilakWriterQuiz' | 'NilakWriterTable'
  | 'NilakWriterDivider'; before: string; after?: string; isBlock?: boolean; };

// The writer inserts Nilak Markdown, the format Nilak for Android reads and writes
const SNIPPETS: Snippet[] = [
  { icon: 'heading', labelKey: 'NilakWriterHeading', before: '## ', isBlock: true },
  { icon: 'bold', labelKey: 'NilakWriterBold', before: '**', after: '**' },
  { icon: 'italic', labelKey: 'NilakWriterItalic', before: '*', after: '*' },
  { icon: 'quote', labelKey: 'NilakWriterQuote', before: '> ', isBlock: true },
  { icon: 'list', labelKey: 'NilakWriterList', before: '- ', isBlock: true },
  { icon: 'lamp', labelKey: 'NilakWriterTip', before: '> [!TIP] ', isBlock: true },
  {
    icon: 'poll',
    labelKey: 'NilakWriterQuiz',
    before: '```quiz\nQuestion?\n+ Right answer\n- Other answer\n> Why it is right\n```\n',
    isBlock: true,
  },
  {
    icon: 'table',
    labelKey: 'NilakWriterTable',
    before: '| Column | Column |\n|---|---|\n| Cell | Cell |\n',
    isBlock: true,
  },
  { icon: 'stats', labelKey: 'NilakWriterDivider', before: '---\n', isBlock: true },
];
const DRAFT_STORAGE_KEY = 'nilak-barruu-draft';
const IMAGE_ACCEPT = 'image/*,video/*';

type TextDraft = { title: string; subtitle: string; body: string };

const NilakBarruuWriter = ({ channel, onClose, onPublished }: OwnProps) => {
  const { sendMessage, showNotification } = getActions();
  const lang = useLang();
  const bodyRef = useRef<HTMLTextAreaElement>();
  const fileInputRef = useRef<HTMLInputElement>();
  const [draft, setDraft] = useState<TextDraft>(readSavedDraft);
  const [media, setMedia] = useState<Record<string, File>>({});
  const [isPreview, setIsPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // The text is kept in this browser while writing, so a reload does not lose it
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (err) {
      // Nothing to do when storage is unavailable
    }
  }, [draft]);

  const mediaUrls = useMemo(() => Object.fromEntries(
    Object.entries(media).map(([path, file]) => [path, URL.createObjectURL(file)]),
  ), [media]);

  useEffect(() => () => {
    Object.values(mediaUrls).forEach((url) => URL.revokeObjectURL(url));
  }, [mediaUrls]);

  const canPublish = Boolean(draft.title.trim() && draft.body.trim()) && !isPublishing;

  function insertText(before: string, after = '', isBlock?: boolean) {
    const textarea = bodyRef.current;
    const { body } = draft;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const prefix = isBlock && start > 0 && body[start - 1] !== '\n' ? '\n' : '';
    const selected = body.slice(start, end);
    const nextBody = `${body.slice(0, start)}${prefix}${before}${selected}${after}${body.slice(end)}`;
    setDraft((current) => ({ ...current, body: nextBody }));

    const caret = start + prefix.length + before.length + selected.length;
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(caret, caret);
    });
  }

  const handleTitleChange = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.currentTarget;
    setDraft((current) => ({ ...current, title: value }));
  });

  const handleSubtitleChange = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.currentTarget;
    setDraft((current) => ({ ...current, subtitle: value }));
  });

  const handleBodyChange = useLastCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.currentTarget;
    setDraft((current) => ({ ...current, body: value }));
  });

  const handleMediaSelect = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    if (!files.length) return;

    const added: Record<string, File> = {};
    const lines = files.map((file, index) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `media/${Date.now()}-${index}.${extension}`;
      added[path] = file;
      return `![](${path})`;
    });
    setMedia((current) => ({ ...current, ...added }));
    insertText(`${lines.join('\n')}\n`, '', true);
  });

  const handlePublish = useLastCallback(async () => {
    if (!canPublish) return;

    setIsPublishing(true);
    const currentUser = selectUser(getGlobal(), getGlobal().currentUserId!);
    const barruuDraft = {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      author: getUserFullName(lang, currentUser) || channel.title,
      body: draft.body,
      media,
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
        <span className={styles.writerTitle}>{lang('NilakCreateBarruu')}</span>
        <button
          type="button"
          className={buildClassName(styles.secondary, styles.previewToggle, isPreview && styles.secondaryActive)}
          onClick={() => setIsPreview(!isPreview)}
        >
          <Icon name="eye" />
          {' '}
          {lang('NilakWriterPreview')}
        </button>
        <button type="button" className={styles.primary} disabled={!canPublish} onClick={handlePublish}>
          {lang('NilakWriterPublish')}
        </button>
      </div>

      {/* Wide screens show the article beside the editor, updated as the writer types */}
      <div className={buildClassName(styles.split, isPreview && styles.splitPreview)}>
        <div className={styles.editor}>
          <input
            className={styles.titleInput}
            value={draft.title}
            placeholder={lang('NilakWriterTitle')}
            dir="auto"
            onChange={handleTitleChange}
          />
          <input
            className={styles.subtitleInput}
            value={draft.subtitle}
            placeholder={lang('NilakWriterSubtitle')}
            dir="auto"
            onChange={handleSubtitleChange}
          />
          <div className={styles.toolbar}>
            {SNIPPETS.map(({
              icon, labelKey, before, after, isBlock,
            }) => (
              <button
                key={labelKey}
                type="button"
                className={styles.iconButton}
                title={lang(labelKey)}
                aria-label={lang(labelKey)}
                onClick={() => insertText(before, after, isBlock)}
              >
                <Icon name={icon} />
              </button>
            ))}
            <button
              type="button"
              className={styles.iconButton}
              title={lang('NilakWriterPhoto')}
              aria-label={lang('NilakWriterPhoto')}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="camera" />
            </button>
          </div>
          <textarea
            ref={bodyRef}
            className={styles.bodyInput}
            value={draft.body}
            placeholder={lang('NilakWriterBody')}
            dir="auto"
            onChange={handleBodyChange}
          />
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            multiple
            accept={IMAGE_ACCEPT}
            onChange={handleMediaSelect}
          />
        </div>
        <article className={buildClassName(readerStyles.article, styles.preview)} dir="auto" aria-live="polite">
          <span className={readerStyles.tag}>✿ BARRUU</span>
          <h1 className={readerStyles.title}>{draft.title || lang('NilakWriterTitle')}</h1>
          {draft.subtitle && <p className={readerStyles.subtitle}>{draft.subtitle}</p>}
          <NilakBarruuBody markdown={draft.body} mediaUrls={mediaUrls} />
        </article>
      </div>
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
