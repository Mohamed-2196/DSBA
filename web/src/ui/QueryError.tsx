import type { ReactNode } from 'react';
import { Icon } from './Icon';
import * as glyph from './icons/glyphs';
import { isFeatureOff, isNetworkError, loadProblem } from '../api/errors';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Panel } from './Panel';
import { cx } from './internal';

export interface QueryErrorProps {
  /** what failed (the query's `error`): decides the body, so a server failure never blames the connection */
  error: unknown;
  /** one pattern everywhere: "<The thing> didn't load" ("The library didn't load", "Your notifications didn't load") */
  title?: ReactNode;
  /** usually `() => query.refetch()`; without it there is no button */
  onRetry?: () => void;
  /** the retry is running (`query.isFetching`): the button waits */
  retrying?: boolean;
  /** 'sm' inside a card, a menu or a side panel */
  size?: 'sm' | 'md';
  /** wrap in a Panel (default) or render bare, inside something that already has a frame */
  panel?: boolean;
  className?: string;
}

/**
 * The one "couldn't load, try again" state (code quality review CQ-5, UX review UX-10). A feature switched off
 * while the page was open says so instead, with nothing to retry.
 */
export function QueryError({
  error,
  title = 'This didn’t load',
  onRetry,
  retrying = false,
  size = 'md',
  panel = true,
  className,
}: QueryErrorProps) {
  const content = isFeatureOff(error) ? (
    <EmptyState
      size={size}
      icon={<Icon glyph={glyph.offline} />}
      title="This part of the hub is switched off right now."
      body="Come back later."
    />
  ) : (
    <EmptyState
      size={size}
      icon={<Icon glyph={glyph.error} />}
      illustration={isNetworkError(error) ? 'offline' : undefined}
      title={title}
      body={loadProblem(error)}
      action={
        onRetry ? (
          <Button size="sm" leadingIcon={<Icon glyph={glyph.refresh} />} loading={retrying} onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
  return panel ? (
    <Panel as="div" padding="none" role="alert" className={cx('ui-query-error', className)}>
      {content}
    </Panel>
  ) : (
    <div role="alert" className={cx('ui-query-error', className)}>
      {content}
    </div>
  );
}
