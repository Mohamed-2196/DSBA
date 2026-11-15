// /privacy: the privacy notice, open to everyone (Bahrain's PDPL, and the link on Google's consent screen). Its words
// are the researcher's casual rewrite (COM-293; the founder chose casual words on 2026-11-13), as written: a change to
// them goes back to the researcher, not into this file alone.
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
    what: 'Your email and password (only a scrambled hash of it), or with Google, your email and Google’s id for your account',
    why: 'So you can sign in and nobody else can',
    required: 'Yes, for an account. Without one you can still read the public pages.',
  },
  {
    what: 'Display name and year',
    why: 'Shown on your posts and uploads so classmates know who wrote them',
    required: 'Name yes; year no (“none” is fine)',
  },
  {
    what: 'What you post and upload: threads, replies, pictures, library files, requests, votes, reactions',
    why: 'To show them to other students, like you asked',
    required: 'No',
  },
  {
    what: 'Your own study stuff: notes, notebooks, boards, calendar entries, lesson progress, ticked chapters, practice scores, starred files',
    why: 'To keep them for you on every device. Only you see them.',
    required: 'No',
  },
  {
    what: 'Notification settings, and a push address for each device you turn them on for',
    why: 'To send the notifications you picked',
    required: 'No',
  },
  {
    what: 'Sign-in sessions: when, IP address, browser',
    why: 'So you can see and end them in Your account, and to spot break-ins',
    required: 'Yes, while you’re signed in',
  },
  {
    what: 'Security and moderation records: failed sign-ins (as scrambled codes, not your email), and what admins and moderators did, with their IP address',
    why: 'To stop password guessing and keep moderation fair',
    required: 'Yes',
  },
  {
    what: 'Bug reports you send, and a screenshot if you add one',
    why: 'To fix what you reported',
    required: 'No',
  },
];

/** Only while Mini Noora's AI answers are on. */
const NOORA_ROW = {
  what: 'How many questions you asked Mini Noora each day',
  why: 'To keep to the daily limit and the Hub’s monthly budget',
  required: 'Only if you use Mini Noora',
};

