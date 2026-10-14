import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { normalizeYear } from '../../state';
import { Button, PageSection, Panel, SectionHeader, timeAgo } from '../../ui';
import { useModules } from '../../state/modules';
import { useHelpBelow } from './api';
import { ModuleTag, PlaceBadge } from './components/ThreadBits';
import { yearsBelow } from './lib/helpBelow';
import './components/forum.css';
import './HotThreads.css';

/**
 * Home's "Help the year below": for a signed-in Year 2 or Year 3 student, up to three unanswered questions
 * from the years below, newest first. Nothing at all while there are none, while it loads or when it fails: it's an
 * invitation, not a feed.
 */
export function HelpBelow() {
  const { me, status, featureOn, mayTry } = useAuth();
  const { getModule } = useModules();
  const years = status === 'signed-in' ? yearsBelow(normalizeYear(me?.year)) : [];
  const on = featureOn('forum') && featureOn('forum.help-below') && years.length > 0;
  const below = useHelpBelow({ years, enabled: on });
  if (!on || !below.data?.length) return null;
  const who = years.length > 1 ? 'Years 1 and 2' : 'Year 1';
  const all = years.length > 1 ? '/forum?status=no-replies&sort=new' : '/forum?cohort=year-1&status=no-replies&sort=new';
  return (
    <PageSection className="home-sec home-sec--below" aria-labelledby="home-below" data-hub="help-below">
      <SectionHeader
        id="home-below"
        title="Help the year below"
        action={
          <Button variant="ghost" size="sm" to={all}>
            All unanswered
          </Button>
        }
      />
      <Panel as="div" padding="none" className="forum-hot">
        <p className="forum-below__lead">{mayTry('forum.post') ? `Questions from ${who} nobody has answered yet. You’ve been there.` : `Questions from ${who} nobody has answered yet.`}</p>
        <ol role="list" className="forum-hot__list">
          {below.data.map((t) => (
            <li key={t.id} className="forum-hot__row forum-below__row" data-thread-id={t.id}>
              <div className="forum-hot__main">
                <p className="forum-hot__title" dir="auto">
                  <Link to={`/forum/${t.slug}`} className="forum-hot__link">
                    {t.title}
                  </Link>
                </p>
                <div className="forum-hot__meta">
                  {t.moduleId && getModule(t.moduleId) ? <ModuleTag module={getModule(t.moduleId)} /> : <PlaceBadge thread={t} />}
                  <time dateTime={t.createdAt}>{timeAgo(t.createdAt)}</time>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </PageSection>
  );
}
