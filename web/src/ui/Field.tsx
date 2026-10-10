import {
  forwardRef,
  useId,
  type ChangeEventHandler,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CaretDown, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react';
import { cx, renderIcon, type IconSource } from './internal';
import { Kbd } from './Kbd';
import { modKeyLabel } from './utils';
import './Field.css';

/** What every labelled control takes. */
export interface FieldBaseProps {
  label?: ReactNode;
  /** a line under the control (replaced by `error` when there is one) */
  hint?: ReactNode;
  /** what is wrong and what to do; marks the control invalid */
  error?: ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
  /** keep the label for screen readers only */
  hideLabel?: boolean;
}

export interface FieldProps extends FieldBaseProps {
  /** renders the control with its id and aria-describedby */
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Label + hint + error wrapper. `children(id, describedBy)` renders the control. */
export function Field({ label, hint, error, required, id: idProp, className, children, hideLabel = false }: FieldProps) {
  const auto = useId();
  const id = idProp || `f${auto.replace(/:/g, '')}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ui-field', !!error && 'has-error', className)}>
      {label ? (
        <label htmlFor={id} className={cx('ui-field__label', hideLabel && 'visually-hidden')}>
          {label}
          {required ? <span className="ui-field__req" aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children(id, describedBy)}
      {error ? (
        <p id={errId} className="ui-field__error">
          <WarningCircle aria-hidden="true" weight="fill" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="ui-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends FieldBaseProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | keyof FieldBaseProps> {
  /** Phosphor icon inside the field */
  leadingIcon?: IconSource | null;
  /** node inside the field on the right (unit, button) */
  trailing?: ReactNode;
  size?: 'md' | 'lg';
}

/** Text input with label/hint/error. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, required, id, leadingIcon, trailing, size = 'md', className, hideLabel, ...input },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id} className={className} hideLabel={hideLabel}>
      {(fid, describedBy) => (
        <div className={cx('ui-control', `ui-control--${size}`, !!leadingIcon && 'has-leading')}>
          {renderIcon(leadingIcon, { className: 'ui-control__icon' })}
          <input ref={ref} id={fid} className="ui-control__input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} {...input} />
          {trailing ? <span className="ui-control__trailing">{trailing}</span> : null}
        </div>
      )}
    </Field>
  );
});

export interface TextAreaProps extends FieldBaseProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof FieldBaseProps> {}

/** Multi-line text with label/hint/error. `rows` default 4. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, required, id, rows = 4, className, hideLabel, ...input },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id} className={className} hideLabel={hideLabel}>
      {(fid, describedBy) => (
        <div className="ui-control ui-control--area">
          <textarea ref={ref} id={fid} rows={rows} className="ui-control__input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} {...input} />
        </div>
      )}
    </Field>
  );
});

export interface SelectOption {
  value: string | number;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps extends FieldBaseProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | keyof FieldBaseProps> {
  /** the choices (or pass <option> children) */
  options?: SelectOption[];
  /** a first, empty option ('' value) */
  placeholder?: string;
  size?: 'md' | 'lg';
}

/** Native select, styled. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, id, options, placeholder, size = 'md', className, hideLabel, children, ...select },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id} className={className} hideLabel={hideLabel}>
      {(fid, describedBy) => (
        <div className={cx('ui-control', 'ui-control--select', `ui-control--${size}`)}>
          <select ref={ref} id={fid} className="ui-control__input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} {...select}>
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options
              ? options.map((o) => (
                  <option key={String(o.value)} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </option>
                ))
              : children}
          </select>
          <CaretDown className="ui-control__caret" aria-hidden="true" weight="bold" />
        </div>
      )}
    </Field>
  );
});

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange' | 'onClick'> {
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  /** accessible name (default 'Search') */
  label?: string;
  /** e.g. <><Kbd>⌘</Kbd><Kbd>K</Kbd></>, or a key like 'K' (rendered as ⌘/Ctrl + K) */
  shortcut?: ReactNode;
  size?: 'md' | 'lg';
  /** a button that looks like the field (the top bar's opens the palette) */
  asButton?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
}

/**
 * Search input with icon, clear button and optional shortcut hint.
 * Controlled: value + onChange(event) (and/or onValueChange(string)).
 */
export const SearchField = forwardRef<HTMLElement, SearchFieldProps>(function SearchField(
  { value, onChange, onValueChange, onClear, placeholder = 'Search', label = 'Search', shortcut, size = 'md', asButton = false, className, onClick, ...input },
  ref,
) {
  const kbd =
    typeof shortcut === 'string' ? (
      <>
        <Kbd>{modKeyLabel()}</Kbd>
        <Kbd>{shortcut}</Kbd>
      </>
    ) : (
      shortcut
    );
  if (asButton) {
    const buttonProps = input as Record<string, unknown>;
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        className={cx('ui-search', 'ui-search--button', `ui-search--${size}`, className)}
        onClick={onClick}
        aria-label={label}
        {...buttonProps}
      >
        <MagnifyingGlass className="ui-search__icon" aria-hidden="true" />
        <span className="ui-search__placeholder">{placeholder}</span>
        {kbd ? <span className="ui-search__kbd" aria-hidden="true">{kbd}</span> : null}
      </button>
    );
  }
  const hasValue = value != null && value !== '';
  return (
    <div className={cx('ui-search', `ui-search--${size}`, className)} onClick={onClick}>
      <MagnifyingGlass className="ui-search__icon" aria-hidden="true" />
      <input
        ref={ref as Ref<HTMLInputElement>}
        type="search"
        className="ui-search__input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        {...input}
      />
      {hasValue ? (
        <button
          type="button"
          className="ui-search__clear"
          aria-label="Clear search"
          onClick={() => {
            onClear?.();
            onValueChange?.('');
          }}
        >
          <X aria-hidden="true" weight="bold" />
        </button>
      ) : kbd ? (
        <span className="ui-search__kbd" aria-hidden="true">{kbd}</span>
      ) : null}
    </div>
  );
});
