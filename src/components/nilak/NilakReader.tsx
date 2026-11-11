import {
  memo, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiMessage } from '../../api/types';
import type { ThemeKey } from '../../types';
import type { BarruuPackage } from './helpers/barruu';
import { ApiMediaFormat } from '../../api/types';

import { getDocumentMediaHash } from '../../global/helpers';
import { selectChat, selectChatMessage, selectTheme } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import * as mediaLoader from '../../util/mediaLoader';
import { throttle } from '../../util/schedulers';
import renderText from '../common/helpers/renderText';
import { renderTextWithEntities } from '../common/helpers/renderTextWithEntities';
import {
  getBarruuSubtitle, getBarruuTitle, getIsBarruu, getReadMinutes, readBarruuPackage, splitLongPost,
} from './helpers/barruu';
import { setNilakTab, setOpenedRead } from './helpers/nilakTab';
import { getReadingProgress, saveReadingProgress } from './helpers/readingProgress';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';
import MessageRichText from '../common/MessageRichText';
import Loading from '../ui/Loading';
import NilakBarruuBody from './NilakBarruuBody';
import NilakMediaTile from './NilakMediaTile';

import styles from './NilakReader.module.scss';

type OwnProps = {
  chatId: string;
  messageId: number;
  // The post as it was opened, used when the message store no longer holds it
  fallbackMessage?: ApiMessage;
};

type StateProps = {
  chat?: ApiChat;
  message?: ApiMessage;
  theme: ThemeKey;
};

const PROGRESS_SAVE_INTERVAL = 1000;
const TELEGRAM_LINK = /^(https?:\/\/)?(t\.me|telegram\.me)\/|^tg:/i;
const FULL_PERCENT = 100;

const NilakReader = ({
  chatId, messageId, chat, message, theme,
}: OwnProps & StateProps) => {
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

  // The reader opens where it was left
  const isReady = Boolean(message && (!isBarruu || barruu));
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

  // A Telegram link (a channel, a post, a person) opens in Chats, so the reader steps aside
  const handleLinkClick = useLastCallback((e: React.MouseEvent<HTMLElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href') || '';
    if (!TELEGRAM_LINK.test(href)) return;

    setOpenedRead(undefined);
    setNilakTab('chats');
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  function renderBody() {
    if (!message) return undefined;

    // Telegram's own articles keep Telegram's look
    if (message.content.richMessage) return <MessageRichText message={message} theme={theme} />;

    if (!isBarruu) {
      return longPost && (
        <>
          <NilakMediaTile message={message} className={styles.postMedia} />
          <p className={styles.paragraph}>
            {renderTextWithEntities({ text: longPost.body.text, entities: longPost.body.entities })}
          </p>
        </>
      );
    }

    if (hasError) return <p className={styles.status}>{lang('NilakReadError')}</p>;
    if (!barruu) return <div className={styles.status}><Loading /></div>;

    return <NilakBarruuBody markdown={barruu.body} mediaUrls={barruu.mediaUrls} />;
  }

  const minutes = message ? getReadMinutes(message) : 0;
  const subtitle = message && isBarruu ? getBarruuSubtitle(message) : undefined;
  const longPost = useMemo(() => (
    message?.content.text && !isBarruu && !message.content.richMessage ? splitLongPost(message.content.text) : undefined
  ), [message?.content.text, message?.content.richMessage, isBarruu]);

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
        <article className={styles.article} dir="auto" onClickCapture={handleLinkClick}>
          {message && isBarruu && (
            <>
              <span className={styles.tag}>BARRUU</span>
              <h1 className={styles.title}>{renderText(getBarruuTitle(message))}</h1>
              {subtitle && <p className={styles.subtitle}>{renderText(subtitle, ['emoji', 'br'])}</p>}
            </>
          )}
          {longPost?.title && (
            <>
              <span className={styles.tag}>{lang('NilakLongRead')}</span>
              <h1 className={styles.title}>{renderText(longPost.title)}</h1>
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
  (global, { chatId, messageId, fallbackMessage }): Complete<StateProps> => ({
    chat: selectChat(global, chatId),
    theme: selectTheme(global),
    message: selectChatMessage(global, chatId, messageId) || fallbackMessage,
  }),
)(NilakReader));
