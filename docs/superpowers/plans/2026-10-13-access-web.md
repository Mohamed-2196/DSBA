# Access: roles and feature switches (web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app shows each person exactly what their boxes allow and what the switches turn on. Admins manage
roles, people's roles and switches on one Access screen. Managers work from one Manage page.

**Architecture:**
- **`src/auth/access.ts`** holds the rules as pure functions over `/me` and `/features`: `canDo(me, box)`,
  `featureIsOn(me, features, feature)`, `offForOthers(...)` and `managerBoxes(me)`.
- **`useAuth()`** offers `can(box)`, `featureOn(feature)`, `isAdmin` (holds the Admin role on an active account:
  needed only for the Access screen and "Off for others") and `roles`.
- **`Gate`** (`src/auth/Gate.tsx`) closes a page by `box`, `feature`, `admin`, or a mix.
- **A route** names the feature it belongs to (`feature` in `routes.tsx`), and `RouteFrame` shows the switched-off
  notice.
- **`features/manage`** is the Manage page, and **`features/access`** the Access screen. `features/moderation` and
  `features/admin/PeoplePage` are deleted. The activity log moves into the Access screen as a fourth tab.

**Tech Stack:** React 18, strict TypeScript, TanStack Query 5, openapi-fetch, React Router 7 (data router), Vite 7,
Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-access-roles-and-feature-switches-design.md`. **API plan, which this
plan follows on the same branch:** `docs/superpowers/plans/2026-10-13-access-api.md`. Read both before Task 1.

**Branch:**
- `round4/access`, in the worktree `../dsba-access` that the API plan made. These tasks start after the API plan's
  Task 7.
- On arrival `scripts/check.sh web` fails on types (the API plan regenerated `schema.d.ts`). Task 1 makes it green,
  and every later task keeps both halves of `scripts/check.sh` green.
- The branch merges into `feature/backend` only after this plan's last task and a green e2e run.

## Amendments from the security review (read first)

These follow the spec's section "From the security review" (AD-1 to AD-9) and the API plan's amendments:
- **AD-1, Tasks 4 and 5:** admin-only writes can answer `step_up_required`. Catch it and open the existing step-up
  sign-in, then retry the write. Test this in the Access screen.
- **AD-2, Task 5:** for a viewer who isn't an admin, the People search is labelled "Search by name" and shows no
  contact details.
- **AD-3, Task 4:** on the Student role, manager boxes are disabled, with the note "Every new account gets Student,
  so it holds student boxes only."
- **AD-4, Task 4:** show the API's 422 on `badge` next to the badge field.
- **AD-8, Task 3:** when a published issue didn't email the cohort, the editor says "Published. The cohort email
  goes out once a day; the next one can be sent tomorrow."

## Spec notes

Decisions where the spec or the API plan was silent:

1. **`isAdmin` stays in `useAuth()`, with a new meaning:** holds the `admin` role on an active account. The spec
   removes the old `isModerator`/`isAdmin`; the Access screen and "Off for others" still need "is an admin", which
   is a role fact the API also exposes (admin-only powers aren't boxes). It's computed from `me.roles`, never from a
   name.
2. **Who sees Manage:** anyone holding at least one manager box: `forum.moderate`, `library.manage`,
   `newsletter.manage`, `calendar.manage`, `career.edit`, `stats.view`, `people.suspend` or `audit.read`.
3. **Manage's sections** follow the boxes: Reports (`forum.moderate` or `library.manage`, filtered by the API),
   Uploads (`library.manage`), Newsletter drafts (`newsletter.manage`), Calendar (`calendar.manage`, a link),
   Career Navigator (`career.edit`, a link), Numbers (`stats.view`), People (`people.suspend`, the people list
   without contact details) and Activity (`audit.read`). Admins hold every box, so they see every section.
4. **The Access screen** (`/admin/access`) has Roles, People, Features and Activity. People with only
   `people.suspend` use Manage's People section, which reuses the same list component without the roles column.
5. **The career editor isn't built here.** `career.edit` shows a link to Career Navigator; editing it in the app
   belongs with R-9.
6. **The style guide** is gated to anyone holding a manager box in production, as it was gated to reps.
7. **`/features` is fetched only for guests.** Signed in, `me.features` is the list (it's the same list).
8. **A switched-off page renders the notice in place** (no redirect), with status-like copy: "This part of the hub
   is switched off right now." and a "Go to Home" button.
9. **The forum author line and the library uploader line** use `UserPublic.badge`, else the cohort.
10. **The People tab's role filter** uses role slugs from the catalogue, with "Everyone" first.

## Global Constraints

- **Types:** strict TypeScript, no `any`, API types only from `src/api/types.ts` (generated).
- **No compatibility** (CLAUDE.md): no redirects from `/moderation` or `/admin/people`, no aliases, no old names in
  comments. Comments describe the code as it is.
- **Shared homes:** `ConfirmDialog`, `QueryError`, `EmptyState`, `Tabs`, `Panel`, `SearchField`, `Switch`,
  `SegmentedControl` in `src/ui`; keys in `src/api/keys.ts`; `useDebouncedValue` in `src/state`. Features meet only
  through `public.ts`.
- **Copy:** plain, short, sentence case. Errors say what happened and what to do next. Exact strings used here:
  - switched off: "This part of the hub is switched off right now."
  - admin marker: "Off for others"
  - stale role: "Someone else changed this role. Load it again and redo your change."
  - deleting a role: "Delete {name}?" / "{n} people hold it. They lose its powers and get a notification."
- **Responsive:** 360×780, 390×844, 430×932, 844×390, 768×1024, 820×1180, 1024×768, 1180×820, 1366×1024,
  1280×800, 1366×768, 1440×900, 1536×864, 1920×1080, 2560×1440 and 3440×1440, with touch emulated on phones and
  tablets. Nothing scrolls sideways; touch targets are at least 44 px where the pointer is coarse; prose under about
  75 characters.
- **Browser:** the installed Google Chrome (`chromium.launch({ channel: 'chrome' })`); `scripts/e2e.sh` picks it.
  Never run `npx playwright install`.
- **Made-up people only:** `*@example.com`.
- **Every task ends with** `scripts/check.sh web` passing (background), and from Task 1 on `scripts/check.sh api`
  too.

## Review Focus

Inputs the spec implies that no happy-path test meets, each pinned by a test in the task named:

1. **A suspended rep.** `me.boxes` is empty, so every manager control disappears and Manage closes with "Your account
   is suspended", while their badge still shows. (Tasks 1 and 3)
2. **A stale role save.** Two admins edit the same role; the second save shows the `role_changed` message and reloads
   the role instead of overwriting. (Task 4)
3. **A feature switched off while a page is open.** The next `/me` (or `/features`) refetch flips the page to the
   switched-off notice, and a 404 `feature_off` from any query shows the same notice instead of a generic error.
   (Task 2)
4. **An unknown box or feature key** in `/me` (an older API on a newer app is impossible here, but a typo in a
   catalogue isn't): `canDo` and `featureIsOn` ignore strings they don't know. (Task 1)
5. **An admin removing their own Admin role, or the last admin.** The People tab disables the checkbox on the admin's
   own row, and shows the API's `last_admin`/`cannot_change_self` message inline when it answers 409. (Task 5)

---

### Task 1: Boxes and switches in `useAuth()`, `Gate`, and every area compiling again

**Files:**
- Create: `web/src/auth/access.ts`, `web/src/auth/access.test.ts`, `web/src/auth/Gate.tsx`
- Modify: `web/src/auth/context.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/auth/index.ts`,
  `web/src/auth/labels.ts`, `web/src/api/keys.ts`
- Delete: `web/src/auth/roles.ts`, `web/src/auth/roles.test.ts`, `web/src/auth/RoleGate.tsx`
- Modify, area by area (each replaces a role check with the box it stands for):
  - `web/src/routes.tsx` (style guide gate)
  - `web/src/shell/ProfileMenu.tsx` (temporarily: Moderation and People items go; Task 3 adds Manage, Task 4 Access)
  - `web/src/features/calendar/CalendarPage.tsx` → `calendar.manage`
  - `web/src/features/forum/ReportsQueue.tsx` → `forum.moderate` or `library.manage`
  - `web/src/features/forum/lib/authors.ts`, `components/ReplyComposer.tsx`, `NewThreadPage.tsx` → `badge`
  - `web/src/features/forum/lib/replies.test.ts` → `badge: null`
  - `web/src/features/library/access.ts` → `library.manage`, `library.upload`
  - `web/src/features/library/viewer/MetaPanel.tsx` → `badge`
  - `web/src/features/library/display.test.ts` → `badge: null`
  - `web/src/features/newsletter/IssueEditorPage.tsx`, `IssuePage.tsx`, `NewsletterPage.tsx` → `newsletter.manage`
  - `web/src/features/moderation/ModerationPage.tsx` → `Gate` (deleted in Task 3)
  - `web/src/features/admin/*` → compiles against `roles: RoleSummary[]` (rewritten in Tasks 4–5)
- Test: `web/src/auth/access.test.ts`

**Interfaces:**
- **Consumes** (API plan): `Me.roles: RoleSummary[]` (`id`, `slug`, `name`, `badge`), `Me.boxes: BoxKey[]`,
  `Me.features: FeatureKey[]`, `Me.status`; `UserPublic.badge: string | null`; `GET /api/v1/features` →
  `FeaturesOut { features: FeatureKey[] }`; `AdminUser.roles: RoleSummary[]`.
- **Produces:**
  - `src/auth/access.ts`:
    - `type Box = Me['boxes'][number]`, `type Feature = Me['features'][number]`
    - `BOX_KEYS: readonly Box[]`, `FEATURE_KEYS: readonly Feature[]`, `MANAGER_BOXES: readonly Box[]`
    - `canDo(me: AccessMe | null | undefined, box: Box): boolean`
    - `holdsAdmin(me: AccessMe | null | undefined): boolean` (role slug `admin`, any status)
    - `isActiveAdmin(me): boolean`
    - `featureIsOn(me, guestFeatures: readonly string[] | undefined, feature: Feature): boolean`
    - `offForOthers(me, guestFeatures, feature): boolean` (admin sees it, but it's off for people without Admin:
      true when the feature isn't in `GUEST_FEATURES_FOR_ADMIN` — see step 3)
    - `managerBoxes(me): Box[]`
    - `badgeOf(me): string | null`
  - `useAuth()` gains `can(box)`, `featureOn(feature)`, `offForOthers(feature)`, `isAdmin`, `roles`, `manages`
    (`managerBoxes(me).length > 0`); loses `isModerator`.
  - `Gate` props: `{ title: string; description?: string; box?: Box; anyBox?: readonly Box[]; feature?: Feature;
    admin?: true; signedIn?: true; children: ReactNode }`.
  - `FEATURES_KEY = ['features'] as const` in `src/api/keys.ts`.
  - `accountLine(person: { badge: string | null; year: 1 | 2 | 3 | null }): string` in `labels.ts`; `roleLabel` and
    `type Role` are deleted.

- [ ] **Step 1: Write the failing test**

`web/src/auth/access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { badgeOf, canDo, featureIsOn, holdsAdmin, isActiveAdmin, managerBoxes, offForOthers, type AccessMe } from './access';

const role = (slug: string, badge: string | null = null) => ({ id: `id-${slug}`, slug, name: slug, badge });
const ALL = ['forum', 'library', 'library.uploads', 'newsletter', 'calendar', 'career', 'grades', 'noora'] as const;

const student: AccessMe = { status: 'active', roles: [role('student')], boxes: ['forum.post', 'library.upload', 'newsletter.react', 'reports.create'], features: [...ALL] };
const rep: AccessMe = { status: 'active', roles: [role('rep', 'Student rep'), role('student')], boxes: ['forum.post', 'forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'stats.view'], features: [...ALL] };
const suspendedRep: AccessMe = { ...rep, status: 'suspended', boxes: [], features: ['forum', 'library'] };
const admin: AccessMe = { status: 'active', roles: [role('admin', 'Admin'), role('student')], boxes: ['forum.post', 'forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'career.edit', 'stats.view', 'people.suspend', 'audit.read', 'library.upload', 'newsletter.react', 'reports.create'], features: [...ALL] };

describe('boxes', () => {
  it('allows exactly the boxes in /me', () => {
    expect(canDo(rep, 'newsletter.manage')).toBe(true);
    expect(canDo(student, 'newsletter.manage')).toBe(false);
    expect(canDo(null, 'forum.post')).toBe(false);
  });

  it('gives a suspended rep nothing, though they still hold the role and its badge', () => {
    expect(canDo(suspendedRep, 'forum.moderate')).toBe(false);
    expect(managerBoxes(suspendedRep)).toEqual([]);
    expect(badgeOf(suspendedRep)).toBe('Student rep');
  });

  it('ignores keys it does not know', () => {
    const odd = { ...student, boxes: [...student.boxes, 'forum.fly'] } as unknown as AccessMe;
    expect(canDo(odd, 'forum.post')).toBe(true);
    expect(managerBoxes(odd)).toEqual([]);
  });

  it('lists the manager boxes a person holds, in a fixed order', () => {
    expect(managerBoxes(rep)).toEqual(['forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'stats.view']);
    expect(managerBoxes(student)).toEqual([]);
  });
});

describe('admins', () => {
  it('knows an admin by the role, and an active one by the status', () => {
    expect(holdsAdmin(admin)).toBe(true);
    expect(isActiveAdmin(admin)).toBe(true);
    expect(isActiveAdmin({ ...admin, status: 'suspended' })).toBe(false);
    expect(holdsAdmin(rep)).toBe(false);
  });

  it('uses the first badge in role order', () => {
    expect(badgeOf(admin)).toBe('Admin');
    expect(badgeOf(student)).toBe(null);
  });
});

describe('switches', () => {
  it('uses /me.features when signed in, and /features for a guest', () => {
    expect(featureIsOn(student, undefined, 'calendar')).toBe(true);
    expect(featureIsOn({ ...student, features: ['forum'] }, undefined, 'calendar')).toBe(false);
    expect(featureIsOn(null, ['forum', 'library'], 'forum')).toBe(true);
    expect(featureIsOn(null, ['forum', 'library'], 'calendar')).toBe(false);
  });

  it('treats a guest whose /features has not loaded as seeing nothing switched', () => {
    expect(featureIsOn(null, undefined, 'forum')).toBe(false);
  });

  it('marks a feature an admin sees but the guest list leaves out as off for others', () => {
    expect(offForOthers(admin, ['forum'], 'calendar')).toBe(true);
    expect(offForOthers(admin, ['forum', 'calendar'], 'calendar')).toBe(false);
    expect(offForOthers(student, ['forum'], 'calendar')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/auth/access.test.ts`
Expected: FAIL, "Failed to resolve import './access'".

- [ ] **Step 3: Write `web/src/auth/access.ts`**

```ts
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
  'stats.view',
  'people.suspend',
  'audit.read',
] as const satisfies readonly Box[];

export const FEATURE_KEYS = ['forum', 'library', 'library.uploads', 'newsletter', 'calendar', 'career', 'grades', 'noora'] as const satisfies readonly Feature[];

/** The boxes that open a manager's tool, in the order Manage shows them. */
export const MANAGER_BOXES = [
  'forum.moderate',
  'library.manage',
  'newsletter.manage',
  'calendar.manage',
  'career.edit',
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
```

`offForOthers` compares against the Everyone list. A feature on for some roles reads as off for others too, which
is what the marker means: not everyone sees it.

- [ ] **Step 4: Run the test to see it pass**

Run: `cd web && npx vitest run src/auth/access.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: The key, the context and the provider**

`web/src/api/keys.ts`, add:

```ts
/** GET /features: the features switched on for whoever asks. Signed in, /me carries the same list. */
export const FEATURES_KEY = ['features'] as const;
```

`web/src/auth/context.ts`: replace the `isModerator` and `isAdmin` fields of `AuthValue` with:

```ts
  /** what /me's boxes allow: nothing while the account is suspended */
  can: (box: Box) => boolean;
  /** the feature is on for this person (admins: every feature) */
  featureOn: (feature: Feature) => boolean;
  /** an admin sees this feature, but it isn't on for everyone */
  offForOthers: (feature: Feature) => boolean;
  /** holds the Admin role on an active account */
  isAdmin: boolean;
  /** holds at least one manager box: Manage is open to them */
  manages: boolean;
  roles: Me['roles'];
```

and add `import type { Box, Feature } from './access';`.

`web/src/auth/AuthProvider.tsx`:
- replace `import { canAdminister, canModerate } from './roles';` with
  `import { canDo, featureIsOn, isActiveAdmin, managerBoxes, offForOthers } from './access';` and add
  `FEATURES_KEY` to the `../api/keys` import (add the import line if there is none);
- after `sessionQuery`, add:

```ts
  // The guest list of features. Signed in, /me carries the list; it's fetched for admins too, to mark what's off for
  // others.
  const signedIn = !!sessionQuery.data;
  const admin = isActiveAdmin(sessionQuery.data);
  const guestFeatures = useQuery({
    queryKey: FEATURES_KEY,
    queryFn: async () => (await call(api.GET('/api/v1/features'))).features,
    enabled: !sessionQuery.isPending && (!signedIn || admin),
    staleTime: 60_000,
  });
```

  (if the provider names the data `me` before this point, use `me` instead of `sessionQuery.data`.) For an admin,
  `/features` answers their own list (every feature), not the guest list; so for admins fetch the guest list without
  credentials:

```ts
    queryFn: async () =>
      (await call(api.GET('/api/v1/features', admin ? { credentials: 'omit' } : {}))).features,
```

- in the `value` memo, replace the `isModerator`/`isAdmin` lines with:

```ts
      can: (box) => canDo(me, box),
      featureOn: (feature) => featureIsOn(me, guestFeatures.data, feature),
      offForOthers: (feature) => offForOthers(me, guestFeatures.data, feature),
      isAdmin: isActiveAdmin(me),
      manages: managerBoxes(me).length > 0,
      roles: me?.roles ?? [],
```

  and add `guestFeatures.data` to the memo's dependencies.
- After a sign-in or sign-out, the guest list doesn't change, so nothing else invalidates `FEATURES_KEY`; the Access
  screen's Features tab invalidates it (Task 5).

- [ ] **Step 6: `Gate`, labels and the exports**

Create `web/src/auth/Gate.tsx`:

```tsx
// Pages for some people only: a sign-in prompt for guests, "switched off" when the feature is off, "suspended" for a
// suspended account that holds the role the page needs, and a polite "not for you" otherwise.
import type { ReactNode } from 'react';
import { House, Power, ShieldCheck, SignIn, WarningCircle } from '@phosphor-icons/react';
import { PageLoader } from '../shell/PageLoader';
import { Button, EmptyState, Page, PageHeader, Panel } from '../ui';
import type { Box, Feature } from './access';
import { holdsAdmin } from './access';
import { useAuth } from './useAuth';

export interface GateProps {
  title: string;
  description?: string;
  /** the page needs this box */
  box?: Box;
  /** the page needs at least one of these boxes */
  anyBox?: readonly Box[];
  /** the page belongs to this feature */
  feature?: Feature;
  /** the page is for admins */
  admin?: true;
  /** the page needs an account and nothing more */
  signedIn?: true;
  children: ReactNode;
}

function Notice({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Page width="narrow">
      <PageHeader title={title} description={description} />
      <Panel padding="none">{children}</Panel>
    </Page>
  );
}

const home = (
  <Button to="/" leadingIcon={House}>
    Go to Home
  </Button>
);

export function SwitchedOff({ title }: { title: string }) {
  return (
    <Notice title={title}>
      <EmptyState icon={Power} title="This part of the hub is switched off right now." body="Come back later, or carry on from Home." action={home} />
    </Notice>
  );
}

export function Gate({ title, description, box, anyBox, feature, admin, signedIn, children }: GateProps) {
  const { me, status, can, featureOn, isAdmin, openSignIn } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (feature && !featureOn(feature)) return <SwitchedOff title={title} />;
  const needsAccount = !!(box || anyBox || admin || signedIn);
  if (!needsAccount) return <>{children}</>;
  if (!me || me.needsProfile) {
    return (
      <Notice title={title} description={description}>
        <EmptyState
          icon={SignIn}
          title="Sign in to see this page"
          body="It’s here once you’re signed in."
          action={
            <Button variant="primary" leadingIcon={SignIn} onClick={() => openSignIn({ reason: `Sign in to see ${title.toLowerCase()}` })}>
              Sign in
            </Button>
          }
        />
      </Notice>
    );
  }
  const allowed = (!admin || isAdmin) && (!box || can(box)) && (!anyBox || anyBox.some((b) => can(b)));
  if (allowed) return <>{children}</>;
  if (me.status === 'suspended' && (admin ? holdsAdmin(me) : me.roles.some((r) => r.slug !== 'student'))) {
    return (
      <Notice title={title} description={description}>
        <EmptyState icon={WarningCircle} title="Your account is suspended" body="While it is, this page isn’t available to you. Contact an admin." action={home} />
      </Notice>
    );
  }
  return (
    <Notice title={title} description={description}>
      <EmptyState icon={ShieldCheck} title="This page isn’t on your account" body="If you think you need it, ask an admin." action={home} />
    </Notice>
  );
}
```

`web/src/auth/labels.ts` becomes:

```ts
import { COHORTS } from '../state/cohort';

/** The line under a person's name: their badge when they have one ('Student rep', 'Admin'), else their cohort. */
export function accountLine(person: { badge: string | null; year: 1 | 2 | 3 | null }): string {
  if (person.badge) return person.badge;
  return person.year ? COHORTS[person.year].label : '';
}
```

`web/src/auth/index.ts`: replace the `labels`, `RoleGate` and `roles` export lines with:

```ts
export { accountLine } from './labels';
export { Gate, SwitchedOff, type GateProps } from './Gate';
export { BOX_KEYS, FEATURE_KEYS, MANAGER_BOXES, badgeOf, canDo, holdsAdmin, type Box, type Feature } from './access';
```

Delete `web/src/auth/roles.ts`, `web/src/auth/roles.test.ts` and `web/src/auth/RoleGate.tsx`.

- [ ] **Step 7: Every area, one at a time**

Run `cd web && npx tsc -p tsconfig.json --noEmit 2>&1 | head -60` after each file to watch the errors fall.

| File | Change |
| --- | --- |
| `routes.tsx` | `import { Gate, MANAGER_BOXES } from './auth';` and the style guide's gate becomes `<Gate title="Style guide" anyBox={MANAGER_BOXES}>{page}</Gate>`. |
| `shell/ProfileMenu.tsx` | `const { me, status, openSignIn, signOut } = useAuth();`; delete the `moderation` and `people` items and the `ShieldCheck`, `UsersThree` imports; the line becomes `accountLine({ badge: badgeOf(me), year: me.year })` with `badgeOf` imported from `../auth`. |
| `features/calendar/CalendarPage.tsx` | `const { can } = useAuth(); const manages = can('calendar.manage');` and every `isModerator` becomes `manages`. |
| `features/forum/ReportsQueue.tsx` | `const { can, status: authStatus } = useAuth(); const handles = can('forum.moderate') \|\| can('library.manage');` and every `isModerator` becomes `handles`. |
| `features/forum/lib/authors.ts` | the two role lines become `if (user?.badge) return user.badge;`. |
| `features/forum/components/ReplyComposer.tsx`, `features/forum/NewThreadPage.tsx` | the author object's `role: me.role` becomes `badge: badgeOf(me)` (import `badgeOf` from the auth public path the file already uses). |
| `features/forum/lib/replies.test.ts`, `features/library/display.test.ts` | `role: 'student'` becomes `badge: null`. |
| `features/library/access.ts` | `const { me, can } = useAuth(); return { suspended: me?.status === 'suspended', moderator: can('library.manage') };` and its header comment says "library.manage", not "moderator". |
| `features/library/viewer/MetaPanel.tsx` | `ROLE_LABEL[who.role] ? …` becomes `who.badge ? \`, ${who.badge}\` : who.year ? …`; delete `ROLE_LABEL`. |
| `features/newsletter/IssueEditorPage.tsx` | wrap the screen in `<Gate title="Edit issue" box="newsletter.manage" feature="newsletter">`; delete the hand-written guest, suspended and not-for-you branches and the `holdsRole` import; `useIssueDetail(can('newsletter.manage') ? slug : undefined)`. |
| `features/newsletter/IssuePage.tsx`, `features/newsletter/NewsletterPage.tsx` | `const { can } = useAuth(); const manages = can('newsletter.manage');` and every `isModerator` becomes `manages` (the `ComingSoon` prop is renamed `manages`). |
| `features/moderation/ModerationPage.tsx` | `<Gate title="Moderation" anyBox={['forum.moderate', 'library.manage']}>`; Task 3 deletes the page. |
| `features/admin/api.ts` | delete `type Role`; `usePeople(q: string, role: string \| null, enabled: boolean)`. |
| `features/admin/roles.ts`, `features/admin/RoleDialog.tsx` | delete both (Task 5 brings role checkboxes). |
| `features/admin/PeoplePage.tsx` | the role cell shows `p.roles.map((r) => r.name).join(', ')`; delete the role filter's old values (keep "Everyone" only), `RoleDialog`, the "Change" button and the `role` branch of `Change`; `RoleGate` becomes `<Gate title="People" admin>`. Task 5 deletes the page. |
| `features/admin/audit.ts`, `audit.test.ts` | replace `'user.role'` with the five new actions below, and delete `isRole`, `roleLabel` and the test cases for `user.role`. |

The new audit lines in `features/admin/audit.ts` (the data shapes come from the API plan's `record()` calls):

```ts
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const list = (v: string[]): string => (v.length ? v.join(', ') : 'no roles');
const MODES: Record<string, string> = { off: 'off', roles: 'on for some roles', everyone: 'on for everyone' };
```

and in `ACTIONS`:

```ts
  'user.roles': (d, name) => `changed ${name ? `${name}’s roles` : 'someone’s roles'} from ${list(names(d.from))} to ${list(names(d.to))}${via(d)}`,
  'role.create': (d) => `created the role${quoted(d.name)}`,
  'role.update': (d) => {
    const after = typeof d.after === 'object' && d.after !== null ? (d.after as Record<string, unknown>) : {};
    return `changed the role${quoted(after.name)}`;
  },
  'role.delete': (d) => `deleted the role${quoted(d.name)}`,
  'feature.switch': (d) => `switched ${str(d.feature) ?? 'a feature'} ${MODES[str(d.to) ?? ''] ?? 'to a new setting'}`,
```

The tests in `features/admin/audit.test.ts`, replacing the `user.role` cases:

```ts
  it('describes role and switch changes', () => {
    expect(describeAudit(entry('user.roles', { from: ['Student'], to: ['Rep', 'Student'] }, 'user'), () => 'Ali')).toBe('changed Ali’s roles from Student to Rep, Student');
    expect(describeAudit(entry('role.create', { name: 'Events team', boxes: [] }))).toBe('created the role “Events team”');
    expect(describeAudit(entry('role.update', { before: { name: 'A' }, after: { name: 'B' } }))).toBe('changed the role “B”');
    expect(describeAudit(entry('role.delete', { name: 'Events team', holders: 2 }))).toBe('deleted the role “Events team”');
    expect(describeAudit(entry('feature.switch', { feature: 'calendar', from: 'everyone', to: 'off', roles: [] }))).toBe('switched calendar off');
  });
```

(`entry` and the `nameOf` argument are the test file's existing helpers; match their signatures as they are.)

- [ ] **Step 8: The suspended rep test**

Add to `web/src/auth/access.test.ts` nothing more: the "gives a suspended rep nothing" case pins Review Focus 1 for
the rules. The `Gate` branch for it is covered by the e2e spec in Task 7.

- [ ] **Step 9: Check everything**

Run (background): `scripts/check.sh web`
Expected: `All checks passed.` (both tsc projects, ESLint, Vitest, the schema check, the build).

Run (background): `scripts/check.sh api`
Expected: `All checks passed.`

`grep -rnE "isModerator|RoleGate|canModerate|canAdminister|holdsRole|roleLabel|'moderator'" web/src` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add -A web/src
git commit -m "Web: boxes and switches in useAuth, Gate, and every area on the new access shapes"
```

### Task 2: Switched-off features disappear: pages, menus, Home, the palette and `feature_off`

**Files:**
- Modify: `web/src/shell/RouteFrame.tsx`, `web/src/routes.tsx`, `web/src/shell/nav.ts`, `web/src/shell/Sidebar.tsx`,
  `web/src/shell/MobileNav.tsx`, `web/src/features/home/HomePage.tsx`, `web/src/features/search/search.ts`,
  `web/src/features/search/CommandPalette.tsx`, `web/src/features/forum/components/ForumSidebar.tsx`,
  `web/src/shell/AppShell.tsx`, `web/src/api/errors.ts`, `web/src/ui/QueryError.tsx`
- Create: `web/src/shell/visibility.ts`, `web/src/shell/visibility.test.ts`
- Test: `web/src/shell/visibility.test.ts`, `web/src/features/search/search.test.ts` (add cases),
  `web/src/api/errors.test.ts` (add a case)

**Interfaces:**
- **Consumes:** `useAuth().featureOn`, `offForOthers`, `isAdmin`; `SwitchedOff` from `src/auth`.
- **Produces:**
  - `AppRoute.feature?: Feature` (in `RouteFrame.tsx`): the page belongs to that feature.
  - `NavItem.feature?: Feature` (in `nav.ts`).
  - `visibleNav(items: NavItem[], isOn: (f: Feature) => boolean): NavItem[]` in `shell/visibility.ts`.
  - `SearchInput.isOn: (f: Feature) => boolean` (required) in `features/search/search.ts`; page entries and actions
    carry `feature?: Feature`.
  - `isFeatureOff(e: unknown): boolean` in `src/api/errors.ts`.
  - `OffForOthers` marker: a `Badge` with text "Off for others", rendered by `RouteFrame` above a page an admin opens
    while it's off for others.

- [ ] **Step 1: Write the failing tests**

`web/src/shell/visibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { House } from '@phosphor-icons/react';
import type { NavItem } from './nav';
import { visibleNav } from './visibility';

const item = (id: string, feature?: NavItem['feature']): NavItem => ({ id, label: id, to: `/${id}`, icon: House, feature });

describe('visibleNav', () => {
  it('keeps items without a feature and those whose feature is on', () => {
    const nav = [item('home'), item('forum', 'forum'), item('calendar', 'calendar')];
    expect(visibleNav(nav, (f) => f === 'forum').map((n) => n.id)).toEqual(['home', 'forum']);
  });
});
```

Add to `web/src/features/search/search.test.ts` (reuse the file's existing base input; it's called `input` or
similar there, so spread whatever the file uses, adding `isOn`):

```ts
  it('leaves out pages and actions of switched-off features', () => {
    const r = runSearch({ ...base, query: '', isOn: (f) => f !== 'calendar' && f !== 'forum' });
    const ids = r.groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).not.toContain('page:/calendar');
    expect(ids).not.toContain('page:/forum');
    expect(ids).not.toContain('action:new-thread');
    expect(ids).toContain('page:/library');
  });

  it('leaves out search hits of switched-off features', () => {
    const r = runSearch({ ...base, query: 'mgf', isOn: (f) => f !== 'forum', results: { modules: [], library: [], threads: [{ id: 't1', title: 'MGF help', snippet: null, url: '/forum/mgf-help', date: null, moduleId: null, year: null }], issues: [], events: [] } as unknown as SearchResults });
    expect(r.groups.find((g) => g.id === 'threads')).toBeUndefined();
  });
```

(If the hit type's fields differ, copy a thread hit from an existing test in the file.)

Add to `web/src/api/errors.test.ts`:

```ts
  it('recognises a switched-off feature', () => {
    expect(isFeatureOff(new ApiError({ status: 404, code: 'feature_off', message: 'This part of the hub is switched off right now.' }))).toBe(true);
    expect(isFeatureOff(new ApiError({ status: 404, code: 'not_found', message: 'Not here.' }))).toBe(false);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/shell/visibility.test.ts src/features/search/search.test.ts src/api/errors.test.ts`
Expected: FAIL (`./visibility` missing, `isOn` unknown, `isFeatureOff` not exported).

- [ ] **Step 3: The rules**

`web/src/shell/visibility.ts`:

```ts
// The shell shows a feature's entry only while the feature is on for the person.
import type { Feature } from '../auth';
import type { NavItem } from './nav';

export function visibleNav(items: NavItem[], isOn: (f: Feature) => boolean): NavItem[] {
  return items.filter((n) => !n.feature || isOn(n.feature));
}
```

`web/src/shell/nav.ts`: add `feature?: Feature;` to `NavItem` (import `type Feature` from `../auth`), and set
`feature` on `library` (`'library'`), `newsletter` (`'newsletter'`), `forum` (`'forum'`), `career` (`'career'`),
`calendar` (`'calendar'`) and `grades` (`'grades'`).

`web/src/api/errors.ts`, add:

```ts
/** A 404 because the feature is switched off for this person. */
export function isFeatureOff(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'feature_off';
}
```

`web/src/features/search/search.ts`:
- `import type { Feature } from '../../auth';`
- `Item`'s `page` and `action` variants gain `feature?: Feature`;
- `PAGE_ENTRIES`' raw objects gain `feature`: `/library` `'library'`, `/newsletter` `'newsletter'`, `/forum`
  `'forum'`, `/career` `'career'`, `/calendar` `'calendar'`, `/grades` `'grades'`; the `.map` copies `feature`
  through (`...('feature' in p ? { feature: p.feature } : {})`);
- in `buildActions`, set `feature: 'forum'` on `action:new-thread`, `'library.uploads'` on `action:upload`,
  `'grades'` on `action:grades`, `'calendar'` on `action:subscribe`, `'noora'` on both `action:noora` entries;
- `SearchInput` gains `/** Whether a feature is on for the person. */ isOn: (f: Feature) => boolean;`
- at the top of `runSearch`, after destructuring `isOn`:

```ts
  const shown = (i: Item) => !(i.kind === 'action' || i.kind === 'page') || !i.feature || isOn(i.feature);
  const actions = buildActions({ year, theme, nooraHidden }).filter(shown);
  const pages = PAGE_ENTRIES.filter(shown);
  const off = (feature: Feature) => !isOn(feature);
```

  and use `pages` wherever the function used `PAGE_ENTRIES`. The API hits are filtered by group:

```ts
    files: off('library') ? [] : (results?.library ?? []).map(...),
    threads: off('forum') ? [] : (results?.threads ?? []).map(...),
    issues: off('newsletter') ? [] : (results?.issues ?? []).map(...),
    events: off('calendar') ? [] : (results?.events ?? []).map(...),
```

  (The API already leaves them out (API plan, Task 6); this keeps a cached answer from showing them after a switch
  flips.)

`web/src/features/search/CommandPalette.tsx`: `const { featureOn } = useAuth();` (import from `../../auth`), pass
`isOn: featureOn` to `runSearch`, and add `featureOn` to the `useMemo` dependencies.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/shell/visibility.test.ts src/features/search/search.test.ts src/api/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Pages, the shell and Home**

`web/src/shell/RouteFrame.tsx`:
- `AppRoute` gains `/** the feature the page belongs to: off for this person, the page says so */ feature?: Feature;`
- import `{ SwitchedOff, useAuth, type Feature }` from `../auth` and `Badge` from `../ui`;
- in `RouteFrame`, after the title effect:

```tsx
  const { status, featureOn, offForOthers } = useAuth();
  if (route.feature && status !== 'loading' && !featureOn(route.feature)) {
    return <SwitchedOff title={title ?? 'DSBA Hub'} />;
  }
  const marker =
    route.feature && offForOthers(route.feature) ? (
      <p className="route-off-for-others">
        <Badge tone="alert" size="sm">
          Off for others
        </Badge>
      </p>
    ) : null;
```

  and render `{marker}` just inside `<Suspense>` before the page. Add to `web/src/shell/AppShell.css`:

```css
.route-off-for-others {
  margin: 0 auto;
  padding: var(--space-3) var(--gutter) 0;
  max-width: var(--page-max, 1200px);
}
```

  (use the token names `AppShell.css` already uses for the page gutter; `grep -n "gutter\|--space" AppShell.css`.)

`web/src/routes.tsx`: set `feature` on `library` and `file` (`'library'`), `newsletter`, `issue` and `issue-edit`
(`'newsletter'`), `forum`, `forum-new` and `thread` (`'forum'`), `career` (`'career'`), `calendar` (`'calendar'`)
and `grades` (`'grades'`).

`web/src/shell/Sidebar.tsx`: `const { featureOn } = useAuth();` and map over `visibleNav(NAV, featureOn)` instead
of `NAV`.

`web/src/shell/MobileNav.tsx`: move `TABS` and `MORE` inside the component:

```tsx
  const { featureOn } = useAuth();
  const nav = visibleNav(NAV, featureOn);
  const tabs = nav.filter((n) => MOBILE_TAB_IDS.includes(n.id));
  const more = nav.filter((n) => MORE_IDS.includes(n.id));
```

and use `tabs`/`more` where `TABS`/`MORE` were.

`web/src/shell/AppShell.tsx`: `const { status, featureOn } = useAuth();` and render the `MiniNoora` boundary only
when `featureOn('noora')`.

`web/src/features/home/HomePage.tsx`: `const { me, status, openSignIn, featureOn } = useAuth();` and render each
section only when its feature is on:
- "Hot in the forum": `featureOn('forum')`;
- "New in the library": `featureOn('library')`;
- "Coming up" and the `ExamTimeline`: `featureOn('calendar')`; when it's off, pass `enabled: false` to the
  `useCalendarEvents` call there (its second argument: `{ enabled: featureOn('calendar') }`);
- "The DSBA Newsletter": `featureOn('newsletter')`.

`web/src/features/forum/components/ForumSidebar.tsx`: render its `UpcomingEvents` boundary only when
`featureOn('calendar')`.

`web/src/ui/QueryError.tsx`: when `isFeatureOff(error)`, the title becomes "This part of the hub is switched off
right now." and there's no retry button:

```tsx
  if (isFeatureOff(error)) {
    return <EmptyState size={size === 'sm' ? 'sm' : 'md'} icon={Power} title="This part of the hub is switched off right now." body="Come back later." />;
  }
```

(import `isFeatureOff` from `../api/errors`, `Power` from `@phosphor-icons/react`; `EmptyState` is in the same
folder.) That covers Review Focus 3: a switch flipped while a page is open turns its next failed query into the
notice, and the next `/me` refetch (on focus) turns the whole page into it.

- [ ] **Step 6: See it in the browser**

With the stack running and this branch's API (Task 1 of the API plan rebuilt the database), as an admin:
`docker compose -p dsba-hub exec -T api python -m app.cli dev-login e2e.admin@example.com --name "Maryam E2E" --year 2 --role admin`,
then on Vite (`cd web && npx vite --port 5181 --strictPort`), with the token as `dsba_session`:
- `PUT /api/v1/admin/features/calendar` with `{"mode":"off","roleIds":[]}` (from the browser console with the CSRF
  header, or Task 5's screen later);
- as a guest: the rail, the mobile tabs, the palette and Home show no calendar; `/calendar` shows the notice;
- as the admin: `/calendar` opens with "Off for others";
- put it back to `everyone`.

Screens at 390×844 and 1366×768: nothing scrolls sideways.

- [ ] **Step 7: Check everything**

Run (background): `scripts/check.sh web` and `scripts/check.sh api`.
Expected: both `All checks passed.`

- [ ] **Step 8: Commit**

```bash
git add -A web/src
git commit -m "Web: switched-off features disappear from pages, menus, Home and the palette; admins see them marked"
```

### Task 3: Manage: one page with each manager's tools

**Files:**
- Create: `web/src/features/manage/ManagePage.tsx`, `web/src/features/manage/ManagePage.css`,
  `web/src/features/manage/api.ts`, `web/src/features/manage/sections.ts`, `web/src/features/manage/sections.test.ts`
- Modify: `web/src/features/newsletter/public.ts` (export `useIssues`), `web/src/routes.tsx`,
  `web/src/shell/ProfileMenu.tsx`
- Delete: `web/src/features/moderation/` (all three files)

**Interfaces:**
- **Consumes:** `useAuth().can`, `manages`; `ReportsQueue` (`features/forum/public`), `UploadsQueue`
  (`features/library/public`), `useIssues` (`features/newsletter/public`); `ADMIN_STATS_KEY`; `Gate`, `MANAGER_BOXES`.
- **Produces:**
  - `type SectionId = 'reports' | 'uploads' | 'newsletter' | 'calendar' | 'career' | 'numbers' | 'people' | 'activity'`
  - `sectionsFor(can: (box: Box) => boolean): SectionId[]` in `features/manage/sections.ts`
  - the route `{ id: 'manage', path: '/manage', title: 'Manage', … modules: false }`
  - a slot for Task 5: `ManagePage` renders `people` and `activity` sections with `PeopleList` and `ActivityLog`
    from `features/access/public` (Task 5 adds those; until then the sections render nothing and `sectionsFor`
    returns them, so this task's test covers them).

- [ ] **Step 1: Write the failing test**

`web/src/features/manage/sections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Box } from '../../auth';
import { sectionsFor } from './sections';

const holds = (...boxes: Box[]) => (box: Box) => boxes.includes(box);

describe('sectionsFor', () => {
  it('gives a rep the queues, the newsletter, the calendar and the numbers', () => {
    expect(sectionsFor(holds('forum.moderate', 'library.manage', 'newsletter.manage', 'calendar.manage', 'stats.view'))).toEqual(['reports', 'uploads', 'newsletter', 'calendar', 'numbers']);
  });

  it('gives a newsletter manager only the newsletter', () => {
    expect(sectionsFor(holds('newsletter.manage'))).toEqual(['newsletter']);
  });

  it('shows reports to a forum moderator without the library', () => {
    expect(sectionsFor(holds('forum.moderate'))).toEqual(['reports']);
  });

  it('gives people and activity to their boxes', () => {
    expect(sectionsFor(holds('people.suspend', 'audit.read'))).toEqual(['people', 'activity']);
  });

  it('gives a student nothing', () => {
    expect(sectionsFor(holds('forum.post', 'library.upload'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/features/manage/sections.test.ts`
Expected: FAIL, "Failed to resolve import './sections'".

- [ ] **Step 3: Write `web/src/features/manage/sections.ts`**

```ts
// Which of Manage's sections a person gets, from their boxes.
import type { Box } from '../../auth';

export type SectionId = 'reports' | 'uploads' | 'newsletter' | 'calendar' | 'career' | 'numbers' | 'people' | 'activity';

const NEEDS: [SectionId, (can: (box: Box) => boolean) => boolean][] = [
  ['reports', (can) => can('forum.moderate') || can('library.manage')],
  ['uploads', (can) => can('library.manage')],
  ['newsletter', (can) => can('newsletter.manage')],
  ['calendar', (can) => can('calendar.manage')],
  ['career', (can) => can('career.edit')],
  ['numbers', (can) => can('stats.view')],
  ['people', (can) => can('people.suspend')],
  ['activity', (can) => can('audit.read')],
];

export function sectionsFor(can: (box: Box) => boolean): SectionId[] {
  return NEEDS.filter(([, needs]) => needs(can)).map(([id]) => id);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd web && npx vitest run src/features/manage/sections.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: The page**

`web/src/features/manage/api.ts`:

```ts
// The hub's numbers for Manage. The queues (forum reports, library uploads) invalidate ADMIN_STATS_KEY after a
// decision, so they follow.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ADMIN_STATS_KEY } from '../../api/keys';

export function useAdminStats(enabled: boolean) {
  return useQuery({ queryKey: ADMIN_STATS_KEY, queryFn: () => call(api.GET('/api/v1/admin/stats')), refetchInterval: 60_000, enabled });
}
```

`web/src/features/newsletter/public.ts`: add `useIssues` to the `./api` export.

`web/src/features/manage/ManagePage.tsx`:

```tsx
// /manage: every tool a person's boxes give them, each with what's waiting. Reps, newsletter and content managers,
// and admins (who hold every box) all work from here.
import { CalendarDots, ChartBar, ClockCounterClockwise, Compass, Flag, Newspaper, Tray, UsersThree, type Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Gate, MANAGER_BOXES, useAuth } from '../../auth';
import { useQueryParam } from '../../state';
import { Button, EmptyState, ErrorBoundary, Page, PageHeader, Panel, QueryError, Skeleton, TabPanel, Tabs, formatCount } from '../../ui';
import { ActivityLog, PeopleList } from '../access/public';
import { ReportsQueue } from '../forum/public';
import { UploadsQueue } from '../library/public';
import { useIssues } from '../newsletter/public';
import { useAdminStats } from './api';
import { sectionsFor, type SectionId } from './sections';
import './ManagePage.css';

const SECTIONS: Record<SectionId, { label: string; icon: Icon }> = {
  reports: { label: 'Reports', icon: Flag },
  uploads: { label: 'Uploads', icon: Tray },
  newsletter: { label: 'Newsletter', icon: Newspaper },
  calendar: { label: 'Calendar', icon: CalendarDots },
  career: { label: 'Career Navigator', icon: Compass },
  numbers: { label: 'Numbers', icon: ChartBar },
  people: { label: 'People', icon: UsersThree },
  activity: { label: 'Activity', icon: ClockCounterClockwise },
};

const NUMBERS = [
  ['openReports', 'Open reports'],
  ['pendingUploads', 'Uploads to review'],
  ['users', 'People'],
  ['threads', 'Threads'],
  ['replies', 'Replies'],
  ['libraryItems', 'Library files'],
] as const;

function Numbers() {
  const stats = useAdminStats(true);
  if (stats.isError) return <QueryError error={stats.error} title="The numbers didn’t load" onRetry={() => void stats.refetch()} retrying={stats.isFetching} size="sm" />;
  return (
    <dl className="manage-numbers" aria-busy={stats.isPending || undefined}>
      {NUMBERS.map(([key, label]) => (
        <div key={key} className="manage-number">
          <dt>{label}</dt>
          <dd>{stats.data ? formatCount(stats.data[key]) : <Skeleton width="2.5ch" height="1em" />}</dd>
        </div>
      ))}
    </dl>
  );
}

function Drafts() {
  const issues = useIssues({ includeDrafts: true });
  const drafts = (issues.data ?? []).filter((i) => i.status === 'draft');
  if (issues.isError) return <QueryError error={issues.error} title="Drafts didn’t load" onRetry={() => void issues.refetch()} retrying={issues.isFetching} size="sm" />;
  return (
    <Panel padding="none">
      {issues.isPending ? (
        <Skeleton lines={3} />
      ) : drafts.length ? (
        <ul role="list" className="manage-list">
          {drafts.map((d) => (
            <li key={d.id}>
              <Button variant="ghost" to={`/newsletter/${d.slug}/edit`}>
                {d.title}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" icon={Newspaper} title="No drafts" body="Start the next issue from the newsletter page." action={<Button to="/newsletter">Open the newsletter</Button>} />
      )}
    </Panel>
  );
}

function LinkOut({ icon, title, body, to, label }: { icon: Icon; title: string; body: string; to: string; label: string }) {
  return (
    <Panel padding="none">
      <EmptyState size="sm" icon={icon} title={title} body={body} action={<Button to={to}>{label}</Button>} />
    </Panel>
  );
}

const BODIES: Record<SectionId, () => ReactNode> = {
  reports: () => <ReportsQueue />,
  uploads: () => <UploadsQueue />,
  newsletter: () => <Drafts />,
  calendar: () => <LinkOut icon={CalendarDots} title="The calendar" body="Add, edit and delete events from the calendar itself." to="/calendar" label="Open the calendar" />,
  career: () => <LinkOut icon={Compass} title="Career Navigator" body="Its content is edited on Career Navigator." to="/career" label="Open Career Navigator" />,
  numbers: () => <Numbers />,
  people: () => <PeopleList />,
  activity: () => <ActivityLog />,
};

function ManageScreen() {
  const { can } = useAuth();
  const sections = sectionsFor(can);
  const stats = useAdminStats(can('stats.view'));
  const counts: Partial<Record<SectionId, number | null>> = {
    reports: stats.data?.openReports ?? null,
    uploads: stats.data?.pendingUploads ?? null,
  };
  const [tab, setTab] = useQueryParam('tab', sections[0] ?? 'reports');
  const current = sections.includes(tab as SectionId) ? (tab as SectionId) : sections[0];
  return (
    <Page className="manage">
      <PageHeader title="Manage" description="Your tools, and what’s waiting for you. Every action is logged." />
      <Tabs
        idBase="manage"
        tabs={sections.map((id) => ({ id, label: SECTIONS[id].label, icon: SECTIONS[id].icon, count: counts[id] ?? null }))}
        value={current}
        onChange={(id) => setTab(id, { replace: true })}
        label="Your tools"
        className="manage-tabs"
      />
      {sections.map((id) => (
        <TabPanel key={id} idBase="manage" id={id} value={current} className="manage-panel">
          <ErrorBoundary name={`Manage:${id}`}>{BODIES[id]()}</ErrorBoundary>
        </TabPanel>
      ))}
    </Page>
  );
}

export default function ManagePage() {
  return (
    <Gate title="Manage" anyBox={MANAGER_BOXES}>
      <ManageScreen />
    </Gate>
  );
}
```

Until Task 5, `features/access/public.ts` doesn't exist. Create it now with placeholders that render nothing, so
this task compiles; Task 5 replaces them:

```ts
// The Access screen's parts other features use.
export function PeopleList() {
  return null;
}
export function ActivityLog() {
  return null;
}
```

`web/src/features/manage/ManagePage.css`: the tabs scroll inside their own box on narrow screens (the `Tabs`
component already does this; check at 360×780), the numbers are a grid:

```css
.manage-numbers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--space-3);
  margin: 0;
}
.manage-number {
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
.manage-number dt {
  color: var(--ink-2);
  font-size: var(--text-sm);
}
.manage-number dd {
  margin: 0;
  font-size: var(--text-xl);
  font-variant-numeric: tabular-nums;
}
.manage-list {
  margin: 0;
  padding: var(--space-2);
}
.manage-panel {
  margin-top: var(--space-4);
}
```

(Check the token names against `src/styles/tokens.css` and use the ones it defines.)

`web/src/routes.tsx`: replace the `moderation` entry with
`{ id: 'manage', path: '/manage', title: 'Manage', Page: lazy(() => import('./features/manage/ManagePage')), modules: false },`.

`web/src/shell/ProfileMenu.tsx`: `const { me, status, manages, openSignIn, signOut } = useAuth();` and after the
account item:

```tsx
    ...(manages ? [{ id: 'manage', label: 'Manage', icon: Wrench, to: '/manage' }] : []),
```

(`Wrench` from `@phosphor-icons/react`; update the component's doc comment: "Your account, Manage, Access, Sign
out".)

Delete `web/src/features/moderation/`. Then `grep -rn "moderation" web/src --include='*.ts*'` should print only the
style guide's text, if any, and no imports.

- [ ] **Step 6: See it in the browser**

Sign in with dev-login as a rep (`--role rep`), a newsletter manager (`--role newsletter-manager`), a student and an
admin. Each sees exactly the sections the test lists; the student's profile menu has no Manage, and `/manage`
says "This page isn’t on your account". A suspended rep (suspend them from an admin's session with
`PATCH /api/v1/admin/users/{id}` `{"status":"suspended"}`) sees "Your account is suspended" (Review Focus 1); restore
them afterwards. Screens at 360×780, 768×1024 and 1920×1080, touch emulated on the first two.

- [ ] **Step 7: Check everything**

Run (background): `scripts/check.sh web` and `scripts/check.sh api`. Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add -A web/src
git commit -m "Web: Manage, one page with each manager's tools; the moderation page goes"
```

### Task 4: Access, part 1: the page, its hooks and the Roles tab

**Files:**
- Create: `web/src/features/access/api.ts`, `web/src/features/access/AccessPage.tsx`,
  `web/src/features/access/AccessPage.css`, `web/src/features/access/RolesTab.tsx`,
  `web/src/features/access/RoleEditor.tsx`, `web/src/features/access/grid.ts`, `web/src/features/access/grid.test.ts`
- Modify: `web/src/features/access/public.ts` (still the placeholders), `web/src/routes.tsx`,
  `web/src/shell/ProfileMenu.tsx`, `web/src/api/keys.ts`

**Interfaces:**
- **Consumes** (API plan, Task 4): `GET /api/v1/admin/roles` → `RoleCatalogue { roles: RoleOut[]; boxes: BoxOut[] }`;
  `POST /api/v1/admin/roles` (`RoleCreate { name; badge?; boxes }`) → `RoleOut`; `PATCH /api/v1/admin/roles/{role_id}`
  (`RoleUpdate { version; name?; badge?; boxes?; position? }`) → `RoleOut`; `DELETE /api/v1/admin/roles/{role_id}` →
  204. `RoleOut { id; slug; name; badge; position; builtIn; locked; version; boxes; holders }`,
  `BoxOut { key; area; label }`. Errors: `role_locked`, `role_changed`, `invalid_input` (`fields.name`), `rate_limited`.
- **Produces:**
  - `ACCESS_ROLES_KEY = ['admin', 'roles'] as const`, `ACCESS_FEATURES_KEY = ['admin', 'features'] as const` in
    `src/api/keys.ts`.
  - In `features/access/api.ts`: `useRoleCatalogue()`, `useCreateRole()`, `useUpdateRole()`, `useDeleteRole()`.
  - In `features/access/grid.ts`: `groupBoxes(boxes: BoxOut[]): { area: string; boxes: BoxOut[] }[]` (areas in the
    catalogue's order) and `roleChanges(role: RoleOut, draft: Draft): RoleUpdate | null` with
    `interface Draft { name: string; badge: string; boxes: ReadonlySet<string> }`.
  - The route `{ id: 'access', path: '/admin/access', title: 'Access', … modules: false }` and the tab ids
    `roles | people | features | activity` (`?tab=`).

- [ ] **Step 1: Write the failing test**

`web/src/features/access/grid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BoxOut, RoleOut } from '../../api/types';
import { groupBoxes, roleChanges } from './grid';

const box = (key: BoxOut['key'], area: string): BoxOut => ({ key, area, label: key });
const role: RoleOut = { id: 'r1', slug: 'newsletter-manager', name: 'Newsletter manager', badge: 'Newsletter', position: 3, builtIn: false, locked: false, version: 4, boxes: ['newsletter.manage'], holders: 2 };

describe('groupBoxes', () => {
  it('keeps the catalogue’s order of areas and of boxes inside them', () => {
    const groups = groupBoxes([box('forum.post', 'Forum'), box('library.upload', 'Library'), box('forum.moderate', 'Forum')]);
    expect(groups.map((g) => g.area)).toEqual(['Forum', 'Library']);
    expect(groups[0].boxes.map((b) => b.key)).toEqual(['forum.post', 'forum.moderate']);
  });
});

describe('roleChanges', () => {
  it('sends nothing when nothing changed', () => {
    expect(roleChanges(role, { name: 'Newsletter manager', badge: 'Newsletter', boxes: new Set(['newsletter.manage']) })).toBeNull();
  });

  it('sends only what changed, with the version it was loaded at', () => {
    expect(roleChanges(role, { name: 'Newsletter team', badge: 'Newsletter', boxes: new Set(['newsletter.manage', 'calendar.manage']) })).toEqual({
      version: 4,
      name: 'Newsletter team',
      boxes: ['calendar.manage', 'newsletter.manage'],
    });
  });

  it('removes the badge when it is emptied', () => {
    expect(roleChanges(role, { name: 'Newsletter manager', badge: '  ', boxes: new Set(['newsletter.manage']) })).toEqual({ version: 4, badge: null });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/features/access/grid.test.ts`
Expected: FAIL, "Failed to resolve import './grid'".

- [ ] **Step 3: Write `web/src/features/access/grid.ts`**

```ts
// The Roles tab's pure parts: boxes grouped by area for the checkboxes, and what a save sends.
import type { BoxOut, RoleOut, RoleUpdate } from '../../api/types';

export interface Draft {
  name: string;
  badge: string;
  boxes: ReadonlySet<string>;
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

/** The PATCH body for what changed, or null when nothing did. Boxes go as a sorted whole. */
export function roleChanges(role: RoleOut, draft: Draft): RoleUpdate | null {
  const body: RoleUpdate = { version: role.version };
  const name = draft.name.trim();
  if (name !== role.name) body.name = name;
  const badge = draft.badge.trim() || null;
  if (badge !== (role.badge ?? null)) body.badge = badge;
  const boxes = [...draft.boxes].sort();
  const before = [...role.boxes].sort();
  if (boxes.join() !== before.join()) body.boxes = boxes as RoleUpdate['boxes'];
  return Object.keys(body).length > 1 ? body : null;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd web && npx vitest run src/features/access/grid.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: The hooks**

`web/src/api/keys.ts`, add:

```ts
/** The Access screen: the roles catalogue and the feature switches (admins). */
export const ACCESS_ROLES_KEY = ['admin', 'roles'] as const;
export const ACCESS_FEATURES_KEY = ['admin', 'features'] as const;
```

`web/src/features/access/api.ts`:

```ts
// The Access screen's data: roles, people's roles and the switches. Changes to roles also change the people list's
// role names, /me (an admin may edit a role they hold) and the activity log.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ACCESS_ROLES_KEY } from '../../api/keys';
import type { RoleCreate, RoleUpdate } from '../../api/types';
import { ME_KEY } from '../../auth';

export const ADMIN_USERS_KEY = ['admin', 'users'] as const;
export const AUDIT_KEY = ['admin', 'audit'] as const;

export function rolesChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ACCESS_ROLES_KEY });
  void qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
  void qc.invalidateQueries({ queryKey: AUDIT_KEY });
  void qc.invalidateQueries({ queryKey: ME_KEY });
}

export function useRoleCatalogue() {
  return useQuery({ queryKey: ACCESS_ROLES_KEY, queryFn: () => call(api.GET('/api/v1/admin/roles')) });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoleCreate) => call(api.POST('/api/v1/admin/roles', { body })),
    onSuccess: () => rolesChanged(qc),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoleUpdate }) => call(api.PATCH('/api/v1/admin/roles/{role_id}', { params: { path: { role_id: id } }, body })),
    onSuccess: () => rolesChanged(qc),
    // A stale version: load the role again, so the admin edits what's there now.
    onError: () => void qc.invalidateQueries({ queryKey: ACCESS_ROLES_KEY }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/v1/admin/roles/{role_id}', { params: { path: { role_id: id } } })),
    onSuccess: () => rolesChanged(qc),
  });
}
```

(`ADMIN_USERS_KEY` and `AUDIT_KEY` move here from `features/admin/api.ts`; Task 5 deletes that file. Until then,
`features/admin/api.ts` imports them from `../access/api`.)

- [ ] **Step 6: The Roles tab**

`web/src/features/access/RoleEditor.tsx`: a `Modal` (from `src/ui`) for one role, new or existing:

```tsx
// One role in a dialog: its name, its badge and its boxes by area. Admin is shown read-only.
import { useEffect, useId, useState } from 'react';
import { ApiError, errorMessage } from '../../api/errors';
import type { BoxOut, RoleOut } from '../../api/types';
import { Button, Modal, TextField } from '../../ui';
import { groupBoxes, roleChanges, type Draft } from './grid';
import { useCreateRole, useUpdateRole } from './api';

const STALE = 'Someone else changed this role. Load it again and redo your change.';

export function RoleEditor({ role, boxes, open, onClose, onSaved }: { role: RoleOut | null; boxes: BoxOut[]; open: boolean; onClose: () => void; onSaved: (name: string) => void }) {
  const uid = useId();
  const create = useCreateRole();
  const update = useUpdateRole();
  const [draft, setDraft] = useState<Draft>({ name: '', badge: '', boxes: new Set() });
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setProblem(null);
    setDraft({ name: role?.name ?? '', badge: role?.badge ?? '', boxes: new Set(role?.boxes ?? []) });
  }, [open, role]);
  const locked = !!role?.locked;
  const busy = create.isPending || update.isPending;

  const toggle = (key: string) =>
    setDraft((d) => {
      const next = new Set(d.boxes);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...d, boxes: next };
    });

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'role_changed') setProblem(STALE);
    else if (e instanceof ApiError && e.fields.name) setProblem(e.fields.name);
    else setProblem(errorMessage(e));
  };

  const save = () => {
    setProblem(null);
    if (!role) {
      create.mutate(
        { name: draft.name.trim(), badge: draft.badge.trim() || null, boxes: [...draft.boxes].sort() as RoleOut['boxes'] },
        { onSuccess: (r) => onSaved(r.name), onError: fail },
      );
      return;
    }
    const body = roleChanges(role, draft);
    if (!body) return onClose();
    update.mutate({ id: role.id, body }, { onSuccess: (r) => onSaved(r.name), onError: fail });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? (locked ? role.name : `Edit ${role.name}`) : 'New role'}
      footer={
        locked ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={busy} disabled={draft.name.trim().length < 2}>
              {role ? 'Save' : 'Create role'}
            </Button>
          </>
        )
      }
    >
      {locked ? <p className="access-note">Admin always holds every box, and can’t be changed.</p> : null}
      <TextField label="Name" value={draft.name} disabled={locked} maxLength={40} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
      <TextField
        label="Badge"
        description="Shown next to their name, such as “Newsletter”. Leave it empty for none."
        value={draft.badge}
        disabled={locked}
        maxLength={24}
        onChange={(e) => setDraft((d) => ({ ...d, badge: e.target.value }))}
      />
      {groupBoxes(boxes).map((g) => (
        <fieldset key={g.area} className="access-area">
          <legend>{g.area}</legend>
          {g.boxes.map((b) => (
            <label key={b.key} className="access-box" htmlFor={`${uid}-${b.key}`}>
              <input id={`${uid}-${b.key}`} type="checkbox" checked={locked || draft.boxes.has(b.key)} disabled={locked} onChange={() => toggle(b.key)} />
              <span>{b.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
      {problem ? (
        <p className="access-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </Modal>
  );
}
```

(Check `Modal`'s and `TextField`'s real props in `src/ui/Modal.tsx` and `src/ui/Field.tsx`, and adapt `title`,
`footer` and `description` to their names.)

`web/src/features/access/RolesTab.tsx`: the roles as a table, roles across and boxes down, on laptops; one role per
card on phones:

```tsx
// Every role, its badge, how many people hold it and its boxes. Admins open a role to edit it.
import { useState } from 'react';
import { Lock, Plus, Trash } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import type { RoleOut } from '../../api/types';
import { useMediaQuery, useToast } from '../../state';
import { Badge, Button, ConfirmDialog, Panel, QueryError, Skeleton, formatCount } from '../../ui';
import { useDeleteRole, useRoleCatalogue } from './api';
import { groupBoxes } from './grid';
import { RoleEditor } from './RoleEditor';

export function RolesTab() {
  const catalogue = useRoleCatalogue();
  const remove = useDeleteRole();
  const { push } = useToast();
  const narrow = useMediaQuery('(max-width: 767px)');
  const [editing, setEditing] = useState<RoleOut | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoleOut | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (catalogue.isPending) return <Skeleton lines={6} />;
  if (catalogue.isError) return <QueryError error={catalogue.error} title="Roles didn’t load" onRetry={() => void catalogue.refetch()} retrying={catalogue.isFetching} />;
  const { roles, boxes } = catalogue.data;
  const groups = groupBoxes(boxes);
  const holds = (r: RoleOut, key: string) => r.locked || r.boxes.includes(key as RoleOut['boxes'][number]);
  const people = (n: number) => (n === 1 ? '1 person' : `${formatCount(n)} people`);

  const header = (r: RoleOut) => (
    <span className="access-role">
      <span className="access-role__name">
        {r.locked ? <Lock aria-label="Can’t be changed" /> : null} {r.name}
      </span>
      {r.badge ? <Badge size="sm">{r.badge}</Badge> : null}
      <span className="access-role__holders">{people(r.holders)}</span>
      <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`${r.locked ? 'See' : 'Edit'} ${r.name}`}>
        {r.locked ? 'See' : 'Edit'}
      </Button>
      {r.builtIn || r.locked ? null : (
        <Button size="sm" variant="ghost" leadingIcon={Trash} onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
          Delete
        </Button>
      )}
    </span>
  );

  return (
    <>
      <div className="access-tools">
        <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing('new')}>
          New role
        </Button>
      </div>
      {narrow ? (
        <ul role="list" className="access-cards">
          {roles.map((r) => (
            <li key={r.id}>
              <Panel>
                {header(r)}
                <ul className="access-card-boxes">
                  {boxes.filter((b) => holds(r, b.key)).map((b) => (
                    <li key={b.key}>{b.label}</li>
                  ))}
                </ul>
              </Panel>
            </li>
          ))}
        </ul>
      ) : (
        <Panel padding="none" className="access-grid-wrap">
          <table className="access-grid">
            <thead>
              <tr>
                <th scope="col">Box</th>
                {roles.map((r) => (
                  <th key={r.id} scope="col">
                    {header(r)}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.area}>
                <tr>
                  <th scope="rowgroup" colSpan={roles.length + 1} className="access-grid__area">
                    {g.area}
                  </th>
                </tr>
                {g.boxes.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">{b.label}</th>
                    {roles.map((r) => (
                      <td key={r.id}>{holds(r, b.key) ? <span aria-label="Yes">✓</span> : <span aria-label="No">·</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Panel>
      )}
      <RoleEditor
        open={editing !== null}
        role={editing === 'new' ? null : editing}
        boxes={boxes}
        onClose={() => setEditing(null)}
        onSaved={(name) => {
          setEditing(null);
          push({ tone: 'success', title: `${name} is saved`, body: 'People who hold it have its boxes now.' });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : ''}
        body={deleting ? `${people(deleting.holders)} hold it. They lose its powers and get a notification.` : ''}
        confirmLabel="Delete role"
        tone="danger"
        busy={remove.isPending}
        error={problem}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              push({ tone: 'success', title: `${deleting.name} is deleted` });
              setDeleting(null);
            },
            onError: (e) => setProblem(errorMessage(e)),
          })
        }
        onClose={() => {
          setProblem(null);
          setDeleting(null);
        }}
      />
    </>
  );
}
```

The grid is wider than a laptop with many roles, so `.access-grid-wrap` scrolls inside its own box
(`overflow-x: auto`), never the page; the first column is `position: sticky; left: 0`.

`web/src/features/access/AccessPage.tsx`:

```tsx
// /admin/access (admins): roles and their boxes, people's roles, the feature switches, and the activity log.
import { ClockCounterClockwise, IdentificationBadge, ToggleRight, UsersThree } from '@phosphor-icons/react';
import { Gate } from '../../auth';
import { useQueryParam } from '../../state';
import { ErrorBoundary, Page, PageHeader, TabPanel, Tabs } from '../../ui';
import { ActivityLog, PeopleList } from './public';
import { RolesTab } from './RolesTab';
import './AccessPage.css';

const TABS = [
  { id: 'roles', label: 'Roles', icon: IdentificationBadge },
  { id: 'people', label: 'People', icon: UsersThree },
  { id: 'features', label: 'Features', icon: ToggleRight },
  { id: 'activity', label: 'Activity', icon: ClockCounterClockwise },
];

function AccessScreen() {
  const [tab, setTab] = useQueryParam('tab', 'roles');
  return (
    <Page className="access">
      <PageHeader title="Access" description="Who can do what, and which features are on. Every change is logged under Activity." />
      <Tabs idBase="access" tabs={TABS} value={tab} onChange={(id) => setTab(id, { replace: true })} label="Access" />
      <TabPanel idBase="access" id="roles" value={tab} className="access-panel">
        <ErrorBoundary name="Access:roles">
          <RolesTab />
        </ErrorBoundary>
      </TabPanel>
      <TabPanel idBase="access" id="people" value={tab} className="access-panel">
        <ErrorBoundary name="Access:people">
          <PeopleList withRoles />
        </ErrorBoundary>
      </TabPanel>
      <TabPanel idBase="access" id="features" value={tab} className="access-panel">
        <ErrorBoundary name="Access:features">{null}</ErrorBoundary>
      </TabPanel>
      <TabPanel idBase="access" id="activity" value={tab} className="access-panel">
        <ErrorBoundary name="Access:activity">
          <ActivityLog />
        </ErrorBoundary>
      </TabPanel>
    </Page>
  );
}

export default function AccessPage() {
  return (
    <Gate title="Access" admin>
      <AccessScreen />
    </Gate>
  );
}
```

The placeholder `PeopleList` in `public.ts` gains the prop: `export function PeopleList(_: { withRoles?: boolean }) { return null; }`.
Task 5 fills the People, Features and Activity tabs.

`web/src/features/access/AccessPage.css`:

```css
.access-panel { margin-top: var(--space-4); }
.access-tools { display: flex; justify-content: flex-end; margin-bottom: var(--space-3); }
.access-grid-wrap { overflow-x: auto; }
.access-grid { border-collapse: collapse; min-width: 100%; }
.access-grid th, .access-grid td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--line); text-align: center; }
.access-grid tbody th[scope='row'] { text-align: start; font-weight: 400; position: sticky; left: 0; background: var(--surface); max-width: 22rem; }
.access-grid__area { text-align: start; font-weight: 600; background: var(--surface-2); }
.access-role { display: inline-flex; flex-direction: column; align-items: center; gap: var(--space-1); }
.access-role__holders { color: var(--ink-2); font-size: var(--text-sm); }
.access-cards { display: grid; gap: var(--space-3); margin: 0; padding: 0; }
.access-area { border: 0; margin: var(--space-3) 0 0; padding: 0; }
.access-area legend { font-weight: 600; margin-bottom: var(--space-1); }
.access-box { display: flex; align-items: center; gap: var(--space-2); min-height: 44px; }
.access-box input { width: 20px; height: 20px; }
.access-problem { color: var(--alert); margin-top: var(--space-3); }
.access-note { color: var(--ink-2); }
```

(Use the token names from `src/styles/tokens.css`; replace any above it doesn't define.)

`web/src/routes.tsx`: add `{ id: 'access', path: '/admin/access', title: 'Access', Page: lazy(() => import('./features/access/AccessPage')), modules: false },`.

`web/src/shell/ProfileMenu.tsx`: `isAdmin` from `useAuth()`, and after Manage:
`...(isAdmin ? [{ id: 'access', label: 'Access', icon: Key, to: '/admin/access' }] : []),` (`Key` from
`@phosphor-icons/react`).

- [ ] **Step 7: The stale save, by hand**

Open one role in two admin windows. Save a change in the first; save another in the second: the second shows the
`STALE` message and the catalogue reloads (Review Focus 2). Then save again in the second: it goes through.

- [ ] **Step 8: Check everything**

Run (background): `scripts/check.sh web` and `scripts/check.sh api`. Expected: both pass. Screens of the Roles tab at
360×780, 1024×768 and 1920×1080: on the phone, one card per role; on the laptop the grid scrolls inside its panel, if
at all, and the page never does.

- [ ] **Step 9: Commit**

```bash
git add -A web/src
git commit -m "Web: the Access screen and its Roles tab"
```

### Task 5: Access, part 2: People, Features and Activity; the old admin pages go

**Files:**
- Create: `web/src/features/access/PeopleList.tsx`, `web/src/features/access/RolesDialog.tsx`,
  `web/src/features/access/FeaturesTab.tsx`, `web/src/features/access/ActivityLog.tsx`,
  `web/src/features/access/switches.ts`, `web/src/features/access/switches.test.ts`
- Move: `web/src/features/admin/audit.ts` → `web/src/features/access/audit.ts`, and its test likewise;
  `web/src/features/admin/PeoplePage.css` → `web/src/features/access/PeopleList.css`
- Modify: `web/src/features/access/public.ts`, `web/src/features/access/api.ts`,
  `web/src/features/access/AccessPage.tsx`, `web/src/routes.tsx`
- Delete: `web/src/features/admin/` (whatever is left: `api.ts`, `PeoplePage.tsx`)

**Interfaces:**
- **Consumes** (API plan): `GET /api/v1/admin/users?q&role&limit&offset` → `AdminUserPage { items: AdminUser[]; total }`
  with `AdminUser { id; displayName; email; phone; roles: RoleSummary[]; status; year; createdAt; lastSeenAt }`
  (`email`/`phone` are null for non-admins); `PATCH /api/v1/admin/users/{user_id}` (`{ status }`);
  `PUT /api/v1/admin/users/{user_id}/roles` (`UserRolesUpdate { roleIds }`) → `AdminUser`;
  `GET /api/v1/admin/features` → `FeatureOut[]` (`feature`, `label`, `hides`, `mode`, `roleIds`);
  `PUT /api/v1/admin/features/{feature}` (`SwitchUpdate { mode; roleIds }`) → `FeatureOut`;
  `GET /api/v1/admin/audit`. Errors: `cannot_change_self`, `last_admin`, `forbidden`, `invalid_input`, `rate_limited`.
- **Produces:**
  - `PeopleList({ withRoles }: { withRoles?: boolean })` and `ActivityLog()` from `features/access/public.ts`.
  - `switchSummary(f: FeatureOut, roleName: (id: string) => string | null): string` and
    `switchBody(mode: SwitchMode, roleIds: readonly string[]): SwitchUpdate` in `switches.ts`.
  - `usePeople(q, role, enabled)`, `useAudit(enabled)`, `useUpdatePerson()`, `useSetUserRoles()`,
    `useFeatureSwitches()`, `useSetSwitch()` in `features/access/api.ts`.

- [ ] **Step 1: Write the failing test**

`web/src/features/access/switches.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FeatureOut } from '../../api/types';
import { switchBody, switchSummary } from './switches';

const f = (mode: FeatureOut['mode'], roleIds: string[] = []): FeatureOut => ({ feature: 'calendar', label: 'Calendar', hides: 'The calendar.', mode, roleIds });
const names: Record<string, string> = { r1: 'Testers', r2: 'Rep' };

describe('switchSummary', () => {
  it('says who sees the feature', () => {
    expect(switchSummary(f('everyone'), (id) => names[id] ?? null)).toBe('On for everyone');
    expect(switchSummary(f('off'), (id) => names[id] ?? null)).toBe('Off');
    expect(switchSummary(f('roles', ['r1', 'r2']), (id) => names[id] ?? null)).toBe('On for Testers and Rep');
  });

  it('skips roles it no longer knows', () => {
    expect(switchSummary(f('roles', ['r1', 'gone']), (id) => names[id] ?? null)).toBe('On for Testers');
  });
});

describe('switchBody', () => {
  it('sends roles only for "roles"', () => {
    expect(switchBody('everyone', ['r1'])).toEqual({ mode: 'everyone', roleIds: [] });
    expect(switchBody('roles', ['r2', 'r1'])).toEqual({ mode: 'roles', roleIds: ['r1', 'r2'] });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/features/access/switches.test.ts`
Expected: FAIL, "Failed to resolve import './switches'".

- [ ] **Step 3: Write `web/src/features/access/switches.ts`**

```ts
// The Features tab's words and request bodies.
import type { FeatureOut, SwitchUpdate } from '../../api/types';

export type SwitchMode = FeatureOut['mode'];

const and = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export function switchSummary(f: FeatureOut, roleName: (id: string) => string | null): string {
  if (f.mode === 'everyone') return 'On for everyone';
  if (f.mode === 'off') return 'Off';
  const names = f.roleIds.map(roleName).filter((n): n is string => !!n);
  return names.length ? `On for ${and(names)}` : 'Off';
}

export function switchBody(mode: SwitchMode, roleIds: readonly string[]): SwitchUpdate {
  return { mode, roleIds: mode === 'roles' ? [...roleIds].sort() : [] };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd web && npx vitest run src/features/access/switches.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: The hooks**

Append to `web/src/features/access/api.ts` (and add `keepPreviousData`, `useInfiniteQuery`, `type InfiniteData` to
the TanStack import; `nextOffset` from `../../api/paging`; `ACCESS_FEATURES_KEY`, `FEATURES_KEY` from
`../../api/keys`; the types `AdminUserPage`, `AdminUserUpdate`, `FeatureOut`, `SwitchUpdate`):

```ts
const PAGE = 20;

export function usePeople(q: string, role: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...ADMIN_USERS_KEY, { q, role }],
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/admin/users', { params: { query: { q: q || undefined, role: role ?? undefined, limit: PAGE, offset: pageParam } } })),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAudit(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: AUDIT_KEY,
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/admin/audit', { params: { query: { limit: PAGE, offset: pageParam } } })),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
  });
}

function putPerson(qc: QueryClient, person: AdminUserPage['items'][number]) {
  qc.setQueriesData<InfiniteData<AdminUserPage, number>>({ queryKey: ADMIN_USERS_KEY }, (data) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((u) => (u.id === person.id ? person : u)) })) } : data,
  );
  void qc.invalidateQueries({ queryKey: AUDIT_KEY });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: AdminUserUpdate }) => call(api.PATCH('/api/v1/admin/users/{user_id}', { params: { path: { user_id: id } }, body: change })),
    onSuccess: (person) => putPerson(qc, person),
  });
}

export function useSetUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleIds }: { id: string; roleIds: string[] }) => call(api.PUT('/api/v1/admin/users/{user_id}/roles', { params: { path: { user_id: id } }, body: { roleIds } })),
    onSuccess: (person) => {
      putPerson(qc, person);
      void qc.invalidateQueries({ queryKey: ACCESS_ROLES_KEY }); // holder counts
    },
  });
}

export function useFeatureSwitches() {
  return useQuery({ queryKey: ACCESS_FEATURES_KEY, queryFn: () => call(api.GET('/api/v1/admin/features')) });
}

export function useSetSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feature, body }: { feature: FeatureOut['feature']; body: SwitchUpdate }) => call(api.PUT('/api/v1/admin/features/{feature}', { params: { path: { feature } }, body })),
    onSuccess: (out) => {
      qc.setQueryData<FeatureOut[]>(ACCESS_FEATURES_KEY, (list) => list?.map((f) => (f.feature === out.feature ? out : f)));
      void qc.invalidateQueries({ queryKey: FEATURES_KEY });
      void qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
  });
}
```

- [ ] **Step 6: People**

`web/src/features/access/RolesDialog.tsx`: one person's roles as checkboxes, from the catalogue. The person's own
row never opens it (the API answers `cannot_change_self`; the button isn't shown):

```tsx
// Which roles one person holds, as checkboxes. Saving sends exactly the ticked roles.
import { useEffect, useId, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { AdminUser } from '../../api/types';
import { Button, Modal, Skeleton } from '../../ui';
import { useRoleCatalogue, useSetUserRoles } from './api';

export function RolesDialog({ person, onClose, onSaved }: { person: AdminUser | null; onClose: () => void; onSaved: (p: AdminUser) => void }) {
  const uid = useId();
  const catalogue = useRoleCatalogue();
  const save = useSetUserRoles();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setProblem(null);
    setTicked(new Set(person?.roles.map((r) => r.id) ?? []));
  }, [person]);
  const name = person?.displayName || 'No name yet';
  return (
    <Modal
      open={person !== null}
      onClose={onClose}
      title={`${name}’s roles`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              person &&
              save.mutate({ id: person.id, roleIds: [...ticked] }, { onSuccess: onSaved, onError: (e) => setProblem(errorMessage(e)) })
            }
          >
            Save roles
          </Button>
        </>
      }
    >
      {catalogue.isPending ? (
        <Skeleton lines={4} />
      ) : (
        <fieldset className="access-area">
          <legend>They get every box any of these roles has.</legend>
          {(catalogue.data?.roles ?? []).map((r) => (
            <label key={r.id} className="access-box" htmlFor={`${uid}-${r.id}`}>
              <input
                id={`${uid}-${r.id}`}
                type="checkbox"
                checked={ticked.has(r.id)}
                onChange={() =>
                  setTicked((t) => {
                    const next = new Set(t);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
              />
              <span>
                {r.name}
                {r.badge ? ` (${r.badge})` : ''}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {problem ? (
        <p className="access-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </Modal>
  );
}
```

A `last_admin` answer shows the API's message here ("The hub needs at least one active admin. Make someone else an
admin first."): Review Focus 5.

`web/src/features/access/PeopleList.tsx`: move the `People` component and `PersonRow` from
`features/admin/PeoplePage.tsx` into it, renamed `PeopleList` and `PersonRow`, with these changes:
- `export function PeopleList({ withRoles = false }: { withRoles?: boolean })`;
- the import of `./PeopleList.css` (the moved CSS);
- the role filter's options come from `useRoleCatalogue()` when `withRoles` (value = slug, label = name, plus
  `{ value: '', label: 'Everyone' }` first); without `withRoles` there's no filter and no catalogue request (people
  with only `people.suspend` can't read the catalogue);
- the search placeholder is "Search by name, email or phone" when `isAdmin`, else "Search by name";
- the row's roles cell shows the role names joined by ", " (or "No roles"), and when `withRoles && !isSelf` a
  "Change" button with `aria-label={\`Change the roles of ${displayName(p)}\`}` opens `RolesDialog`; without
  `withRoles` the column is left out;
- the contacts line shows only what the API sent (it's null for non-admins);
- the suspend and restore buttons show only when `!isSelf && (isAdmin || !p.roles.some((r) => r.slug === 'admin'))`
  (only admins suspend an admin);
- success toasts: roles: "{name}'s roles are saved" with "They get a notification."; status: as before;
- `Change` keeps only `{ status: 'active' | 'suspended' }`;
- the confirm body for suspending: "They can still sign in and read, but can’t post, upload or react until you lift
  it, and any roles they hold give them nothing meanwhile. They get a notification."

`web/src/features/access/ActivityLog.tsx`: move the `Activity` component from `PeoplePage.tsx`, renamed
`ActivityLog`, importing `./audit` and `./api`. Its empty state body: "Role changes, switches, suspensions and
moderation show up here." Its name lookup (`usePeople('', null, true)`) needs `people.suspend`; pass
`can('people.suspend')` as `enabled`.

`web/src/features/access/public.ts` becomes:

```ts
// The Access screen's parts that Manage shows to people holding the matching boxes.
export { ActivityLog } from './ActivityLog';
export { PeopleList } from './PeopleList';
```

Delete `web/src/features/admin/` and the `people` route in `routes.tsx`. `git mv` the audit files first so their
history follows.

- [ ] **Step 7: Features**

`web/src/features/access/FeaturesTab.tsx`:

```tsx
// Each feature's switch: off, on for some roles, or on for everyone. Admins see every feature whatever its switch.
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { FeatureOut } from '../../api/types';
import { useToast } from '../../state';
import { Panel, QueryError, SegmentedControl, Skeleton } from '../../ui';
import { useFeatureSwitches, useRoleCatalogue, useSetSwitch } from './api';
import { switchBody, switchSummary, type SwitchMode } from './switches';

const MODES: { value: SwitchMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'roles', label: 'Some roles' },
  { value: 'everyone', label: 'Everyone' },
];

function FeatureRow({ f, roles }: { f: FeatureOut; roles: { id: string; name: string }[] }) {
  const set = useSetSwitch();
  const { push } = useToast();
  const [mode, setMode] = useState<SwitchMode>(f.mode);
  const [picked, setPicked] = useState<Set<string>>(new Set(f.roleIds));
  const [problem, setProblem] = useState<string | null>(null);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? null;
  const send = (nextMode: SwitchMode, ids: Set<string>) => {
    setProblem(null);
    if (nextMode === 'roles' && ids.size === 0) return; // wait for a role to be picked
    set.mutate(
      { feature: f.feature, body: switchBody(nextMode, [...ids]) },
      { onSuccess: (out) => push({ tone: 'success', title: `${out.label}: ${switchSummary(out, roleName).toLowerCase()}` }), onError: (e) => setProblem(errorMessage(e)) },
    );
  };
  return (
    <li className="access-feature">
      <div className="access-feature__text">
        <h3>{f.label}</h3>
        <p>Switching it off hides: {f.hides}</p>
      </div>
      <SegmentedControl
        label={`${f.label}: who sees it`}
        options={MODES}
        value={mode}
        onChange={(m) => {
          setMode(m);
          send(m, picked);
        }}
      />
      {mode === 'roles' ? (
        <fieldset className="access-area">
          <legend>Which roles</legend>
          {roles.map((r) => (
            <label key={r.id} className="access-box">
              <input
                type="checkbox"
                checked={picked.has(r.id)}
                onChange={() => {
                  const next = new Set(picked);
                  if (next.has(r.id)) next.delete(r.id);
                  else next.add(r.id);
                  setPicked(next);
                  send('roles', next);
                }}
              />
              <span>{r.name}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {problem ? (
        <p className="access-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

export function FeaturesTab() {
  const switches = useFeatureSwitches();
  const catalogue = useRoleCatalogue();
  if (switches.isPending) return <Skeleton lines={8} />;
  if (switches.isError) return <QueryError error={switches.error} title="The switches didn’t load" onRetry={() => void switches.refetch()} retrying={switches.isFetching} />;
  const roles = (catalogue.data?.roles ?? []).filter((r) => !r.locked).map((r) => ({ id: r.id, name: r.name }));
  return (
    <Panel padding="none">
      <ul role="list" className="access-features">
        {switches.data.map((f) => (
          <FeatureRow key={f.feature} f={f} roles={roles} />
        ))}
      </ul>
    </Panel>
  );
}
```

Admin is left out of the role choices: admins see every feature anyway.

`AccessPage.tsx`: the Features panel renders `<FeaturesTab />`. Add to `AccessPage.css`:

```css
.access-features { margin: 0; padding: 0; }
.access-feature { display: grid; gap: var(--space-2); padding: var(--space-4); border-bottom: 1px solid var(--line); }
.access-feature h3 { margin: 0; font-size: var(--text-md); }
.access-feature p { margin: 0; color: var(--ink-2); max-width: var(--measure); }
@media (min-width: 1024px) {
  .access-feature { grid-template-columns: 1fr auto; align-items: center; }
  .access-feature .access-area, .access-feature .access-problem { grid-column: 1 / -1; }
}
```

- [ ] **Step 8: See it in the browser**

As an admin: give Ali (a made-up student) the Newsletter manager role on People; he gets the notification and
Manage. Try to untick your own Admin: there's no Change button on your own row. Switch the calendar to Some roles →
Rep: a student loses it on their next `/me`, a rep keeps it, and the guest list (`/features`) drops it. Put it back
to Everyone. As a rep: Manage has no People tab; as a holder of only `people.suspend` (make a role with just that
box): People shows names without emails, and no Change button.

Screens: 360×780 and 844×390 (touch: every checkbox row and segmented button is at least 44 px), 1366×768,
3440×1440.

- [ ] **Step 9: Check everything**

Run (background): `scripts/check.sh web` and `scripts/check.sh api`. Expected: both pass.
`grep -rn "features/admin\|admin/people\|/moderation" web/src` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add -A web/src
git commit -m "Web: Access's People, Features and Activity tabs; Manage gets people and activity"
```

### Task 6: PostHog learns which features were on

**Files:**
- Modify: `web/src/lib/analytics.ts`, `web/src/lib/analytics.test.ts`, `web/src/main.tsx`
- Create: `web/src/shell/AnalyticsFeatures.tsx`
- Modify: `web/src/shell/AppShell.tsx`

**Interfaces:**
- **Consumes:** `useAuth().featureOn`, `FEATURE_KEYS`.
- **Produces:** in `lib/analytics.ts`: `featuresProperty(on: readonly string[]): string[]` (sorted, known keys only,
  no duplicates) and `setVisitFeatures(on: readonly string[]): void` (registers `features` on every later event; a
  no-op before analytics starts or without a key).

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/analytics.test.ts`:

```ts
describe('featuresProperty (D13)', () => {
  it('is the sorted list of known feature keys, and nothing else', () => {
    expect(featuresProperty(['noora', 'forum', 'forum', 'calendar'])).toEqual(['calendar', 'forum', 'noora']);
    expect(featuresProperty(['forum', 'newsletter.manage', 'admin'])).toEqual(['forum']);
    expect(featuresProperty([])).toEqual([]);
  });

  it('survives the scrub: page views keep it', () => {
    const event = { event: '$pageview', properties: { features: ['forum'], $current_url: 'https://hub.example.com/forum?q=x' } } as unknown as CaptureResult;
    expect(scrubEvent(event)?.properties.features).toEqual(['forum']);
  });
});
```

and add `featuresProperty` to the file's import from `./analytics`.

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/lib/analytics.test.ts`
Expected: FAIL, `featuresProperty` is not exported.

- [ ] **Step 3: Write the code**

`web/src/lib/analytics.ts`: add the import `import type { PostHog } from 'posthog-js';` and
`import { FEATURE_KEYS } from '../auth/access';`, then:

```ts
/** The features on during a visit, as page views carry them (decision D13): feature keys only, never roles or boxes. */
export function featuresProperty(on: readonly string[]): string[] {
  const known = new Set<string>(FEATURE_KEYS);
  return [...new Set(on.filter((f) => known.has(f)))].sort();
}

let client: PostHog | null = null;
let pending: string[] | null = null;

/** Every event from now on carries `features`. Before analytics has started, it's kept until it does. */
export function setVisitFeatures(on: readonly string[]): void {
  const features = featuresProperty(on);
  if (client) client.register({ features });
  else pending = features;
}
```

and in `startAnalytics`, after `posthog.init(...)`:

```ts
  client = posthog;
  if (pending) posthog.register({ features: pending });
```

`web/src/shell/AnalyticsFeatures.tsx`:

```tsx
// Tells analytics which features are on for this visit (D13). Only when the build has a PostHog key.
import { useEffect } from 'react';
import { FEATURE_KEYS, useAuth } from '../auth';

export function AnalyticsFeatures() {
  const { featureOn, status } = useAuth();
  const on = status === 'loading' ? null : FEATURE_KEYS.filter((f) => featureOn(f)).join(',');
  useEffect(() => {
    if (on === null || !import.meta.env.VITE_POSTHOG_KEY) return;
    void import('../lib/analytics').then(({ setVisitFeatures }) => setVisitFeatures(on ? on.split(',') : [])).catch(() => undefined);
  }, [on]);
  return null;
}
```

`web/src/shell/AppShell.tsx`: render `<AnalyticsFeatures />` next to `<Toaster />`. `main.tsx` doesn't change.

An admin's list holds every feature, as `featureOn` says for them; that's the visit they had.

- [ ] **Step 4: Run it to see it pass**

Run: `cd web && npx vitest run src/lib/analytics.test.ts`
Expected: PASS, the existing cases and the two new ones.

- [ ] **Step 5: Check everything**

Run (background): `scripts/check.sh web` and `scripts/check.sh api`. Expected: both pass. The build still keeps
`posthog-js` in its own chunk: `ls dist/assets | grep -i posthog` after `npx vite build --outDir /tmp/dsba-dist`
(any temp folder) shows one file, and the entry chunk doesn't import it statically.

- [ ] **Step 6: Commit**

```bash
git add -A web/src
git commit -m "Web: page views carry the features that were on (D13), still anonymous"
```

### Task 7: The e2e suite on boxes, roles and switches

**Files:**
- Modify: `web/e2e/admin.spec.ts` (rewritten), `web/e2e/support.ts`, `web/e2e/auth.setup.ts`,
  `web/e2e/cleanup.teardown.ts`
- Create: `web/e2e/access.spec.ts`
- Modify (only where they read `role`, `/moderation` or `/admin/people`): any spec that `grep` finds

**Interfaces:**
- **Consumes:** the Access screen (Task 4–5), Manage (Task 3), switches (Task 2); the API plan's `set-role`/
  `dev-login --role` slugs; `PUT /api/v1/admin/features/{feature}`, `PUT /api/v1/admin/users/{id}/roles`,
  `GET /api/v1/admin/roles`.
- **Produces:** `setSwitch(page, feature, mode, roleIds?)` and `roleIdBySlug(page, slug)` in `support.ts`.

- [ ] **Step 1: Find what reads the old shapes**

Run: `cd web && grep -rnE "role|moderation|admin/people" e2e/*.ts | grep -v "getByRole\|role=\|'role'\|\"role\"" ; grep -rn "\.role\b\|role: '\|/moderation\|/admin/people" e2e`
Fix each hit: `.role` reads become `.roles` checks (`roles.some((r) => r.slug === 'rep')`), `/moderation` becomes
`/manage`, `/admin/people` becomes `/admin/access?tab=people`. (The API plan already changed `devLogin`'s `role`
option to `'rep' | 'admin'` and `auth.setup.ts`.)

- [ ] **Step 2: Helpers in `web/e2e/support.ts`**

```ts
/** The id of a role, by its slug (admins only). */
export async function roleIdBySlug(admin: Page, slug: string): Promise<string> {
  const r = await api<{ roles: { id: string; slug: string }[] }>(admin, 'GET', '/api/v1/admin/roles');
  const role = r.body.roles.find((x) => x.slug === slug);
  if (!role) throw new Error(`No role ${slug}`);
  return role.id;
}

/** Sets a feature's switch (admins only). Every spec that switches something off puts it back in afterAll. */
export async function setSwitch(admin: Page, feature: string, mode: 'off' | 'roles' | 'everyone', roleIds: string[] = []): Promise<void> {
  const r = await api(admin, 'PUT', `/api/v1/admin/features/${feature}`, { mode, roleIds });
  expect(r.status, `switch ${feature} ${mode}`).toBe(200);
}
```

`web/e2e/cleanup.teardown.ts`: before deleting the run's accounts, put every switch back to `everyone` (an
interrupted run must not leave a feature off):

```ts
  for (const feature of ['forum', 'library', 'library.uploads', 'newsletter', 'calendar', 'career', 'grades', 'noora']) {
    await api(adminPage, 'PUT', `/api/v1/admin/features/${feature}`, { mode: 'everyone', roleIds: [] });
  }
```

(use the admin page variable the teardown already has; if it has none, open one with `personaContext(browser, 'admin')`.)

- [ ] **Step 3: Rewrite `web/e2e/admin.spec.ts`**

```ts
// The admin's Access screen: give Ali the Newsletter manager role and take it back; suspend him (he reads but can't
// post) and lift it; see it all under Activity.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, personaContext, readRun, remember, roleIdBySlug } from './support';

test.describe.configure({ mode: 'serial' });

async function findAli(admin: Page, email: string) {
  await admin.goto('/admin/access?tab=people');
  await admin.getByLabel('Search people').fill(email);
  const row = admin.locator('tr').filter({ hasText: email }).first();
  await expect(row).toBeVisible();
  return row;
}

// Whatever happens, Ali ends as a plain, active student.
test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  const found = await api<{ items: { id: string; status: string }[] }>(page, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(readRun().ali.email)}`);
  const ali = found.body.items[0];
  if (ali) {
    await api(page, 'PUT', `/api/v1/admin/users/${ali.id}/roles`, { roleIds: [await roleIdBySlug(page, 'student')] });
    if (ali.status !== 'active') await api(page, 'PATCH', `/api/v1/admin/users/${ali.id}`, { status: 'active' });
  }
  await ctx.close();
});

test('the admin makes Ali a newsletter manager and back; he is told', async ({ admin, ali, run }) => {
  let row = await findAli(admin, run.ali.email);
  await row.getByRole('button', { name: /^Change the roles of/ }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel(/^Newsletter manager/).check();
  await dialog.getByRole('button', { name: 'Save roles' }).click();
  await expect(admin.getByText(`${run.ali.name}’s roles are saved`)).toBeVisible();

  const me = await api<{ roles: { slug: string }[]; boxes: string[] }>(ali, 'GET', '/api/v1/me');
  expect(me.body.roles.map((r) => r.slug)).toContain('newsletter-manager');
  expect(me.body.boxes).toContain('newsletter.manage');
  await ali.goto('/manage');
  await expect(ali.getByRole('tab', { name: /Newsletter/ })).toBeVisible();
  await expect(ali.getByRole('tab', { name: /Reports/ })).toHaveCount(0);

  row = await findAli(admin, run.ali.email);
  await row.getByRole('button', { name: /^Change the roles of/ }).click();
  await admin.getByRole('dialog').getByLabel(/^Newsletter manager/).uncheck();
  await admin.getByRole('dialog').getByRole('button', { name: 'Save roles' }).click();
  await ali.goto('/manage');
  await expect(ali.locator('main')).toContainText('This page isn’t on your account');
  const notes = await api<{ items: { title: string }[] }>(ali, 'GET', '/api/v1/notifications');
  expect(notes.body.items.length).toBeGreaterThan(0);
});
```

Then keep the existing suspension test unchanged except for `findAli` (now on the People tab) and the button names
("Suspend …", "Lift the suspension of …", which `PeopleList` keeps), and rewrite the last test:

```ts
test('the activity log records the role and status changes', async ({ admin, run }) => {
  await admin.goto('/admin/access?tab=activity');
  const log = admin.locator('main');
  await expect(log).toContainText(run.ali.name);
  await expect(log).toContainText(/roles/);
  await expect(log).toContainText(/suspen/i);
});
```

(`remember` stays imported for the suspension test's thread.)

- [ ] **Step 4: Write `web/e2e/access.spec.ts`**

```ts
// Boxes and switches, end to end: a newsletter manager publishes but can't moderate; a switched-off calendar is gone
// for a student and a guest, and marked for an admin; a guest sees only what's on for everyone.
import { expect, test } from './fixtures';
import { api, remember, roleIdBySlug, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ browser }) => {
  const { personaContext } = await import('./support');
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'calendar', 'everyone');
  await ctx.close();
});

test('a newsletter manager can publish but not moderate', async ({ admin, sara, run }) => {
  const me = await api<{ id: string }>(sara, 'GET', '/api/v1/me');
  const ids = [await roleIdBySlug(admin, 'student'), await roleIdBySlug(admin, 'newsletter-manager')];
  expect((await api(admin, 'PUT', `/api/v1/admin/users/${me.body.id}/roles`, { roleIds: ids })).status).toBe(200);
  try {
    const issue = await api<{ id: string }>(sara, 'POST', '/api/v1/newsletter/issues', {
      slug: `e2e-nm-${run.tag}`,
      number: 98,
      title: `Newsletter manager test [e2e ${run.tag}]`,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date()),
      dek: 'A draft from a newsletter manager.',
      summary: 'A test.',
      editors: ['Sara E2E'],
      cover: { tone: 'paper', lines: [] },
      sections: [],
    });
    expect(issue.status).toBe(201);
    remember('issues', issue.body.id);
    const moderate = await api<{ error: { code: string } }>(sara, 'POST', '/api/v1/forum/threads/00000000-0000-4000-8000-000000000000/moderate', { action: 'hide', reason: 'test' });
    expect(moderate.status).toBe(403);
    await sara.goto('/manage');
    await expect(sara.getByRole('tab', { name: /Newsletter/ })).toBeVisible();
    await expect(sara.getByRole('tab', { name: /Reports/ })).toHaveCount(0);
  } finally {
    await api(admin, 'PUT', `/api/v1/admin/users/${me.body.id}/roles`, { roleIds: [ids[0]] });
  }
});

test('with the calendar off, a student and a guest lose it; an admin sees it marked', async ({ admin, sara, guest }) => {
  await setSwitch(admin, 'calendar', 'off');
  for (const page of [sara, guest]) {
    await page.goto('/calendar');
    await expect(page.locator('main')).toContainText('This part of the hub is switched off right now.');
    await expect(page.locator('[data-hub="nav-calendar"]')).toHaveCount(0);
    expect((await api(page, 'GET', '/api/v1/calendar/events')).status).toBe(404);
  }
  await admin.goto('/calendar');
  await expect(admin.getByText('Off for others')).toBeVisible();
  await setSwitch(admin, 'calendar', 'everyone');
});

test('a guest sees only the features on for everyone', async ({ admin, guest }) => {
  await setSwitch(admin, 'grades', 'roles', [await roleIdBySlug(admin, 'rep')]);
  try {
    const features = await api<{ features: string[] }>(guest, 'GET', '/api/v1/features');
    expect(features.body.features).not.toContain('grades');
    await guest.goto('/');
    await expect(guest.locator('[data-hub="nav-grades"]')).toHaveCount(0);
  } finally {
    await setSwitch(admin, 'grades', 'everyone');
  }
});
```

(Check the moderate endpoint's body shape against `api/app/schemas/forum.py` and the calendar list path against the
calendar router; a wrong body answers 422 before the box check only if the route validates the body first, and
the API plan's matrix test says boxes come first: if it answers 422, send a valid body.)

- [ ] **Step 5: Run the suite**

Run (background): `scripts/e2e.sh`, then `scripts/e2e.sh --restore`.
Expected: every test passes, the new ones included. The stack must run this branch's API: rebuild it from the
worktree first (`docker compose -p dsba-hub up -d --build api mail` from `../dsba-access`), as the API plan's database
rebuild step says, and ask Mohamed before you do, since the stack is shared.

- [ ] **Step 6: The responsive sweep**

The new and changed screens (Manage, Access's four tabs, the switched-off notice, the profile menu) at all 16 sizes,
as an admin, a rep, a newsletter manager and a student, with touch emulated on phones and tablets. Nothing scrolls
sideways; touch targets at least 44 px; prose under about 75 characters. Look at the screenshots.

- [ ] **Step 7: Check everything and commit**

Run (background): `scripts/check.sh`. Expected: `All checks passed.`

```bash
git add -A web/e2e
git commit -m "e2e: roles on the Access screen, a newsletter manager, a switched-off calendar and the guest's features"
```

## Self-review

- **Spec coverage (Web, PostHog, Testing):**
  - `can`, `featureOn`, `roles`, `Gate`, guests' `/features`: Task 1 (and `offForOthers`, `isAdmin`, `manages`).
  - Removals (`isModerator`, `RoleGate`, `roles.ts`, `/moderation`, `/admin/people`): Tasks 1, 3, 5. No redirects.
  - Visibility in menus, Home, the palette, search, links; the switched-off notice; "Off for others": Task 2.
  - Manage with what's waiting: Task 3 (counts on Reports and Uploads; drafts listed).
  - Access: Roles grid by area, New role, edit with `version`, delete with holders, one role per card on phones:
    Task 4. People with role checkboxes, suspend/restore, no contacts without Admin: Task 5. Features: Task 5.
  - Labels (badge, else cohort): Task 1.
  - PostHog `features` property: Task 6.
  - e2e: admin.spec rewrite, `--role rep` (with the API plan), the three new specs: Task 7.
  - 16 sizes and 44 px: Tasks 2–5 by hand, Task 7's sweep.
- **Placeholders:** the only temporary code is `features/access/public.ts`'s two empty components in Task 3, replaced
  in Task 5 within the same branch; each task still ends green. "Check the token names" notes point at a real file
  to copy from, with the CSS given.
- **Names across tasks:** `Box`, `Feature`, `FEATURE_KEYS`, `MANAGER_BOXES`, `canDo`, `featureIsOn`, `offForOthers`,
  `isActiveAdmin`, `holdsAdmin`, `badgeOf` (Task 1); `ACCESS_ROLES_KEY`, `ACCESS_FEATURES_KEY`, `ADMIN_USERS_KEY`,
  `AUDIT_KEY` (Tasks 4–5); `PeopleList`, `ActivityLog` (Tasks 3, 5); `setSwitch`, `roleIdBySlug` (Task 7).
- **Review Focus:** 1 suspended rep: Task 1 unit test, Task 3 by hand, Task 7's admin spec (suspension test). 2 stale
  save: Task 4's `roleChanges`/`STALE` and by hand. 3 switched off while open: Task 2 (`QueryError`, `RouteFrame`) and
  Task 7. 4 unknown keys: Task 1 tests. 5 own Admin and last admin: Task 5 (no Change on own row; `last_admin` shown).
