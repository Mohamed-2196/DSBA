// What the documents edited whole in Manage share (Site settings, the guides, the forum's settings, Mini Noora, the
// grades calculator's rules and the others): the frame with its save bar, the banner for a save someone else made
// first, and ordered lists of items that open into forms. Each document's own fields are its editor's.
import { ArrowDown, ArrowSquareOut, ArrowUp, CaretDown, Eye, Plus, Trash } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUnsavedChanges } from '../../state/unsaved';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { ConfirmDialog } from '../ConfirmDialog';
import { IconButton } from '../IconButton';
import { cx } from '../internal';
import { Panel } from '../Panel';
import { timeAgo } from '../utils';
import './kit.css';

export type DocProblem = { kind: 'changed'; what: string } | { kind: 'other'; messages: string[] };

export interface DocFrameProps {
  /** what the document is called, in the nav's name and when leaving would lose changes: 'Site settings' (Manage's
   *  panel shows it as the heading) */
  title: string;
  savedAt: string | null;
  savedBy: string | null;
  dirty: boolean;
  saving: boolean;
  /** "Open the page", in a new tab */
  pageTo?: string;
  onPreview?: () => void;
  onUndo: () => void;
  onSave: () => void;
  problem: DocProblem | null;
  /** "Load it again": loads the version someone else saved, and the editor starts over from it */
  onReload: () => Promise<unknown>;
  /** the sections: chips that pick one (none for a document of one part) */
  nav?: ReactNode;
  /** the section's title and what it holds */
  section: { title: string; about: string };
  children: ReactNode;
}

