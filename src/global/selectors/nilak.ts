import type { ApiChat, ApiMessage } from '../../api/types';
import type { GlobalState, TabArgs } from '../types';

import { getCurrentTabId } from '../../util/establishMultitabRole';
import { isChatChannel, isChatCommunity } from '../helpers';
import { selectChat, selectChatFullInfo } from './chats';
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

// The communities the person belongs to: `loadCommunities` puts them in the active chat list
export function selectNilakJoinedCommunityIds<T extends GlobalState>(global: T) {
  return (global.chats.listIds.active || []).filter((id) => {
    const chat = selectChat(global, id);
    return chat && isChatCommunity(chat);
  });
}

// The channels whose posts a community feed shows: joined ones, and for one community also the ones open to view
export function selectNilakCommunityChannels<T extends GlobalState>(global: T, communityId?: string) {
  const communityIds = communityId ? [communityId] : selectNilakJoinedCommunityIds(global);
  const channels = new Map<string, ApiChat>();
  communityIds.forEach((id) => {
    selectChatFullInfo(global, id)?.linkedPeers?.forEach(({ peerId, canViewHistory }) => {
      const chat = selectChat(global, peerId);
      if (!chat || !isChatChannel(chat) || chat.isRestricted) return;
      if (chat.isNotJoined && !(communityId && canViewHistory)) return;

      channels.set(chat.id, chat);
    });
  });

  return Array.from(channels.values());
}
