import { memo, useEffect, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiChatFullInfo, ApiMessage } from '../../api/types';

import { selectChat, selectChatFullInfo } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';
import { setNilakTab, setOpenedCommunityId } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';
import Loading from '../ui/Loading';
import Switcher from '../ui/Switcher';
import NilakPostCard from './NilakPostCard';

import styles from './NilakCommunities.module.scss';

type OwnProps = {
  communityId: string;
};

type StateProps = {
  community?: ApiChat;
  fullInfo?: ApiChatFullInfo;
  posts?: ApiMessage[];
  isLoading?: boolean;
};

type Section = 'feed' | 'about';

// A Telegram Community as a Nilak page: the posts of its channels, and About. Its chats open in Telegram's own
// community panel beside the chat list, so joining and requests stay Telegram's.
const NilakCommunity = ({
  communityId, community, fullInfo, posts, isLoading,
}: OwnProps & StateProps) => {
  const { loadFullCommunity, loadNilakCommunityFeed, openChat, toggleCommunityCollapsed } = getActions();
  const lang = useLang();
  const [section, setSection] = useState<Section>('feed');

  useEffect(() => {
    loadFullCommunity({ communityId });
  }, [communityId]);

  useEffect(() => {
    if (fullInfo?.linkedPeers) loadNilakCommunityFeed({ communityId });
  }, [communityId, fullInfo?.linkedPeers]);

  const handleBack = useLastCallback(() => {
    setOpenedCommunityId(undefined);
  });

  const handleOpenChats = useLastCallback(() => {
    setNilakTab('chats');
    openChat({ id: communityId });
  });

  const handleToggleCollapsed = useLastCallback(() => {
    toggleCommunityCollapsed({ communityId });
  });

  if (!community) return undefined;

  const isCollapsed = Boolean(community.isCollapsedInDialogs);
  const chatsCount = fullInfo?.linkedPeers?.length || 0;
  const subtitle = chatsCount
    ? lang('CommunityWithChats', { count: chatsCount }, { pluralValue: chatsCount })
    : lang('CommunityOpenPanel');

  function renderFeed() {
    if (posts?.length) {
      return posts.map((post) => <NilakPostCard key={`${post.chatId}-${post.id}`} post={post} />);
    }
    if (isLoading || !fullInfo) return <div className={styles.status}><Loading /></div>;

    return <div className={styles.status}>{lang('NilakCommunityNoPosts')}</div>;
  }

  function renderAbout() {
    return (
      <>
        {fullInfo?.about && (
          <div className={buildClassName(styles.card, styles.about)}>{renderText(fullInfo.about)}</div>
        )}
        <div className={styles.card}>
          <button type="button" className={styles.aboutRow} onClick={handleOpenChats}>
            <Icon name="group" className={styles.aboutIcon} />
            <span className={styles.aboutLabel}>{subtitle}</span>
            <Icon name="next" className={styles.aboutChevron} />
          </button>
          <button type="button" className={styles.aboutRow} onClick={handleToggleCollapsed}>
            <Icon name="folder" className={styles.aboutIcon} />
            <span className={styles.aboutLabel}>{lang('CommunityShowAsOneChat')}</span>
            <Switcher
              label={lang('CommunityShowAsOneChat')}
              checked={isCollapsed}
              inactive
              noAnimation
            />
          </button>
        </div>
        <div className={styles.note}>{lang('CommunityShowAsOneChatHint')}</div>
      </>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} aria-label={lang('Back')} onClick={handleBack}>
          <Icon name="arrow-left" />
        </button>
        <Avatar className={styles.headerAvatar} peer={community} size="medium" />
        <div className={styles.headerText}>
          <div className={styles.headerTitle}>{renderText(community.title)}</div>
          <div className={styles.headerSubtitle}>{subtitle}</div>
        </div>
      </div>
      <div className={styles.tabs}>
        <button
          type="button"
          className={buildClassName(styles.tab, section === 'feed' && styles.tabActive)}
          onClick={() => setSection('feed')}
        >
          {lang('NilakCommunityFeed')}
        </button>
        <button type="button" className={styles.tab} onClick={handleOpenChats}>
          {lang('Chats')}
        </button>
        <button
          type="button"
          className={buildClassName(styles.tab, section === 'about' && styles.tabActive)}
          onClick={() => setSection('about')}
        >
          {lang('NilakCommunityAbout')}
        </button>
      </div>
      {section === 'feed' ? renderFeed() : renderAbout()}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { communityId }): Complete<StateProps> => {
    const feed = global.nilakCommunityFeed?.[communityId];

    return {
      community: selectChat(global, communityId),
      fullInfo: selectChatFullInfo(global, communityId),
      posts: feed?.posts,
      isLoading: feed?.isLoading,
    };
  },
)(NilakCommunity));
