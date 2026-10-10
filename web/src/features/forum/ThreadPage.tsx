import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowBendUpLeft,
  CaretRight,
  ChatCircleText,
  CheckCircle,
  Eye,
  EyeSlash,
  LinkSimple,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Plus,
  PushPin,
  PushPinSlash,
  Trash,
} from '@phosphor-icons/react';
import type { Reply, ThreadDetail, ThreadModeration } from '../../api/types';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { Badge, Button, EmptyState, Page, PageHeader, Panel, SegmentedControl, Skeleton, timeAgo } from '../../ui';
import { useDocumentTitle, useToast } from '../../state';
import { useModules } from '../../state/modules';
import { ReportButton } from './ReportButton';
import { isNotFound, useDeleteThread, useForumViewerSync, useModerateThread, useThread, useThreadVote } from './api';
import { authorName, postYear, roleFlair } from './lib/authors';
import { useTaxonomy } from './lib/taxonomy';
import type { ReplyNode, ReplyOrder } from './types';
import { AuthorAvatar } from './components/AuthorAvatar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LoadError } from './components/LoadStates';
import { PostMenu } from './components/PostMenu';
import { Prose } from './components/Prose';
import { ReplyComposer } from './components/ReplyComposer';
import { ReplyItem } from './components/ReplyItem';
import { AuthorFlair, ModuleTag, PlaceBadge, TagBadges } from './components/ThreadBits';
import { ThreadEditForm } from './components/ThreadEditForm';
import { ThreadSidebar } from './components/ThreadSidebar';
import { VoteButton } from './components/VoteButton';
import './components/forum.css';
import './ForumPage.css';
import './ThreadPage.css';

const ORDERS: { value: ReplyOrder; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'oldest', label: 'Oldest' },
];

/** Replies as [{ ...reply, children }] (one level), ordered for display: the accepted answer first. */
function nestReplies(replies: Reply[], order: ReplyOrder, acceptedId: string | null): ReplyNode[] {
  const ids = new Set(replies.map((r) => r.id));
  const top: Reply[] = [];
  const byParent = new Map<string, Reply[]>();
  for (const r of replies) {
    if (r.parentId && ids.has(r.parentId)) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    else top.push(r);
  }
  const rank = (r: Reply) => (r.accepted || r.id === acceptedId ? 1 : 0);
  const time = (r: Reply) => Date.parse(r.createdAt) || 0;
  if (order === 'top') top.sort((a, b) => rank(b) - rank(a) || b.voteCount - a.voteCount || time(a) - time(b));
  else top.sort((a, b) => rank(b) - rank(a) || time(a) - time(b));
  return (
    top
      .map((r) => ({ ...r, children: (byParent.get(r.id) ?? []).filter((c) => c.status !== 'deleted') }))
      // A deleted reply only keeps its place when replies under it still need it.
      .filter((r) => r.status !== 'deleted' || r.children.length > 0)
  );
}

export default function ThreadPage() {
  useForumViewerSync();
  const { threadId: slug = '' } = useParams();
  const query = useThread(slug);
  const notFound = !query.data && query.isError && isNotFound(query.error);
  useDocumentTitle(query.data ? query.data.title : notFound ? 'Thread not found' : null);

  if (query.data) return <ThreadView key={query.data.id} thread={query.data} />;
  if (query.isPending) return <ThreadSkeleton />;
  if (notFound) {
    return (
      <Page className="forum-page">
        <Panel padding="none">
          <EmptyState
            icon={ChatCircleText}
            title="We couldn't find that thread"
            body="The link may be wrong, or the thread was removed. Browse the forum or start a new thread."
            action={
              <>
                <Button variant="primary" to="/forum">
                  Browse the forum
                </Button>
                <Button to="/forum/new" leadingIcon={Plus}>
                  Start a thread
                </Button>
              </>
            }
          />
        </Panel>
      </Page>
    );
  }
  return (
    <Page className="forum-page">
      <nav className="forum-crumbs" aria-label="Breadcrumb">
        <Link to="/forum">Forum</Link>
      </nav>
      <LoadError error={query.error} title="Couldn't load this thread" onRetry={() => void query.refetch()} />
    </Page>
  );
}

