// /privacy: the privacy notice, open to everyone (Bahrain's PDPL, and the link on Google's consent screen). Its words
// are the researcher's draft, as written: a change to them goes back to the researcher, not into this file alone.
// Sections that name a service only while it handles students' data follow GET /privacy and the build (privacy.ts).
// The email provider's section is left out: the Hub sends no email at launch. When email goes on, it comes back with
// the provider's name.
import type { ReactNode } from 'react';
import { Page, PageHeader, PageSection, SectionHeader } from '../../ui';
import { usePrivacyServices } from './api';
import { PRIVACY_DETAILS, type PrivacyDetails } from './details';
import { shownSections } from './privacy';
import './Privacy.css';

/** A detail only the founder can give, or its placeholder while it's missing. */
function Detail({ value, gap }: { value: string | null; gap: string }) {
  return value ? <>{value}</> : <span className="privacy__gap">[{gap}]</span>;
}

function ContactEmail({ details }: { details: PrivacyDetails }) {
  return details.contactEmail ? (
    <a href={`mailto:${details.contactEmail}`}>{details.contactEmail}</a>
  ) : (
    <span className="privacy__gap">[CONTACT EMAIL]</span>
  );
}

const KEPT: { what: string; why: string; required: string }[] = [
  {
    what: 'Your email address and a password (stored only as a scrambled hash), or your Google account’s email address and Google’s id for it',
    why: 'So you can sign in and nobody else can',
    required: 'Required to have an account. Without one you can still read the public pages.',
  },
  {
    what: 'Display name and year of study',
    why: 'Shown on your posts and uploads so classmates know who wrote them',
    required: 'Display name required; year optional (“none” is fine)',
  },
  {
    what: 'What you post and upload: forum threads and replies, pictures, library uploads, requests, votes and reactions',
    why: 'To show them to other students, as you asked',
    required: 'Optional',
  },
  {
    what: 'Your own study data: notes, notebooks, study boards, personal calendar entries, lesson progress, chapters you’ve ticked, practice scores, starred files',
    why: 'To keep them for you across devices. Only you see them.',
    required: 'Optional',
  },
  {
    what: 'Notification settings, and for each device where you turn on notifications, that device’s push address',
    why: 'To send you the notifications you chose',
    required: 'Optional',
  },
  {
    what: 'Sign-in sessions: when, the IP address and the browser',
    why: 'So you can see and end your sessions in Your account, and to spot break-ins',
    required: 'Required while you’re signed in',
  },
  {
    what: 'Security and moderation records: failed sign-ins (kept as scrambled codes, not your address), and what admins and moderators did, with the IP address they did it from',
    why: 'To stop password guessing and to keep moderation accountable',
    required: 'Required',
  },
  {
    what: 'Bug reports you send, with an optional screenshot',
    why: 'To fix what you reported',
    required: 'Optional',
  },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <PageSection aria-labelledby={id}>
      <SectionHeader id={id} title={title} />
      <div className="privacy__prose">{children}</div>
    </PageSection>
  );
}

