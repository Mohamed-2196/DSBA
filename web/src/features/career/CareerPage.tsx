import { Compass, WarningCircle } from '@phosphor-icons/react';
import { useQueryParam, useYear } from '../../state';
import { Button, EmptyState, Page, PageHeader, Panel, Skeleton } from '../../ui';
import { AfterDsba } from './AfterDsba';
import { useCareer } from './api';
import { Certificates } from './Certificates';
import { CareerContext } from './context';
import { FeaturedCompetition, Opportunities } from './Opportunities';
import { RoleFit } from './RoleFit';
import type { CareerData } from './types';
import './CareerPage.css';

const TITLE = 'Career Navigator';
const DESCRIPTION = 'Graduate programmes, internships and careers pages at employers in Bahrain.';

function CareerBody({ data }: { data: CareerData }) {
  const { activeYear } = useYear();
  const [roleParam, setRoleParam] = useQueryParam('role', data.defaultRoleId);
  const role = data.roles.find((r) => r.id === roleParam) ?? data.roles.find((r) => r.id === data.defaultRoleId) ?? data.roles[0];
  return (
    <CareerContext.Provider value={data}>
      <PageHeader title={TITLE} description={DESCRIPTION} actions={data.featured ? <FeaturedCompetition /> : null} />
      <Opportunities />
      <Certificates />
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
    <Page width="wide" className="career-page">
      {q.isPending ? (
        <>
          <PageHeader title={TITLE} description={DESCRIPTION} />
          <CareerSkeleton />
        </>
      ) : q.isError ? (
        <>
          <PageHeader title={TITLE} description={DESCRIPTION} />
          <Panel padding="none">
            <EmptyState
              icon={WarningCircle}
              title="Career Navigator didn’t load"
              body="Check your connection, then try again."
              action={
                <Button onClick={() => void q.refetch()} loading={q.isFetching}>
                  Try again
                </Button>
              }
            />
          </Panel>
        </>
      ) : q.data ? (
        <CareerBody data={q.data} />
      ) : (
        <>
          <PageHeader title={TITLE} description={DESCRIPTION} />
          <Panel padding="none">
            <EmptyState icon={Compass} title="Career Navigator is being set up" body="Employers, certificates and the skills behind each role will show here soon." action={<Button to="/">Back to Home</Button>} />
          </Panel>
        </>
      )}
    </Page>
  );
}
