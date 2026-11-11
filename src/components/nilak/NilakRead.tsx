import {
  memo, useEffect, useMemo, useState,
} from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';

import buildClassName from '../../util/buildClassName';
import { getIsReadPost } from './helpers/barruu';
import { getOpenedRead, openNilakBarruuWriter, setOpenedRead } from './helpers/nilakTab';
import { getReadingProgress } from './helpers/readingProgress';

import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import Loading from '../ui/Loading';
import NilakCreate from './NilakCreate';
import NilakKeepReadingCard from './NilakKeepReadingCard';
import NilakReader from './NilakReader';
import NilakReadRow from './NilakReadRow';

import styles from './NilakRead.module.scss';

type OwnProps = {
  isNarrow?: boolean;
};

type StateProps = {
  isLoading?: boolean;
  followingPosts?: ApiMessage[];
  suggestedPosts?: ApiMessage[];
};

const FULL_PERCENT = 100;

// Barruu and long posts from the feed as a reading list, with started ones in a strip above. On wide screens
// it works like chats: the list on one side, the open article or the Barruu writer on the other.
const NilakRead = ({
  isNarrow, isLoading, followingPosts, suggestedPosts,
}: OwnProps & StateProps) => {
  const { loadNilakFeed } = getActions();
  const lang = useLang();
  // Progress is read again each time the reader closes
  const openedRead = useDerivedState(getOpenedRead);
  const [isWriting, setIsWriting] = useState(false);
  const isSplit = !isNarrow;

  useEffect(() => {
    loadNilakFeed();
  }, []);

  // Opening an article closes the writer beside it
  useEffect(() => {
    if (openedRead) setIsWriting(false);
  }, [openedRead]);

  // The article shown beside the list belongs to Read; it does not follow to other pages
  useEffect(() => () => {
    if (isSplit) setOpenedRead(undefined);
  }, [isSplit]);

  const posts = useMemo(() => (
    (followingPosts || []).concat(suggestedPosts || [])
      .filter(getIsReadPost)
      .sort((a, b) => b.date - a.date)
  ), [followingPosts, suggestedPosts]);

  const progressByKey = useMemo(() => {
    if (openedRead) return undefined;

    return posts.reduce<Record<string, number>>((acc, post) => {
      acc[`${post.chatId}:${post.id}`] = getReadingProgress(post.chatId, post.id);
      return acc;
    }, {});
  }, [posts, openedRead]);

  const unfinished = posts.filter((post) => {
    const progress = progressByKey?.[`${post.chatId}:${post.id}`] || 0;
    return progress > 0 && progress < FULL_PERCENT;
  });

  function handleWrite() {
    if (!isSplit) {
      openNilakBarruuWriter();
      return;
    }

    setOpenedRead(undefined);
    setIsWriting(true);
  }

  function renderList() {
    return (
      <>
        <div className={styles.header}>
          <h2 className={styles.pageTitle}>{lang('NilakRead')}</h2>
          <button
            type="button"
            className={buildClassName(styles.write, isWriting && styles.writeActive)}
            onClick={handleWrite}
          >
            <Icon name="edit" />
            {lang('NilakWriteBarruu')}
          </button>
        </div>

        {Boolean(unfinished.length) && (
          <>
            <h3 className={styles.sectionTitle}>{lang('NilakKeepReading')}</h3>
            <div className={buildClassName(styles.keepStrip, 'no-scrollbar')}>
              {unfinished.map((post) => (
                <NilakKeepReadingCard
                  key={`keep-${post.chatId}-${post.id}`}
                  post={post}
                  progress={progressByKey![`${post.chatId}:${post.id}`]}
                />
              ))}
            </div>
          </>
        )}

        {Boolean(posts.length) && (
          <div className={styles.list}>
            {posts.map((post) => (
              <NilakReadRow
                key={`${post.chatId}-${post.id}`}
                post={post}
                isSelected={isSplit && openedRead?.chatId === post.chatId && openedRead.messageId === post.id}
              />
            ))}
          </div>
        )}
        {isLoading && !posts.length && <div className={styles.status}><Loading /></div>}
        {!isLoading && !posts.length && <div className={styles.status}>{lang('NilakReadEmpty')}</div>}
      </>
    );
  }

  function renderDetail() {
    if (isWriting) return <NilakCreate onDone={() => setIsWriting(false)} />;

    if (openedRead) {
      return (
        <NilakReader
          key={`${openedRead.chatId}-${openedRead.messageId}`}
          chatId={openedRead.chatId}
          messageId={openedRead.messageId}
          fallbackMessage={openedRead.message}
          isEmbedded
        />
      );
    }

    return (
      <div className={styles.placeholder}>
        <Icon name="article" className={styles.placeholderIcon} />
        <p className={styles.placeholderText}>{lang('NilakReadPick')}</p>
        <button type="button" className={styles.write} onClick={handleWrite}>
          <Icon name="edit" />
          {lang('NilakWriteBarruu')}
        </button>
      </div>
    );
  }

  if (!isSplit) return <div className={styles.root}>{renderList()}</div>;

  return (
    <div className={styles.split}>
      <aside className={buildClassName(styles.listColumn, 'custom-scroll')}>{renderList()}</aside>
      <section className={buildClassName(styles.detail, 'custom-scroll')}>{renderDetail()}</section>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({
    isLoading: global.nilakFeed?.isLoading,
    followingPosts: global.nilakFeed?.followingPosts,
    suggestedPosts: global.nilakFeed?.suggestedPosts,
  }),
)(NilakRead));
