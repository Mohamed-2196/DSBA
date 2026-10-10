import { DotsThree } from '@phosphor-icons/react';
import { IconButton, Menu } from '../../../ui';
import type { MenuItem } from '../../../ui/Menu';

const isDivider = (i: MenuItem) => 'divider' in i && i.divider === true;

/**
 * The "More actions" menu on a post (edit, delete, moderation). Pass groups of items; empty groups disappear and
 * the rest are separated by dividers. Renders nothing when there is nothing to offer.
 */
export function PostMenu({ groups, label = 'More actions' }: { groups: (MenuItem | false | null | undefined)[][]; label?: string }) {
  const items: MenuItem[] = [];
  for (const group of groups) {
    const present = group.filter((i): i is MenuItem => !!i);
    if (!present.length) continue;
    if (items.length && !isDivider(items[items.length - 1])) items.push({ divider: true });
    items.push(...present);
  }
  if (!items.length) return null;
  return (
    <Menu
      label={label}
      align="end"
      items={items}
      trigger={<IconButton size="sm" icon={DotsThree} label={label} className="forum-post-menu" data-hub="post-menu" />}
    />
  );
}
