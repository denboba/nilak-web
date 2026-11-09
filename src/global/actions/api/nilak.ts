import type { ApiChat, ApiMessage } from '../../../api/types';
import type { GlobalState } from '../../types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { GLOBAL_SUGGESTED_CHANNELS_ID } from '../../../config';
import { buildCollectionByKey } from '../../../util/iteratees';
import { callApi } from '../../../api/gramjs';
import { isChatChannel } from '../../helpers';
import { addActionHandler, getGlobal, setGlobal } from '../../index';
import {
  addChatMessagesById, addChats, addUsers, replaceSimilarChannels,
} from '../../reducers';
import { selectChat, selectChatLastMessage, selectSimilarChannelIds } from '../../selectors';

const FOLLOWING_CHANNELS_LIMIT = 30;
const SUGGESTED_CHANNELS_LIMIT = 10;
// Enough recent posts per channel to also fill Read with long posts and Barruu
const POSTS_PER_CHANNEL = 8;
// Channels are fetched a few at a time so a long channel list does not hit the server's flood limit
const FETCH_BATCH_SIZE = 5;

addActionHandler('loadNilakFeed', async (global, actions, payload): Promise<void> => {
  const { shouldRefresh } = payload || {};
  if (global.nilakFeed?.isLoading || (global.nilakFeed?.followingPosts && !shouldRefresh)) return;

  global = updateNilakFeed(global, { isLoading: true });
  setGlobal(global);

  const suggestedChannels = await loadSuggestedChannels();
  global = getGlobal();
  const followingChannels = selectFollowingChannels(global);

  const [followingPosts, suggestedPosts] = await Promise.all([
    fetchChannelPosts(followingChannels),
    fetchChannelPosts(suggestedChannels),
  ]);

  global = getGlobal();
  global = updateNilakFeed(global, { isLoading: false, followingPosts, suggestedPosts });
  setGlobal(global);
});

async function loadSuggestedChannels() {
  let global = getGlobal();
  const cachedIds = selectSimilarChannelIds(global, GLOBAL_SUGGESTED_CHANNELS_ID)?.similarChannelIds;
  if (!cachedIds) {
    const result = await callApi('fetchChannelRecommendations', {});
    if (!result) return [];

    const chatsById = buildCollectionByKey(result.similarChannels, 'id');
    global = getGlobal();
    global = addChats(global, chatsById);
    global = replaceSimilarChannels(global, GLOBAL_SUGGESTED_CHANNELS_ID, Object.keys(chatsById), result.count);
    setGlobal(global);
  }

  global = getGlobal();
  const ids = selectSimilarChannelIds(global, GLOBAL_SUGGESTED_CHANNELS_ID)?.similarChannelIds || [];

  return ids
    .map((id) => selectChat(global, id))
    .filter((chat): chat is ApiChat => Boolean(chat?.isNotJoined && !chat.isRestricted))
    .slice(0, SUGGESTED_CHANNELS_LIMIT);
}

function selectFollowingChannels(global: GlobalState) {
  return (global.chats.listIds.active || [])
    .map((id) => selectChat(global, id))
    .filter((chat): chat is ApiChat => Boolean(
      chat && isChatChannel(chat) && !chat.isNotJoined && !chat.isRestricted,
    ))
    .sort((a, b) => (selectChatLastMessage(global, b.id)?.date || 0) - (selectChatLastMessage(global, a.id)?.date || 0))
    .slice(0, FOLLOWING_CHANNELS_LIMIT);
}

async function fetchChannelPosts(channels: ApiChat[]) {
  const posts: ApiMessage[] = [];

  for (let i = 0; i < channels.length; i += FETCH_BATCH_SIZE) {
    const batch = channels.slice(i, i + FETCH_BATCH_SIZE);
    const results = await Promise.all(batch.map((chat) => callApi('fetchMessages', {
      chat, threadId: MAIN_THREAD_ID, limit: POSTS_PER_CHANNEL,
    })));

    let global = getGlobal();
    results.forEach((result, index) => {
      if (!result) return;

      global = addUsers(global, buildCollectionByKey(result.users, 'id'));
      global = addChats(global, buildCollectionByKey(result.chats, 'id'));
      // Stored like any loaded history, so opening, sharing and reacting work on feed posts
      global = addChatMessagesById(global, batch[index].id, buildCollectionByKey(result.messages, 'id'));
      posts.push(...pickPosts(result.messages));
    });
    setGlobal(global);
  }

  return posts.sort((a, b) => b.date - a.date);
}

// One card per album: the album part with the caption, or its first part
function pickPosts(messages: ApiMessage[]) {
  const byGroup = new Map<string, ApiMessage>();
  const posts: ApiMessage[] = [];

  messages.forEach((message) => {
    if (message.content.action) return;

    const { groupedId } = message;
    if (!groupedId) {
      posts.push(message);
      return;
    }

    const current = byGroup.get(groupedId);
    if (!current || (!current.content.text && message.content.text)) {
      byGroup.set(groupedId, message);
    }
  });

  return posts.concat(Array.from(byGroup.values()));
}

function updateNilakFeed<T extends GlobalState>(global: T, update: Partial<NonNullable<GlobalState['nilakFeed']>>): T {
  return {
    ...global,
    nilakFeed: {
      ...global.nilakFeed,
      ...update,
    },
  };
}