export function DocFrame({
  title,
  savedAt,
  savedBy,
  dirty,
  saving,
  pageTo,
  onPreview,
  onUndo,
  onSave,
  problem,
  onReload,
  nav,
  section,
  children,
}: DocFrameProps) {
  useUnsavedChanges(dirty, title);
  const status = useRef<HTMLParagraphElement>(null);
  const wasSaving = useRef(saving);
  useEffect(() => {
    // Saved: the Save button that had the focus is disabled now, so the focus goes to the line saying it saved.
    if (wasSaving.current && !saving && !dirty) {
      const at = document.activeElement;
      if (!at || at === document.body || (at instanceof HTMLButtonElement && at.disabled)) {
        status.current?.focus({ preventScroll: true });
      }
    }
    wasSaving.current = saving;
  }, [saving, dirty]);
  const [reloading, setReloading] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const reload = () => {
    setReloading(true);
    setReloadFailed(false);
    onReload().then(
      () => setReloading(false),
      () => {
        setReloading(false);
        setReloadFailed(true);
      },
    );
  };
  return (
    <div className="dedit">
      <div className="dedit__head">
        <div className="dedit__intro">
          <p className="dedit__note" role="status" tabIndex={-1} ref={status}>
            {savedAt
              ? `Saved ${timeAgo(savedAt)}${savedBy ? ` by ${savedBy}` : ''}. `
              : 'Not changed in the hub yet: this is its starting content. '}
            {dirty ? 'You have changes that aren’t saved.' : 'No unsaved changes.'}
          </p>
        </div>
        <div className="dedit__actions">
          {pageTo ? (
            <Button variant="ghost" to={pageTo} target="_blank" rel="noopener" trailingIcon={ArrowSquareOut}>
              Open the page<span className="visually-hidden"> (opens in a new tab)</span>
            </Button>
          ) : null}
          {onPreview ? (
            <Button variant="secondary" leadingIcon={Eye} onClick={onPreview}>
              Preview
            </Button>
          ) : null}
          <Button variant="secondary" disabled={!dirty || saving} onClick={onUndo}>
            Undo changes
          </Button>
          <Button variant="primary" onClick={onSave} loading={saving} disabled={!dirty} data-hub="doc-save">
            Save
          </Button>
        </div>
      </div>

      {problem ? (
        <div className="dedit__banner" role="alert">
          {problem.kind === 'changed' ? (
            <>
              <p>
                Someone else saved {problem.what} while you were editing. Load their version, then make your changes
                again.
              </p>
              {reloadFailed ? <p>Their version didn’t load. Check your connection, then try again.</p> : null}
              <Button size="sm" onClick={reload} loading={reloading}>
                Load it again
              </Button>
            </>
          ) : (
            problem.messages.map((m) => <p key={m}>{m}</p>)
          )}
        </div>
      ) : null}

      {nav ? (
        <nav className="dedit__nav" aria-label={`Parts of ${title}`}>
          {nav}
        </nav>
      ) : null}

      <Panel as="section" padding="md" className="dedit__panel" aria-labelledby="dedit-section-title">
        <div className="dedit__section-head">
          <h4 id="dedit-section-title" className="dedit__section">
            {section.title}
          </h4>
          <p className="dedit__note">{section.about}</p>
        </div>
        {children}
      </Panel>

      <div className={cx('dedit__savebar', dirty && 'is-active')}>
        <span className="dedit__note">
          {dirty
            ? 'Saving changes the page for everyone at once, and goes to the activity log.'
            : 'No unsaved changes.'}
        </span>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={!dirty}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** A list in one of the documents: rows that open into their forms (one at a time), moved with buttons so it works
 *  the same with a finger, a mouse or a keyboard. */
export interface ListEditorProps<T extends { id: string }> {
  items: readonly T[];
  /** what one item is called: 'step' */
  noun: string;
  titleOf: (item: T) => string;
  metaOf?: (item: T) => ReactNode;
  onChange: (next: T[]) => void;
  /** a new, empty item */
  make: () => T;
  /** the form of an open item: `set` changes it */
  children: (item: T, index: number, set: (patch: Partial<T>) => void) => ReactNode;
  hasError?: (index: number) => boolean;
  /** items saved before; the others are marked new */
  savedIds?: ReadonlySet<string>;
  /** why an item can't be removed (its remove button is off and says so), or null */
  keepReason?: (item: T) => string | null;
  /** false: items come some other way (an upload), so there's no "Add" button */
  canAdd?: boolean;
  min?: number;
  max?: number;
}

export function ListEditor<T extends { id: string }>({
  items,
  noun,
  titleOf,
  metaOf,
  onChange,
  make,
  children,
  hasError,
  savedIds,
  keepReason,
  canAdd = true,
  min = 0,
  max = 60,
}: ListEditorProps<T>) {
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const move = (from: number, by: -1 | 1) => {
    const next = items.slice();
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(from + by, 0, item);
    onChange(next);
  };
  const set = (id: string) => (patch: Partial<T>) => onChange(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="dedit-list">
      {items.length ? (
        <ol role="list" className="dedit-list__items">
          {items.map((item, i) => {
            const isOpen = open === item.id;
            const title = titleOf(item) || `New ${noun}`;
            const formId = `dedit-item-${item.id}`;
            const kept = keepReason?.(item) ?? null;
            return (
              <li
                key={item.id}
                className={cx('dedit-item', isOpen && 'is-open', hasError?.(i) && 'has-error')}
                data-item-id={item.id}
              >
                <div className="dedit-item__row">
                  <button
                    type="button"
                    className="dedit-item__open"
                    aria-expanded={isOpen}
                    aria-controls={formId}
                    onClick={() => setOpen(isOpen ? null : item.id)}
                  >
                    <span className="dedit-item__title">
                      {title}
                      {savedIds && !savedIds.has(item.id) ? (
                        <Badge tone="signal" size="sm">
                          New
                        </Badge>
                      ) : null}
                    </span>
                    {metaOf ? <span className="dedit-item__meta">{metaOf(item)}</span> : null}
                    <CaretDown className="dedit-item__caret" weight="bold" aria-hidden="true" />
                  </button>
                  <span className="dedit-item__tools">
                    <IconButton
                      size="sm"
                      icon={ArrowUp}
                      label={`Move ${title} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    />
                    <IconButton
                      size="sm"
                      icon={ArrowDown}
                      label={`Move ${title} down`}
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 1)}
                    />
                    <IconButton
                      size="sm"
                      icon={Trash}
                      label={kept ?? `Remove ${title}`}
                      tooltip
                      disabled={items.length <= min || kept !== null}
                      onClick={() => setRemoving({ id: item.id, title })}
                    />
                  </span>
                </div>
                {isOpen ? (
                  <div className="dedit-item__form" id={formId}>
                    {children(item, i, set(item.id))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="dedit__empty">{`No ${noun}s yet.`}</p>
      )}
      {canAdd && items.length < max ? (
        <Button
          variant="secondary"
          leadingIcon={Plus}
          onClick={() => {
            const item = make();
            onChange([...items, item]);
            setOpen(item.id);
          }}
        >
          {`Add ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`}
        </Button>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.title ?? ''}?`}
        body="It leaves the draft. Nothing changes for students until you save."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          if (removing) onChange(items.filter((x) => x.id !== removing.id));
          setRemoving(null);
          setOpen(null);
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

/** A short list whose rows are edited in place (a step's links, Start here's places): move and remove buttons on
 *  each row, and a button to add one. */
export function RowsEditor<T>({
  items,
  noun,
  onChange,
  make,
  children,
  min = 0,
  max = 10,
}: {
  items: readonly T[];
  noun: string;
  onChange: (next: T[]) => void;
  make: () => T;
  children: (item: T, index: number, set: (next: T) => void) => ReactNode;
  min?: number;
  max?: number;
}) {
  const move = (from: number, by: -1 | 1) => {
    const next = items.slice();
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(from + by, 0, item);
    onChange(next);
  };
  return (
    <div className="dedit-rows">
      {items.length ? (
        <ol role="list" className="dedit-rows__items">
          {items.map((item, i) => (
            <li key={i} className="dedit-row">
              <div className="dedit-row__fields">
                {children(item, i, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}
              </div>
              <span className="dedit-row__tools">
                <IconButton
                  size="sm"
                  icon={ArrowUp}
                  label={`Move ${noun} ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <IconButton
                  size="sm"
                  icon={ArrowDown}
                  label={`Move ${noun} ${i + 1} down`}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                />
                <IconButton
                  size="sm"
                  icon={Trash}
                  label={`Remove ${noun} ${i + 1}`}
                  disabled={items.length <= min}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                />
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {items.length < max ? (
        <Button variant="secondary" size="sm" leadingIcon={Plus} onClick={() => onChange([...items, make()])}>
          {`Add ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`}
        </Button>
      ) : null}
    </div>
  );
}
