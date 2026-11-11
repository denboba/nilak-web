import { memo } from '../../lib/teact/teact';

import type { ApiMessage } from '../../api/types';

import renderText from '../common/helpers/renderText';
import { getReadTitle } from './helpers/barruu';
import { openNilakRead } from './helpers/nilakTab';
import useReadCover from './helpers/useReadCover';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Icon from '../common/icons/Icon';

import styles from './NilakRead.module.scss';

type OwnProps = {
  post: ApiMessage;
  progress: number;
};

// A started article in the Keep reading strip, with how far it was read
const NilakKeepReadingCard = ({ post, progress }: OwnProps) => {
  const lang = useLang();
  const coverUrl = useReadCover(post);

  const handleOpen = useLastCallback(() => {
    openNilakRead(post);
  });

  return (
    <button type="button" className={styles.keepCard} onClick={handleOpen}>
      {coverUrl
        ? <img className={styles.keepThumb} src={coverUrl} alt="" draggable={false} />
        : <span className={styles.keepThumbEmpty} aria-hidden><Icon name="article" /></span>}
      <span className={styles.keepInfo}>
        <span className={styles.keepTitle} dir="auto">{renderText(getReadTitle(post))}</span>
        <span className={styles.keepPercent}>{lang('NilakReadPercent', { percent: Math.round(progress) })}</span>
        <span className={styles.progress}>
          <i className={styles.progressFill} style={`width: ${progress}%`} />
        </span>
      </span>
    </button>
  );
};

export default memo(NilakKeepReadingCard);
