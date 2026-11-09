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
import {
  selectChat, selectChatLastMessage, selectNilakProfileChannel, selectSimilarChannelIds, selectUser,
} from '../../selectors';

const FOLLOWING_CHANNELS_LIMIT = 30;
const SUGGESTED_CHANNELS_LIMIT = 10;
// Enough recent posts per channel to also fill Read with long posts and Barruu
const POSTS_PER_CHANNEL = 8;
// Channels are fetched a few at a time so a long channel list does not hit the server's flood limit
const FETCH_BATCH_SIZE = 5;
// Reels follow Nilak for Android: up to 3 minutes, vertical or square, a few channels per round
const REEL_MAX_DURATION = 180;
const REELS_PER_CHANNEL = 10;
const REELS_CHANNELS_PER_ROUND = 10;
const PROFILE_POSTS_LIMIT = 60;

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

addActionHandler('loadNilakReels', async (global, actions, payload): Promise<void> => {
  const { isMore } = payload || {};
  const reels = global.nilakReels;
  if (reels?.isLoading || (reels?.posts && !isMore)) return;

  global = updateNilakReels(global, { isLoading: true });
  setGlobal(global);

  const suggestedChannels = await loadSuggestedChannels();
  global = getGlobal();
  const cursorByChatId = { ...global.nilakReels?.cursorByChatId };
  const channels = selectFollowingChannels(global).concat(suggestedChannels)
    .filter((chat) => cursorByChatId[chat.id] !== false);

  // Each round asks the next few channels in turn, so every channel gets its share as the user scrolls
  const start = channels.length ? (global.nilakReels?.nextChannelIndex || 0) % channels.length : 0;
  const round = channels.slice(start, start + REELS_CHANNELS_PER_ROUND)
    .concat(channels.slice(0, Math.max(0, start + REELS_CHANNELS_PER_ROUND - channels.length)));

  const seenVideoIds = new Set((global.nilakReels?.posts || []).map((post) => post.content.video!.id));
  const batch: ApiMessage[] = [];

  for (let i = 0; i < round.length; i += FETCH_BATCH_SIZE) {
    const chats = round.slice(i, i + FETCH_BATCH_SIZE);
    const results = await Promise.all(chats.map((chat) => callApi('searchMessagesInChat', {
      peer: chat, type: 'media', limit: REELS_PER_CHANNEL, offsetId: cursorByChatId[chat.id] || undefined,
    })));

    global = getGlobal();
    results.forEach((result, index) => {
      const chat = chats[index];
      if (!result) return;

      cursorByChatId[chat.id] = result.nextOffsetId || false;
      const reelPosts = result.messages
        .filter((message) => getIsReel(message) && !seenVideoIds.has(message.content.video!.id));
      reelPosts.forEach((post) => seenVideoIds.add(post.content.video!.id));
      global = addChatMessagesById(global, chat.id, buildCollectionByKey(result.messages, 'id'));
      batch.push(...reelPosts);
    });
    setGlobal(global);
  }

  global = getGlobal();
  global = updateNilakReels(global, {
    isLoading: false,
    posts: (global.nilakReels?.posts || []).concat(batch.sort((a, b) => b.date - a.date)),
    cursorByChatId,
    nextChannelIndex: start + round.length,
  });
  setGlobal(global);
});

addActionHandler('loadNilakProfile', async (global, actions): Promise<void> => {
  const { currentUserId } = global;
  if (!currentUserId) return;

  // A request during a load (the full profile arrived meanwhile) runs again once the load ends
  if (global.nilakProfile?.isLoading) {
    global = updateNilakProfile(global, { shouldReload: true });
    setGlobal(global);
    return;
  }

  global = updateNilakProfile(global, { isLoading: true, shouldReload: undefined });
  setGlobal(global);

  const channel = selectNilakProfileChannel(global, currentUserId);
  const self = selectUser(global, currentUserId)!;
  if (channel) actions.loadFullChat({ chatId: channel.id });

  const [postsResult, savedResult] = await Promise.all([
    channel
      ? callApi('fetchMessages', { chat: channel, threadId: MAIN_THREAD_ID, limit: PROFILE_POSTS_LIMIT })
      : undefined,
    callApi('searchMessagesInChat', { peer: self, type: 'media', limit: PROFILE_POSTS_LIMIT }),
  ]);

  global = getGlobal();
  if (postsResult && channel) {
    global = addUsers(global, buildCollectionByKey(postsResult.users, 'id'));
    global = addChats(global, buildCollectionByKey(postsResult.chats, 'id'));
    global = addChatMessagesById(global, channel.id, buildCollectionByKey(postsResult.messages, 'id'));
  }
  if (savedResult) {
    global = addChatMessagesById(global, currentUserId, buildCollectionByKey(savedResult.messages, 'id'));
  }
  const shouldReload = global.nilakProfile?.shouldReload;
  global = updateNilakProfile(global, {
    isLoading: false,
    shouldReload: undefined,
    channelId: channel?.id,
    posts: postsResult ? pickPosts(postsResult.messages).sort((a, b) => b.date - a.date) : [],
    postsCount: postsResult?.count,
    saved: savedResult?.messages,
  });
  setGlobal(global);

  if (shouldReload) actions.loadNilakProfile();
});

function getIsReel(message: ApiMessage) {
  const video = message.content.video;
  if (!video || video.isRound || video.isGif || video.isSpoiler) return false;

  const isVerticalOrSquare = Boolean(video.width && video.height && video.height >= video.width);
  return isVerticalOrSquare && video.duration <= REEL_MAX_DURATION;
}

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

function updateNilakReels<T extends GlobalState>(
  global: T, update: Partial<NonNullable<GlobalState['nilakReels']>>,
): T {
  return {
    ...global,
    nilakReels: {
      ...global.nilakReels,
      ...update,
    },
  };
}

function updateNilakProfile<T extends GlobalState>(
  global: T, update: Partial<NonNullable<GlobalState['nilakProfile']>>,
): T {
  return {
    ...global,
    nilakProfile: {
      ...global.nilakProfile,
      ...update,
    },
  };
}
