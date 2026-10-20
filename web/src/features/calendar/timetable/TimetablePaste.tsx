// Manage → Calendar: the exam timetable in one paste (IDEA-54). The rep pastes the rows as they came (the email, a web
// page, a spreadsheet), checks what each will do (a change to an exam, a new exam, nothing, or something to fix
// first), marks each row's sitting (main or resit; the API reads "resit" on the line, or the date), fixes rows in place,
// and saves them all at once; each year whose exams changed gets one notice.
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { TimetableRow, TimetableSaved } from '../../../api/types';
import { errorMessage, isApiError } from '../../../api/errors';
import { today as bahrainToday } from '../../../lib/dates';
import { useToast, useUnsavedChanges } from '../../../state';
import { Badge, Button, cx, glyph, Icon, IconButton, Panel, Select, Switch, TextArea, TextField } from '../../../ui';
import { useSaveTimetable, useTimetablePreview } from '../api';
import {
  ACTION_LABEL,
  defaultSource,
  draftsOf,
  noticeLine,
  refusedRows,
  rowIn,
  rowWhose,
  savedLine,
  SITTING_OPTIONS,
  summaryLine,
  wasLine,
  type DraftRow,
} from './timetable';
import './timetable.css';

const ACTION_TONE: Record<TimetableRow['action'], ComponentProps<typeof Badge>['tone']> = {
  update: 'cobalt',
  new: 'signal',
  same: 'neutral',
  fix: 'alert',
};

const EXAMPLE = 'ST2134   Mon 13 Oct 2026   10:00–13:00   BIBF Hall A';

interface Item {
  draft: DraftRow;
  row: TimetableRow;
}

type Stage = { at: 'paste' } | { at: 'check' } | { at: 'saved'; saved: TimetableSaved };

