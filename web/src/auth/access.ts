// What a person may do and which features are on for them, from /me (signed in) or /features (a guest). The API
// decides both and enforces them; these functions only read its answer. Keys the app doesn't know are ignored.
import type { Me } from '../api/types';

export type Box = Me['boxes'][number];
export type Feature = Me['features'][number];
export type AccessMe = Pick<Me, 'status' | 'roles' | 'boxes' | 'features'>;

export const BOX_KEYS = [
  'forum.post',
  'library.upload',
  'newsletter.react',
  'reports.create',
  'forum.moderate',
  'library.manage',
  'newsletter.manage',
  'calendar.manage',
  'career.edit',
  'content.edit',
  'requests.manage',
  'summary.share',
  'stats.view',
  'people.suspend',
  'audit.read',
] as const satisfies readonly Box[];

export const FEATURE_KEYS = ['forum', 'library', 'library.uploads', 'library.questions', 'newsletter', 'calendar', 'career', 'grades', 'noora', 'noora.ai', 'notes', 'board', 'requests', 'summary'] as const satisfies readonly Feature[];

/** The boxes that open a manager's tool, in the order Manage shows them. */
export const MANAGER_BOXES = [
  'forum.moderate',
  'library.manage',
  'newsletter.manage',
  'calendar.manage',
  'career.edit',
  'content.edit',
  'requests.manage',
  'summary.share',
  'stats.view',
  'people.suspend',
  'audit.read',
] as const satisfies readonly Box[];

const isBox = (v: string): v is Box => (BOX_KEYS as readonly string[]).includes(v);

export function canDo(me: AccessMe | null | undefined, box: Box): boolean {
  return !!me && me.boxes.some((b) => isBox(b) && b === box);
}

/** Holds the Admin role, whatever the account's status: the badge and "you're suspended" notices use this. */
export function holdsAdmin(me: Pick<Me, 'roles'> | null | undefined): boolean {
  return !!me && me.roles.some((r) => r.slug === 'admin');
}

/** An admin on an active account: the Access screen and every switched-off feature are open to them. */
export function isActiveAdmin(me: Pick<Me, 'roles' | 'status'> | null | undefined): boolean {
  return !!me && me.status === 'active' && holdsAdmin(me);
}

/**
 * How the app offers an action that needs a student box (posting, uploading, reacting, reporting):
 * - 'yes': the person holds the box;
 * - 'sign-in': a guest, or an account without a profile yet: the action asks them to sign in first;
 * - 'suspended': the account is suspended, so it holds no box for now;
 * - 'no': the account's roles don't include the box.
 */
export type Offer = 'yes' | 'sign-in' | 'suspended' | 'no';

export function offerOf(me: (AccessMe & Pick<Me, 'needsProfile'>) | null | undefined, box: Box): Offer {
  if (!me || me.needsProfile) return 'sign-in';
  if (canDo(me, box)) return 'yes';
  return me.status === 'suspended' ? 'suspended' : 'no';
}

/** The action is shown: the person holds the box, or signing in is the next step. */
export const offered = (offer: Offer): boolean => offer === 'yes' || offer === 'sign-in';

/** "Upload a file" shows while the library and its uploads are on and the person may try to upload. */
export function showsUpload(isOn: (feature: Feature) => boolean, mayTry: (box: Box) => boolean): boolean {
  return isOn('library') && isOn('library.uploads') && mayTry('library.upload');
}

export function managerBoxes(me: AccessMe | null | undefined): Box[] {
  return MANAGER_BOXES.filter((box) => canDo(me, box));
}

/** The first badge in role order (the API sends roles in that order), or null. */
export function badgeOf(me: Pick<Me, 'roles'> | null | undefined): string | null {
  return me?.roles.find((r) => r.badge)?.badge ?? null;
}

/** On for this person: their own list when signed in, the guest list (GET /features) otherwise. */
export function featureIsOn(me: AccessMe | null | undefined, guestFeatures: readonly string[] | undefined, feature: Feature): boolean {
  const list: readonly string[] = me ? me.features : (guestFeatures ?? []);
  return list.includes(feature);
}

/** An admin sees every feature; this says which of them people without Admin may not see right now. */
export function offForOthers(me: AccessMe | null | undefined, guestFeatures: readonly string[] | undefined, feature: Feature): boolean {
  return isActiveAdmin(me) && !!guestFeatures && !guestFeatures.includes(feature);
}
