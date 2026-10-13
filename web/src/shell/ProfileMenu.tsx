import { DotsThree, Key, SignIn, SignOut, UserCircle, UserCirclePlus, Wrench } from '@phosphor-icons/react';
import { errorMessage } from '../api/errors';
import { accountLine, badgeOf, useAuth } from '../auth';
import { useToast } from '../state';
import { Avatar, Button, IconButton, Menu, Skeleton, cx, type MenuItem } from '../ui';
import './ProfileMenu.css';

interface ProfileMenuProps {
  /** the icon rail (700–1099px): just the avatar */
  compact?: boolean;
  /** the mobile top bar: the avatar, or a small Sign in button */
  placement?: 'rail' | 'topbar';
}

/**
 * Who is signed in, with the account menu (Finish your profile when it's missing, Your account, Manage for people
 * who hold a manager box, Access for admins, Sign out). Guests get a Sign in button. The line under the name is the
 * person's badge when they have one, otherwise their cohort.
 */
export function ProfileMenu({ compact = false, placement = 'rail' }: ProfileMenuProps) {
  const { me, status, manages, isAdmin, openSignIn, signOut } = useAuth();
  const { push } = useToast();
  const inTopbar = placement === 'topbar';
  const small = compact || inTopbar;

  if (status === 'loading') {
    return (
      <span className={cx('shell-profile', 'is-loading', small && 'shell-profile--compact')} aria-hidden="true">
        <Skeleton circle width={32} height={32} />
        {!small ? <Skeleton lines={2} className="shell-profile__text" /> : null}
      </span>
    );
  }

  if (!me) {
    if (compact) {
      return <IconButton label="Sign in" icon={SignIn} tooltip tooltipSide="right" onClick={() => openSignIn()} data-hub="sign-in" />;
    }
    return (
      <Button
        variant="secondary"
        size={inTopbar ? 'sm' : 'md'}
        fullWidth={!inTopbar}
        leadingIcon={inTopbar ? null : SignIn}
        className={cx('shell-signin', inTopbar && 'shell-signin--topbar')}
        onClick={() => openSignIn()}
        data-hub="sign-in"
      >
        Sign in
      </Button>
    );
  }

  const name = me.displayName || 'Your account';
  const line = me.status === 'suspended' ? 'Account suspended' : me.needsProfile ? 'Finish your profile' : accountLine({ badge: badgeOf(me), year: me.year });
  const identity = me.email || me.phone || '';

  const onSignOut = async () => {
    try {
      await signOut();
      push({ tone: 'success', title: 'You’re signed out' });
    } catch (e) {
      push({ tone: 'alert', title: 'Couldn’t sign you out', body: errorMessage(e) });
    }
  };

  const items: MenuItem[] = [
    {
      heading: (
        <span className="shell-account">
          <span className="shell-account__name">{name}</span>
          {identity ? <span className="shell-account__id">{identity}</span> : null}
        </span>
      ),
    },
    ...(me.needsProfile ? [{ id: 'profile', label: 'Finish your profile', icon: UserCirclePlus, onSelect: () => openSignIn() }] : []),
    { id: 'account', label: 'Your account', icon: UserCircle, to: '/account' },
    ...(manages ? [{ id: 'manage', label: 'Manage', icon: Wrench, to: '/manage' }] : []),
    ...(isAdmin ? [{ id: 'access', label: 'Access', icon: Key, to: '/admin/access' }] : []),
    { divider: true },
    { id: 'sign-out', label: 'Sign out', icon: SignOut, onSelect: () => void onSignOut() },
  ];

  return (
    <Menu
      side={inTopbar ? 'bottom' : compact ? 'right' : 'top'}
      align={inTopbar || compact ? 'end' : 'start'}
      label="Account"
      items={items}
      trigger={
        <button
          type="button"
          className={cx('shell-profile', small && 'shell-profile--compact')}
          aria-label={`${name}${line ? `, ${line}` : ''}. Open the account menu`}
          data-hub="profile"
        >
          <Avatar name={me.displayName || identity} size="md" decorative />
          {!small ? (
            <>
              <span className="shell-profile__text">
                <span className="shell-profile__name">{name}</span>
                {line ? <span className="shell-profile__meta">{line}</span> : null}
              </span>
              <DotsThree className="shell-profile__more" aria-hidden="true" weight="bold" />
            </>
          ) : null}
        </button>
      }
    />
  );
}
