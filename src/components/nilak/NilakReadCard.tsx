import { memo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiMessage } from '../../api/types';

import { selectChat } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';
import { getReadPreview } from './helpers/barruu';
import { openNilakRead } from './helpers/nilakTab';
import useReadCover from './helpers/useReadCover';

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

// A Barruu inside a Home post: its picture or a lilac banner, the title, the first lines and the reading time
const NilakReadCard = ({
  post, progress, noChannel, chat,
}: OwnProps & StateProps) => {
  const lang = useLang();
  const {
    isBarruu, title, excerpt, minutes,
  } = getReadPreview(post);
  const coverUrl = useReadCover(post);

  const handleOpen = useLastCallback(() => {
    openNilakRead(post);
  });

  return (
    <article className={buildClassName(styles.card, noChannel && styles.embedded)} onClick={handleOpen}>
      {coverUrl && <img className={styles.cover} src={coverUrl} alt="" draggable={false} />}
      {!coverUrl && isBarruu && <div className={styles.barruuBanner} aria-hidden>✿</div>}

      <div className={styles.body}>
        {!noChannel && chat && (
          <div className={styles.channel}>
            <Avatar peer={chat} size="mini" />
            <span className={styles.channelName}>{chat.title}</span>
          </div>
        )}
        <span className={styles.tag}>
          {isBarruu ? '✿ BARRUU' : lang('NilakLongRead')}
          {Boolean(minutes) && ` · ${lang('NilakReadMinutes', { count: minutes }, { pluralValue: minutes })}`}
        </span>
        <h3 className={styles.title} dir="auto">{renderText(title)}</h3>
        {excerpt && <p className={styles.excerpt} dir="auto">{renderText(excerpt)}</p>}
        {Boolean(progress) && (
          <div className={styles.progress}>
            <i className={styles.progressFill} style={`width: ${progress}%`} />
          </div>
        )}
        <button type="button" className={styles.read}>{lang('NilakRead')}</button>
      </div>
    </article>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { post }): Complete<StateProps> => ({
    chat: selectChat(global, post.chatId),
  }),
)(NilakReadCard));
