import { memo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiChat, ApiMessage } from '../../api/types';

import {
  getMessagePhoto, getMessageVideo, getPhotoMediaHash, getVideoMediaHash,
} from '../../global/helpers';
import { selectChat } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';
import {
  getBarruuSubtitle, getIsBarruu, getReadMinutes, getReadTitle,
} from './helpers/barruu';
import { setOpenedRead } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';
import useMedia from '../../hooks/useMedia';

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

const EXCERPT_LENGTH = 220;

// A Barruu or long post in a list: its photo on top, a short title, the first lines and the reading time
const NilakReadCard = ({
  post, progress, noChannel, chat,
}: OwnProps & StateProps) => {
  const lang = useLang();
  const isBarruu = getIsBarruu(post);
  const text = post.content.text?.text.trim() || '';
  const title = getReadTitle(post);
  const excerpt = isBarruu
    ? getBarruuSubtitle(post)
    : text.slice(title.replace(/…$/, '').length, title.length + EXCERPT_LENGTH).trim();
  const minutes = getReadMinutes(post);

  const photo = getMessagePhoto(post);
  const video = getMessageVideo(post);
  const coverHash = photo ? getPhotoMediaHash(photo, 'inline')
    : video ? getVideoMediaHash(video, 'pictogram') : undefined;
  const coverUrl = useMedia(coverHash) || (photo || video)?.thumbnail?.dataUri;

  const handleOpen = useLastCallback(() => {
    setOpenedRead({ chatId: post.chatId, messageId: post.id });
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
