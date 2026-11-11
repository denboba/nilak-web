import { memo, useEffect, useRef, useState } from '../../lib/teact/teact';

import type { NilakDocument } from './helpers/nilakDocuments';

import { getVideoMediaHash } from '../../global/helpers';
import { decodeNilakDocument } from './helpers/nilakDocuments';

import useMedia from '../../hooks/useMedia';

import StickerView from '../common/StickerView';

import styles from './NilakReader.module.scss';

type OwnProps = {
  documentRef: string;
  caption?: string;
};

// Matches `.sticker` in the reader styles
const STICKER_SIZE = 180;

// A Telegram sticker (animated where it can be) or GIF kept in a Barruu
const NilakTgDocument = ({ documentRef, caption }: OwnProps) => {
  const stickerRef = useRef<HTMLDivElement>();
  const [document, setDocument] = useState<NilakDocument | undefined>();

  useEffect(() => {
    let isCancelled = false;
    decodeNilakDocument(documentRef).then((result) => {
      if (!isCancelled) setDocument(result);
    });

    return () => {
      isCancelled = true;
    };
  }, [documentRef]);

  const gifUrl = useMedia(document?.gif && getVideoMediaHash(document.gif, 'full'));

  if (!document) return undefined;

  return (
    <figure className={styles.figure}>
      {document.sticker ? (
        <div ref={stickerRef} className={styles.sticker}>
          <StickerView containerRef={stickerRef} sticker={document.sticker} size={STICKER_SIZE} shouldLoop />
        </div>
      ) : (
        <video className={styles.media} src={gifUrl} autoPlay loop muted playsInline />
      )}
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
};

export default memo(NilakTgDocument);
