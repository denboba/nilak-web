import { memo, useEffect, useMemo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';

import buildClassName from '../../util/buildClassName';
import { getIsReadPost } from './helpers/barruu';
import { getOpenedRead, openNilakBarruuWriter } from './helpers/nilakTab';
import { getReadingProgress } from './helpers/readingProgress';

import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import Loading from '../ui/Loading';
import NilakKeepReadingCard from './NilakKeepReadingCard';
import NilakReadRow from './NilakReadRow';

import styles from './NilakRead.module.scss';

type StateProps = {
  isLoading?: boolean;
  followingPosts?: ApiMessage[];
  suggestedPosts?: ApiMessage[];
};

const FULL_PERCENT = 100;

// Barruu and long posts from the feed as a reading list, with started ones in a strip above
const NilakRead = ({ isLoading, followingPosts, suggestedPosts }: StateProps) => {
  const { loadNilakFeed } = getActions();
  const lang = useLang();
  // Progress is read again each time the reader closes
  const openedRead = useDerivedState(getOpenedRead);

  useEffect(() => {
    loadNilakFeed();
  }, []);

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

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.pageTitle}>{lang('NilakRead')}</h2>
        <button type="button" className={styles.write} onClick={() => openNilakBarruuWriter()}>
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
          {posts.map((post) => <NilakReadRow key={`${post.chatId}-${post.id}`} post={post} />)}
        </div>
      )}
      {isLoading && !posts.length && <div className={styles.status}><Loading /></div>}
      {!isLoading && !posts.length && <div className={styles.status}>{lang('NilakReadEmpty')}</div>}
    </div>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => ({
    isLoading: global.nilakFeed?.isLoading,
    followingPosts: global.nilakFeed?.followingPosts,
    suggestedPosts: global.nilakFeed?.suggestedPosts,
  }),
)(NilakRead));
