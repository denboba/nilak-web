import { memo, useRef, useState } from '../../lib/teact/teact';

import type { ApiMessage } from '../../api/types';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Icon from '../common/icons/Icon';
import NilakMediaTile from './NilakMediaTile';

import styles from './NilakPostCard.module.scss';

type OwnProps = {
  album: ApiMessage[];
  onOpen: NoneToVoidFunction;
};

// An album as a carousel, like Nilak for Android: swipe or use the arrows, one photo or video at a time
const NilakAlbumCarousel = ({ album, onOpen }: OwnProps) => {
  const lang = useLang();
  const trackRef = useRef<HTMLDivElement>();
  const [index, setIndex] = useState(0);

  const handleScroll = useLastCallback(() => {
    const track = trackRef.current!;
    const current = Math.round(track.scrollLeft / track.clientWidth);
    if (current !== index) setIndex(current);
  });

  function scrollTo(target: number) {
    const track = trackRef.current!;
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className={styles.carousel}>
      <div ref={trackRef} className={styles.carouselTrack} onScroll={handleScroll}>
        {album.map((part) => (
          <NilakMediaTile key={part.id} message={part} className={styles.carouselSlide} onClick={onOpen} />
        ))}
      </div>
      <span className={styles.carouselCount}>{`${index + 1}/${album.length}`}</span>
      {index > 0 && (
        <button
          type="button"
          className={buildClassName(styles.carouselArrow, styles.carouselPrevious)}
          aria-label={lang('AccDescrPrevious')}
          onClick={() => scrollTo(index - 1)}
        >
          <Icon name="previous" />
        </button>
      )}
      {index < album.length - 1 && (
        <button
          type="button"
          className={buildClassName(styles.carouselArrow, styles.carouselNext)}
          aria-label={lang('Next')}
          onClick={() => scrollTo(index + 1)}
        >
          <Icon name="next" />
        </button>
      )}
      <div className={styles.carouselDots} aria-hidden>
        {album.map((part, partIndex) => (
          <span
            key={part.id}
            className={buildClassName(styles.carouselDot, partIndex === index && styles.carouselDotActive)}
          />
        ))}
      </div>
    </div>
  );
};

export default memo(NilakAlbumCarousel);
