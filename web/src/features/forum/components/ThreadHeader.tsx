import { Link } from 'react-router-dom';
import type { ThreadDetail } from '../../../api/types';
import { Badge, Icon, PageHeader, glyph, timeAgo } from '../../../ui';
import { useModules } from '../../../state/modules';
import { useTaxonomy } from '../lib/taxonomy';
import { AnsweredBadge, ModuleChip, TagBadges } from './ThreadBits';

/** The thread page's breadcrumb (also while it loads): back to the forum, then the thread's category and module. */
export function ThreadCrumbs({
  category,
  module,
}: {
  category?: { id: string; label: string } | null;
  module?: { id: string; unitCode: string | null; shortName: string } | null;
}) {
  return (
    <nav className="forum-crumbs" aria-label="Breadcrumb">
      <Link to="/forum" className="forum-crumbs__back">
        <Icon glyph={glyph.chevronLeft} />
        Forum
      </Link>
      {category ? (
        <>
          <span aria-hidden="true">/</span>
          <Link to={`/forum?cohort=${category.id}`}>{category.label}</Link>
        </>
      ) : null}
      {module ? (
        <>
          <span aria-hidden="true">/</span>
          <Link to={`/forum?module=${module.id}`} className={module.unitCode ? 'u-code' : undefined}>
            {module.unitCode || module.shortName}
          </Link>
        </>
      ) : null}
    </nav>
  );
}

/**
 * Breadcrumb, title and what the thread is: answered or waiting, pinned, locked, hidden, its module and tags, and
 * its replies, votes and age. `unavailable`: it was hidden or deleted after the page loaded (it waits for nothing any
 * more).
 */
export function ThreadHeader({ thread, unavailable = false }: { thread: ThreadDetail; unavailable?: boolean }) {
  const { getModule } = useModules();
  const { getCategory } = useTaxonomy();
  const deleted = thread.status === 'deleted';
  const module = getModule(thread.moduleId);
  return (
    <>
      <ThreadCrumbs category={getCategory(thread.category)} module={module} />
      <PageHeader
        className="forum-thread__header"
        // dir="auto" on a block of its own: an Arabic title sits right-aligned, an English one left-aligned.
        title={
          <span className="forum-thread__title" dir="auto">
            {thread.title}
          </span>
        }
        meta={
          <>
            {thread.answered ? (
              <AnsweredBadge />
            ) : thread.replyCount === 0 && thread.status === 'visible' && !unavailable ? (
              <Badge tone="outline">Waiting for a first reply</Badge>
            ) : null}
            {thread.pinned ? <Badge tone="cobalt">Pinned</Badge> : null}
            {thread.locked ? (
              <Badge tone="neutral" icon={<Icon glyph={glyph.lock} />}>
                Locked
              </Badge>
            ) : null}
            {thread.status === 'hidden' ? (
              <Badge tone="alert" icon={<Icon glyph={glyph.eyeOff} />}>
                Hidden
              </Badge>
            ) : null}
            {deleted ? <Badge tone="outline">Deleted</Badge> : null}
            <ModuleChip module={module} />
            <TagBadges tags={thread.tags} />
            <span className="forum-thread__stats">
              {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'} · {thread.voteCount}{' '}
              {thread.voteCount === 1 ? 'vote' : 'votes'} · asked {timeAgo(thread.createdAt)}
            </span>
          </>
        }
      />
    </>
  );
}
