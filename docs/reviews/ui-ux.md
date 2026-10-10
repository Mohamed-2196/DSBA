# UI/UX review: DSBA Hub on the real API (round 1)

Reviewer: UI/UX. Build: `feature/backend` at `525962c` (working tree as of 10 Oct, 20:05), against the shared dev API
and the lead's web server on `:5173`. No application code was changed.

Method: Playwright (Chromium 1.56) at 1440×900, 768×1024 and 390×844, light and dark, as a guest, a new student
(signed up by email and by phone with real codes from the mail and SMS sinks), a returning student, a student rep
and an admin. Slow, failing (500, 401, 429, offline) and empty answers were simulated with route interception, never
on the shared API. Contrast was computed from the tokens and with an in-page scan of the new screens; keyboard paths
were walked with Tab, arrows and Esc. Screenshots are in
`/tmp/claude-0/-home-claude-dsba/331caa53-7cba-5bfe-8500-672e2c76573d/scratchpad/uiux/shots/` (named `shots/…` below;
the contact sheets `sheet-*.png` are one folder up). My test accounts are named `ux-…` (ux-student, ux-rep,
ux-admin by dev-login; ux-new-a, ux-new-b, ux-kb and ux-hamad, the last with +973 3600 1102, through real codes).
I published the "Launch edition" draft and left one ST2195 thread with two replies, two uploads (one published, one
rejected with a note) and a report. ux-Hamad's deliberately spammy reply in that thread is still visible (its report
was resolved without hiding it): hide it before any demo.

## Summary

The new account, upload, moderation and people screens look like they were always part of DSBA Hub: they reuse the
tokens, panels, dialogs, badges and empty states, read well in both themes, and nothing overflows at 390 px.
Sign-in is the strongest part: one field for an email or a Bahraini number, a code step that handles paste, wrong,
expired and resent codes with clear messages, a short profile step, and the action the student tried (star, vote,
reply, upload, report, react) carries on once they are signed in. Reading stays open to guests everywhere.
The weak spots are at the edges of a session and in the rep tools: a session that ends while a tab is open leaves
the student looking signed in but unable to do anything; the notifications popover can't be used with a keyboard;
the newsletter editor is raw JSON and throws away unsaved edits when the rep presses its own "Open the issue"; the
"Contribute" button on every page still sends students to GitHub instead of the new upload; and Your account offers
email settings for emails that are never sent. No blockers, 6 majors, 10 minors and a group of nits.

| ID | Severity | Owner | Title |
|---|---|---|---|
| UX-1 | major | frontend-accounts (+ lead: `src/api/queryClient.ts`) | A session that ends in an open tab is a dead end: "Sign in to do this." with no way to sign in |
| UX-2 | major | frontend-accounts (`ui/Menu.tsx`) + frontend-community | Notifications can't be used by keyboard; Tab in any menu throws focus to the top of the page |
| UX-3 | major | frontend-content | Newsletter editor loses unsaved edits on any in-app link, including "Open the issue" next to Save |
| UX-4 | major | frontend-content (+ content for the format) | Newsletter editor asks student reps to write JSON, which no other screen does and phones can't handle |
| UX-5 | major | frontend-accounts (shell) + frontend-content (search) | "Contribute" on every page still goes to GitHub; search for "upload" finds nothing |
| UX-6 | major | accounts + frontend-accounts + content | Email settings promise emails that are never sent; the newsletter switch silences in-app notifications |
| UX-7 | minor | frontend-content (onboarding) | First visit to any shared link is blocked by the year picker, with no "not a student" or "sign in" way out |
| UX-8 | minor | frontend-accounts (`ui/Toaster`) | On phones, toasts sit on top of dialogs and cover the field you must fill (delete account, upload) |
| UX-9 | minor | frontend-accounts | After signing in from the Sign in button, keyboard focus is dropped on the page body |
| UX-10 | minor | frontend-library, frontend-content, frontend-community | Error states blame the connection when the server failed, with two title patterns |
| UX-11 | minor | frontend-accounts (`ui`) | 32 px controls throughout the new phone flows |
| UX-12 | minor | frontend-library | Upload dialog polish: misaligned Type field, "Drag a file here" on phones, "0% (1 KB of 1 KB)", suspended users find out last |
| UX-13 | minor | frontend-content (calendar) | Rep-entered unconfirmed events are called "sample dates" that "follow last year's pattern" |
| UX-14 | minor | frontend-accounts | Your account on phones: squeezed "Where you're signed in" header; "Not added" below AA |
| UX-15 | minor | frontend-accounts (+ content, community for audit data) | People: the role menu fires a confirmation on the first arrow key; some Activity lines don't say what |
| UX-16 | minor | frontend-accounts | Sign-in polish: server errors mark the address as wrong, masked address hides typos, two names for "resend" |
| UX-17 | nit | several (listed) | Grouped nits: wording, zero counts, guest composer, phone moderation header, motion, Mini Noora |

