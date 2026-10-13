# Access: roles and feature switches (R-1 and R-10)

Designed with Mohamed on 2026-10-13. The roadmap entries are in `docs/ROADMAP.md`.

## Goal

Access works by feature. Admins decide on a screen:
- which roles exist;
- what each role may do;
- who holds which role;
- which features are switched on, and for whom.

The API enforces every one of these decisions, and the app shows each person only what they may use.

## Decided with Mohamed

- **Boxes.** There is a fixed list of boxes, one per power, such as "publish the newsletter".
- **Roles.** A role is a named set of boxes. Admins edit roles on a screen and create new ones.
- **Several roles.** One person may hold several roles, and gets every box any of them ticks.
- **Who has what.**
  - Admin always has every box.
  - Guests read.
  - A suspended account reads.
- **Switches.** Feature switches live in the hub, and admins flip them in the admin UI, not in environment variables
  or code.
- **PostHog** stays anonymous analytics.
- **No compatibility.** The app isn't released (Mohamed, 2026-10-13).
  - Schemas, API shapes, URLs and role names change directly, with no legacy fields, aliases, redirects or data
    migrations.
  - The migrations are squashed into one baseline, and local databases are rebuilt.

## Words

- **Box:** one power, such as "publish the newsletter". The code checks boxes, never role names.
- **Role:** a named set of boxes.
- **Switch:** whether a feature exists for someone. Its setting is off, on for some roles, or on for everyone.
- **Admin-only power:** one of the few powers that stay with the Admin role and can't be ticked on another role.

## The boxes

Each box takes over the checks listed next to it. Stars, lesson progress, notifications and a person's own account need no
box: every active signed-in account has them.

| Box | Allows | The checks it takes over | Ready-made roles with it |
| --- | --- | --- | --- |
| `forum.post` | start threads, reply, vote, accept an answer; edit and delete your own posts | `ActiveUser` on forum writes | Student |
| `library.upload` | upload files for review | `ActiveUser` on library uploads | Student |
| `newsletter.react` | react to issues | `ActiveUser` on reactions | Student |
| `reports.create` | report a post or a file | `ActiveUser` on reports | Student |
| `forum.moderate` | hide, lock and remove threads and replies; see hidden posts; reply in locked threads; edit others' posts; handle forum reports | `Moderator` on 2 endpoints; `is_moderator()` in `services/forum/` | Rep |
| `library.manage` | review uploads; add links; edit and remove items; see pending items and uploads; handle library reports | `Moderator` on 2 endpoints; `is_moderator()` in `services/library.py` and `services/uploads.py` | Rep |
| `newsletter.manage` | write, edit, publish and delete issues; see drafts | `Moderator` on 4 endpoints; `is_moderator()` in `services/newsletter.py` and `routers/newsletter.py` | Rep, Newsletter manager |
| `calendar.manage` | add, edit and delete events | `Moderator` on 3 endpoints | Rep, Content manager |
| `career.edit` | edit Career Navigator | `Admin` on `PUT /career` | Content manager |
| `stats.view` | see the hub's numbers | `Moderator` on `GET /admin/stats` | Rep |
| `people.suspend` | see the people list (names, years, roles, no contact details); suspend and restore accounts | `Admin` on `GET /admin/users` and the `status` of `PATCH /admin/users/{id}` | none (Admin only by default) |
| `audit.read` | read the audit log | `Admin` on `GET /admin/audit` | none (Admin only by default) |

Later features add their own boxes when they're built, for example `requests.handle` with R-2.

**Admin-only powers.** These aren't boxes, so no other role can be given them:
- edit, create and delete roles;
- give and take away roles;
- flip switches;
- change an account's email or phone (account recovery, SEC-9);
- see who reported something (the check in `services/reports.py`);
- suspend an admin.

## Ready-made roles

| Role | Boxes | Badge | Editable | Deletable |
| --- | --- | --- | --- | --- |
| Student | `forum.post`, `library.upload`, `newsletter.react`, `reports.create` | none | yes | no |
| Rep | `forum.moderate`, `library.manage`, `newsletter.manage`, `calendar.manage`, `stats.view` | Student rep | yes | no |
| Newsletter manager | `newsletter.manage` | Newsletter | yes | yes |
| Content manager | `calendar.manage`, `career.edit` | Content | yes | yes |
| Admin | every box, now and later, plus the admin-only powers | Admin | no | no |

