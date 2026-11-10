import { memo } from '../../lib/teact/teact';

import type { ApiMessage } from '../../api/types';

import {
  getMessagePhoto, getMessageVideo, getPhotoMediaHash, getVideoMediaHash,
} from '../../global/helpers';
import buildClassName from '../../util/buildClassName';

import useMedia from '../../hooks/useMedia';

import Icon from '../common/icons/Icon';

import styles from './NilakPostCard.module.scss';

type OwnProps = {
  message: ApiMessage;
  className?: string;
  // Album parts beyond the shown ones, drawn over the last tile as "+N"
  moreCount?: number;
  onClick?: NoneToVoidFunction;
};

// A photo, or the first frame of a video, in a post card
const NilakMediaTile = ({
  message, className, moreCount, onClick,
}: OwnProps) => {
  const photo = getMessagePhoto(message);
  const video = getMessageVideo(message);
  const mediaHash = photo ? getPhotoMediaHash(photo, 'inline')
    : video && !video.isRound ? getVideoMediaHash(video, 'pictogram') : undefined;
  const mediaUrl = useMedia(mediaHash);
  const thumbUrl = (photo || video)?.thumbnail?.dataUri;

  if (!mediaUrl && !thumbUrl) return undefined;

  return (
    <div className={buildClassName(styles.media, className)} onClick={onClick}>
      <img className={styles.mediaImage} src={mediaUrl || thumbUrl} alt="" draggable={false} />
      {video && !moreCount && <div className={styles.play}><Icon name="play" /></div>}
      {Boolean(moreCount) && (
        <div className={styles.moreCount}>
          +
          {moreCount}
        </div>
      )}
    </div>
  );
};

export default memo(NilakMediaTile);
