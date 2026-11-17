import { memo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiUser } from '../../api/types';
import { StoryViewerOrigin } from '../../types';

import { getPeerTitle } from '../../global/helpers/peers';
import { selectNilakLiveChannelIds } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import useLang from '../../hooks/useLang';

import Avatar from '../common/Avatar';

import styles from './NilakHome.module.scss';

type StateProps = {
  orderedPeerIds: string[];
  liveChannelIds: string[];
  usersById: Record<string, ApiUser>;
  chatsById: Record<string, ApiChat>;
};

// The stories row at the top of Home, like Nilak for Android: followed channels that are live come first and join
// the live stream; the other avatars open the stories, then the next ones
const NilakStories = ({
  orderedPeerIds, liveChannelIds, usersById, chatsById,
}: StateProps) => {
  const { joinGroupCall } = getActions();
  const lang = useLang();

  if (!orderedPeerIds.length && !liveChannelIds.length) return undefined;

  return (
    <div className={buildClassName(styles.stories, 'no-scrollbar')}>
      {liveChannelIds.map((chatId) => {
        const chat = chatsById[chatId];
        if (!chat) return undefined;

        return (
          <button
            key={`live-${chatId}`}
            type="button"
            className={buildClassName(styles.story, styles.storyLive)}
            onClick={() => joinGroupCall({ chatId })}
            aria-label={`${chat.title}, ${lang('NilakLiveBadge')}`}
          >
            <span className={styles.liveRing}>
              <Avatar peer={chat} size="large" />
              <span className={styles.liveTag}>{lang('NilakLiveBadge')}</span>
            </span>
            <span className={styles.storyName}>{renderText(chat.title)}</span>
          </button>
        );
      })}
      {orderedPeerIds.map((peerId) => {
        const peer = usersById[peerId] || chatsById[peerId];
        if (!peer) return undefined;

        return (
          <div key={peerId} className={styles.story}>
            <Avatar
              peer={peer}
              size="large"
              withStory
              storyViewerMode="full"
              storyViewerOrigin={StoryViewerOrigin.StoryRibbon}
            />
            <span className={styles.storyName}>{renderText(getPeerTitle(lang, peer) || '')}</span>
          </div>
        );
      })}
    </div>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => ({
    orderedPeerIds: global.stories.orderedPeerIds.active,
    liveChannelIds: selectNilakLiveChannelIds(global),
    usersById: global.users.byId,
    chatsById: global.chats.byId,
  }),
)(NilakStories));
