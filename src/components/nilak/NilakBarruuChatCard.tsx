import { memo } from '../../lib/teact/teact';

import type { ApiMessage } from '../../api/types';

import renderText from '../common/helpers/renderText';
import { getBarruuTitle, getReadMinutes } from './helpers/barruu';
import { setOpenedRead } from './helpers/nilakTab';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import styles from './NilakBarruuChatCard.module.scss';

type OwnProps = {
  message: ApiMessage;
};

// A Barruu in a chat shows as an article card instead of a zip file, like in Nilak for Android
const NilakBarruuChatCard = ({ message }: OwnProps) => {
  const lang = useLang();
  const minutes = getReadMinutes(message);

  const handleOpen = useLastCallback(() => {
    setOpenedRead({ chatId: message.chatId, messageId: message.id });
  });

  return (
    <div className={styles.card} onClick={handleOpen}>
      <div className={styles.cover}>✿</div>
      <div className={styles.info}>
        <span className={styles.tag}>
          ✿ BARRUU
          {Boolean(minutes) && ` · ${lang('NilakReadMinutes', { count: minutes }, { pluralValue: minutes })}`}
        </span>
        <span className={styles.title}>{renderText(getBarruuTitle(message))}</span>
        <button type="button" className={styles.read}>{lang('NilakRead')}</button>
      </div>
    </div>
  );
};

export default memo(NilakBarruuChatCard);
