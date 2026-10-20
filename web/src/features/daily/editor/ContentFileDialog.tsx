// Admins: load a Daily content file (as `python -m app.cli daily-content export` writes it) on an install without a
// shell, such as the dev site. "Check" reads it and says what it would add and leave; "Load" adds what the hub lacks
// and leaves what is there, so loading the same file again changes nothing. The file holds every answer: it goes
// from this dialog to the API and nowhere else.
import { useId, useState } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import type { BundleReport, ThemeOut } from '../../../api/types';
import { useToast } from '../../../state';
import { Button, formatCount, glyph, Icon, Modal } from '../../../ui';
import { useImportBundle } from './api';
import { GAMES } from './lib/items';

const MAX_BYTES = 1_000_000;

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** A report's counts in words: '2 themes, 483 vocabulary words, 702 puzzles and 1 guess word' (null for none). */
function countsLine(report: BundleReport, which: 'added' | 'kept'): string | null {
  const puzzles = report.items.reduce((n, g) => n + g[which], 0);
  const parts = [
    report.themes[which] ? plural(report.themes[which], 'theme', 'themes') : null,
    report.vocabulary[which] ? plural(report.vocabulary[which], 'vocabulary word', 'vocabulary words') : null,
    puzzles ? plural(puzzles, 'puzzle', 'puzzles') : null,
    report.guesses[which] ? plural(report.guesses[which], 'guess word', 'guess words') : null,
  ].filter((p): p is string => p !== null);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function ContentFileDialog({ themes, onClose }: { themes: ThemeOut[]; onClose: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const check = useImportBundle();
  const load = useImportBundle();
  const { push: toast } = useToast();
  const inputId = useId();
  const report = check.data;
  const error = check.error ?? load.error;
  const problem = isApiError(error)
    ? (error.fields.content ?? errorMessage(error))
    : error
      ? errorMessage(error)
      : null;
  const busy = check.isPending || load.isPending;
  const added = report ? countsLine(report, 'added') : null;
  const kept = report ? countsLine(report, 'kept') : null;
  const nothing = Boolean(report && !added && !report.rotation.length);
  const titles = new Map(themes.map((t) => [t.id, t.title]));

  const pick = async (picked: File | undefined) => {
    check.reset();
    load.reset();
    setReadError(null);
    setFile(null);
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      setReadError('This file is over 1 MB, far bigger than a Daily content file. Check that it’s the right one.');
      return;
    }
    try {
      setFile({ name: picked.name, text: await picked.text() });
    } catch {
      setReadError('This file couldn’t be read. Pick it again.');
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={busy ? () => undefined : onClose}
      title="Load a content file"
      description="For a new install: the themes, puzzles and vocabulary exported with python -m app.cli daily-content export. It adds what the hub lacks and leaves what’s there."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={check.isPending}
            disabled={!file || load.isPending}
            onClick={() => file && check.mutate({ content: file.text, dryRun: true })}
          >
            Check
          </Button>
          <Button
            variant="primary"
            loading={load.isPending}
            disabled={!file || !report || nothing || check.isPending}
            onClick={() =>
              file &&
              load.mutate(
                { content: file.text, dryRun: false },
                {
                  onSuccess: (done) => {
                    toast({ title: `Loaded: ${countsLine(done, 'added') ?? 'nothing new'}.`, tone: 'success' });
                    onClose();
                  },
                },
              )
            }
          >
            Load
          </Button>
        </>
      }
    >
      <div className="dcms-form">
        <div className="dcms-file">
          <label htmlFor={inputId} className="dcms-file__label">
            The content file
          </label>
          <input
            id={inputId}
            type="file"
            accept=".json,application/json"
            className="dcms-file__input"
            onChange={(e) => void pick(e.target.files?.[0])}
            data-autofocus
          />
          <p className="dcms__note">
            <Icon glyph={glyph.upload} /> It holds every answer: keep it private, out of the repository and out of
            chats.
          </p>
        </div>
        {readError || problem ? (
          <p className="dcms__error" role="alert">
            {readError ?? problem}
          </p>
        ) : null}
        {report && file ? (
          <section className="dcms-report" aria-labelledby="dcms-file-report" aria-live="polite">
            <h3 id="dcms-file-report" className="dcms-report__title">
              {added ? `${file.name} would add ${added}.` : `${file.name} adds nothing new: the hub has all of it.`}
            </h3>
            {report.items.some((g) => g.added) ? (
              <ul className="dcms-report__summary">
                {GAMES.map((info) => {
                  const n = report.items.find((g) => g.game === info.id)?.added ?? 0;
                  return n ? <li key={info.id}>{`${info.label}: ${formatCount(n)}`}</li> : null;
                })}
              </ul>
            ) : null}
            {kept ? <p className="dcms__note">{`In the hub already, and left as they are: ${kept}.`}</p> : null}
            {report.rotation.length ? (
              <p className="dcms__note">{`It puts ${report.rotation.map((id) => titles.get(id) ?? id).join(', ')} in the rotation.`}</p>
            ) : null}
            {report.problems.length ? (
              <>
                <p className="dcms__note">{`${formatCount(report.problems.length)} ${report.problems.length === 1 ? 'entry stays out' : 'entries stay out'}:`}</p>
                <ol className="dcms-report__rows">
                  {report.problems.slice(0, 100).map((p) => (
                    <li key={p} className="dcms-report__row is-refused">
                      <span className="dcms-report__text">{p}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
