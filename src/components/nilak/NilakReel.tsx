import { memo, useEffect, useRef, useState } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type {
  ApiChat, ApiMessage, ApiReaction, ApiThreadInfo,
} from '../../api/types';
import type { IconName } from '../../types/icons';

import { getMediaFormat, getVideoMediaHash } from '../../global/helpers';
import { selectChat, selectChatMessage } from '../../global/selectors';
import { selectThreadInfo } from '../../global/selectors/threads';
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
  // The browser refused sound before any tap; the reel plays muted and the shared switch follows
  onSoundBlocked: NoneToVoidFunction;
  onNotInterested: (post: ApiMessage) => void;
};

type StateProps = {
  chat?: ApiChat;
  liveMessage?: ApiMessage;
  threadInfo?: ApiThreadInfo;
};

type MenuAction = 'save' | 'link' | 'download' | 'speed' | 'open' | 'notInterested';

const HEART: ApiReaction = { type: 'emoji', emoticon: '❤' };
const FULL_PERCENT = 100;
const SPEEDS = [1, 1.5, 2];
const HEART_BURST_DURATION = 800;
const MENU_ITEMS: { action: MenuAction; icon: IconName }[] = [
  { action: 'save', icon: 'saved-messages' },
  { action: 'link', icon: 'link' },
  { action: 'download', icon: 'download' },
  { action: 'speed', icon: 'play' },
  { action: 'open', icon: 'open-in-new-tab' },
  { action: 'notInterested', icon: 'eye-crossed' },
];

