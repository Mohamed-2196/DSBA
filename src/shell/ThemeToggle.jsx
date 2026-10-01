import { CircleHalf, Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from '../state';
import { IconButton, SegmentedControl, cx } from '../ui';

/** Light/dark switch. Full: label + segmented sun/moon. Compact: one icon button. */
export function ThemeToggle({ compact = false, className }) {
  const { theme, setTheme, toggleTheme } = useTheme();
  if (compact) {
    return (
      <IconButton
        className={className}
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        icon={theme === 'dark' ? Sun : Moon}
        onClick={toggleTheme}
        tooltip
        tooltipSide="right"
        data-pulse="theme-toggle"
      />
    );
  }
  return (
    <div className={cx('shell-theme', className)} data-pulse="theme-toggle">
      <span className="shell-theme__label">
        <CircleHalf aria-hidden="true" />
        Theme
      </span>
      <SegmentedControl
        size="sm"
        iconOnly
        label="Theme"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: 'Light', ariaLabel: 'Light theme', icon: Sun },
          { value: 'dark', label: 'Dark', ariaLabel: 'Dark theme', icon: Moon },
        ]}
      />
    </div>
  );
}
