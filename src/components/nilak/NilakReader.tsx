import type { TeactNode } from '../../lib/teact/teact';
import {
  memo, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiMessage } from '../../api/types';
import type { BarruuBlock, BarruuInline, BarruuPackage } from './helpers/barruu';
import { ApiMediaFormat } from '../../api/types';

import { getDocumentMediaHash } from '../../global/helpers';
import { selectChat, selectChatMessage } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import * as mediaLoader from '../../util/mediaLoader';
import { throttle } from '../../util/schedulers';
import renderText from '../common/helpers/renderText';
import { renderTextWithEntities } from '../common/helpers/renderTextWithEntities';
import {
  getBarruuSubtitle, getBarruuTitle, getIsBarruu, getReadMinutes, parseBarruu, parseBarruuInline, readBarruuPackage,
} from './helpers/barruu';
import { setOpenedRead } from './helpers/nilakTab';
import { getReadingProgress, saveReadingProgress } from './helpers/readingProgress';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';
import CustomEmoji from '../common/CustomEmoji';
import Icon from '../common/icons/Icon';
import Loading from '../ui/Loading';
import NilakQuiz from './NilakQuiz';

import styles from './NilakReader.module.scss';

type OwnProps = {
  chatId: string;
  messageId: number;
};

type StateProps = {
  chat?: ApiChat;
  message?: ApiMessage;
};

const PROGRESS_SAVE_INTERVAL = 1000;
const CUSTOM_EMOJI_SIZE = 20;
const FULL_PERCENT = 100;