---

## Findings

### UX-1 A session that ends in an open tab is a dead end (major)

- **Owner:** frontend-accounts (`src/auth/AuthProvider.tsx`), lead (`src/api/queryClient.ts`, if the handler goes there).
- **Where:** any page with a write, any viewport and theme, a signed-in student whose session has ended: they pressed
  "Sign out other devices" on another device, added or changed their email or phone ("To be safe, your other devices
  were signed out"), or the session expired. Reproduced by answering writes with the API's own
  `401 {"code":"unauthenticated","message":"Sign in to do this."}` on `/forum/st2133-2023-q3-…`.
- **What happens:** the sidebar still shows "ux-Sara M., Year 2", so there is no Sign in button anywhere. Posting a
  reply shows "Sign in to do this." in red under the composer; a vote shows the toast "Your vote wasn't saved / Sign in
  to do this."; an upload says "You were signed out. Sign in again, then retry." Nothing opens the sign-in dialog. `/me`
  is never re-read during a visit (`staleTime: 60_000`, `refetchOnWindowFocus: false`), so the page keeps believing
  the student is signed in until they reload. The obvious way out, account menu → Sign out → Sign in, runs
  `clearPersonalStorage()`, which deletes the thread draft they were writing.
- **Why it matters:** the account page actively encourages signing out other devices (lab computers), and changing a
  sign-in method signs out every other device, so students will hit this on their phone the same day. It looks like
  the Hub is broken, and the work they typed is at risk.
- **Screenshots:** `shots/ex01-reply-after-session-ended.png`, `shots/ex02-vote-after-session-ended.png`.
- **Fix:**
  - In `AuthProvider`, subscribe to both caches and treat any 401 while `me` is set as "session ended":
    ```ts
    useEffect(() => {
      const ended = (e: unknown) => {
        if (e instanceof ApiError && e.status === 401 && qc.getQueryData(ME_KEY)) {
          qc.setQueryData(ME_KEY, null);          // the UI shows a guest again: Sign in buttons come back
          void resetPersonalQueries(qc);          // but keep drafts: no clearPersonalStorage() here
          setRequest({ reason: 'You were signed out. Sign in again to carry on.' });
        }
      };
      const a = qc.getMutationCache().subscribe((ev) => ev.type === 'updated' && ev.action.type === 'error' && ended(ev.action.error));
      const b = qc.getQueryCache().subscribe((ev) => ev.type === 'updated' && ev.action.type === 'error' && ended(ev.action.error));
      return () => { a(); b(); };
    }, [qc]);
    ```
    Calls made outside TanStack Query (`sendFile` in the upload dialog) can call the same `ended()` through the
    context.
  - Where an action already uses `requireAuth(reason, retry)` (reply, thread, vote, star, react, report), call it again
    on a 401 so the action resumes after the new sign-in, as it does for guests.
  - Re-read `/me` when the tab becomes visible again: `refetchOnWindowFocus: true` on the `ME_KEY` query only.

### UX-2 Notifications can't be used by keyboard; Tab in any menu throws focus to the top of the page (major)

- **Owner:** frontend-accounts (`src/ui/Menu.tsx`, the design system), frontend-community (`NotificationsMenu.tsx`).
- **Where:** the bell, every page, desktop and tablet; signed in with several notifications.
- **What happens:** Enter on the bell opens the popover and focuses the first notification. Arrow keys do nothing
  (the popover is a `role="dialog"` panel, so `Menu` skips its arrow handling), and Tab closes the panel
  (`Menu.tsx:116-120`: `if (e.key === 'Tab') { setOpen(false); return; }`) without returning focus, so focus lands on
  "Skip to content" at the top of the document. A keyboard user can open only the first notification: the others,
  each "Mark as read" button and "Mark all as read" are out of reach. The same Tab code closes the account menu,
  the sort menus and the post menus and drops focus at the top of the page.
- **Why it matters:** notifications are a headline feature of this release, and the brief asks for keyboard paths
  through the main flows. (The prototype had the same `Menu` code, but its notifications were pretend.)
- **Walk:** focus the bell, Enter: focus on "New issue of The DSBA Newsletter: The pilot". ArrowDown ×8 and End: focus
  stays there. Tab: the panel closes and focus is on "Skip to content". Esc works (focus back on the bell).
- **Screenshot:** `shots/nt01-notifications-desk.png`.
- **Fix:** in `Menu.tsx` `onPanelKeyDown`:
  ```ts
  if (e.key === 'Tab') {
    if (isMenu) { e.preventDefault(); close(true); return; }        // menus: leave, focus back on the trigger
    const els = getFocusable(panelRef.current);                       // popovers: Tab moves inside the panel
    const atEnd = e.shiftKey ? document.activeElement === els[0] : document.activeElement === els[els.length - 1];
    if (atEnd) { e.preventDefault(); close(true); }                   // and leaves from either end, back to the trigger
    return;
  }
  ```
  In `NotificationsMenu`, also let ArrowUp/ArrowDown move between notification links (roving focus), so a long list
  isn't 2 Tab stops per item.

### UX-3 The newsletter editor loses unsaved edits on any in-app link (major)

- **Owner:** frontend-content (`src/features/newsletter/IssueEditorPage.tsx`).
- **Where:** `/newsletter/launch-edition/edit`, rep, desktop light.
- **What happens:** I changed the title (the header shows "Unsaved changes"), then pressed "Open the issue", the
  button right next to Save. The issue page opened with no warning; Back showed the old title. The page only guards
  reload and tab close (`beforeunload`, line 177); every in-app link (sidebar, "Open the issue", the newsletter
  breadcrumb, a notification) discards the edits silently.
- **Why it matters:** writing an issue takes a long time, the preview button invites exactly this click, and the
  editor has no draft copy to recover from.
- **Screenshot:** `shots/ed02-dirty-header.png`.
- **Fix:** keep a local copy while dirty (`hub.mine.newsletter.<slug>`, which `clearPersonalStorage` already removes
  on sign-out) and offer "You have unsaved changes from earlier: Restore / Discard" when the editor opens. While
  dirty, turn "Open the issue" into "Save and open" (or open it in a new tab), and catch in-app navigation with a
  capture-phase click listener on `a[href]` that asks "Leave without saving? Your changes to issue 01 will be lost."
  (`useBlocker` needs a data router; the app uses `BrowserRouter`).

### UX-4 The newsletter editor asks student reps to write JSON (major)

- **Owner:** frontend-content (`IssueEditorPage.tsx`); content (the sections format, which CQ-4 in
  `code-quality.md` also flags as unschema'd).
- **Where:** `/newsletter/<slug>/edit`, rep, all viewports.
- **What happens:** title, date, address, standfirst, summary and editors are proper fields, but the issue itself, its
  cover and every section (`"blocks": [{ "type": "p", "text": … }]`, icon names like `"ChartLineUp"`, image paths like
  `"demo/news/cfa-research-challenge.jpg"`) are typed into two monospace textareas. One stray character empties the
  preview ("The preview is waiting for valid JSON") with a message that sometimes has no line number. On a phone the
  JSON box is 390 px wide with long lines cut off.
- **Why it matters:** this is the one new screen that doesn't look like the rest of the Hub, and the reps who run the
  newsletter are students, not developers. The likely outcome is that only one person can publish, or issues break.
- **Screenshots:** `shots/n04-editor-desk.png`, `shots/ed01-json-error.png`, `shots/n06-editor-phone-json.png`.
- **Fix:** a section list editor built from the existing fields: each section is a panel with Label, Title, an icon
  picker (the 10 or so icons in `sectionIcons.ts`) and a list of blocks; each block is a typed form (Paragraph:
  TextArea with the same markdown subset as `RichText`; Image: upload plus alt text; Quote; Link list), with Add,
  Move up/down and Delete. Keep "Edit as JSON" as an advanced toggle for what the form can't do yet. The live preview
  already works and should stay. If that is too much for this release, at least ship one section template per
  section type ("Add a news story", "Add deadlines"), and make phones read-only with "Edit on a computer".

### UX-5 "Contribute" on every page still goes to GitHub; search for "upload" finds nothing (major)

- **Owner:** frontend-accounts (`shell/TopBar.tsx:48`, `shell/MobileNav.tsx:13`, `shell/SiteFooter.tsx:20`),
  frontend-content (`features/search/search.ts:134`).
- **Where:** the top bar on desktop and tablet ("Contribute", GitHub icon), the footer and the phone's More drawer
  ("Contribute a resource"), and ⌘K: "share notes" offers only "Contribute a resource" (GitHub, opens
  `github.com/…/issues/new`), and "upload" gives "No results".
- **Why it matters:** students can now share files in the Hub with review by a rep, which the About page explains
  well. But the most visible "share something" button on every page sends them to GitHub, where they need an account
  and a repository issue form. The new upload flow is only reachable from the library.
- **Screenshots:** `shots/k10-palette-upload.png`, `shots/k11-palette-share-notes.png`, the top bar in
  `shots/l01-library-guest-desk.png`.
- **Fix:** relabel the top-bar button "Upload a file" (UploadSimple icon) and open the upload dialog (for example by
  navigating to `/library?upload=1`, which `LibraryPage` opens through `requireAuth`). Do the same in the More drawer
  and the footer. Add a palette action "Upload a file" with keywords `upload`, `share notes`, `share a file`,
  `past paper`, `contribute`, and take "share notes" off the GitHub action. Keep GitHub as "Suggest a change to the
  Hub" on the About page and in the footer.

### UX-6 Email settings promise emails that are never sent (major)

- **Owner:** accounts (whether and when notification emails are sent), frontend-accounts (`AccountPage.tsx:221-244`,
  `SignInDialog.tsx:241`), content (`services/newsletter.py:233-246`, `components/IssueActions.tsx`).
- **Where:** Your account → Emails; the sign-in dialog's fine print; the publish confirmation.
- **What happens:**
  - Your account says "Notifications always show in the Hub. Choose what we also email you." with two switches,
    "Replies and reviews" and "New newsletter issues", both on for every new account. A phone-only student is told
    "These go to your email address. Add one above to get them." But nothing in the API sends a notification email
    (only sign-in codes and account notices go out; `notify()` only writes a row).
  - "New newsletter issues" is really the in-app switch: `publish()` skips everyone with `newsletter_emails: false`, so
    turning off the "email" also removes the notification in the Hub, which the same section says "always shows".
  - The sign-in fine print says "We only use it to sign you in and, if you want, to tell you about replies", while the
    settings are on by default.
- **Why it matters:** students will rely on an email that never comes ("I'll get an email when someone answers"), and a
  student who turns off newsletter emails silently stops seeing new issues. It is also what a student consents to when
  they sign up.
- **Screenshots:** `shots/a12-account-emails-phone-light.png`, `shots/s01-signin-open-desk.png`,
  `shots/n07-publish-confirm.png`.
- **Fix:** decide whether notification emails ship in this release.
  - If not: rename the section "Notifications", keep one honest switch "Tell me when a new issue of The DSBA
    Newsletter is out (in the Hub)", drop the email wording and the "add an email to get them" note, and change the fine
    print to "We only use it to sign you in."
  - If yes: send them (one message per person, as in finding 17 of `security-design.md`), split the newsletter
    preference into in-app and email, make email opt-in (ask on the profile step: "Email me when someone replies"),
    and keep the fine print matching the default.

### UX-7 First visit to a shared link is blocked by the year picker (minor)

- **Owner:** frontend-content (`src/features/onboarding/Onboarding.tsx`).
- **Where:** any URL on a browser that has never chosen a year; checked with a forum thread link at 390 px and the
  forum at 768 px dark.
- **What happens:** "Welcome to DSBA Hub" covers the page and can't be closed (Esc and the scrim do nothing until a
  year is chosen, lines 257-260). There is no "Not a current student" (which the profile step offers), no "Sign in"
  for a returning student on a new computer, and the footer says "switch years any time from the sidebar", which
  phones don't have.
- **Why it matters:** with real content, most first visits will come from a link shared in a WhatsApp group. The link
  opens to a wall instead of the thread. Staff, alumni and applicants have to pretend to be in a year. (The gate is
  from the prototype, but it costs more now.)
- **Screenshots:** `shots/ob01-shared-link-fresh-phone.png`, `shots/s20-forum-fresh-guest-tab-dark.png`.
- **Fix:** show the picker as a blocking dialog only on Home; on any other page show it as a dismissible bottom sheet
  or banner over the content. Add "Not a current student" (no year: every year is shown) and "Already have an
  account? Sign in" (the cohort then comes from the account). Change the footer to "You can change your year any time
  from the year switcher" (top bar on phones).

### UX-8 On phones, toasts sit on top of dialogs and cover their fields (minor)

- **Owner:** frontend-accounts (`src/ui/Toaster.css`, tokens `--z-toast: 80` over `--z-overlay: 60`).
- **Where:** 390 px. Adding an email and then pressing Delete account: "Email address added" covers the "Type DELETE to
  confirm" field for 5 s. Signing in from "Upload a file": "Signed in as ux-Aisha K." covers the Type field of the
  upload form that just opened.
- **Why it matters:** dialogs are bottom sheets on phones, so the toast lands exactly on their fields and buttons.
- **Screenshots:** `shots/a10-delete-dialog-phone-dark.png`, `shots/l12-upload-after-signin-phone-toast.png`.
- **Fix:** while a dialog is open, move the toaster to the top on small screens:
  `body:has(.ui-modal, .ui-drawer) .ui-toaster { top: calc(env(safe-area-inset-top) + var(--sp-8)); bottom: auto; }`
  in the `max-width: 699px` block. And skip the "Signed in as …" toast when sign-in resumes an action that opens a
  dialog: the dialog is the confirmation.

### UX-9 After signing in from the Sign in button, focus is dropped on the page body (minor)

- **Owner:** frontend-accounts (`src/ui/internal.ts` `useOverlay`, line 159; `src/auth/SignInDialog.tsx`).
- **Where:** sidebar or top-bar "Sign in", then the whole flow by keyboard.
- **What happens:** focus returns to the opener only if it still exists; the Sign in button has been replaced by the
  account button, so focus goes to `<body>` and a screen reader user starts again from the top. (When the opener
  survives, as with Upvote, focus returns to it correctly.)
- **Evidence:** no screenshot (focus position); the scripted walk logged `document.activeElement === <body>` after
  "Save and continue".
- **Fix:** give `useOverlay` a fallback: when the opener is gone, focus `[data-hub="profile"]` (the account button
  that replaced Sign in) or else `#main`.

### UX-10 Error states blame the connection when the server failed (minor)

- **Owner:** frontend-library (`LibraryPage.tsx:263`, `FileViewerPage.tsx:82`, `ModuleFiles.tsx:103`,
  `UploadsQueue.tsx:114`, `modules/ModulePage.tsx:244`), frontend-content (`NewsletterPage.tsx:280`, `IssuePage.tsx:307`,
  `LatestIssueCard.tsx:36`, `calendar/UpcomingEvents.tsx:59`, `home/NewInLibrary.tsx:52`, `career/CareerPage.tsx:68`),
  frontend-community (`NotificationsMenu.tsx:137`).
- **Where:** every data page with the API answering 500 (desktop, light and dark).
- **What happens:** every page has a proper error state with "Try again", which is good. But most say "Check your
  connection, then try again." for a server error, while the forum, thread, calendar page and moderation say
  "Something went wrong on our side." Titles alternate between "Couldn't load the forum" and "The library didn't
  load".
- **Why it matters:** students on campus Wi-Fi will waste time on their connection when the Hub is down.
- **Screenshots:** `sheet-err-1.png`, `sheet-err-2.png` (and `shots/e-err-*.png`).
- **Fix:** one helper, for example `loadProblem(error)` in `src/api/errors.ts` (lead) or `src/ui`, returning "Check your
  connection and try again." only for `code === 'network'` and "Something went wrong on our side. Try again in a
  minute." otherwise; and one title pattern ("The library didn't load").

### UX-11 32 px controls throughout the new phone flows (minor)

- **Owner:** frontend-accounts (`src/ui/Button.css`, `src/ui/IconButton.css`).
- **Where:** 390 px. Measured: dialog Close 32×32; "Resend code" 166×32 and "Use a different email or number" 235×32;
  account Change/Remove 77×32; notification "Mark as read" 32×32; moderation Preview/Download/Edit details/Reject/
  Publish 32 px tall; reactions 62×36; top-bar Sign in 70×32; "Your uploads" Delete 69×32.
- **Why it matters:** these pass WCAG 2.2 AA (24 px) but are under the 44 px that phones need, and several sit next to
  each other (Reject beside Publish, Change beside Remove).
- **Screenshots:** `shots/s13-code-step-phone.png`, `shots/m05-moderation-phone-light-uploads.png`.
- **Fix:** `@media (pointer: coarse) { .ui-button--sm { --btn-h: 40px; } .ui-iconbutton--sm { width: 40px; height: 40px; } }`,
  or at least for the controls listed.

### UX-12 Upload dialog polish (minor)

- **Owner:** frontend-library.
- **Where and what:**
  - When Module has an error, the Type select next to it stretches and drops below its label (the row is a grid with
    `align-items: stretch`). Fix: `.lib-form__row { align-items: start; }` (`UploadDialog.css:71`).
    `shots/l06-upload-dialog-errors.png`.
  - Phones read "Drag a file here … or Choose a file". Show the drag line only for `(pointer: fine)`.
    `shots/l12-upload-after-signin-phone-toast.png`.
  - The progress line reads "Uploading… 0% (1 KB of 1 KB)" at the start, because `formatSize` rounds 0 up to 1 KB
    (`kinds.ts:158`). Hide the "(x of y)" part until bytes have moved. `shots/l08a-upload-progress.png`.
  - A suspended student can open the dialog and fill it in; the refusal only comes after Send for review. The forum
    disables posting up front with a sentence; do the same here ("Your account is suspended, so you can't upload.").
    `shots/su04b-suspended-upload-phone.png`.

### UX-13 Rep-entered unconfirmed events are called "sample dates" (minor)

- **Owner:** frontend-content (calendar).
- **Where:** a rep adds an event with "Not confirmed yet" ticked ("Students see it marked as a sample date until you
  untick this", `EventFormDialog.tsx:196`); students then read in the event drawer "Sample date. It follows last year's
  pattern and is not confirmed" (`EventDrawer.tsx:176`), and the subscribe dialog speaks of "Sample dates"
  (`SubscribeDialog.tsx:99`).
- **Why it matters:** "sample" and "last year's pattern" described the prototype's generated dates. For a date a rep
  typed in, it is wrong, and "sample" sounds like fake data.
- **Also:** in the forum and Home "Coming up" widgets, "Not confirmed" wraps to two lines next to the type and the
  countdown (`shots/f12-thread-posted.png`, right column).
- **Fix:** "Not confirmed yet. Check with the programme office before you plan around it." / "Students see it marked
  as not confirmed until you untick this." / "Dates that aren't confirmed are marked in their notes." Keep "Not
  confirmed" on one line (`white-space: nowrap`) or put it under the title.

### UX-14 Your account on phones (minor)

- **Owner:** frontend-accounts (`AccountPage.tsx:302-313`, `AccountPage.css:46`, `ui/SectionHeader.css`).
- **Where and what:**
  - "Where you're signed in": the "Sign out other devices" action keeps its full width beside the header, so the
    title and description are squeezed into a 140 px column of six lines. Wrap the header below 700 px
    (`.ui-section-header { flex-wrap: wrap; }`, action on its own line), or put the button under the device list.
    `shots/a05c-devices-header-squeezed-phone.png`.
  - "Not added" uses `--ink-3`: 3.64:1 on white, under 4.5:1 for 14 px text. Use `--ink-2` (7.74:1).

### UX-15 People: role menu and Activity log (minor)

- **Owner:** frontend-accounts (`features/admin/PeoplePage.tsx`, `features/admin/audit.ts`); content and community for
  the audit data.
- **Where and what:**
  - The role is a native `<select>` whose `change` opens "Make … a student rep?". With the keyboard, the first
    ArrowDown already changes the value and opens the dialog, so an admin can't browse the options.
    `shots/p11-role-select-arrowdown.png`. Use a "Change role" button that opens a dialog with the three roles as
    radio cards (the same pattern as the cohort picker), and confirm there.
  - Activity says "published a newsletter issue", "edited a newsletter issue", "resolved a report" without saying
    which (also ST-9 in `student-test.md`). Put the title in the audit data for `newsletter.*` and the target title
    for `report.resolve`, and use it in `describeAudit`. `shots/p04-activity.png`.

### UX-16 Sign-in polish (minor)

- **Owner:** frontend-accounts (`src/auth/SignInDialog.tsx`, `src/auth/CodeEntry.tsx`).
- **Where and what:**
  - A 500, a lost connection or the rate limit is shown as a field error: the email turns red and `aria-invalid`,
    though the address is fine (`SignInDialog.tsx:138`). Keep field errors for `invalid_identifier` and
    `sms_unavailable`; show the others as the form alert the profile step already uses (`signin__alert`).
    `shots/s17-start-500-phone.png`.
  - The code step says "Sent to u•••@example.com". The student typed the address on this screen; show it in full
    (`pending.identifier`) so a typo is visible, and add "Not there? Check your spam folder." for email codes.
    `shots/s06-code-wrong.png`.
  - Two names for one action: "Resend code" and, after expiry, "Send a new code". Use "Send a new code" for both.
  - The countdown is the label of a disabled ghost button, so it renders at 2.1:1 (light) and 2.7:1 (dark). Disabled
    controls are exempt, but this is information the student needs; render "You can ask for a new code in 0:29" as
    `--ink-2` text, as the expired state already does. `shots/s14-code-expired-phone.png`.

### UX-17 Grouped nits

- **Same action, different words (library review):** reps press "Reject"; the uploader sees "Not published" and "Your
  file wasn't published"; Activity says "turned down"; Your uploads falls back to "decided not to publish". Keep
  "Not published" for the student and "Reject / rejected" for staff, Activity included (`audit.ts`). Owner:
  frontend-accounts, frontend-library.
- **Zero counts in a new Hub:** library link cards say "0 downloads" (a Drive link isn't downloaded; its own page
  says "Opened 0 times"); the empty forum shows "0 replies today" with the green live dot and a 0 next to every
  category. Hide counts at zero. And 16 of the 51 seeded links are titled "Course materials" (plus four "Past
  exams"): add the module to the title in the seed. Owners: frontend-library, frontend-community, content (seed).
  `shots/l02c-library-cards.png`, `shots/h05-forum-empty.png`.
- **Guest reply composer:** it shows a "?" avatar and no hint; "Start a thread" already says "You'll sign in when you
  post. Your draft stays on this device." Use the same line and a neutral avatar. Owner: frontend-community.
  `shots/f02-thread-guest-desk.png`.
- **Moderation on phones:** six count tiles (People, Threads, Replies, Library files included) push the first report
  about 580 px down the screen; the two counts that matter are already on the tabs. Show only the queue counts below 700 px. Owner:
  frontend-accounts. `shots/m05-moderation-phone-light.png`.
- **Reduced motion:** JS smooth scrolls ignore `prefers-reduced-motion` (`UploadDialog.tsx:64`, `ThreadPage.tsx:230`,
  `ThreadPage.tsx:247`); `LessonsTab.tsx:157` shows the right pattern. CSS motion is covered by `base.css`. Owners:
  frontend-library, frontend-community.
- **Mini Noora:** the first-visit bubble covers controls (the phone row's Change and Remove on Your account at 768 px,
  `shots/a13-account-tab-light.png`), and there is no way to put her away (the tester noted the same). Add "Hide Mini
  Noora" to her chat and to the More drawer. Owner: frontend-content.
- **Identifier keyboard:** `inputMode="email"` gives phone users a letters keyboard for a number. Switch to
  `inputMode="tel"` once the field starts with a digit or `+`. Owner: frontend-accounts.
- **Prototype paths in content:** issue JSON shows images under `demo/news/…`, which reads as demo content to a rep.
  Owner: content (seed).

---

## What works well and should stay

- **Sign-in dialog** (`shots/s01`, `s05`, `s06`, `s13`, `s14`, `s16`, `s23`): one field for email or phone with a live
  hint ("We'll text a 6-digit code to +973 3312 3456"), local numbers without +973, a title per channel ("Check your
  messages"), paste and autofill (`one-time-code`, WebOTP on Android), verify on the 6th digit, the wrong code
  selected for retyping with "4 tries left", expiry turning the button into "Send a new code" with a countdown, "We
  sent you a new code.", and plain messages for rate limits ("Try again in 30 minutes") and outages. The profile step
  pre-selects the cohort being browsed and offers "Not a current student".
- **Resuming the action after sign-in**: the star, vote, upload dialog, report dialog, reaction, reply and new thread
  all carry on (verified for star, vote by keyboard, upload; by code for the rest), and the dialog title says why
  ("Sign in to star files").
- **Public content stays public**; pages for some people (`RoleGate`) say who they are for, with a Sign in or Go to
  Home action (`shots/p08`, `p09`).
- **Upload and review loop** (`shots/l08`, `l09`, `l10`, `m20`, `m23`, `m25`, `m26`): every step says a rep checks
  uploads first; "Your uploads" shows "Waiting for review" and later the rep's note; the notification carries the
  reason; reps publish straight away with "Upload and publish".
- **Moderation and People**: counts on tabs, excerpts and the post's current state ("Hidden") on each report, the
  reporter hidden from reps, a note on resolve/dismiss, "Someone got there first", confirmations that explain powers
  and say "They get a notification", no self-demotion (`shots/m02`, `m04`, `p02`, `p03`).
- **Newsletter publishing**: drafts panel for reps, live preview, "Publish and notify everyone" confirmation, a
  generous "first issue is on its way" state for an empty newsletter (`shots/n01`, `n02`, `n07`).
- **Your account**: clear sections, "This device", "To be safe, your other devices were signed out", a delete dialog
  that lists exactly what goes and what stays, export as JSON, the lesson-progress import that asks first
  (`shots/a14`, `a10`, `g13`).
- **States**: skeletons that mirror the final layout on every data page, an error state with Try again everywhere,
  empty states with a next step (`sheet-load-*.png`, `sheet-err-*.png`, `sheet-empty.png`, `shots/h05`).
- **Design system fit and responsiveness**: tokens and components reused, dark mode consistent, tables turn into
  cards, dialogs become bottom sheets, and no page I checked scrolls sideways at 390 px (home, library, forum,
  thread, newsletter, issue, calendar, account, moderation, people, editor, a library item).
- **Accessibility basics**: focus trapped in dialogs with Esc, focus returned to the opener when it still exists,
  visible 2 px focus rings (the cohort cards show theirs on the label), `aria-live` for errors, `aria-pressed` on
  votes, stars and reactions, labelled controls and descriptive names ("Upvote, 2 votes", "Notifications, 2 unread").

## Accessibility measurements

Contrast of the new components, computed from the tokens (WCAG 2.x):

| Pair | Light | Dark | Used for |
|---|---|---|---|
| `--ink-2` on `--surface` | 7.74 | 8.33 | hints, meta, descriptions |
| `--alert-strong` on `--surface` | 5.64 | 6.20 | field errors (12 px) |
| `--alert-strong` on `--alert-soft` | 4.96 | 5.25 | "Not published", suspended banner |
| `--signal-strong` on `--signal-soft` | 4.57 | 6.43 | "This device" (just passes) |
| `--cobalt-ink` on `--cobalt` | 5.70 | 7.33 | primary buttons |
| `--alert-ink` on `--alert-strong` | 5.64 | 6.79 | Delete account, Suspend |
| `--ink` on `--highlight` | 12.47 | 12.47 | "Waiting for review", "Draft" |
| `--ink-3` on `--surface` | **3.64** | 4.76 | "Not added" (UX-14) |
| disabled ghost label (45 % opacity) | 2.13 | 2.74 | resend countdown (UX-16) |
| `--line-strong` on `--surface` | **1.51** | **1.88** | text field and select borders |

The last row is design-system wide and older than this release, but every new form depends on it: a text field on a
white dialog is identified only by a 1.51:1 border, under the 3:1 of WCAG 1.4.11. Owner: frontend-accounts. A
derived `--control-border` of `#7F90AD` light (3.23:1 on surface, 3.01:1 on paper) and `#5670A6` dark (3.45:1), used
in `Field.css` for `.ui-control` and `.ui-search`, would fix it without touching `--line-strong` elsewhere.

The in-page scan of the sign-in steps, Your account, the library, moderation (both queues), the newsletter page and
editor, a thread and People found no other text under AA (its remaining hits were text on highlighter marks and
sliding thumbs, which it can't see, and disabled buttons).

Keyboard walks: sign-in from an Upvote (Tab 20 times to reach it, Enter, type the address, Enter, type the code,
type a name, Tab to the cohort, arrow, Tab, Enter): works end to end and focus returns to the Upvote, now pressed.
Notifications: see UX-2. ⌘K: opens with focus in the field, arrows move, Esc clears then closes. Onboarding: Tab
cycles through the three year cards.

## Coverage

- Guest: first visit (onboarding), Home, library, a Drive link item, forum, thread, new thread, newsletter, issue,
  calendar, account, moderation and people prompts, ⌘K (results, none, slow, error) at all three widths.
- New student: sign-up by email (desktop) and by phone (phone, dark); wrong, expired, stale-after-resend and resent
  codes; network, 429 and 500 on start; profile errors; add an email to a phone account; export; delete dialog;
  lesson progress as a guest and the import prompt.
- Returning student: thread with code, reply, vote, accept, notifications, report, star (resumed after sign-in),
  upload with progress, Your uploads, react to an issue; a suspended student's thread, vote, upload and account.
- Rep: Home, account menu, reports and uploads queues (desktop light, tablet dark, phone), resolve dialog, publish and
  reject with a note, hidden thread view, drafts, editor (desktop and phone), publish confirmation, calendar Add event
  (desktop and phone dark).
- Admin: People (search, role dialog, suspend and lift, activity) at desktop, tablet and phone dark.
- Loading (6 s delay) and error (500) states for Home, library, forum, thread, newsletter, issue, calendar, module,
  account, moderation and notifications; empty states for starred, your uploads, forum search, empty forum and
  notifications.
- Not covered: a real screen reader, iOS Safari and Android Chrome on devices (WebOTP, the on-screen keyboard over
  bottom sheets), and PDF previews (blank in headless Chromium, which has no PDF viewer; phones get "Open the PDF",
  which is right).
