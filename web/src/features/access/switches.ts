// The Features tab's words and request bodies.
import type { FeatureOut, SwitchUpdate } from '../../api/types';

export type SwitchMode = FeatureOut['mode'];

const and = (names: string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** "Off", "On for everyone" or "On for Testers and Rep". Roles `roleName` doesn't know are left out. */
export function switchSummary(f: FeatureOut, roleName: (id: string) => string | null): string {
  if (f.mode === 'everyone') return 'On for everyone';
  if (f.mode === 'off') return 'Off';
  const names = f.roleIds.map(roleName).filter((n): n is string => !!n);
  return names.length ? `On for ${and(names)}` : 'Off';
}

/** The body for PUT /admin/features/{feature}: roles go only with "roles", sorted so equal choices send equal bodies. */
export function switchBody(mode: SwitchMode, roleIds: readonly string[]): SwitchUpdate {
  return { mode, roleIds: mode === 'roles' ? [...roleIds].sort() : [] };
}