export default function PrivacyPage() {
  const services = usePrivacyServices();
  const shown = shownSections(services.data, services.isError, Boolean(import.meta.env.VITE_POSTHOG_KEY));
  const d = PRIVACY_DETAILS;
  const region = <Detail value={d.bucketRegion} gap="BUCKET REGION" />;
  return (
    <Page width="narrow" className="privacy">
      <PageHeader
        title="Privacy notice"
        description={
          <>
            Last updated: <Detail value={d.updated} gap="DATE" />
          </>
        }
      />
      <div className="privacy__prose privacy__intro">
        <p>
          DSBA Hub is a free study website for students of the University of London BSc Data Science and Business
          Analytics at BIBF. It is run by one student, not by the University of London or BIBF. This notice says what
          the Hub keeps about you, why, who else handles it, how long it stays, and what you can ask for. It follows
          Bahrain’s Personal Data Protection Law (Law No. 30 of 2018).
        </p>
      </div>

      <Section id="privacy-who" title="Who is responsible">
        <p>
          <Detail value={d.fullName} gap="FULL NAME" />, a student who builds and runs DSBA Hub, P.O. Box{' '}
          <Detail value={d.poBox} gap="NUMBER" />, <Detail value={d.area} gap="AREA" />, Kingdom of Bahrain. Contact:{' '}
          <ContactEmail details={d} />.
        </p>
      </Section>

      <Section id="privacy-kept" title="What we keep, and why">
        <table className="privacy__table" role="table">
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">Why</th>
              <th scope="col">Required?</th>
            </tr>
          </thead>
          <tbody>
            {KEPT.map((row) => (
              <tr key={row.what} role="row">
                <th scope="row" role="rowheader">
                  {row.what}
                </th>
                <td data-label="Why:" role="cell">
                  {row.why}
                </td>
                <td data-label="Required?" role="cell">
                  {row.required}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Your grades calculator marks never leave your browser. We don’t ask your age, phone number, ID number, or
          anything about your health, religion or beliefs. Please don’t post those things in public places on the Hub.
        </p>
      </Section>

      <Section id="privacy-basis" title="Why we’re allowed to">
        <p>
          We use your data to provide the Hub you signed up for, and for our legitimate interest in keeping it safe and
          fairly moderated (Article 4 of the law). We don’t rely on your consent for any of this. That matters because
          in Bahrain only people aged 21 or over can give legal consent. If something ever needs consent, we’ll ask
          first, and we’ll ask a parent or guardian if you’re under 21.
        </p>
      </Section>

      <Section id="privacy-others" title="Who else handles it">
        <p>These services handle data for us, and only to run the Hub:</p>
        <ul>
          <li>
            <strong>Railway</strong> (railway.com) hosts the Hub: its servers, database, file storage (Railway Buckets)
            and daily backups. All your data is stored with Railway: the servers are in Singapore and the files in{' '}
            {region}.
          </li>
          <li>
            <strong>Google</strong> handles sign-in if you choose “Continue with Google”. Google tells us your email
            address and confirms it’s yours. Google learns that you signed in to DSBA Hub.
          </li>
          <li>
            <strong>Apple, Google, Mozilla and Microsoft</strong> deliver notifications if you turn on “Notifications on
            this device”. Your browser picks the service: Apple’s for Safari and iPhone, Google’s for Chrome and
            Android, Mozilla’s for Firefox, Microsoft’s for Edge. They get a device address and the notification’s text.
            Turn it off in Your account, or sign out, and that device stops getting them.
          </li>
          <li>
            <strong>YouTube (Google)</strong>: lesson videos play from YouTube. When a video loads, YouTube sees your IP
            address and browser, under Google’s privacy policy.
          </li>
          {/* Lessons hold class recordings (the seed's modules list them), so this one always shows. */}
          <li>
            <strong>BIBF</strong>: class recordings play from BIBF’s server (vc.bibf.com). When one loads, BIBF’s server
            sees your IP address and browser, under BIBF’s own rules.
          </li>
          {shown.nooraAnswers ? (
            <li>
              <strong>Anthropic</strong>: when you ask Mini Noora a question, your question and the conversation so far
              go to Anthropic (the maker of Claude) to write the answer. Your name, email and account aren’t sent.
            </li>
          ) : null}
          {shown.forumCheck ? (
            <li>
              <strong>Anthropic</strong>: pictures and posts in the forum are checked by an outside service, Anthropic
              (the maker of Claude), for content against the forum’s rules. It sees the picture or the text only, never
              your name or account.
            </li>
          ) : null}
          {shown.aiApps ? (
            <li>
              <strong>AI apps you connect</strong>: if you connect an AI app to your account, the Hub gives that app
              what it asks for on your behalf, read-only. The app’s own privacy policy then applies. You can disconnect
              it any time in Your account › AI apps.
            </li>
          ) : null}
          {shown.analytics ? (
            <li>
              <strong>PostHog</strong>: counts page views with a random id kept in your browser. No cookies, no account
              details, and your IP address is discarded.
            </li>
          ) : null}
        </ul>
        <p>
          Other students see your display name, year and badge on what you post, never your email address. We don’t sell
          your data or give it to anyone else, unless a Bahraini court or the Public Prosecution orders it. We never use
          it for marketing, and we don’t send advertising.
        </p>
        <p>
          Railway, Google, Apple, Mozilla, Microsoft and Anthropic are based in the United States, and Railway keeps the
          Hub in Singapore and {region}. Bahrain’s Personal Data Protection Authority lists these countries as giving
          adequate protection (Order No. 42 of 2022).
        </p>
      </Section>

      <Section id="privacy-kept-for" title="How long we keep it">
        <ul>
          <li>
            <strong>Your account and everything in it:</strong> until you delete it. Then your personal data is deleted
            at once: notes, notebooks, boards, calendar, progress, scores, stars, votes, notifications, devices,
            sessions, bug reports. Your forum posts stay, shown as “deleted user”, so threads still make sense. Files
            you published in the library stay, without your name. Pictures, notebook and board files are deleted.
          </li>
          <li>
            <strong>Backups:</strong> one copy of the database is made each day, and only the newest 14 are kept. A
            deleted account can stay in a backup for up to <strong>14 days</strong>, then it’s gone. Backups are sent
            over an encrypted connection, kept in a private store that only the backup job can reach, and used only to
            recover from a failure.
          </li>
          <li>
            <strong>Sign-in records:</strong> failed sign-ins 2 days, Google sign-in steps 1 day, password reset links 1
            day after they end.
          </li>
          <li>
            <strong>Sessions:</strong> a session lasts at most 30 days, and its record is deleted 30 days after it ends
            or you sign out.
          </li>
          <li>
            <strong>Bug reports:</strong> the IP address on a report after 1 day, its screenshot 90 days after the
            report is closed. The report itself goes when you delete your account.
          </li>
          <li>
            <strong>Moderation and admin records:</strong> the IP address after 90 days.
          </li>
        </ul>
      </Section>

      <Section id="privacy-rights" title="Your rights">
        <ul>
          <li>
            <strong>See your data:</strong> Your account › Download your data gives you a copy at any time. Or email{' '}
            <ContactEmail details={d} />; we reply within 15 working days, free.
          </li>
          <li>
            <strong>Correct it:</strong> change your name and year in Your account, or ask us.
          </li>
          <li>
            <strong>Delete it:</strong> Your account › Delete account, or ask us. We reply within 10 working days.
          </li>
          <li>
            <strong>Object:</strong> if the way we use your data harms you, tell us and we’ll stop or explain why not
            within 10 working days.
          </li>
          <li>
            <strong>Parents and guardians</strong> of a student under 21 can ask us to delete that student’s account.
          </li>
          <li>
            <strong>Complain:</strong> you can complain to Bahrain’s Personal Data Protection Authority (pdp.gov.bh).
          </li>
        </ul>
      </Section>

      <Section id="privacy-cookies" title="Cookies and your browser">
        <p>
          The Hub uses two cookies, both needed to keep you signed in safely: a session cookie and a security (CSRF)
          cookie. No advertising or tracking cookies. Your browser also keeps some settings (theme, Mini Noora’s
          position, a guest’s year and lesson progress). Signing out clears your personal ones, which matters on shared
          lab computers.
        </p>
      </Section>

      <Section id="privacy-security" title="Security">
        <p>
          Everything travels over HTTPS. Passwords and session tokens are stored only as scrambled hashes. Files are
          private and open through links that expire in minutes. Logs never hold passwords, tokens or full email
          addresses. If a breach puts your data at risk, we’ll tell you and the Authority.
        </p>
      </Section>

      <Section id="privacy-changes" title="Changes">
        <p>
          If this notice changes, the date at the top changes. If a change affects what we keep or who handles it, we’ll
          tell you in the Hub first.
        </p>
      </Section>
    </Page>
  );
}
