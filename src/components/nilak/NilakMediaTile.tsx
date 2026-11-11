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
  onClick?: NoneToVoidFunction;
};

// A photo, or the first frame of a video, in a post card
const NilakMediaTile = ({
  message, className, onClick,
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
      {video && <div className={styles.play}><Icon name="play" /></div>}
    </div>
  );
};

export default memo(NilakMediaTile);
