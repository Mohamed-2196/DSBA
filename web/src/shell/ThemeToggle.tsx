import { useTheme, type Theme } from '../state';
import { Icon, IconButton, SegmentedControl, cx, glyph } from '../ui';

/** Light/dark switch. Full: label + segmented sun/moon. Compact: one icon button. */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { theme, setTheme, toggleTheme } = useTheme();
  if (compact) {
    return (
      <IconButton
        className={className}
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        icon={<Icon glyph={theme === 'dark' ? glyph.sun : glyph.moon} />}
        onClick={toggleTheme}
        tooltip
        tooltipSide="right"
        data-hub="theme-toggle"
      />
    );
  }
  return (
    <div className={cx('shell-theme', className)} data-hub="theme-toggle">
      <span className="shell-theme__label">Theme</span>
      <SegmentedControl<Theme>
        size="sm"
        iconOnly
        label="Theme"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: 'Light', ariaLabel: 'Light theme', icon: <Icon glyph={glyph.sun} /> },
          { value: 'dark', label: 'Dark', ariaLabel: 'Dark theme', icon: <Icon glyph={glyph.moon} /> },
        ]}
      />
    </div>
  );
}
