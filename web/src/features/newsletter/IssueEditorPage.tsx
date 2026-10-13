// /newsletter/:slug/edit: student reps edit an issue with forms (decision D5), see editor/Editor.tsx. This page waits
// for the account and the issue, and says so when the person isn't a rep or the issue isn't there.
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { PencilSimple } from '@phosphor-icons/react';
import { isApiError } from '../../api/errors';
import { holdsRole, useAuth } from '../../auth';
import { useDocumentTitle } from '../../state';
import { Button, EmptyState, Page, Panel, QueryError, Skeleton } from '../../ui';
import { useIssueDetail } from './api';
import { Editor } from './editor/Editor';
import './IssuePage.css';
import './IssueEditorPage.css';

function EditorSkeleton() {
  return (
    <Page width="wide" className="nl-editor" aria-busy="true">
      <span className="visually-hidden">Loading the issue</span>
      <div aria-hidden="true">
        <Skeleton width={280} height={40} />
        <Skeleton width="50%" height={18} style={{ marginTop: 12 }} />
        <div className="nl-editor__layout" style={{ marginTop: 32 }}>
          <Skeleton height={520} radius={16} />
          <Skeleton height={520} radius={16} className="nl-editor__skeleton-side" />
        </div>
      </div>
    </Page>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <Page>
      <h1 className="visually-hidden">Edit issue</h1>
      <Panel padding="none">
        <EmptyState icon={PencilSimple} title={title} body={body} action={action} />
      </Panel>
    </Page>
  );
}

export default function IssueEditorPage() {
  const { slug } = useParams();
  const { me, status, isModerator, openSignIn } = useAuth();
  const q = useIssueDetail(isModerator ? slug : undefined);
  useDocumentTitle('Edit issue');

  if (status === 'loading') return <EditorSkeleton />;
  if (!isModerator) {
    // A suspended rep has no powers (as the API decides): say why rather than "only student reps".
    if (me?.status === 'suspended' && holdsRole(me, 'moderator')) {
      return <Notice title="Your account is suspended" body="While it is, you can’t edit the newsletter. Contact an admin." action={<Button to="/newsletter">Go to the newsletter</Button>} />;
    }
    return status === 'guest' ? (
      <Notice
        title="Only student reps can edit the newsletter"
        body="If you’re a student rep, sign in first."
        action={
          <Button variant="primary" onClick={() => openSignIn({ reason: 'Sign in to edit the newsletter' })}>
            Sign in
          </Button>
        }
      />
    ) : (
      <Notice title="Only student reps can edit the newsletter" body="You can read every published issue on the newsletter page." action={<Button to="/newsletter">Go to the newsletter</Button>} />
    );
  }
  if (q.isPending) return <EditorSkeleton />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return <Notice title="We couldn’t find that issue" body="It may have been deleted, or its address changed." action={<Button to="/newsletter">See all issues</Button>} />;
    }
    return (
      <Page>
        <h1 className="visually-hidden">Edit issue</h1>
        <QueryError error={q.error} title="The issue didn’t load" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      </Page>
    );
  }
  return <Editor key={q.data.id} detail={q.data} />;
}
