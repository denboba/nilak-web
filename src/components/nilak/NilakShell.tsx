import { memo } from '../../lib/teact/teact';

import type { NilakTab } from './helpers/nilakTab';

import { NILAK_ANDROID_URL } from '../../config';
import buildClassName from '../../util/buildClassName';
import { getNilakTab, getOpenedRead, setNilakTab } from './helpers/nilakTab';

import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';

import NilakHome from './NilakHome';
import NilakRead from './NilakRead';
import NilakReader from './NilakReader';

import styles from './NilakShell.module.scss';

import nilakLogo from '../../assets/nilak-logo.svg';

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
  const lang = useLang();
  const tab = useDerivedState(getNilakTab);
  const openedRead = useDerivedState(getOpenedRead);
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

    const title = tab === 'create' ? lang('NilakCreate') : lang(NAV_ITEMS.find((item) => item.tab === tab)!.langKey);
    return (
      <div className={styles.soon}>
        <img className={styles.soonLogo} src={nilakLogo} alt="" />
        <h2 className={styles.soonTitle}>{lang('NilakSoonTitle', { tab: title })}</h2>
        <p className={styles.soonText}>{lang('NilakSoonText')}</p>
        <a className={styles.soonLink} href={NILAK_ANDROID_URL} target="_blank" rel="noopener noreferrer">
          {lang('NilakGetAndroid')}
        </a>
      </div>
    );
  }

  return (
    <>
      {isBarShown && (
        <nav className={buildClassName(styles.nav, isNarrow ? styles.bar : styles.rail, isPageOpen && styles.railWide)}>
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
              onClick={() => setNilakTab(itemTab)}
            >
              {renderIcon(path)}
              <span className={styles.label}>{lang(langKey)}</span>
            </button>
          ))}
          {!isNarrow && (
            <button
              type="button"
              className={buildClassName(styles.create, tab === 'create' && styles.active)}
              onClick={() => setNilakTab('create')}
            >
              {renderIcon(PLUS_PATH)}
              <span className={styles.label}>{lang('NilakCreate')}</span>
            </button>
          )}
        </nav>
      )}
      {isPageOpen && (
        <div className={buildClassName(styles.page, !isNarrow && styles.pageBesideRail, 'custom-scroll')}>
          {isNarrow && (
            <div className={styles.mobileTop}>
              <img className={styles.logoImage} src={nilakLogo} alt="" />
              <span className={styles.logoText}>Nilak</span>
              <button
                type="button"
                className={styles.mobileCreate}
                aria-label={lang('NilakCreate')}
                onClick={() => setNilakTab('create')}
              >
                {renderIcon(PLUS_PATH)}
              </button>
            </div>
          )}
          {renderPage()}
        </div>
      )}
      {openedRead && <NilakReader chatId={openedRead.chatId} messageId={openedRead.messageId} />}
    </>
  );
};

export default memo(NilakShell);
