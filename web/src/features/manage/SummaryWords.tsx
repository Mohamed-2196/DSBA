// Manage → Sunday summary, its words (summary.share): the subject line, the headings, the line before the closing
// link, and the time on Sunday it goes out. Saved together from the version loaded (summary_changed when someone else
// saved first). Every save goes to the activity log with what changed, before and after.
import { useMemo, useState } from 'react';
import { errorMessage, isApiError } from '../../api/errors';
import type { SummaryEditable, SummaryWords as Words } from '../../api/types';
import { cohortLabel, useToast, YEARS, type CohortYear } from '../../state';
import {
  DocFrame,
  Drawer,
  Panel,
  QueryError,
  SegmentedControl,
  Skeleton,
  TextField,
  docErrors,
  type DocProblem,
} from '../../ui';
import { useReloadSummaryWords, useSaveSummaryWords, useSummaryDraft, useSummaryWords } from './api';

const HEADINGS: { key: keyof Words['headings']; label: string; hint: string }[] = [
  { key: 'calendar', label: 'Above the week’s dates', hint: 'Its exams, mocks and deadlines.' },
  { key: 'library', label: 'Above the new files', hint: 'Files added to the year’s modules in the last seven days.' },
  { key: 'forum', label: 'Above the open questions', hint: 'The year’s questions nobody has answered yet.' },
  { key: 'newsletter', label: 'Above the newsletter', hint: 'An issue published in the last seven days.' },
];

export function SummaryWords({ defaultYear }: { defaultYear: CohortYear | null }) {
  const query = useSummaryWords();
  // Once loaded, the editor keeps its own copy: a refetch in the background never replaces the draft.
  if (query.data) return <Editor first={query.data} defaultYear={defaultYear} />;
  if (query.isError)
    return (
      <QueryError
        error={query.error}
        title="The summary’s words didn’t load"
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        size="sm"
      />
    );
  return (
    <Panel padding="md">
      <Skeleton lines={6} />
    </Panel>
  );
}

function Editor({ first, defaultYear }: { first: SummaryEditable; defaultYear: CohortYear | null }) {
  // The version the draft is edited from: the one first loaded, then each one a save returns or "Load it again" loads.
  const [loaded, setLoaded] = useState(first);
  const saved = loaded.data;
  const [words, setWords] = useState<Words>(saved);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<DocProblem | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [year, setYear] = useState<CohortYear>(defaultYear ?? 1);
  const save = useSaveSummaryWords();
  const reload = useReloadSummaryWords();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(words) !== JSON.stringify(saved), [words, saved]);
  const draft = useSummaryDraft(year, words, previewing);
  const err = (path: string) => fields[path];
  // A new version (as the API keeps it, so even a save that changed nothing leaves nothing unsaved) starts a new draft.
  const start = (next: SummaryEditable) => {
    setLoaded(next);
    setWords(next.data);
    setFields({});
    setProblem(null);
  };

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: words },
      {
        onSuccess: (out) => {
          start(out);
          toast({ title: 'Saved. The next summaries use these words.', tone: 'success' });
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'summary_changed')
            return setProblem({ kind: 'changed', what: 'the summary’s words' });
          const found = docErrors(isApiError(e) ? e.fields : {});
          setFields(found.fields);
          const marked = Object.keys(found.fields).length
            ? ['Some fields need a look before saving. They’re marked below.']
            : [];
          const messages = [...found.general, ...marked];
          setProblem({ kind: 'other', messages: messages.length ? messages : [errorMessage(e)] });
        },
      },
    );
  };

  return (
    <section className="manage-doc" aria-labelledby="summary-words-title">
      <h3 id="summary-words-title" className="manage-doc__title">
        Its words
      </h3>
      <DocFrame
        title="the summary’s words"
        savedAt={loaded.updatedAt}
        savedBy={loaded.updatedBy?.displayName ?? null}
        dirty={dirty}
        saving={save.isPending}
        onPreview={() => setPreviewing(true)}
        onUndo={() => {
          setWords(saved);
          setFields({});
          setProblem(null);
        }}
        onSave={submit}
        problem={problem}
        onReload={() => reload().then(start)}
        section={{
          title: 'Its words and when it goes out',
          about: 'Every year’s summary uses them, in its email and in the text reps paste.',
        }}
      >
        <div className="dedit-grid">
          <TextField
            className="dedit-grid__wide"
            label="Subject line"
            hint="{year} is the year’s number and {week} the week, like 18 to 24 October. Also the text’s first line."
            value={words.subject}
            onChange={(e) => setWords((w) => ({ ...w, subject: e.target.value }))}
            error={err('subject')}
            maxLength={120}
            required
          />
          {HEADINGS.map(({ key, label, hint }) => (
            <TextField
              key={key}
              label={label}
              hint={hint}
              value={words.headings[key]}
              onChange={(e) => setWords((w) => ({ ...w, headings: { ...w.headings, [key]: e.target.value } }))}
              error={err(`headings.${key}`)}
              maxLength={80}
              required
            />
          ))}
          <TextField
            label="Before the link at the end"
            hint="The link to the hub follows it."
            value={words.closing}
            onChange={(e) => setWords((w) => ({ ...w, closing: e.target.value }))}
            error={err('closing')}
            maxLength={80}
            required
          />
          <TextField
            label="Goes out on Sunday at"
            hint="Bahrain time. The emails are queued from then on."
            type="time"
            step={300}
            value={words.sendAt}
            onChange={(e) => setWords((w) => ({ ...w, sendAt: e.target.value.slice(0, 5) }))}
            error={err('sendAt')}
            required
          />
        </div>
      </DocFrame>

      <Drawer
        open={previewing}
        onClose={() => setPreviewing(false)}
        title="Preview"
        description="This week’s summary in your words. Nothing is saved or sent."
        width="min(760px, 100vw)"
      >
        {previewing ? (
          <div className="dedit-preview">
            <SegmentedControl
              label="Year"
              options={YEARS.map((y) => ({ value: y, label: cohortLabel(y) }))}
              value={year}
              onChange={setYear}
              size="sm"
            />
            {draft.isError ? (
              <QueryError
                error={draft.error}
                title="The preview didn’t load"
                onRetry={() => void draft.refetch()}
                retrying={draft.isFetching}
                size="sm"
              />
            ) : null}
            {draft.data ? (
              <>
                <p className="dedit-preview__label">Subject</p>
                <p className="manage-summary__subject">{draft.data.subject}</p>
                <pre className="manage-summary__text">{draft.data.text}</pre>
              </>
            ) : draft.isError ? null : (
              <Skeleton lines={8} />
            )}
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}
