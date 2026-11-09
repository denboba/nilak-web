import {
  memo, useEffect, useMemo, useState,
} from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiMessage, ApiUser } from '../../api/types';
import { LeftColumnContent, SettingsScreens } from '../../types';

import { TME_LINK_PREFIX } from '../../config';
import { getMainUsername, getUserFullName, isChatChannel } from '../../global/helpers';
import {
  selectChat, selectUser, selectUserFullInfo,
} from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { copyTextToClipboard } from '../../util/clipboard';
import { formatIntegerCompact } from '../../util/textFormat';
import renderText from '../common/helpers/renderText';
import { setNilakTab } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';
import Loading from '../ui/Loading';
import NilakGridTile from './NilakGridTile';

import styles from './NilakProfile.module.scss';

type OwnProps = {
  isNarrow?: boolean;
};

type StateProps = {
  user?: ApiUser;
  bio?: string;
  personalChannelId?: string;
  channel?: ApiChat;
  chatsById: Record<string, ApiChat>;
  activeChatIds?: string[];
  archivedChatIds?: string[];
  isLoading?: boolean;
  posts?: ApiMessage[];
  postsCount?: number;
  saved?: ApiMessage[];
};

type ProfileTab = 'posts' | 'reels' | 'saved';

const PROFILE_TABS: { tab: ProfileTab; langKey: 'NilakPosts' | 'NilakReels' | 'NilakSaved' }[] = [
  { tab: 'posts', langKey: 'NilakPosts' },
  { tab: 'reels', langKey: 'NilakReels' },
  { tab: 'saved', langKey: 'NilakSaved' },
];

// The own profile, like in Nilak for Android: the personal channel is where a person's posts live
const NilakProfile = ({
  isNarrow, user, bio, personalChannelId, channel, chatsById, activeChatIds, archivedChatIds,
  isLoading, posts, postsCount, saved,
}: OwnProps & StateProps) => {
  const {
    loadFullUser, loadNilakProfile, openLeftColumnContent, openSettingsScreen, showNotification, openChat,
  } = getActions();
  const lang = useLang();
  const [tab, setTab] = useState<ProfileTab>('posts');

  const userId = user?.id;
  useEffect(() => {
    if (userId) loadFullUser({ userId });
  }, [userId]);

  useEffect(() => {
    loadNilakProfile();
  }, [personalChannelId]);

  const followingCount = useMemo(() => (
    (activeChatIds || []).concat(archivedChatIds || []).filter((id) => {
      const chat = chatsById[id];
      return chat && isChatChannel(chat) && !chat.isNotJoined;
    }).length
  ), [activeChatIds, archivedChatIds, chatsById]);

  const tiles = useMemo(() => {
    if (tab === 'saved') return saved || [];
    if (tab === 'reels') return (posts || []).filter((post) => post.content.video && !post.content.video.isRound);
    return posts || [];
  }, [tab, posts, saved]);

  const username = user && getMainUsername(user);

  const handleEdit = useLastCallback(() => {
    setNilakTab('chats');
    openLeftColumnContent({ contentKey: LeftColumnContent.Settings });
    openSettingsScreen({ screen: SettingsScreens.EditProfile });
  });

  const handleShare = useLastCallback(() => {
    if (username && copyTextToClipboard(`${TME_LINK_PREFIX}${username}`)) {
      showNotification({ message: { key: 'LinkCopied' } });
    }
  });

  const handleOpenChannel = useLastCallback(() => {
    if (!channel) return;

    setNilakTab('chats');
    openChat({ id: channel.id });
  });

  if (!user) return undefined;

  function renderCounter(value: number | undefined, langKey: 'NilakPosts' | 'NilakFollowersTitle' | 'NilakFollowing') {
    return (
      <div className={styles.counter}>
        <span className={styles.counterValue}>{value !== undefined ? formatIntegerCompact(lang, value) : '–'}</span>
        <span className={styles.counterLabel}>{lang(langKey)}</span>
      </div>
    );
  }

  function renderEmpty() {
    if (isLoading) return <div className={styles.empty}><Loading /></div>;
    if (tab === 'saved') return <div className={styles.empty}>{lang('NilakSavedEmpty')}</div>;
    if (!channel) return <div className={styles.empty}>{lang('NilakProfileNoChannel')}</div>;

    return <div className={styles.empty}>{lang('NilakProfileNoPosts')}</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.top}>
          <Avatar className={styles.avatar} peer={user} size={isNarrow ? 'giant' : 'jumbo'} withStory />
          {renderCounter(channel ? postsCount : undefined, 'NilakPosts')}
          {renderCounter(channel?.membersCount, 'NilakFollowersTitle')}
          {renderCounter(followingCount, 'NilakFollowing')}
        </div>
        <div className={styles.name}>{renderText(getUserFullName(lang, user) || '')}</div>
        {username && (
          <div className={styles.username}>
            @
            {username}
          </div>
        )}
        {bio && <div className={styles.bio} dir="auto">{renderText(bio, ['emoji', 'br', 'links'])}</div>}
        {channel && (
          <button type="button" className={styles.channelLink} onClick={handleOpenChannel}>
            {lang('NilakProfileChannel', { title: channel.title })}
          </button>
        )}
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={handleEdit}>{lang('NilakEditProfile')}</button>
          {username && (
            <button type="button" className={styles.button} onClick={handleShare}>{lang('NilakShareProfile')}</button>
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        {PROFILE_TABS.map(({ tab: itemTab, langKey }) => (
          <button
            key={itemTab}
            type="button"
            className={buildClassName(styles.tab, tab === itemTab && styles.tabActive)}
            onClick={() => setTab(itemTab)}
          >
            {lang(langKey)}
          </button>
        ))}
      </div>

      {tiles.length ? (
        <div className={styles.grid}>
          {tiles.map((post) => <NilakGridTile key={`${post.chatId}-${post.id}`} post={post} />)}
        </div>
      ) : renderEmpty()}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => {
    const { currentUserId } = global;
    const user = currentUserId ? selectUser(global, currentUserId) : undefined;
    const fullInfo = currentUserId ? selectUserFullInfo(global, currentUserId) : undefined;
    const personalChannelId = fullInfo?.personalChannelId;
    const profile = global.nilakProfile;

    return {
      user,
      bio: fullInfo?.bio,
      personalChannelId,
      channel: personalChannelId ? selectChat(global, personalChannelId) : undefined,
      chatsById: global.chats.byId,
      activeChatIds: global.chats.listIds.active,
      archivedChatIds: global.chats.listIds.archived,
      isLoading: profile?.isLoading,
      posts: profile?.posts,
      postsCount: profile?.postsCount,
      saved: profile?.saved,
    };
  },
)(NilakProfile));
