// A board's or a label's colour: the six swatches, as radio buttons (arrow keys move between them).
import { useId } from 'react';
import { cx } from '../../ui';
import { COLORS, colorVar, type BoardColor } from './board';
import './BoardDialog.css';

export interface ColorPickerProps {
  /** what the swatches are for ("Colour") */
  legend: string;
  hideLegend?: boolean;
  value: BoardColor;
  onChange: (color: BoardColor) => void;
  className?: string;
}

export function ColorPicker({ legend, hideLegend = false, value, onChange, className }: ColorPickerProps) {
  const name = useId();
  return (
    <fieldset className={cx('board-colors', className)}>
      <legend className={cx('board-colors__legend', hideLegend && 'visually-hidden')}>{legend}</legend>
      <div className="board-colors__row">
        {COLORS.map((c) => (
          <label key={c.id} className="board-colors__swatch" title={c.label}>
            <input type="radio" name={name} value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} />
            <span className="board-colors__dot" style={{ background: colorVar(c.id) }} aria-hidden="true" />
            <span className="visually-hidden">{c.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
