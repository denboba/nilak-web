import { memo, useMemo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type {
  ApiChat, ApiKeyboardButton, ApiMessage, ApiReaction, ApiReactionCount, ApiThreadInfo,
} from '../../api/types';

import { getReactionKey } from '../../global/helpers/reactions';
import { selectChat, selectChatMessage, selectNilakAlbum } from '../../global/selectors';
import { selectThreadInfo } from '../../global/selectors/threads';
import buildClassName from '../../util/buildClassName';
import { getMessageKey } from '../../util/keys/messageKey';
import { formatCompactTimestamp, secondsToDate } from '../../util/localization/dateFormat';
import { formatIntegerCompact } from '../../util/textFormat';
import renderText from '../common/helpers/renderText';
import { renderTextWithEntities } from '../common/helpers/renderTextWithEntities';
import { getIsBarruu } from './helpers/barruu';
import { setNilakTab } from './helpers/nilakTab';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';
import ReactionAnimatedEmoji from '../common/reactions/ReactionAnimatedEmoji';
import InlineButtons from '../middle/message/InlineButtons';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import DropdownMenu from '../ui/DropdownMenu';
import MenuItem from '../ui/MenuItem';
import NilakAlbumCarousel from './NilakAlbumCarousel';
import NilakMediaTile from './NilakMediaTile';
import NilakReadCard from './NilakReadCard';

import styles from './NilakPostCard.module.scss';

type OwnProps = {
  post: ApiMessage;
  isSuggested?: boolean;
};

type StateProps = {
  chat?: ApiChat;
  liveMessage?: ApiMessage;
  threadInfo?: ApiThreadInfo;
  album?: ApiMessage[];
  areReactionsLoaded?: boolean;
};

const MAX_REACTIONS = 3;
// Longer texts start folded with Show more, like the smart fold in Nilak for Android
const FOLD_TEXT_LENGTH = 320;

// The reaction emoji in a chip (px)
const REACTION_SIZE = 18;

const NilakPostCard = ({
  post, isSuggested, chat, liveMessage, threadInfo, album, areReactionsLoaded,
}: OwnProps & StateProps) => {
  const {
    openChat, focusMessage, openForwardMenu, joinChannel, joinGroupCall, toggleReaction, openThread,
    clickBotInlineButton, openMessageReactionPicker, copyMessageLink, leaveChannel,
  } = getActions();
  const lang = useLang();
  const [isExpanded, expand] = useFlag();
  const [isUnfollowOpen, openUnfollow, closeUnfollow] = useFlag();

  const message = liveMessage || post;
  // Telegram plays a reaction's animation for the message it was toggled on
  const messageKey = getMessageKey(message);
  const { chatId, id: messageId } = message;
  const text = message.content.text;
  const isFoldable = Boolean(text && text.text.length > FOLD_TEXT_LENGTH);
  const isBarruu = getIsBarruu(message);

  const reactions = message.reactions?.results
    .filter((r): r is ApiReactionCount & { reaction: ApiReaction } => r.reaction.type === 'emoji')
    .slice(0, MAX_REACTIONS);

  const handleOpen = useLastCallback(() => {
    setNilakTab('chats');
    openChat({ id: chatId });
    focusMessage({ chatId, messageId });
  });

  const handleOpenChannel = useLastCallback(() => {
    setNilakTab('chats');
    openChat({ id: chatId });
  });

  const commentsInfo = threadInfo?.isCommentsInfo ? threadInfo : undefined;

  const handleComments = useLastCallback(() => {
    if (!commentsInfo) return;

    setNilakTab('chats');
    openThread({
      isComments: true,
      chatId: commentsInfo.chatId,
      originMessageId: commentsInfo.originMessageId,
      originChannelId: commentsInfo.originChannelId,
    });
  });

  const handleInlineButtonClick = useLastCallback((button: ApiKeyboardButton) => {
    clickBotInlineButton({ chatId, messageId, button });
  });

  const handleShare = useLastCallback(() => {
    openForwardMenu({ fromChatId: chatId, messageIds: [messageId], groupedId: message.groupedId });
  });

  const handleFollow = useLastCallback(() => {
    joinChannel({ chatId });
  });

  const handleJoinLive = useLastCallback(() => {
    joinGroupCall({ chatId });
  });

  // Telegram's reaction picker, which offers only the reactions this channel allows
  const handleAddReaction = useLastCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    openMessageReactionPicker({ chatId, messageId, position: { x: left, y: top } });
  });

  const handleCopyLink = useLastCallback(() => {
    copyMessageLink({ chatId, messageId, shouldIncludeGrouped: true });
  });

  const handleUnfollow = useLastCallback(() => {
    closeUnfollow();
    leaveChannel({ chatId });
  });

  const MenuButton = useMemo(() => {
    return ({ onTrigger, isOpen }: { onTrigger: () => void; isOpen?: boolean }) => (
      <Button
        round
        size="smaller"
        color="translucent"
        className={isOpen ? 'active' : undefined}
        onClick={onTrigger}
        ariaLabel={lang('AriaLabelOpenMenu')}
        iconName="more"
      />
    );
  }, [lang]);

  if (!chat) return undefined;

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <Avatar className={styles.avatar} peer={chat} size="medium" onClick={handleOpenChannel} />
        <div className={styles.titles} onClick={handleOpenChannel}>
          <div className={styles.name}>{chat.title}</div>
          <div className={styles.meta}>
            {isSuggested && (
              <span className={styles.suggested}>
                {lang('NilakSuggested')}
                {' '}
                ·
                {' '}
              </span>
            )}
            {formatCompactTimestamp(lang, secondsToDate(message.date))}
            {chat.membersCount !== undefined && (
              ` · ${lang('NilakFollowers', {
                count: formatIntegerCompact(lang, chat.membersCount),
              }, { pluralValue: chat.membersCount })}`
            )}
          </div>
        </div>
        {chat.isCallActive && chat.isCallNotEmpty && (
          <button type="button" className={styles.live} onClick={handleJoinLive} aria-label={lang('NilakJoinLive')}>
            {lang('NilakLiveBadge')}
          </button>
        )}
        {chat.isNotJoined && (
          <button type="button" className={styles.follow} onClick={handleFollow}>{lang('NilakFollow')}</button>
        )}
        <DropdownMenu className={styles.menu} trigger={MenuButton} positionX="right">
          <MenuItem icon="chat-badge" onClick={handleOpen}>{lang('NilakReelOpenInChat')}</MenuItem>
          <MenuItem icon="link" onClick={handleCopyLink}>{lang('CopyLink')}</MenuItem>
          {!chat.isNotJoined && !chat.isOwner && (
            <MenuItem icon="logout" destructive onClick={openUnfollow}>{lang('NilakUnfollow')}</MenuItem>
          )}
        </DropdownMenu>
      </div>
      <ConfirmDialog
        isOpen={isUnfollowOpen}
        title={lang('NilakUnfollow')}
        text={lang('NilakUnfollowText', { title: chat.title })}
        confirmLabel={lang('NilakUnfollow')}
        confirmIsDestructive
        confirmHandler={handleUnfollow}
        onClose={closeUnfollow}
      />

      {isBarruu && <NilakReadCard post={message} noChannel />}

      {album && album.length > 1 ? (
        <NilakAlbumCarousel album={album} onOpen={handleOpen} />
      ) : (
        <NilakMediaTile message={message} onClick={handleOpen} />
      )}

      {text && !isBarruu && (
        <div
          className={buildClassName(styles.text, isFoldable && !isExpanded && styles.folded)}
          dir="auto"
          onClick={handleOpen}
        >
          {renderTextWithEntities({ text: text.text, entities: text.entities })}
        </div>
      )}
      {isFoldable && !isExpanded && (
        <button type="button" className={styles.more} onClick={expand}>{lang('ShowMore')}</button>
      )}

      {message.inlineButtons && (
        // The post's own buttons work as in the channel: links, mini apps (like View Replies), votes
        <InlineButtons
          className={styles.buttons}
          inlineButtons={message.inlineButtons}
          isEphemeral={message.isEphemeral}
          onClick={handleInlineButtonClick}
        />
      )}

      <div className={styles.actions}>
        {reactions?.map(({ reaction, count, chosenOrder }) => (
          <button
            key={getReactionKey(reaction)}
            type="button"
            className={buildClassName(styles.reaction, chosenOrder !== undefined && styles.reactionChosen)}
            onClick={() => toggleReaction({ chatId, messageId, reaction })}
          >
            {areReactionsLoaded || reaction.type !== 'emoji' ? (
              <ReactionAnimatedEmoji
                className={styles.reactionEmoji}
                containerId={messageKey}
                reaction={reaction}
                size={REACTION_SIZE}
              />
            ) : renderText(reaction.emoticon)}
            {formatIntegerCompact(lang, count)}
          </button>
        ))}
        <button
          type="button"
          className={buildClassName(styles.reaction, styles.addReaction)}
          onClick={handleAddReaction}
          aria-label={lang('NilakAddReaction')}
        >
          <Icon name="smile" />
          +
        </button>
        <div className={styles.actionsEnd}>
          {commentsInfo && (
            <button type="button" className={styles.stat} onClick={handleComments}>
              <Icon name="comments" />
              {' '}
              {commentsInfo.messagesCount
                ? lang('NilakComments', {
                  count: formatIntegerCompact(lang, commentsInfo.messagesCount),
                }, { pluralValue: commentsInfo.messagesCount })
                : lang('NilakComment')}
            </button>
          )}
          <button type="button" className={styles.stat} onClick={handleShare}>
            <Icon name="forward" />
            {' '}
            {lang('Share')}
          </button>
        </div>
      </div>
    </article>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { post }): Complete<StateProps> => ({
    chat: selectChat(global, post.chatId),
    liveMessage: selectChatMessage(global, post.chatId, post.id),
    threadInfo: selectThreadInfo(global, post.chatId, post.id),
    album: selectNilakAlbum(global, post),
    areReactionsLoaded: Boolean(global.reactions.availableReactions),
  }),
)(NilakPostCard));
