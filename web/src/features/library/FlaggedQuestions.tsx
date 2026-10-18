// Manage → Uploads, for library managers: question tags students said were wrong. Keep the tag (its flags go) or
// remove it. Renders nothing while none is flagged or the feature is off.
import { Check, Trash } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { Button, Panel } from '../../ui';
import { useLibraryAccess } from './access';
import { questionHref, questionLabel, useFlaggedQuestions, useKeepQuestion, useRemoveQuestion } from './papers';
import './FlaggedQuestions.css';

export function FlaggedQuestions() {
  const { featureOn } = useAuth();
  const { moderator } = useLibraryAccess();
  const on = moderator && featureOn('library') && featureOn('library.questions');
  const flagged = useFlaggedQuestions({ enabled: on });
  const keep = useKeepQuestion();
  const remove = useRemoveQuestion();
  const { push } = useToast();
  if (!on || !flagged.data?.length) return null;
  const failed = (title: string) => (e: unknown) => push({ title, body: errorMessage(e), tone: 'alert' });
  return (
    <section className="lib-flagged" aria-labelledby="lib-flagged-h" data-hub="flagged-questions">
      <h2 id="lib-flagged-h" className="lib-flagged__h">
        Question tags flagged as wrong
      </h2>
      <Panel as="div" padding="none">
        <ul role="list" className="lib-flagged__list">
          {flagged.data.map((t) => (
            <li key={t.id} className="lib-flagged__row">
              <p className="lib-flagged__text">
                <Link to={questionHref(t)}>
                  {t.paper.title}, {questionLabel(t)}
                </Link>{' '}
                tagged <strong>{t.chapterTitle}</strong>. Flagged by {t.flagCount ?? 0}.
              </p>
              <span className="lib-flagged__acts">
                <Button
                  size="sm"
                  leadingIcon={Check}
                  onClick={() => keep.mutate({ id: t.id }, { onError: failed('Couldn’t keep the tag') })}
                  disabled={keep.isPending}
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  leadingIcon={Trash}
                  onClick={() => remove.mutate({ id: t.id }, { onError: failed('Couldn’t remove the tag') })}
                  disabled={remove.isPending}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
