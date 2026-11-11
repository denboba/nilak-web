import { memo, useState } from '../../lib/teact/teact';

import type { ApiSticker, ApiVideo } from '../../api/types';
import type { IconName } from '../../types/icons';
import type { RegularLangKey } from '../../types/language';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import EmojiPicker from '../middle/composer/EmojiPicker';
import GifPicker from '../middle/composer/GifPicker';
import StickerPicker from '../middle/composer/StickerPicker';

import styles from './NilakCreate.module.scss';

type OwnProps = {
  chatId: string;
  onClose: NoneToVoidFunction;
  onEmojiSelect: (emoji: string) => void;
  onCustomEmojiSelect: (emoji: ApiSticker) => void;
  onStickerSelect: (sticker: ApiSticker) => void;
  onGifSelect: (gif: ApiVideo) => void;
};

type Tab = 'emoji' | 'stickers' | 'gifs';

const TABS: { tab: Tab; icon: IconName; langKey: RegularLangKey }[] = [
  { tab: 'emoji', icon: 'smile', langKey: 'Emoji' },
  { tab: 'stickers', icon: 'stickers', langKey: 'AccDescrStickers' },
  { tab: 'gifs', icon: 'gifs', langKey: 'GifsTab2' },
];
const ID_PREFIX = 'nilak-writer';

// Telegram's emoji, sticker and GIF pickers, beside the page like the keyboard panel of Nilak for Android
const NilakWriterSymbols = ({
  chatId, onClose, onEmojiSelect, onCustomEmojiSelect, onStickerSelect, onGifSelect,
}: OwnProps) => {
  const lang = useLang();
  const [tab, setTab] = useState<Tab>('emoji');

  function renderPicker() {
    if (tab === 'emoji') {
      return (
        <EmojiPicker
          className={styles.picker}
          idPrefix={ID_PREFIX}
          loadAndPlay
          chatId={chatId}
          onEmojiSelect={onEmojiSelect}
          onCustomEmojiSelect={onCustomEmojiSelect}
        />
      );
    }
    if (tab === 'stickers') {
      return (
        <StickerPicker
          className={styles.picker}
          idPrefix={ID_PREFIX}
          loadAndPlay
          canSendStickers
          noContextMenus
          chatId={chatId}
          onStickerSelect={onStickerSelect}
        />
      );
    }

    return <GifPicker className={styles.picker} loadAndPlay canSendGifs onGifSelect={onGifSelect} />;
  }

  return (
    // Clicks keep the caret in the page, so the chosen symbol lands where the writer was typing
    <div className={styles.symbols} onMouseDown={(e) => e.preventDefault()}>
      <div className={styles.symbolsTabs}>
        {TABS.map(({ tab: itemTab, icon, langKey }) => (
          <button
            key={itemTab}
            type="button"
            className={buildClassName(styles.tool, tab === itemTab && styles.toolActive)}
            title={lang(langKey)}
            aria-label={lang(langKey)}
            onClick={() => setTab(itemTab)}
          >
            <Icon name={icon} />
          </button>
        ))}
        <button type="button" className={styles.symbolsClose} aria-label={lang('Close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className={styles.symbolsBody}>{renderPicker()}</div>
    </div>
  );
};

export default memo(NilakWriterSymbols);
