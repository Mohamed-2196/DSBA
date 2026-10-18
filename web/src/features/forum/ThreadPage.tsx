import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChatCircleText, Plus } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import type { Reply, ThreadDetail } from '../../api/types';
import { appUrl } from '../../lib/share';
import { useCopyLink } from '../../lib/useCopyLink';
import { Button, EmptyState, Page, Panel, QueryError, Skeleton } from '../../ui';
import { useDocumentTitle } from '../../state';
import { isNotFound, useThread } from './api';
import { authorName } from './lib/authors';
import { scrollBehavior } from './lib/motion';
import { shownReplyIds } from './lib/replies';
import { useReplyTarget } from './lib/useReplyTarget';
import { useThreadModeration } from './lib/useThreadModeration';
import { OriginalPost } from './components/OriginalPost';
import { ReplyList, type ReplyingTo } from './components/ReplyList';
import { ThreadCrumbs, ThreadHeader } from './components/ThreadHeader';
import { HiddenBanner, MissingReplyNote, ThreadCompose, UnavailableBanner } from './components/ThreadNotices';
import { ThreadSidebar } from './components/ThreadSidebar';
import './components/forum.css';
import './ForumPage.css';
import './ThreadPage.css';

/** /forum/<slug> (or a thread id): the thread, its replies and the composer; #reply-<id> scrolls to a reply. */
export default function ThreadPage() {
  const { threadId: slug = '' } = useParams();
  const query = useThread(slug);
  const notFound = query.isError && isNotFound(query.error);
  useDocumentTitle(query.data ? query.data.title : notFound ? 'Thread not found' : null);
  const { refetch } = query;
  const reload = useCallback(() => refetch(), [refetch]);
  const posts = useAuth().mayTry('forum.post');

  // A thread on screen that is gone when it is read again (hidden or deleted meanwhile) stays, read-only, with a note.
  if (query.data) return <ThreadView key={query.data.id} thread={query.data} reload={reload} unavailable={notFound} />;
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
                {posts ? (
                  <Button to="/forum/new" leadingIcon={Plus}>
                    Start a thread
                  </Button>
                ) : null}
              </>
            }
          />
        </Panel>
      </Page>
    );
  }
  return (
    <Page className="forum-page">
      <ThreadCrumbs />
      <QueryError
        error={query.error}
        title="This thread didn’t load"
        onRetry={() => void reload()}
        retrying={query.isFetching}
      />
    </Page>
  );
}

function ThreadSkeleton() {
  return (
    <Page className="forum-page forum-thread" aria-busy="true">
      <ThreadCrumbs />
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

interface ThreadViewProps {
  thread: ThreadDetail;
  reload: () => Promise<unknown>;
  /** reading the thread again answered 404: it was hidden or deleted after the page loaded */
  unavailable: boolean;
}

function ThreadView({ thread, reload, unavailable }: ThreadViewProps) {
  const copy = useCopyLink();
  const moderation = useThreadModeration(thread);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => shownReplyIds(thread.replies), [thread.replies]);
  const target = useReplyTarget(shown, mainRef, reload);

  const startReply = (reply: Reply) => {
    // One level of nesting: replying to a nested reply attaches to its parent and mentions the person.
    const parent = reply.parentId ? (thread.replies.find((r) => r.id === reply.parentId) ?? reply) : reply;
    const mention = reply.parentId && !reply.isMine && reply.author ? authorName(reply.author) : null;
    setReplyingTo({ parent, mention, key: `${reply.id}-${Date.now()}` });
  };

  const focusComposer = () => {
    const el = composerInput.current;
    if (!el) return;
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    el.focus({ preventScroll: true });
  };

  const scrollToReply = (reply: Reply) => {
    requestAnimationFrame(() => {
      document.getElementById(`reply-${reply.id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    });
  };

  const copyLink = () => copy(appUrl(`/forum/${thread.slug}`), 'Paste it anywhere to share this thread.');

  return (
    <Page className="forum-page forum-thread">
      <ThreadHeader thread={thread} unavailable={unavailable} />

      <div className="forum-thread__layout">
        <div className="forum-thread__main" ref={mainRef}>
          {unavailable ? (
            <UnavailableBanner />
          ) : (
            <HiddenBanner thread={thread} onUnhide={moderation.unhide} unhiding={moderation.pending} />
          )}
          {target.missing ? <MissingReplyNote /> : null}
          <OriginalPost
            thread={thread}
            moderation={moderation}
            onReply={focusComposer}
            onCopyLink={() => void copyLink()}
            unavailable={unavailable}
          />
          <ReplyList
            thread={thread}
            targetId={target.id}
            replyingTo={replyingTo}
            onReplyTo={startReply}
            onCancelReply={() => setReplyingTo(null)}
            onPosted={(reply) => {
              setReplyingTo(null);
              scrollToReply(reply);
            }}
            unavailable={unavailable}
          />
          <ThreadCompose
            thread={thread}
            textareaRef={composerInput}
            onPosted={scrollToReply}
            unavailable={unavailable}
          />
        </div>

        <ThreadSidebar thread={thread} unavailable={unavailable} />
      </div>
    </Page>
  );
}
