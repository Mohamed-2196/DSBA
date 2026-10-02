// Small presentational pieces shared by rows, the thread page and the public widgets.
import { ChatCircle, ChatsCircle, CheckCircle, UsersThree } from '@phosphor-icons/react';
import { Badge, CohortBadge, Highlight, cx } from '../../../ui';
import { cohortTextColor } from '../../../state';
import { getTag } from '../data/taxonomy.js';
import { RollingNumber } from './RollingNumber.jsx';

/** Module as a typographic object: the unit code in its cohort colour, then the short name. */
export function ModuleTag({ module, showName = true, className }) {
  if (!module) return null;
  return (
    <span className={cx('forum-module', className)} style={{ '--forum-c': cohortTextColor(module.year) }}>
      {module.unitCode ? <span className="forum-module__code">{module.unitCode}</span> : null}
      {showName || !module.unitCode ? <span className={cx('forum-module__name', !module.unitCode && 'is-solo')}>{module.shortName}</span> : null}
    </span>
  );
}

/** Where the thread lives: the cohort (Year 1/2/3), or Study group / General. */
export function PlaceBadge({ thread, size = 'sm' }) {
  if (thread.category === 'study-groups') {
    return <Badge tone="neutral" size={size} icon={UsersThree} className="forum-place">Study group</Badge>;
  }
  if (thread.category === 'general') {
    return <Badge tone="neutral" size={size} icon={ChatsCircle} className="forum-place">General</Badge>;
  }
  return <CohortBadge year={thread.year} variant="dot" size={size} className="forum-place" />;
}

/**
 * An author's flair (a joke label, or 'Student rep' for the signed-in student rep) as a small neutral pill.
 * It goes where a year badge would go, and replaces the year. Renders nothing for an author without one.
 */
export function AuthorFlair({ author, size = 'sm', className }) {
  if (!author?.flair) return null;
  return (
    <Badge tone="neutral" size={size} className={cx('forum-flair', className)}>
      {author.flair}
    </Badge>
  );
}

export function TagBadges({ tags = [], max = 3 }) {
  return tags.slice(0, max).map((id) => (
    <Badge key={id} tone="outline" size="sm" className="forum-tag">
      {getTag(id)?.label || id}
    </Badge>
  ));
}

/** Reply count; turns green with a check when the thread has an accepted answer. */
export function ReplyCount({ count, answered = false, className }) {
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

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Arabic letters join: a highlight that ends inside a word cuts the join, so a match inside an Arabic word marks the whole word.
const ARABIC_REST = '[\\p{Script=Arabic}\\p{M}]*';

/** Text with search terms marked by the highlighter. */
export function HighlightedText({ text, terms }) {
  if (!terms?.length) return text;
  const re = new RegExp(`(${ARABIC_REST}(?:${terms.map(escapeRe).join('|')})${ARABIC_REST})`, 'giu');
  return text.split(re).map((part, i) => (i % 2 ? <Highlight key={i}>{part}</Highlight> : part));
}
