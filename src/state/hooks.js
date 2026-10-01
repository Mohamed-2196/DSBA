import { useContext } from 'react';
import { ThemeContext, ToastActionsContext, ToastListContext, YearContext } from './contexts.js';

/** { theme: 'light'|'dark', setTheme, toggleTheme } — persists localStorage.theme, sets <html data-theme>. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * { year: 1|2|3|null, setYear, activeYear } — persists localStorage.selectedYear (v1-compatible raw '1'|'2'|'3').
 * year is null until the student picks one (onboarding shows). activeYear = year ?? 1 for views that need one.
 */
export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear must be used inside <YearProvider>');
  return ctx;
}

/** { push({ title, body?, tone?: 'info'|'success'|'alert', duration?, action?: { label, onClick } }) → id, dismiss(id) }. Stable identity. */
export function useToast() {
  const ctx = useContext(ToastActionsContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/** Internal: the toast list, for <Toaster/>. */
export function useToastList() {
  const ctx = useContext(ToastListContext);
  return ctx || { toasts: [], dismiss: () => {} };
}
