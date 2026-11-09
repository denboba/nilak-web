import { memo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiMessage } from '../../api/types';

import { selectChat } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';
import {
  getBarruuSubtitle, getBarruuTitle, getIsBarruu, getReadMinutes,
} from './helpers/barruu';
import { setOpenedRead } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';

import styles from './NilakRead.module.scss';

type OwnProps = {
  post: ApiMessage;
  progress?: number;
  noChannel?: boolean;
};

type StateProps = {
  chat?: ApiChat;
};

const EXCERPT_LENGTH = 180;

const NilakReadCard = ({
  post, progress, noChannel, chat,
}: OwnProps & StateProps) => {
  const lang = useLang();
  const isBarruu = getIsBarruu(post);
  const text = post.content.text?.text || '';
  const title = isBarruu ? getBarruuTitle(post) : text.split('\n', 1)[0];
  const excerpt = isBarruu ? getBarruuSubtitle(post) : text.slice(title.length, title.length + EXCERPT_LENGTH).trim();
  const minutes = getReadMinutes(post);

  const handleOpen = useLastCallback(() => {
    setOpenedRead({ chatId: post.chatId, messageId: post.id });
  });

  return (
    <div className={buildClassName(styles.card, noChannel && styles.embedded)} onClick={handleOpen}>
      {!noChannel && chat && (
        <div className={styles.channel}>
          <Avatar peer={chat} size="mini" />
          <span className={styles.channelName}>{chat.title}</span>
        </div>
      )}
      <div className={styles.cover}>
        {isBarruu || !chat ? '✿' : <Avatar className={styles.coverAvatar} peer={chat} size="large" />}
      </div>
      <div className={styles.info}>
        <span className={styles.tag}>
          {isBarruu ? '✿ BARRUU' : lang('NilakLongRead')}
          {Boolean(minutes) && ` · ${lang('NilakReadMinutes', { count: minutes }, { pluralValue: minutes })}`}
        </span>
        <div className={styles.title}>{renderText(title)}</div>
        {excerpt && <div className={styles.excerpt}>{renderText(excerpt)}</div>}
        {Boolean(progress) && (
          <div className={styles.progress}>
            <i className={styles.progressFill} style={`width: ${progress}%`} />
          </div>
        )}
        <button type="button" className={styles.read}>{lang('NilakRead')}</button>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { post }): Complete<StateProps> => ({
    chat: selectChat(global, post.chatId),
  }),
)(NilakReadCard));
