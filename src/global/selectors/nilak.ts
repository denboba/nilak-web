import type { GlobalState } from '../types';

import { isChatChannel } from '../helpers';
import { selectChat } from './chats';
import { selectUserFullInfo } from './users';

// The personal channel set on the profile, else the first channel the user created, like Nilak for Android
export function selectNilakProfileChannel<T extends GlobalState>(global: T, currentUserId: string) {
  const personalChannelId = selectUserFullInfo(global, currentUserId)?.personalChannelId;
  const personalChannel = personalChannelId ? selectChat(global, personalChannelId) : undefined;
  if (personalChannel) return personalChannel;

  return (global.chats.listIds.active || [])
    .map((id) => selectChat(global, id))
    .find((chat) => chat && isChatChannel(chat) && chat.isOwner);
}
