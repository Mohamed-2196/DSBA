// "Me too" on a request: toggles at once (api.ts useMeToo rolls back on failure). Guests sign in first. The
// requester sees "You asked" with how many more want it; a suspended account and a closed request see the count
// without the button working.
import type { RequestOut } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { cx, glyph, Icon } from '../../../ui';
import { useMeToo } from '../api';
import { meTooOfMine } from '../labels';
import { useMayAsk } from '../useMayAsk';

export function MeTooButton({ request, size = 'md' }: { request: RequestOut; size?: 'md' | 'lg' }) {
  const { requireAuth } = useAuth();
  const mayAsk = useMayAsk();
  const meToo = useMeToo();
  const { push } = useToast();
  const closed = request.status === 'done' || request.status === 'declined';
  const why = request.mine
    ? 'You asked for this'
    : mayAsk === 'suspended'
      ? 'Your account is suspended'
      : closed
        ? 'This request is closed'
        : null;
  const count = request.meTooCount;
  const toggle = () => {
    const on = !request.meToo;
    meToo.mutate(
      { id: request.id, on },
      {
        onError: (e) =>
          push({
            title: 'That didn’t save',
            body: errorMessage(e),
            tone: 'alert',
          }),
      },
    );
  };
  return (
    <button
      type="button"
      className={cx('req-metoo', `req-metoo--${size}`, request.meToo && 'is-on')}
      aria-pressed={why ? undefined : request.meToo}
      aria-label={request.mine ? meTooOfMine(count) : why ? `Me too, ${count}. ${why}` : `Me too, ${count}`}
      title={why ?? undefined}
      disabled={!!why}
      data-hub="me-too"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!requireAuth('Sign in to say me too', () => meToo.mutate({ id: request.id, on: true }))) return;
        toggle();
      }}
    >
      <Icon glyph={glyph.vote} active={request.meToo} className="req-metoo__icon" />
      {request.mine ? (
        <span className="req-metoo__label">{meTooOfMine(count)}</span>
      ) : (
        <>
          <span className="req-metoo__count u-tabular">{count}</span>
          <span className="req-metoo__label">Me too</span>
        </>
      )}
    </button>
  );
}
