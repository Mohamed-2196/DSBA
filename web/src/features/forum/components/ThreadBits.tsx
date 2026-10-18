// Small presentational pieces shared by rows, the thread page and the public widgets.
import type { CSSProperties, ReactNode } from 'react';
import { ChatCircle, CheckCircle } from '@phosphor-icons/react';
import type { ModuleSummary, ThreadSummary, UserPublic } from '../../../api/types';
import { Badge, CohortBadge, Highlight, cx } from '../../../ui';
import { cohortTextColor } from '../../../state';
import { roleFlair } from '../lib/authors';
import { placeOf, useTaxonomy } from '../lib/taxonomy';
import { FORUM_ICONS } from './forumIcons';
import { RollingNumber } from './RollingNumber';

/** Module as a typographic object: the unit code in its cohort colour, then the short name. */
export function ModuleTag({
  module,
  showName = true,
  className,
}: {
  module: ModuleSummary | null | undefined;
  showName?: boolean;
  className?: string;
}) {
  if (!module) return null;
  return (
    <span
      className={cx('forum-module', className)}
      style={{ '--forum-c': cohortTextColor(module.year) } as CSSProperties}
    >
      {module.unitCode ? <span className="forum-module__code">{module.unitCode}</span> : null}
      {showName || !module.unitCode ? (
        <span className={cx('forum-module__name', !module.unitCode && 'is-solo')}>{module.shortName}</span>
      ) : null}
    </span>
  );
}

/** Where the thread lives (placeOf): Year 2 in its colour, or Study group with its picture. Nothing until the
 *  categories have loaded. */
export function PlaceBadge({ thread, size = 'sm' }: { thread: Pick<ThreadSummary, 'category'>; size?: 'sm' | 'md' }) {
  const { getCategory } = useTaxonomy();
  const place = placeOf(getCategory(thread.category));
  if (!place) return null;
  if (place.year == null) {
    return (
      <Badge tone="neutral" size={size} icon={FORUM_ICONS[place.icon].icon} className="forum-place">
        {place.label}
      </Badge>
    );
  }
  return <CohortBadge year={place.year} label={place.label} variant="dot" size={size} className="forum-place" />;
}

/** 'Student rep' (moderators) or 'Admin' as a small neutral pill. It goes where a year badge would go, and replaces it. */
export function AuthorFlair({
  author,
  size = 'sm',
  className,
}: {
  author: UserPublic | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const flair = roleFlair(author);
  if (!flair) return null;
  return (
    <Badge tone="neutral" size={size} className={cx('forum-flair', className)}>
      {flair}
    </Badge>
  );
}

export function TagBadges({ tags = [], max = 3 }: { tags?: string[]; max?: number }) {
  const { getTag } = useTaxonomy();
  return (
    <>
      {tags.slice(0, max).map((id) => (
        <Badge key={id} tone="outline" size="sm" className="forum-tag">
          {getTag(id)?.label ?? id}
        </Badge>
      ))}
    </>
  );
}

/** Reply count; turns green with a check when the thread has an accepted answer. */
export function ReplyCount({
  count,
  answered = false,
  className,
}: {
  count: number;
  answered?: boolean;
  className?: string;
}) {
  const Icon = answered ? CheckCircle : ChatCircle;
  return (
    <span className={cx('forum-count', answered && 'is-answered', !count && 'is-zero', className)}>
      <Icon weight={answered ? 'fill' : 'bold'} aria-hidden="true" />
      <RollingNumber value={count} />
      <span className="visually-hidden">
        {count === 1 ? ' reply' : ' replies'}
        {answered ? ', answered' : ''}
      </span>
    </span>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Arabic letters join: a highlight that ends inside a word cuts the join, so a match inside an Arabic word marks the whole word.
const ARABIC_REST = '[\\p{Script=Arabic}\\p{M}]*';

/** Text with search terms marked by the highlighter. */
export function HighlightedText({ text, terms }: { text: string; terms?: string[] }): ReactNode {
  if (!terms?.length) return text;
  const re = new RegExp(`(${ARABIC_REST}(?:${terms.map(escapeRe).join('|')})${ARABIC_REST})`, 'giu');
  return text.split(re).map((part, i) => (i % 2 ? <Highlight key={i}>{part}</Highlight> : part));
}