const NilakReader = ({ chatId, messageId, chat, message }: OwnProps & StateProps) => {
  const lang = useLang();
  const scrollRef = useRef<HTMLDivElement>();
  const [barruu, setBarruu] = useState<BarruuPackage | undefined>();
  const [hasError, setHasError] = useState(false);
  const [progress, setProgress] = useState(0);

  const isBarruu = message ? getIsBarruu(message) : false;
  const document = message?.content.document;

  useEffect(() => {
    if (!isBarruu || !document) return undefined;

    let isCancelled = false;
    let loaded: BarruuPackage | undefined;
    mediaLoader.fetch(getDocumentMediaHash(document, 'download')!, ApiMediaFormat.BlobUrl)
      .then((url) => fetch(url))
      .then((response) => response.arrayBuffer())
      .then((data) => {
        loaded = readBarruuPackage(data);
        if (isCancelled) {
          revokeMedia(loaded);
        } else {
          setBarruu(loaded);
        }
      })
      .catch(() => {
        if (!isCancelled) setHasError(true);
      });

    return () => {
      isCancelled = true;
      if (loaded) revokeMedia(loaded);
    };
  }, [isBarruu, document]);

  const blocks = useMemo(() => (barruu ? parseBarruu(barruu.body) : undefined), [barruu]);

  // The reader opens where it was left
  const isReady = Boolean(message && (!isBarruu || blocks));
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!isReady || !container) return;

    const saved = getReadingProgress(chatId, messageId);
    if (saved && saved < FULL_PERCENT) {
      container.scrollTop = (container.scrollHeight - container.clientHeight) * (saved / FULL_PERCENT);
    }
  }, [isReady, chatId, messageId]);

  const saveProgress = useMemo(() => throttle((percent: number) => {
    saveReadingProgress(chatId, messageId, percent);
  }, PROGRESS_SAVE_INTERVAL, false), [chatId, messageId]);

  const handleScroll = useLastCallback(() => {
    const container = scrollRef.current!;
    const scrollable = container.scrollHeight - container.clientHeight;
    const percent = scrollable > 0 ? Math.min(FULL_PERCENT, (container.scrollTop / scrollable) * FULL_PERCENT) : 0;
    setProgress(percent);
    saveProgress(percent);
  });

  const handleClose = useLastCallback(() => {
    setOpenedRead(undefined);
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  function renderInline(parts: BarruuInline[]): TeactNode[] {
    return parts.map((part) => {
      if (typeof part === 'string') return renderText(part, ['emoji', 'br']);

      switch (part.type) {
        case 'code':
          return <code className={styles.inlineCode}>{part.text}</code>;
        case 'bold':
          return <strong>{renderInline(part.children)}</strong>;
        case 'italic':
          return <em>{renderInline(part.children)}</em>;
        case 'strike':
          return <s>{renderInline(part.children)}</s>;
        case 'highlight':
          return <mark className={styles.highlight}>{renderInline(part.children)}</mark>;
        case 'customEmoji':
          return <CustomEmoji documentId={part.documentId} size={CUSTOM_EMOJI_SIZE} />;
        case 'link':
          return (
            <a
              className={buildClassName(styles.link, part.isMention && styles.mention)}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {renderInline(part.children)}
            </a>
          );
      }

      return undefined;
    });
  }

  function renderMarkup(text: string) {
    return renderInline(parseBarruuInline(text));
  }

  function renderMedia(block: Extract<BarruuBlock, { path: string }>) {
    const url = barruu?.mediaUrls[block.path];
    if (!url) {
      // Media kept outside the package (a t.me link from the article editor) opens in a new tab
      return block.path.startsWith('http') ? renderLinkCard(block.path, block.caption) : undefined;
    }

    return (
      <figure className={styles.figure}>
        {block.type === 'video'
          ? <video className={styles.media} src={url} controls playsInline />
          : <img className={styles.media} src={url} alt={block.caption} />}
        {block.caption && <figcaption className={styles.caption}>{renderMarkup(block.caption)}</figcaption>}
      </figure>
    );
  }

  function renderLinkCard(url: string, title?: string) {
    return (
      <a className={styles.linkCard} href={url} target="_blank" rel="noopener noreferrer">
        <Icon name="link" className={styles.linkCardIcon} />
        <span className={styles.linkCardText}>{title || url}</span>
      </a>
    );
  }

  function renderBlock(block: BarruuBlock) {
    switch (block.type) {
      case 'heading': {
        const className = buildClassName(styles.heading, styles[`heading${block.level}`]);
        return block.level === 1
          ? <h2 className={className}>{renderMarkup(block.text)}</h2>
          : <h3 className={className}>{renderMarkup(block.text)}</h3>;
      }
      case 'paragraph':
        return <p className={styles.paragraph}>{renderMarkup(block.text)}</p>;
      case 'quote':
        return <blockquote className={styles.quote}>{renderMarkup(block.text)}</blockquote>;
      case 'callout':
        return (
          <div className={buildClassName(styles.callout, styles[`callout${block.kind}`])}>
            {renderMarkup(block.text)}
          </div>
        );
      case 'bullets':
        return <ul className={styles.list}>{block.items.map((item) => <li>{renderMarkup(item)}</li>)}</ul>;
      case 'numbers':
        return <ol className={styles.list}>{block.items.map((item) => <li>{renderMarkup(item)}</li>)}</ol>;
      case 'divider':
        return <div className={styles.divider} aria-hidden>✿ ✿ ✿</div>;
      case 'code':
        return <pre className={styles.code}>{block.text}</pre>;
      case 'image':
      case 'video':
        return renderMedia(block);
      case 'link':
        return renderLinkCard(block.url);
      case 'table':
        return (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              {block.rows.map((row, rowIndex) => (
                <tr>
                  {row.map((cell) => (rowIndex === 0
                    ? <th className={styles.cell}>{renderMarkup(cell)}</th>
                    : <td className={styles.cell}>{renderMarkup(cell)}</td>))}
                </tr>
              ))}
            </table>
          </div>
        );
      case 'quiz':
        return (
          <NilakQuiz
            question={block.question}
            options={block.options}
            answer={block.answer}
            explanation={block.explanation}
          />
        );
    }

    return undefined;
  }

  function renderBody() {
    if (!message) return undefined;

    if (!isBarruu) {
      const text = message.content.text;
      return text && (
        <p className={styles.paragraph}>{renderTextWithEntities({ text: text.text, entities: text.entities })}</p>
      );
    }

    if (hasError) return <p className={styles.status}>{lang('NilakReadError')}</p>;
    if (!blocks) return <div className={styles.status}><Loading /></div>;

    return blocks.map((block) => renderBlock(block));
  }

  const minutes = message ? getReadMinutes(message) : 0;
  const subtitle = message && isBarruu ? getBarruuSubtitle(message) : undefined;

  return (
    <div className={styles.root} role="dialog" aria-modal>
      <div className={styles.progress} style={`width: ${progress}%`} />
      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label={lang('Close')} onClick={handleClose}>
          <Icon name="close" />
        </button>
        {chat && <Avatar peer={chat} size="small" />}
        <div className={styles.channel}>{chat?.title}</div>
        {Boolean(minutes) && (
          <div className={styles.minutes}>
            {lang('NilakReadMinutes', { count: minutes }, { pluralValue: minutes })}
          </div>
        )}
      </header>
      <div ref={scrollRef} className={buildClassName(styles.scroll, 'custom-scroll')} onScroll={handleScroll}>
        <article className={styles.article} dir="auto">
          {message && isBarruu && (
            <>
              <span className={styles.tag}>✿ BARRUU</span>
              <h1 className={styles.title}>{renderText(getBarruuTitle(message))}</h1>
              {subtitle && <p className={styles.subtitle}>{renderText(subtitle, ['emoji', 'br'])}</p>}
            </>
          )}
          {renderBody()}
        </article>
      </div>
    </div>
  );
};

function revokeMedia(barruu: BarruuPackage) {
  Object.values(barruu.mediaUrls).forEach((url) => URL.revokeObjectURL(url));
}

export default memo(withGlobal<OwnProps>(
  (global, { chatId, messageId }): Complete<StateProps> => ({
    chat: selectChat(global, chatId),
    message: selectChatMessage(global, chatId, messageId),
  }),
)(NilakReader));
