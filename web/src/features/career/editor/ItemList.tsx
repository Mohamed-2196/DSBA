// One list in the Career Navigator editor (employers, tracks, roles, ...): each item a row that opens into its form,
// with buttons to move it, hide it and remove it. Moving uses buttons, so it works the same with a finger, a mouse
// or a keyboard.
import { ArrowDown, ArrowUp, CaretDown, Eye, EyeSlash, Plus, Trash } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Badge, Button, ConfirmDialog, IconButton, cx } from '../../../ui';
import { savedIdsOf, type EditorSection } from './doc';
import { openKey, useEditor } from './state';

export interface ItemListProps<T> {
  section: EditorSection;
  items: readonly T[];
  idOf: (item: T) => string;
  titleOf: (item: T) => string;
  /** a line under the title in the closed row */
  metaOf?: (item: T) => ReactNode;
  /** something before the title (a logo) */
  leadOf?: (item: T) => ReactNode;
  /** what one item is called: 'employer' */
  noun: string;
  isHidden?: (item: T) => boolean;
  /** absent: the items can't be hidden */
  onHide?: (id: string, hidden: boolean) => void;
  /** absent: the order doesn't matter */
  onMove?: (from: number, by: number) => void;
  onRemove: (id: string) => void;
  /** why an item can't be removed or hidden now (null when it can) */
  blocker?: (id: string) => string | null;
  /** adds an item and returns its id (it opens) */
  onAdd: () => string;
  /** the form of an open item */
  children: (item: T, index: number) => ReactNode;
  /** an error the API reported for this item (its index) */
  hasError?: (index: number) => boolean;
}

export function ItemList<T>({ section, items, idOf, titleOf, metaOf, leadOf, noun, isHidden, onHide, onMove, onRemove, blocker, onAdd, children, hasError }: ItemListProps<T>) {
  const { open, setOpen, saved } = useEditor();
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const savedIds = new Set(savedIdsOf(saved, section));

  return (
    <div className="cedit-list">
      {items.length ? (
        <ol role="list" className="cedit-list__items">
          {items.map((item, i) => {
            const id = idOf(item);
            const key = openKey(section, id);
            const isOpen = open === key;
            const hidden = isHidden?.(item) ?? false;
            const title = titleOf(item) || `New ${noun}`;
            const tryOr = (go: () => void) => {
              const why = blocker?.(id) ?? null;
              if (why) setBlocked(why);
              else go();
            };
            return (
              <li key={id} className={cx('cedit-item', isOpen && 'is-open', hidden && 'is-hidden', hasError?.(i) && 'has-error')} data-item-id={id}>
                <div className="cedit-item__row">
                  {leadOf ? <span className="cedit-item__lead">{leadOf(item)}</span> : null}
                  <button type="button" className="cedit-item__open" aria-expanded={isOpen} aria-controls={`cedit-${section}-${id}`} onClick={() => setOpen(isOpen ? null : key)}>
                    <span className="cedit-item__title">
                      {title}
                      {hidden ? (
                        <Badge tone="neutral" icon={EyeSlash} size="sm">
                          Hidden
                        </Badge>
                      ) : null}
                      {!savedIds.has(id) ? (
                        <Badge tone="signal" size="sm">
                          New
                        </Badge>
                      ) : null}
                    </span>
                    {metaOf ? <span className="cedit-item__meta">{metaOf(item)}</span> : null}
                    <CaretDown className="cedit-item__caret" weight="bold" aria-hidden="true" />
                  </button>
                  <span className="cedit-item__tools">
                    {onMove ? (
                      <>
                        <IconButton size="sm" icon={ArrowUp} label={`Move ${title} up`} disabled={i === 0} onClick={() => onMove(i, -1)} />
                        <IconButton size="sm" icon={ArrowDown} label={`Move ${title} down`} disabled={i === items.length - 1} onClick={() => onMove(i, 1)} />
                      </>
                    ) : null}
                    {onHide ? (
                      <IconButton
                        size="sm"
                        icon={hidden ? Eye : EyeSlash}
                        label={hidden ? `Show ${title} on the page` : `Hide ${title} from the page`}
                        tooltip
                        onClick={() => (hidden ? onHide(id, false) : tryOr(() => onHide(id, true)))}
                      />
                    ) : null}
                    <IconButton size="sm" icon={Trash} label={`Remove ${title}`} tooltip onClick={() => tryOr(() => setRemoving({ id, title }))} />
                  </span>
                </div>
                {isOpen ? (
                  <div className="cedit-item__form" id={`cedit-${section}-${id}`}>
                    {children(item, i)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="cedit__empty">{`No ${noun}s yet.`}</p>
      )}
      <Button variant="secondary" leadingIcon={Plus} onClick={() => setOpen(openKey(section, onAdd()))} className="cedit-list__add">
        {`Add ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`}
      </Button>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.title ?? ''}?`}
        body={`It leaves the draft, with every link to it from the rest of Career Navigator. Nothing changes for students until you save. To keep it but take it off the page, hide it instead.`}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          if (removing) onRemove(removing.id);
          setRemoving(null);
          setOpen(null);
        }}
        onClose={() => setRemoving(null)}
      />
      <ConfirmDialog open={blocked !== null} title="Not yet" body={blocked} confirmLabel="OK" onConfirm={() => setBlocked(null)} onClose={() => setBlocked(null)} />
    </div>
  );
}
