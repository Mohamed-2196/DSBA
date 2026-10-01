import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../../ui';
import { parseBlocks, parseInline } from '../lib/markdown.js';

function withBreaks(text, key) {
  const parts = text.split('\n');
  return parts.map((p, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 ? <br /> : null}
      {p}
    </Fragment>
  ));
}

function renderInline(text) {
  return parseInline(text).map((t, i) => {
    if (t.type === 'code') return <code key={i}>{t.text}</code>;
    if (t.type === 'strong') return <strong key={i}>{t.text}</strong>;
    if (t.type === 'em') return <em key={i}>{t.text}</em>;
    if (t.type === 'link') {
      return t.href.startsWith('/') ? (
        <Link key={i} to={t.href}>{t.text}</Link>
      ) : (
        <a key={i} href={t.href} target="_blank" rel="noopener noreferrer">{t.text}</a>
      );
    }
    return <Fragment key={i}>{withBreaks(t.text, i)}</Fragment>;
  });
}

function Block({ block }) {
  switch (block.type) {
    case 'code':
      return (
        <pre className="forum-code" data-lang={block.lang || undefined}>
          {block.lang ? <span className="forum-code__lang">{block.lang === 'r' ? 'R' : block.lang}</span> : null}
          <code>{block.text}</code>
        </pre>
      );
    case 'ul':
    case 'ol': {
      const List = block.type;
      return (
        <List>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </List>
      );
    }
    case 'quote':
      return <blockquote>{renderInline(block.text)}</blockquote>;
    default:
      return <p>{renderInline(block.text)}</p>;
  }
}

/** Renders forum markdown (see lib/markdown.js) as safe React elements. */
export function Prose({ text, className, ...rest }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={cx('forum-prose', className)} {...rest}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}