/** The row's label: the phrase before the first colon, or all of it when there's none. The rest stays regular. */
function What({ text }: { text: string }) {
  const at = text.indexOf(': ');
  if (at < 0) return <span className="privacy__label">{text}</span>;
  return (
    <>
      <span className="privacy__label">{text.slice(0, at + 1)}</span>
      {text.slice(at + 1)}
    </>
  );
}

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
  const shown = shownSections(services, Boolean(import.meta.env.VITE_POSTHOG_KEY));
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
          DSBA Hub is a free study site, made by a student for students of the University of London BSc Data Science and
          Business Analytics at BIBF. I run it on my own; the University of London and BIBF don’t. This page says, in
          plain words, what the Hub keeps about you, why, who else handles it, how long it stays, and what you can ask
          me for. It follows Bahrain’s Personal Data Protection Law (Law No. 30 of 2018).
        </p>
      </div>

      <Section id="privacy-who" title="Who’s responsible">
        <p>
          Me: <Detail value={d.fullName} gap="FULL NAME" />, the student who builds and runs DSBA Hub.
          <br />
          Email: <ContactEmail details={d} />.
        </p>
      </Section>

      <Section id="privacy-kept" title="What I keep, and why">
        <table className="privacy__table" role="table">
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">Why</th>
              <th scope="col">Do you have to give it?</th>
            </tr>
          </thead>
          <tbody>
            {(shown.nooraAnswers ? [...KEPT, NOORA_ROW] : KEPT).map((row) => (
              <tr key={row.what} role="row">
                <th scope="row" role="rowheader">
                  <What text={row.what} />
                </th>
                <td data-label="Why:" role="cell">
                  {row.why}
                </td>
                <td data-label="Do you have to give it?" role="cell">
                  {row.required}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Your grades calculator marks never leave your browser. I don’t ask your age, phone number, ID number, or
          anything about your health, religion or beliefs, so please don’t post those in public spots on the Hub.
        </p>
      </Section>

      <Section id="privacy-basis" title="Why I’m allowed to">
        <p>
          The law (Article 4) lets me use your data to run the Hub you signed up for, and to keep it safe and fairly
          moderated. I don’t rely on your consent for any of it. That matters because in Bahrain you can only give legal
          consent from 21. If something ever does need consent, I’ll ask first, and ask a parent or guardian if you’re
          under 21.
        </p>
      </Section>

      <Section id="privacy-others" title="Who else handles it">
        <p>These services handle data for me, only to run the Hub:</p>
        <ul>
          <li>
            <strong>Railway</strong> (railway.com) hosts the Hub: servers, database, file storage (Railway Buckets) and
            daily backups. All your data is with Railway: servers in Singapore, files in {region}.
          </li>
          <li>
            <strong>Google</strong> does sign-in if you pick “Continue with Google”. It tells me your email and confirms
            it’s yours, and it learns that you signed in to DSBA Hub.
          </li>
          <li>
            <strong>Apple, Google, Mozilla and Microsoft</strong> deliver notifications to devices where you turn them
            on (“On this device”, under “Notifications on your devices” in Your account). Your browser picks which:
            Apple for Safari and iPhone, Google for Chrome and Android, Mozilla for Firefox, Microsoft for Edge. They
            get a device address and the notification’s text. Turn it off in Your account, or sign out, and that device
            stops getting them.
          </li>
          <li>
            <strong>YouTube (Google)</strong> plays the lesson videos. When one loads, YouTube sees your IP address and
            browser, under Google’s privacy policy.
          </li>
          {/* Lessons hold class recordings (the seed's modules list them), so this one always shows. */}
          <li>
            <strong>BIBF</strong> plays class recordings from its server (vc.bibf.com). When one loads, BIBF sees your
            IP address and browser, under its own rules.
          </li>
          {shown.nooraAnswers ? (
            <li>
              <strong>Anthropic</strong> (the maker of Claude) writes Mini Noora’s answers. It gets your question, the
              chat so far, and what Mini Noora needs to fit the answer to you: your year, the page you’re on, the module
              and lesson you have open, and the calendar’s next dates for your year plus any resits you’ve marked. If
              you ask about one of your notes or a past paper question, it also gets that note, or the paper’s pages and
              its examiners’ report. Never your name, email or account. Your Mini Noora chats stay in your browser, not
              on the Hub.
            </li>
          ) : null}
          {shown.forumCheck ? (
            <li>
              <strong>Anthropic</strong> (the maker of Claude) checks forum posts and pictures against the forum rules.
              It sees only the text or picture, never your name or account.
            </li>
          ) : null}
          {shown.aiApps ? (
            <li>
              <strong>AI apps you connect</strong>: if you connect one, the Hub gives it what it asks for on your
              behalf, read-only, and the app’s own privacy policy applies. Disconnect it any time in Your account › AI
              apps.
            </li>
          ) : null}
          {shown.analytics ? (
            <li>
              <strong>PostHog</strong> counts page views with a random id kept in your browser. No cookies, no account
              details, and your IP address is thrown away.
            </li>
          ) : null}
        </ul>
        <p>
          Other students see your display name, year and badge on your posts, never your email. I don’t sell your data
          or give it to anyone else, unless a Bahraini court or the Public Prosecution orders it. I never use it for
          marketing, and I don’t send ads.
        </p>
        <p>
          {shown.nooraAnswers || shown.forumCheck
            ? 'Railway, Google, Apple, Mozilla, Microsoft and Anthropic'
            : 'Railway, Google, Apple, Mozilla and Microsoft'}{' '}
          are US companies, and Railway keeps the Hub in Singapore and {region}. Bahrain’s Personal Data Protection
          Authority lists these countries as giving adequate protection, so data may go there (Order No. 42 of 2022).
        </p>
      </Section>

      <Section id="privacy-kept-for" title="How long I keep it">
        <ul>
          <li>
            <strong>Your account and everything in it:</strong> until you delete it. Then your personal stuff goes
            straight away: notes, notebooks, boards, calendar, progress, scores, stars, votes, notifications, devices,
            sessions, bug reports. Your forum posts stay as “deleted user”, so threads still make sense. Library files
            you published stay, without your name. Pictures, notebook and board files are deleted.
            {shown.nooraAnswers
              ? ' Mini Noora’s daily question counts stay, without your name, so the month’s spending adds up.'
              : null}
          </li>
          <li>
            <strong>Backups:</strong> one copy of the database a day, and only the newest 14 are kept. A deleted account
            can sit in a backup for up to <strong>14 days</strong>, then it’s gone. Backups travel over an encrypted
            connection, sit in a private store only the backup job can reach, and are only used to recover from a
            failure.
          </li>
          <li>
            <strong>Sign-in records:</strong> failed sign-ins 2 days, Google sign-in steps 1 day, password reset links 1
            day after they expire.
          </li>
          <li>
            <strong>Sessions:</strong> a session lasts 30 days at most, and its record goes 30 days after it ends or you
            sign out.
          </li>
          <li>
            <strong>Bug reports:</strong> the IP address goes after 1 day, the screenshot 90 days after the report is
            closed, and the report itself when you delete your account.
          </li>
          <li>
            <strong>Moderation and admin records:</strong> the IP address goes after 90 days.
          </li>
        </ul>
      </Section>

      <Section id="privacy-rights" title="Your rights">
        <ul>
          <li>
            <strong>See your data:</strong> Your account › Download your data, any time. Or email{' '}
            <ContactEmail details={d} /> and I’ll reply within 15 working days, free.
          </li>
          <li>
            <strong>Fix it:</strong> change your name and year in Your account, or ask me.
          </li>
          <li>
            <strong>Delete it:</strong> Your account › Delete account, or ask me and I’ll reply within 10 working days.
          </li>
          <li>
            <strong>Object:</strong> if the way I use your data harms you, tell me, and within 10 working days I’ll stop
            or explain why not.
          </li>
          <li>
            <strong>Parents and guardians</strong> of a student under 21 can ask me to delete that student’s account.
          </li>
          <li>
            <strong>Complain:</strong> you can complain to Bahrain’s Personal Data Protection Authority (pdp.gov.bh).
          </li>
        </ul>
      </Section>

      <Section id="privacy-cookies" title="Cookies and your browser">
        <p>
          Just two cookies, both to keep you signed in safely: a session cookie and a security (CSRF) cookie. No ad or
          tracking cookies. Your browser also remembers a few settings (theme, where Mini Noora sits, a guest’s year and
          lesson progress). Signing out clears your personal ones, which matters on shared lab computers.
        </p>
      </Section>

      <Section id="privacy-security" title="Security">
        <p>
          Everything travels over HTTPS. Passwords and session tokens are only stored as scrambled hashes. Files are
          private and open through links that expire in minutes. Logs never hold passwords, tokens or full email
          addresses. If a breach puts your data at risk, I’ll tell you and the Authority.
        </p>
      </Section>

      <Section id="privacy-changes" title="Changes">
        <p>
          If this page changes, so does the date at the top. If a change affects what I keep or who handles it, I’ll
          tell you on the Hub first.
        </p>
      </Section>
    </Page>
  );
}
