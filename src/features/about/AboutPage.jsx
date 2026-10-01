import { ArrowUpRight, Bank, GithubLogo, GraduationCap } from '@phosphor-icons/react';
import { MODULES, getModuleStats, getModule } from '../../data/modules.js';
import { EVENTS } from '../../data/calendar.js';
import { CONTRIBUTORS, CONTRIBUTE_URL, DISCLAIMER, MYCLASS_URL, NOTE_CONTRIBUTORS, REPO_URL, UOL_PORTAL_URL } from '../../data/people.js';
import { Avatar, Button, Page, PageHeader, PageSection, Panel, SectionHeader } from '../../ui';
import './AboutPage.css';

const totals = MODULES.reduce(
  (t, m) => {
    const s = getModuleStats(m);
    return { chapters: t.chapters + s.chapters, videos: t.videos + s.videos, notes: t.notes + s.notes };
  },
  { chapters: 0, videos: 0, notes: 0 },
);

const LINKS = [
  { label: 'BIBF MyClass', note: 'Lecture slides, announcements and coursework', href: MYCLASS_URL, icon: GraduationCap },
  { label: 'UoL student portal', note: 'Exam entries, results and your student record', href: UOL_PORTAL_URL, icon: Bank },
  { label: 'Source code on GitHub', note: 'DSBA Pulse is open source', href: REPO_URL, icon: GithubLogo },
];

export default function AboutPage() {
  return (
    <Page>
      <PageHeader
        title="About DSBA Pulse"
        description="A student-run hub for the Data Science and Business Analytics programme at BIBF, studied for a University of London degree."
      />
      <div className="about">
        <div className="about__main">
          <PageSection aria-labelledby="about-what">
            <SectionHeader id="about-what" title="What it is" />
            <div className="about__prose">
              <p>
                DSBA Pulse grew out of the DSBA Resource Hub. It keeps everything the hub offered for each module — books and study guides,
                notes shared by students, exercises, past exams, cheat sheets and recorded lessons — and adds a library you can read without
                leaving the app, a newsletter, a forum, a full calendar and a degree classification calculator.
              </p>
              <p>
                Right now it covers {MODULES.length} modules across three years, with {totals.chapters} chapters, {totals.videos} lessons,{' '}
                {totals.notes} sets of student notes and {EVENTS.length} calendar dates.
              </p>
            </div>
          </PageSection>

          <PageSection aria-labelledby="about-people">
            <SectionHeader id="about-people" title="Contributors" description="The people who built the hub and supplied its materials." />
            <ul role="list" className="about__people">
              {CONTRIBUTORS.map((c) => (
                <li key={c.id} className="about__person">
                  <Avatar name={c.name} size="lg" />
                  <div>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="about__name">{c.name}</a>
                    ) : (
                      <span className="about__name">{c.name}</span>
                    )}
                    <p className="about__role">{c.affiliation ? `${c.role}, ${c.affiliation}` : c.role}</p>
                  </div>
                </li>
              ))}
            </ul>
          </PageSection>

          <PageSection aria-labelledby="about-notes">
            <SectionHeader id="about-notes" title="Students who shared notes" description="Their notes appear on each module page." />
            <ul role="list" className="about__notes">
              {NOTE_CONTRIBUTORS.map((p) => (
                <li key={p.id} className="about__note">
                  <Avatar name={p.name} size="sm" />
                  <span className="about__note-name">{p.name}</span>
                  <span className="about__note-mods">{[...new Set(p.notes.map((n) => getModule(n.moduleId)?.shortName))].join(', ')}</span>
                </li>
              ))}
            </ul>
          </PageSection>

          <PageSection aria-labelledby="about-disclaimer">
            <SectionHeader id="about-disclaimer" title="Disclaimer" />
            <p className="about__disclaimer">{DISCLAIMER}</p>
          </PageSection>
        </div>

        <aside className="about__aside" aria-label="Links and contributing">
          <Panel padding="md" className="about__contribute">
            <h2 className="about__aside-title">Got a resource to share?</h2>
            <p className="about__aside-body">Notes, past papers or a correction. Open an issue on GitHub and it will be added for everyone.</p>
            <Button variant="primary" href={CONTRIBUTE_URL} leadingIcon={GithubLogo} fullWidth>
              Open a GitHub issue
            </Button>
          </Panel>
          <Panel padding="none">
            <h2 className="about__aside-title about__aside-title--pad">Useful links</h2>
            <ul role="list" className="about__links">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="about__link">
                    <l.icon className="about__link-icon" aria-hidden="true" />
                    <span className="about__link-text">
                      <span className="about__link-label">{l.label}</span>
                      <span className="about__link-note">{l.note}</span>
                    </span>
                    <ArrowUpRight className="about__link-ext" aria-hidden="true" weight="bold" />
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
          <a href={MYCLASS_URL} target="_blank" rel="noopener noreferrer" className="about__bibf" aria-label="BIBF MyClass">
            <img src={`${import.meta.env.BASE_URL}BIBF_logo.png`} alt="BIBF" width="120" />
          </a>
        </aside>
      </div>
    </Page>
  );
}
