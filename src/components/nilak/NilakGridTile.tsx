import { memo } from '../../lib/teact/teact';
import { getActions } from '../../global';

import type { ApiMessage } from '../../api/types';

import {
  getMessagePhoto, getMessageVideo, getPhotoMediaHash, getVideoMediaHash,
} from '../../global/helpers';
import renderText from '../common/helpers/renderText';
import { getBarruuTitle, getIsBarruu } from './helpers/barruu';
import { setNilakTab, setOpenedRead } from './helpers/nilakTab';

import useLastCallback from '../../hooks/useLastCallback';
import useMedia from '../../hooks/useMedia';

import Icon from '../common/icons/Icon';

import styles from './NilakProfile.module.scss';

type OwnProps = {
  post: ApiMessage;
};

const EXCERPT_LENGTH = 90;

// One square of the profile grid: a photo or video frame, a Barruu, or the start of a text post
const NilakGridTile = ({ post }: OwnProps) => {
  const { openChat, focusMessage } = getActions();

  const photo = getMessagePhoto(post);
  const video = getMessageVideo(post);
  const isBarruu = getIsBarruu(post);
  const mediaHash = photo ? getPhotoMediaHash(photo, 'inline')
    : video ? getVideoMediaHash(video, 'pictogram') : undefined;
  const mediaUrl = useMedia(mediaHash);
  const thumbUrl = (photo || video)?.thumbnail?.dataUri;

  const handleClick = useLastCallback(() => {
    if (isBarruu) {
      setOpenedRead({ chatId: post.chatId, messageId: post.id });
      return;
    }

    setNilakTab('chats');
    openChat({ id: post.chatId });
    focusMessage({ chatId: post.chatId, messageId: post.id });
  });

  function renderContent() {
    if (mediaUrl || thumbUrl) {
      return (
        <>
          <img className={styles.tileImage} src={mediaUrl || thumbUrl} alt="" draggable={false} />
          {video && <Icon name="play" className={styles.tileBadge} />}
        </>
      );
    }

    if (isBarruu) {
      return (
        <div className={styles.tileText}>
          <span className={styles.tileFlower}>✿</span>
          {renderText(getBarruuTitle(post))}
        </div>
      );
    }

    const document = post.content.document;
    if (document) {
      return (
        <div className={styles.tileText}>
          <Icon name="document" className={styles.tileFlower} />
          {renderText(document.fileName)}
        </div>
      );
    }

    const text = post.content.text?.text;
    return text ? <div className={styles.tileText}>{renderText(text.slice(0, EXCERPT_LENGTH))}</div> : undefined;
  }

  return (
    <button type="button" className={styles.tile} onClick={handleClick}>
      {renderContent()}
    </button>
  );
};

export default memo(NilakGridTile);
