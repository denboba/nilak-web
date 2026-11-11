import type { TeactNode } from '../../lib/teact/teact';
import { memo, useMemo } from '../../lib/teact/teact';

import type { BarruuBlock, BarruuInline } from './helpers/barruu';

import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';
import { parseBarruu, parseBarruuInline } from './helpers/barruu';

import CustomEmoji from '../common/CustomEmoji';
import Icon from '../common/icons/Icon';
import NilakQuiz from './NilakQuiz';

import styles from './NilakReader.module.scss';

type OwnProps = {
  markdown: string;
  mediaUrls: Record<string, string>;
};

const CUSTOM_EMOJI_SIZE = 20;

// The body of a Barruu, shared by the reader and the writer's preview so both show an article the same way
const NilakBarruuBody = ({ markdown, mediaUrls }: OwnProps) => {
  const blocks = useMemo(() => parseBarruu(markdown), [markdown]);

  function renderInline(parts: BarruuInline[]): TeactNode[] {
    return parts.map((part) => {
      if (typeof part === 'string') return renderText(part, ['emoji', 'br']);

      switch (part.type) {
        case 'code':
          return <code className={styles.inlineCode}>{part.text}</code>;
        case 'bold':
          return <strong>{renderInline(part.children)}</strong>;
        case 'italic':
          return <em>{renderInline(part.children)}</em>;
        case 'strike':
          return <s>{renderInline(part.children)}</s>;
        case 'highlight':
          return <mark className={styles.highlight}>{renderInline(part.children)}</mark>;
        case 'customEmoji':
          return <CustomEmoji documentId={part.documentId} size={CUSTOM_EMOJI_SIZE} />;
        case 'link':
          return (
            <a
              className={buildClassName(styles.link, part.isMention && styles.mention)}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {renderInline(part.children)}
            </a>
          );
      }

      return undefined;
    });
  }

  function renderMarkup(text: string) {
    return renderInline(parseBarruuInline(text));
  }

  function renderMedia(block: Extract<BarruuBlock, { path: string }>) {
    const url = mediaUrls[block.path];
    if (!url) {
      // Media kept outside the package (a t.me link from the article editor) opens in a new tab
      return block.path.startsWith('http') ? renderLinkCard(block.path, block.caption) : undefined;
    }

    return (
      <figure className={styles.figure}>
        {block.type === 'video'
          ? <video className={styles.media} src={url} controls playsInline />
          : <img className={styles.media} src={url} alt={block.caption} />}
        {block.caption && <figcaption className={styles.caption}>{renderMarkup(block.caption)}</figcaption>}
      </figure>
    );
  }

  function renderLinkCard(url: string, title?: string) {
    return (
      <a className={styles.linkCard} href={url} target="_blank" rel="noopener noreferrer">
        <Icon name="link" className={styles.linkCardIcon} />
        <span className={styles.linkCardText}>{title || url}</span>
      </a>
    );
  }

  function renderBlock(block: BarruuBlock) {
    switch (block.type) {
      case 'heading': {
        const className = buildClassName(styles.heading, styles[`heading${block.level}`]);
        return block.level === 1
          ? <h2 className={className}>{renderMarkup(block.text)}</h2>
          : <h3 className={className}>{renderMarkup(block.text)}</h3>;
      }
      case 'paragraph':
        return <p className={styles.paragraph}>{renderMarkup(block.text)}</p>;
      case 'quote':
        return <blockquote className={styles.quote}>{renderMarkup(block.text)}</blockquote>;
      case 'callout':
        return (
          <div className={buildClassName(styles.callout, styles[`callout${block.kind}`])}>
            {renderMarkup(block.text)}
          </div>
        );
      case 'bullets':
        return <ul className={styles.list}>{block.items.map((item) => <li>{renderMarkup(item)}</li>)}</ul>;
      case 'numbers':
        return <ol className={styles.list}>{block.items.map((item) => <li>{renderMarkup(item)}</li>)}</ol>;
      case 'divider':
        return <div className={styles.divider} aria-hidden>• • •</div>;
      case 'code':
        return <pre className={styles.code}>{block.text}</pre>;
      case 'image':
      case 'video':
        return renderMedia(block);
      case 'link':
        return renderLinkCard(block.url);
      case 'table':
        return (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              {block.rows.map((row, rowIndex) => (
                <tr>
                  {row.map((cell) => (rowIndex === 0
                    ? <th className={styles.cell}>{renderMarkup(cell)}</th>
                    : <td className={styles.cell}>{renderMarkup(cell)}</td>))}
                </tr>
              ))}
            </table>
          </div>
        );
      case 'quiz':
        return (
          <NilakQuiz
            question={block.question}
            options={block.options}
            answer={block.answer}
            explanation={block.explanation}
          />
        );
    }

    return undefined;
  }

  return <>{blocks.map((block) => renderBlock(block))}</>;
};

export default memo(NilakBarruuBody);
