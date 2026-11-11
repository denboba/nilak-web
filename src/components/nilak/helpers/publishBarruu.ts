import { getActions, getGlobal } from '../../../global';

import type { ApiAttachment, ApiOnProgress, ApiVideo } from '../../../api/types';
import type { BarruuRichMedia, BarruuRichTexts } from './barruuRich';
import { MAIN_THREAD_ID } from '../../../api/types';

import { selectChat, selectIsCurrentUserPremium } from '../../../global/selectors';
import { callApi } from '../../../api/gramjs';
import { buildBarruuRichBlocks, getAreRichBlocksWithinLimits } from './barruuRich';
import { decodeNilakDocument, getIsNilakDocument } from './nilakDocuments';

type BarruuPublication = {
  chatId: string;
  title: string;
  subtitle: string;
  body: string;
  // Photos and videos by their path in the package (`media/…`)
  mediaAttachments: Record<string, ApiAttachment>;
  packageAttachment: ApiAttachment;
  // The caption of the package when it is published on its own
  caption: string;
  texts: BarruuRichTexts;
};

// Publishes a Barruu as a Telegram rich message, readable as an article in any Telegram app, with the `.nilak`
// package attached. Sending rich messages needs Telegram Premium, so other writers, a failed upload or a Barruu
// beyond Telegram's limits publish the package alone, the way earlier versions did.
export default async function publishBarruu(publication: BarruuPublication) {
  const { sendMessage } = getActions();
  const {
    chatId, title, subtitle, body, mediaAttachments, packageAttachment, caption, texts,
  } = publication;
  const messageList = { chatId, threadId: MAIN_THREAD_ID, type: 'thread' as const };
  const global = getGlobal();
  const chat = selectIsCurrentUserPremium(global) ? selectChat(global, chatId) : undefined;

  const blocks = chat && await (async () => {
    const usedPaths = Object.keys(mediaAttachments).filter((path) => body.includes(path));
    const uploaded = await Promise.all(usedPaths.map((path) => upload(chat, mediaAttachments[path])));
    const packageDocument = await upload(chat, { ...packageAttachment, shouldSendAsFile: true });
    if (uploaded.some((media) => !media) || packageDocument?.mediaType !== 'document') return undefined;

    const media: BarruuRichMedia = {};
    usedPaths.forEach((path, index) => {
      const item = uploaded[index];
      media[path] = item?.mediaType === 'photo' || item?.mediaType === 'video' ? item : undefined;
    });

    return buildBarruuRichBlocks({
      title,
      subtitle,
      body,
      media,
      gifs: await decodeGifs(body),
      packageDocument,
      texts,
    });
  })();

  if (blocks && getAreRichBlocksWithinLimits(blocks)) {
    sendMessage({ messageList, richMessage: { blocks } });
    return;
  }

  sendMessage({ messageList, text: caption, attachments: [packageAttachment] });
}

const IGNORE_PROGRESS: ApiOnProgress = () => undefined;

function upload(chat: NonNullable<ReturnType<typeof selectChat>>, attachment: ApiAttachment) {
  return callApi('uploadRichMedia', { chat, attachment }, IGNORE_PROGRESS).catch(() => undefined);
}

async function decodeGifs(body: string) {
  const refs = Array.from(body.matchAll(/!\[[^\]]*]\((tgdoc:[^)\s]+)\)/g), (match) => match[1])
    .filter(getIsNilakDocument);
  const documents = await Promise.all(refs.map(decodeNilakDocument));
  const gifs: Record<string, ApiVideo | undefined> = {};
  refs.forEach((ref, index) => {
    gifs[ref] = documents[index]?.gif;
  });

  return gifs;
}