const NilakReel = ({
  post, isActive, isMuted, chat, liveMessage, threadInfo, onToggleMute, onSoundBlocked, onNotInterested,
}: OwnProps & StateProps) => {
  const {
    openChat, focusMessage, openForwardMenu, forwardToSavedMessages, joinChannel, toggleReaction, openThread,
    copyMessageLink, downloadMedia, openMessageReactionPicker,
  } = getActions();
  const lang = useLang();
  const videoRef = useRef<HTMLVideoElement>();
  const [progress, setProgress] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isHeartBurst, setIsHeartBurst] = useState(false);
  const [isCaptionExpanded, expandCaption] = useFlag();
  const [isMenuOpen, openMenu, closeMenu] = useFlag();

  const message = liveMessage || post;
  const { chatId, id: messageId } = message;
  const video = message.content.video!;
  const videoUrl = useMedia(getVideoMediaHash(video, 'inline'), !isActive, getMediaFormat(video, 'inline'));
  const thumbUrl = video.thumbnail?.dataUri;
  const commentsInfo = threadInfo?.isCommentsInfo ? threadInfo : undefined;

  const heart = message.reactions?.results.find((result) => (
    result.reaction.type === 'emoji' && result.reaction.emoticon === HEART.emoticon
  ));
  const isHearted = heart?.chosenOrder !== undefined;

  // Reels play with sound; a browser that blocks sound before the first tap gets the reel muted instead
  const startPlaying = useLastCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.muted = Boolean(isMuted);
    videoElement.play().catch(() => {
      if (videoElement.muted) return;

      videoElement.muted = true;
      onSoundBlocked();
      videoElement.play().catch(() => undefined);
    });
  });

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isActive) {
      startPlaying();
    } else {
      videoElement.pause();
      closeMenu();
    }
  }, [isActive, videoUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = Boolean(isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = SPEEDS[speedIndex];
  }, [speedIndex, videoUrl]);

  const handleTimeUpdate = useLastCallback(() => {
    const videoElement = videoRef.current!;
    setProgress(videoElement.duration ? (videoElement.currentTime / videoElement.duration) * FULL_PERCENT : 0);
  });

  const handleTogglePlay = useLastCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (videoElement.paused) {
      startPlaying();
      setIsPaused(false);
    } else {
      videoElement.pause();
      setIsPaused(true);
    }
  });

  // A double tap likes the reel, with a heart over the video
  const handleDoubleClick = useLastCallback(() => {
    if (!isHearted) toggleReaction({ chatId, messageId, reaction: HEART });
    setIsHeartBurst(true);
    setTimeout(() => setIsHeartBurst(false), HEART_BURST_DURATION);
  });

  const handleSeek = useLastCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const videoElement = videoRef.current;
    if (!videoElement?.duration) return;

    const { left, width } = e.currentTarget.getBoundingClientRect();
    videoElement.currentTime = ((e.clientX - left) / width) * videoElement.duration;
  });

  const handleOpenChannel = useLastCallback(() => {
    setNilakTab('chats');
    openChat({ id: chatId });
  });

  const handleComments = useLastCallback(() => {
    setNilakTab('chats');
    if (commentsInfo) {
      openThread({
        isComments: true,
        chatId: commentsInfo.chatId,
        originMessageId: commentsInfo.originMessageId,
        originChannelId: commentsInfo.originChannelId,
      });
      return;
    }

    openChat({ id: chatId });
    focusMessage({ chatId, messageId });
  });

  const handleHeart = useLastCallback(() => {
    toggleReaction({ chatId, messageId, reaction: HEART });
  });

  // Right click or a long press on the heart offers every reaction
  const handleReactionPicker = useLastCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const { left, top } = e.currentTarget.getBoundingClientRect();
    openMessageReactionPicker({ chatId, messageId, position: { x: left, y: top } });
  });

  const handleShare = useLastCallback(() => {
    openForwardMenu({ fromChatId: chatId, messageIds: [messageId] });
  });

  const handleFollow = useLastCallback(() => {
    joinChannel({ chatId });
  });

  const handleMenuAction = useLastCallback((action: MenuAction) => {
    if (action !== 'speed') closeMenu();

    switch (action) {
      case 'save':
        openForwardMenu({ fromChatId: chatId, messageIds: [messageId] });
        forwardToSavedMessages({});
        break;
      case 'link':
        copyMessageLink({ chatId, messageId });
        break;
      case 'download':
        downloadMedia({ media: video, originMessage: message });
        break;
      case 'speed':
        setSpeedIndex((index) => (index + 1) % SPEEDS.length);
        break;
      case 'open':
        setNilakTab('chats');
        openChat({ id: chatId });
        focusMessage({ chatId, messageId });
        break;
      case 'notInterested':
        onNotInterested(post);
        break;
    }
  });

  function renderMenuLabel(action: MenuAction) {
    switch (action) {
      case 'save': return lang('NilakReelSave');
      case 'link': return lang('NilakReelCopyLink');
      case 'download': return lang('NilakReelDownload');
      case 'speed': return lang('NilakReelSpeed', { speed: SPEEDS[speedIndex] });
      case 'open': return lang('NilakReelOpenInChat');
      case 'notInterested': return lang('NilakReelNotInterested');
    }

    return undefined;
  }

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
          onClick={handleTogglePlay}
          onDoubleClick={handleDoubleClick}
          onTimeUpdate={handleTimeUpdate}
        />
      ) : (
        thumbUrl && <img className={styles.video} src={thumbUrl} alt="" />
      )}
      {isPaused && <div className={styles.pausedIcon} aria-hidden><Icon name="play" /></div>}
      {isHeartBurst && <div className={styles.heartBurst} aria-hidden><Icon name="heart" /></div>}

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
          onContextMenu={handleReactionPicker}
        >
          <Icon name={isHearted ? 'heart' : 'heart-outline'} />
        </button>
        <span className={styles.count}>{heart ? formatIntegerCompact(lang, heart.count) : ''}</span>
        <button type="button" className={styles.action} aria-label={lang('NilakComment')} onClick={handleComments}>
          <Icon name="comments" />
        </button>
        <span className={styles.count}>
          {commentsInfo?.messagesCount ? formatIntegerCompact(lang, commentsInfo.messagesCount) : ''}
        </span>
        <button type="button" className={styles.action} aria-label={lang('Share')} onClick={handleShare}>
          <Icon name="forward" />
        </button>
        <span className={styles.count}>
          {message.viewsCount ? formatIntegerCompact(lang, message.viewsCount) : ''}
        </span>
        <button
          type="button"
          className={styles.action}
          aria-label={lang('NilakReelMore')}
          onClick={isMenuOpen ? closeMenu : openMenu}
        >
          <Icon name="more" />
        </button>
      </div>

      {isMenuOpen && (
        <>
          <div className={styles.menuBackdrop} onClick={closeMenu} />
          <div className={styles.menu} role="menu">
            {MENU_ITEMS.map(({ action, icon }) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                className={buildClassName(styles.menuItem, action === 'notInterested' && styles.menuItemDanger)}
                onClick={() => handleMenuAction(action)}
              >
                <Icon name={icon} />
                {renderMenuLabel(action)}
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.progress} onClick={handleSeek}>
        <i className={styles.progressFill} style={`width: ${progress}%`} />
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { post }): Complete<StateProps> => ({
    chat: selectChat(global, post.chatId),
    liveMessage: selectChatMessage(global, post.chatId, post.id),
    threadInfo: selectThreadInfo(global, post.chatId, post.id),
  }),
)(NilakReel));
