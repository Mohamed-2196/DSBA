// Pages for some people only: a sign-in prompt for guests, "switched off" when the feature is off, "suspended" for a
// suspended account that holds the role the page needs, and a polite "not for you" otherwise.
import type { ReactNode } from 'react';
import { PageLoader } from '../shell/PageLoader';
import { Button, EmptyState, Icon, Page, PageHeader, Panel, glyph } from '../ui';
import type { Box, Feature } from './access';
import { holdsAdmin } from './access';
import { useAuth } from './useAuth';

export interface GateProps {
  title: string;
  description?: string;
  /** the page needs this box */
  box?: Box;
  /** the page needs at least one of these boxes */
  anyBox?: readonly Box[];
  /** the page belongs to this feature */
  feature?: Feature;
  /** the page is for admins */
  admin?: true;
  /** the page needs an account and nothing more */
  signedIn?: true;
  children: ReactNode;
}

function Notice({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Page width="narrow">
      <PageHeader title={title} description={description} />
      <Panel padding="none">{children}</Panel>
    </Page>
  );
}

const home = (
  <Button to="/" leadingIcon={<Icon glyph={glyph.home} />}>
    Go to Home
  </Button>
);

export function SwitchedOff({ title }: { title: string }) {
  return (
    <Notice title={title}>
      <EmptyState
        icon={<Icon glyph={glyph.info} />}
        title="This part of the hub is switched off right now."
        body="Come back later, or carry on from Home."
        action={home}
      />
    </Notice>
  );
}

export function Gate({ title, description, box, anyBox, feature, admin, signedIn, children }: GateProps) {
  const { me, status, can, featureOn, isAdmin, openSignIn } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (feature && !featureOn(feature)) return <SwitchedOff title={title} />;
  const needsAccount = !!(box || anyBox || admin || signedIn);
  if (!needsAccount) return <>{children}</>;
  if (!me || me.needsProfile) {
    return (
      <Notice title={title} description={description}>
        <EmptyState
          icon={<Icon glyph={glyph.signIn} />}
          title="Sign in to see this page"
          body="It’s here once you’re signed in."
          action={
            <Button
              variant="primary"
              leadingIcon={<Icon glyph={glyph.signIn} />}
              onClick={() => openSignIn({ reason: `Sign in to see ${title.toLowerCase()}` })}
            >
              Sign in
            </Button>
          }
        />
      </Notice>
    );
  }
  const allowed = (!admin || isAdmin) && (!box || can(box)) && (!anyBox || anyBox.some((b) => can(b)));
  if (allowed) return <>{children}</>;
  if (me.status === 'suspended' && (admin ? holdsAdmin(me) : me.roles.some((r) => r.slug !== 'student'))) {
    return (
      <Notice title={title} description={description}>
        <EmptyState
          icon={<Icon glyph={glyph.error} />}
          title="Your account is suspended"
          body="While it is, this page isn’t available to you. Contact an admin."
          action={home}
        />
      </Notice>
    );
  }
  return (
    <Notice title={title} description={description}>
      <EmptyState
        icon={<Icon glyph={glyph.lock} />}
        title="This page isn’t on your account"
        body="If you think you need it, ask an admin."
        action={home}
      />
    </Notice>
  );
}
