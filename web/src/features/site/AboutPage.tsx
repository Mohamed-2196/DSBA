// /about: what the hub is, who made it, the students who shared notes, and the useful links. Its words and links are
// Site settings (Manage → Site settings); the hub's own numbers come from the modules and the calendar.
import { Link } from 'react-router-dom';
import type { SiteDoc } from '../../api/types';
import { showsUpload, useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import {
  Avatar,
  Button,
  Page,
  PageHeader,
  PageSection,
  Panel,
  QueryError,
  SectionHeader,
  Skeleton,
  countOf,
  glyph,
  Icon,
  type Glyph,
} from '../../ui';
import { openBugReport } from '../bugs/public';
import { useCalendarEvents } from '../calendar/public';
import { Prose } from '../forum/public';
import { useSite } from './api';
import { contributorLine, httpsHref, notesInLibrary } from './lib/site';
import './About.css';

/** "Right now it covers 16 modules across three years, with 100 chapters, 384 lessons, 51 files in the library and
 *  66 calendar dates." */
function CoverageLine() {
  const { modules } = useModules();
  const { featureOn } = useAuth();
  const events = useCalendarEvents({}, { enabled: featureOn('calendar') });
  const chapters = modules.reduce((n, m) => n + m.chapterCount, 0);
  const lessons = modules.reduce((n, m) => n + m.lessonCount, 0);
  const parts = [countOf(chapters, 'chapter', 'chapters'), countOf(lessons, 'lesson', 'lessons')];
  // The library's count is null while the library is switched off: the sentence leaves it out.
  if (modules.some((m) => m.libraryCount !== null)) {
    const files = modules.reduce((n, m) => n + (m.libraryCount ?? 0), 0);
    parts.push(`${countOf(files, 'file', 'files')} in the library`);
  }
  // The calendar count joins the sentence once it has loaded (and simply stays out if it can't be read).
  if (events.data) parts.push(countOf(events.data.length, 'calendar date', 'calendar dates'));
  const last = parts.pop() ?? '';
  return (
    <p>
      Right now it covers {countOf(modules.length, 'module', 'modules')} across three years, with {parts.join(', ')} and{' '}
      {last}.
    </p>
  );
}

const LINK_ICONS: { key: 'myclass' | 'uolPortal'; icon: Glyph }[] = [
  { key: 'myclass', icon: glyph.cap },
  { key: 'uolPortal', icon: glyph.bank },
];

/** About's main column, from the settings as they are (or as an admin's draft, in the editor's preview). */
export function AboutMain({ site, numbers = true }: { site: SiteDoc; numbers?: boolean }) {
  const { getModule } = useModules();
  return (
    <div className="about__main">
      <PageSection aria-labelledby="about-what">
        <SectionHeader id="about-what" title="What it is" />
        <div className="about__prose">
          <Prose text={site.about} />
          {numbers ? <CoverageLine /> : null}
        </div>
      </PageSection>

      {site.contributors.length ? (
        <PageSection aria-labelledby="about-people">
          <SectionHeader
            id="about-people"
            title="Contributors"
            description="The people who built the hub and supplied its materials."
          />
          <ul role="list" className="about__people">
            {site.contributors.map((c) => {
              const href = httpsHref(c.url);
              const line = contributorLine(c);
              return (
                <li key={c.id} className="about__person">
                  <Avatar name={c.name} size="lg" decorative />
                  <div>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="about__name">
                        {c.name}
                      </a>
                    ) : (
                      <span className="about__name">{c.name}</span>
                    )}
                    {line ? <p className="about__role">{line}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </PageSection>
      ) : null}

      {site.noteCredits.length ? (
        <PageSection aria-labelledby="about-notes">
          <SectionHeader
            id="about-notes"
            title="Students who shared notes"
            description="Their notes are in the library and on each module’s page."
          />
          <ul role="list" className="about__notes">
            {site.noteCredits.map((p) => (
              <li key={p.id} className="about__note">
                <Avatar name={p.name} size="sm" decorative />
                <span className="about__note-name">{p.name}</span>
                <span className="about__note-mods">
                  {p.modules.map((id, i) => {
                    const m = getModule(id);
                    if (!m) return null;
                    return (
                      <span key={id}>
                        {i > 0 ? ', ' : null}
                        <Link to={notesInLibrary(id)} className="about__note-link">
                          {m.shortName}
                        </Link>
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}

      <PageSection aria-labelledby="about-disclaimer">
        <SectionHeader id="about-disclaimer" title="Disclaimer" />
        <p className="about__disclaimer">{site.disclaimer}</p>
      </PageSection>
    </div>
  );
}

function UsefulLinks({ site }: { site: SiteDoc }) {
  return (
    <Panel padding="none">
      <h2 className="about__aside-title about__aside-title--pad">Useful links</h2>
      <ul role="list" className="about__links">
        {LINK_ICONS.map(({ key, icon }) => {
          const l = site.links[key];
          const href = httpsHref(l.url);
          return href ? (
            <li key={key}>
              <a href={href} target="_blank" rel="noopener noreferrer" className="about__link">
                <Icon glyph={icon} className="about__link-icon" />
                <span className="about__link-text">
                  <span className="about__link-label">{l.label}</span>
                  <span className="about__link-note">{l.note}</span>
                </span>
                <Icon glyph={glyph.external} className="about__link-ext" aria-hidden="true" />
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ) : null;
        })}
      </ul>
    </Panel>
  );
}

export default function AboutPage() {
  const site = useSite();
  const { featureOn, mayTry } = useAuth();
  return (
    <Page>
      <PageHeader title="About DSBA Hub" description={site.data?.aboutIntro} />
      {site.isError ? (
        <QueryError
          error={site.error}
          title="About didn’t load"
          onRetry={() => void site.refetch()}
          retrying={site.isFetching}
        />
      ) : (
        <div className="about">
          {site.data ? (
            <AboutMain site={site.data} />
          ) : (
            <div className="about__main">
              <Skeleton lines={8} />
            </div>
          )}
          <aside className="about__aside" aria-label="Sharing, problems and links">
            {/* Contributing means uploading to the library (decision D6); problems go to the admins as bug reports. */}
            {showsUpload(featureOn, mayTry) ? (
              <Panel padding="md" className="about__contribute">
                <h2 className="about__aside-title">Got a resource to share?</h2>
                <p className="about__aside-body">
                  Notes, past papers or a guide: upload it to the library, and a student rep checks it before it goes
                  up.
                </p>
                <Button
                  variant="primary"
                  to="/library?upload=1"
                  leadingIcon={<Icon glyph={glyph.upload} />}
                  fullWidth
                  data-hub="about-upload"
                >
                  Upload a file
                </Button>
              </Panel>
            ) : null}
            <Panel padding="md" className="about__report">
              <h2 className="about__aside-title">Something wrong with the Hub?</h2>
              <p className="about__aside-body">A broken page, a wrong date or a typo: tell the people who build it.</p>
              <Button
                onClick={openBugReport}
                leadingIcon={<Icon glyph={glyph.bug} />}
                fullWidth
                data-hub="about-report"
              >
                Report a bug
              </Button>
            </Panel>
            {site.data ? <UsefulLinks site={site.data} /> : null}
          </aside>
        </div>
      )}
    </Page>
  );
}