export function TimetablePaste() {
  const { push } = useToast();
  const preview = useTimetablePreview();
  const save = useSaveTimetable();
  const [stage, setStage] = useState<Stage>({ at: 'paste' });
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  // edited since the last check: what each row will do must be checked again before saving
  const [edited, setEdited] = useState(false);
  const [refused, setRefused] = useState<Map<number, string>>(new Map());
  const [source, setSource] = useState(() => defaultSource(bahrainToday()));
  const [notify, setNotify] = useState(true);
  // after a save the rows go: bring what was saved into view
  const done = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stage.at === 'saved') done.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [stage.at]);
  useUnsavedChanges(stage.at === 'check' || (stage.at === 'paste' && !!text.trim()), 'The exam timetable');

  const answered = (rows: TimetableRow[]) => {
    setItems(draftsOf(rows).map((draft, i) => ({ draft, row: rows[i] })));
    setEdited(false);
    setRefused(new Map());
    setStage({ at: 'check' });
  };
  const check = () => preview.mutate({ text }, { onSuccess: (r) => answered(r.rows) });
  const checkAgain = () =>
    preview.mutate({ rows: items.map((i) => rowIn(i.draft)) }, { onSuccess: (r) => answered(r.rows) });
  const edit = (key: string, field: keyof Omit<DraftRow, 'key'>, value: string) => {
    setItems((all) => all.map((i) => (i.draft.key === key ? { ...i, draft: { ...i.draft, [field]: value } } : i)));
    setEdited(true);
  };
  const remove = (key: string) => {
    setItems((all) => all.filter((i) => i.draft.key !== key));
    setEdited(true);
  };
  const startAgain = () => {
    preview.reset();
    save.reset();
    setItems([]);
    setStage({ at: 'paste' });
  };
  const toSave = items.filter((i) => i.row.action === 'update' || i.row.action === 'new').length;
  const toFix = items.some((i) => i.row.action === 'fix');
  const submit = () =>
    save.mutate(
      { rows: items.map((i) => rowIn(i.draft)), source: source.trim(), notify },
      {
        onSuccess: (saved) => {
          setText('');
          setItems([]);
          setStage({ at: 'saved', saved });
          push({ tone: 'success', title: 'Timetable saved', body: savedLine(saved) });
        },
        onError: (e) => {
          if (isApiError(e)) setRefused(refusedRows(e.fields));
        },
      },
    );

  return (
    <Panel className="tt" data-hub="timetable">
      <h3 className="manage-noora__title">Paste the exam timetable</h3>
      <p className="manage-noora__note">
        Copy the rows from the email, the web page or the spreadsheet and paste them here. Each exam is matched to its
        module by its code and to the exam the calendar has near that date. You check every row before anything changes.
      </p>

      {stage.at === 'paste' ? (
        <div className="tt__paste">
          <TextArea
            label="The timetable"
            hint="One exam a line, with its module code, date, time and venue in any order. Headings and other lines are left out."
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            className="tt__text"
            spellCheck={false}
            data-hub="timetable-text"
          />
          {preview.isError ? (
            <p className="tt__error" role="alert">
              {errorMessage(preview.error, 'The rows weren’t read. Try again.')}
            </p>
          ) : null}
          <div className="tt__actions">
            <Button
              variant="primary"
              onClick={check}
              loading={preview.isPending}
              disabled={!text.trim()}
              data-hub="timetable-check"
            >
              Check the rows
            </Button>
          </div>
        </div>
      ) : null}

      {stage.at === 'check' ? (
        <div className="tt__check">
          <p className="tt__summary" role="status">
            {edited ? 'You changed some rows. Check them again before saving.' : summaryLine(items.map((i) => i.row))}
          </p>
          {items.length ? (
            <ol role="list" className="tt__rows" data-hub="timetable-rows">
              {items.map((item, index) => (
                <RowEditor
                  key={item.draft.key}
                  item={item}
                  stale={edited}
                  refused={refused.get(index) ?? null}
                  onEdit={(field, value) => edit(item.draft.key, field, value)}
                  onRemove={() => remove(item.draft.key)}
                />
              ))}
            </ol>
          ) : (
            <p className="manage-noora__note">Every row is removed. Start again to paste the timetable.</p>
          )}

          {!edited && items.length ? (
            <div className="tt__save">
              <TextField
                label="Where it comes from"
                hint="Shown with each exam, with today as the day it was checked."
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={300}
                data-hub="timetable-source"
              />
              <Switch
                checked={notify}
                onChange={setNotify}
                label="Tell students"
                description="One notice for each year whose exams change, listing them, and an email to those who want date changes. A resit goes to the year after the module’s and those resitting it."
              />
            </div>
          ) : null}

          {preview.isError || save.isError ? (
            <p className="tt__error" role="alert">
              {errorMessage(preview.error ?? save.error, 'That didn’t work. Try again.')}
            </p>
          ) : null}
          <div className="tt__actions">
            {edited ? (
              <Button variant="primary" onClick={checkAgain} loading={preview.isPending} disabled={!items.length}>
                Check again
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={submit}
                loading={save.isPending}
                disabled={!toSave || toFix || source.trim().length < 3}
                data-hub="timetable-save"
              >
                {toFix
                  ? 'Fix the rows first'
                  : toSave
                    ? `Save ${toSave} ${toSave === 1 ? 'exam' : 'exams'}`
                    : 'Nothing to save'}
              </Button>
            )}
            <Button variant="ghost" onClick={startAgain}>
              Start again
            </Button>
          </div>
        </div>
      ) : null}

      {stage.at === 'saved' ? (
        <div ref={done} className="tt__done" data-hub="timetable-saved">
          <p className="tt__summary" role="status">
            {savedLine(stage.saved)}
          </p>
          {stage.saved.notices.length ? (
            <ul role="list" className="tt__notices">
              {stage.saved.notices.map((n) => (
                <li key={n.resitters ? 'resitters' : (n.year ?? 'all')}>{noticeLine(n)}</li>
              ))}
            </ul>
          ) : null}
          <div className="tt__actions">
            <Button variant="primary" to="/calendar?types=exam&view=list">
              See the exams
            </Button>
            <Button onClick={startAgain}>Paste another</Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function RowEditor({
  item,
  stale,
  refused,
  onEdit,
  onRemove,
}: {
  item: Item;
  stale: boolean;
  refused: string | null;
  onEdit: (field: keyof Omit<DraftRow, 'key'>, value: string) => void;
  onRemove: () => void;
}) {
  const { draft, row } = item;
  const was = wasLine(row);
  const problems = refused && !row.problems.includes(refused) ? [...row.problems, refused] : row.problems;
  const name = row.moduleName ?? (draft.unitCode ? 'Unknown module' : 'No module');
  const label = draft.unitCode || (row.line ? `Line ${row.line}` : 'This row');
  return (
    <li className={cx('tt-row', `tt-row--${row.action}`, stale && 'is-stale')} data-hub="timetable-row">
      <div className="tt-row__head">
        <span className="tt-row__what">
          <span className="tt-row__name">{name}</span>
          <span className="tt-row__meta">
            {rowWhose(row)}
            {row.line ? `${row.year ? ' · ' : ''}Line ${row.line}` : null}
          </span>
        </span>
        {stale ? null : (
          <Badge tone={ACTION_TONE[row.action]} size="sm">
            {ACTION_LABEL[row.action]}
          </Badge>
        )}
        <IconButton
          label={`Remove ${label}`}
          icon={<Icon glyph={glyph.close} />}
          variant="ghost"
          size="sm"
          onClick={onRemove}
        />
      </div>
      <div className="tt-row__fields">
        <TextField
          label="Code"
          value={draft.unitCode}
          onChange={(e) => onEdit('unitCode', e.target.value)}
          maxLength={16}
          autoCapitalize="characters"
          className="tt-row__code"
        />
        <TextField
          label="Date"
          type="date"
          value={draft.date}
          onChange={(e) => onEdit('date', e.target.value)}
          className="tt-row__date"
        />
        <Select
          label="Sitting"
          value={draft.sitting}
          onChange={(e) => onEdit('sitting', e.target.value)}
          options={SITTING_OPTIONS}
          className="tt-row__sitting"
          data-hub="timetable-sitting"
        />
        <TextField
          label="Time"
          value={draft.time}
          onChange={(e) => onEdit('time', e.target.value)}
          maxLength={40}
          placeholder="Keeps the exam’s"
          className="tt-row__time"
        />
        <TextField
          label="Venue"
          value={draft.place}
          onChange={(e) => onEdit('place', e.target.value)}
          maxLength={120}
          placeholder="Keeps the exam’s"
          className="tt-row__place"
        />
      </div>
      {was ? <p className="tt-row__was">{was}</p> : null}
      {problems.length && !stale ? (
        <ul role="list" className="tt-row__problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {row.text ? (
        <p className="tt-row__text" title="The line as pasted">
          {row.text}
        </p>
      ) : null}
    </li>
  );
}
