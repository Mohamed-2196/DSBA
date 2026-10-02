import { useState } from 'react';
import { ChatsCircle } from '@phosphor-icons/react';
import { useQueryParam, useYear } from '../../state';
import { Button, CohortBadge, Page, PageHeader } from '../../ui';
import { YEAR_HINTS } from './data/afterDsba.js';
import { DEFAULT_ROLE_ID, getRole } from './data/roles.js';
import { jumpTo } from './lib/jump.js';
import { AfterDsba } from './AfterDsba.jsx';
import { Certificates } from './Certificates.jsx';
import { Opportunities } from './Opportunities.jsx';
import { RoleFit } from './RoleFit.jsx';
import { Seniors } from './Seniors.jsx';
import './CareerPage.css';

/**
 * Career Navigator. Role fit comes first (the picked role is in the URL: ?role=risk-analyst), and the role also
 * decides which certificates are marked "Fits". Deadlines on the board count from one `now` per visit.
 */
export default function CareerPage() {
  const { activeYear } = useYear();
  const [roleParam, setRoleParam] = useQueryParam('role', DEFAULT_ROLE_ID);
  const role = getRole(roleParam) || getRole(DEFAULT_ROLE_ID);
  const [now] = useState(() => new Date());

  return (
    <Page width="wide" className="career-page">
      <PageHeader
        title="Career Navigator"
        description="What comes after DSBA, and what to do about it now."
        meta={
          <>
            <CohortBadge year={activeYear} />
            <span className="career-hint">{YEAR_HINTS[activeYear]}</span>
          </>
        }
        actions={
          <Button variant="secondary" leadingIcon={ChatsCircle} onClick={() => jumpTo('career-seniors')}>
            Ask a senior
          </Button>
        }
      />

      <RoleFit role={role} year={activeYear} onSelect={(id) => setRoleParam(id, { replace: true })} />
      <Opportunities now={now} year={activeYear} />
      <Certificates role={role} />
      <AfterDsba />
      <Seniors />
    </Page>
  );
}
