import { memo } from '../../lib/teact/teact';

import type { ApiMessage } from '../../api/types';

import {
  getMediaFormat, getMessagePhoto, getMessageVideo, getPhotoMediaHash, getVideoMediaHash,
} from '../../global/helpers';
import buildClassName from '../../util/buildClassName';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useMedia from '../../hooks/useMedia';

import Icon from '../common/icons/Icon';

import styles from './NilakPostCard.module.scss';

type OwnProps = {
  message: ApiMessage;
  className?: string;
  onClick?: NoneToVoidFunction;
};

// A photo, or a video that plays right in the card when its play button is tapped
const NilakMediaTile = ({
  message, className, onClick,
}: OwnProps) => {
  const lang = useLang();
  const [isPlaying, play] = useFlag();
  const photo = getMessagePhoto(message);
  const video = getMessageVideo(message);
  const isVideo = Boolean(video && !video.isRound);
  const videoUrl = useMedia(
    isVideo ? getVideoMediaHash(video!, 'inline') : undefined, !isPlaying, video && getMediaFormat(video, 'inline'),
  );
  const mediaHash = photo ? getPhotoMediaHash(photo, 'inline')
    : video && !video.isRound ? getVideoMediaHash(video, 'pictogram') : undefined;
  const mediaUrl = useMedia(mediaHash);
  const thumbUrl = (photo || video)?.thumbnail?.dataUri;

  if (!mediaUrl && !thumbUrl) return undefined;

  if (isPlaying) {
    return (
      <div className={buildClassName(styles.media, className)}>
        <video
          className={styles.mediaImage}
          src={videoUrl}
          poster={mediaUrl || thumbUrl}
          controls
          autoPlay
          playsInline
        />
      </div>
    );
  }

  return (
    <div className={buildClassName(styles.media, className)} onClick={onClick}>
      <img className={styles.mediaImage} src={mediaUrl || thumbUrl} alt="" draggable={false} />
      {isVideo && (
        <button
          type="button"
          className={styles.play}
          aria-label={lang('AccActionPlay')}
          onClick={(e) => {
            e.stopPropagation();
            play();
          }}
        >
          <Icon name="play" />
        </button>
      )}
    </div>
  );
};

export default memo(NilakMediaTile);
