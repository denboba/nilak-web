import { memo, useEffect, useRef, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiMessage, ApiReaction } from '../../api/types';

import { getMediaFormat, getVideoMediaHash } from '../../global/helpers';
import { selectChat, selectChatMessage } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { formatIntegerCompact } from '../../util/textFormat';
import { renderTextWithEntities } from '../common/helpers/renderTextWithEntities';
import { setNilakTab } from './helpers/nilakTab';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useMedia from '../../hooks/useMedia';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';

import styles from './NilakReels.module.scss';

type OwnProps = {
  post: ApiMessage;
  isActive?: boolean;
  isMuted?: boolean;
  onToggleMute: NoneToVoidFunction;
};

type StateProps = {
  chat?: ApiChat;
  liveMessage?: ApiMessage;
};

const HEART: ApiReaction = { type: 'emoji', emoticon: '❤' };
const FULL_PERCENT = 100;

const NilakReel = ({
  post, isActive, isMuted, chat, liveMessage, onToggleMute,
}: OwnProps & StateProps) => {
  const {
    openChat, focusMessage, openForwardMenu, joinChannel, toggleReaction,
  } = getActions();
  const lang = useLang();
  const videoRef = useRef<HTMLVideoElement>();
  const [progress, setProgress] = useState(0);
  const [isCaptionExpanded, expandCaption] = useFlag();

  const message = liveMessage || post;
  const { chatId, id: messageId } = message;
  const video = message.content.video!;
  const videoUrl = useMedia(getVideoMediaHash(video, 'inline'), !isActive, getMediaFormat(video, 'inline'));
  const thumbUrl = video.thumbnail?.dataUri;

  const heart = message.reactions?.results.find((result) => (
    result.reaction.type === 'emoji' && result.reaction.emoticon === HEART.emoticon
  ));
  const isHearted = heart?.chosenOrder !== undefined;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isActive) {
      videoElement.play().catch(() => undefined);
    } else {
      videoElement.pause();
    }
  }, [isActive, videoUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = Boolean(isMuted);
  }, [isMuted, videoUrl]);

  const handleTimeUpdate = useLastCallback(() => {
    const videoElement = videoRef.current!;
    setProgress(videoElement.duration ? (videoElement.currentTime / videoElement.duration) * FULL_PERCENT : 0);
  });

  const handleTogglePlay = useLastCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (videoElement.paused) {
      videoElement.play().catch(() => undefined);
    } else {
      videoElement.pause();
    }
  });

  const handleOpenChannel = useLastCallback(() => {
    setNilakTab('chats');
    openChat({ id: chatId });
  });

  const handleComments = useLastCallback(() => {
    setNilakTab('chats');
    openChat({ id: chatId });
    focusMessage({ chatId, messageId });
  });

  const handleHeart = useLastCallback(() => {
    toggleReaction({ chatId, messageId, reaction: HEART });
  });

  const handleShare = useLastCallback(() => {
    openForwardMenu({ fromChatId: chatId, messageIds: [messageId] });
  });

  const handleFollow = useLastCallback(() => {
    joinChannel({ chatId });
  });

  const caption = message.content.text;

  return (
    <div className={styles.reel}>
      {thumbUrl && <img className={styles.backdrop} src={thumbUrl} alt="" />}
      {videoUrl ? (
        <video
          ref={videoRef}
          className={styles.video}
          src={videoUrl}
          poster={thumbUrl}
          loop
          playsInline
          muted
          onClick={handleTogglePlay}
          onTimeUpdate={handleTimeUpdate}
        />
      ) : (
        thumbUrl && <img className={styles.video} src={thumbUrl} alt="" />
      )}

      <button
        type="button"
        className={styles.sound}
        aria-label={lang(isMuted ? 'NilakSoundOn' : 'NilakSoundOff')}
        onClick={onToggleMute}
      >
        <Icon name={isMuted ? 'speaker-muted-story' : 'speaker-story'} />
      </button>

      <div className={styles.overlay}>
        <div className={styles.channel}>
          {chat && <Avatar peer={chat} size="small" onClick={handleOpenChannel} />}
          <span className={styles.channelName} onClick={handleOpenChannel}>{chat?.title}</span>
          {chat?.isNotJoined && (
            <button type="button" className={styles.follow} onClick={handleFollow}>{lang('NilakFollow')}</button>
          )}
        </div>
        {caption?.text && (
          <div
            className={buildClassName(styles.caption, !isCaptionExpanded && styles.captionFolded)}
            dir="auto"
            onClick={expandCaption}
          >
            {renderTextWithEntities({ text: caption.text, entities: caption.entities })}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={buildClassName(styles.action, isHearted && styles.hearted)}
          aria-label={lang('NilakLike')}
          onClick={handleHeart}
        >
          <Icon name={isHearted ? 'heart' : 'heart-outline'} />
        </button>
        <span className={styles.count}>{heart ? formatIntegerCompact(lang, heart.count) : ''}</span>
        <button type="button" className={styles.action} aria-label={lang('NilakComment')} onClick={handleComments}>
          <Icon name="comments" />
        </button>
        <span className={styles.count} />
        <button type="button" className={styles.action} aria-label={lang('Share')} onClick={handleShare}>
          <Icon name="forward" />
        </button>
      </div>

      <div className={styles.progress}>
        <i className={styles.progressFill} style={`width: ${progress}%`} />
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { post }): Complete<StateProps> => ({
    chat: selectChat(global, post.chatId),
    liveMessage: selectChatMessage(global, post.chatId, post.id),
  }),
)(NilakReel));
