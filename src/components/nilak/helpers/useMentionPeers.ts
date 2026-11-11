import { useEffect, useState } from '../../../lib/teact/teact';
import { getGlobal } from '../../../global';

import type { ApiPeer } from '../../../api/types';

import { getMainUsername } from '../../../global/helpers';
import { selectPeer } from '../../../global/selectors';
import { callApi } from '../../../api/gramjs';

const MAX_LOCAL_CHATS = 400;
const MAX_RESULTS = 15;
const MIN_SEARCH_LENGTH = 3;
const SEARCH_DELAY = 350;

// People, channels and groups with a public username, as Nilak for Android suggests them: your chats first,
// then Telegram's search once three letters are typed. Readers open them by the `t.me` link.
export default function useMentionPeers(query?: string) {
  const [peers, setPeers] = useState<ApiPeer[]>([]);

  useEffect(() => {
    if (query === undefined) {
      setPeers([]);
      return undefined;
    }

    const normalized = query.toLowerCase();
    const local = findLocalPeers(normalized);
    setPeers(local);
    if (normalized.length < MIN_SEARCH_LENGTH) return undefined;

    let isCancelled = false;
    const timeout = window.setTimeout(async () => {
      const result = await callApi('searchChats', { query: normalized });
      if (isCancelled || !result) return;

      const global = getGlobal();
      const found = [...result.accountResultIds, ...result.globalResultIds]
        .map((id) => selectPeer(global, id))
        .filter((peer): peer is ApiPeer => Boolean(peer && getMainUsername(peer)))
        .filter((peer) => !local.some(({ id }) => id === peer.id));
      setPeers([...local, ...found].slice(0, MAX_RESULTS));
    }, SEARCH_DELAY);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query]);

  return peers;
}

function findLocalPeers(query: string) {
  const global = getGlobal();
  const ids = (global.chats.listIds.active || []).slice(0, MAX_LOCAL_CHATS);
  const found: ApiPeer[] = [];
  for (const id of ids) {
    const peer = selectPeer(global, id);
    const username = peer && getMainUsername(peer);
    if (!peer || !username) continue;

    const name = 'title' in peer ? peer.title : [peer.firstName, peer.lastName].filter(Boolean).join(' ');
    if (!query || username.toLowerCase().startsWith(query) || name?.toLowerCase().includes(query)) {
      found.push(peer);
      if (found.length >= MAX_RESULTS) break;
    }
  }

  return found;
}
