import { memo, useState } from '../../lib/teact/teact';

import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import useLang from '../../hooks/useLang';

import styles from './NilakReader.module.scss';

type OwnProps = {
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
};

// A quiz kept in the Barruu: the reader picks an option and sees the right one, like in Nilak for Android
const NilakQuiz = ({
  question, options, answer, explanation,
}: OwnProps) => {
  const lang = useLang();
  const [picked, setPicked] = useState<number | undefined>();
  const isAnswered = picked !== undefined;

  return (
    <div className={styles.quiz}>
      <div className={styles.quizLabel}>{lang('NilakQuiz')}</div>
      <div className={styles.quizQuestion}>{renderText(question)}</div>
      {options.map((option, index) => (
        <button
          type="button"
          className={buildClassName(
            styles.quizOption,
            isAnswered && index === answer && styles.quizRight,
            isAnswered && index === picked && index !== answer && styles.quizWrong,
          )}
          disabled={isAnswered}
          onClick={() => setPicked(index)}
        >
          {renderText(option)}
        </button>
      ))}
      {isAnswered && explanation && <div className={styles.quizExplanation}>{renderText(explanation)}</div>}
    </div>
  );
};

export default memo(NilakQuiz);
