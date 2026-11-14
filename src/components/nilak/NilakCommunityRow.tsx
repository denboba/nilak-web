import { memo, useCallback, useMemo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiChatFullInfo } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { getMessageSummaryText } from '../../global/helpers/messageSummary';
import { selectChat, selectChatFullInfo, selectChatLastMessage } from '../../global/selectors';
import { formatCompactTimestamp, secondsToDate } from '../../util/localization/dateFormat';
import renderText from '../common/helpers/renderText';
import { setOpenedCommunityId } from './helpers/nilakTab';

import { useShallowSelector } from '../../hooks/data/useSelector';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';

import styles from './NilakCommunities.module.scss';

type OwnProps = {
  communityId: string;
};

type StateProps = {
  community?: ApiChat;
  fullInfo?: ApiChatFullInfo;
};

// A community in the Communities tab: its newest message among the chats the person is in
const NilakCommunityRow = ({ community, fullInfo }: OwnProps & StateProps) => {
  const lang = useLang();

  const lastMessagesSelector = useCallback((global: GlobalState) => (
    fullInfo?.linkedPeers?.map(({ peerId }) => selectChatLastMessage(global, peerId))
  ), [fullInfo?.linkedPeers]);
  const lastMessages = useShallowSelector(lastMessagesSelector);

  const newest = useMemo(() => {
    return lastMessages?.reduce((best, message) => (
      message && (!best || message.date > best.date) ? message : best
    ), undefined);
  }, [lastMessages]);

  const peerSelector = useCallback((global: GlobalState) => (
    newest ? selectChat(global, newest.chatId) : undefined
  ), [newest]);
  const newestChat = useShallowSelector(peerSelector);

  const handleOpen = useLastCallback(() => {
    if (community) setOpenedCommunityId(community.id);
  });

  if (!community) return undefined;

  const chatsCount = fullInfo?.linkedPeers?.length;
  const preview = newest
    ? `${newestChat?.title ? `${newestChat.title} · ` : ''}${getMessageSummaryText(lang, newest, undefined)}`
    : chatsCount ? lang('CommunityWithChats', { count: chatsCount }, { pluralValue: chatsCount }) : undefined;

  return (
    <button type="button" className={styles.row} onClick={handleOpen}>
      <Avatar className={styles.rowAvatar} peer={community} size="medium" />
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{renderText(community.title)}</span>
        {preview && <span className={styles.rowPreview}>{renderText(preview)}</span>}
      </span>
      {newest && (
        <span className={styles.rowTime}>{formatCompactTimestamp(lang, secondsToDate(newest.date))}</span>
      )}
    </button>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { communityId }): Complete<StateProps> => ({
    community: selectChat(global, communityId),
    fullInfo: selectChatFullInfo(global, communityId),
  }),
)(NilakCommunityRow));
