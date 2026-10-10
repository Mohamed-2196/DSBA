import { ArrowClockwise, CaretDown, WarningCircle } from '@phosphor-icons/react';
import { errorMessage } from '../../../api/errors';
import { Button, EmptyState, Panel } from '../../../ui';

/** A list or page that could not load: what happened, and a way to try again. */
export function LoadError({
  error,
  title = "Couldn't load the forum",
  onRetry,
  size = 'md',
  panel = true,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  size?: 'sm' | 'md';
  panel?: boolean;
}) {
  const body = errorMessage(error, 'Something went wrong. Try again in a moment.');
  const content = (
    <EmptyState
      size={size}
      icon={WarningCircle}
      title={title}
      body={body}
      action={
        onRetry ? (
          <Button size={size === 'sm' ? 'sm' : 'md'} leadingIcon={ArrowClockwise} onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
  return panel ? (
    <Panel as="div" padding="none" role="alert">
      {content}
    </Panel>
  ) : (
    <div role="alert">{content}</div>
  );
}

/** "Show more" under a paged list. */
export function LoadMore({ remaining, loading, onClick, noun = 'threads' }: { remaining: number | null; loading: boolean; onClick: () => void; noun?: string }) {
  return (
    <div className="forum-more">
      <Button variant="ghost" size="sm" leadingIcon={CaretDown} loading={loading} onClick={onClick}>
        {remaining && remaining > 0 ? `Show more ${noun} (${remaining})` : `Show more ${noun}`}
      </Button>
    </div>
  );
}
