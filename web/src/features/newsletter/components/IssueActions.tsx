// Moderators' actions on an issue: publish (it reaches everyone, so it asks first) and delete.
import { useState } from 'react';
import { PaperPlaneTilt, Trash } from '@phosphor-icons/react';
import { errorMessage } from '../../../api/errors';
import { useToast } from '../../../state';
import { Button, IconButton, type ButtonSize } from '../../../ui';
import { useDeleteIssue, usePublishIssue } from '../api';
import { issueNo } from '../lib/text';
import { ConfirmDialog } from './ConfirmDialog';

interface ActionIssue {
  id: string;
  slug: string;
  number: number;
  title: string;
}

export function PublishButton({ issue, size = 'md', onPublished }: { issue: ActionIssue; size?: ButtonSize; onPublished?: () => void }) {
  const { push } = useToast();
  const publish = usePublishIssue();
  const [asking, setAsking] = useState(false);
  const no = issueNo(issue.number);
  const confirm = () =>
    publish.mutate(
      { id: issue.id, slug: issue.slug },
      {
        onSuccess: () => {
          setAsking(false);
          push({ tone: 'success', title: `Issue ${no} is out`, body: 'It’s on the newsletter page, and everyone who wants newsletter notifications has been told.' });
          onPublished?.();
        },
      },
    );
  return (
    <>
      <Button
        variant="primary"
        size={size}
        leadingIcon={PaperPlaneTilt}
        onClick={() => {
          publish.reset();
          setAsking(true);
        }}
        data-hub="issue-publish"
      >
        Publish
      </Button>
      <ConfirmDialog
        open={asking}
        title={`Publish issue ${no}?`}
        body={
          <>
            <p>
              <b>{issue.title}</b> goes on the newsletter page for everyone to read.
            </p>
            <p>Everyone who hasn’t turned off newsletter news gets a notification straight away. Check the issue once more before you publish.</p>
          </>
        }
        confirmLabel="Publish and notify everyone"
        busy={publish.isPending}
        error={publish.isError ? errorMessage(publish.error, 'The issue wasn’t published. Try again.') : null}
        onConfirm={confirm}
        onClose={() => setAsking(false)}
      />
    </>
  );
}

export function DeleteIssueButton({ issue, iconOnly = false, size = 'md', onDeleted }: { issue: ActionIssue; iconOnly?: boolean; size?: ButtonSize; onDeleted?: () => void }) {
  const { push } = useToast();
  const remove = useDeleteIssue();
  const [asking, setAsking] = useState(false);
  const no = issueNo(issue.number);
  const open = () => {
    remove.reset();
    setAsking(true);
  };
  const confirm = () =>
    remove.mutate(
      { id: issue.id, slug: issue.slug },
      {
        onSuccess: () => {
          setAsking(false);
          push({ tone: 'success', title: `Issue ${no} deleted`, body: `“${issue.title}” is gone, with its reactions.` });
          onDeleted?.();
        },
      },
    );
  return (
    <>
      {iconOnly ? (
        <IconButton label={`Delete issue ${no}`} icon={Trash} variant="secondary" size={size} tooltip onClick={open} data-hub="issue-delete" />
      ) : (
        <Button variant="ghost" size={size} leadingIcon={Trash} onClick={open} data-hub="issue-delete">
          Delete
        </Button>
      )}
      <ConfirmDialog
        open={asking}
        title={`Delete issue ${no}?`}
        body={
          <p>
            <b>{issue.title}</b> and its reactions are deleted for good. This can’t be undone.
          </p>
        }
        confirmLabel="Delete issue"
        tone="danger"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, 'The issue wasn’t deleted. Try again.') : null}
        onConfirm={confirm}
        onClose={() => setAsking(false)}
      />
    </>
  );
}
