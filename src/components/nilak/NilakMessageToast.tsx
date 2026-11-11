import {
  memo, useEffect, useRef, useState,
} from '../../lib/teact/teact';
import { getActions, getGlobal } from '../../global';

import { ALL_FOLDER_ID } from '../../config';
import { getMessageSummaryText } from '../../global/helpers/messageSummary';
import { getIsChatMuted } from '../../global/helpers/notifications';
import {
  selectChat, selectChatLastMessage, selectNotifyDefaults, selectNotifyException,
} from '../../global/selectors';
import { getOrderedIds, getUnreadChatsByFolderId } from '../../util/folderManager';
import renderText from '../common/helpers/renderText';
import { setNilakTab } from './helpers/nilakTab';

import { useFolderManagerForUnreadCounters } from '../../hooks/useFolderManager';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Avatar from '../common/Avatar';

import styles from './NilakShell.module.scss';

type Toast = { chatId: string; title: string; text: string };

const TOAST_DURATION = 5000;
// Chats loading at start raise the count too; only messages arriving after that show up
const STARTUP_GRACE = 8000;

// While Home, Reels or Read covers the chat list, a new message shows up here; tapping it opens the chat
const NilakMessageToast = () => {
  const { openChat } = getActions();
  const lang = useLang();
  const unreadCounters = useFolderManagerForUnreadCounters();
  const count = unreadCounters[ALL_FOLDER_ID]?.notificationsCount || 0;
  const previousCountRef = useRef(count);
  const [mountedAt] = useState(() => Date.now());
  const [toast, setToast] = useState<Toast | undefined>();

  useEffect(() => {
    const previousCount = previousCountRef.current;
    previousCountRef.current = count;
    if (count <= previousCount || Date.now() - mountedAt < STARTUP_GRACE) return;

    // The most recent unmuted chat with unread messages is the one that just got a message
    const global = getGlobal();
    const unreadIds = new Set(getUnreadChatsByFolderId()[ALL_FOLDER_ID]);
    const chatId = getOrderedIds(ALL_FOLDER_ID)?.find((id) => {
      const chat = selectChat(global, id);
      return chat && unreadIds.has(id)
        && !getIsChatMuted(chat, selectNotifyDefaults(global), selectNotifyException(global, id));
    });
    const chat = chatId ? selectChat(global, chatId) : undefined;
    if (!chatId || !chat) return;

    const message = selectChatLastMessage(global, chatId);
    setToast({
      chatId,
      title: chat.title,
      text: message ? getMessageSummaryText(lang, message, undefined) : '',
    });
  }, [count, lang, mountedAt]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeout = window.setTimeout(() => setToast(undefined), TOAST_DURATION);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleOpen = useLastCallback(() => {
    if (!toast) return;

    setToast(undefined);
    setNilakTab('chats');
    openChat({ id: toast.chatId });
  });

  if (!toast) return undefined;

  const chat = selectChat(getGlobal(), toast.chatId);

  return (
    <button type="button" className={styles.toast} onClick={handleOpen}>
      {chat && <Avatar peer={chat} size="small" />}
      <span className={styles.toastText}>
        <span className={styles.toastTitle}>{renderText(toast.title)}</span>
        {toast.text && <span className={styles.toastMessage}>{renderText(toast.text)}</span>}
      </span>
    </button>
  );
};

export default memo(NilakMessageToast);
