import { memo, useRef, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import type { IconName } from '../../types/icons';
import { LeftColumnContent } from '../../types';

import { selectNilakProfileChannel } from '../../global/selectors';
import { setNilakTab } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Icon from '../common/icons/Icon';
import NilakBarruuWriter from './NilakBarruuWriter';

import styles from './NilakCreate.module.scss';

type StateProps = {
  channel?: ApiChat;
};

type CreateAction = 'post' | 'media' | 'poll' | 'file' | 'barruu';

const ACTIONS: {
  action: CreateAction;
  icon: IconName;
  titleKey: 'NilakCreatePost' | 'NilakCreateMedia' | 'NilakCreatePoll' | 'NilakCreateFile' | 'NilakCreateBarruu';
  hintKey: 'NilakCreatePostHint' | 'NilakCreateMediaHint' | 'NilakCreatePollHint' | 'NilakCreateFileHint'
    | 'NilakCreateBarruuHint';
}[] = [
  { action: 'post', icon: 'edit', titleKey: 'NilakCreatePost', hintKey: 'NilakCreatePostHint' },
  { action: 'media', icon: 'media', titleKey: 'NilakCreateMedia', hintKey: 'NilakCreateMediaHint' },
  { action: 'barruu', icon: 'document', titleKey: 'NilakCreateBarruu', hintKey: 'NilakCreateBarruuHint' },
  { action: 'poll', icon: 'poll', titleKey: 'NilakCreatePoll', hintKey: 'NilakCreatePollHint' },
  { action: 'file', icon: 'attach', titleKey: 'NilakCreateFile', hintKey: 'NilakCreateFileHint' },
];
const MEDIA_ACCEPT = 'image/*,video/*';

// What to share, like the Create sheet of Nilak for Android; everything is posted to the person's channel
const NilakCreate = ({ channel }: StateProps) => {
  const {
    openChat, openChatWithDraft, openPollModal, openLeftColumnContent,
  } = getActions();
  const lang = useLang();
  const fileInputRef = useRef<HTMLInputElement>();
  const [isWriting, setIsWriting] = useState(false);
  const [fileAccept, setFileAccept] = useState<string | undefined>();

  const handleFiles = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    e.currentTarget.value = '';
    if (!channel || !files.length) return;

    setNilakTab('chats');
    openChatWithDraft({ chatId: channel.id, text: { text: '' }, files });
  });

  const handleAction = useLastCallback((action: CreateAction) => {
    if (!channel) return;

    switch (action) {
      case 'post':
        setNilakTab('chats');
        openChatWithDraft({ chatId: channel.id, text: { text: '' } });
        break;
      case 'media':
      case 'file':
        setFileAccept(action === 'media' ? MEDIA_ACCEPT : undefined);
        // The input needs the new `accept` before it opens
        requestAnimationFrame(() => fileInputRef.current?.click());
        break;
      case 'poll':
        setNilakTab('chats');
        openChat({ id: channel.id });
        openPollModal({ chatId: channel.id, messageListType: 'thread' });
        break;
      case 'barruu':
        setIsWriting(true);
        break;
    }
  });

  const handleCreateChannel = useLastCallback(() => {
    setNilakTab('chats');
    openLeftColumnContent({ contentKey: LeftColumnContent.NewChannelStep1 });
  });

  const handleCloseWriter = useLastCallback(() => {
    setIsWriting(false);
  });

  if (isWriting && channel) return <NilakBarruuWriter channel={channel} onClose={handleCloseWriter} />;

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>{lang('NilakCreateTitle')}</h2>
      {channel ? (
        <p className={styles.subtitle}>{lang('NilakCreateTo', { title: channel.title })}</p>
      ) : (
        <div className={styles.noChannel}>
          <p>{lang('NilakCreateNoChannel')}</p>
          <button type="button" className={styles.primary} onClick={handleCreateChannel}>
            {lang('NilakCreateChannel')}
          </button>
        </div>
      )}
      <div className={styles.grid}>
        {ACTIONS.map(({
          action, icon, titleKey, hintKey,
        }) => (
          <button
            key={action}
            type="button"
            className={styles.card}
            disabled={!channel}
            onClick={() => handleAction(action)}
          >
            <span className={styles.cardIcon}><Icon name={icon} /></span>
            <span className={styles.cardTitle}>{lang(titleKey)}</span>
            <span className={styles.cardHint}>{lang(hintKey)}</span>
          </button>
        ))}
      </div>
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        multiple
        accept={fileAccept}
        onChange={handleFiles}
      />
    </div>
  );
};

export default memo(withGlobal(
  (global): Complete<StateProps> => ({
    channel: global.currentUserId ? selectNilakProfileChannel(global, global.currentUserId) : undefined,
  }),
)(NilakCreate));
