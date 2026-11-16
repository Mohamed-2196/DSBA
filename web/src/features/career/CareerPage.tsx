import { useCallback, useEffect, useRef } from 'react';
import type { CareerDoc } from '../../api/types';
import { useQueryParam, useYear } from '../../state';
import { Button, EmptyState, glyph, Icon, Page, PageHeader, Panel, QueryError, Skeleton } from '../../ui';
import { useAuth } from '../../auth';
import { AfterDsba } from './AfterDsba';
import { Postgraduates } from './Postgraduates';
import { useCareer } from './api';
import { Certificates } from './Certificates';
import { CareerContext } from './context';
import { CareerPartPanel, CareerSections, type CareerPart } from './CareerSections';
import { CvRater } from './CvRater';
import { ElectivesLink } from './ElectivesLink';
import { SHOW_PART_EVENT, jumpTo, type ShowPart } from './lib/jump';
import { Opportunities } from './Opportunities';
import { RoleFit } from './RoleFit';
import './CareerPage.css';

const TITLE = 'Career Navigator';

export function CareerBody({ data }: { data: CareerDoc }) {
  const { activeYear } = useYear();
  const { featureOn } = useAuth();
  const [roleParam, setRoleParam] = useQueryParam('role', data.defaultRoleId);
  const role =
    data.roles.find((r) => r.id === roleParam) ?? data.roles.find((r) => r.id === data.defaultRoleId) ?? data.roles[0];
  const parts: CareerPart[] = [
    { id: 'vacancies', label: 'Vacancies' },
    ...(data.certs.length ? [{ id: 'certificates', label: 'Certificates' }] : []),
    ...(role ? [{ id: 'skills', label: 'Build the skills' }] : []),
    ...(data.checklist.length ? [{ id: 'before', label: 'Before you apply' }] : []),
    ...(featureOn('career.cv') && data.roles.length ? [{ id: 'cv', label: 'Rate my CV' }] : []),
    ...(data.furtherStudy ? [{ id: 'postgrad', label: 'Postgraduates' }] : []),
  ];
  // A link that picks a role (?role=) opens Build the skills.
  const [partParam, setPart] = useQueryParam('part');
  const asked = partParam ?? (roleParam !== data.defaultRoleId ? 'skills' : 'vacancies');
  const part = parts.some((p) => p.id === asked) ? asked : 'vacancies';

  const show = useCallback(
    (id: string) => {
      setPart(id === 'vacancies' ? null : id, { replace: true });
      // A part starts at its top, under the tabs.
      window.scrollTo({ top: 0 });
    },
    [setPart],
  );
  // A button in one part that points at something in another (a certificate from a skill) asks for that part, and
  // the jump happens once the part has rendered.
  const pending = useRef<ShowPart | null>(null);
  useEffect(() => {
    const onAsk = (e: Event) => {
      const ask = (e as CustomEvent<ShowPart>).detail;
      pending.current = ask;
      setPart(ask.part === 'vacancies' ? null : ask.part, { replace: true });
    };
    window.addEventListener(SHOW_PART_EVENT, onAsk);
    return () => window.removeEventListener(SHOW_PART_EVENT, onAsk);
  }, [setPart]);
  useEffect(() => {
    const ask = pending.current;
    if (ask?.part !== part) return;
    pending.current = null;
    jumpTo(ask.id, ask);
  }, [part]);

  return (
    <CareerContext.Provider value={data}>
      <h1 className="visually-hidden">{TITLE}</h1>
      <CareerSections parts={parts} current={part} onSelect={show} />
      <CareerPartPanel id="vacancies" current={part}>
        <Opportunities />
      </CareerPartPanel>
      <CareerPartPanel id="certificates" current={part}>
        <Certificates />
        {Object.values(data.chosen).includes('elective') ? <ElectivesLink /> : null}
      </CareerPartPanel>
      {role ? (
        <CareerPartPanel id="skills" current={part}>
          <RoleFit role={role} year={activeYear} onSelect={(id) => setRoleParam(id, { replace: true })} />
        </CareerPartPanel>
      ) : null}
      <CareerPartPanel id="before" current={part}>
        <AfterDsba />
      </CareerPartPanel>
      {parts.some((p) => p.id === 'cv') ? (
        <CareerPartPanel id="cv" current={part}>
          <CvRater />
        </CareerPartPanel>
      ) : null}
      <CareerPartPanel id="postgrad" current={part}>
        <Postgraduates />
      </CareerPartPanel>
    </CareerContext.Provider>
  );
}

function CareerSkeleton() {
  return (
    <div aria-busy="true">
      <span className="visually-hidden">Loading Career Navigator</span>
      <div className="career-skeleton" aria-hidden="true">
        <Skeleton height={40} width="60%" />
        <div className="career-skeleton__grid">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={260} radius={16} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Career Navigator, one part at a time under its tabs: the vacancies (employers, searched and filtered), the
 * certificates, the skills behind each role, what to have ready before applying, Rate my CV, and master's courses
 * and scholarships for postgraduates.
 * URL state: ?part= the tab (certificates, skills, before, cv, postgrad), ?q=, ?type=, ?track=, ?sector=, ?sort= and ?all=1 for the
 * vacancies, ?role= the role (which opens Build the skills).
 */
export default function CareerPage() {
  const q = useCareer();
  return (
    <Page width="wide" className="career-page" data-section="tools">
      {q.isPending ? (
        <>
          <PageHeader section="tools" title={TITLE} />
          <CareerSkeleton />
        </>
      ) : q.isError ? (
        <>
          <PageHeader section="tools" title={TITLE} />
          <QueryError
            error={q.error}
            title="Career Navigator didn’t load"
            onRetry={() => void q.refetch()}
            retrying={q.isFetching}
          />
        </>
      ) : q.data ? (
        <CareerBody data={q.data} />
      ) : (
        <>
          <PageHeader section="tools" title={TITLE} />
          <Panel padding="none">
            <EmptyState
              icon={<Icon glyph={glyph.career} />}
              title="Career Navigator is being set up"
              body="Employers, certificates and the skills behind each role will show here soon."
              action={<Button to="/">Back to Home</Button>}
            />
          </Panel>
        </>
      )}
    </Page>
  );
}