- **New accounts** get Student. An admin may take it away. A signed-in person with no roles reads, like a guest.
- **Badges.** A role may show a badge next to its holders' names. A person with several badge roles shows the first
  in role order: Admin, then Rep, then the others in the order admins set. Without a badge, the line under a name
  shows the cohort.
- **Staff names** (finding 20). Names with staff words ("admin", "student rep" and so on) are allowed for people who
  hold a role with a badge.

## Rules

1. **What you may do.** You may do what every box from all your roles allows. Admin has every box. A suspended
   account has no boxes and reads like a guest (finding 4).
2. **Switches.**
   - Each feature has one switch: Off, Some roles or Everyone.
   - A feature is on for you when its switch is Everyone, or Some roles and you hold one of those roles.
   - Guests, and suspended accounts, get Everyone features only.
   - Admins see every feature, even when it's off, so they can try one before switching it on. The app marks it
     "Off for others".
3. **Both layers apply.** Publishing an issue needs the newsletter switch on for you and the `newsletter.manage`
   box.
4. **Admin-only powers stay with Admin.**
   - The Admin role can't be edited or deleted, and only an admin can give it.
   - The last active admin can't lose it or be suspended.
   - Someone with `people.suspend` can't suspend an admin or themselves.
   - Nobody changes their own roles or status. Another admin has to.
   - Deleting your own thread, reply or library item needs no box.
5. **Changes apply at once.** The API reads roles and switches from the database on every request. Nothing about
   them is kept in a session.
6. **Records.**
   - The audit log records:
     - every role created, changed or deleted, with its boxes before and after;
     - every role given or taken away;
     - every switch flipped.
   - A person gets a notification when their roles change.

## Switches

- **Features with a switch:**
  - `forum`, `library`, `newsletter`, `calendar`, `career`, `grades` and `noora`;
  - `library.uploads`: uploads only, while the library stays readable.
- **Features without a switch.** Modules and lessons, the home page, accounts and notifications are the hub itself.
- **The baseline migration** sets every feature's switch to Everyone.
- **A feature with no switch row** is off.
- **New features** (the board, notes, requests) arrive with their switch Off.

**When a feature is off for you:**
- The app hides its menu items, home cards and links. Its pages say "This part of the hub is switched off right
  now." with a link home.
- The API answers its endpoints with 404 and the code `feature_off`. Admins are the exception.
- Search leaves out its results.
- A notification that points into it opens the "switched off" page.

## API

### Data
- **Tables:**
  - `roles`: id, slug, name, badge, position, built_in, locked, created_at, updated_at;
  - `role_boxes`: role_id, box;
  - `user_roles`: user_id, role_id, given_by, given_at;
  - `feature_switches`: feature, mode, updated_by, updated_at;
  - `feature_switch_roles`: feature, role_id.
- **Keys.** Box and feature keys are strings checked against the fixed lists in `app/core/access.py`. A stored key
  the code no longer knows is ignored.
- **Migrations.** Every migration is squashed into one baseline, `0001_initial`, built from the models with these
  tables in it, and the local database is rebuilt. `users.role` and the `Role` enum no longer exist.
- **Ready-made roles and switches** come from the baseline migration. Every database needs them: every check reads
  the roles' boxes, every new account gets Student, and a feature without a switch row is off. `seed` reruns at
  every start, so it would undo admins' changes.

### Checks
- **`app/core/access.py`** holds:
  - the `Box` and `Feature` enums;
  - `boxes_for(user)`, `can(user, box)` and `feature_on(user, feature)`;
  - the FastAPI dependencies `requires(box)` and `feature(feature)`.
- **What goes:**
  - the `Moderator` and `Admin` dependencies, on the 18 endpoints that use them;
  - `is_moderator()` and `is_admin()`, with their 25 inline calls.

  Each one becomes the box it stands for.
- **Loading a person's access.** Their roles and boxes load once per request.

### Shapes
- **`GET /me`** returns `roles` (id, name, badge), `boxes` and `features`.
- **`GET /features`** is public. It returns the features switched on for whoever calls: Everyone features for a guest,
  and a signed-in person's own list.
- **`UserPublic`** carries `badge`, a string or null.
- **Admin endpoints** are CSRF-checked, rate-limited and audited:
  - `GET` and `POST /admin/roles`;
  - `PATCH` and `DELETE /admin/roles/{id}`;
  - `PUT /admin/users/{id}/roles`;
  - `GET /admin/features` and `PUT /admin/features/{feature}`.
