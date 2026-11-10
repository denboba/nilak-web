import { memo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import { LeftColumnContent, SettingsScreens } from '../../types';

import { selectNilakProfileChannel } from '../../global/selectors';
import { setNilakTab } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import NilakBarruuWriter from './NilakBarruuWriter';

import styles from './NilakCreate.module.scss';

type StateProps = {
  channel?: ApiChat;
};

// The Create page: the Barruu writer, or how to choose the channel posts go to
const NilakCreate = ({ channel }: StateProps) => {
  const { openLeftColumnContent, openSettingsScreen } = getActions();
  const lang = useLang();

  const handleClose = useLastCallback(() => {
    setNilakTab('home');
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

  if (channel) return <NilakBarruuWriter channel={channel} onClose={handleClose} />;

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

export default memo(withGlobal(
  (global): Complete<StateProps> => ({
    channel: global.currentUserId ? selectNilakProfileChannel(global, global.currentUserId) : undefined,
  }),
)(NilakCreate));
