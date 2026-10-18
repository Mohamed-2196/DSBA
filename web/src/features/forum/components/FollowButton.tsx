// Follow a thread (forum.follow): hear when it gets an accepted answer, or about every reply. Voting or replying
// starts following it for answers; switching it off here keeps it off.
import { Bell, BellRinging, BellSlash, Check } from '@phosphor-icons/react';
import type { ThreadDetail } from '../../../api/types';
import { useAuth } from '../../../auth';
import { Button, Menu } from '../../../ui';
import { useFollowThread } from '../api';

export function FollowButton({ thread }: { thread: ThreadDetail }) {
  const { featureOn, requireAuth } = useAuth();
  const follow = useFollowThread();
  if (!featureOn('forum.follow') || thread.isMine || thread.status !== 'visible') return null;
  const set = (level: ThreadDetail['following']) => follow.mutate({ threadId: thread.id, level });
  if (thread.following === 'off') {
    return (
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={Bell}
        loading={follow.isPending}
        data-hub="follow"
        onClick={() => {
          if (requireAuth('Sign in to follow this thread', () => set('answers'))) set('answers');
        }}
      >
        Follow
      </Button>
    );
  }
  const every = thread.following === 'replies';
  return (
    <Menu
      label="Following this thread"
      align="start"
      items={[
        {
          id: 'answers',
          label: 'When it’s answered',
          hint: 'An accepted answer',
          icon: every ? null : Check,
          onSelect: () => set('answers'),
        },
        {
          id: 'replies',
          label: 'Every reply',
          hint: 'And the accepted answer',
          icon: every ? Check : null,
          onSelect: () => set('replies'),
        },
        { divider: true },
        { id: 'off', label: 'Stop following', icon: BellSlash, onSelect: () => set('off') },
      ]}
      trigger={
        <Button variant="ghost" size="sm" leadingIcon={BellRinging} loading={follow.isPending} data-hub="following">
          Following
        </Button>
      }
    />
  );
}
