import type { ApiMessage } from '../../api/types';
import type { GlobalState } from '../types';

import { selectChat } from './chats';
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
