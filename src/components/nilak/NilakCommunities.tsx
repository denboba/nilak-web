import { memo, useCallback, useEffect } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { NILAK_ALL_COMMUNITIES_KEY } from '../../config';
import { selectChatFullInfo, selectNilakJoinedCommunityIds } from '../../global/selectors';
import { getOpenedCommunityId } from './helpers/nilakTab';

import useSelector, { useShallowSelector } from '../../hooks/data/useSelector';
import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';

import Loading from '../ui/Loading';
import NilakCommunity from './NilakCommunity';
import NilakCommunityRow from './NilakCommunityRow';
import NilakPostCard from './NilakPostCard';

import styles from './NilakCommunities.module.scss';

type StateProps = {
  posts?: ApiMessage[];
  isLoading?: boolean;
};

const MAX_POSTS = 40;

// The communities the person belongs to, then the newest posts of their channels; a community opens on its page
const NilakCommunities = ({ posts, isLoading }: StateProps) => {
  const { loadCommunities, loadFullCommunity, loadNilakCommunityFeed } = getActions();
  const lang = useLang();
  const openedCommunityId = useDerivedState(getOpenedCommunityId);
  const communityIds = useShallowSelector(selectNilakJoinedCommunityIds);

  // How many communities already have their linked chats, so the feed loads once they are known
  const selectLoadedCount = useCallback((global: GlobalState) => (
    communityIds.filter((id) => selectChatFullInfo(global, id)?.linkedPeers).length
  ), [communityIds]);
  const loadedCount = useSelector(selectLoadedCount);

  useEffect(() => {
    loadCommunities();
  }, []);

  useEffect(() => {
    communityIds.forEach((communityId) => loadFullCommunity({ communityId }));
  }, [communityIds]);

  useEffect(() => {
    if (loadedCount) loadNilakCommunityFeed();
  }, [loadedCount]);

  if (openedCommunityId) {
    return <NilakCommunity key={openedCommunityId} communityId={openedCommunityId} />;
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.pageTitle}>{lang('NilakCommunities')}</h2>
      {communityIds.length ? (
        <div className={styles.card}>
          {communityIds.map((id) => <NilakCommunityRow key={id} communityId={id} />)}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{lang('NilakCommunitiesEmptyTitle')}</div>
          <div className={styles.emptyText}>{lang('NilakCommunitiesEmptyText')}</div>
        </div>
      )}

      {Boolean(posts?.length) && (
        <>
          <h3 className={styles.sectionTitle}>{lang('NilakCommunitiesLatest')}</h3>
          {posts.slice(0, MAX_POSTS).map((post) => (
            <NilakPostCard key={`${post.chatId}-${post.id}`} post={post} />
          ))}
        </>
      )}
      {isLoading && !posts?.length && <div className={styles.status}><Loading /></div>}
    </div>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => {
    const feed = global.nilakCommunityFeed?.[NILAK_ALL_COMMUNITIES_KEY];

    return {
      posts: feed?.posts,
      isLoading: feed?.isLoading,
    };
  },
)(NilakCommunities));
