// /newsletter/:slug/edit: people with the newsletter.manage box edit an issue with forms (decision D5), see
// editor/Editor.tsx. The Gate waits for the account and turns away everyone else; this page waits for the issue.
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { PencilSimple } from '@phosphor-icons/react';
import { isApiError } from '../../api/errors';
import { Gate } from '../../auth';
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

/** The editor itself, behind the Gate: only someone with newsletter.manage gets here. */
function IssueEditor({ slug }: { slug: string | undefined }) {
  const q = useIssueDetail(slug);
  if (q.isPending) return <EditorSkeleton />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <Notice
          title="We couldn’t find that issue"
          body="It may have been deleted, or its address changed."
          action={<Button to="/newsletter">See all issues</Button>}
        />
      );
    }
    return (
      <Page>
        <h1 className="visually-hidden">Edit issue</h1>
        <QueryError
          error={q.error}
          title="The issue didn’t load"
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      </Page>
    );
  }
  return <Editor key={q.data.id} detail={q.data} />;
}

export default function IssueEditorPage() {
  const { slug } = useParams();
  useDocumentTitle('Edit issue');
  return (
    <Gate title="Edit issue" box="newsletter.manage">
      <IssueEditor slug={slug} />
    </Gate>
  );
}
