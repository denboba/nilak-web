import { memo, useEffect, useState } from '../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../global';

import type { ApiChat, ApiMessage, ApiUser, ApiUserFullInfo } from '../../api/types';
import { SettingsScreens } from '../../types';

import {
  getMainUsername, getMessagePhoto, getMessageVideo, getPhotoMediaHash, getUserFullName, getVideoMediaHash,
  isChatChannel } from '../../global/helpers';
import { getMessageSummaryText } from '../../global/helpers/messageSummary';
import {
  selectChat,
  selectNilakFollowedChannelIds,
  selectNilakJoinedCommunityIds,
  selectNilakManagedChatIds,
  selectNilakProfileChannel,
  selectUser,
  selectUserFullInfo,
} from '../../global/selectors';
import { copyTextToClipboard } from '../../util/clipboard';
import renderText from '../common/helpers/renderText';
import { setNilakTab } from './helpers/nilakTab';

import { useShallowSelector } from '../../hooks/data/useSelector';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useMedia from '../../hooks/useMedia';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';
import Loading from '../ui/Loading';

import styles from './NilakProfile.module.scss';

type StateProps = {
  user?: ApiUser;
  fullInfo?: ApiUserFullInfo;
  channel?: ApiChat;
  posts?: ApiMessage[];
  postsCount?: number;
  isLoading?: boolean;
};

type TileProps = {
  message: ApiMessage;
};

type PeerTileProps = {
  chatId: string;
};

type PeerStateProps = {
  chat?: ApiChat;
};

const TELEGRAM_LINK = 'https://t.me/';

