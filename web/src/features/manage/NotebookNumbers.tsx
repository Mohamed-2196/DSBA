// Manage's numbers for the notebook's uploads (admins only): uploads in the last hour, day and week, students who hit
// the hourly limit, the top uploaders by display name, and everyone's note files against the sum of their rooms.
// Admins change the hourly limit here.
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/errors';
import { formatSize } from '../../api/uploads';
import type { NotebookUploader, NotebookUploadsOut } from '../../api/types';
import { useToast } from '../../state';
import { Button, Panel, QueryError, Skeleton, WholeNumberField, countOf, formatCount } from '../../ui';
import { useNotebookUploads, useSetNotebookLimits } from './api';
import { formatStorage, usedPercent } from './storageWords';

const MAX_PER_HOUR = 1000;

function LimitForm({ numbers }: { numbers: NotebookUploadsOut }) {
  const set = useSetNotebookLimits();
  const { push } = useToast();
  const [perHour, setPerHour] = useState(numbers.uploadsPerHour);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    set.mutate(
      { uploadsPerHour: perHour },
      {
        onSuccess: () => push({ tone: 'success', title: 'The notebook’s upload limit is saved' }),
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };
  return (
    <form className="manage-noora__form" onSubmit={submit} data-hub="notebook-limit">
      <WholeNumberField
        label="Uploads per student an hour"
        hint="Pictures, files and PDFs added to notes. Other uploads stay at 20 an hour."
        min={1}
        max={MAX_PER_HOUR}
        value={perHour}
        onValue={setPerHour}
      />
      <div className="manage-noora__save">
        <Button type="submit" variant="primary" loading={set.isPending} disabled={perHour === numbers.uploadsPerHour}>
          Save limit
        </Button>
        {problem ? (
          <p className="manage-noora__problem" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Uploaders({ title, people, by }: { title: string; people: NotebookUploader[]; by: 'count' | 'bytes' }) {
  return (
    <section className="manage-uploaders" aria-label={title}>
      <h4 className="manage-uploaders__title">{title}</h4>
      {people.length ? (
        <ol className="manage-uploaders__list">
          {people.map((p) => {
            const count = countOf(p.uploads, 'upload');
            const size = formatSize(p.sizeBytes);
            return (
              <li key={p.userId} className="manage-uploaders__row">
                <span className="manage-uploaders__name">{p.displayName ?? 'No name yet'}</span>
                <span className="manage-uploaders__value">
                  {by === 'count' ? `${count} · ${size}` : `${size} · ${count}`}
                  {p.capped ? ` · ${formatCount(p.capped)} refused` : ''}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="manage-noora__note">No uploads in the last 7 days.</p>
      )}
    </section>
  );
}

function Storage({ n }: { n: NotebookUploadsOut }) {
  const percent = usedPercent(n.filesBytes, n.budgetBytes);
  const label = 'Notes’ pictures and files';
  return (
    <div className="manage-storage">
      <p className="manage-storage__line">
        {label}: <strong>{formatStorage(n.filesBytes)}</strong> of {formatStorage(n.budgetBytes)}
      </p>
      <div
        className="manage-storage__meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% used`}
      >
        <div className="manage-storage__fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="manage-noora__note">
        {countOf(n.students, 'student')} with a notebook, {formatSize(n.filesLimitBytes)} each.
      </p>
    </div>
  );
}

export function NotebookNumbers() {
  const numbers = useNotebookUploads(true);
  if (numbers.isError)
    return (
      <QueryError
        error={numbers.error}
        title="The notebook’s numbers didn’t load"
        onRetry={() => void numbers.refetch()}
        retrying={numbers.isFetching}
        size="sm"
      />
    );
  const n = numbers.data;
  const tiles: [string, string | null][] = [
    ['Uploads in the last hour', n ? formatCount(n.uploadsLastHour) : null],
    ['Uploads in the last 24 hours', n ? formatCount(n.uploadsLastDay) : null],
    ['Uploads in the last 7 days', n ? formatCount(n.uploadsLastWeek) : null],
    ['Hit the limit in 7 days', n ? countOf(n.cappedStudents, 'student') : null],
  ];
  return (
    <Panel className="manage-noora" data-hub="notebook-uploads">
      <h3 className="manage-noora__title">Notebook uploads</h3>
      <p className="manage-noora__note">
        Pictures, files and PDFs students add to their notes. Only admins see these numbers and names.
      </p>
      <dl className="manage-numbers" aria-busy={numbers.isPending || undefined}>
        {tiles.map(([label, value]) => (
          <div key={label} className="manage-number">
            <dt>{label}</dt>
            <dd>{value ?? <Skeleton width="2.5ch" height="1em" />}</dd>
          </div>
        ))}
      </dl>
      {n ? (
        <>
          {n.cappedUploads ? (
            <p className="manage-noora__note">
              {countOf(n.cappedUploads, 'upload')} refused at the hourly limit in the last 7 days.
            </p>
          ) : null}
          <Storage n={n} />
          <div className="manage-uploaders-grid">
            <Uploaders title="Most uploads, last 7 days" people={n.topByCount} by="count" />
            <Uploaders title="Most data, last 7 days" people={n.topByBytes} by="bytes" />
          </div>
          <LimitForm key={n.uploadsPerHour} numbers={n} />
        </>
      ) : null}
    </Panel>
  );
}
