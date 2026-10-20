// Pasting items in bulk: a word list, or quiz questions and groups as rows with a header (copied from a spreadsheet,
// or CSV). "Check" reads every row with the same rules as the form and says what can be added and what can't, and
// why; "Add" adds the rows that pass, together, in one entry of the activity log.
import { useState } from 'react';
import { isApiError, placeFieldErrors, unplacedMessage } from '../../../api/errors';
import type { ImportReport, ThemeOut } from '../../../api/types';
import { useToast, useUnsavedChanges } from '../../../state';
import { Button, cx, formatCount, glyph, Icon, Modal, Select, Switch, TextArea } from '../../../ui';
import { useImportItems } from './api';
import { gameInfo, type ContentGame } from './lib/items';

interface ImportDialogProps {
  game: ContentGame;
  themes: ThemeOut[];
  defaultTheme: string;
  onClose: () => void;
}

const SHOWN_ROWS = 200;

export function ImportDialog({ game, themes, defaultTheme, onClose }: ImportDialogProps) {
  const info = gameInfo(game);
  const [theme, setTheme] = useState(defaultTheme || themes[0]?.id || '');
  const [text, setText] = useState('');
  const [addGuesses, setAddGuesses] = useState(true);
  useUnsavedChanges(text.trim() !== '', 'the import');
  const check = useImportItems();
  const commit = useImportItems();
  const { push: toast } = useToast();
  const report: ImportReport | undefined = check.data;
  const ready = report ? report.rows.filter((r) => r.problem === null).length : 0;
  const refused = report ? report.rows.length - ready : 0;
  const error = check.error ?? commit.error;
  const placed = placeFieldErrors(isApiError(error) ? error.fields : {}, ['theme', 'text']);
  const fieldErrors = placed.fields;
  const general = unplacedMessage(error, placed);
  const busy = check.isPending || commit.isPending;
  const themeTitle = themes.find((t) => t.id === theme)?.title ?? theme;
  const body = { game, theme, text, addGuesses: game === 'word' ? addGuesses : false };

  const edited = () => {
    check.reset();
    commit.reset();
  };

  return (
    <Modal
      open
      size="lg"
      onClose={busy ? () => undefined : onClose}
      title={`Import ${info.noun}s`}
      description="Paste them, check them, then add the ones that pass. Nothing is added until you do."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={check.isPending}
            disabled={!text.trim() || commit.isPending}
            onClick={() => check.mutate({ ...body, dryRun: true })}
          >
            Check
          </Button>
          <Button
            variant="primary"
            loading={commit.isPending}
            disabled={!report || ready === 0 || check.isPending}
            onClick={() =>
              commit.mutate(
                { ...body, dryRun: false },
                {
                  onSuccess: (done) => {
                    toast({
                      title: `Added ${formatCount(done.added)} ${done.added === 1 ? info.noun : `${info.noun}s`} to ${themeTitle}.`,
                      tone: 'success',
                    });
                    onClose();
                  },
                },
              )
            }
          >
            {report && ready > 0 ? `Add ${formatCount(ready)}` : 'Add'}
          </Button>
        </>
      }
    >
      <div className="dcms-form">
        <Select
          label="Theme"
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value);
            edited();
          }}
          options={themes.map((t) => ({ value: t.id, label: t.title }))}
          error={fieldErrors.theme}
        />
        <TextArea
          label={`${info.noun[0]?.toUpperCase() ?? ''}${info.noun.slice(1)}s`}
          value={text}
          rows={8}
          spellCheck={false}
          className="dcms-import__text"
          placeholder={info.importExample}
          onChange={(e) => {
            setText(e.target.value);
            edited();
          }}
          error={fieldErrors.text}
          hint={`${info.importHint} Up to 500 at a time.`}
          data-autofocus
        />
        {game === 'word' ? (
          <Switch
            checked={addGuesses}
            onChange={(on) => {
              setAddGuesses(on);
              edited();
            }}
            label="Add new answer words to the guess list too"
            description="An answer word must be in the guess list, so players can type it."
          />
        ) : null}
        {general ? (
          <p className="dcms__error" role="alert">
            {general}
          </p>
        ) : null}
        {report ? (
          <section className="dcms-report" aria-labelledby="dcms-report-title" aria-live="polite">
            <h3 id="dcms-report-title" className="dcms-report__title">
              {ready === report.rows.length
                ? `All ${formatCount(ready)} can be added.`
                : `${formatCount(ready)} can be added. ${formatCount(refused)} can’t, for the reasons below.`}
            </h3>
            <ol className="dcms-report__rows">
              {[...report.rows]
                .sort((a, b) => Number(a.problem === null) - Number(b.problem === null))
                .slice(0, SHOWN_ROWS)
                .map((row, i) => (
                  <li key={`${row.line}-${i}`} className={cx('dcms-report__row', row.problem ? 'is-refused' : 'is-ok')}>
                    {row.problem ? (
                      <Icon glyph={glyph.error} className="dcms-report__icon" />
                    ) : (
                      <Icon glyph={glyph.check} className="dcms-report__icon" />
                    )}
                    <span className="dcms-report__text">
                      <span className="dcms-report__line">Line {row.line}</span> {row.text}
                      {row.problem ? <span className="dcms-report__problem">{row.problem}</span> : null}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
