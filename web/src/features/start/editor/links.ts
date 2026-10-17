// A guide step's links as the editor changes them: switching a link to another kind keeps its text where it can.
import type { GuideStep } from '../../../api/types';

export type GuideLink = GuideStep['links'][number];
export type LinkKind = GuideLink['kind'];

export const LINK_KINDS: { value: LinkKind; label: string }[] = [
  { value: 'site', label: 'One of the hub’s saved links' },
  { value: 'web', label: 'Another site' },
  { value: 'page', label: 'A page of the hub' },
  { value: 'date', label: 'The next date on the calendar' },
  { value: 'install', label: 'Install the app' },
];

/** A link of `kind`, keeping `from`'s text when it had some. */
export function linkOfKind(kind: LinkKind, from: GuideLink | null): GuideLink {
  const label = from && 'label' in from ? from.label : '';
  switch (kind) {
    case 'site':
      return { kind, link: 'uolPortal', label };
    case 'web':
      return { kind, href: '', label };
    case 'page':
      return { kind, to: '/', label, feature: null };
    case 'date':
      return { kind, title: '', type: 'deadline', label };
    case 'install':
      return { kind };
  }
}
