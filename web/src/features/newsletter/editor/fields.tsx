// Fields of the issue editor: the design system's text controls, wired to a field path (its id, so a failed save can
// focus it, and its error), with a character count once the text nears the API's limit.
import type { HTMLAttributes, ReactNode } from 'react';
import { ArrowDown, ArrowUp, Trash } from '@phosphor-icons/react';
import { IconButton, TextArea, TextField, cx } from '../../../ui';
import { controlId, type FieldErrors } from '../lib/draft';

const length = (s: string): number => Array.from(s.trim()).length;

/** The count under a limited field, once it gets close to the limit (from 80%). */
function withCount(value: string, max: number | undefined, hint: ReactNode): ReactNode {
  if (!max) return hint;
  const n = length(value);
  if (n < max * 0.8) return hint;
  const count = (
    <span className={cx('nl-ed-count', n > max && 'is-over')}>
      {n.toLocaleString('en-GB')} of {max.toLocaleString('en-GB')} characters
    </span>
  );
  return hint ? (
    <>
      {hint} {count}
    </>
  ) : (
    count
  );
}

interface FieldCommon {
  /** the field path (lib/draft.ts fieldPath): the control's id and the key of its error */
  path: string;
  errors: FieldErrors;
  label: ReactNode;
  value: string;
  onValue: (value: string) => void;
  /** the API's limit, in characters */
  max?: number;
  hint?: ReactNode;
  required?: boolean;
  hideLabel?: boolean;
  placeholder?: string;
  className?: string;
}

export interface TextInputProps extends FieldCommon {
  type?: 'text' | 'date' | 'url';
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  min?: string;
}

/** A one-line field of the editor. */
export function TextInput({ path, errors, value, onValue, max, hint, type = 'text', ...rest }: TextInputProps) {
  return <TextField id={controlId(path)} type={type} value={value} onChange={(e) => onValue(e.target.value)} error={errors[path]} hint={withCount(value, max, hint)} spellCheck={type === 'text'} {...rest} />;
}

export interface TextBoxProps extends FieldCommon {
  rows?: number;
}

/** A multi-line field of the editor. */
export function TextBox({ path, errors, value, onValue, max, hint, rows = 3, ...rest }: TextBoxProps) {
  return <TextArea id={controlId(path)} rows={rows} value={value} onChange={(e) => onValue(e.target.value)} error={errors[path]} hint={withCount(value, max, hint)} {...rest} />;
}

/** The hint for copy that takes the inline markup. */
export const MARKUP_HINT = '**bold**, *italic*, ==highlight== and [link text](/calendar) work here.';

export interface ItemToolsProps {
  /** what the item is, for the buttons' names: 'paragraph 2', 'the cover line “…”' */
  name: string;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  className?: string;
}

/** Move up, move down and remove, for one item of a list in the editor. */
export function ItemTools({ name, first, last, onMove, onRemove, className }: ItemToolsProps) {
  return (
    <div className={cx('nl-ed-tools', className)} role="group" aria-label={`Arrange ${name}`}>
      <IconButton label={`Move ${name} up`} icon={ArrowUp} size="sm" tooltip disabled={first} onClick={() => onMove(-1)} />
      <IconButton label={`Move ${name} down`} icon={ArrowDown} size="sm" tooltip disabled={last} onClick={() => onMove(1)} />
      <IconButton label={`Remove ${name}`} icon={Trash} size="sm" tooltip onClick={onRemove} />
    </div>
  );
}
