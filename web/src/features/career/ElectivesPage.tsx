// /career/electives: the Year 3 electives side by side. What each covers comes from the module catalogue, the skills
// and roles from Career Navigator's document (lib/electives.ts), what students say from the forum's Module choice
// threads. The only words written here are in data/guides.ts (ELECTIVES).
import { ArrowLeft, ChatsCircle, Files, Info, Plus, Sparkle } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CareerDoc } from '../../api/types';
import { useAuth } from '../../auth';
import { ELECTIVES } from '../../data/guides';
import { PapersButton } from '../papers/public';
import { useModules } from '../../state/modules';
import { Badge, Button, EmptyState, ModuleIcon, Page, PageHeader, Panel, QueryError, Skeleton } from '../../ui';
import { useStartsThreads } from '../forum/public';
import { useCareer } from './api';
import { askLink } from './lib/links';
import { electives, type Elective } from './lib/electives';
import './Electives.css';

const TITLE = 'Choosing your Year 3 electives';
const FORUM_TAG = 'module-choice';

const numberWord = (n: number): string => ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n);

function ElectiveCard({ e, depthLabel }: { e: Elective; depthLabel: CareerDoc['depthLabel'] }) {
  const { featureOn } = useAuth();
  const startsThreads = useStartsThreads();
  const { module: m } = e;
  const headingId = `elective-${m.id}`;
  return (
    <Panel as="article" padding="none" radius="feature" className="elective" aria-labelledby={headingId} data-hub="elective" data-module-id={m.id}>
      <header className="elective__head">
        <span className="elective__plate" aria-hidden="true">
          <ModuleIcon moduleId={m.id} weight="duotone" />
        </span>
        <h2 id={headingId} className="elective__name">
          <Link to={`/modules/${encodeURIComponent(m.id)}`}>{m.name}</Link>
        </h2>
        <p className="elective__desc">{m.description}</p>
      </header>

      <section className="elective__part" aria-label={`Skills ${m.shortName} builds`}>
        <h3 className="elective__label">
          <Sparkle weight="fill" aria-hidden="true" />
          Skills it builds
        </h3>
        {e.skills.length ? (
          <ul role="list" className="elective__skills">
            {e.skills.map((s) => (
              <li key={s.id} className="elective__skill">
                <span className="elective__skill-name">
                  {s.name}
                  <Badge size="sm" tone="outline">
                    {depthLabel[String(s.depth)] ?? ''}
                  </Badge>
                  {s.adds ? (
                    <Badge size="sm" tone="highlight">
                      Beyond the core
                    </Badge>
                  ) : null}
                </span>
                <span className="elective__skill-what">{s.what}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="elective__none">Career Navigator doesn’t list its skills yet.</p>
        )}
      </section>

      {e.roles.length ? (
        <section className="elective__part" aria-label={`Roles ${m.shortName} leads to`}>
          <h3 className="elective__label">Leads to</h3>
          <ul role="list" className="elective__roles">
            {e.roles.map((r) => (
              <li key={r.id}>
                <Link to={`/career?role=${encodeURIComponent(r.id)}`} className="elective__role">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="elective__foot">
        {featureOn('forum') ? (
          <Link to={`/forum?tag=${FORUM_TAG}&module=${encodeURIComponent(m.id)}`} className="elective__link" data-hub="elective-threads">
            <ChatsCircle weight="bold" aria-hidden="true" />
            What students say
          </Link>
        ) : null}
        {startsThreads ? (
          <Link to={`${askLink(`Is ${m.name} a good elective?`)}&module=${encodeURIComponent(m.id)}`} className="elective__link">
            <Plus weight="bold" aria-hidden="true" />
            Ask about it
          </Link>
        ) : null}
        {featureOn('library') ? (
          <Link to={`/library?module=${encodeURIComponent(m.id)}`} className="elective__link">
            <Files weight="bold" aria-hidden="true" />
            Files
          </Link>
        ) : null}
      </footer>
    </Panel>
  );
}

function ElectivesBody({ data }: { data: CareerDoc }) {
  const { modules } = useModules();
  const list = useMemo(() => electives(data, modules), [data, modules]);
  if (!list.length) {
    return (
      <Panel padding="none">
        <EmptyState icon={Sparkle} title="No electives listed yet" body="They will show here once Career Navigator lists them." action={<Button to="/career">Back to Career Navigator</Button>} />
      </Panel>
    );
  }
  return (
    <>
      <div className="electives__count">
        <p>You take {numberWord(ELECTIVES.pick)} of these {numberWord(list.length)}.</p>
        <PapersButton />
      </div>
      <div className="electives" data-hub="electives">
        {list.map((e) => (
          <ElectiveCard key={e.module.id} e={e} depthLabel={data.depthLabel} />
        ))}
      </div>
    </>
  );
}

export default function ElectivesPage() {
  const q = useCareer();
  return (
    <Page width="wide" className="electives-page">
      <PageHeader
        title={TITLE}
        description={ELECTIVES.intro}
        actions={
          <Button variant="ghost" size="sm" to="/career" leadingIcon={ArrowLeft}>
            Career Navigator
          </Button>
        }
      />
      <Panel tone="inset" padding="none" className="electives__note" role="note">
        <Info weight="bold" aria-hidden="true" />
        <p>{ELECTIVES.disclaimer}</p>
      </Panel>
      {q.isPending ? (
        <div className="electives" aria-busy="true">
          <span className="visually-hidden">Loading the electives</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={420} radius={24} />
          ))}
        </div>
      ) : q.isError ? (
        <QueryError error={q.error} title="The electives didn’t load" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.data ? (
        <ElectivesBody data={q.data} />
      ) : (
        <Panel padding="none">
          <EmptyState icon={Sparkle} title="Career Navigator is being set up" body="The electives will show here once it is." action={<Button to="/">Back to Home</Button>} />
        </Panel>
      )}
    </Page>
  );
}
