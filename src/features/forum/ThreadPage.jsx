import { useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowBendUpLeft, CaretRight, ChatCircleText, CheckCircle, LinkSimple, Plus } from '@phosphor-icons/react';
import { Badge, Button, EmptyState, Page, PageHeader, Panel, SegmentedControl, timeAgo } from '../../ui';
import { useDocumentTitle, useToast } from '../../state';
import { EASTER_EGG_ID, REVEAL_REPLY } from './data/threads.js';
import { getCategory } from './data/taxonomy.js';
import { authorLabel, getAuthor } from './data/authors.js';
import { nestReplies } from './lib/model.js';
import { ForumProvider } from './state/ForumProvider.jsx';
import { useForum } from './state/context.js';
import { AuthorAvatar } from './components/AuthorAvatar.jsx';
import { Prose } from './components/Prose.jsx';
import { VoteButton } from './components/VoteButton.jsx';
import { ModuleTag, PlaceBadge, TagBadges } from './components/ThreadBits.jsx';
import { ReplyItem } from './components/ReplyItem.jsx';
import { ReplyComposer } from './components/ReplyComposer.jsx';
import { TypingIndicator } from './components/TypingIndicator.jsx';
import { ThreadSidebar } from './components/ThreadSidebar.jsx';
import './components/forum.css';
import './ForumPage.css';
import './ThreadPage.css';

export default function ThreadPage() {
  const { threadId } = useParams();
  return (
    <ForumProvider>
      <ThreadView threadId={threadId} />
    </ForumProvider>
  );
}

const ORDERS = [
  { value: 'top', label: 'Top' },
  { value: 'oldest', label: 'Oldest' },
];

/** The hidden Teacher's Day reveal on the easter-egg thread (?reveal=1). Not persisted. */
function withReveal(thread, votes) {
  const id = `${thread.id}:${REVEAL_REPLY.id}`;
  const voted = !!votes[`r:${id}`];
  const reply = {
    id,
    threadId: thread.id,
    parentId: null,
    authorId: REVEAL_REPLY.author,
    authorYear: null,
    body: REVEAL_REPLY.body,
    createdAt: Date.now(),
    baseVotes: REVEAL_REPLY.votes,
    votes: REVEAL_REPLY.votes + (voted ? 1 : 0),
    voted,
    reveal: true,
  };
  return { ...thread, replies: [...thread.replies, reply], replyCount: thread.replyCount + 1, acceptedId: id, answered: true };
}

