import { Link } from 'react-router-dom';
import { CaretRight, CheckCircle, EyeSlash, LockSimple } from '@phosphor-icons/react';
import type { ThreadDetail } from '../../../api/types';
import { Badge, PageHeader } from '../../../ui';
import { useModules } from '../../../state/modules';
import { useTaxonomy } from '../lib/taxonomy';
import { ModuleTag, PlaceBadge, TagBadges } from './ThreadBits';

/** The thread page's breadcrumb (also while it loads). */
export function ThreadCrumbs({ category }: { category?: { id: string; label: string } | null }) {
  return (
    <nav className="forum-crumbs" aria-label="Breadcrumb">
      <Link to="/forum">Forum</Link>
      {category ? (
        <>
          <CaretRight aria-hidden="true" weight="bold" />
          <Link to={`/forum?cohort=${category.id}`}>{category.label}</Link>
        </>
      ) : null}
    </nav>
  );
}

/**
 * Breadcrumb, title and what the thread is: answered or waiting, pinned, locked, hidden, where it lives, its module and
 * tags. `unavailable`: it was hidden or deleted after the page loaded (it waits for nothing any more).
 */
export function ThreadHeader({ thread, unavailable = false }: { thread: ThreadDetail; unavailable?: boolean }) {
  const { getModule } = useModules();
  const { getCategory } = useTaxonomy();
  const deleted = thread.status === 'deleted';
  return (
    <>
      <ThreadCrumbs category={getCategory(thread.category)} />
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
              <Badge tone="signal" icon={CheckCircle}>
                Answered
              </Badge>
            ) : thread.replyCount === 0 && thread.status === 'visible' && !unavailable ? (
              <Badge tone="outline">Waiting for a first reply</Badge>
            ) : null}
            {thread.pinned ? <Badge tone="cobalt">Pinned</Badge> : null}
            {thread.locked ? (
              <Badge tone="neutral" icon={LockSimple}>
                Locked
              </Badge>
            ) : null}
            {thread.status === 'hidden' ? (
              <Badge tone="alert" icon={EyeSlash}>
                Hidden
              </Badge>
            ) : null}
            {deleted ? <Badge tone="outline">Deleted</Badge> : null}
            <PlaceBadge thread={thread} size="md" />
            <ModuleTag module={getModule(thread.moduleId)} className="forum-thread__module" />
            <TagBadges tags={thread.tags} />
          </>
        }
      />
    </>
  );
}