- **`PATCH /admin/users/{id}`** takes `status`, which needs `people.suspend`, and the account-recovery fields,
  which are admin-only.
- **Errors:**

  | Code | When |
  | --- | --- |
  | `forbidden` | a box is missing. The message names the power, for example "Only people who manage the newsletter can do this." |
  | `feature_off` | 404, the feature is switched off |
  | `last_admin` | 409 |
  | `role_locked` | 409, the Admin role, or deleting a built-in role |
  | `role_changed` | 409, the role changed since the admin loaded it (it carries a `version`) |

### The CLI
- `set-role` and `dev-login --role` take a role slug: student, rep, newsletter-manager, content-manager or admin. The
  e2e suite signs reps in with `--role rep`.
- `DSBA_ADMIN_IDENTIFIERS` gives the Admin role at sign-in.

## Web

- **`useAuth()`** offers `can(box)`, `featureOn(feature)` and `roles`. `Gate` takes a `box`, a `feature`, or both.
  `isModerator`, `isAdmin` and `RoleGate` go.
- **Guests** load `/features` once. Signed-in people get theirs from `/me`.
- **Visibility.** Menus, the home page, the command palette, search results and links show only what's on for the
  person and what they may do.
- **Manage** (`/manage`) is for anyone with a manager box.
  - It has one section per tool they hold, each with what's waiting:
    - reports and uploads to review;
    - newsletter drafts;
    - the calendar and Career Navigator;
    - the hub's numbers.
  - `/moderation` goes.
- **Access** (`/admin/access`) is for admins only, and has three tabs:
  - **Roles:** a grid of roles against boxes, grouped by area, with a "New role" button.
    - Deleting a custom role asks first, and says how many people hold it.
    - On phones the grid shows one role at a time, so nothing scrolls sideways.
  - **People:** search, then for each person their roles as checkboxes, and suspend or restore. `/admin/people`
    goes.
  - **Features:** for each feature, Off, Some roles (choose them) or Everyone, with a line on what switching it off
    hides.
- **Labels.** The line under a name shows the badge, else the cohort.
- **Sizes.** Every new screen works at the 17 sizes in CLAUDE.md.

## PostHog

- What it records stays the same, and it stays anonymous (SEC-8).
- Page views carry one more property, `features`: the sorted list of features switched on for the visit. It holds
  feature keys only, never roles or boxes.
- PostHog's own feature flags stay off.

## Decisions to record

Add these at the end of `docs/backend/ARCHITECTURE.md`:
- **D11.** Access is by boxes, and roles are data. A few powers stay admin-only.
- **D12.** Feature switches live in the hub and are flipped in the admin UI. The API enforces them, and admins see
  every feature.
- **D13.** PostHog stays anonymous analytics. Switches reach it only as a page-view property.

## Later, not now

- **Roles for one year,** such as a Year 2 rep. The tables leave room: a role could gain a year.
- **Switches by year or by percentage.**
- **Boxes for later features,** such as `requests.handle`, added with R-2 onwards.
- **R-9,** editing modules and lessons in the app.

## Testing

- **API:**
  - Every protected endpoint four ways:
    - with its box: allowed;
    - without it: 403;
    - suspended: 403;
    - feature off: 404, except for admins.
  - Each inline check, with and without its box: hidden posts, pending items, drafts and locked threads.
  - **Admin-only powers.** A non-admin holding every box still can't edit roles, give roles or flip switches.
  - **No route lets a non-admin gain a box,** directly or through another person.
  - **Admins are protected:**
    - the last admin can't be removed or suspended;
    - the Admin role can't be edited or deleted;
    - `people.suspend` can't suspend an admin.
  - **The baseline.** It builds the models' schema (the drift check), and the seed creates the ready-made roles and
    switches.
  - **Shapes, audit and notifications.** `/me`, `/features`, `UserPublic.badge`, the audit entries and the
    notifications.
- **Web:**
  - Vitest: `can`, `featureOn`, `Gate`, and the pure logic of the Access screens.
  - **End to end:**
    - a newsletter manager publishes an issue but can't moderate the forum;
    - with the calendar switched off, a student doesn't see it and an admin does;
    - a guest sees Everyone features only.

## Order of work

1. The API model, the migration and the checks, with no visible change.
2. The admin API.
3. The web gates.
4. The Manage and Access screens.
5. The PostHog property.

API and web change together on one branch, `round4/access`, merged once both are done. The e2e suite moves to the new
role names and screens on the same branch.
