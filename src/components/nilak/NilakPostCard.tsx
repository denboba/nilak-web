import { memo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type {
  ApiChat, ApiMessage, ApiReaction, ApiReactionCount, ApiThreadInfo,
} from '../../api/types';

import { getReactionKey } from '../../global/helpers/reactions';
import { selectChat, selectChatMessage, selectNilakAlbum } from '../../global/selectors';
import { selectThreadInfo } from '../../global/selectors/threads';
import buildClassName from '../../util/buildClassName';
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
};

const MAX_REACTIONS = 3;
// Album posts show up to four photos; the last tile counts the rest
const MAX_ALBUM_TILES = 4;
// Longer texts start folded with Show more, like the smart fold in Nilak for Android
const FOLD_TEXT_LENGTH = 320;

const NilakPostCard = ({
  post, isSuggested, chat, liveMessage, threadInfo, album,
}: OwnProps & StateProps) => {
  const {
    openChat, focusMessage, openForwardMenu, joinChannel, toggleReaction, openThread,
  } = getActions();
  const lang = useLang();
  const [isExpanded, expand] = useFlag();

  const message = liveMessage || post;
  const { chatId, id: messageId } = message;
  const text = message.content.text;
  const albumShown = album && album.length > 1 ? album.slice(0, MAX_ALBUM_TILES) : undefined;
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

  const handleShare = useLastCallback(() => {
    openForwardMenu({ fromChatId: chatId, messageIds: [messageId], groupedId: message.groupedId });
  });

  const handleFollow = useLastCallback(() => {
    joinChannel({ chatId });
  });

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
        {chat.isNotJoined && (
          <button type="button" className={styles.follow} onClick={handleFollow}>{lang('NilakFollow')}</button>
        )}
      </div>

      {isBarruu && <NilakReadCard post={message} noChannel />}

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

      {albumShown ? (
        <div className={buildClassName(styles.album, albumShown.length === 3 && styles.albumOfThree)}>
          {albumShown.map((part, index) => (
            <NilakMediaTile
              key={part.id}
              message={part}
              className={styles.albumTile}
              moreCount={index === albumShown.length - 1 ? album!.length - albumShown.length : undefined}
              onClick={handleOpen}
            />
          ))}
        </div>
      ) : (
        <NilakMediaTile message={message} onClick={handleOpen} />
      )}

      <div className={styles.actions}>
        {reactions?.map(({ reaction, count, chosenOrder }) => (
          <button
            key={getReactionKey(reaction)}
            type="button"
            className={buildClassName(styles.reaction, chosenOrder !== undefined && styles.reactionChosen)}
            onClick={() => toggleReaction({ chatId, messageId, reaction })}
          >
            {reaction.type === 'emoji' && renderText(reaction.emoticon)}
            {' '}
            {formatIntegerCompact(lang, count)}
          </button>
        ))}
        <div className={styles.actionsEnd}>
          {message.viewsCount !== undefined && (
            <span className={styles.stat}>
              <Icon name="eye" />
              {' '}
              {formatIntegerCompact(lang, message.viewsCount)}
            </span>
          )}
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
  }),
)(NilakPostCard));
