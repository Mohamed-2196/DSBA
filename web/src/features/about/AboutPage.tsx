import { ArrowUpRight, Bank, GithubLogo, GraduationCap, UploadSimple, type Icon } from '@phosphor-icons/react';
import { CONTRIBUTORS, DISCLAIMER, MYCLASS_URL, NOTE_CONTRIBUTORS, REPORT_PROBLEM_URL, UOL_PORTAL_URL } from '../../data/people';
import { useModules } from '../../state/modules';
import { Avatar, Button, Page, PageHeader, PageSection, Panel, SectionHeader } from '../../ui';
import { useCalendarEvents } from '../calendar/public';
import './AboutPage.css';

const LINKS: { label: string; note: string; href: string; icon: Icon }[] = [
  { label: 'BIBF MyClass', note: 'Lecture slides, announcements and coursework', href: MYCLASS_URL, icon: GraduationCap },
  { label: 'UoL student portal', note: 'Exam entries, results and your student record', href: UOL_PORTAL_URL, icon: Bank },
];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "16 modules across three years, with 100 chapters, 384 lessons, 51 files in the library and 66 calendar dates." */
function CoverageLine() {
  const { modules } = useModules();
  const events = useCalendarEvents();
  const chapters = modules.reduce((n, m) => n + m.chapterCount, 0);
  const lessons = modules.reduce((n, m) => n + m.lessonCount, 0);
  const parts = [plural(chapters, 'chapter', 'chapters'), plural(lessons, 'lesson', 'lessons')];
  // The library's count is null while the library is switched off: the sentence leaves it out.
  if (modules.some((m) => m.libraryCount !== null)) {
    const files = modules.reduce((n, m) => n + (m.libraryCount ?? 0), 0);
    parts.push(`${plural(files, 'file', 'files')} in the library`);
  }
  // The calendar count joins the sentence once it has loaded (and simply stays out if it can't be read).
  if (events.data) parts.push(plural(events.data.length, 'calendar date', 'calendar dates'));
  const last = parts.pop() ?? '';
  return (
    <p>
      Right now it covers {plural(modules.length, 'module', 'modules')} across three years, with {parts.join(', ')} and {last}.
    </p>
  );
}

export default function AboutPage() {
  const { getModule } = useModules();
  return (
    <Page>
      <PageHeader
        title="About DSBA Hub"
        description="A student-run hub for the Data Science and Business Analytics programme at BIBF, studied for a University of London degree."
      />
      <div className="about">
        <div className="about__main">
          <PageSection aria-labelledby="about-what">
            <SectionHeader id="about-what" title="What it is" />
            <div className="about__prose">
              <p>
                DSBA Hub grew out of the DSBA Resource Hub. It keeps everything the hub offered for each module — books and study guides, notes shared by students,
                exercises, past exams, cheat sheets and recorded lessons — and adds a forum for all three cohorts, a library you can read without leaving the app,
                lessons that remember where you stopped, Career Navigator, a full calendar, a degree classification calculator and The DSBA Newsletter.
              </p>
              <CoverageLine />
              <p>
                Anyone can read it. Sign in with your email or phone number to ask and answer in the forum, share files, react to the newsletter and keep your lesson
                progress on every device. The grade calculator is the exception: the marks you type into it never leave your browser.
              </p>
              <p>
                It does not replace your email, the VLE, BIBF MyClass, the UoL student portal or your WhatsApp groups. It gives them one place to start.
              </p>
            </div>
          </PageSection>

          <PageSection aria-labelledby="about-people">
            <SectionHeader id="about-people" title="Contributors" description="The people who built the hub and supplied its materials." />
            <ul role="list" className="about__people">
              {CONTRIBUTORS.map((c) => (
                <li key={c.id} className="about__person">
                  <Avatar name={c.name} size="lg" decorative />
                  <div>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="about__name">
                        {c.name}
                      </a>
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
            <SectionHeader id="about-notes" title="Students who shared notes" description="Their notes are in the library and on each module page." />
            <ul role="list" className="about__notes">
              {NOTE_CONTRIBUTORS.map((p) => (
                <li key={p.id} className="about__note">
                  <Avatar name={p.name} size="sm" decorative />
                  <span className="about__note-name">{p.name}</span>
                  <span className="about__note-mods">
                    {[...new Set(p.notes.map((n) => getModule(n.moduleId)?.shortName).filter((s): s is string => !!s))].join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </PageSection>

          <PageSection aria-labelledby="about-disclaimer">
            <SectionHeader id="about-disclaimer" title="Disclaimer" />
            <p className="about__disclaimer">{DISCLAIMER}</p>
          </PageSection>
        </div>

        <aside className="about__aside" aria-label="Sharing, problems and links">
          {/* Contributing means uploading to the library; GitHub is only where problems are reported (decision D6). */}
          <Panel padding="md" className="about__contribute">
            <h2 className="about__aside-title">Got a resource to share?</h2>
            <p className="about__aside-body">Notes, past papers or a guide: upload it to the library, and a student rep checks it before it goes up.</p>
            <Button variant="primary" to="/library?upload=1" leadingIcon={UploadSimple} fullWidth data-hub="about-upload">
              Upload a file
            </Button>
          </Panel>
          <Panel padding="md" className="about__report">
            <h2 className="about__aside-title">Something wrong with the Hub?</h2>
            <p className="about__aside-body">A broken page, a wrong date or a typo: tell the people who build it.</p>
            <Button href={REPORT_PROBLEM_URL} leadingIcon={GithubLogo} trailingIcon={ArrowUpRight} fullWidth data-hub="about-report">
              Report a problem
              <span className="visually-hidden">, opens GitHub in a new tab</span>
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
