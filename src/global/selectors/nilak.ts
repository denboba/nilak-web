import type { ApiMessage } from '../../api/types';
import type { GlobalState, TabArgs } from '../types';

import { getCurrentTabId } from '../../util/establishMultitabRole';
import { selectChat } from './chats';
import { selectCurrentMessageList } from './messages';
import { selectTabState } from './tabs';
import { selectUserFullInfo } from './users';

// Only the personal channel the person set on their profile; owning or admining a channel does not make it theirs
export function selectNilakProfileChannel<T extends GlobalState>(global: T, currentUserId: string) {
  const personalChannelId = selectUserFullInfo(global, currentUserId)?.personalChannelId;
  return personalChannelId ? selectChat(global, personalChannelId) : undefined;
}

export function buildNilakAlbumKey(chatId: string, groupedId: string) {
  return `${chatId}-${groupedId}`;
}

// The photos and videos of an album post in the Home feed
export function selectNilakAlbum<T extends GlobalState>(global: T, message: ApiMessage) {
  return message.groupedId
    ? global.nilakFeed?.albums?.[buildNilakAlbumKey(message.chatId, message.groupedId)]
    : undefined;
}

// Which menu item the chat columns stand for: the person's profile, their own channel (Create), or Chats
export function selectNilakChatsHighlight<T extends GlobalState>(
  global: T, ...[tabId = getCurrentTabId()]: TabArgs<T>
): 'chats' | 'profile' | 'create' {
  const { chatInfo } = selectTabState(global, tabId);
  if (chatInfo.isOpen && chatInfo.isOwnProfile) return 'profile';

  const channel = global.currentUserId ? selectNilakProfileChannel(global, global.currentUserId) : undefined;
  return channel && selectCurrentMessageList(global, tabId)?.chatId === channel.id ? 'create' : 'chats';
}
