import { memo, useEffect, useMemo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';

import { getIsReadPost } from './helpers/barruu';
import { getOpenedRead } from './helpers/nilakTab';
import { getReadingProgress } from './helpers/readingProgress';

import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';

import Loading from '../ui/Loading';
import NilakReadCard from './NilakReadCard';

import styles from './NilakRead.module.scss';

type StateProps = {
  isLoading?: boolean;
  followingPosts?: ApiMessage[];
  suggestedPosts?: ApiMessage[];
};

const FULL_PERCENT = 100;

// Barruu and long posts from the feed, with unfinished ones first under Keep reading
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
      {Boolean(unfinished.length) && (
        <>
          <h2 className={styles.sectionTitle}>{lang('NilakKeepReading')}</h2>
          <div className={styles.grid}>
            {unfinished.map((post) => (
              <NilakReadCard
                key={`keep-${post.chatId}-${post.id}`}
                post={post}
                progress={progressByKey?.[`${post.chatId}:${post.id}`]}
              />
            ))}
          </div>
          <h2 className={styles.sectionTitle}>{lang('NilakRead')}</h2>
        </>
      )}
      <div className={styles.grid}>
        {posts.map((post) => (
          <NilakReadCard
            key={`${post.chatId}-${post.id}`}
            post={post}
            progress={progressByKey?.[`${post.chatId}:${post.id}`]}
          />
        ))}
      </div>
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
