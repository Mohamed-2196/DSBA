import { ArrowCounterClockwise, DotsThree, GithubLogo, Info, Palette } from '@phosphor-icons/react';
import { useYear } from '../state';
import { CURRENT_USER, CONTRIBUTE_URL } from '../data/people.js';
import { Avatar, Menu, cx } from '../ui';

/**
 * Signed-in prototype user + small menu (About, Style guide, Contribute, restart onboarding).
 * The line under his name is his role ('Student rep'), never a year: the year switcher only chooses which cohort's
 * content he is browsing, it does not say which cohort he is in.
 */
export function ProfileMenu({ compact = false }) {
  const { setYear } = useYear();
  const items = [
    { id: 'about', label: 'About DSBA Hub', icon: Info, to: '/about' },
    { id: 'styleguide', label: 'Style guide', icon: Palette, to: '/styleguide' },
    { id: 'contribute', label: 'Contribute a resource', icon: GithubLogo, href: CONTRIBUTE_URL },
    { divider: true },
    { id: 'onboarding', label: 'Show welcome again', icon: ArrowCounterClockwise, onSelect: () => setYear(null) },
  ];
  return (
    <Menu
      side={compact ? 'right' : 'top'}
      align={compact ? 'end' : 'start'}
      label="Profile"
      items={items}
      trigger={
        <button type="button" className={cx('shell-profile', compact && 'shell-profile--compact')} aria-label={`${CURRENT_USER.name}, ${CURRENT_USER.role}. Open profile menu`} data-hub="profile">
          <Avatar name={CURRENT_USER.name} size="md" />
          {!compact ? (
            <>
              <span className="shell-profile__text">
                <span className="shell-profile__name">{CURRENT_USER.name}</span>
                <span className="shell-profile__meta">{CURRENT_USER.role}</span>
              </span>
              <DotsThree className="shell-profile__more" aria-hidden="true" weight="bold" />
            </>
          ) : null}
        </button>
      }
    />
  );
}
