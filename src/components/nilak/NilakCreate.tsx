import { memo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import { LeftColumnContent, SettingsScreens } from '../../types';

import { selectChat, selectNilakProfileChannel } from '../../global/selectors';
import { setNilakTab } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import NilakBarruuWriter from './NilakBarruuWriter';

import styles from './NilakCreate.module.scss';

// Time for the upload to finish before Read is loaded again
const FEED_REFRESH_DELAY = 8000;

type OwnProps = {
  // The chat whose attach menu opened the writer; none means the person's own channel
  chatId?: string;
  // Written beside the reading list in Read, which closes the writer when it is done
  onDone?: NoneToVoidFunction;
};

type StateProps = {
  channel?: ApiChat;
};

// The Barruu writer for a chat or the person's channel, or how to choose that channel
const NilakCreate = ({ chatId, onDone, channel }: OwnProps & StateProps) => {
  const { openLeftColumnContent, openSettingsScreen, loadNilakFeed } = getActions();
  const lang = useLang();

  const handleClose = useLastCallback(() => {
    if (onDone) {
      onDone();
      return;
    }

    setNilakTab(chatId ? 'chats' : 'home');
  });

  // A Barruu from a chat goes back to that chat; one from Read or Create shows up in Read once it is uploaded
  const handlePublished = useLastCallback(() => {
    if (chatId) {
      setNilakTab('chats');
      return;
    }

    if (onDone) {
      onDone();
    } else {
      setNilakTab('read');
    }
    setTimeout(() => loadNilakFeed({ shouldRefresh: true }), FEED_REFRESH_DELAY);
  });

  const handleCreateChannel = useLastCallback(() => {
    setNilakTab('chats');
    openLeftColumnContent({ contentKey: LeftColumnContent.NewChannelStep1 });
  });

  const handleEditProfile = useLastCallback(() => {
    setNilakTab('chats');
    openLeftColumnContent({ contentKey: LeftColumnContent.Settings });
    openSettingsScreen({ screen: SettingsScreens.EditProfile });
  });

  if (channel) return <NilakBarruuWriter channel={channel} onClose={handleClose} onPublished={handlePublished} />;

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>{lang('NilakCreateTitle')}</h2>
      <div className={styles.noChannel}>
        <p>{lang('NilakCreateNoChannel')}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={handleEditProfile}>
            {lang('NilakEditProfile')}
          </button>
          <button type="button" className={styles.secondary} onClick={handleCreateChannel}>
            {lang('NilakCreateChannel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { chatId }): Complete<StateProps> => ({
    channel: chatId ? selectChat(global, chatId)
      : global.currentUserId ? selectNilakProfileChannel(global, global.currentUserId) : undefined,
  }),
)(NilakCreate));
