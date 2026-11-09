import {
  memo, useEffect, useMemo, useRef, useState,
} from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';

import { GLOBAL_SUGGESTED_CHANNELS_ID } from '../../config';
import { selectSimilarChannelIds } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Loading from '../ui/Loading';
import NilakReel from './NilakReel';

import styles from './NilakReels.module.scss';

type StateProps = {
  isLoading?: boolean;
  posts?: ApiMessage[];
  suggestedChannelIds?: string[];
};

type ReelsMode = 'forYou' | 'following';

// Reels this far from the visible one stay mounted, so scrolling is smooth without keeping every video
const MOUNTED_DISTANCE = 2;
// More reels load when this few are left below the visible one
const LOAD_MORE_THRESHOLD = 3;

const NilakReels = ({ isLoading, posts, suggestedChannelIds }: StateProps) => {
  const { loadNilakReels } = getActions();
  const lang = useLang();
  const scrollRef = useRef<HTMLDivElement>();
  const [mode, setMode] = useState<ReelsMode>('forYou');
  const [activeIndex, setActiveIndex] = useState(0);
  // Browsers only autoplay muted video; the first tap on the sound button turns it on for every reel
  const [isMuted, , toggleMute] = useFlag(true);

  useEffect(() => {
    loadNilakReels();
  }, []);

  const reels = useMemo(() => {
    if (mode === 'forYou' || !suggestedChannelIds) return posts || [];

    const suggested = new Set(suggestedChannelIds);
    return (posts || []).filter((post) => !suggested.has(post.chatId));
  }, [mode, posts, suggestedChannelIds]);

  useEffect(() => {
    if (reels.length && activeIndex >= reels.length - LOAD_MORE_THRESHOLD) {
      loadNilakReels({ isMore: true });
    }
  }, [activeIndex, reels.length]);

  const handleScroll = useLastCallback(() => {
    const container = scrollRef.current!;
    setActiveIndex(Math.round(container.scrollTop / container.clientHeight));
  });

  const switchMode = useLastCallback((newMode: ReelsMode) => {
    setMode(newMode);
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
  });

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={buildClassName(styles.tab, mode === 'following' && styles.tabActive)}
          onClick={() => switchMode('following')}
        >
          {lang('NilakFollowing')}
        </button>
        <button
          type="button"
          className={buildClassName(styles.tab, mode === 'forYou' && styles.tabActive)}
          onClick={() => switchMode('forYou')}
        >
          {lang('NilakForYou')}
        </button>
      </div>

      <div ref={scrollRef} className={styles.scroll} onScroll={handleScroll}>
        {reels.map((post, index) => (
          <div key={`${post.chatId}-${post.id}`} className={styles.slot}>
            {Math.abs(index - activeIndex) <= MOUNTED_DISTANCE && (
              <NilakReel post={post} isActive={index === activeIndex} isMuted={isMuted} onToggleMute={toggleMute} />
            )}
          </div>
        ))}
        {isLoading && <div className={buildClassName(styles.slot, styles.status)}><Loading color="white" /></div>}
        {!isLoading && !reels.length && (
          <div className={buildClassName(styles.slot, styles.status)}>{lang('NilakReelsEmpty')}</div>
        )}
      </div>
    </div>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => ({
    isLoading: global.nilakReels?.isLoading,
    posts: global.nilakReels?.posts,
    suggestedChannelIds: selectSimilarChannelIds(global, GLOBAL_SUGGESTED_CHANNELS_ID)?.similarChannelIds,
  }),
)(NilakReels));
