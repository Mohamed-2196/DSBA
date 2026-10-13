// The Roles tab's pure parts: boxes grouped by area for the checkboxes, which boxes a role can't take, and what a
// save sends.
import type { BoxOut, RoleOut, RoleUpdate } from '../../api/types';
import { MANAGER_BOXES, type Box } from '../../auth';

export interface Draft {
  name: string;
  badge: string;
  boxes: ReadonlySet<Box>;
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
