import { Avatar, Button, CohortBadge, cx } from '../../../ui';
import { safeHref, safeImageSrc } from '../lib/links';
import type { Aside as AsideData, Block as BlockData, Figure as FigureData, Section } from '../types';
import { RichText } from './RichText';

/**
 * An image block: rounded, a hairline edge, a caption, space reserved from width × height (no layout
 * shift while it loads), lazy-loaded, never taller than 560px. `alt` describes the picture; `caption` is
 * the editor's line under it. Only pictures of the app or uploaded images are shown (lib/links.ts).
 */
export function Figure({ figure, className }: { figure: FigureData | null | undefined; className?: string }) {
  const src = safeImageSrc(figure?.src);
  if (!figure || !src) return null;
  const { width, height, alt, caption } = figure;
  return (
    <figure className={cx('nl-figure', height > width ? 'nl-figure--portrait' : 'nl-figure--landscape', className)}>
      <img src={src} width={width} height={height} alt={alt || ''} loading="lazy" decoding="async" />
      {caption ? <figcaption className="nl-figure__caption">{caption}</figcaption> : null}
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
    case 'steps':
      return (
        <ol className="nl-steps">
          {block.items.map((s, i) => (
            <li key={`${i}-${s.title}`} className="nl-steps__item">
              <span className="nl-steps__no" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <p className="nl-steps__title">{s.title}</p>
                <p className="nl-steps__text">
                  <RichText text={s.text} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      );
    case 'qa':
      return (
        <dl className="nl-qa">
          {block.items.map((x, i) => (
            <div key={`${i}-${x.q}`} className="nl-qa__pair">
              <dt className="nl-qa__q">{x.q}</dt>
              <dd className="nl-qa__a">
                <RichText text={x.a} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'signoff':
      return (
        <p className="nl-signoff">
          <EditorAvatars names={editors} />
          <span>{block.text}</span>
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
    case 'figure':
      return <Figure figure={block} />;
  }
}

/** Renders a list of standard copy blocks (p, list, steps, qa, signoff, cta, figure). */
export function Blocks({ blocks = [], editors = [] }: { blocks?: readonly BlockData[]; editors?: readonly string[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={`${b.type}-${i}`} block={b} editors={editors} />
      ))}
    </>
  );
}

/** A margin note beside a section: note | stats | quote | card (a typographic panel). */
export function Aside({ aside }: { aside: AsideData | null | undefined }) {
  if (!aside) return null;
  switch (aside.type) {
    case 'card':
      return (
        <aside className="nl-aside nl-aside--card" aria-label={aside.kicker}>
          <p className="nl-card__kicker">{aside.kicker}</p>
          <p className="nl-card__title">
            <span className="nl-card__mark">{aside.title}</span>
          </p>
          <p className="nl-card__text">
            <RichText text={aside.text} />
          </p>
        </aside>
      );
    case 'quote':
      return (
        <figure className="nl-aside nl-aside--quote">
          <blockquote className="nl-aside__quote">
            <p>{aside.text}</p>
          </blockquote>
          {aside.cite ? <figcaption className="nl-aside__cite">{aside.cite}</figcaption> : null}
        </figure>
      );
    case 'stats':
      return (
        <aside className="nl-aside nl-aside--stats" aria-label={aside.title}>
          <p className="nl-aside__title">{aside.title}</p>
          <dl className="nl-stats">
            {aside.items.map((s) => (
              <div key={s.label} className="nl-stats__item">
                <dt className="nl-stats__label">{s.label}</dt>
                <dd className="nl-stats__value">{s.value}</dd>
              </div>
            ))}
          </dl>
          {aside.foot ? <p className="nl-aside__foot">{aside.foot}</p> : null}
        </aside>
      );
    case 'note':
      return (
        <aside className="nl-aside nl-aside--note" aria-label={aside.title}>
          <p className="nl-aside__title">{aside.title}</p>
          <p className="nl-aside__text">
            <RichText text={aside.text} />
          </p>
        </aside>
      );
  }
}

/** Spotlight header: a typographic portrait (initials avatar, name, cohort). */
export function Profile({ profile }: { profile: Section['profile'] }) {
  if (!profile) return null;
  return (
    <div className="nl-profile">
      <Avatar name={profile.name} size={52} decorative />
      <div className="nl-profile__text">
        <p className="nl-profile__name">{profile.name}</p>
        {profile.line ? <p className="nl-profile__line">{profile.line}</p> : null}
        {profile.year ? <CohortBadge year={profile.year} size="sm" /> : null}
      </div>
    </div>
  );
}
