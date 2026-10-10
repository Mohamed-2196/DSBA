import { Fragment, useMemo, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, ImageBroken } from '@phosphor-icons/react';
import { API_ORIGIN } from '../../../api/client';
import { cx } from '../../../ui';
import { mediaSrc, safeLink } from '../lib/links';
import { parseBlocks, parseInline, type Block, type InlineToken } from '../lib/markdown';

// Everything below renders user text as React children (React escapes it): there is no HTML anywhere in this file.

function withBreaks(text: string, key: string | number): ReactNode {
  const parts = text.split('\n');
  return parts.map((p, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 ? <br /> : null}
      {p}
    </Fragment>
  ));
}

function LinkToken({ token }: { token: Extract<InlineToken, { type: 'link' }> }) {
  const target = safeLink(token.href);
  // Not a link we allow (javascript:, //host, a relative path…): the reader sees exactly what was written.
  if (!target) return <>{`[${token.text}](${token.href})`}</>;
  // A page of the app moves inside it; an API path (a download) is a plain request to the API.
  if (target.kind === 'internal') {
    return target.to.startsWith('/api/') ? <a href={`${API_ORIGIN}${target.to}`}>{token.text}</a> : <Link to={target.to}>{token.text}</Link>;
  }
  if (target.kind === 'mailto') return <a href={target.href}>{token.text}</a>;
  // Another site: opens in a new tab, never passes on who sent it, and says where it goes.
  const showsHost = token.text.toLowerCase().includes(target.host.toLowerCase());
  return (
    <a href={target.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="forum-prose__ext" title={target.href}>
      {token.text}
      {showsHost ? null : <span className="forum-prose__host"> ({target.host})</span>}
      <ArrowSquareOut aria-hidden="true" className="forum-prose__ext-icon" />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function renderInline(text: string): ReactNode {
  return parseInline(text).map((t, i) => {
    // Code keeps its own left-to-right order inside an Arabic sentence.
    if (t.type === 'code') {
      return (
        <code key={i} dir="ltr">
          {t.text}
        </code>
      );
    }
    if (t.type === 'strong') return <strong key={i}>{t.text}</strong>;
    if (t.type === 'em') return <em key={i}>{t.text}</em>;
    if (t.type === 'link') return <LinkToken key={i} token={t} />;
    return <Fragment key={i}>{withBreaks(t.text, i)}</Fragment>;
  });
}

/** A picture in a post. When it can't load (removed, or the post is hidden), a quiet note takes its place. */
function Picture({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  const url = mediaSrc(src);
  if (!url) return null;
  if (broken) {
    return (
      <p className="forum-figure is-broken" role="note">
        <ImageBroken aria-hidden="true" />
        <span>
          This picture isn’t available{alt ? `: ${alt}` : ''}.
        </span>
      </p>
    );
  }
  return (
    <figure className="forum-figure" data-hub="forum-image">
      <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </figure>
  );
}

// Every text block has dir="auto": it takes the direction of its first strong letter, so students can write in
// Arabic (right-aligned) or English (left-aligned), paragraph by paragraph, and a mixed line keeps its word order.
function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'code':
      return (
        <pre className="forum-code" dir="ltr">
          {block.lang ? <span className="forum-code__lang">{block.lang === 'r' ? 'R' : block.lang}</span> : null}
          <code>{block.text}</code>
        </pre>
      );
    case 'ul':
      return (
        <ul dir="auto">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol dir="auto">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case 'quote':
      return <blockquote dir="auto">{renderInline(block.text)}</blockquote>;
    case 'image':
      return <Picture src={block.src} alt={block.alt} />;
    default:
      return <p dir="auto">{renderInline(block.text)}</p>;
  }
}

export interface ProseProps extends HTMLAttributes<HTMLDivElement> {
  /** forum markdown (see lib/markdown.ts) */
  text: string;
}

/** Renders forum markdown as React elements. */
export function Prose({ text, className, ...rest }: ProseProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={cx('forum-prose', className)} {...rest}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}
