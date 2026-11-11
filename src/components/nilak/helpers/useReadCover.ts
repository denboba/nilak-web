import type { ApiMessage } from '../../../api/types';

import {
  getMessagePhoto, getMessageVideo, getPhotoMediaHash, getVideoMediaHash,
} from '../../../global/helpers';

import useMedia from '../../../hooks/useMedia';

// The picture of a post for lists: its photo, or the first frame of its video
export default function useReadCover(message: ApiMessage) {
  const photo = getMessagePhoto(message);
  const video = getMessageVideo(message);
  const hash = photo ? getPhotoMediaHash(photo, 'inline')
    : video ? getVideoMediaHash(video, 'pictogram') : undefined;

  return useMedia(hash) || (photo || video)?.thumbnail?.dataUri;
}
