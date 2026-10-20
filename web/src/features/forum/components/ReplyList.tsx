import { useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Reply, ThreadDetail } from '../../../api/types';
import { useAuth } from '../../../auth';
import { SegmentedControl } from '../../../ui';
import { nestReplies, takesReplies } from '../lib/replies';
import type { ReplyOrder } from '../types';
import { ReplyComposer } from './ReplyComposer';
import { ReplyItem } from './ReplyItem';

const ORDERS: { value: ReplyOrder; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'oldest', label: 'Oldest' },
];

/** Replying under a reply: to whom (the top-level reply), and the @name when it answers a nested one. */
export interface ReplyingTo {
  parent: Reply;
  mention: string | null;
  key: string;
}

export interface ReplyListProps {
  thread: ThreadDetail;
  /** the reply a link pointed at (#reply-<id>) */
  targetId: string | null;
  replyingTo: ReplyingTo | null;
  onReplyTo: (reply: Reply) => void;
  onCancelReply: () => void;
  onPosted: (reply: Reply) => void;
  /** the thread was hidden or deleted after the page loaded: nothing can change here */
  unavailable?: boolean;
}

/** "N replies" with Top / Oldest, the replies (one level nested, the accepted answer first) and the inline composer. */
export function ReplyList({
  thread,
  targetId,
  replyingTo,
  onReplyTo,
  onCancelReply,
  onPosted,
  unavailable = false,
}: ReplyListProps) {
  const [params, setParams] = useSearchParams();
  const order: ReplyOrder = params.get('order') === 'oldest' ? 'oldest' : 'top';
  const replies = useMemo(
    () => nestReplies(thread.replies, order, thread.acceptedReplyId),
    [thread.replies, order, thread.acceptedReplyId],
  );
  const { mayTry } = useAuth();
  const canReply = takesReplies(thread) && !unavailable && mayTry('forum.post');
  const onReply = canReply ? onReplyTo : undefined;

  // Replies that arrive while the page is open (yours, or a classmate's on the next refresh) animate in.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(thread.replies.map((r) => r.id));
  const isFresh = (id: string) => !seen.current?.has(id);

  const setOrder = (v: ReplyOrder) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === 'oldest') n.set('order', 'oldest');
        else n.delete('order');
        return n;
      },
      { replace: true },
    );

  // Nothing to show and nothing to add: the note under the post says why (locked, hidden, deleted).
  if (!replies.length && !canReply) return null;

  return (
    <section className="forum-replies" aria-labelledby="forum-replies-title">
      <div className="forum-replies__head">
        <h2 id="forum-replies-title" className="forum-replies__title">
          {thread.replyCount ? (
            <>
              <span className="u-tabular">{thread.replyCount}</span> {thread.replyCount === 1 ? 'reply' : 'replies'}
            </>
          ) : (
            'Replies'
          )}
        </h2>
        {thread.replyCount > 1 ? (
          <SegmentedControl
            size="sm"
            label="Order replies"
            options={ORDERS}
            value={order}
            onChange={(v) => setOrder(v === 'oldest' ? 'oldest' : 'top')}
          />
        ) : null}
      </div>

      {replies.length ? (
        <div className="forum-replies__panel">
          <ol role="list" className="forum-replies__list">
            {replies.map((r) => {
              const composing = replyingTo?.parent.id === r.id;
              return (
                <li key={r.id} className="forum-replies__item">
                  <ReplyItem
                    reply={r}
                    thread={thread}
                    hasReplies={r.children.length > 0}
                    fresh={isFresh(r.id)}
                    targeted={r.id === targetId}
                    readOnly={unavailable}
                    onReply={onReply}
                  >
                    {r.children.length || composing ? (
                      <ol role="list" className="forum-replies__nested">
                        {r.children.map((c) => (
                          <li key={c.id}>
                            <ReplyItem
                              reply={c}
                              thread={thread}
                              nested
                              fresh={isFresh(c.id)}
                              targeted={c.id === targetId}
                              readOnly={unavailable}
                              onReply={onReply}
                            />
                          </li>
                        ))}
                        {composing && replyingTo ? (
                          <li>
                            <ReplyComposer
                              key={replyingTo.key}
                              thread={thread}
                              parent={replyingTo.parent}
                              mention={replyingTo.mention}
                              autoFocus
                              closed={!canReply}
                              onCancel={onCancelReply}
                              onPosted={onPosted}
                            />
                          </li>
                        ) : null}
                      </ol>
                    ) : null}
                  </ReplyItem>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="forum-replies__empty">No replies yet. If you know the answer, you could be the first to help.</p>
      )}
    </section>
  );
}
