import type { GlobalState } from '../types';

import { selectChat } from './chats';
import { selectUserFullInfo } from './users';

// Only the personal channel the person set on their profile; owning or admining a channel does not make it theirs
export function selectNilakProfileChannel<T extends GlobalState>(global: T, currentUserId: string) {
  const personalChannelId = selectUserFullInfo(global, currentUserId)?.personalChannelId;
  return personalChannelId ? selectChat(global, personalChannelId) : undefined;
}
