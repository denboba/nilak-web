import { memo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat } from '../../api/types';

import { selectChat } from '../../global/selectors';
import { formatIntegerCompact } from '../../util/textFormat';
import { setNilakTab } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';

import styles from './NilakHome.module.scss';

type OwnProps = {
  chatId: string;
};

type StateProps = {
  chat?: ApiChat;
};

const NilakSuggestedChannel = ({ chatId, chat }: OwnProps & StateProps) => {
  const { openChat, joinChannel } = getActions();
  const lang = useLang();

  const handleOpen = useLastCallback(() => {
    setNilakTab('chats');
    openChat({ id: chatId });
  });

  const handleFollow = useLastCallback(() => {
    joinChannel({ chatId });
  });

  if (!chat) return undefined;

  return (
    <div className={styles.channel}>
      <Avatar peer={chat} size="small" onClick={handleOpen} />
      <div className={styles.channelInfo} onClick={handleOpen}>
        <div className={styles.channelName}>{chat.title}</div>
        {chat.membersCount !== undefined && (
          <div className={styles.channelMeta}>
            {lang('NilakFollowers', {
              count: formatIntegerCompact(lang, chat.membersCount),
            }, { pluralValue: chat.membersCount })}
          </div>
        )}
      </div>
      {chat.isNotJoined && (
        <button type="button" className={styles.follow} onClick={handleFollow}>{lang('NilakFollow')}</button>
      )}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { chatId }): Complete<StateProps> => ({
    chat: selectChat(global, chatId),
  }),
)(NilakSuggestedChannel));
