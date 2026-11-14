import type { ApiChat, ApiMessage } from '../../../api/types';
import type { GlobalState } from '../../types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { GLOBAL_SUGGESTED_CHANNELS_ID, NILAK_ALL_COMMUNITIES_KEY } from '../../../config';
import { buildCollectionByKey } from '../../../util/iteratees';
import { callApi } from '../../../api/gramjs';
import { isChatChannel } from '../../helpers';
import { addActionHandler, getGlobal, setGlobal } from '../../index';
import {
  addChatMessagesById, addChats, addUsers, replaceSimilarChannels,
} from '../../reducers';
import {
  buildNilakAlbumKey, selectChat, selectChatLastMessage, selectNilakCommunityChannels, selectSimilarChannelIds,
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

addActionHandler('loadNilakFeed', async (global, actions, payload): Promise<void> => {
  const { shouldRefresh, isMore } = payload || {};
  const feed = global.nilakFeed;
  if (feed?.isLoading || (feed?.followingPosts && !shouldRefresh && !isMore)) return;

  global = updateNilakFeed(global, { isLoading: true });
  setGlobal(global);

  const suggestedChannels = await loadSuggestedChannels();
  global = getGlobal();
  const followingChannels = selectFollowingChannels(global);
  // More posts continue from the oldest loaded post of each channel; a refresh starts again from the newest
  const cursorByChatId = isMore ? { ...global.nilakFeed?.cursorByChatId } : {};

  const [following, suggested] = await Promise.all([
    fetchChannelPosts(followingChannels, cursorByChatId),
    fetchChannelPosts(suggestedChannels, cursorByChatId),
  ]);

  global = getGlobal();
  const current = global.nilakFeed;
  global = updateNilakFeed(global, {
    isLoading: false,
    followingPosts: isMore ? (current?.followingPosts || []).concat(following.posts) : following.posts,
    suggestedPosts: isMore ? (current?.suggestedPosts || []).concat(suggested.posts) : suggested.posts,
    albums: { ...(isMore ? current?.albums : undefined), ...following.albums, ...suggested.albums },
    cursorByChatId,
    hasMore: Object.values(cursorByChatId).some((cursor) => cursor !== false),
  });
  setGlobal(global);
});

addActionHandler('loadNilakCommunityFeed', async (global, actions, payload): Promise<void> => {
  const { communityId } = payload || {};
  const key = communityId || NILAK_ALL_COMMUNITIES_KEY;
  if (global.nilakCommunityFeed?.[key]?.isLoading) return;

  const channels = selectNilakCommunityChannels(global, communityId);
  global = updateNilakCommunityFeed(global, key, { isLoading: true });
  setGlobal(global);

  const { posts, albums } = await fetchChannelPosts(channels, {});

  global = getGlobal();
  // Album photos live with Home's, where the post cards look them up
  global = updateNilakFeed(global, { albums: { ...global.nilakFeed?.albums, ...albums } });
  global = updateNilakCommunityFeed(global, key, { isLoading: false, posts });
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

async function fetchChannelPosts(channels: ApiChat[], cursorByChatId: Record<string, number | false>) {
  const posts: ApiMessage[] = [];
  const albums: Record<string, ApiMessage[]> = {};
  const pending = channels.filter((chat) => cursorByChatId[chat.id] !== false);

  for (let i = 0; i < pending.length; i += FETCH_BATCH_SIZE) {
    const batch = pending.slice(i, i + FETCH_BATCH_SIZE);
    const results = await Promise.all(batch.map((chat) => callApi('fetchMessages', {
      chat, threadId: MAIN_THREAD_ID, limit: POSTS_PER_CHANNEL, offsetId: cursorByChatId[chat.id] || undefined,
    })));

    let global = getGlobal();
    results.forEach((result, index) => {
      const chat = batch[index];
      if (!result) return;

      const { messages } = result;
      cursorByChatId[chat.id] = messages.length < POSTS_PER_CHANNEL
        ? false
        : Math.min(...messages.map((message) => message.id));

      global = addUsers(global, buildCollectionByKey(result.users, 'id'));
      global = addChats(global, buildCollectionByKey(result.chats, 'id'));
      // Stored like any loaded history, so opening, sharing and reacting work on feed posts
      global = addChatMessagesById(global, chat.id, buildCollectionByKey(messages, 'id'));
      posts.push(...pickPosts(messages));
      Object.assign(albums, collectAlbums(messages));
    });
    setGlobal(global);
  }

  return { posts: posts.sort((a, b) => b.date - a.date), albums };
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

// The photos and videos of each album, oldest first as the channel posted them
function collectAlbums(messages: ApiMessage[]) {
  const albums: Record<string, ApiMessage[]> = {};
  messages.forEach((message) => {
    const { groupedId } = message;
    if (!groupedId || !(message.content.photo || message.content.video)) return;

    const key = buildNilakAlbumKey(message.chatId, groupedId);
    (albums[key] ||= []).push(message);
  });
  Object.values(albums).forEach((album) => album.sort((a, b) => a.id - b.id));

  return albums;
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

function updateNilakCommunityFeed<T extends GlobalState>(
  global: T, key: string, update: NonNullable<GlobalState['nilakCommunityFeed']>[string],
): T {
  return {
    ...global,
    nilakCommunityFeed: {
      ...global.nilakCommunityFeed,
      [key]: {
        ...global.nilakCommunityFeed?.[key],
        ...update,
      },
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
