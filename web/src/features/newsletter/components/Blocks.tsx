import type { IssueFigure } from '../../../api/types';
import { Avatar, Button, cx } from '../../../ui';
import { safeHref, safeImageSrc } from '../lib/links';
import { plainText } from '../lib/text';
import type { Aside as AsideData, Block as BlockData } from '../types';
import { RichText } from './RichText';

/**
 * A section's picture: rounded, a hairline edge, a caption, space reserved from width × height (no layout shift
 * while it loads), lazy-loaded, never taller than 560px. `alt` describes the picture; `caption` is the editor's
 * line under it. Only pictures of the app or uploaded images are shown (lib/links.ts).
 */
export function Figure({ figure, className }: { figure: IssueFigure | null | undefined; className?: string }) {
  const src = safeImageSrc(figure?.src);
  if (!figure || !src) return null;
  const { width, height, alt, caption } = figure;
  return (
    <figure className={cx('nl-figure', height > width ? 'nl-figure--portrait' : 'nl-figure--landscape', className)}>
      <img src={src} width={width} height={height} alt={alt} loading="lazy" decoding="async" />
      {caption ? (
        <figcaption className="nl-figure__caption">
          <RichText text={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/** The issue's editors as a row of initials (their names are printed next to it). */
export function EditorAvatars({ names = [], size = 28 }: { names?: readonly string[]; size?: number }) {
  if (!names.length) return null;
  return (
    <span className="nl-avatars" aria-hidden="true">
      {names.map((name) => (
        <Avatar key={name} name={name} size={size} decorative className="nl-avatars__item" />
      ))}
    </span>
  );
}

function Block({ block, editors }: { block: BlockData; editors: readonly string[] }) {
  switch (block.type) {
    case 'p':
      return (
        <p className={cx('nl-p', block.lead && 'nl-p--lead')}>
          <RichText text={block.text} />
        </p>
      );
    case 'list':
      return (
        <ul className="nl-list">
          {block.items.map((item, i) => (
            <li key={`${i}-${item}`}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case 'signoff':
      return (
        <p className="nl-signoff">
          <EditorAvatars names={editors} />
          <span>
            <RichText text={block.text} />
          </span>
        </p>
      );
    case 'cta': {
      const target = safeHref(block.to);
      if (!target) return null;
      return (
        <p className="nl-cta">
          {target.kind === 'internal' ? (
            <Button to={target.to} variant="secondary">
              {block.label}
            </Button>
          ) : (
            <Button href={target.href} variant="secondary">
              {block.label}
            </Button>
          )}
        </p>
      );
    }
  }
}

/** A section's copy: paragraphs, bulleted lists, the editors' sign-off and buttons. */
export function Blocks({ blocks = [], editors = [] }: { blocks?: readonly BlockData[]; editors?: readonly string[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={`${b.type}-${i}`} block={b} editors={editors} />
      ))}
    </>
  );
}

/** Beside the copy: a typographic card, or a few numbers. */
export function Aside({ aside }: { aside: AsideData | null | undefined }) {
  if (!aside) return null;
  switch (aside.type) {
    case 'card':
      return (
        <aside className="nl-aside nl-aside--card" aria-label={plainText(aside.kicker)}>
          <p className="nl-card__kicker">{plainText(aside.kicker)}</p>
          <p className="nl-card__title">
            <span className="nl-card__mark">{plainText(aside.title)}</span>
          </p>
          <p className="nl-card__text">
            <RichText text={aside.text} />
          </p>
        </aside>
      );
    case 'stats':
      return (
        <aside className="nl-aside nl-aside--stats" aria-label={plainText(aside.title)}>
          <p className="nl-aside__title">{plainText(aside.title)}</p>
          <dl className="nl-stats">
            {aside.items.map((s, i) => (
              <div key={`${i}-${s.label}`} className="nl-stats__item">
                <dt className="nl-stats__label">
                  <RichText text={s.label} />
                </dt>
                <dd className="nl-stats__value">{s.value}</dd>
              </div>
            ))}
          </dl>
          {aside.foot ? (
            <p className="nl-aside__foot">
              <RichText text={aside.foot} />
            </p>
          ) : null}
        </aside>
      );
  }
}