// The person's own profile, like Nilak for Android: photo and numbers, Edit and Share, their channels and groups,
// their communities, and their posts from their personal channel
const NilakProfile = ({
  user, fullInfo, channel, posts, postsCount, isLoading,
}: StateProps) => {
  const {
    loadFullUser, loadNilakProfile, openSettingsScreen, openChatWithInfo, showNotification,
  } = getActions();
  const lang = useLang();
  const [isManageOpen, setIsManageOpen] = useState(false);

  const followedIds = useShallowSelector(selectNilakFollowedChannelIds);
  const managedIds = useShallowSelector(selectNilakManagedChatIds);
  const communityIds = useShallowSelector(selectNilakJoinedCommunityIds);

  const userId = user?.id;
  const channelId = channel?.id;

  useEffect(() => {
    if (userId) loadFullUser({ userId });
  }, [userId]);

  useEffect(() => {
    if (channelId) loadNilakProfile();
  }, [channelId]);

  const openSettings = useLastCallback((screen: SettingsScreens) => {
    setNilakTab('chats');
    openSettingsScreen({ screen });
  });

  const handleEdit = useLastCallback(() => openSettings(SettingsScreens.EditProfile));
  const handleSettings = useLastCallback(() => openSettings(SettingsScreens.Main));

  // Telegram's own profile, beside Saved Messages, as the Profile tab opened before
  const handleAccount = useLastCallback(() => {
    setNilakTab('chats');
    openChatWithInfo({ id: getGlobal().currentUserId!, shouldReplaceHistory: true, isOwnProfile: true });
  });

  const handleShare = useLastCallback(() => {
    const username = user && getMainUsername(user);
    if (!username) {
      handleEdit();
      return;
    }
    copyTextToClipboard(`${TELEGRAM_LINK}${username}`);
    showNotification({ message: lang('LinkCopied') });
  });

  const handleToggleManage = useLastCallback(() => setIsManageOpen(!isManageOpen));

  const handleSeeAllCommunities = useLastCallback(() => setNilakTab('communities'));

  if (!user) return undefined;

  const username = getMainUsername(user);
  const followers = channel?.membersCount ? Math.max(0, channel.membersCount - 1) : undefined;

  function renderCount(value: number | undefined, label: string, onClick?: NoneToVoidFunction) {
    return (
      <button type="button" className={styles.count} onClick={onClick} disabled={!onClick}>
        <span className={styles.countValue}>{value !== undefined ? lang.number(value) : '–'}</span>
        <span className={styles.countLabel}>{label}</span>
      </button>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <h2 className={styles.username}>{username || getUserFullName(lang, user)}</h2>
        <button
          type="button"
          className={styles.barButton}
          onClick={handleAccount}
          aria-label={lang('NilakProfileAccount')}
        >
          <Icon name="user" />
        </button>
        <button type="button" className={styles.barButton} onClick={handleSettings} aria-label={lang('Settings')}>
          <Icon name="settings" />
        </button>
      </div>

      <div className={styles.header}>
        <Avatar className={styles.avatar} peer={user} size={84} withStory />
        <div className={styles.counts}>
          {renderCount(postsCount, lang('NilakProfilePosts'))}
          {renderCount(followers, lang('NilakProfileFollowers'))}
          {renderCount(followedIds.length, lang('NilakFollowing'))}
        </div>
      </div>
      <div className={styles.name}>{renderText(getUserFullName(lang, user) || '')}</div>
      {fullInfo?.bio && <div className={styles.bio}>{renderText(fullInfo.bio, ['br', 'links', 'emoji'])}</div>}

      <div className={styles.buttons}>
        <button type="button" className={styles.primaryButton} onClick={handleEdit}>{lang('NilakEditProfile')}</button>
        <button type="button" className={styles.secondaryButton} onClick={handleShare}>
          {lang('NilakShareProfile')}
        </button>
      </div>

      <div className={styles.card}>
        <button type="button" className={styles.manageRow} onClick={handleToggleManage} aria-expanded={isManageOpen}>
          <span className={styles.manageIcon}><Icon name="channel" /></span>
          <span className={styles.manageTitle}>{lang('NilakManageChats')}</span>
          {Boolean(managedIds.length) && <span className={styles.manageCount}>{managedIds.length}</span>}
          <Icon className={styles.manageArrow} name={isManageOpen ? 'up' : 'down'} />
        </button>
        {isManageOpen && managedIds.map((id) => <NilakPeerRow key={id} chatId={id} />)}
      </div>

      {Boolean(communityIds.length) && (
        <>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{lang('NilakCommunities')}</h3>
            <button type="button" className={styles.seeAll} onClick={handleSeeAllCommunities}>
              {lang('NilakSeeAll')}
            </button>
          </div>
          <div className={styles.communities}>
            {communityIds.map((id) => (
              <NilakCommunityTile key={id} chatId={id} />
            ))}
          </div>
        </>
      )}

      <div className={styles.tabs}>
        <span className={styles.tabActive}>{lang('NilakProfilePosts')}</span>
      </div>
      {posts?.length ? (
        <div className={styles.grid}>
          {posts.map((post) => <NilakProfileTile key={`${post.chatId}-${post.id}`} message={post} />)}
        </div>
      ) : isLoading ? (
        <div className={styles.status}><Loading /></div>
      ) : (
        <div className={styles.status}>{lang('NilakProfileNoPosts')}</div>
      )}
    </div>
  );
};

// A post in the profile grid: its photo or video frame, or its text; a tap opens it in the channel
const NilakProfileTileRaw = ({ message }: TileProps) => {
  const { focusMessage } = getActions();
  const lang = useLang();
  const photo = getMessagePhoto(message);
  const video = getMessageVideo(message);
  const mediaHash = photo ? getPhotoMediaHash(photo, 'inline')
    : video && !video.isRound ? getVideoMediaHash(video, 'pictogram') : undefined;
  const mediaUrl = useMedia(mediaHash);
  const thumbUrl = (photo || video)?.thumbnail?.dataUri;

  const handleClick = useLastCallback(() => {
    setNilakTab('chats');
    focusMessage({ chatId: message.chatId, messageId: message.id });
  });

  const image = mediaUrl || thumbUrl;

  return (
    <button type="button" className={styles.tile} onClick={handleClick}>
      {image ? (
        <img className={styles.tileImage} src={image} alt="" draggable={false} />
      ) : (
        <span className={styles.tileText}>{renderText(getMessageSummaryText(lang, message, undefined))}</span>
      )}
      {video && !video.isRound && <Icon className={styles.tileVideo} name="play" />}
    </button>
  );
};

const NilakProfileTile = memo(NilakProfileTileRaw);

// One of the person's channels or groups: a tap opens it
const NilakPeerRowRaw = ({ chat }: PeerTileProps & PeerStateProps) => {
  const { openChat } = getActions();
  const lang = useLang();

  const handleClick = useLastCallback(() => {
    if (!chat) return;
    setNilakTab('chats');
    openChat({ id: chat.id });
  });

  if (!chat) return undefined;

  return (
    <button type="button" className={styles.peerRow} onClick={handleClick}>
      <Avatar peer={chat} size="small" />
      <span className={styles.peerText}>
        <span className={styles.peerTitle}>{renderText(chat.title)}</span>
        {chat.membersCount !== undefined && (
          <span className={styles.peerSubtitle}>
            {isChatChannel(chat)
              ? lang('Subscribers', { count: lang.number(chat.membersCount) }, { pluralValue: chat.membersCount })
              : lang('Participants', { count: lang.number(chat.membersCount) }, { pluralValue: chat.membersCount })}
          </span>
        )}
      </span>
    </button>
  );
};

const NilakPeerRow = memo(withGlobal<PeerTileProps>(
  (global, { chatId }): Complete<PeerStateProps> => ({ chat: selectChat(global, chatId) }),
)(NilakPeerRowRaw));

// One of the person's communities: a tap opens Telegram's community panel
const NilakCommunityTileRaw = ({ chat }: PeerTileProps & PeerStateProps) => {
  const { openCommunityPanel } = getActions();

  const handleClick = useLastCallback(() => {
    if (!chat) return;
    setNilakTab('chats');
    openCommunityPanel({ communityId: chat.id });
  });

  if (!chat) return undefined;

  return (
    <button type="button" className={styles.communityTile} onClick={handleClick}>
      <Avatar peer={chat} size="large" />
      <span className={styles.communityName}>{renderText(chat.title)}</span>
    </button>
  );
};

const NilakCommunityTile = memo(withGlobal<PeerTileProps>(
  (global, { chatId }): Complete<PeerStateProps> => ({ chat: selectChat(global, chatId) }),
)(NilakCommunityTileRaw));

export default memo(withGlobal(
  (global): Complete<StateProps> => {
    const userId = global.currentUserId;

    return {
      user: userId ? selectUser(global, userId) : undefined,
      fullInfo: userId ? selectUserFullInfo(global, userId) : undefined,
      channel: userId ? selectNilakProfileChannel(global, userId) : undefined,
      posts: global.nilakProfile?.posts,
      postsCount: global.nilakProfile?.postsCount,
      isLoading: global.nilakProfile?.isLoading,
    };
  },
)(NilakProfile));
