import { memo, useCallback, useEffect, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiChatFullInfo, ApiMessage } from '../../api/types';
import type { GlobalState } from '../../global/types';
import { MAIN_THREAD_ID } from '../../api/types';

import { getMessageSummaryText } from '../../global/helpers/messageSummary';
import { getIsChatMuted } from '../../global/helpers/notifications';
import {
  selectChat,
  selectChatFullInfo,
  selectChatLastMessage,
  selectNotifyDefaults,
  selectNotifyException,
  selectTopicsInfo,
} from '../../global/selectors';
import { selectThreadReadState } from '../../global/selectors/threads';
import buildClassName from '../../util/buildClassName';
import { formatCompactTimestamp, secondsToDate } from '../../util/localization/dateFormat';
import renderText from '../common/helpers/renderText';

import { useShallowSelector } from '../../hooks/data/useSelector';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useCommunityMembers from '../left/main/hooks/useCommunityMembers';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';

import styles from './NilakCommunities.module.scss';

type OwnProps = {
  communityId: string;
  isOnly?: boolean;
};

type StateProps = {
  community?: ApiChat;
  fullInfo?: ApiChatFullInfo;
};

type ChatOwnProps = {
  chatId: string;
};

type ChatStateProps = {
  chat?: ApiChat;
  lastMessage?: ApiMessage;
  unreadCount?: number;
  isMuted?: boolean;
  newestQuestion?: string;
};

const OPEN_STORAGE_KEY = 'nilak_community_open_';
// The forum's first topic, "General", is not a question
const GENERAL_TOPIC_ID = 1;

// A community in the Communities tab: a card whose header opens Telegram's community panel and whose arrow
// shows the chats inside, with their newest message and unread count, and the Ask board's newest question
const NilakCommunityRow = ({ communityId, isOnly, community, fullInfo }: OwnProps & StateProps) => {
  const { openCommunityPanel, openChat, loadTopics } = getActions();
  const lang = useLang();

  const { members, unreadCount, lastMessageChatId } = useCommunityMembers(fullInfo?.linkedPeers) || {};

  const newestSelector = useCallback((global: GlobalState) => (
    lastMessageChatId ? selectChatLastMessage(global, lastMessageChatId) : undefined
  ), [lastMessageChatId]);
  const newest = useShallowSelector(newestSelector);

  const [savedOpen] = useState(() => localStorage.getItem(OPEN_STORAGE_KEY + communityId) || undefined);
  const [isOpen, setIsOpen] = useState(savedOpen ? savedOpen === '1' : Boolean(isOnly || unreadCount));

  const boardId = members?.find(({ peer }) => peer.isForum && !peer.isMonoforum)?.id;

  // Without a saved choice, a community opens once its unread messages are known
  useEffect(() => {
    if (!savedOpen && unreadCount) setIsOpen(true);
  }, [savedOpen, unreadCount]);

  useEffect(() => {
    if (isOpen && boardId) loadTopics({ chatId: boardId });
  }, [isOpen, boardId]);

  const handleOpenCommunity = useLastCallback(() => {
    openCommunityPanel({ communityId });
  });

  const handleToggle = useLastCallback(() => {
    localStorage.setItem(OPEN_STORAGE_KEY + communityId, isOpen ? '0' : '1');
    setIsOpen(!isOpen);
  });

  const handleAsk = useLastCallback(() => {
    if (boardId) openChat({ id: boardId });
  });

  if (!community) return undefined;

  const chatsCount = fullInfo?.linkedPeers?.length;
  const chatsText = chatsCount
    ? lang('CommunityWithChats', { count: chatsCount }, { pluralValue: chatsCount })
    : undefined;
  const newestChat = newest && members?.find(({ id }) => id === newest.chatId)?.peer;
  const subtitle = !isOpen && newest
    ? `${newestChat ? `${newestChat.title} · ` : ''}${getMessageSummaryText(lang, newest, undefined)}`
    : chatsText;

  return (
    <div className={styles.communityCard}>
      <div className={buildClassName(styles.communityHeader, isOpen && styles.communityHeaderOpen)}>
        <button type="button" className={styles.communityMain} onClick={handleOpenCommunity}>
          <Avatar className={styles.rowAvatar} peer={community} size="medium" />
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>{renderText(community.title)}</span>
            {subtitle && <span className={styles.rowPreview}>{renderText(subtitle)}</span>}
          </span>
          {Boolean(unreadCount) && <span className={styles.badge}>{unreadCount}</span>}
        </button>
        <button
          type="button"
          className={styles.chevron}
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-label={lang(isOpen ? 'NilakHideChats' : 'NilakShowChats')}
        >
          <Icon name={isOpen ? 'up' : 'down'} />
        </button>
      </div>
      {isOpen && (
        <div className={styles.communityChats}>
          {members?.map(({ id }) => (
            <NilakCommunityChat key={id} chatId={id} />
          ))}
          {boardId && (
            <div className={styles.communityActions}>
              <button type="button" className={styles.communityAction} onClick={handleAsk}>
                <Icon name="forums" />
                {lang('NilakAskShort')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// One chat of an open community: its photo, newest message (the newest question for the Ask board) and unread count
const NilakCommunityChatRaw = ({
  chatId, chat, lastMessage, unreadCount, isMuted, newestQuestion,
}: ChatOwnProps & ChatStateProps) => {
  const { openChat } = getActions();
  const lang = useLang();

  const handleClick = useLastCallback(() => {
    openChat({ id: chatId });
  });

  if (!chat) return undefined;

  const lastText = lastMessage ? getMessageSummaryText(lang, lastMessage, undefined) : undefined;
  const preview = newestQuestion ? `“${newestQuestion}”` : lastText;

  return (
    <button type="button" className={styles.communityChat} onClick={handleClick}>
      <Avatar className={styles.rowAvatar} peer={chat} size="small" />
      <span className={styles.rowText}>
        <span className={styles.communityChatTitle}>{renderText(chat.title)}</span>
        {preview && <span className={styles.rowPreview}>{renderText(preview)}</span>}
      </span>
      <span className={styles.communityChatSide}>
        {lastMessage && (
          <span className={styles.rowTime}>{formatCompactTimestamp(lang, secondsToDate(lastMessage.date))}</span>
        )}
        {Boolean(unreadCount) && (
          <span className={buildClassName(styles.badge, isMuted && styles.badgeMuted)}>{unreadCount}</span>
        )}
      </span>
    </button>
  );
};

const NilakCommunityChat = memo(withGlobal<ChatOwnProps>(
  (global, { chatId }): Complete<ChatStateProps> => {
    const chat = selectChat(global, chatId);
    const topicsInfo = chat?.isForum ? selectTopicsInfo(global, chatId) : undefined;
    const newestTopicId = topicsInfo?.listedTopicIds?.find((id) => id !== GENERAL_TOPIC_ID);

    return {
      chat,
      lastMessage: selectChatLastMessage(global, chatId),
      unreadCount: selectThreadReadState(global, chatId, MAIN_THREAD_ID)?.unreadCount,
      isMuted: chat
        ? getIsChatMuted(chat, selectNotifyDefaults(global), selectNotifyException(global, chatId))
        : undefined,
      newestQuestion: newestTopicId ? topicsInfo?.topicsById[newestTopicId]?.title : undefined,
    };
  },
)(NilakCommunityChatRaw));

export default memo(withGlobal<OwnProps>(
  (global, { communityId }): Complete<StateProps> => ({
    community: selectChat(global, communityId),
    fullInfo: selectChatFullInfo(global, communityId),
  }),
)(NilakCommunityRow));
