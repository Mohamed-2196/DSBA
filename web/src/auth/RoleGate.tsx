// Pages for some people only (moderation, people, editors): a sign-in prompt for guests and a polite
// "not for you" for everyone else, instead of a crash or an empty page.
import type { ReactNode } from 'react';
import { House, ShieldCheck, SignIn, WarningCircle } from '@phosphor-icons/react';
import { PageLoader } from '../shell/PageLoader';
import { Button, EmptyState, Page, PageHeader, Panel } from '../ui';
import { useAuth } from './useAuth';

export type Need = 'signed-in' | 'moderator' | 'admin';

export interface RoleGateProps {
  need: Need;
  /** the page's title, kept in the header of the notice */
  title: string;
  description?: string;
  children: ReactNode;
}

const FOR_WHOM: Record<Exclude<Need, 'signed-in'>, string> = {
  moderator: 'This page is for student reps',
  admin: 'This page is for admins',
};

function Notice({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Page width="narrow">
      <PageHeader title={title} description={description} />
      <Panel padding="none">{children}</Panel>
    </Page>
  );
}

export function RoleGate({ need, title, description, children }: RoleGateProps) {
  const { me, status, isModerator, isAdmin, openSignIn } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (!me || me.needsProfile) {
    return (
      <Notice title={title} description={description}>
        <EmptyState
          icon={SignIn}
          title={need === 'signed-in' ? 'Sign in to see this page' : 'Sign in to continue'}
          body={need === 'signed-in' ? 'It’s here once you’re signed in.' : need === 'admin' ? 'This page is for admins.' : 'This page is for student reps and admins.'}
          action={
            <Button variant="primary" leadingIcon={SignIn} onClick={() => openSignIn({ reason: `Sign in to see ${title.toLowerCase()}` })}>
              Sign in
            </Button>
          }
        />
      </Notice>
    );
  }
  if (need === 'signed-in') return <>{children}</>;
  const allowed = need === 'admin' ? isAdmin : isModerator;
  if (!allowed) {
    return (
      <Notice title={title} description={description}>
        <EmptyState
          icon={ShieldCheck}
          title={FOR_WHOM[need]}
          body="It isn’t available on your account. If you think you need it, ask an admin."
          action={
            <Button to="/" leadingIcon={House}>
              Go to Home
            </Button>
          }
        />
      </Notice>
    );
  }
  if (me.status === 'suspended') {
    return (
      <Notice title={title} description={description}>
        <EmptyState
          icon={WarningCircle}
          title="Your account is suspended"
          body="While it is, this page isn’t available to you. Contact an admin."
          action={
            <Button to="/" leadingIcon={House}>
              Go to Home
            </Button>
          }
        />
      </Notice>
    );
  }
  return <>{children}</>;
}
