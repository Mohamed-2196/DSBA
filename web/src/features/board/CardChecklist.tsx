// A card's checklist in its drawer: tick, reorder and remove to-dos, and add new ones. Each change saves at once.
import { ArrowDown, ArrowUp, CheckSquare, Trash } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import type { ChecklistItem } from '../../api/types';
import { Button, IconButton, TextField, cx } from '../../ui';
import { checklistProgress, moveItem, newItemId } from './board';

/** The API keeps up to 50 to-dos on a card. */
const MAX_ITEMS = 50;

export interface CardChecklistProps {
  items: readonly ChecklistItem[];
  readOnly: boolean;
  onChange: (items: ChecklistItem[]) => void;
}

export function CardChecklist({ items, readOnly, onChange }: CardChecklistProps) {
  const headingId = useId();
  const [text, setText] = useState('');
  const progress = checklistProgress(items);
  const full = items.length >= MAX_ITEMS;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || full) return;
    onChange([...items, { id: newItemId(), text: t.slice(0, 200), done: false }]);
    setText('');
  };

  return (
    <section className="card-detail__section" aria-labelledby={headingId}>
      <div className="card-detail__section-head">
        <h3 className="card-detail__h" id={headingId}>
          <CheckSquare aria-hidden="true" />
          Checklist
        </h3>
        {items.length ? (
          <span className="card-detail__progress-text">
            {progress.done} of {progress.total} done
          </span>
        ) : null}
      </div>
      {items.length ? (
        <div
          className="card-detail__progress"
          role="progressbar"
          aria-labelledby={headingId}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-valuetext={`${progress.done} of ${progress.total} done`}
        >
          <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      ) : null}

      {items.length ? (
        <ul role="list" className="card-detail__checklist">
          {items.map((item, i) => (
            <li key={item.id} className={cx('card-detail__todo', item.done && 'is-done')}>
              <label className="card-detail__todo-check">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={readOnly}
                  onChange={() => onChange(items.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))}
                />
                <span className="card-detail__todo-text">{item.text}</span>
              </label>
              {readOnly ? null : (
                <span className="card-detail__todo-actions">
                  <IconButton label={`Move “${item.text}” up`} icon={ArrowUp} size="sm" disabled={i === 0} onClick={() => onChange(moveItem(items, item.id, -1))} />
                  <IconButton label={`Move “${item.text}” down`} icon={ArrowDown} size="sm" disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, item.id, 1))} />
                  <IconButton label={`Remove “${item.text}”`} icon={Trash} size="sm" onClick={() => onChange(items.filter((x) => x.id !== item.id))} />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : readOnly ? (
        <p className="card-detail__none">No to-dos.</p>
      ) : null}

      {readOnly ? null : (
        <form className="card-detail__inline-form" onSubmit={add}>
          <TextField
            label="New to-do"
            hideLabel
            value={text}
            maxLength={200}
            placeholder={full ? 'This checklist is full' : 'Add a to-do'}
            disabled={full}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="done"
          />
          <Button type="submit" variant="secondary" disabled={!text.trim() || full}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}
