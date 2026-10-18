// The Roles tab's pure parts: boxes grouped by area for the checkboxes, which boxes a role can't take, and what a
// save sends.
import type { AdminUser, BoxOut, RoleOut, RoleUpdate } from '../../api/types';
import { MANAGER_BOXES, type Box } from '../../auth';

export interface Draft {
  name: string;
  badge: string;
  boxes: ReadonlySet<Box>;
}

/** The role editor's state: which opening it belongs to ('new', a role's id, or null while closed), the role as it
 *  was when the draft started, and the draft. */
export interface Editing {
  opening: string | null;
  base: RoleOut | null;
  draft: Draft;
}

export const draftOf = (role: RoleOut | null): Draft => ({
  name: role?.name ?? '',
  badge: role?.badge ?? '',
  boxes: new Set(role?.boxes ?? []),
});

/** A fresh draft from `role`, for the dialog opening on it or for "Load it again". */
export const startEditing = (opening: string | null, role: RoleOut | null): Editing => ({
  opening,
  base: role,
  draft: draftOf(role),
});

/** The editor's state for this render: a fresh draft when the dialog opens, or opens on another role; otherwise the
 *  same state. A newer version of the role loading in the background never resets the admin's unsaved draft, and
 *  saves send the version the draft started from, so a change someone else made meanwhile comes back as
 *  role_changed instead of being overwritten. */
export function followOpening(prev: Editing, opening: string | null, role: RoleOut | null): Editing {
  return prev.opening === opening ? prev : startEditing(opening, role);
}

export function groupBoxes(boxes: BoxOut[]): { area: string; boxes: BoxOut[] }[] {
  const groups: { area: string; boxes: BoxOut[] }[] = [];
  for (const b of boxes) {
    const group = groups.find((g) => g.area === b.area);
    if (group) group.boxes.push(b);
    else groups.push({ area: b.area, boxes: [b] });
  }
  return groups;
}

/** Student, which every new account gets, holds student boxes only: its manager boxes can't be ticked (AD-3). */
export function boxClosed(role: RoleOut | null, key: Box): boolean {
  return role?.slug === 'student' && (MANAGER_BOXES as readonly Box[]).includes(key);
}

/** The PATCH body for what changed, or null when nothing did. Boxes go as a sorted whole. */
export function roleChanges(role: RoleOut, draft: Draft): RoleUpdate | null {
  const body: RoleUpdate = { version: role.version };
  const name = draft.name.trim();
  if (name !== role.name) body.name = name;
  const badge = draft.badge.trim() || null;
  if (badge !== role.badge) body.badge = badge;
  const boxes = [...draft.boxes].sort();
  if (boxes.join() !== [...role.boxes].sort().join()) body.boxes = boxes;
  return Object.keys(body).length > 1 ? body : null;
}

/** The roles ticked in the people list's roles dialog, for the person it is open on (null while closed). */
export interface Ticks {
  personId: string | null;
  ticked: ReadonlySet<string>;
}

export const ticksOf = (person: AdminUser | null): Ticks => ({
  personId: person?.id ?? null,
  ticked: new Set(person?.roles.map((r) => r.id)),
});

/** The ticks for this render: the person's roles when the dialog opens on someone else, otherwise the admin's ticks,
 *  which a reload of the people list leaves alone. */
export function followPerson(prev: Ticks, person: AdminUser | null): Ticks {
  return prev.personId === (person?.id ?? null) ? prev : ticksOf(person);
}