function ThreadSkeleton() {
  return (
    <Page className="forum-page forum-thread" aria-busy="true">
      <nav className="forum-crumbs" aria-label="Breadcrumb">
        <Link to="/forum">Forum</Link>
      </nav>
      <div className="forum-thread__header">
        <Skeleton width="min(640px, 90%)" height="2.2em" />
        <Skeleton width={260} height="1.2em" style={{ marginTop: 14 }} />
      </div>
      <div className="forum-thread__layout">
        <div className="forum-thread__main">
          <Panel as="div" padding="none" className="forum-op">
            <div className="forum-op__vote">
              <Skeleton width={56} height={66} radius="var(--r-control)" />
            </div>
            <div className="forum-op__main">
              <Skeleton width={180} height="1em" />
              <Skeleton lines={4} style={{ marginTop: 18 }} />
            </div>
          </Panel>
        </div>
      </div>
      <span className="visually-hidden" role="status">
        Loading the thread
      </span>
    </Page>
  );
}

function ThreadView({ thread }: { thread: ThreadDetail }) {
  const { requireAuth } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { getModule } = useModules();
  const { getCategory } = useTaxonomy();
  const [params, setParams] = useSearchParams();
  const order: ReplyOrder = params.get('order') === 'oldest' ? 'oldest' : 'top';
  const vote = useThreadVote();
  const moderate = useModerateThread();
  const removeThread = useDeleteThread();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ parent: Reply; mention: string | null; key: string } | null>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);

  // Replies that arrive while the page is open (yours, or a classmate's on the next refresh) animate in.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(thread.replies.map((r) => r.id));
  const isFresh = (id: string) => !seen.current?.has(id);

  const replies = useMemo(() => nestReplies(thread.replies, order, thread.acceptedReplyId), [thread.replies, order, thread.acceptedReplyId]);
  const category = getCategory(thread.category);
  const module = getModule(thread.moduleId);
  const deleted = thread.status === 'deleted';
  const hidden = thread.status === 'hidden';
  // Replies need a visible thread; a locked one only takes replies from student reps (and admins).
  const canReply = thread.status === 'visible' && (!thread.locked || thread.canModerate);
  const year = postYear(thread.authorYear, thread.author);
  const flair = roleFlair(thread.author);
  // What stands before 'posted' in the byline: a flair (shown as a pill next to the name) replaces the year.
  const byline = flair ? null : year ? `Year ${year}` : null;

  // A link to one reply (#reply-<id>, from a notification or a report) scrolls to it once the thread is here.
  // Pictures above it load later and push it down, so it is kept in view while the page settles (a few seconds),
  // until the person scrolls themselves.
  const targetId = location.hash.startsWith('#reply-') ? location.hash.slice('#reply-'.length) : null;
  const scrolledTo = useRef<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!targetId || scrolledTo.current === targetId) return undefined;
    const el = document.getElementById(`reply-${targetId}`);
    const main = mainRef.current;
    if (!el || !main) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const place = (smooth: boolean) => el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'center' });
    // Marked as done only once it has really scrolled (an effect can be set up, torn down and set up again).
    const raf = requestAnimationFrame(() => {
      scrolledTo.current = targetId;
      place(true);
    });
    let settling = true;
    const stop = () => {
      settling = false;
    };
    const ro = new ResizeObserver(() => {
      if (settling) place(false);
    });
    ro.observe(main);
    const until = window.setTimeout(stop, 4000);
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    for (const ev of events) window.addEventListener(ev, stop, { passive: true, once: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.clearTimeout(until);
      for (const ev of events) window.removeEventListener(ev, stop);
    };
  }, [targetId, thread.replies]);

  const toggleVote = () => {
    const up = !thread.voted;
    if (!requireAuth('Sign in to vote', () => vote.mutate({ threadId: thread.id, up: true }))) return;
    vote.mutate({ threadId: thread.id, up });
  };

  const startReply = (reply: Reply) => {
    // One level of nesting: replying to a nested reply attaches to its parent and mentions the person.
    const parent = reply.parentId ? (thread.replies.find((r) => r.id === reply.parentId) ?? reply) : reply;
    const mention = reply.parentId && !reply.isMine && reply.author ? authorName(reply.author) : null;
    setReplyingTo({ parent, mention, key: `${reply.id}-${Date.now()}` });
  };

  const focusComposer = () => {
    const el = composerInput.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  };

  const copyLink = async () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const url = `${window.location.origin}${base}/forum/${thread.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      push({ title: 'Link copied', body: 'Paste it anywhere to share this thread.', tone: 'success' });
    } catch {
      push({ title: "Couldn't copy the link", body: 'Copy it from the address bar instead.', tone: 'alert' });
    }
  };

  const scrollToReply = (reply: Reply) => {
    requestAnimationFrame(() => {
      document.getElementById(`reply-${reply.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const runModeration = (change: ThreadModeration, done: { title: string; body?: string }) => {
    moderate.mutate(
      { threadId: thread.id, change },
      {
        onSuccess: () => push({ ...done, tone: 'success' }),
        onError: (e) => push({ title: "That didn't work", body: errorMessage(e), tone: 'alert' }),
      },
    );
  };

  return (
    <Page className="forum-page forum-thread">
      <nav className="forum-crumbs" aria-label="Breadcrumb">
        <Link to="/forum">Forum</Link>
        <CaretRight aria-hidden="true" weight="bold" />
        {category ? <Link to={`/forum?cohort=${category.id}`}>{category.label}</Link> : null}
      </nav>

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
            ) : thread.replyCount === 0 && !deleted ? (
              <Badge tone="outline">Waiting for a first reply</Badge>
            ) : null}
            {thread.pinned ? <Badge tone="cobalt">Pinned</Badge> : null}
            {thread.locked ? (
              <Badge tone="neutral" icon={LockSimple}>
                Locked
              </Badge>
            ) : null}
            {hidden ? (
              <Badge tone="alert" icon={EyeSlash}>
                Hidden
              </Badge>
            ) : null}
            <PlaceBadge thread={thread} size="md" />
            <ModuleTag module={module} className="forum-thread__module" />
            <TagBadges tags={thread.tags} />
          </>
        }
      />

      <div className="forum-thread__layout">
        <div className="forum-thread__main" ref={mainRef}>
          {hidden && thread.canModerate ? (
            <div className="forum-notice is-alert" role="note">
              <EyeSlash aria-hidden="true" weight="bold" className="forum-notice__icon" />
              <span className="forum-notice__text">
                <strong>This thread is hidden.</strong> Only student reps and admins can see it. If it was reported, resolve the report in
                Moderation.
              </span>
              <Button
                size="sm"
                leadingIcon={Eye}
                loading={moderate.isPending}
                onClick={() => runModeration({ status: 'visible' }, { title: 'Thread visible again', body: 'Everyone can see it now.' })}
              >
                Unhide
              </Button>
            </div>
          ) : null}

          <Panel as="article" padding="none" className="forum-op" data-hub="thread-op" aria-label="Original post">
            <div className="forum-op__vote">
              <VoteButton size="lg" count={thread.voteCount} voted={thread.voted} onToggle={toggleVote} disabled={deleted || hidden} />
            </div>
            <div className="forum-op__main">
              <header className="forum-byline">
                <AuthorAvatar author={thread.author} size="md" />
                <span className="forum-byline__text">
                  <span className="forum-byline__who">
                    <span className="forum-byline__name">{authorName(thread.author)}</span>
                    <AuthorFlair author={thread.author} />
                  </span>
                  <span className="forum-byline__meta">
                    {byline ? `${byline}, posted` : 'Posted'} <time dateTime={thread.createdAt}>{timeAgo(thread.createdAt)}</time>
                    {thread.editedAt ? (
                      <span className="forum-byline__edited" title={`Edited ${new Date(thread.editedAt).toLocaleString('en-GB')}`}>
                        {' '}
                        · edited
                      </span>
                    ) : null}
                  </span>
                </span>
              </header>
              {editing ? (
                <ThreadEditForm
                  thread={thread}
                  onDone={(updated) => {
                    setEditing(false);
                    if (updated) {
                      push({ title: 'Thread updated', tone: 'success' });
                      if (updated.slug !== thread.slug) navigate(`/forum/${updated.slug}`, { replace: true });
                    }
                  }}
                />
              ) : deleted ? (
                <p className="forum-op__gone">The author deleted this post. The replies are still here.</p>
              ) : thread.body ? (
                <Prose text={thread.body} className="forum-op__body" />
              ) : null}
            </div>
            {!editing ? (
              <footer className="forum-op__actions">
                {canReply ? (
                  <Button variant="secondary" size="sm" leadingIcon={ArrowBendUpLeft} onClick={focusComposer}>
                    Reply
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" leadingIcon={LinkSimple} onClick={() => void copyLink()}>
                  Copy link
                </Button>
                <span className="forum-op__end">
                  {!thread.isMine && !deleted ? <ReportButton targetType="thread" targetId={thread.id} /> : null}
                  <PostMenu
                    label="More actions for this thread"
                    groups={[
                      [
                        thread.canEdit && !deleted && { id: 'edit', label: 'Edit', icon: PencilSimple, onSelect: () => setEditing(true) },
                        thread.canEdit && !deleted && { id: 'delete', label: 'Delete', icon: Trash, danger: true, onSelect: () => setConfirmDelete(true) },
                      ],
                      thread.canModerate
                        ? [
                            { heading: 'Moderate' },
                            thread.pinned
                              ? { id: 'unpin', label: 'Unpin', icon: PushPinSlash, onSelect: () => runModeration({ pinned: false }, { title: 'Thread unpinned' }) }
                              : {
                                  id: 'pin',
                                  label: 'Pin to the top',
                                  icon: PushPin,
                                  onSelect: () => runModeration({ pinned: true }, { title: 'Thread pinned', body: 'It now sits at the top of the forum.' }),
                                },
                            thread.locked
                              ? {
                                  id: 'unlock',
                                  label: 'Unlock replies',
                                  icon: LockSimpleOpen,
                                  onSelect: () => runModeration({ locked: false }, { title: 'Thread unlocked', body: 'People can reply again.' }),
                                }
                              : {
                                  id: 'lock',
                                  label: 'Lock replies',
                                  icon: LockSimple,
                                  onSelect: () => runModeration({ locked: true }, { title: 'Thread locked', body: 'No one can reply until you unlock it.' }),
                                },
                            hidden
                              ? {
                                  id: 'unhide',
                                  label: 'Unhide thread',
                                  icon: Eye,
                                  onSelect: () => runModeration({ status: 'visible' }, { title: 'Thread visible again', body: 'Everyone can see it now.' }),
                                }
                              : {
                                  id: 'hide',
                                  label: 'Hide thread',
                                  icon: EyeSlash,
                                  danger: true,
                                  onSelect: () =>
                                    runModeration(
                                      { status: 'hidden' },
                                      { title: 'Thread hidden', body: 'Only student reps can see it now. Resolve the report in Moderation if there is one.' },
                                    ),
                                },
                          ]
                        : [],
                    ]}
                  />
                </span>
              </footer>
            ) : null}
          </Panel>

          <section className="forum-replies" aria-labelledby="forum-replies-title">
            <div className="forum-replies__head">
              <h2 id="forum-replies-title" className="forum-replies__title">
                <span className="u-tabular">{thread.replyCount}</span> {thread.replyCount === 1 ? 'reply' : 'replies'}
              </h2>
              {thread.replyCount > 1 ? (
                <SegmentedControl
                  size="sm"
                  label="Order replies"
                  options={ORDERS}
                  value={order}
                  onChange={(v) =>
                    setParams(
                      (p) => {
                        const n = new URLSearchParams(p);
                        if (v === 'oldest') n.set('order', 'oldest');
                        else n.delete('order');
                        return n;
                      },
                      { replace: true },
                    )
                  }
                />
              ) : null}
            </div>

            {replies.length ? (
              <Panel as="div" padding="none" className="forum-replies__panel">
                <ol role="list" className="forum-replies__list">
                  {replies.map((r) => (
                    <li key={r.id} className="forum-replies__item">
                      <ReplyItem reply={r} thread={thread} fresh={isFresh(r.id)} targeted={r.id === targetId} onReply={canReply ? startReply : undefined}>
                        {r.children.length || replyingTo?.parent.id === r.id ? (
                          <ol role="list" className="forum-replies__nested">
                            {r.children.map((c) => (
                              <li key={c.id}>
                                <ReplyItem
                                  reply={c}
                                  thread={thread}
                                  nested
                                  fresh={isFresh(c.id)}
                                  targeted={c.id === targetId}
                                  onReply={canReply ? startReply : undefined}
                                />
                              </li>
                            ))}
                            {replyingTo?.parent.id === r.id ? (
                              <li>
                                <ReplyComposer
                                  key={replyingTo.key}
                                  thread={thread}
                                  parent={replyingTo.parent}
                                  mention={replyingTo.mention}
                                  autoFocus
                                  onCancel={() => setReplyingTo(null)}
                                  onPosted={(reply) => {
                                    setReplyingTo(null);
                                    scrollToReply(reply);
                                  }}
                                />
                              </li>
                            ) : null}
                          </ol>
                        ) : null}
                      </ReplyItem>
                    </li>
                  ))}
                </ol>
              </Panel>
            ) : (
              <p className="forum-replies__empty">
                {canReply ? 'No replies yet. If you know the answer, you could be the first to help.' : 'No replies.'}
              </p>
            )}
          </section>

          {canReply ? (
            <section className="forum-thread__compose" aria-label="Reply to this thread">
              {thread.locked ? (
                <p className="forum-compose-note forum-compose-note--locked" role="note">
                  <LockSimple aria-hidden="true" weight="bold" /> This thread is locked. As a student rep you can still reply; everyone else can’t.
                </p>
              ) : null}
              <ReplyComposer thread={thread} textareaRef={composerInput} onPosted={scrollToReply} />
            </section>
          ) : (
            <p className="forum-notice" role="note">
              <LockSimple aria-hidden="true" weight="bold" className="forum-notice__icon" />
              <span className="forum-notice__text">
                {deleted
                  ? 'This thread was deleted, so new replies are off.'
                  : hidden
                    ? 'This thread is hidden, so new replies are off. Unhide it to let people reply.'
                    : 'This thread is locked, so new replies are off.'}
              </span>
            </p>
          )}
        </div>

        <ThreadSidebar thread={thread} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this thread?"
        body={
          <>
            <strong dir="auto">{thread.title}</strong> will be removed from the forum and its text deleted.
            {thread.replyCount ? ' The replies stay readable at its link.' : ''} This can’t be undone.
          </>
        }
        confirmLabel="Delete thread"
        busy={removeThread.isPending}
        error={removeThread.isError ? errorMessage(removeThread.error, "The thread wasn't deleted. Try again.") : null}
        onClose={() => {
          setConfirmDelete(false);
          removeThread.reset();
        }}
        onConfirm={() =>
          removeThread.mutate(
            { threadId: thread.id, slug: thread.slug },
            {
              onSuccess: () => {
                setConfirmDelete(false);
                navigate('/forum');
                push({ title: 'Thread deleted', tone: 'success' });
              },
            },
          )
        }
      />
    </Page>
  );
}
