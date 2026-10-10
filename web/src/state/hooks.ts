import { useContext, useEffect } from 'react';
import type { CohortYear } from './cohort';
import {
  AccountYearContext,
  ThemeContext,
  ToastActionsContext,
  ToastListContext,
  YearContext,
  type ThemeValue,
  type ToastActions,
  type ToastList,
  type YearValue,
} from './contexts';

/** { theme: 'light'|'dark', setTheme, toggleTheme } — persists localStorage.theme, sets <html data-theme>. */
export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * { year: 1|2|3|null, setYear, activeYear }: the cohort whose content is shown. A signed-in student's cohort
 * is the default; a guest's choice is kept in localStorage.selectedYear (v1-compatible raw '1'|'2'|'3').
 * year is null until one is chosen (onboarding shows). activeYear = year ?? 1 for views that need one.
 */
export function useYear(): YearValue {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear must be used inside <YearProvider>');
  return ctx;
}

/** { push({ title, body?, tone?: 'info'|'success'|'alert', duration?, action?: { label, onClick } }) → id, dismiss(id) }. Stable identity. */
export function useToast(): ToastActions {
  const ctx = useContext(ToastActionsContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/**
 * Used by the auth provider: the signed-in person's cohort (null for a guest or someone without one) becomes
 * the default year that useYear() shows.
 */
export function useAccountYearSync(year: CohortYear | null): void {
  const sync = useContext(AccountYearContext);
  useEffect(() => {
    sync?.(year);
  }, [sync, year]);
}

const NO_TOASTS: ToastList = { toasts: [], dismiss: () => {} };

/** Internal: the toast list, for <Toaster/>. */
export function useToastList(): ToastList {
  return useContext(ToastListContext) || NO_TOASTS;
}
