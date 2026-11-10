import { createSignal } from '../../../util/signals';

export type NilakTab = 'home' | 'reels' | 'read' | 'chats' | 'profile' | 'create';

// Nilak opens on Home, like Nilak for Android
export const [getNilakTab, setNilakTab] = createSignal<NilakTab>('home');

export type NilakReadTarget = { chatId: string; messageId: number };

// The Barruu or long post open in the reader, over any tab
export const [getOpenedRead, setOpenedRead] = createSignal<NilakReadTarget | undefined>();

// The chat a Barruu is being written for, from its attach menu; none means the person's own channel
export const [getBarruuChatId, setBarruuChatId] = createSignal<string | undefined>();

export function openNilakBarruuWriter(chatId?: string) {
  setBarruuChatId(chatId);
  setNilakTab('create');
}