function ThreadView({ threadId }) {
  const forum = useForum();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const order = params.get('order') === 'oldest' ? 'oldest' : 'top';
  const reveal = threadId === EASTER_EGG_ID && params.get('reveal') === '1';
  const stored = forum.byId.get(threadId) || null;
  const thread = useMemo(() => (stored && reveal ? withReveal(stored, forum.state.votes) : stored), [stored, reveal, forum.state.votes]);
  useDocumentTitle(thread ? thread.title : 'Thread not found');

  // Replies that arrive while the page is open (yours, or a classmate's) animate in.
  const seen = useRef(null);
  if (thread && seen.current === null) seen.current = new Set(thread.replies.map((r) => r.id));
  const [replyingTo, setReplyingTo] = useState(null); // { parent, mention }
  const composerInput = useRef(null);

  if (!thread) {
    return (
      <Page>
        <Panel padding="none">
          <EmptyState
            icon={ChatCircleText}
            title="We couldn't find that thread"
            body="The link may be wrong, or the thread was posted on another device. Browse the forum or start a new thread."
            action={
              <>
                <Button variant="primary" to="/forum">Browse the forum</Button>
                <Button to="/forum/new" leadingIcon={Plus}>Start a thread</Button>
              </>
            }
          />
        </Panel>
      </Page>
    );
  }

  const author = getAuthor(thread.authorId, thread.authorYear);
  const category = getCategory(thread.category);
  const replies = nestReplies(thread, order);
  const typing = forum.typing[thread.id] || [];
  const isFresh = (id) => !seen.current?.has(id);

  const voteReply = (id) => forum.toggleReplyVote(id);
  const startReply = (reply) => {
    // One level of nesting: replying to a nested reply attaches to its parent and mentions the person.
    const parent = reply.parentId ? thread.replies.find((r) => r.id === reply.parentId) || reply : reply;
    const mention = reply.parentId ? authorLabel(getAuthor(reply.authorId, reply.authorYear)) : null;
    setReplyingTo({ parent, mention: mention === 'You' ? null : mention, key: `${reply.id}-${Date.now()}` });
  };
  const focusComposer = () => {
    const el = composerInput.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  };
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/forum/${thread.id}`;
    try {
      await navigator.clipboard.writeText(url);
      push({ title: 'Link copied', body: 'Paste it anywhere to share this thread.', tone: 'success' });
    } catch {
      push({ title: "Couldn't copy the link", body: 'Copy it from the address bar instead.', tone: 'alert' });
    }
  };
  const scrollToReply = (reply) => {
    requestAnimationFrame(() => {
      document.querySelector(`[data-reply-id="${CSS.escape(reply.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
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
        title={thread.title}
        meta={
          <>
            {thread.answered ? (
              <Badge tone="signal" icon={CheckCircle}>Answered</Badge>
            ) : thread.replyCount === 0 ? (
              <Badge tone="outline">Waiting for a first reply</Badge>
            ) : null}
            {thread.pinned ? <Badge tone="cobalt">Pinned</Badge> : null}
            <PlaceBadge thread={thread} size="md" />
            <ModuleTag module={thread.module} className="forum-thread__module" />
            <TagBadges tags={thread.tags} />
          </>
        }
      />

      <div className="forum-thread__layout">
        <div className="forum-thread__main">
          <Panel as="article" padding="none" className="forum-op" data-hub="thread-op" aria-label="Original post">
            <div className="forum-op__vote">
              <VoteButton size="lg" count={thread.votes} voted={thread.voted} onToggle={() => forum.toggleThreadVote(thread.id)} />
            </div>
            <div className="forum-op__main">
              <header className="forum-byline">
                <AuthorAvatar author={author} size="md" />
                <span className="forum-byline__text">
                  <span className="forum-byline__name">{authorLabel(author)}</span>
                  <span className="forum-byline__meta">
                    {author.kind === 'team' ? 'Student team' : author.year ? `Year ${author.year}` : 'Student'}, posted{' '}
                    <time dateTime={new Date(thread.createdAt).toISOString()}>{timeAgo(thread.createdAt)}</time>
                  </span>
                </span>
              </header>
              {thread.body ? <Prose text={thread.body} className="forum-op__body" /> : null}
            </div>
            <footer className="forum-op__actions">
              <Button variant="secondary" size="sm" leadingIcon={ArrowBendUpLeft} onClick={focusComposer}>
                Reply
              </Button>
              <Button variant="ghost" size="sm" leadingIcon={LinkSimple} onClick={copyLink}>
                Copy link
              </Button>
            </footer>
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
                        if (v === 'top') n.delete('order');
                        else n.set('order', v);
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
                      <ReplyItem
                        reply={r}
                        thread={thread}
                        fresh={isFresh(r.id)}
                        onVote={voteReply}
                        onReply={startReply}
                        canAccept={thread.isMine && r.authorId !== thread.authorId}
                        onAccept={(reply) => forum.acceptReply(thread.id, thread.acceptedId === reply.id ? null : reply.id)}
                      >
                        {r.children.length || replyingTo?.parent.id === r.id ? (
                          <ol role="list" className="forum-replies__nested">
                            {r.children.map((c) => (
                              <li key={c.id}>
                                <ReplyItem reply={c} thread={thread} nested fresh={isFresh(c.id)} onVote={voteReply} onReply={startReply} />
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
                {typing.length ? (
                  <div className="forum-replies__typing">
                    <TypingIndicator authorIds={typing} />
                  </div>
                ) : null}
              </Panel>
            ) : typing.length ? (
              <Panel as="div" padding="none" className="forum-replies__panel">
                <div className="forum-replies__typing">
                  <TypingIndicator authorIds={typing} />
                </div>
              </Panel>
            ) : (
              <p className="forum-replies__empty">No replies yet. If you know the answer, you could be the first to help.</p>
            )}
          </section>

          <section className="forum-thread__compose" aria-label="Reply to this thread">
            <ReplyComposer thread={thread} textareaRef={composerInput} onPosted={scrollToReply} />
          </section>
        </div>

        <ThreadSidebar thread={thread} threads={forum.threads} />
      </div>
    </Page>
  );
}
