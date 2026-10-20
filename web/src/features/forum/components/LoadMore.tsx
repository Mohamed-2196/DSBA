import { Button, Icon, glyph } from '../../../ui';

/** "Show more" under a paged list, with how many are left (api/paging.ts remainingCount). */
export function LoadMore({
  remaining,
  loading,
  onClick,
  noun = 'threads',
}: {
  remaining: number;
  loading: boolean;
  onClick: () => void;
  noun?: string;
}) {
  return (
    <div className="forum-more">
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={<Icon glyph={glyph.chevronDown} />}
        loading={loading}
        onClick={onClick}
      >
        {remaining > 0 ? `Show more ${noun} (${remaining})` : `Show more ${noun}`}
      </Button>
    </div>
  );
}
