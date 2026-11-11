import { memo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiMessage } from '../../api/types';

import { selectChat } from '../../global/selectors';
import { formatCompactTimestamp, secondsToDate } from '../../util/localization/dateFormat';
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
};

type StateProps = {
  chat?: ApiChat;
};

// One article in the Read list: the words on the left, a small picture on the right; the whole row opens it
const NilakReadRow = ({ post, chat }: OwnProps & StateProps) => {
  const lang = useLang();
  const {
    isBarruu, isArticle, title, excerpt, minutes,
  } = getReadPreview(post);
  const coverUrl = useReadCover(post);

  const handleOpen = useLastCallback(() => {
    openNilakRead(post);
  });

  return (
    <article className={styles.row} onClick={handleOpen}>
      <div className={styles.rowText}>
        {chat && (
          <div className={styles.rowChannel}>
            <Avatar peer={chat} size="micro" />
            <span className={styles.rowChannelName}>{chat.title}</span>
            <span className={styles.rowDot}>·</span>
            <span>{formatCompactTimestamp(lang, secondsToDate(post.date))}</span>
          </div>
        )}
        <h3 className={styles.rowTitle} dir="auto">{renderText(title)}</h3>
        {excerpt && <p className={styles.rowExcerpt} dir="auto">{renderText(excerpt)}</p>}
        <div className={styles.rowMeta}>
          {isBarruu && <span className={styles.rowBarruu}>✿ Barruu</span>}
          {isArticle && <span className={styles.rowBarruu}>{lang('NilakArticle')}</span>}
          {Boolean(minutes) && <span>{lang('NilakReadMinutes', { count: minutes }, { pluralValue: minutes })}</span>}
        </div>
      </div>
      {coverUrl ? (
        <img className={styles.rowThumb} src={coverUrl} alt="" draggable={false} />
      ) : isBarruu && (
        <div className={styles.rowThumbBarruu} aria-hidden>✿</div>
      )}
    </article>
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { post }): Complete<StateProps> => ({
    chat: selectChat(global, post.chatId),
  }),
)(NilakReadRow));
