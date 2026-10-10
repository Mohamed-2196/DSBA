import { useQueryParam, useYear } from '../../state';
import { Page, PageHeader } from '../../ui';
import { DEFAULT_ROLE_ID, getRole } from './data/roles';
import { AfterDsba } from './AfterDsba';
import { Certificates } from './Certificates';
import { FeaturedCompetition, Opportunities } from './Opportunities';
import { RoleFit } from './RoleFit';
import './CareerPage.css';

/**
 * Career Navigator. Real employers first (logo, what they offer, one button to their own page), then the
 * certificates, then the skills behind each role, then what to have ready before applying.
 * URL state: ?track= and ?type= filter the employers, ?all=1 unfolds the whole list, ?role= picks the role.
 */
export default function CareerPage() {
  const { activeYear } = useYear();
  const [roleParam, setRoleParam] = useQueryParam('role', DEFAULT_ROLE_ID);
  const role = getRole(roleParam) || getRole(DEFAULT_ROLE_ID);

  return (
    <Page width="wide" className="career-page">
      <PageHeader
        title="Career Navigator"
        description="Graduate programmes, internships and careers pages at employers in Bahrain."
        actions={<FeaturedCompetition />}
      />

      <Opportunities />
      <Certificates />
      <RoleFit role={role} year={activeYear} onSelect={(id) => setRoleParam(id, { replace: true })} />
      <AfterDsba />
    </Page>
  );
}
