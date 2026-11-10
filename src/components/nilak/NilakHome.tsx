import { memo, useEffect, useMemo, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';

import { GLOBAL_SUGGESTED_CHANNELS_ID } from '../../config';
import { selectSimilarChannelIds } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';
import { getIsReadPost, getReadTitle } from './helpers/barruu';
import { getOpenedRead, setOpenedRead } from './helpers/nilakTab';
import { getReadingProgress } from './helpers/readingProgress';

import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Loading from '../ui/Loading';
import NilakPostCard from './NilakPostCard';
import NilakStories from './NilakStories';
import NilakSuggestedChannel from './NilakSuggestedChannel';

import styles from './NilakHome.module.scss';

type OwnProps = {
  isNarrow?: boolean;
};

type StateProps = {
  isLoading?: boolean;
  followingPosts?: ApiMessage[];
  suggestedPosts?: ApiMessage[];
  suggestedChannelIds?: string[];
};

type FeedMode = 'forYou' | 'following';
type FeedItem = { post: ApiMessage; isSuggested?: boolean };

// For you places one suggested post after every few posts from followed channels, never first
const SUGGESTION_EVERY = 3;
const PAGE_SIZE = 20;
const SUGGESTED_CHANNELS_SHOWN = 5;
const KEEP_READING_SHOWN = 3;
const FULL_PERCENT = 100;

const NilakHome = ({
  isNarrow, isLoading, followingPosts, suggestedPosts, suggestedChannelIds,
}: OwnProps & StateProps) => {
  const { loadNilakFeed } = getActions();
  const lang = useLang();
  const [mode, setMode] = useState<FeedMode>('forYou');
  const [shownCount, setShownCount] = useState(PAGE_SIZE);

  useEffect(() => {
    loadNilakFeed();
  }, []);

  const items = useMemo(() => {
    const following = followingPosts || [];
    if (mode === 'following') return following.map((post): FeedItem => ({ post }));

    const suggested = suggestedPosts || [];
    if (!following.length) return suggested.map((post): FeedItem => ({ post, isSuggested: true }));

    const result: FeedItem[] = [];
    let suggestedIndex = 0;
    following.forEach((post, i) => {
      result.push({ post });
      if ((i + 1) % SUGGESTION_EVERY === 0 && suggestedIndex < suggested.length) {
        result.push({ post: suggested[suggestedIndex++], isSuggested: true });
      }
    });
    return result;
  }, [mode, followingPosts, suggestedPosts]);

  const handleForYou = useLastCallback(() => {
    setMode('forYou');
    setShownCount(PAGE_SIZE);
  });

  const handleFollowing = useLastCallback(() => {
    setMode('following');
    setShownCount(PAGE_SIZE);
  });

  const handleShowMore = useLastCallback(() => {
    setShownCount((count) => count + PAGE_SIZE);
  });

  // Barruu and long posts started but not finished, read again whenever the reader closes
  const openedRead = useDerivedState(getOpenedRead);
  const unfinished = useMemo(() => {
    if (openedRead) return [];

    return (followingPosts || []).concat(suggestedPosts || [])
      .filter(getIsReadPost)
      .map((post) => ({ post, progress: getReadingProgress(post.chatId, post.id) }))
      .filter(({ progress }) => progress > 0 && progress < FULL_PERCENT)
      .slice(0, KEEP_READING_SHOWN);
  }, [followingPosts, suggestedPosts, openedRead]);

  const isEmpty = !isLoading && !items.length;

  return (
    <div className={styles.root}>
      <div className={styles.feed}>
        <div className={styles.top}>
          <div className={styles.segment}>
            <button
              type="button"
              className={buildClassName(styles.segmentItem, mode === 'forYou' && styles.segmentActive)}
              onClick={handleForYou}
            >
              {lang('NilakForYou')}
            </button>
            <button
              type="button"
              className={buildClassName(styles.segmentItem, mode === 'following' && styles.segmentActive)}
              onClick={handleFollowing}
            >
              {lang('NilakFollowing')}
            </button>
          </div>
        </div>

        <NilakStories />

        {items.slice(0, shownCount).map(({ post, isSuggested }) => (
          <NilakPostCard key={`${post.chatId}-${post.id}`} post={post} isSuggested={isSuggested} />
        ))}

        {isLoading && !items.length && (
          <div className={styles.status}>
            <Loading />
            {lang('NilakFeedLoading')}
          </div>
        )}
        {isEmpty && <div className={styles.status}>{lang('NilakFeedEmpty')}</div>}
        {items.length > shownCount && (
          <button type="button" className={styles.showMore} onClick={handleShowMore}>{lang('ShowMore')}</button>
        )}
      </div>

      {!isNarrow && (
        <aside className={styles.side}>
          {Boolean(suggestedChannelIds?.length) && (
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>{lang('NilakSuggestedTitle')}</h3>
              {suggestedChannelIds.slice(0, SUGGESTED_CHANNELS_SHOWN).map((id) => (
                <NilakSuggestedChannel key={id} chatId={id} />
              ))}
            </div>
          )}
          {Boolean(unfinished.length) && (
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>{lang('NilakKeepReading')}</h3>
              {unfinished.map(({ post, progress }) => (
                <button
                  key={`${post.chatId}-${post.id}`}
                  type="button"
                  className={styles.keepReading}
                  onClick={() => setOpenedRead({ chatId: post.chatId, messageId: post.id })}
                >
                  <span className={styles.keepReadingTitle}>
                    {renderText(getReadTitle(post))}
                  </span>
                  <span className={styles.keepReadingMeta}>
                    {lang('NilakReadPercent', { percent: Math.round(progress) })}
                  </span>
                  <span className={styles.keepReadingBar}>
                    <i className={styles.keepReadingFill} style={`width: ${progress}%`} />
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className={styles.note}>{lang('NilakApiNote')}</div>
        </aside>
      )}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({
    isLoading: global.nilakFeed?.isLoading,
    followingPosts: global.nilakFeed?.followingPosts,
    suggestedPosts: global.nilakFeed?.suggestedPosts,
    suggestedChannelIds: selectSimilarChannelIds(global, GLOBAL_SUGGESTED_CHANNELS_ID)?.similarChannelIds,
  }),
)(NilakHome));
