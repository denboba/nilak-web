import { getActions } from '../../../global';

import type { ApiMessage } from '../../../api/types';

import { createSignal } from '../../../util/signals';
import { getTelegraphArticleUrl } from './barruu';

export type NilakTab = 'home' | 'reels' | 'read' | 'chats' | 'profile' | 'create';

// Nilak opens on Home, like Nilak for Android
export const [getNilakTab, setNilakTab] = createSignal<NilakTab>('home');

// The post travels with the target, so the reader still has it if the message store drops it
export type NilakReadTarget = { chatId: string; messageId: number; message?: ApiMessage };

// The Barruu or long post open in the reader, over any tab
export const [getOpenedRead, setOpenedRead] = createSignal<NilakReadTarget | undefined>();

// The chat a Barruu is being written for, from its attach menu; none means the person's own channel
export const [getBarruuChatId, setBarruuChatId] = createSignal<string | undefined>();

export function openNilakBarruuWriter(chatId?: string) {
  setBarruuChatId(chatId);
  setNilakTab('create');
}

export function openNilakRead(message: ApiMessage) {
  const telegraphUrl = getTelegraphArticleUrl(message);
  if (telegraphUrl) {
    getActions().openUrl({ url: telegraphUrl, tryInstant: true });
    return;
  }

  setOpenedRead({ chatId: message.chatId, messageId: message.id, message });
}
