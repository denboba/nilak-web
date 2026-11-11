import { memo } from '../../lib/teact/teact';
import { getActions, getGlobal } from '../../global';

import type { NilakTab } from './helpers/nilakTab';

import { selectNilakProfileChannel } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import {
  getBarruuChatId, getNilakTab, getOpenedRead, openNilakBarruuWriter, setNilakTab,
} from './helpers/nilakTab';

import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import NilakCreate from './NilakCreate';
import NilakHome from './NilakHome';
import NilakRead from './NilakRead';
import NilakReader from './NilakReader';
import NilakReels from './NilakReels';

import styles from './NilakShell.module.scss';

import nilakLogo from '../../assets/nilak-logo.svg';
import nilakSprig from '../../assets/nilak-sprig.svg';

type OwnProps = {
  isNarrow?: boolean;
  isChatOpen?: boolean;
};

type NavItem = {
  tab: NilakTab;
  langKey: 'NilakHome' | 'NilakReels' | 'NilakRead' | 'Chats' | 'NilakProfile';
  path: string;
};

const NAV_ITEMS: NavItem[] = [
  { tab: 'home', langKey: 'NilakHome', path: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  {
    tab: 'reels',
    langKey: 'NilakReels',
    path: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zM10 9l5 3-5 3z',
  },
  {
    tab: 'read',
    langKey: 'NilakRead',
    path: 'M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z',
  },
  { tab: 'chats', langKey: 'Chats', path: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z' },
  { tab: 'profile', langKey: 'NilakProfile', path: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0' },
];
const PLUS_PATH = 'M12 5v14M5 12h14';

const NilakShell = ({ isNarrow, isChatOpen }: OwnProps) => {
  const { openChat, openChatWithInfo } = getActions();
  const lang = useLang();
  const tab = useDerivedState(getNilakTab);
  const openedRead = useDerivedState(getOpenedRead);
  const barruuChatId = useDerivedState(getBarruuChatId);

  // Profile opens Telegram's own profile of the person, beside their Saved Messages
  const handleNavigate = useLastCallback((itemTab: NilakTab) => {
    if (itemTab !== 'profile') {
      setNilakTab(itemTab);
      return;
    }

    setNilakTab('chats');
    openChatWithInfo({ id: getGlobal().currentUserId!, shouldReplaceHistory: true, isOwnProfile: true });
  });

  // Create opens the person's channel to post as in Telegram; without one, the Create page explains how to set it
  const handleCreate = useLastCallback(() => {
    const global = getGlobal();
    const channel = global.currentUserId ? selectNilakProfileChannel(global, global.currentUserId) : undefined;
    if (!channel) {
      openNilakBarruuWriter();
      return;
    }

    setNilakTab('chats');
    openChat({ id: channel.id });
  });
  const isPageOpen = tab !== 'chats';
  // On phones the bar gives way to an open chat, like the tab bar in Nilak for Android
  const isBarShown = !isNarrow || isPageOpen || !isChatOpen;

  function renderIcon(path: string) {
    return (
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
        <path d={path} />
      </svg>
    );
  }

  function renderPage() {
    if (tab === 'home') return <NilakHome isNarrow={isNarrow} />;
    if (tab === 'read') return <NilakRead />;
    if (tab === 'reels') return <NilakReels />;
    if (tab === 'create') return <NilakCreate chatId={barruuChatId} />;

    return undefined;
  }

  return (
    <>
      {isBarShown && (
        <nav
          className={buildClassName(
            styles.nav, isNarrow ? styles.bar : styles.rail, isPageOpen && tab !== 'reels' && styles.railWide,
          )}
        >
          {!isNarrow && (
            <div className={styles.logo}>
              <img className={styles.logoImage} src={nilakLogo} alt="" />
              <span className={styles.logoText}>Nilak</span>
            </div>
          )}
          {NAV_ITEMS.map(({ tab: itemTab, langKey, path }) => (
            <button
              key={itemTab}
              type="button"
              className={buildClassName(styles.item, tab === itemTab && styles.active)}
              onClick={() => handleNavigate(itemTab)}
            >
              {renderIcon(path)}
              <span className={styles.label}>{lang(langKey)}</span>
            </button>
          ))}
          {!isNarrow && (
            <button
              type="button"
              className={buildClassName(styles.create, tab === 'create' && styles.active)}
              onClick={handleCreate}
            >
              {renderIcon(PLUS_PATH)}
              <span className={styles.label}>{lang('NilakCreate')}</span>
            </button>
          )}
        </nav>
      )}
      {isPageOpen && (
        <div
          className={buildClassName(
            styles.page, !isNarrow && styles.pageBesideRail, tab === 'reels' && styles.pageReels, 'custom-scroll',
          )}
        >
          {isNarrow && tab !== 'reels' && (
            <div className={styles.mobileTop}>
              <img className={styles.logoImage} src={nilakLogo} alt="" />
              <span className={styles.logoText}>Nilak</span>
              <button
                type="button"
                className={styles.mobileCreate}
                aria-label={lang('NilakCreate')}
                onClick={handleCreate}
              >
                {renderIcon(PLUS_PATH)}
              </button>
            </div>
          )}
          {tab !== 'reels' && <img className={styles.sprig} src={nilakSprig} alt="" aria-hidden draggable={false} />}
          <div className={styles.pageContent}>{renderPage()}</div>
        </div>
      )}
      {openedRead && (
        <NilakReader
          chatId={openedRead.chatId}
          messageId={openedRead.messageId}
          fallbackMessage={openedRead.message}
        />
      )}
    </>
  );
};

export default memo(NilakShell);
