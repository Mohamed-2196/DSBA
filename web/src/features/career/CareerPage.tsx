import type { CareerDoc } from '../../api/types';
import { useQueryParam, useYear } from '../../state';
import { Button, EmptyState, glyph, Icon, Page, PageHeader, Panel, QueryError, Skeleton } from '../../ui';
import { AfterDsba } from './AfterDsba';
import { useCareer } from './api';
import { Certificates } from './Certificates';
import { CareerContext } from './context';
import { CareerSections, type CareerPart } from './CareerSections';
import { ElectivesLink } from './ElectivesLink';
import { FeaturedCompetition } from './FeaturedCompetition';
import { Opportunities } from './Opportunities';
import { RoleFit } from './RoleFit';
import './CareerPage.css';

const TITLE = 'Career Navigator';

export function CareerBody({ data }: { data: CareerDoc }) {
  const { activeYear } = useYear();
  const [roleParam, setRoleParam] = useQueryParam('role', data.defaultRoleId);
  const role =
    data.roles.find((r) => r.id === roleParam) ?? data.roles.find((r) => r.id === data.defaultRoleId) ?? data.roles[0];
  const parts: CareerPart[] = [
    { id: 'career-opportunities', label: 'Where to apply' },
    ...(data.certs.length ? [{ id: 'career-certificates', label: 'Certificates' }] : []),
    ...(role ? [{ id: 'career-role-fit', label: 'Build the skills' }] : []),
    ...(data.checklist.length || data.furtherStudy ? [{ id: 'career-after', label: 'Before you apply' }] : []),
  ];
  return (
    <CareerContext.Provider value={data}>
      <PageHeader section="tools" title={TITLE} description={data.intro} />
      {data.featured ? <FeaturedCompetition /> : null}
      <CareerSections parts={parts} />
      <Opportunities />
      <Certificates />
      {Object.values(data.chosen).includes('elective') ? <ElectivesLink /> : null}
      {role ? <RoleFit role={role} year={activeYear} onSelect={(id) => setRoleParam(id, { replace: true })} /> : null}
      <AfterDsba />
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
 * Career Navigator. Real employers first (logo, what they offer, one button to their own page), then the
 * certificates, then the skills behind each role, then what to have ready before applying.
 * URL state: ?track= and ?type= filter the employers, ?all=1 unfolds the whole list, ?role= picks the role.
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
