import { memo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiUser } from '../../api/types';
import { StoryViewerOrigin } from '../../types';

import { getPeerTitle } from '../../global/helpers/peers';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import useLang from '../../hooks/useLang';

import Avatar from '../common/Avatar';

import styles from './NilakHome.module.scss';

type StateProps = {
  orderedPeerIds: string[];
  usersById: Record<string, ApiUser>;
  chatsById: Record<string, ApiChat>;
};

// The stories row at the top of Home, like Nilak for Android; the avatar opens the stories, then the next ones
const NilakStories = ({ orderedPeerIds, usersById, chatsById }: StateProps) => {
  const lang = useLang();

  if (!orderedPeerIds.length) return undefined;

  return (
    <div className={buildClassName(styles.stories, 'no-scrollbar')}>
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
    usersById: global.users.byId,
    chatsById: global.chats.byId,
  }),
)(NilakStories));
