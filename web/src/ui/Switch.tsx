import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from './internal';
import './Switch.css';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'size' | 'checked'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** what it turns on, plainly */
  label: ReactNode;
  /** a line under the label */
  description?: ReactNode;
}

/** An on/off setting: label (and description) on the left, the switch on the right. A native checkbox (role=switch). */
export function Switch({ checked, onChange, label, description, disabled, className, id: idProp, ...rest }: SwitchProps) {
  const auto = useId().replace(/:/g, '');
  const id = idProp || `sw${auto}`;
  const descId = description ? `${id}-d` : undefined;
  return (
    <div className={cx('ui-switch', disabled && 'is-disabled', className)}>
      <span className="ui-switch__text">
        <label htmlFor={id} className="ui-switch__label">
          {label}
        </label>
        {description ? (
          <span id={descId} className="ui-switch__desc">
            {description}
          </span>
        ) : null}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="ui-switch__input"
        checked={checked}
        disabled={disabled}
        aria-describedby={descId}
        onChange={(e) => onChange(e.target.checked)}
        {...rest}
      />
    </div>
  );
}
