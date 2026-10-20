// /admin/access (admins): roles and their boxes, people's roles, the feature switches, and the activity log.
import { Gate } from '../../auth';
import { useQueryParam } from '../../state';
import { ErrorBoundary, glyph, Icon, Page, PageHeader, TabPanel, Tabs } from '../../ui';
import { ActivityLog } from './ActivityLog';
import { FeaturesTab } from './FeaturesTab';
import { PeopleList } from './PeopleList';
import { RolesTab } from './RolesTab';
import './AccessPage.css';

const TABS = [
  { id: 'roles', label: 'Roles', icon: <Icon glyph={glyph.lock} /> },
  { id: 'people', label: 'People', icon: <Icon glyph={glyph.user} /> },
  { id: 'features', label: 'Features', icon: <Icon glyph={glyph.settings} /> },
  { id: 'activity', label: 'Activity', icon: <Icon glyph={glyph.clock} /> },
];

function AccessScreen() {
  const [param, setTab] = useQueryParam('tab', 'roles');
  const tab = TABS.some((t) => t.id === param) ? param : 'roles';
  return (
    <Page className="access">
      <PageHeader
        section="tools"
        title="Access"
        description="Who can do what, and which features are on. Every change is logged under Activity."
      />
      <Tabs
        idBase="access"
        tabs={TABS}
        value={tab}
        onChange={(id) => setTab(id, { replace: true })}
        label="Access"
        className="access-tabs"
      />
      <TabPanel idBase="access" id="roles" value={tab} className="access-panel">
        <ErrorBoundary name="Access:roles">
          <RolesTab />
        </ErrorBoundary>
      </TabPanel>
      <TabPanel idBase="access" id="people" value={tab} className="access-panel">
        <ErrorBoundary name="Access:people">
          <PeopleList withRoles />
        </ErrorBoundary>
      </TabPanel>
      <TabPanel idBase="access" id="features" value={tab} className="access-panel">
        <ErrorBoundary name="Access:features">
          <FeaturesTab />
        </ErrorBoundary>
      </TabPanel>
      <TabPanel idBase="access" id="activity" value={tab} className="access-panel">
        <ErrorBoundary name="Access:activity">
          <ActivityLog />
        </ErrorBoundary>
      </TabPanel>
    </Page>
  );
}

export default function AccessPage() {
  return (
    <Gate title="Access" admin>
      <AccessScreen />
    </Gate>
  );
}
