import type { ApiSticker, ApiVideo } from '../../../api/types';
import { ApiMediaFormat } from '../../../api/types';

import { getStickerMediaHash, getVideoMediaHash } from '../../../global/helpers';
import * as mediaLoader from '../../../util/mediaLoader';
import { callApi } from '../../../api/gramjs';

export const NILAK_DOCUMENT_PREFIX = 'tgdoc:';

export type NilakDocument = { sticker?: ApiSticker; gif?: ApiVideo };

const decoded = new Map<string, Promise<NilakDocument | undefined>>();

export function getIsNilakDocument(path: string) {
  return path.startsWith(NILAK_DOCUMENT_PREFIX);
}

// Stickers and GIFs travel inside a Barruu as Telegram documents, the way Nilak for Android writes them
export function decodeNilakDocument(ref: string) {
  let result = decoded.get(ref);
  if (!result) {
    result = callApi('decodeNilakDocument', { ref });
    decoded.set(ref, result);
  }

  return result;
}

export function encodeNilakDocument(documentId: string) {
  return callApi('encodeNilakDocument', { documentId });
}

// A picture the editor can show in plain HTML: the sticker's still image, or the GIF's video
export async function fetchNilakDocumentUrl({ sticker, gif }: NilakDocument) {
  const hash = sticker
    ? getStickerMediaHash(sticker, sticker.isLottie || sticker.isVideo ? 'preview' : 'full')
    : gif && getVideoMediaHash(gif, 'full');
  if (!hash) return undefined;

  try {
    return await mediaLoader.fetch<ApiMediaFormat.BlobUrl>(hash, ApiMediaFormat.BlobUrl);
  } catch (err) {
    return undefined;
  }
}

export async function fetchCustomEmojiUrl(sticker: ApiSticker) {
  try {
    return await mediaLoader.fetch<ApiMediaFormat.BlobUrl>(
      getStickerMediaHash(sticker, 'preview'), ApiMediaFormat.BlobUrl,
    );
  } catch (err) {
    return undefined;
  }
}
