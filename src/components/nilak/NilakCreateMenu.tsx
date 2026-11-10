import { memo, useRef, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import type { IconName } from '../../types/icons';

import { selectNilakProfileChannel } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { setNilakTab } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Icon from '../common/icons/Icon';

import styles from './NilakCreateMenu.module.scss';

type OwnProps = {
  isOpen?: boolean;
  // Beside the rail button on wide screens, below the + button on phones
  placement: 'side' | 'below';
  onClose: NoneToVoidFunction;
};

type StateProps = {
  channel?: ApiChat;
};

type CreateAction = 'media' | 'file' | 'music' | 'poll' | 'barruu' | 'post';

// The order of Telegram's attach menu, with Barruu in place of Telegram's article and a plain post last
const ITEMS: {
  action: CreateAction;
  icon: IconName;
  labelKey: 'NilakCreateMedia' | 'NilakCreateFile' | 'NilakCreateMusic' | 'NilakCreatePoll' | 'NilakCreateBarruu'
    | 'NilakCreatePost';
}[] = [
  { action: 'media', icon: 'media', labelKey: 'NilakCreateMedia' },
  { action: 'file', icon: 'document', labelKey: 'NilakCreateFile' },
  { action: 'music', icon: 'music', labelKey: 'NilakCreateMusic' },
  { action: 'poll', icon: 'poll', labelKey: 'NilakCreatePoll' },
  { action: 'barruu', icon: 'edit', labelKey: 'NilakCreateBarruu' },
  { action: 'post', icon: 'message', labelKey: 'NilakCreatePost' },
];
const ACCEPT_BY_ACTION: Partial<Record<CreateAction, string>> = {
  media: 'image/*,video/*',
  music: 'audio/*',
};

// What to share, posted to the person's channel; the file input stays mounted while the menu is closed,
// so the picker it opened can still hand over the files
const NilakCreateMenu = ({
  isOpen, placement, channel, onClose,
}: OwnProps & StateProps) => {
  const { openChat, openChatWithDraft, openPollModal } = getActions();
  const lang = useLang();
  const fileInputRef = useRef<HTMLInputElement>();
  const [fileAccept, setFileAccept] = useState<string | undefined>();

  const handleFiles = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    if (!channel || !files.length) return;

    setNilakTab('chats');
    openChatWithDraft({ chatId: channel.id, text: { text: '' }, files });
  });

  const handleAction = useLastCallback((action: CreateAction) => {
    onClose();

    // Without a personal channel the Create page explains how to choose one
    if (!channel || action === 'barruu') {
      setNilakTab('create');
      return;
    }

    switch (action) {
      case 'post':
        setNilakTab('chats');
        openChatWithDraft({ chatId: channel.id, text: { text: '' } });
        break;
      case 'poll':
        setNilakTab('chats');
        openChat({ id: channel.id });
        openPollModal({ chatId: channel.id, messageListType: 'thread' });
        break;
      default:
        setFileAccept(ACCEPT_BY_ACTION[action]);
        // The input needs the new `accept` before it opens
        requestAnimationFrame(() => fileInputRef.current?.click());
    }
  });

  return (
    <>
      {isOpen && (
        <>
          <div className={styles.backdrop} onClick={onClose} />
          <div className={buildClassName(styles.menu, styles[placement])} role="menu">
            {channel && <div className={styles.target}>{lang('NilakCreateTo', { title: channel.title })}</div>}
            {ITEMS.map(({ action, icon, labelKey }) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => handleAction(action)}
              >
                <Icon name={icon} className={styles.icon} />
                {lang(labelKey)}
              </button>
            ))}
          </div>
        </>
      )}
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        multiple
        accept={fileAccept}
        onChange={handleFiles}
      />
    </>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({
    channel: global.currentUserId ? selectNilakProfileChannel(global, global.currentUserId) : undefined,
  }),
)(NilakCreateMenu));
